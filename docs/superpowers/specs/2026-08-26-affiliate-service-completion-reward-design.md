# NeeDo 联盟营销服务完成返点设计

## 1. 目标与微步骤边界

本微步骤只完成一件事：已有有效联盟归因的 `BookingOrder` 从 `IN_SERVICE` 正式进入 `COMPLETED` 时，把该订单在 Checkout 阶段已占用的固定 NDP 返点从发布者冻结钱包结算到领取者 User 钱包。

本轮不实现任务手动结束/取消后的剩余预算解冻，不实现完成后退款冲正，不实现风控人工审核，不开放商户、店铺、联盟营销前端或运营后台 Afirieito UI。上述能力继续保持门禁并拆成后续微步骤。

## 2. 已批准产品规则

- 只支持“服务完成返点”，预约、确认和服务中不结算。
- 返点金额读取 `AffiliateAttribution.rewardAllocatedNdp` 快照，不读取完成时可能已变化的任务配置。
- 发布者任务预算已在发布时全额冻结；Checkout 只占用额度；完成时才从 frozen 捕获。
- 领取者返点进入现有 User NDP 钱包，不创建第二套联盟钱包。
- 同一归因只能创建一个 Reward，同一完成事件只能产生一个 LedgerTransaction。
- 已结束、暂停或预算耗尽的任务不影响结束前已形成的有效归因完成结算。
- 顾客优惠是 JPY 价格快照，与 NDP 返点结算完全分开。

## 3. 方案选择

### 方案 A：Booking 事务协调 AffiliateCheckoutService 与 LedgerService（采用）

`BookingRepository.transitionOrder` 继续拥有外层 MySQL 事务。`BookingService` 在 `complete` 回调中先执行现有订单平台费结算，再调用 `AffiliateCheckoutService.settleCompletedBooking`。联盟服务锁定归因、任务、Claim 和预算记录，调用扩展后的 `LedgerService.settleAffiliateReward` 完成双方钱包及账本，再更新联盟领域记录。

优点是复用现有正式账本、保持 Route → Controller → Service → Repository 分层，并让订单状态、平台费、联盟返点在任一写入失败时一起回滚。

### 方案 B：在 BookingRepository 内直接写联盟钱包（不采用）

文件更少，但 Repository 会承担业务状态机并绕过 LedgerService，违反项目分层与“所有余额变化都有 ledger”的约束。

### 方案 C：建立独立联盟钱包和结算账本（不采用）

隔离度高，但会产生第二套余额权威来源、增加对账和冲正复杂度，违背已批准的单一 NDP 钱包设计。

## 4. 事务顺序

同一个 `BookingRepository.transitionOrder` 事务内按下列顺序执行：

1. 订单状态通过乐观条件从 `IN_SERVICE` 更新为 `COMPLETED`，写入状态历史。
2. 现有 `LedgerService.settleBookingCompletion` 结算 Booking 平台费和普通用户奖励。
3. 联盟 Repository 以 `FOR UPDATE` 锁定该订单的 Attribution、Task、Claim 和 BudgetReservation。
4. 没有联盟归因时直接返回，不创建任何联盟资金记录。
5. 校验 Attribution 仍为 `attributed` 或已完成的 `settled` 幂等状态，且订单顾客、店铺、服务与快照一致。
6. 校验任务的领取者完成上限和顾客完成上限。达到上限时把当前 Attribution 标记为 `invalidated`，释放其 allocated 额度并写审计；Booking 仍保持完成，不创建 Reward。
7. 有效归因先进入 `qualified`，创建 `pending` Reward。
8. `LedgerService.settleAffiliateReward` 使用独立幂等键捕获发布者 frozen NDP、增加领取者 available NDP，并写 LedgerTransaction、双方 WalletLedger、FinanceReconciliation 和账本审计。
9. 联盟 Repository 把 allocated 转为 captured，同步 Task/Claim 完成与结算聚合，关联 AffiliateBudgetTransaction、AffiliateRewardTransaction，并把 Attribution/Reward 置为 `settled`。
10. 写 `affiliate.reward.settled` 审计。

任一步失败，订单状态、普通 Booking 账本、联盟钱包、Reward、计数和审计全部回滚。

## 5. 幂等与并发

