# Public emergency responder page

Configure `EXPO_PUBLIC_EMERGENCY_RESPONDER_BASE_URL` to the HTTPS origin that
serves the exported Moeen web application. Local development may use HTTP on
localhost. Missing, malformed, credential-bearing, query-bearing, fragment-
bearing, or non-HTTPS public values fail closed and no QR is rendered.

The QR payload is:

`<EXPO_PUBLIC_EMERGENCY_RESPONDER_BASE_URL>/e#token=<emergency-token>`

The `/e` route consumes the fragment in memory, immediately attempts to replace
the browser history entry with `/e`, and sends the credential only in the
`Authorization` header of `POST /api/emergency/public/card`. The token is never
placed in an HTTP URL, displayed, logged, or written to browser storage. The
page sets a `no-referrer` meta policy.

Emergency contacts will remain empty until the separate Manage Emergency
Contacts user story adds them to the existing Emergency Medical Card contract.

For ngrok development, use the HTTPS tunnel serving the web application's
`/e` page as `EXPO_PUBLIC_EMERGENCY_RESPONDER_BASE_URL` in `MoeenApp/.env.local`.
A tunnel serving only the backend API, or Expo's native development connection,
is not a substitute for the responder web page. Verify `/e` opens in a browser.
Set `EXPO_PUBLIC_EMERGENCY_RESPONDER_API_BASE_URL` to the HTTPS tunnel so the
responder page can reach the backend from the scanning phone. Do not point
`EXPO_PUBLIC_API_URL` at the tunnel for this: that variable is the base URL the
app itself uses on the device, and the proxy deliberately forwards only the one
public responder route, so the app's other calls (`/users/me` and the rest)
would return Expo's 404. Leave it unset to keep each platform's local default.
When using the same-origin proxy below, leave `EMERGENCY_RESPONDER_ORIGIN`
empty because the browser never makes a cross-origin request. For split-origin
hosting, set it in the backend environment to the exact responder web origin.
Restart Expo and the backend after changing these values. Update the settings
when tunnel URLs change; regenerating a token does not fix a missing base URL.

`.env.local` is intentionally ignored by git. The committed `.env.example`
documents the required variables, while `eas.json` supplies the reserved demo
tunnel to development, preview, and production builds. Replace those build
values with the stable hosted responder origin before a real production
release.

After changing the Android lock-screen native module, rebuild and install the
development app. Reloading JavaScript alone cannot update native method
signatures and may produce argument-count errors when checking lock-screen
ownership.

The local development proxy can be started with
`node scripts/emergency-dev-proxy.cjs` after the API (3000) and Expo web (8081)
are running. It listens on loopback port 8080 and forwards only
`POST /api/emergency/public/card`, the single backend route the responder page
uses, to the API. Every other path and Metro's WebSockets go to Expo, so no
other API route is reachable through the tunnel. It does not log request URLs or credentials.
The existing test domain can then be attached with:

```sh
ngrok http --url=chump-frequent-illusion.ngrok-free.dev 8080
```

This exposes the development application and its API routes publicly through
the tunnel; stop ngrok when external testing is complete.
