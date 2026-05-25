# Performance And Load Testing

Step 14 adds the production performance baseline. It does not claim that NeeDo
already supports 100k peak visits. Each tier must be measured and recorded before
making a support statement.

## Observability Endpoints

| Endpoint | Purpose | Expected use |
|---|---|---|
| `GET /api/v1/health` | Liveness plus lightweight Redis status | Container health check |
| `GET /api/v1/ready` | Readiness across MySQL and Redis | Load balancer / orchestrator gate |
| `GET /api/v1/metrics` | Prometheus text metrics | Internal scrape only |

Production metrics should be protected by `METRICS_BEARER_TOKEN` and by network
rules. Do not expose `/metrics` on the public internet.

Core metrics now emitted:

- `http_requests_total{method,path,status}`
- `http_request_duration_seconds_bucket`
- `http_request_duration_seconds_sum`
- `http_request_duration_seconds_count`
- `needo_backend_uptime_seconds`
- `process_resident_memory_bytes`

PromQL examples for key API latency:

```promql
histogram_quantile(0.50, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, path))
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, path))
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, path))
sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))
```

## Pools, Cache, Rate Limit

- MySQL pool settings are configured by `DATABASE_POOL_CONNECTION_LIMIT`,
  `DATABASE_POOL_ACQUIRE_TIMEOUT_MS`, `DATABASE_POOL_IDLE_TIMEOUT_MS`, and
  `DATABASE_POOL_CONNECT_TIMEOUT_MS`.
- Redis client pool settings are configured by `REDIS_POOL_SIZE`,
  `REDIS_CONNECT_TIMEOUT_MS`, `REDIS_RECONNECT_MAX_RETRIES`,
  `REDIS_RECONNECT_BASE_DELAY_MS`, and `REDIS_RECONNECT_MAX_DELAY_MS`.
- Anonymous read APIs get public HTTP cache headers using
  `CACHE_PUBLIC_MAX_AGE_SECONDS` and `CACHE_STALE_WHILE_REVALIDATE_SECONDS`.
- Auth, write APIs, health, readiness, metrics, and admin APIs return
  `Cache-Control: no-store`.
- Global API rate limiting is controlled by `RATE_LIMIT_WINDOW_MS` and
  `RATE_LIMIT_MAX`. Auth-specific login failure limits remain in the Auth env
  variables.

## CDN Static Asset Plan

Static frontend bundles should be served from CDN/object storage, not from the
API container. Suggested cache rules:

| Asset | Cache policy |
|---|---|
| Hashed files under `/assets/` | `public, max-age=31536000, immutable` |
| Images/icons with versioned filenames | `public, max-age=2592000` |
| HTML entry files | `no-cache` or `max-age=60, must-revalidate` |
| API responses | Only cache anonymous read APIs listed above |

Set `CDN_BASE_URL` in staging/prod envs once the static deployment target is
known.

## k6 Tiers

Script:

```bash
k6 run load-tests/k6/needo-step14-load.js
```

Tier selection:

```bash
LOAD_TIER=1k BASE_URL=https://staging-api.needo.example k6 run load-tests/k6/needo-step14-load.js
LOAD_TIER=5k BASE_URL=https://staging-api.needo.example k6 run load-tests/k6/needo-step14-load.js
LOAD_TIER=10k BASE_URL=https://staging-api.needo.example k6 run load-tests/k6/needo-step14-load.js
LOAD_TIER=30k BASE_URL=https://staging-api.needo.example k6 run load-tests/k6/needo-step14-load.js
LOAD_TIER=100k BASE_URL=https://staging-api.needo.example k6 run load-tests/k6/needo-step14-load.js
```

For CDN checks:

```bash
LOAD_TIER=1k \
BASE_URL=https://staging-api.needo.example \
CDN_URL=https://staging-cdn.needo.example \
CDN_ASSET_PATH=/assets/app-hash.js \
k6 run load-tests/k6/needo-step14-load.js
```

30k and 100k tiers require distributed load generators. A single laptop or one
small VM is not valid evidence for those tiers.

## Report Template

Use `load-tests/reports/step14-performance-report-template.md` for every run.
Every row must include measured P50, P95, P99, error rate, throughput, and the
observed bottleneck. Keep rows as `Not run` until there is actual data.
