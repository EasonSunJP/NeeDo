# Task 5 Security Fix 5 Report

## Result

Task 5 now addresses the fifth security review without changing the Prisma schema, migrations, public API, or frontend.

- Audit completion no longer runs through the request-serving Prisma client or its pool. Each audit worker runtime owns a dedicated Node worker thread; that thread owns a `connectionLimit: 1` PrismaClient with the MariaDB adapter and invokes the existing `AuthRepository.completeMerchantShopSwitchAudit` CAS. No direct MariaDB query, handwritten SQL, alternate repository logic, or schema change was introduced.
- The worker runtime owns both its dedicated Redis client and its dedicated audit-completion execution thread. A drain deadline or shutdown aborts the service signal, destroys the Redis socket, and terminates the database worker thread. Termination rejects the in-flight completion promise, so the service cannot continue to ACK after the deadline and no unresolved Prisma promise remains in the server thread.
- The outbox worker marks a runtime destroyed only after `destroy()` succeeds. A synchronous throw or rejected destroy keeps the runtime in a retry set; graceful stop retries it and logs each failed attempt. `start`, `stop`, request triggers, intervals, and deadlines retain the previous single-flight/idempotent behavior.
- Backend shutdown now has a configured upper bound for graceful audit-worker stop. If that deadline expires, it invokes the worker's hard destroy path and proceeds with the normal server/dependency shutdown flow. It does not add `process.exit` as a watchdog or bypass normal cleanup.
- Audit completion retry exhaustion no longer reuses Redis Stream delivery count. Explicit repository `false` results atomically increment a dedicated TTL-bound Redis hash field by source stream ID. Database exceptions do not increment it. Successful ACK or DLQ atomically deletes the field with `XACK`/`XDEL`; only consecutive deterministic conflicts reaching the configured bound enter the existing safe DLQ.
- Every service boundary checks `AbortSignal.throwIfAborted()` before a page/event, before and after database completion, and before and after ACK/DLQ/stat commands. An abort therefore cannot fall through to another event or report completion.

## Why the database runtime uses a worker thread

The installed MariaDB 3.4.5 driver documents that query timeout is unsupported for MySQL, and its `Pool.end()` implementation waits for active connections in 100 ms increments for up to 10 seconds before destroying them. A first implementation retained and destroyed the adapter socket; the silent-server regression showed that the query rejected immediately but `$disconnect()` still took about 10.2 seconds because of that pool wait.

PrismaMariaDb does not expose a cancellable query handle through Prisma's repository call. The minimal safe isolation is therefore a dedicated worker thread containing the dedicated Prisma runtime. `worker.terminate()` destroys the execution unit and its sockets without touching the main request Prisma client. The thread still uses the existing repository and parameterized Prisma queries; it contains no SQL.

If termination races a MySQL CAS that completed just before the socket closed, the outbox entry remains pending. The next isolated runtime reruns the idempotent repository method, observes the matching completed phase, and then ACKs. It never assumes an uncertain database operation failed.

## TDD evidence

The RED run used:

```text
npm test -- --runInBand tests/merchant-shop-audit-outbox.service.test.ts tests/server-shutdown.test.ts tests/merchant-shop-audit-completion.repository.test.ts
```

It demonstrated that:

- Redis delivery count `99` caused the first explicit CAS conflict to be dead-lettered;
- an abort occurring while completion was in flight still allowed ACK/stat work;
- a failed runtime destroy was marked complete and was not retried;
- shutdown waited forever for a never-settling worker stop;
- no dedicated completion runtime existed.

The first GREEN socket-retention attempt then produced a useful negative result: the in-flight Prisma query rejected, but runtime destroy measured approximately 10,197 ms because `Pool.end()` retained its fixed wait. This result caused the worker-thread isolation design above rather than a `Promise.race` workaround.

Focused GREEN verification:

```text
npm test -- --runInBand tests/auth-session.store.test.ts tests/merchant-shop-audit-outbox.service.test.ts tests/server-shutdown.test.ts tests/merchant-shop-audit-completion.repository.test.ts
```

Result: 4 suites passed, 28 tests passed. The silent TCP MySQL regression establishes a real accepted in-flight connection, terminates its dedicated Prisma thread, observes the completion rejection, and completes runtime destroy within the asserted two-second upper bound. Worker tests prove runtime recreation, no timer accumulation, stop-after-stop safety, post-stop trigger suppression, and destroy retry after an injected failure.

## Final verification evidence

Task 5/auth/backfill regression:

```text
npm test -- --runInBand --testTimeout=30000 tests/merchant-shop-context.repository.test.ts tests/merchant-shop-scope.test.ts tests/merchant-shop-switch-api.test.ts tests/auth.test.ts tests/auth.repository.test.ts tests/auth-session.store.test.ts tests/merchant-shop-audit-outbox.service.test.ts tests/merchant-shop-audit-completion.repository.test.ts tests/server-shutdown.test.ts tests/openapi.test.ts tests/google-auth.service.test.ts tests/auth-permissions.test.ts tests/unified-identifier-backfill.test.ts
```

Result: 13 suites passed, 181 tests passed. `auth.test.ts` passed all 50 tests in the same run.

Opt-in production-source Lua verification against local Redis 8.8.0:

```text
RUN_REDIS_AUTH_STORE_INTEGRATION=true npm test -- --runInBand tests/auth-redis-lua.integration.test.ts
```

Result: 1 suite passed, 10 tests passed. The fairness case now gives the first pending event a high Redis delivery count, injects three database exceptions, proves the deterministic-conflict hash is still absent, then proves counts `1` and `2` remain pending and count `3` alone enters DLQ. The DLQ transaction removes the conflict field. Existing maximum Stream ID, WRONGTYPE, receipt repair, stale takeover, poison, ACK/XDEL, and disconnect reconciliation tests remain green.

Quality gates:

```text
npm run lint
npm run build
npx prettier --check <all changed TypeScript files>
git diff --check
```

Result: all commands exited 0. The repository-wide Prettier command still reports unrelated pre-existing files, so the authoritative format gate is scoped to every TypeScript file changed by fix5, consistent with the preceding Task 5 reports.

## Scope and remaining operational risk

- No Prisma schema, migration, public route/DTO/response, frontend, or Task 6+ change.
- No production mock, fake, placeholder, direct SQL, or alternate authentication path.
- No push, merge, or deployment.
- Worker-thread termination is the hard client-side cancellation boundary. MySQL can still complete a statement immediately before disconnect; repository CAS and pending outbox replay make that race recoverable and idempotent.
- The prior Redis operational requirement remains: production auth state should use a dedicated, capacity-monitored, durable, `noeviction` Redis deployment. This code does not alter shared deployment policy.
