# Environment

## Step 02 Backend Dev

NeeDo backend runtime configuration is read from environment variables. Do not commit real
`.env` files.

Local backend setup:

```bash
cd backend
cp .env.dev.example .env.dev
npm install
npm run dev
```

Health check:

```bash
curl http://127.0.0.1:$PORT/api/v1/health
```

OpenAPI:

```text
GET /api/v1/openapi.json
GET /api/v1/docs
```

Step 05 Auth runtime variables:

- `JWT_ACCESS_SECRET`: HMAC secret for JWT access tokens, minimum 32 characters.
- `JWT_REFRESH_SECRET`: HMAC secret for JWT refresh tokens, minimum 32 characters.
- `JWT_ACCESS_EXPIRES_IN`: access-token lifetime in seconds, capped at 900 seconds.
- `JWT_REFRESH_EXPIRES_IN`: refresh-token lifetime in seconds, capped at 604800 seconds.
- `AUTH_ACCESS_TOKEN_SECRET`, `AUTH_REFRESH_TOKEN_SECRET`,
  `AUTH_ACCESS_TOKEN_TTL_SECONDS`, and `AUTH_REFRESH_TOKEN_TTL_SECONDS` remain
  accepted as legacy aliases.
- `TEST_USER_DEFAULT_PASSWORD`: bcrypt-seeded password for local/staging test
  accounts. Local development may fall back to `ADMIN_DEFAULT_PASSWORD`.
- `AUTH_LOGIN_FAILURE_LIMIT`: failed password-login attempts before lockout.
- `AUTH_LOGIN_FAILURE_WINDOW_SECONDS`: Redis TTL for failed-login counters.
- `AUTH_LOGIN_LOCK_SECONDS`: Redis TTL for account lockout.
- `AUTH_OTP_TTL_SECONDS`: lifetime for the legacy generic OTP adapter only,
  capped at 600 seconds; it does not configure formal registration/Google
  challenges.
- `AUTH_OTP_COOLDOWN_SECONDS`: cooldown for the legacy generic OTP adapter only;
  it does not configure formal registration/Google challenges.
- `AUTH_OTP_EMAIL_WEBHOOK_URL`: HTTPS/HTTP endpoint that receives `{ email, otp }`.
- `AUTH_OTP_EMAIL_WEBHOOK_TIMEOUT_MS`: OTP delivery request timeout.

### IM translation provider

IM translation is server-side only. The browser calls NeeDo's authenticated
`POST /api/v1/im/conversations/:conversationId/messages/translations` route;
it never receives the provider key and never calls DeepL directly.

- `IM_TRANSLATION_PROVIDER`: `disabled` (default) or `deepl`.
- `IM_TRANSLATION_API_BASE_URL`: the DeepL API base URL. When `deepl` is
  selected this is required; production requires HTTPS and rejects local hosts.
- `IM_TRANSLATION_API_KEY`: server-only DeepL key. When `deepl` is selected it
  is required and placeholder values are rejected.
- `IM_TRANSLATION_TIMEOUT_MS`: per-request timeout, `500`–`30000` ms; examples
  use `5000`.
- `IM_TRANSLATION_MAX_RETRIES`: bounded retry count, `0`–`3`; examples use `2`.
- `IM_TRANSLATION_MONTHLY_CHARACTER_LIMIT`: positive operator-side protection
  threshold; examples use `500000`.

With `IM_TRANSLATION_PROVIDER=disabled`, the backend can start without a key
and eligible external-translation requests return the normal sanitized
provider-unavailable error. Selecting `deepl` without both base URL and key is
a startup configuration error; there is no silent browser fallback and no mock
translation success. Keep the key in the backend environment/secret manager,
never in `VITE_*`, frontend source, logs, or API responses.

