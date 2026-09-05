# Exchange Cancellation Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 在已通过验证的逐单取消规则上，新增正式取消申请与事件模型，并验证数据库约束。

**Architecture:** 申请通过已唯一的 Participant.bookingOrderId 关联原订单，不重复保存可漂移的 Participant ID。每次申请独立保留，活动订单键只有 pending 时非空。独立取消事件表保留每单单调版本、操作身份、幂等键及响应快照，不占用 Matching 的版本序列。

**Tech Stack:** TypeScript、Prisma、MySQL、Jest，使用现有 mariadb 驱动做隔离数据库约束验收。

## Global Constraints

- 一个微步骤：仅 schema、前向 migration、约束测试和文档；不新增 API/UI，不动费用或联盟营销。
- 不应用到正式开发库、main 或线上；数据库测试只创建随机命名的本地临时数据库，finally 删除本次创建的数据库。
- `ExchangeBookingCancellation` 持有发起/决定身份、原因、状态、requestedVersion/current version、时间及 activeOrderId。
- `ExchangeBookingCancellationEvent` 持有申请/订单复合外键、action、actor、版本前后、全局唯一幂等键、SHA256 指纹、JSON 响应快照及时间。
- pending 必须有与 bookingOrderId 相等的唯一 activeOrderId，无决定人；终态必须清除 activeOrderId，保存完整决定人及时间。
- accepted/rejected 的决定方与发起方不同，且 userId/identityId 都不能相同；withdrawn 必须原发起账号、身份及一方完全一致。
- requestedVersion 为 1..2147483646；pending.version=requestedVersion，终态.version=requestedVersion+1。事件版本前后严格 +1，每单 versionAfter 唯一。
- FK 使用 RESTRICT，不删除原始订单/Participant；事件追加写入由后续仓储 API 保证，本步不声称数据库拒绝所有 UPDATE/DELETE。
- 数据库不会替代 RBAC、身份所属账号检查、行锁、事件与业务写入的同事务和审计；这些保留为下一微步骤的明确验收项。

## Task 1: Schema and migration contract

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260905120000_exchange_bilateral_cancellation/migration.sql`
- Create: `backend/tests/exchange-cancellation-schema.test.ts`

- [x] Write tests requiring the two new models, lifecycle fields, indexed relations, per-order/event uniqueness and CHECK/FK constraints; run RED.
- [x] Add Prisma enums/models and reverse relations, without modifying existing columns or applied migrations.
- [x] Generate/verify the additive DDL with Prisma diff, then include MySQL CHECK constraints for the above invariants.

```sql
CHECK (
  (`status` = 'pending' AND `active_order_id` IS NOT NULL
   AND `active_order_id` = `booking_order_id` AND `deleted_at` IS NULL)
  OR (`status` <> 'pending' AND `active_order_id` IS NULL)
)
```

- [x] Run schema contract tests, `prisma validate`, `npm run prisma:generate`, backend lint/build and the existing cancellation/conversion tests.

## Task 2: Isolated real MySQL constraints

**Files:**
- Create: `backend/scripts/check-exchange-cancellation-schema.ts`
- Modify: `backend/package.json` (guarded checker command only)

- [x] Require explicit `ENV_FILE`, `ALLOW_EXCHANGE_CANCELLATION_SCHEMA_CHECK=true`, explicit local non-production `NODE_ENV`/`DEPLOY_ENV`, and a loopback DATABASE_URL before connecting. Administrator access must use an explicit user/password (or the env file's non-empty `MYSQL_ROOT_PASSWORD`). Passwordless root is allowed only through an existing absolute `EXCHANGE_CANCELLATION_MYSQL_ADMIN_SOCKET_PATH`, followed by a `root@localhost` identity check; generic `MYSQL_SOCKET_PATH` is ignored. Generate a random database name `needo_cancel_check_<hex>`; never accept a user-provided DROP target.
- [x] In the disposable database create minimal parent-key fixture tables and execute the exact checked-in migration, not a second copy of its constraints. This is constraint acceptance, not a formal full-database migration/flow proof.
- [x] Insert valid pending requests on two orders; verify duplicate active order, missing/wrong active key, invalid versions, missing linked Participant and absent actor FK fail. Resolve one request, preserve history, and create the next request on the same order.
- [x] Verify missing/wrong terminal actor, self/same-party approval and foreign withdrawal fail; valid opposite-party approval and original-identity withdrawal succeed.
- [x] Verify event composite FK, version step, duplicate per-order version and duplicate idempotency key fail. Exercise transaction rollback and competing active inserts on separate connections.
- [x] Drop only the generated database in finally, verify its absence, print aggregate results without credentials or existing user data. No network test is represented as passed if unavailable.

```bash
ENV_FILE=/absolute/path/to/local.env ALLOW_EXCHANGE_CANCELLATION_SCHEMA_CHECK=true \
  EXCHANGE_CANCELLATION_MYSQL_ADMIN_USER=<local-admin-user> \
  EXCHANGE_CANCELLATION_MYSQL_ADMIN_PASSWORD=<local-admin-password> \
  npm --prefix backend run check:exchange-cancellation-schema
```

## Completion boundary

Record actual test/DDL results, get independent read-only review, commit only this microstep. Keep application startup, main integration, formal migration application, API transaction implementation and browser acceptance separate.

## Verification record — 2026-09-05

- Clean isolated branch baseline: 3 suites / 94 tests passed before implementation.
- RED: all 3 new schema assertions failed because the models and migration were absent.
- Prisma validate passed; migrate diff from the committed schema produced only two CREATE TABLE operations and their FKs. Checked-in migration adds explicit MySQL CHECK constraints, with no edits to applied migrations or existing business columns.
- Prisma Client generated into this worktree's own backend/node_modules; no main runtime was restarted.
- Final targeted regression: **8 suites / 149 tests passed**. This is not a full backend suite or authenticated API/browser acceptance.
- Backend lint and build passed. Standalone strict TypeScript check of the new checker also passed.
- Real MySQL 8.0.46: **34 constraint checks passed**, including parallel active inserts with distinct request versions, exact request/order FK, illegal resolutions, retained history, idempotency uniqueness and rollback.
- The app's ordinary database account denied CREATE DATABASE. No grants were changed and no migration was applied there.
- Real constraint acceptance instead used a newly initialized private temporary MySQL 8.0.46 instance with networking disabled. The checker executed the exact migration against minimal parent-key fixtures; it did not copy app users, credentials or business data.
- Successful checker output: `passed=34`, `cleanupVerified=true`, `existingDatabaseModified=false`. The random databases were dropped; the standalone instance was shut down and its generated data directory removed.
- Independent read-only review found two minor checker issues (ambiguous concurrency conflict, cleanup skipped on connection close error). Both were fixed, reviewed again and tested; no remaining review findings for this microstep.
- No main merge, push, deployment, formal migration application, API/UI enablement, order/wallet write or Affiliate change.
