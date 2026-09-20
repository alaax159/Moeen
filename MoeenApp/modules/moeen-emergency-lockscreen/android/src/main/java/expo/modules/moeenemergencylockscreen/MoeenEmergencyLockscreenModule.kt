package expo.modules.moeenemergencylockscreen

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.os.Build
import android.util.Base64
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class MoeenEmergencyLockscreenModule : Module() {
  companion object {
    private const val CHANNEL_ID = "moeen_emergency_lockscreen"
    private const val NOTIFICATION_ID = 2042
    private const val PREFS = "moeen_emergency_lockscreen"

    // The uid that opted in. Storing the owner rather than a boolean means a
    // different account can never inherit a previous user's opt-in.
    private const val OPT_IN_OWNER = "opt_in_owner_uid"

    // Earlier builds wrote the QR PNG here. The QR encodes the emergency
    // bearer credential, so any leftover file is removed on sight.
    private const val LEGACY_QR_DIRECTORY = "emergency-lockscreen"
  }

  override fun definition() = ModuleDefinition {
    Name("MoeenEmergencyLockscreen")

    AsyncFunction("isOptedIn") { ownerUid: String ->
      val uid = ownerUid.trim()
      uid.isNotEmpty() && optedInOwner() == uid
    }

    AsyncFunction("setOptedIn") { ownerUid: String, enabled: Boolean ->
      val uid = ownerUid.trim()

      if (enabled && uid.isNotEmpty()) {
        preferences().edit().putString(OPT_IN_OWNER, uid).apply()
      } else {
        clearOptInAndSurface()
      }
    }

    AsyncFunction("showQr") { ownerUid: String, encodedPng: String ->
      val uid = ownerUid.trim()

      // Only the account that opted in may publish, so a signed-in user never
      // shows a QR on the strength of another user's opt-in.
      if (uid.isEmpty() || optedInOwner() != uid) return@AsyncFunction false

      createChannel()

      // Reporting success while notifications are blocked would tell the user
      // the QR is on their lock screen when nothing is displayed.
      if (!notificationsAvailable()) return@AsyncFunction false

      val png = Base64.decode(encodedPng, Base64.DEFAULT)
      val bitmap = BitmapFactory.decodeByteArray(png, 0, png.size)
        ?: throw IllegalArgumentException("Emergency QR image is invalid")

      // The bitmap is handed straight to the notification; the QR is never
      // written to disk.
      val compact = RemoteViews(context().packageName, R.layout.moeen_emergency_notification_compact)
      val expanded = RemoteViews(context().packageName, R.layout.moeen_emergency_notification_expanded)
      compact.setImageViewBitmap(R.id.emergency_qr, bitmap)
      expanded.setImageViewBitmap(R.id.emergency_qr, bitmap)

      val launchIntent = context().packageManager.getLaunchIntentForPackage(context().packageName)
      val pendingIntent = launchIntent?.let {
        PendingIntent.getActivity(
          context(),
          0,
          it,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
      }

      val notification = NotificationCompat.Builder(context(), CHANNEL_ID)
        .setSmallIcon(context().applicationInfo.icon)
        .setCustomContentView(compact)
        .setCustomBigContentView(expanded)
        .setStyle(NotificationCompat.DecoratedCustomViewStyle())
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setCategory(NotificationCompat.CATEGORY_STATUS)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setSilent(true)
        .setContentIntent(pendingIntent)
        .build()

      NotificationManagerCompat.from(context()).notify(NOTIFICATION_ID, notification)
      removeLegacyQrArtifacts()
      true
    }

    // Called on logout, account change, revocation and version mismatch, so
    // the opt-in owner is reset together with the visible QR.
    AsyncFunction("clear") { clearOptInAndSurface() }
  }

  private fun context(): Context =
    appContext.reactContext ?: throw IllegalStateException("Android context is unavailable")

  private fun preferences() = context().getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun optedInOwner(): String? = preferences().getString(OPT_IN_OWNER, null)

  private fun clearOptInAndSurface() {
    preferences().edit().remove(OPT_IN_OWNER).apply()
    NotificationManagerCompat.from(context()).cancel(NOTIFICATION_ID)
    removeLegacyQrArtifacts()
  }

  // Best-effort removal of the QR file written by earlier builds. Failure to
  // delete must not break signing out.
  private fun removeLegacyQrArtifacts() {
    runCatching {
      val directory = File(context().filesDir, LEGACY_QR_DIRECTORY)
      if (!directory.exists()) return@runCatching
      directory.listFiles()?.forEach { it.delete() }
      directory.delete()
    }
  }

  private fun notificationsAvailable(): Boolean {
    if (!hasPostNotificationsPermission()) return false
    if (!NotificationManagerCompat.from(context()).areNotificationsEnabled()) return false
    return isChannelEnabled()
  }

  private fun hasPostNotificationsPermission(): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
      ContextCompat.checkSelfPermission(context(), Manifest.permission.POST_NOTIFICATIONS) ==
        PackageManager.PERMISSION_GRANTED

  // The user can block this channel on its own, which silently hides the
  // notification even when notifications are enabled overall.
  private fun isChannelEnabled(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true

    val channel = context()
      .getSystemService(NotificationManager::class.java)
      .getNotificationChannel(CHANNEL_ID)

    return channel != null && channel.importance != NotificationManager.IMPORTANCE_NONE
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Moeen Emergency Info",
      NotificationManager.IMPORTANCE_DEFAULT,
    ).apply {
      description = "Shows the opted-in emergency QR on the lock screen"
      enableVibration(false)
      setSound(null, null)
      lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
    }
    context().getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }
}
