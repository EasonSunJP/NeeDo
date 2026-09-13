# Deployment

Step 14 adds deployable staging/prod configuration for the formal backend. It
does not replace the existing frontend Vite workflow or FileZilla/static bundle
loop.

## Environment Files

Examples:

- `backend/.env.dev.example`
- `backend/.env.staging.example`
- `backend/.env.prod.example`

Real `.env` files must not be committed. Before deployment:

```bash
cp backend/.env.staging.example backend/.env.staging
cp backend/.env.prod.example backend/.env.prod
```

Replace all placeholder secrets and hostnames before starting services.
The backend refuses to boot with production `NODE_ENV` when the deploy target is
local/test, CORS includes HTTP or `.example` origins, metrics has no bearer
token, JWT secrets are placeholders/reused, MySQL uses placeholder/local
credentials, or Redis has no password.

## Staging

```bash
docker compose -f deploy/staging/docker-compose.yml up --build -d
docker compose -f deploy/staging/docker-compose.yml ps
curl -fsS http://127.0.0.1:3000/api/v1/ready
```

The staging stack contains:

- `migrate`: one-shot Prisma migration image; the API waits for a successful exit.
- `backend`: Node.js 22 backend container.
- `mysql`: MySQL 8.0 with UTF8MB4 defaults.
- `redis`: password-protected Redis 7.2 with append-only persistence and LRU eviction policy.

For local formal development, `npm run dev` (or `npm run dev:formal`) starts
the real backend and Vite frontend together. It does not start the legacy mock
backend. Override `FORMAL_BACKEND_PORT`, `FRONTEND_PORT`, or
`FORMAL_BACKEND_ENV_FILE` when the defaults are already in use.

## Production

```bash
docker compose -f deploy/prod/docker-compose.yml up --build -d
docker compose -f deploy/prod/docker-compose.yml ps
curl -fsS http://127.0.0.1:3000/api/v1/ready
```

For managed production infrastructure, keep the same env contract and replace
the compose-managed MySQL/Redis with managed services. Preserve:

- `/api/v1/health` as liveness.
- `/api/v1/ready` as dependency readiness.
- `/api/v1/metrics` as internal-only Prometheus scrape target.
- Structured JSON logs from stdout/stderr.
- W3C `traceparent` propagation and `x-trace-id` response headers.

Compose uses `REDIS_PASSWORD` both to start Redis with `requirepass` and for its
health check. `REDIS_URL` must contain the same URL-encoded password. Store both
values in the deployment secret manager; do not commit a populated env file.

## Frontend And API Routing

The production frontend may use same-origin `VITE_API_BASE_URL=/api/v1` only
when Nginx forwards `/api/v1/*` to the formal NeeDo backend. The static
frontend bundle alone is not enough for login.

Use `deploy/prod/nginx.needo.conf.example` as the minimum routing reference:

- `/api/v1/health` and `/api/v1/ready` must reach the backend service.
- `/api/v1/auth/login` must reach the backend service and not the legacy
  webman/Apifox `/login` service.
- `/api/v1/metrics` must remain internal-only.
- The whole `dist/` directory must be uploaded together because Vite emits
  hashed asset names referenced by each HTML entry.

Build and audit the formal frontend artifact with:

```bash
npm run verify:production-build
```

The audit rejects a bundled static-demo fetch interceptor, broken HTML asset
references, and regressions beyond the current main/i18n JavaScript budgets.
`npm run build:static` is a separate compatibility artifact and must never be
uploaded to a formal environment.

### Staging frontend asset compatibility

Staging replaces HTML on every release and serves it with `Cache-Control:
no-store`, but an already-open browser or installed PWA may still execute the
previous release's JavaScript. A later identity or route transition can then
request a lazy Vite chunk whose content-hashed filename came from that previous
release. Replacing the web image alone must not make that asset return `404`.

