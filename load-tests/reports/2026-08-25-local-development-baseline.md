# NeeDo Step 14 Local Development Baseline

## Test Metadata

- Date: 2026-08-25 (Asia/Tokyo)
- Environment: local development; this is **not** staging capacity qualification
- Git commit before report: `4675e30`
- Runtime: Node.js 22.15.0 on macOS 26.5.2
- Database: local MySQL 8.0.46, `needo_dev`, 10 configured pool connections
- Redis: local Redis 8.8.0, 2 configured clients
- Data: 10 shops, 100 technicians, 100 customers, and three months of persisted simulation activity
- Command: `LOCAL_PERF_BASE_URL=http://127.0.0.1:3102 LOCAL_PERF_CONCURRENCY=10 LOCAL_PERF_REQUESTS_PER_PATH=100 npm run perf:local-baseline`
- Test-only runtime override: `RATE_LIMIT_MAX=5000`; no tracked staging/prod limit was changed

## Capacity Verdict

| Tier | Peak target | Result | Evidence | Next action |
|---|---:|---|---|---|
| 1k | 1,000 visits peak | Not run | k6 is not installed and no staging target was supplied | Run the 1k k6 tier on staging |
| 5k | 5,000 visits peak | Not run | No 1k qualification yet | Run only after 1k passes |
| 10k | 10,000 visits peak | Not run | No 5k qualification yet | Run only after 5k passes |
| 30k | 30,000 visits peak | Not run | No distributed load-generator environment | Provision distributed generators after 10k passes |
| 100k | 100,000 visits peak | Not run | No CDN or horizontally scaled staging evidence | Validate CDN and split API/realtime scaling first |

No concurrency support claim is made from this local run.

## Local Read Baseline

The script issued 100 requests per path at concurrency 10. All 600 requests
completed in 1,300.48 ms (about 461 aggregate requests/second) with no request
errors.

| Flow | P50 | P95 | P99 | Max | Error rate |
|---|---:|---:|---:|---:|---:|
| Health | 3.85 ms | 13.11 ms | 14.37 ms | 21.96 ms | 0% |
| Readiness (MySQL + Redis) | 10.15 ms | 14.18 ms | 15.42 ms | 15.52 ms | 0% |
| Category list | 8.46 ms | 11.97 ms | 13.37 ms | 14.19 ms | 0% |
| Service list | 34.67 ms | 42.50 ms | 44.32 ms | 44.34 ms | 0% |
| Home recommendations | 43.67 ms | 49.10 ms | 51.69 ms | 52.38 ms | 0% |
| Search | 22.48 ms | 33.87 ms | 35.53 ms | 36.27 ms | 0% |

## Formal Flow Smoke

`npm run verify:production-smoke` passed eight checks against the same formal
backend and persisted database: health, readiness, categories, services, home,
merchant login, `/auth/me`, and logout. The script does not print credentials or
tokens.

## Observability Evidence

- `/api/v1/ready`: ready; MySQL and Redis both reported `status=ok`.
- `/api/v1/metrics`: dependency availability, latency, configured pool size,
  healthy Redis clients, request counts, duration histograms, memory, and uptime
  were exposed.
- Error rate in the accepted local baseline: 0%.
- Slow-query and host CPU dashboards: not available in this laptop-only run.

## Bottleneck Notes

- Home recommendations had the highest local read latency (P95 49.10 ms).
- Service list was second (P95 42.50 ms).
- This test did not measure CDN assets, authenticated list traffic, order writes,
  SSE connection density, MySQL saturation, Redis operations/second, or
  multi-instance rate limiting.
- An earlier run under the normal 100 requests/minute local limit correctly hit
  HTTP 429. It was rejected by the script and is not used as performance evidence.

## Decision Log

- Support claims made: formal local smoke passes; a concurrency-10 read baseline
  completed with 0% errors.
- Support claims explicitly not made: 1k, 5k, 10k, 30k, or 100k capacity.
- Rollback trigger for staging: readiness failure, error rate >= 1%, or the k6
  latency thresholds failing.
- Next test tier: 1k on staging after a real env, CDN asset, monitoring scrape,
  and load-generator host are available.
