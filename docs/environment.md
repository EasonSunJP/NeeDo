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

Docker dev setup from the repository root:

```bash
cp backend/.env.dev.example backend/.env.dev
docker compose --env-file backend/.env.dev -f docker/docker-compose.dev.yml up --build
```

The dev compose stack contains:

- `backend`: Express API, configured by `backend/.env.dev`.
- `mysql`: MySQL 8.0 with UTF8MB4 defaults.
- `redis`: Redis 7.2 with append-only persistence.