DeepL currently documents a 128 KiB total request limit and 500,000 translated
characters per month for API Free. The provider partitions batches below the
request limit. It handles HTTP 429 with bounded delayed exponential backoff and
maps HTTP 456 to quota exhausted; a failed provider call is never cached as a
translation. Official references: [usage and limits](https://developers.deepl.com/docs/resources/usage-limits)
and [error handling](https://developers.deepl.com/docs/best-practices/error-handling).

### Verified registration and account-security variables

- `AUTH_VERIFICATION_SECRET`: dedicated secret, at least 32 characters and
  different from both JWT secrets. It HMACs OTP digests/cooldown identities and
  derives the AES-GCM key for Google nonce encryption. It does not encrypt the
  email challenge JSON; never reuse a placeholder in production.
- `AUTH_VERIFICATION_MAX_ATTEMPTS`: allowed OTP attempts, from `1` through `5`;
  production examples use `5`. The final failed attempt deletes the challenge.
- `AUTH_GOOGLE_NONCE_TTL_SECONDS`: one-time Google nonce lifetime, capped at
  `600`; examples use `300`.
- `GOOGLE_AUTH_CLIENT_ID`: the public Web OAuth client ID expected in the
  Google ID-token audience. It is returned by `/api/v1/auth/google/init` so the
  browser and backend use the same value.
- `AUTH_GOOGLE_INIT_RATE_LIMIT_MAX`,
  `AUTH_GOOGLE_CREDENTIAL_RATE_LIMIT_MAX`, and
  `AUTH_VERIFICATION_RATE_LIMIT_MAX`: separate abuse limits for nonce creation,
  credential submission, and OTP verification.

`AUTH_OTP_EMAIL_WEBHOOK_URL` is the only formal email-delivery seam. NeeDo sends
an HTTP `POST` JSON body `{ "email": "...", "otp": "123456" }` with a bounded
timeout. Missing configuration returns
`error.auth.otp_delivery_not_configured`; non-2xx, timeout, or network failure
fails the request and cancels the newly created challenge. The current sender
sets only `content-type: application/json`; it does not add a signature or
authorization header. Production and staging therefore must use HTTPS plus a
private-network/IP allow-list or an approved gateway that does not require an
unsupported request header. The receiver must redact OTPs and apply a retention
policy. A successful API response is not proof of inbox delivery, so alert on
webhook failures and delivery-provider reject/bounce events.

### Redis key ownership and TTLs

| Key | Purpose | TTL |
|---|---|---:|
| `auth:verification:email:{challengeId}` | Allowlisted challenge JSON with an HMAC OTP digest, purpose, user binding, attempt counter, and metadata | Fixed `600` seconds |
| `auth:verification:cooldown:{HMAC}` | HMAC key does not expose the email; prevents repeated sends by email/purpose | Fixed `60` seconds |
| `auth:verification:google-nonce:{nonceChallengeId}` | One-time nonce, optionally bound to the authenticated user | `AUTH_GOOGLE_NONCE_TTL_SECONDS`, maximum `600` seconds |
| `auth:v2:refresh:{userId}:{jti}` and its per-user index | NeeDo refresh session | `JWT_REFRESH_EXPIRES_IN`, maximum `604800` seconds |
| `token:blacklist:{jti}` | Revoked access token | Remaining access lifetime, maximum `900` seconds |
| `auth:v2:session:generation:{userId}` | Cached authoritative all-session generation | No expiry; invalidated/advanced by account-security changes |
| `auth:verification:unlink-complete:{challengeId}` | HMAC-proof-bound retry-safe unlink result after all sessions are revoked | `600` seconds |

Challenge reservation is an internal atomic state with a 30-second lease. OTP
success consumes the challenge immediately; exhausting
`AUTH_VERIFICATION_MAX_ATTEMPTS` destroys it. Google nonce consume, OTP
reservation/finalization, refresh-session revocation, blacklist insertion, and
session-generation advance use atomic Redis operations. Operators must not
rename or manually replay these keys during a release.

The formal email-challenge value is JSON, not ciphertext. Its allowlisted
metadata may contain a prepared bcrypt password hash or Google subject/email;
the raw password and raw OTP are never stored. Protect Redis with private
networking, authentication/ACLs, encrypted transport where applicable, and
restricted backups/logging. Google nonce values are separately encrypted with
AES-256-GCM before storage.

### Google Cloud Console configuration

Create one Google OAuth **Web application** client for each environment. Its
authorized JavaScript origins must be exact origins, with no path, callback,
wildcard, or trailing slash:

- local acceptance: `http://localhost:5180`;
- add `http://127.0.0.1:5180` only when that exact host is used;
- if Vite selects a fallback port such as `5181`, add that exact origin before
  acceptance and remove unused origins afterwards;
- current staging example: `https://needo.dackou.com` (replace it when a
  dedicated staging hostname is provisioned);
- current production example: `https://needo.dackou.com`; update the Google
  client and env example together before the formal production origin changes.

Changing a frontend port, scheme, or domain requires updating the Google Cloud
origin before browser acceptance. No Google client secret is used or stored by
this Google Identity Services ID-token flow. There is no callback redirect URI
endpoint: the browser posts the Google `credential` and NeeDo nonce handle
to `/api/v1/auth/google`. Never add `GOOGLE_AUTH_CLIENT_SECRET` to source or
example env files. The backend stores only the Google subject, normalized
provider email, and verification timestamps; it does not persist Google access
or refresh tokens.

This login integration requests only identity claims (`openid`, `email`, and
`profile`). Google Calendar is a separate product integration: it needs its own
scopes, user consent, token encryption/rotation/revocation, retention policy,
and API error handling. Enabling Google sign-in does not enable Calendar access.

### Local lifecycle checkers

Run the formal scripts only with explicit local test configuration:

```bash
cd backend
NODE_ENV=test DEPLOY_ENV=test ENV_FILE=.env.dev DATABASE_URL=mysql://<test-user>:<test-password>@127.0.0.1:3307/needo_test REDIS_URL=redis://127.0.0.1:6379 npm run check:registration-flow
NODE_ENV=test DEPLOY_ENV=test ENV_FILE=.env.dev DATABASE_URL=mysql://<test-user>:<test-password>@127.0.0.1:3307/needo_test REDIS_URL=redis://127.0.0.1:6379 npm run check:google-auth-flow
```

The checkers reject production deployment names, remote MySQL/Redis hosts, and
any database other than exactly `needo_test` before importing Prisma or opening
a connection. They use unique markers, inspect real audit/token state, clean
their marked database rows and Redis keys in `finally`, and fail if cleanup is
not exact. They must never target `needo_dev`, staging, or production.

Docker dev setup from the repository root:

```bash
cp backend/.env.dev.example backend/.env.dev
docker compose --env-file backend/.env.dev -f docker/docker-compose.dev.yml up --build
```

The dev compose stack contains:

- `backend`: Express API, configured by `backend/.env.dev`.
- `mysql`: MySQL 8.0 with UTF8MB4 defaults.
- `redis`: Redis 7.2 with append-only persistence.

All backend instances in one environment must use the same `REALTIME_REDIS_CHANNEL`
value so directed SSE events can cross process boundaries. Keep staging, production,
and local acceptance on different channel names. The realtime layer uses one Redis
subscription and one publisher connection per backend process, not per connected
user; MySQL remains the durable message source and reconnect recovery path.
