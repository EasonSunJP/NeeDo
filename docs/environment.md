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

- `AUTH_ACCESS_TOKEN_SECRET`: HMAC secret for JWT access tokens, minimum 32 characters.
- `AUTH_REFRESH_TOKEN_SECRET`: HMAC secret for JWT refresh tokens, minimum 32 characters.
- `AUTH_ACCESS_TOKEN_TTL_SECONDS`: access-token lifetime, capped at 900 seconds.
- `AUTH_REFRESH_TOKEN_TTL_SECONDS`: refresh-token lifetime, capped at 604800 seconds.
- `AUTH_LOGIN_FAILURE_LIMIT`: failed password-login attempts before lockout.
- `AUTH_LOGIN_FAILURE_WINDOW_SECONDS`: Redis TTL for failed-login counters.
- `AUTH_LOGIN_LOCK_SECONDS`: Redis TTL for account lockout.
- `AUTH_OTP_TTL_SECONDS`: email OTP lifetime, capped at 600 seconds.
- `AUTH_OTP_COOLDOWN_SECONDS`: Redis cooldown TTL between OTP sends.
- `AUTH_OTP_EMAIL_WEBHOOK_URL`: HTTPS/HTTP endpoint that receives `{ email, otp }`.
- `AUTH_OTP_EMAIL_WEBHOOK_TIMEOUT_MS`: OTP delivery request timeout.

Docker dev setup from the repository root:

```bash
cp backend/.env.dev.example backend/.env.dev
docker compose --env-file backend/.env.dev -f docker/docker-compose.dev.yml up --build
```

The dev compose stack contains:

- `backend`: Express API, configured by `backend/.env.dev`.
- `mysql`: MySQL 8.0 with UTF8MB4 defaults.
- `redis`: Redis 7.2 with append-only persistence.
