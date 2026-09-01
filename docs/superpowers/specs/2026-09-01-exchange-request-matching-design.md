# NeeDo Exchange Request 正式匹配设计

**日期：** 2026-09-01  
**状态：** 已按产品确认语义定稿  
**范围：** 设计速配、选配、成功匹配、未匹配关闭及发布费结算边界；实施仍按独立微步骤推进。  
**本轮首个实现切片：** 只交付选配模式下“入选人数恰好等于当前目标人数、入选报价总和不超过当前有效总预算”的原子成功匹配。

## 1. 目标与边界

NeeDo Exchange 已有正式 Request 发布、NDP/TEST_NDP 发布费冻结、选配抢单、正式服务/店铺/技师/排班绑定、抢单撤回、Request 撤回和自然到期。本设计补上独立的 Match 领域，而不是把匹配伪装成 Booking 或在 claim 上堆临时字段。

匹配成功必须同时持久化入选参与者、匹配后技师时段锁、claim 终态、Request 终态、事件、通知和审计。发布费继续保持冻结；匹配动作不创建 `BookingOrder`、不增加 `ScheduleSlot.bookedCount`、不收服务款、不调用支付提供方。

以下能力属于后续独立微步骤：

- 匹配成功后的双方同意取消；
- 从 Match 转换为预约或订单；
- 服务款支付、线下收款或外部支付；
- 履约完成后把 Request 发布费转平台收入。

## 2. 现状审计

当前代码事实如下：

- `ExchangePostStatus` 只有 `PUBLISHED / WITHDRAWN / EXPIRED`。
- `ExchangeClaimStatus` 只有 `ACTIVE / WITHDRAWN / REQUEST_WITHDRAWN / REQUEST_EXPIRED`。
- `ExchangeClaim.activeKey` 只在 `ACTIVE` 时防止同一技师重复抢同一 Request，进入终态后会清空。
- 抢单的时间冲突只查询有效 claim 和正式 `confirmed / in_service` Booking；不存在匹配后持久锁。
- `ExchangeRequestFinancial` 与 `WalletHold` 复用正式 Wallet/Ledger；前者只表达全额 `held/captured/released`，后者已经记录 captured/released 双计数。
- Request 撤回会全额 capture，自然到期会全额 release；当前没有手动结束匹配和半额结算动作。
- Notification、AuditLog、RBAC、Zod、OpenAPI 和五语言 Exchange UI 都已有正式复用路径。

## 3. 方案比较与选择

### 3.1 采用：独立 Match 聚合

新增一对一 `ExchangeRequestMatching`、入选参与者 `ExchangeMatchParticipant` 和 append-only `ExchangeMatchEvent`。Claim 记录报名事实，Match 记录发布者最终决定及其版本，Participant 记录匹配后的履约人和时段锁。

优点：

- 不把可撤回报名和不可变入选关系混为一谈；
- 可用单独版本完成发布者选择与速配并发控制；
- 后续 Booking 转换只消费 Participant 快照，不反向改写 claim；
- 半额结算、预算追加、人数减少和关闭事件都有可审计落点。

### 3.2 不采用：只扩展 ExchangeClaim

在 Claim 上增加 `selected`、预算和关闭字段无法表达一个 Request 的聚合版本、选择命令、入选总额及一次性终态；并发时也难以证明只成功一次。

### 3.3 不采用：匹配时直接创建 BookingOrder

Booking 是预约/订单状态机，匹配只确定服务者和预留时段。提前创建 Booking 会错误增加订单和排班容量、混入支付状态，并跨越本任务明确禁止的预约/支付边界。

## 4. 产品规则

### 4.1 速配与选配

- 速配：有效 claim 达到当前有效目标人数时尝试自动匹配；并发 claim 只能有一个事务完成匹配。
- 选配：允许多人抢单，发布者提交明确的 `selectedClaimIds`。
- 成功匹配不受“发布满一小时”限制。
- 速配若入选报价总和超出当前有效总预算，不自创最优子集算法，也不部分入选；Request 保持开放并返回发布者决策预览。

### 4.2 报价和预算

- 每条 claim 的报价不得超过发布时预算上限；预算下限只有发布者填写时才是硬下限。
- `budgetMode=total` 时，发布的 `budgetMaxJpy` 同时是单条 claim 上限和初始入选报价总和上限。
- `budgetMode=per_provider` 时，`budgetMaxJpy` 是单人上限；初始入选总额上限为 `budgetMaxJpy × 当前有效目标人数`。
- 超出总额时，服务端返回 409 预览，包含入选报价总和、当前有效上限和必须追加的精确金额。
- 发布者只能明确确认把有效预算增加到入选总额；预算追加不冻结或扣除 NDP，也不改写历史发布字段，而是写入 Match 聚合和事件。

