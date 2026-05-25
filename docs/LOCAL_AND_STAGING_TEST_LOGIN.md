# Local And Staging Test Login

This runbook is for the real login chain only. Do not use `npm run dev:backend`; that command starts the legacy mock backend state service.

## Local Startup

1. Copy env examples:

```bash
cp backend/.env.dev.example backend/.env.dev
cp .env.development.example .env.development
```

2. Edit `backend/.env.dev` and set real local values:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `ADMIN_DEFAULT_PASSWORD`
- `TEST_USER_DEFAULT_PASSWORD`

3. Start MySQL and Redis.

With Docker available:

```bash
docker compose --env-file backend/.env.dev -f docker/docker-compose.dev.yml up -d mysql redis
```

If Docker is not available, start MySQL 8 and Redis another way, then make `DATABASE_URL` and `REDIS_URL` point to those services.

4. Initialize the database:

```bash
cd backend
npx prisma generate
npx prisma migrate dev
npm run seed
```

5. Start the real backend:

```bash
cd backend
npm run dev
```

6. Start the frontend:

```bash
npm run dev:frontend
```

## Local URLs

- Frontend: `http://localhost:5180`
- Backend health: `http://localhost:3000/api/v1/health`
- Backend ready: `http://localhost:3000/api/v1/ready`
- Swagger UI, if enabled: `http://localhost:3000/api/v1/docs`
- OpenAPI JSON, if enabled: `http://localhost:3000/api/v1/openapi.json`

## Test Accounts

The password is read from `TEST_USER_DEFAULT_PASSWORD`. Local development may fall back to `ADMIN_DEFAULT_PASSWORD`. The default local/staging shared test login is `admin` / `Admin.2026`.
The public frontend test-account shortcut enters the user portal with this shared account. Backend admin login pages can use the same credentials for the operations console because seed gives the account both `platform` and `customer` identities.
The frontend welcome screen can show a direct test-account login button when Vite env credentials are configured.
For local development, `.env.development` may set portal-specific values such as
`VITE_TEST_LOGIN_CUSTOMER_EMAIL`, `VITE_TEST_LOGIN_CUSTOMER_PASSWORD`,
`VITE_TEST_LOGIN_MERCHANT_EMAIL`, `VITE_TEST_LOGIN_MERCHANT_PASSWORD`,
`VITE_TEST_LOGIN_BUSINESS_EMAIL`, `VITE_TEST_LOGIN_BUSINESS_PASSWORD`,
`VITE_TEST_LOGIN_TECHNICIAN_EMAIL`, `VITE_TEST_LOGIN_TECHNICIAN_PASSWORD`,
`VITE_TEST_LOGIN_ADMIN_EMAIL`, and `VITE_TEST_LOGIN_ADMIN_PASSWORD`.
The button still calls the real login API (`/auth/login` under the configured API base); it is not a mock login shortcut.

| Login | Role | Entry |
|---|---|---|
| `admin` | `admin` | Operations admin / User Management |
| `operator@example.com` | `operator` | Operations admin basic features |
| `merchant@example.com` | `merchant_owner` | Merchant app / merchant admin |
| `affiliate@example.com` | `broker` | Afirieito / NDA admin |
| `technician@example.com` | `technician` | Technician app |
| `customer@example.com` | `customer` | C-side user app |

## Staging

1. Copy examples:

```bash
cp backend/.env.staging.example backend/.env.staging
cp .env.staging.example .env.staging
```

2. Replace:

- `STAGING_WEB_URL`
- `STAGING_API_BASE_URL`
- `FRONTEND_WEB_URL`
- `API_BASE_URL`
- `CORS_ORIGINS`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `TEST_USER_DEFAULT_PASSWORD`

3. Staging frontend must never use `localhost`.

Valid options:

- `VITE_API_BASE_URL=https://api-test.needo.jp/api/v1`, or another formal NeeDo backend origin with the `/api/v1` prefix included
- `VITE_API_BASE_URL=/api/v1` only when Nginx proxies same-origin `/api/v1` to the staging backend

Do not point the formal login frontend at the legacy `https://t.dackou.com/login` webman/Apifox service. That service is not the NeeDo User Management backend and can return `token不能为空` or graph-captcha errors before the formal `/auth/me` session can be established.

4. Staging must have its own backend, MySQL, Redis, migrations, and seed data:

```bash
cd backend
npx prisma generate
npx prisma migrate deploy
npm run seed
npm run check:test-login -- --all --base-url "$STAGING_API_BASE_URL"
```

## Curl Checks

```bash
curl http://localhost:3000/api/v1/health
```

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin.2026","type":"username"}'
```

```bash
ACCESS_TOKEN="REPLACE_WITH_LOGIN_ACCESS_TOKEN"
curl http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

```bash
REFRESH_TOKEN="REPLACE_WITH_LOGIN_REFRESH_TOKEN"
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}"
```

```bash
curl -X POST http://localhost:3000/api/v1/auth/logout \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}"
```

## Self Check

```bash
cd backend
npm run check:test-login -- --all
npm run check:test-login -- --email admin@example.com
npm run check:test-login -- --all --base-url http://localhost:3000/api/v1
```

The script checks health, Prisma/MySQL, Redis, seed account state, `/auth/login`, `/auth/me`, permissions count, and whether each account can enter its expected portal. It does not print passwords or full tokens.

## Troubleshooting

- `401 error.auth.invalid_credentials`: wrong password or seed not rerun after changing `TEST_USER_DEFAULT_PASSWORD`.
- `403 error.forbidden` or empty permissions: role permissions are missing; rerun seed and inspect `RolePermission`.
- `500 database connection`: MySQL is down or `DATABASE_URL` points to the wrong host from the process location.
- `503 error.dependency.redis_unavailable`: Redis is down or `REDIS_URL` points to the wrong host from the backend process location. Start Redis and verify `REDIS_URL`; login refresh sessions, logout, OTP, token blacklist, and login lockout require Redis.
- CORS failure: add the exact frontend origin to `CORS_ORIGINS`.
- Staging frontend requests `localhost`: rebuild frontend with staging `VITE_API_BASE_URL` or same-origin `/api/v1`.
- Login shows `token不能为空` or graph-captcha errors: the frontend is still reaching the legacy webman/Apifox `/login` service or an old cached bundle. Rebuild with a formal `/api/v1` API base and clear the browser cache.
- `/auth/login` succeeds but `/auth/me` fails: check Authorization header, token blacklist, Redis, and `auth:me` permission.
- Login succeeds then jumps back to login: check stale `needo.auth.refresh-token`, old `needo.auth.session`, and failed `/auth/me`.
- User Management menu missing: verify `menu:user-management`, `page:user-management`, and `user:list` are in `/auth/me`.
- Menu empty: verify menu-type permissions exist and are assigned to the role.
- Old localStorage token pollution: clear `needo.auth.refresh-token`, `needo.auth.access-token`, and `needo.auth.session`, then log in again.
