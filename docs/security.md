# Security

Step 14 hardens the production surface without changing business workflows.

## Runtime Controls

- `helmet` is enabled and `x-powered-by` is disabled.
- CORS is allow-list based through `CORS_ORIGINS`; `CORS_ALLOWED_ORIGINS`
  remains accepted as a legacy alias.
- `TRUST_PROXY=true` is required behind a load balancer so IP-based rate limit
  and audit context use the forwarded client address.
- JSON body size is capped by `REQUEST_BODY_LIMIT`.
- Global rate limiting uses `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX`.
- Auth login failure lockout remains controlled by `AUTH_LOGIN_FAILURE_*`.

## Tokens And Secrets

- Access tokens remain capped at 900 seconds.
- Refresh tokens remain capped at 604800 seconds and are stored/revoked through
  Redis.
- OTPs remain capped at 600 seconds and must expire after use.
- Passwordless test-login endpoints and UI shortcuts are not part of staging or
  production. Test accounts must use the same `email + password` login path as
  normal users.
- Real `.env` files, DB passwords, JWT secrets, metrics bearer tokens, and OTP
  webhook URLs must be managed outside git.

## Logs, Metrics, Tracing

- Logs are structured JSON through Pino.
- Sensitive fields are redacted: authorization headers, cookies, password,
  password hash, access token, refresh token, and OTP.
- Requests propagate W3C `traceparent` when present and always return
  `x-trace-id`.
- `/api/v1/metrics` supports `METRICS_BEARER_TOKEN`; production ingress must
  also restrict it to the monitoring network.

## Cache And CDN

- Auth, write, health, ready, metrics, and admin APIs use `Cache-Control:
  no-store`.
- Anonymous read APIs can use short public cache headers.
- Static hashed assets should be served by CDN with immutable cache headers.
- HTML entry files should not be immutable.

## Operational Checks Before Launch

- Confirm `/api/v1/openapi.json` is disabled in prod unless a private API docs
  route is configured.
- Confirm all protected business APIs still require JWT + RBAC permissions.
- Confirm database migrations were generated, reviewed, and applied once.
- Confirm slow query logging and DB connection dashboards exist before 10k+
  tests.
- Confirm 30k/100k tests run with distributed generators and record evidence;
  do not claim support from configuration alone.