### 4.3 人数不足

- 选配入选人数小于当前有效目标人数时，服务端返回 409 预览。
- 发布者可重新选择，或明确确认把有效目标人数减少到当前入选人数。
- 人数不得减少为 0，也不得超过发布时 `targetProviderLimitSnapshot`。
- 预算追加和人数减少可以在同一最终命令中同时明确确认；任一确认值不精确时整个事务零写入。

### 4.4 成功、失败者和隐私

- 成功 claim 变为 `MATCHED`；未入选的所有有效 claim 变为 `NOT_SELECTED`。
- 未入选者收到：`很遗憾，订单被别人抢走了，请再接再厉。`
- 入选者收到匹配成功通知；通知 payload 使用稳定事件键，正文不包含地址、电话、邮箱或令牌。
- 发布者与入选参与者可读取全部已填写地址及发布者身份；其他身份继续只看到一般公开字段。
- Exchange 在任何阶段都不返回发布者电话或邮箱。

### 4.5 撤回、关闭和发布费

- 抢单者仅能在匹配成功前撤回；匹配成功后 claim 与 Participant 不可用抢单撤回接口修改。
- 发布者“撤回 Request”沿用现有语义：取消全部有效 claim，并全额 capture 冻结发布费。
- 新增“结束匹配”动作，不与撤回混用：
  - 有有效 claim 但未匹配成功：capture `floor(amount/2)`，release 其余；
  - 没有有效 claim 且发布不足一小时：同样半额 capture、其余 release；
  - 没有有效 claim 且发布已满一小时：全额 release；
  - 自然到期未匹配：全额 release。
- 奇数发布费始终由 `capture=floor(amount/2)`、`release=amount-capture` 保证守恒。
- 匹配成功后发布费保持 `HELD`；后续双方同意取消时全额 capture，履约完成时全额 capture 到同币种平台钱包。
- NDP 与 TEST_NDP 使用同一套逻辑，但绝不跨币种；TEST_NDP 平台收入只进入平台 TEST_NDP 钱包并排除正式结算。

## 5. 数据模型

### 5.1 枚举

扩展：

- `ExchangePostStatus`: `MATCHED`, `CLOSED`
- `ExchangeClaimStatus`: `MATCHED`, `NOT_SELECTED`, `MATCHING_CLOSED`

新增：

- `ExchangeMatchingStatus`: `OPEN`, `MATCHED`, `CLOSED`
- `ExchangeMatchEventType`: `OPENED`, `CLAIM_ADDED`, `CLAIM_WITHDRAWN`, `BUDGET_INCREASED`, `TARGET_REDUCED`, `SELECTIVE_MATCHED`, `QUICK_MATCHED`, `CLOSED`
- `ExchangeRequestFinancialState`: `PARTIALLY_CAPTURED`

### 5.2 ExchangeRequestMatching

一条 Demand Request 恰有一条 matching 聚合：

- `exchangePostId`：唯一、Restrict；
- `status`；
- `effectiveTargetProviderCount`：初始等于发布目标，明确减员后更新；
- `effectiveBudgetMaxJpy`：初始由预算模式计算，明确追加后更新；
- `selectedQuoteTotalJpy`：未匹配时为 0，成功时保存入选总额；
- `version`：从 1 开始，每次 claim 集合变化、预算/人数变化或终态变化递增；
- `matchedAt`、`closedAt`；
- `createdAt`、`updatedAt`、`deletedAt`。

新 Request 发布事务创建聚合。迁移为现有 Demand 回填；已有有效 claim 的 Request 仍从一个可读取的确定版本开始，不推测历史命令。

### 5.3 ExchangeMatchParticipant

每位入选服务者一行：

- `matchingId`、`exchangePostId`、`exchangeClaimId`（claim 唯一）；
- `participantUserId`、`participantIdentityId`；
- `shopId`、`technicianProfileId`；
- `serviceId` 与 `technicianServiceId` 恰有一个；
- `scheduleSlotId`；
- `quoteAmountJpy`、`currency=JPY`；
- `estimatedStartsAt`、`estimatedEndsAt` 快照；
- `activeReservationKey=request:{postId}:technician:{technicianProfileId}`，唯一且匹配有效期间不清空；
- `matchedAt`、`createdAt`、`updatedAt`、`deletedAt`。