- 结算幂等键固定为 `affiliate:task:<taskId>:booking:<bookingOrderId>:reward:settlement`。
- `AffiliateReward.attributionId` 唯一，阻止一笔归因产生多个 Reward。
- `AffiliateRewardTransaction.ledgerTransactionId` 和 `AffiliateBudgetTransaction.ledgerTransactionId` 保存同一正式结算交易的领域链接。
- 任务预算行锁串行化同一任务的完成事件；Claim 行锁保护领取者完成上限；任务行锁配合已结算归因计数保护跨 Claim 的顾客完成上限。
- 并发或重复结算再次读取到 `settled` 时返回已有结果，不重复移动钱包、增加计数或写审计。
- 捕获金额必须等于该 Attribution 的 `rewardAllocatedNdp`，不得大于 BudgetReservation.allocatedNdp，也不得超过发布者钱包 frozenBalance。

## 6. 预算和聚合守恒

成功结算固定 `R` NDP 后：

- 发布者 Wallet：`frozenBalance -= R`。
- 领取者 Wallet：`availableBalance += R`。
- BudgetReservation：`allocatedNdp -= R`，`capturedNdp += R`。
- AffiliateTask：`allocatedBudgetNdp -= R`，`settledBudgetNdp += R`。
- AffiliateClaim：`completedOrderCount += 1`，`settledRewardNdp += R`。
- Attribution：`attributed → qualified → settled`，写 `qualifiedAt`、`settledAt`。
- Reward：`pending → settled`，写双方钱包、金额和 `settledAt`。

总冻结预算满足：

```text
totalFrozenNdp = allocatedNdp + capturedNdp + releasedNdp + unallocatedNdp
```

顾客/领取者完成上限不满足时不移动钱包、不增加完成或结算计数，只把本订单 allocated 额度释放回任务可用预算；若任务仍在有效期且原状态为 `budget_exhausted`，恢复为 `active` 或 `scheduled`。

## 7. 错误处理

- 无归因：正常完成订单，联盟结算 no-op。
- 已失效或已冲正归因：正常完成订单，联盟结算 no-op，不重新激活。
- 已结算归因：返回已有 Reward/账本结果，不重复入账。
- 达到任务定义的领取者/顾客完成上限：失效当前归因并释放占用，订单完成不回滚。
- Attribution 与订单顾客、店铺、服务不一致，Reward/账本链接缺失或预算/钱包冻结额不足：视为财务一致性错误，整个订单完成事务回滚并返回稳定业务错误。
- 不把 Prisma、MySQL 或 Node 原生异常直接返回给前端。

## 8. 接口与数据模型影响

不新增公开 HTTP 路由。继续使用现有受保护订单动作接口：

```text
POST /api/v1/orders/:id/complete
```

现有 Prisma 模型已经包含 Attribution、Reward、RewardTransaction、BudgetReservation、BudgetTransaction、Wallet、LedgerTransaction、WalletLedger、FinanceReconciliation 和 AuditLog 所需字段，本微步骤不修改 schema，不生成 migration。

## 9. 测试与验收

自动测试必须覆盖：

- 纯 LedgerService：冻结扣减、领取者入账、双边 ledger、对账、审计、幂等和冻结不足回滚。
- 联盟 Service：无归因 no-op、成功完成、已结算幂等、领取者上限、顾客上限、失效归因、订单快照不一致和账本失败传播。
- Repository：行锁查询、allocated → captured 守恒、Reward/交易链接唯一、Task/Claim 聚合与限额失效释放。
- BookingService：普通完成保持原逻辑；有归因时在同一 transactionClient 中组合普通账本和联盟结算；联盟失败使订单 transition 回滚。
- API/OpenAPI：现有 `complete` 动作合同不变，完成响应返回 `affiliate.attributionStatus = settled`。
- 本地非生产 MySQL：完整执行创建归因订单、确认、开始、完成、重复结算、并发完成、限额失效、钱包/预算/Reward/ledger/reconciliation/audit 校验及标记清理。

验收脚本必须拒绝 production、staging、远程数据库和生产样式库名，只删除本次唯一 marker 拥有的数据。

## 10. 后续微步骤

1. 任务结束/取消与未占用预算解冻。
2. 完成后退款冲正、余额不足待追回。
3. 商户 PC 任务与返点 UI。
4. 店铺端任务与返点 UI。
5. 联盟营销前端收益 UI。
6. 运营后台 Afirieito 归因、返点、预算、风控、审计与导出。

## 11. 实施与验收状态

截至 2026-08-26，本微步骤已按本设计实现。未新增公开路由、Prisma 模型或 migration；正式入口仍为 `POST /api/v1/orders/:id/complete`。本地非生产 MySQL 验收已通过精确钱包变动、预算 allocated 到 captured 守恒、Reward/账本/对账/审计关联、重复与并发幂等、领取者与顾客上限释放、冻结余额不足整单回滚及唯一 marker 清理。

验收命令：

```bash
ENV_FILE=.env.dev npm --prefix backend run check:affiliate-service-completion-reward-flow
```
