# Exchange Cancellation Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 Step 10 的一个独立微步骤：逐单双方取消的无副作用状态判定与命令校验。

**Architecture:** 领域函数只消费从正式数据库读取、经身份作用域校验的事实，返回允许的申请状态及是否需要取消订单；它不访问数据库或钱包。Zod 严格拒绝客户端指定操作方、批准人或资金处理结果。后续事务 API 必须在行锁内重新读取事实后调用该函数，不能把函数返回值当作已经完成取消。

**Tech Stack:** 现有 TypeScript strict、Prisma 枚举类型、Zod、Jest；不添加依赖。

## Global Constraints

- 仅逐单取消，不影响同一 Matching 的其他订单。
- 联盟营销及其退款、奖励政策继续暂停。
- 发起、拒绝、撤回申请均不改变订单状态、时段容量或钱包。
- 另一方才能同意或拒绝；同一服务方另一员工不是另一方；发起账号不能切换身份批准自己。
- 仅已关联 Participant 的 REQUEST、未开始服务且未收款的 PENDING/CONFIRMED 订单可发起或同意。
- 拒绝/撤回可关闭订单已推进后的旧申请，但永不取消订单。
- 状态版本采用订单取消历史的单调序号，初始 0；请求、决定每次成功均加 1。终态拒绝/撤回后可重新申请；已批准不能重新申请。新申请的 expectedVersion 最大 2_147_483_645，必须预留一次申请和一次答复的增长空间；答复最大 2_147_483_646。
- 本步不新增 API、表、migration、权限 seed 或前端入口；不修改 main、运行服务或数据库。

## Task 1: Strict commands and pure cancellation decisions

**Files:**
- Create: `backend/src/domain/exchange-cancellation.ts`
- Create: `backend/src/validators/exchange-cancellation.validators.ts`
- Test: `backend/tests/exchange-cancellation.test.ts`
- Test: `backend/tests/exchange-cancellation.validators.test.ts`
- Update: `docs/superpowers/specs/2026-09-05-exchange-bilateral-cancellation-design.md`

**Interfaces:**
- `decideExchangeCancellation(input: ExchangeCancellationInput): ExchangeCancellationDecision`.
- Input: action (`request|accept|reject|withdraw`), expectedVersion, order facts, latest request or null, authorized actor or null. Actor party is server-resolved `customer|provider`, never an HTTP body field.
- Latest request retains order id, initiating user/identity/party, status and version. No latest request means version 0.
- Decision success: `{ok:true, status, version, effect:"none"|"cancel_order"}`; failure: `{ok:false, reason}`. Only an allowed accept returns `cancel_order`.
- Validators: `exchangeCancellationOrderIdParamSchema`, `exchangeCancellationRequestBodySchema`, `exchangeCancellationDecisionBodySchema`; request body is only `{expectedVersion,reason}`, response command body only `{expectedVersion}`.

- [x] **1. Write failing tests for both real exports.** No mocks or database writes.

```typescript
expect(decideExchangeCancellation({ ...pendingInput, action: "accept", actor: provider }))
  .toEqual({ ok: true, status: "accepted", version: 2, effect: "cancel_order" });
expect(decideExchangeCancellation({ ...pendingInput, action: "accept", actor: customer }))
  .toEqual({ ok: false, reason: "not_allowed" });
expect(exchangeCancellationRequestBodySchema.safeParse({
  expectedVersion: 0, reason: "时间冲突", actorUserId: 100
}).success).toBe(false);
```

Test matrix also covers both initiating parties, different employee on same side, same account switching sides, other identity withdrawal, active duplicate, accepted terminal state, rejected/withdrawn reapplication, wrong order link, missing actor, stale/invalid versions, every non-eligible Prisma order/payment status, recorded service/payment timestamps, unchanged frozen inputs, missing/blank/oversize reasons and unknown command fields.

- [x] **2. Run RED:** `npm --prefix backend test -- --runInBand --runTestsByPath tests/exchange-cancellation.test.ts tests/exchange-cancellation.validators.test.ts`. Expected missing implementation modules, not environment failures.

- [x] **3. Implement the tested decision function and strict validators.** Decision evaluation order: authenticated party; exact Participant/order linkage; valid expected/current version; request create or pending response; correct party/account; current order eligibility for create/accept only. Reject and withdraw return `effect: "none"`. Freeze no global state and mutate no input.

```typescript
const expectedVersion = z.number().int().min(0).max(2_147_483_646);
export const exchangeCancellationRequestBodySchema = z.object({
  expectedVersion: expectedVersion.max(2_147_483_645),
  reason: z.string().trim().min(1).max(500)
}).strict();
export const exchangeCancellationDecisionBodySchema = z.object({
  expectedVersion: expectedVersion.min(1)
}).strict();
```

- [x] **4. Run GREEN and regression:** same two test paths plus `tests/exchange-booking-conversion.service.test.ts`, `tests/exchange-booking-conversion.repository.test.ts`, `tests/exchange-booking-conversion.validators.test.ts`. Run backend lint and build; inspect `git diff --check`.
- [x] **5. Record results and commit only this microstep.** Do not claim database concurrency, API permissions, ledger atomicity or browser acceptance from unit tests.

### Verification record

- Initial RED: two missing production modules, both test suites failed as expected.
- Review regression RED: the maximum-version new request caused an unresolvable pending state; two new assertions failed before correction.
- Final GREEN: five suites, **140 tests passed** (93 new policy/validator cases plus 47 booking conversion regression cases).
- `npm --prefix backend run lint`: exit 0; full backend lint.
- `npm --prefix backend run build`: exit 0; TypeScript build, no runtime startup.
- `git diff --check`: exit 0.
- Independent read-only review: both minor findings corrected and rechecked; no remaining findings for this microstep.
- No API, table, migration, database write, main merge, push, deployment or browser acceptance in this step. Actor scope resolution and atomic/idempotent persistence are integration obligations, not proven by this pure function.

## Subsequent independent microsteps (not delivered by this plan)

1. Persist cancellation requests and immutable events with a per-order active-request unique constraint and forward migration; verify real DB constraints and rollback.
2. Formal scoped read/command API, Zod/OpenAPI/RBAC and idempotency; atomic approval transaction cancels only the linked order, releases its slot and Request hold, captures Demand publication fee once, and appends history, audit and notifications. Keep ordinary cancel guard.
3. Shared customer/provider controls and five-language copy; real MySQL concurrency/fault injection plus both-party mobile/browser acceptance. Only then consider local main integration separately from push/deployment.

These are explicitly remaining work, not placeholder implementations or enabled partial APIs.
