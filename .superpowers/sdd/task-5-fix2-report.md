# Task 5 Security Fix 2 Report

## Result

Task 5 now closes the second security review without a Prisma schema or migration change.

- Merchant shop switching uses one Redis Lua commit for old-refresh validation/removal, new-refresh creation/indexing, old-access blacklisting, an idempotency receipt, and one Redis Stream completion event.
- Every foreseeable key-shape and argument failure is checked before the first write: old/new refresh key types and values, refresh TTL, refresh-index type/membership/TTL, generation type/value/TTL, access-blacklist type, receipt type/value/TTL, outbox type, operation hash, audit ID, and token TTL arguments.
- A timed-out or connection-uncertain `EVAL` is reconciled by replaying the exact same internal operation. A matching receipt returns the original pre-generated token pair; a collision or invalid state fails closed; replay does not rotate twice or emit a second event. The receipt contains only `auditId`, a SHA-256 operation hash, and `completed`, never either bearer token.
- The durable MySQL `authorized_attempt` audit is created before credential mutation and its ID is included in the atomic Redis Stream outbox event. A consumer updates that same AuditLog metadata to `phase: completed` and ACKs only after the update succeeds. Completion failure does not turn an already-committed switch into a 5xx; the pending event is retried on a later authenticated request.
- Concurrent switches create two authorized attempts but only the credential winner emits a completion event and reaches `completed`; the loser remains an attempt.
- The centralized allowed-pairs resolver now follows the unified-identifier backfill contract: direct-shop `merchant`, `merchant_owner`, `merchant_staff`, `business`, and `b`; merchant-account `merchant_owner`, `merchant_organization`, `owner`, and `o` with `merchant_account` or legacy `merchant`; and compatible unscoped owner identities with `global` and no scope ID. Forged customer/technician merchant scopes and unsupported cross-pairs still fail with `40305 / error.identity.forbidden`.

The public switch DTO and response are unchanged. Operation IDs, audit IDs, numeric shop/account/membership IDs, and bearer material are not exposed. The internal numeric `shopId` remains only in MySQL audit metadata.

## TDD evidence

RED was observed before production changes:

- The real Redis test reproduced `WRONGTYPE` after the old refresh had already been deleted by the previous script.
- Receipt/replay/collision/outbox expectations failed because the old operation returned only a boolean and wrote no receipt or stream event.
- A simulated response timeout returned `503` even though the original `EVAL` remained live.
- Audit completion/retry tests remained at `authorized_attempt`, and the compatible merchant identity pairs were rejected.

Focused GREEN:

```text
npm test -- --runInBand tests/auth-session.store.test.ts tests/merchant-shop-scope.test.ts tests/merchant-shop-switch-api.test.ts tests/auth.repository.test.ts
```

Result: 4 suites passed, 61 tests passed.

Final Task 5/auth/backfill regression:

```text
npm test -- --runInBand tests/merchant-shop-context.repository.test.ts tests/merchant-shop-scope.test.ts tests/merchant-shop-switch-api.test.ts tests/auth.test.ts tests/auth.repository.test.ts tests/auth-session.store.test.ts tests/openapi.test.ts tests/google-auth.service.test.ts tests/auth-permissions.test.ts tests/unified-identifier-backfill.test.ts
```

Result: 10 suites passed, 163 tests passed.

Real Redis verification (explicit opt-in; skipped safely unless the environment variable is set):

```text
RUN_REDIS_AUTH_STORE_INTEGRATION=true npm test -- --runInBand tests/auth-redis-lua.integration.test.ts
```

Result: 1 suite passed, 4 tests passed. It proves the polluted refresh index is rejected before any write, the old refresh remains usable, no access blacklist/receipt/outbox mutation occurs, receipt TTL/replay/collision work, exactly one completion event is emitted, and the real consumer group reads and ACKs it.

Quality gates:

```text
npm run lint
npm run build
npx prettier --check <all ten changed source/test files>
git diff --check
```

Result: all passed.

## No-schema design trade-off and remaining operational risk

The MySQL audit row is the durable authorization intent; Redis is the existing credential authority and now also carries the idempotent completion receipt/outbox. This avoids the impossible rollback boundary between MySQL and Redis without adding a schema-backed coordinator. A Redis rejection leaves the MySQL attempt incomplete and changes no credential state. After Redis commits, completion is recoverable and idempotent, so a transient MySQL failure cannot lose the returned token pair.

The outbox consumer is request-assisted rather than a new standalone worker: the successful switch attempts a drain, and subsequent authenticated requests retry pending entries. A future dedicated worker may call the same consumer methods without changing the contract. As with the existing session system, catastrophic Redis data loss or eviction remains an infrastructure durability risk and must be controlled by Redis AOF/replication/capacity policy; this task does not change deployment topology.

## Scope guard

- No Prisma schema or migration change.
- No frontend or Task 6+ change.
- No production mock, fake, placeholder, or alternate authentication path.
- No OpenAPI/DTO change was necessary because the public contract is unchanged.
- No push, merge, or deployment.