`deploy/staging/deploy-release.sh` therefore publishes the previous active
release's `dist/assets` and then the incoming release's `dist/assets` into the
append-only host directory `/srv/needo/frontend-assets` before recreating the
web container. Importing the previous release is required when this contract is
first introduced and the durable directory is still empty. The container mounts
that directory read-only at `/usr/share/nginx/html/assets`, and Nginx serves
those versioned resources with a one-year `immutable` cache policy. If a release
attempts to reuse an existing asset path with different bytes, publication fails
before the application transition. HTML remains release-local and `no-store`;
it is never copied into the durable asset directory. The immutable header is
limited to successful asset responses, so a missing asset's `404` is not given a
one-year public cache lifetime.

The managed deploy command pins `NEEDO_FRONTEND_ASSETS_DIR` to that host
directory. A direct local `docker compose -f deploy/staging/docker-compose.yml
up` instead defaults the mount to the checkout's current `dist/assets`, so it
cannot hide the image assets behind an empty `/srv/needo` bind mount; that local
shortcut does not provide cross-release retention.

Rollback restores the captured previous web image through the incoming
release's Compose definition. This keeps the durable asset mount active even on
the first rollback from a release that predates this contract. It also retains
the incoming release's compatible edge configuration so direct asset misses
remain `404` and existing assets keep the immutable and HTTPS security headers;
the captured previous image restores the previous HTML and application bundle,
while both old and new hash-addressed chunks remain readable.

The publisher rejects symbolic links in the destination path, including its
existing ancestors, before creating the durable directory. This prevents a
privileged deployment from following a redirected `/srv/needo` or nested asset
path outside the intended storage tree.

Do not delete files from `/srv/needo/frontend-assets` as routine release
cleanup. No automated asset deletion is currently authorized. Until a separate
cleanup tool can prove retained-release references and archived access-log
absence and can create a recoverable backup, operators must only monitor the
directory's byte/file growth and expand its volume before capacity is exhausted.

After updating the frontend bundle and Nginx, verify from outside the server:

```bash
curl -fsS https://needo.dackou.com/api/v1/health
curl -fsS https://needo.dackou.com/api/v1/ready
curl -fsS "https://needo.dackou.com/api/v1/home/recommendations?limit=1"
```

The repeatable application-level smoke gate is:

```bash
SMOKE_BASE_URL=https://needo.dackou.com \
SMOKE_EMAIL='release-smoke-account@example.invalid' \
SMOKE_PASSWORD='read-from-secret-manager' \
npm run verify:production-smoke
```

Use a dedicated least-privilege account. The command checks health, readiness,
core anonymous reads, login, `/auth/me`, and logout without printing tokens or
credentials.

If the login page shows `token不能为空` or graph-captcha errors, the browser is
still running an old frontend bundle or the API base points to the legacy
service. If it shows an API-route-not-found message, the frontend bundle is new
but `/api/v1` is not yet proxied to the formal backend.

If `home/recommendations` returns `404`, the user home page cannot render real
shop, technician, or service cards. Do not add frontend fallback mock data for
this case; start the formal backend, apply migrations, run the real seed, and
fix the `/api/v1` proxy first.

## Migrations And Seed

The supplied Compose stacks run the dedicated `migration` Docker target before
the backend becomes eligible to start. For managed releases or a manual
recovery, run migrations before sending traffic to a new backend image:

```bash
cd backend
ENV_FILE=.env.staging npm run prisma:migrate:deploy
ENV_FILE=.env.staging npm run prisma:seed
```

For production, run `ENV_FILE=.env.prod npm run prisma:migrate:deploy` from the
release job before shifting traffic. Do not edit applied migrations.

## Rollback

1. Stop traffic at the load balancer or shift it to the previous healthy task.
2. Keep the failed container logs and `/metrics` scrape window.
3. Revert to the previous backend image.
4. Restore database only from a tested backup when the failed release performed
   irreversible data writes.
5. Re-run `/api/v1/ready` before returning traffic.

## Backup

- MySQL: snapshot before each production migration and keep point-in-time
  recovery enabled in managed production.
- Redis: keep AOF on for session/OTP/blacklist durability during node restarts.
- Static assets: keep immutable CDN asset versions so frontend rollback is a
  pointer change, not a destructive overwrite.
