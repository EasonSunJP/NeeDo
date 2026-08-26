# NeeDo 联盟任务到期预算释放设计

## 1. 目标与边界

本微步骤只完成联盟任务到达 `taskEndsAt` 后的自动结束与未使用冻结 NDP 释放。

系统必须把到期的 `scheduled`、`active`、`paused`、`budget_exhausted` 任务转为 `ended`，停止新领取和新归因，并把当前未分配预算退回发布者现有 NDP 钱包。任务结束前已经形成的有效 Attribution 继续保留其 `allocatedNdp`，服务完成后仍按既有正式完单返点事务结算。

本轮不实现人工提前结束、不实现服务完成后退款冲正、不实现风控审核、聚合导出或商户/运营/联盟营销 UI。

## 2. 方案选择

### 方案 A：应用内专用到期 Worker（采用）

新增 `AffiliateTaskExpiryWorker`，由正式 backend 启动后立即执行一次，再按可配置间隔扫描。Worker 调用独立的 `AffiliateTaskExpiryService`，分批读取候选任务，并为每个任务开启独立 Prisma 事务。

优点是复用现有 Service、Repository、Ledger、审计和环境配置模式；本地 MySQL 可以验证真实行锁、幂等和回滚；单个任务失败不会阻塞整批任务。

### 方案 B：读取任务时惰性到期（不采用）

查询任务大厅或后台列表时顺便结束任务，会让 GET 请求产生财务写入；无人访问时预算也不会释放，无法作为正式财务流程。

### 方案 C：MySQL Event 或外部 Cron（不采用）

数据库事件难以复用 LedgerService、统一审计和应用错误模型；外部 Cron 增加部署依赖，且当前本地正式验收无法独立证明执行链路。

## 3. 预算定义与守恒

到期时可释放金额为：

```text
releaseAmount = totalFrozenNdp - allocatedNdp - capturedNdp - releasedNdp
```

所有字段必须是非负安全整数，且 `releaseAmount >= 0`。任何非法预算快照都作为财务一致性错误处理，不移动钱包、不改变任务状态。

到期释放 `U` NDP 后：

- 发布者 Wallet：`availableBalance += U`、`frozenBalance -= U`。
- BudgetReservation：`releasedNdp += U`。
- AffiliateTask：`releasedBudgetNdp += U`。
- `reservedBudgetNdp` 和 `totalFrozenNdp` 保持历史原值。
- 写一笔 `affiliate_task_budget_release` LedgerTransaction、WalletLedger、FinanceReconciliation、AffiliateBudgetTransaction 和账本审计。

最终始终满足：

```text
totalFrozenNdp = allocatedNdp + capturedNdp + releasedNdp + unallocatedNdp
```

这里的 `totalFrozenNdp` 是历史冻结总额，不等于钱包当前仍冻结的余额。钱包当前为该任务保留的冻结金额等于 `allocatedNdp + unallocatedNdp`。

## 4. 历史归因和后续释放

任务到期不能使结束前形成的有效 Attribution 失效，也不能解冻其 `allocatedNdp`：

- Attribution 后续服务完成：现有完单事务把 allocated 转为 captured，并向领取者结算固定 NDP。
- Attribution 后续订单取消或因完成上限失效：现有流程先减少 allocated，使该金额重新成为 unallocated。
- Worker 必须继续扫描已经 `ended` 且 `unallocatedNdp > 0` 的任务；下一轮把新产生的 unallocated 退回发布者钱包。
- 当 `allocatedNdp = 0` 且 `capturedNdp + releasedNdp = totalFrozenNdp` 时，BudgetReservation 进入 `released`，表示不再持有任何未结算冻结预算。
- 仍有 allocated 时，BudgetReservation 保持原有 `active` 或 `exhausted` 状态；任务状态仍为 `ended`，因此不会产生新分配。

## 5. 服务与仓储边界

### AffiliateTaskExpiryService

职责：

1. 分页读取候选任务 ID。
2. 对每个任务调用一次独立事务处理。
3. 锁定 Task 和 BudgetReservation 后重新判断状态、到期时间和预算。
4. 首次到期时通过现有状态机执行 `expire`，把任务转为 `ended`。
5. 计算本轮 releaseAmount；大于零时调用 LedgerService。
6. 同步领域聚合、预算交易链接和审计。
7. 返回 `scanned`、`ended`、`released`、`failed` 和 `releasedNdp` 统计。

一个任务失败时记录失败并继续其他任务；失败任务的事务整体回滚，下一轮重新尝试。

### AffiliateTaskRepository

新增边界：

- 分批查找已到期的非终态任务，以及 `ended` 且当前存在 unallocated 的任务。
- `FOR UPDATE` 锁定 Task 和 BudgetReservation。
- 条件更新任务为 `ended` 并递增 `lockVersion`。
- 累加任务和 Reservation 的 released 聚合；只有不再持有 allocated/unallocated 时才把 Reservation 标记为 `released`。
- 自动审计允许 `actorUserId = null`，表示系统执行者。