Participant 不增加 `ScheduleSlot.bookedCount`。Claim options、claim 创建和 Booking 创建/确认的技师重叠检查必须同时查询有效 Participant，才能使匹配后锁真正生效。

### 5.4 ExchangeMatchEvent

事件只追加、不更新业务内容：

- `matchingId`、`sequence`，组合唯一；
- `type`；
- `actorUserId`、`actorIdentityId`，系统动作允许为空；
- `versionBefore`、`versionAfter`；
- 可空且唯一的 `idempotencyKey`、对应 `payloadFingerprint`；
- 只包含业务 ID、计数、金额、状态的 `payload`；
- `createdAt`、`updatedAt`、`deletedAt`。

事件 payload 禁止地址、留言正文、电话、邮箱、token 和密码。

### 5.5 发布费投影

`ExchangeRequestFinancial` 增加 `capturedAmountNdp` 与 `releasedAmountNdp`，全额旧记录按状态回填。`PARTIALLY_CAPTURED` 必须满足：

```text
capturedAmountNdp + releasedAmountNdp = amountNdp
capturedAmountNdp > 0
releasedAmountNdp > 0
```

`WalletHold` 同步使用已有 captured/released 计数和 `partially_captured` 状态。LedgerService 在一个事务中扣 payer frozen、返 payer available、加 platform available，写一笔 transaction、对应 entries、reconciliation 和 audit。

## 6. API 与命令

### 6.1 读取匹配状态

`GET /api/v1/exchange/posts/{id}/matching`

仅 Request 发布者和已匹配参与者可读。发布者响应包含聚合版本、有效目标、有效预算、入选总额、Participant 和可执行能力；参与者响应不包含其他竞争者或内部身份 ID。

### 6.2 选配成功命令

`POST /api/v1/exchange/posts/{id}/matching/select`

请求：

```json
{
  "selectedClaimIds": [101, 102],
  "expectedVersion": 4,
  "budgetConfirmation": null,
  "targetConfirmation": null
}
```

超预算时只接受：

```json
{ "action": "increase_to_selected_total", "confirmedBudgetMaxJpy": 24000 }
```

人数不足时只接受：

```json
{ "action": "reduce_to_selected_count", "confirmedTargetProviderCount": 1 }
```

请求必须携带 `Idempotency-Key`。版本过期、确认值不精确或 claim 集合变化返回 409 服务端 preview；不进行部分写入。

### 6.3 手动结束

`POST /api/v1/exchange/posts/{id}/matching/close`

请求包含 `expectedVersion`，并携带 `Idempotency-Key`。响应返回关闭原因、claim 终态和发布费 `captured/released/currency` 守恒结果。

### 6.4 权限

新增：

- `exchange:matching:read-own`
- `exchange:matching:select-own`
- `exchange:matching:close-own`

默认只授予 Demand 发布者角色。速配由 claim 创建权限触发服务端领域动作，不新增客户端“速配完成”权限。

## 7. 原子事务和并发顺序

选配成功事务固定顺序：

1. 解析并重新验证当前 active identity、RBAC 和 owner scope；
2. 锁 `ExchangePost`；
3. 锁 `ExchangeRequestMatching` 并验证 `expectedVersion`；
4. 按 claim ID 排序锁选中 claim，并读取同 Request 全部有效 claim；
5. 校验模式、状态、到期、人数、预算、claim 归属和去重；
6. 按 technician ID 排序锁技师，并重新校验 Booking/Participant 时间冲突；
7. 创建 Participant；
8. 入选 claim → `MATCHED`，其他有效 claim → `NOT_SELECTED`，全部清空 claim `activeKey`；
9. matching → `MATCHED`，写入入选总额并递增版本；Post → `MATCHED`；
10. 写 MatchEvent、成功/失败通知和审计；
11. 提交。

任何一步失败全部回滚。唯一约束与行锁保证选配重复提交、速配并发触发和关闭竞争只能有一个终态胜者。锁顺序统一为 Request → Matching → Claims → Technicians → financial/wallet，避免与 claim 创建、关闭和后续财务事务互锁。

## 8. 隐私与返回投影

- 发布者始终能看自己的完整 Request 和收到的 claim。
- 匹配前服务者只看 Address 1、一般公开的 Address 2/3 和受开关控制的发布者身份。
- 匹配后仅 Participant 的 `participantIdentityId` 可看到全部已填地址和完整发布者身份。
- 未入选者、其他商户、其他技师和普通客户不能借 matching/claim 接口扩大读取范围。
- Match/Participant DTO 使用公开 ID 与展示快照；不返回内部 userId、identityId、钱包 ID、电话、邮箱或财务规则内部字段。

