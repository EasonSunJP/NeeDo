# Task 5 Security Fix 3 Report

## Result

Task 5 now addresses the third security review without a Prisma schema, migration, public DTO, or frontend change.

- The merchant-shop Lua transaction validates every foreseeable failure before its first write: argument shape, every key type/value/TTL, refresh index membership, generation, ACL permission, and Redis Stream `last-generated-id`. An exhausted maximum stream ID returns `outbox_exhausted` without changing refresh credentials, the access blacklist, receipt, or outbox.
- The receipt is now a TTL-bound Redis hash containing no bearer token. It records the operation hash, audit ID, new refresh JTI, old access JTI, old access absolute expiry, outbox stream ID, and audit completion state. Replay verifies the live refresh value/index/generation, old-refresh removal, non-expired access blacklist, and completion event/audit state. Missing completion events are rebuilt only after the credential post-state matches; any mismatch or missing receipt after credential rotation fails closed and emits a structured security log.
- One request replays the exact same pre-generated operation under a total deadline and maximum attempt count. Each uncertain timeout, disconnect, or transient Redis state reacquires a client and reruns the same Lua transaction. Deadline exhaustion returns the existing stable Redis `503` and never claims that the operation was uncommitted.
- Audit completion now uses an `updatedAt` plus operation-ID compare-and-swap. A lost CAS rereads the row and succeeds only when that same operation is already completed, so concurrent metadata or soft deletion is never overwritten.
- A dedicated application worker now drains the Redis Stream. Each process has a unique consumer name, creates the group idempotently, takes over stale pending entries with `XAUTOCLAIM`, and then reads fresh entries. Successful completion uses `XACK` plus `XDEL`; malformed entries carry their source ID into an exact-length bounded Redis DLQ before `XACK` plus `XDEL`; failed completion remains pending for retry. Every drain logs processed/completed/failed/poison counts plus stream, pending, and DLQ lengths.
- Worker scheduling is single-flight, starts and stops with the backend lifecycle, and releases its timer during shutdown. Authentication and shop-switch requests only issue a throttled asynchronous trigger; audit database latency no longer extends the authentication request.

The public switch response remains the token pair, formal `me`, and `shopPublicId`. Operation/audit IDs, numeric shop/account/membership IDs, and bearer material are not exposed. Internal numeric `shopId` remains only in MySQL audit metadata.

## TDD and verification evidence

Focused repository/session/API/outbox verification:

```text
npm test -- --runInBand tests/auth-session.store.test.ts tests/merchant-shop-audit-outbox.service.test.ts tests/merchant-shop-switch-api.test.ts tests/auth.repository.test.ts
```

Result: 4 suites passed, 42 tests passed.

Opt-in real Redis verification:

```text
RUN_REDIS_AUTH_STORE_INTEGRATION=true npm test -- --runInBand tests/auth-redis-lua.integration.test.ts
```

Result: 1 suite passed, 8 tests passed. The suite uses the production Lua source and proves WRONGTYPE and maximum stream-ID pre-write rejection, receipt post-state validation and outbox repair, fail-closed receipt eviction, cross-consumer `XAUTOCLAIM`, completion failure/retry, poison DLQ, `XACK`/`XDEL`, real `CLIENT KILL` disconnect reconciliation, and bounded continuous connection uncertainty.

Task 5/auth/backfill regression:

```text
npm test -- --runInBand --testTimeout=30000 tests/merchant-shop-context.repository.test.ts tests/merchant-shop-scope.test.ts tests/merchant-shop-switch-api.test.ts tests/auth.test.ts tests/auth.repository.test.ts tests/auth-session.store.test.ts tests/merchant-shop-audit-outbox.service.test.ts tests/openapi.test.ts tests/google-auth.service.test.ts tests/auth-permissions.test.ts tests/unified-identifier-backfill.test.ts
```

Result: 11 suites passed, 168 tests passed. The CLI timeout override changed no source or test configuration. It was used because an unrelated worktree was concurrently saturating CPU; the first default-timeout run passed 10 suites / 163 tests and timed out five pre-existing bcrypt-heavy tests in `auth.test.ts` without an assertion failure. A separate overridden `auth.test.ts` run also passed all 50 tests.

Quality gates:

```text
npm run lint
npm run build
npx prettier --check <all changed TypeScript files>
git diff --check
```

Result: lint and build passed. Targeted Prettier and diff checks are run again immediately before commit.

## No-schema design trade-off and operational requirement

The existing deployment exposes one shared `REDIS_URL`; staging and production configure the shared Redis with `allkeys-lru`. This change deliberately does not alter that deployment policy because changing eviction semantics for every Redis consumer would create unrelated system risk.

The implementation therefore validates receipt and credential post-state on every replay and fails closed after any relevant eviction. It also preflights every known Lua runtime error, including Stream ID exhaustion, before its first write. Redis cannot roll back a Lua script after an unforeseen runtime/storage failure, so a dedicated durable auth Redis with AOF/replication, capacity alerting, and `noeviction` is an operational requirement before production release. That topology/policy change is outside this code-only task and was not deployed.

The MySQL `authorized_attempt` remains the durable intent. Redis atomically commits credentials, receipt, and a completion event; the worker idempotently completes that exact AuditLog. A Redis rejection leaves the attempt incomplete and credentials unchanged. A successful Redis commit can return tokens even while MySQL completion is temporarily unavailable, because the pending event remains recoverable.

## Scope guard

- No Prisma schema or migration change.
- No frontend, Task 6+, public route, or public response change.
- No production mock, fake, placeholder, or alternate auth path.
- No push, merge, or deployment.