### LedgerService

继续使用 `releaseAffiliateTaskBudget`，但必须在任何仓储调用前验证 `amountNdp` 是正的安全整数。发布者 Wallet ID、owner type、owner ID 和 frozenBalance 必须与 Reservation 一致。

## 6. 调度、批处理与配置

- 新增 `AFFILIATE_TASK_EXPIRY_INTERVAL_MS`，默认 `300000`（5 分钟），最小 `60000`。
- 新增 `AFFILIATE_TASK_EXPIRY_BATCH_SIZE`，默认 `100`，范围 `1..500`。
- Worker 在 backend 启动后立即执行一次，然后按间隔执行。
- 单进程内使用 `running` 标志防止上一轮未完成时重入。
- backend 关闭时停止 Worker timer；正在执行的数据库事务由正常服务关闭流程完成或回滚。
- 多实例可以同时扫描；正确性由任务/预算行锁、条件更新和 Ledger 幂等键保证，而不是依赖单实例 timer。

## 7. 幂等与并发

每次释放使用“释放后的累计金额”构造幂等键：

```text
affiliate-task:<taskId>:expiry-release:to:<releasedAfterNdp>
```

同一预算状态的重复执行得到同一键，不重复移动钱包。后续 Attribution 取消产生新的 unallocated 时，`releasedAfterNdp` 增大，生成下一笔合法的增量释放交易。

事务锁定后必须重新计算金额，禁止使用候选扫描阶段的余额快照。并发情形结果如下：

- 两个 Worker 同时处理：一个实际结束/释放，另一个读取最新 released 后 no-op。
- 到期与服务完成同时发生：完成事务捕获 allocated；到期事务只释放当时 unallocated，两者总和保持守恒。
- 到期与订单取消同时发生：取消减少 allocated；本轮或下一轮 Worker 释放新产生的 unallocated，不重复释放。
- 钱包冻结不足、账本链接冲突或聚合条件更新失败：任务状态、钱包、Ledger 和领域记录全部回滚。

## 8. 状态与审计

首次把任务转为 ended 时写：

```text
affiliate.task.expired
```

每次实际释放预算时写：

```text
affiliate.task.expiry_budget_released
```

审计 metadata 至少包含 `taskId`、`reservationId`、`releaseAmountNdp`、`releasedBeforeNdp`、`releasedAfterNdp`、`allocatedNdp`、`capturedNdp` 和 `ledgerTransactionId`。无金额释放时不创建空 LedgerTransaction，但首次状态变化仍写到期审计。

Worker 日志只记录批次统计和稳定错误信息，不记录钱包余额明细、用户凭证或 Token。

## 9. API、Schema 和权限影响

- 不新增公开 HTTP API。
- 不新增角色或 permission。
- 现有 `AffiliateTaskStatus.ENDED`、预算聚合字段、LedgerTransaction 类型和预算交易表足以承载本微步骤，不修改 Prisma schema、不生成 migration。
- OpenAPI 无新增路由；现有任务详情会自然显示 `ended`、released 聚合和 Reservation 状态。

## 10. 测试与真实验收

自动测试必须覆盖：

- 状态机仅在 `now >= taskEndsAt` 时允许 expire。
- 无归因任务到期后全部未使用预算释放。
- 已捕获部分奖励时只释放剩余未使用预算。
- 有未完成 Attribution 时保留 allocated，只释放 unallocated。
- ended 任务的 Attribution 后续取消后，下一轮继续释放新增 unallocated。
- 无可释放金额时只结束任务，不创建零金额 Ledger。
- 同一 Worker 重复执行和两个 Worker 并发执行均幂等。
- 到期与服务完成、到期与取消并发时预算守恒。
- 钱包冻结不足或领域条件更新失败时整笔回滚。
- Worker 防重入、错误隔离、启动和停止行为。
- 环境变量默认值、边界和非法值拒绝。

新增本地 MySQL 验收脚本，必须拒绝 production/staging、远程 MySQL 和生产样式数据库名；只创建带唯一 marker 的 Task、Reservation、Attribution、Wallet、Ledger 和审计记录，并在结束后精确清理。验收输出必须明确证明任务状态、钱包前后余额、累计 released、保留 allocated、后续增量释放、Ledger/对账/审计数量以及并发幂等。

## 11. 文档与后续门禁

完成后更新 `README.md`、`docs/00_MASTER_MICRO_STEP_PLAN.md` 和 `docs/ledger.md`，把“任务结束解冻”标记为已完成。

“服务完成后退款冲正”仍保持下一独立财务微步骤；在该步骤通过真实 MySQL 验收前，不开放完整 Afirieito 运营指标、结算操作或正式联盟营销 UI。
