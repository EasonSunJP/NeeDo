# Task 5 Security Fix 4 Report

## Result

Task 5 now addresses the fourth security review without a Prisma schema, migration, public API, or frontend change.

- `readMerchantShopSwitchAuditOutbox` returns the `XAUTOCLAIM` continuation cursor and the `XPENDING` delivery count for every claimed/read event. Each worker-owned service persists its cursor, traverses a finite number of pages per drain, and resets only when Redis returns `0-0`. A pending event that deterministically fails audit completion cannot keep later pending pages from being processed.
- Deterministic audit completion conflicts have a delivery-count retry bound. At the threshold, the worker writes only source stream ID, bounded reason, and poison status to the length-bounded Redis DLQ, then atomically `XACK`/`XDEL`s the source. Database exceptions remain pending instead of being discarded as deterministic poison.
- Audit ACK and DLQ Lua responses are parsed strictly. Only the exact one-element response `["ok"]` is accepted; a rejected, malformed, ACL-denied, WRONGTYPE, or exceptional response becomes the existing stable Redis dependency `503`. The service counts it as failed and never reports the event completed/dead-lettered.
- The audit worker no longer shares a Redis client or command queue with authentication/session requests. Its runtime owns a client configured with `disableOfflineQueue` and a bounded command queue. The existing request-side merchant switch transaction and same-operation reconciliation continue to use the normal auth session pool unchanged.
- node-redis v5 removes command abort/timeout listeners after a command is written to the socket, so command options alone cannot cancel a silent in-flight reply. The worker therefore aborts its signal and destroys only its dedicated Redis client at the drain deadline or during shutdown. A later interval creates a fresh runtime/client.
- `start` and `stop` are idempotent, periodic/request triggers remain single-flight and throttled, triggers after stop are ignored, interval/deadline timers are cleared, and shutdown waits only a configured bounded interval for an in-flight drain. Backend shutdown awaits that bounded worker stop before disconnecting shared dependencies.
- Structured drain logs retain read/completed/failed/dead-lettered counts and Stream/PEL/DLQ lengths. Request authentication paths still only trigger the worker asynchronously and do not wait for MySQL audit completion.

## TDD evidence

The RED run demonstrated the pre-fix failures:

- a rejected ACK Lua result resolved successfully;
- outbox reads returned an array with no continuation cursor, so cursor/fairness tests failed;
- the old worker retained one interval only and could neither abort/destroy an in-flight runtime nor recreate it after a deadline.

The focused GREEN regression included strict ACK/DLQ accounting, cursor persistence/wrap, delivery-threshold DLQ, single-flight scheduling, runtime recreation, stop-after-stop behavior, and an actual silent TCP Redis endpoint whose handshake never replies.

```text
npm test -- --runInBand tests/merchant-shop-audit-outbox.service.test.ts tests/auth-session.store.test.ts tests/server-shutdown.test.ts tests/merchant-shop-switch-api.test.ts
```

Result: 4 suites passed, 41 tests passed before the final two lifecycle/accounting regressions were added. The final Task 5 regression below includes those added tests.

## Final verification evidence

Task 5/auth/backfill regression:

```text
npm test -- --runInBand --testTimeout=30000 tests/merchant-shop-context.repository.test.ts tests/merchant-shop-scope.test.ts tests/merchant-shop-switch-api.test.ts tests/auth.test.ts tests/auth.repository.test.ts tests/auth-session.store.test.ts tests/merchant-shop-audit-outbox.service.test.ts tests/server-shutdown.test.ts tests/openapi.test.ts tests/google-auth.service.test.ts tests/auth-permissions.test.ts tests/unified-identifier-backfill.test.ts
```

Result: 12 suites passed, 176 tests passed. `auth.test.ts` passed all 50 tests in the same clean run; no timeout override changed source or Jest configuration.

Opt-in production-source Lua verification against local Redis 8.8.0:

```text
RUN_REDIS_AUTH_STORE_INTEGRATION=true npm test -- --runInBand tests/auth-redis-lua.integration.test.ts
```

Result: 1 suite passed, 10 tests passed. The added real Redis cases prove more-than-batch pending traversal, a persistently failing first entry not blocking later entries, cursor wrap, stale cross-consumer takeover, bounded deterministic retry, strict WRONGTYPE ACK/DLQ rejection, and preservation of the source Stream/PEL entry. Existing WRONGTYPE pre-write, receipt repair, real disconnect reconciliation, and maximum Stream ID tests remain green.

Quality gates:

```text
npm run lint
npm run build
npx prettier --check <all changed TypeScript files>
git diff --check
```

Result: all commands exited 0. Repository-wide Prettier still reports pre-existing unrelated files, so the authoritative format gate was scoped to every TypeScript file changed by fix4.

## Redis and shutdown design notes

- The worker command set is compatible with Redis 7.2: `XGROUP CREATE`, `XAUTOCLAIM`, `XPENDING`, `XREADGROUP`, `XACK`, `XDEL`, `XADD`, and `XINFO STREAM`. No Redis 8-only command was introduced.
- An ACL-deny integration was intentionally not run because the available Redis instance is shared and changing its ACL could disrupt other worktrees. Exact rejected-response unit coverage plus real WRONGTYPE rejection exercise the same fail-closed parser and state-preservation path.
- The deployment still exposes one shared `REDIS_URL`; this change creates a dedicated client/socket, not a new Redis topology. The prior operational requirement remains: production auth state should use a capacity-monitored, durable, `noeviction` Redis deployment. Receipt/post-state reconciliation continues to fail closed under shared-cache eviction.
- A client/socket destroy can terminate only this worker's in-flight Redis command. It does not cancel an already-running Redis server-side command; the next dedicated runtime reconciles the resulting Stream/PEL state before reporting completion. Merchant credential Lua reconciliation is unchanged and never uses this worker client.

## Scope guard

- No Prisma schema or migration change.
- No public route, DTO, response, frontend, or Task 6+ change.
- No production mock, fake, placeholder, or alternate authentication path.
- No push, merge, or deployment.
