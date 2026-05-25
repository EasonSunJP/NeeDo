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

## Staging

```bash
docker compose -f deploy/staging/docker-compose.yml up --build -d
docker compose -f deploy/staging/docker-compose.yml ps
curl -fsS http://127.0.0.1:3100/api/v1/ready
```

The staging stack contains:

- `backend`: Node.js 22 backend container.
- `mysql`: MySQL 8.0 with UTF8MB4 defaults.
- `redis`: Redis 7.2 with append-only persistence and LRU eviction policy.

## Production

```bash
docker compose -f deploy/prod/docker-compose.yml up --build -d
docker compose -f deploy/prod/docker-compose.yml ps
curl -fsS http://127.0.0.1:3100/api/v1/ready
```

For managed production infrastructure, keep the same env contract and replace
the compose-managed MySQL/Redis with managed services. Preserve:

- `/api/v1/health` as liveness.
- `/api/v1/ready` as dependency readiness.
- `/api/v1/metrics` as internal-only Prometheus scrape target.
- Structured JSON logs from stdout/stderr.
- W3C `traceparent` propagation and `x-trace-id` response headers.

## Migrations And Seed

Run migrations before sending traffic to a new backend image:

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
