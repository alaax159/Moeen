# Public Emergency Access operations

The public endpoint is `POST /api/emergency/public/card`. It accepts the
Emergency Access credential only through the canonical
`Authorization: Bearer <emergency-token>` header. The raw credential must never
appear in a URL, request body, response, or log. Production reverse proxies,
access logs, error reporting, and APM instrumentation must redact Authorization
headers. Raw emergency tokens and emergency-card responses must never be
logged.


Prefer serving the `/e` page and API through the same origin. This repository
does not currently contain a deployment proxy or rewrite that provides that
topology. When the static responder site uses a separate origin, set
`EMERGENCY_RESPONDER_ORIGIN` to that exact HTTPS origin (HTTP is accepted only
for localhost development). The public card route permits only that origin,
`POST`/`OPTIONS`, and the `Authorization`/`Content-Type` request headers. It
does not enable credentialed CORS. Invalid origin configuration stops startup;
unknown request origins are rejected.

Emergency contacts remain empty because the Manage Emergency Contacts user
story has not been implemented. This endpoint must not add independent contact
persistence; it will expose contacts only after that dependency extends the
existing Emergency Medical Card contract.

Set `TRUST_PROXY_HOPS` only to the exact number of trusted reverse proxies
between the application and the client. It defaults to `0`, so untrusted
`X-Forwarded-For` headers do not affect `request.ip`. Invalid, negative, or
unreasonably broad hop counts stop application startup.

The endpoint's rate limiter is process-local and bounded. Multi-instance
deployments enforce the configured limit independently per application
instance; use a shared limiter in a future production-hardening task if a
global limit is required.
