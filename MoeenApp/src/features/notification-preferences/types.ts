export type DeviceType = 'android' | 'ios' | 'emulator';

export interface UpdateNotificationPreferencesInput {
  expoPushToken?: string;
  deviceType?: DeviceType;
  isActive?: boolean;
  /**
   * Opt-in for texting the patient's emergency contact when a severe
   * medication issue is detected. Backend default is true.
   *
   * PROVISIONAL: field name, endpoint shape, and partial-body acceptance are
   * unconfirmed until the backend notification_prefs PR lands — cross-check
   * on merge.
   */
  emergencyContactSmsEnabled?: boolean;
}

export interface NotificationPreferences {
  emergencyContactSmsEnabled: boolean;
}
