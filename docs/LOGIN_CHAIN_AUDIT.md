# LOGIN CHAIN AUDIT — 2026-05-25

Scope: local development and staging test login for real NeeDo accounts only. This audit does not treat `npm run dev:backend` / `scripts/mock-backend.mjs` as a valid backend.

## A. Frontend API Address

- Frontend stack is React / TypeScript / Vite.
- Runtime client builds API URLs in `src/api/httpClient.ts`.
- Default frontend API base is `/api/v1`.
- Vite dev/preview proxy now forwards `/api/v1` to `http://127.0.0.1:3000` by default.
- Local override files:
  - `.env.development.example`: `VITE_API_BASE_URL=/api/v1`, `VITE_API_PROXY_TARGET=http://localhost:3000`
  - A real `.env.development` or `.env.local` is not currently present.
- Staging example:
  - `.env.staging.example`: `VITE_API_BASE_URL=https://api-test.needo.jp/api/v1`
  - Same-origin `/api/v1` is allowed only when Nginx proxies it to the staging backend.
- Current local port check:
  - `localhost:5180` has a Node listener from this repo.
  - `localhost:3000` is currently **not NeeDo**. It responds as `loverose-cps-backend`.
  - `localhost:3100` has no listener.

Conclusion: source config is now aligned to real `/api/v1` backend on port `3000`, but current runtime cannot be accepted until port `3000` is freed or NeeDo backend is started on the agreed API URL.

## B. Real Backend Presence

- `backend/` exists.
- `backend/package.json` exists.
- `backend/src/app.ts` and `backend/src/server.ts` exist.
- `GET /api/v1/health` and `GET /api/v1/ready` are registered in `backend/src/routes/health.routes.ts`.
- `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`, and `GET /api/v1/auth/me` are registered.
- Passwordless `POST /api/v1/auth/test-login` has been removed from routes and OpenAPI.

Current runtime result:

- `curl http://localhost:3000/api/v1/health` returned a LoveRose CPS payload, not NeeDo.
- `curl http://localhost:3100/api/v1/health` failed to connect.

## C. MySQL / Prisma

- Prisma schema exists at `backend/prisma/schema.prisma`.
- Migrations exist under `backend/prisma/migrations/`.
- Real MySQL connection is configured through `DATABASE_URL`.
- No real `backend/.env.dev` is present in this workspace.
- `docker` is not available in this shell.
- No local listener was found on `3307`.
- `mysql` CLI is not installed.

Conclusion: code and migration files exist, but this machine currently cannot prove a live local MySQL connection. Run MySQL through Docker or another local service before local login acceptance.

## D. Redis

- Redis connection is configured through `REDIS_URL`.
- Refresh token sessions, OTP, login failure lockout, and access-token blacklist use `RedisAuthSessionStore`.
- No local listener was found on `6379`.
- `redis-cli` and `redis-server` are not installed.

Conclusion: Redis-dependent auth behavior is implemented, but no live local Redis service is currently available for manual local acceptance.

## E. Token / Old Mock State

- Access token is kept in memory only.
- Refresh token is stored under `needo.auth.refresh-token`.
- Legacy access token key `needo.auth.access-token` is removed whenever tokens are set or cleared.
- Legacy session key `needo.auth.session` is cleared during session restore/login failure/session clear.
- Auth restore flow:
  - If refresh token exists, call `/auth/refresh`.
  - Then call `/auth/me`.
  - On refresh or `/auth/me` failure, clear auth tokens and legacy session state.
- Protected route behavior:
  - Routes wait for restore before deciding.
  - Missing portal access redirects to the matching login page.
  - Missing page/permission access renders 403 instead of treating the user as unauthenticated.

## F. Seed / Permission Alignment

Seed now defines the required real test accounts:

| Email | Role | Identity | Expected Entry |
|---|---|---|---|
| `admin@example.com` | `admin` | `platform` | Operations admin / User Management |
| `operator@example.com` | `operator` | `platform` | Operations admin basic features |
| `merchant@example.com` | `merchant_owner` | `merchant` | Merchant app / merchant admin |
| `technician@example.com` | `technician` | `technician` | Technician app |
| `customer@example.com` | `customer` | `customer` | C-side user app |

Seed password source:

- Primary: `TEST_USER_DEFAULT_PASSWORD`
- Local fallback only: `ADMIN_DEFAULT_PASSWORD`
- Stored value: bcrypt hash, rounds 12

Permissions now include the required portal/menu permissions:

- `menu:client-app`
- `menu:merchant-app`
- `menu:technician-app`
- `menu:admin-console`
- `menu:merchant-admin`
- `menu:technician-schedule`
- `menu:orders`
- `menu:messages`
- `menu:social`
- `menu:settings`

## G. Current Blockers

- `localhost:3000` is occupied by `loverose-cps-backend`, so NeeDo cannot currently bind to the requested local API URL.
- Docker is not installed/available in this shell, so `docker/docker-compose.dev.yml` cannot be used here to start MySQL/Redis/backend.
- No local MySQL or Redis listeners are running.
- No `backend/.env.dev` exists.
- Staging domain and credentials were not provided; staging can be configured from examples, but live staging login cannot be verified from this workspace yet.