## 9. 高保真 UI

发布者现有“收到的抢单”面板升级为匹配决策区，不重做详情页：

- ACTIVE claim 提供清晰可访问的多选控件；终态 claim 只读；
- 顶部实时显示 `已选择人数 / 有效目标人数` 与 `入选报价总和 / 有效预算`；
- 只有服务器返回 `viewer.canSelectMatch` 时显示提交动作；
- 409 preview 原样呈现需要追加的预算或需要确认的新目标人数，发布者必须再次明确确认；
- 提交成功后读取服务器状态，展示入选参与者和匹配成功状态；
- 不显示预约、订单或付款按钮；
- 速配、关闭和后续取消在各自微步骤开放前不显示虚假可用控件；
- 简体中文、繁体中文、日语、英语、韩语完整；用户留言保持原文；窄屏无横向溢出。

服务者匹配成功后，详情页用同一正式 API 显示完整地址和发布者身份。未入选状态显示固定失败通知语义，但不显示其他 claim 或入选者隐私。

## 10. 错误语义

稳定错误键至少包括：

- `error.exchange.match_not_found`
- `error.exchange.match_not_allowed`
- `error.exchange.match_invalid_state`
- `error.exchange.match_selective_only`
- `error.exchange.match_version_conflict`
- `error.exchange.match_claim_invalid`
- `error.exchange.match_target_confirmation_required`
- `error.exchange.match_budget_confirmation_required`
- `error.exchange.match_schedule_conflict`
- `error.exchange.match_idempotency_conflict`
- `error.exchange.match_financial_conflict`

409 的 preview 放在统一错误响应的结构化 `data` 中；不返回 Prisma、MySQL 或 Node 原生异常。

## 11. 实施微步骤

1. **选配精确成功匹配：** 新增聚合/Participant/Event、状态、RBAC、读/写 API、高保真选择 UI、通知、审计和匹配后隐私；仅允许人数恰好满足且总额不超预算。
2. **预算追加与人数减少：** 增加结构化 409 preview 和精确二次确认，不改变成功事务的核心边界。
3. **速配：** 开放 quick claim，在 claim 创建事务中按版本并发安全触发；超预算只等待发布者决定。
4. **未匹配手动结束：** 增加关闭状态、半额/全额发布费结算、claim 关闭通知和财务投影。
5. **匹配后双方同意取消：** 独立设计，不在本设计的实现任务中顺带完成。

每一步完成测试、真实 MySQL 和真实浏览器验收后暂停，不越过下一步。

## 12. 首个实现切片验收

首个切片必须证明：

- migration、Prisma schema、物理表、索引、CHECK、Restrict FK 和 RBAC 一致；
- 发布者只能选择自己选配 Request 的 ACTIVE claims；列表继续分页；
- 入选人数必须恰好等于发布目标，入选总额不得超过当前预算；
- 相同幂等键重放不重复 Participant/Event/通知/审计，不同负载冲突；
- stale version、重复 claim、跨 Request claim、非 owner、跨身份和跨店均被拒绝；
- 并发两个选择命令只能成功一个；
- 成功后 Participant 持久、入选/未入选 claim 终态正确、其他 claim `activeKey` 清空；
- 匹配后技师时段继续阻止重叠 claim 和 Booking；不改 `bookedCount`；
- 发布费仍为 HELD，钱包余额、WalletHold、LedgerTransaction、WalletLedger、FinanceReconciliation 不产生匹配动作变化；
- 不创建 `BookingOrder`、Payment 或 IM 会话；
- 入选参与者可见全部已填地址和发布者身份，未入选者不可见；电话/邮箱不出现；
- 五语言 UI、真实错误、刷新持久化、440px 与 320px 窄屏、console 和 overflow 验收通过；
- 不删除旧测试数据，不推送、不部署、不真实扣款。

## 13. 回滚与安全

- migration 只新增表、枚举值、字段、索引、CHECK、FK 和权限；不修改已应用 migration。
- 首个切片不执行半额财务变更；发布费保持冻结。
- 真实数据库检查器只允许本地非生产目标，使用唯一 marker 创建并按捕获 ID 精确清理自己的 fixture；不清理已有 Exchange 数据。
- 代码回滚不删除历史 Match 数据；如需撤销功能，使用前向 migration 和路由能力门禁。
- 未通过任何一个自动化、数据库或浏览器门禁时，不合并、不推送、不部署。
