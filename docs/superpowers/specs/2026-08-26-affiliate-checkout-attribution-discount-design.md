# 联盟营销下单归因与优惠价格快照设计

## 1. 微步骤目标

本微步骤实现联盟营销正式链路的第 4 步：顾客使用领取者的专属优惠码或签名 URL 创建 Booking 时，在同一数据库事务内完成归因校验、顾客优惠计算、订单价格快照、固定返点额度占用和 Attribution 创建；订单在服务完成前取消时，在订单状态迁移事务内使归因失效并释放已占用额度。

本步只占用未来可能结算的一笔固定 NDP 返点额度，不创建 `AffiliateReward`，不扣减冻结钱包，不给领取者钱包入账。订单完成结算、任务结束释放、完成后退款冲正、点击分析、商户/店铺/用户/运营 UI 均留在后续微步骤。

## 2. 已确认边界

- 任务类型只有服务完成返点。
- 顾客优惠是商户 JPY 价格折让，不消耗任务的 NDP 返点预算。
- 显式输入且有效的优惠码优先于 URL；显式码无效时整个带优惠的下单请求失败，不静默回退到 URL。
- 顾客可以移除优惠信息后重新普通预约。
- 领取者与下单顾客是同一用户时，禁止自我归因、顾客优惠和返点额度占用。
- 归因成立时占用一笔 `rewardNdpPerCompletedOrder`，但只有服务完成后才能结算。
- 取消未完成订单使 Attribution 失效并释放该笔占用；不删除 Touch、Attribution 或审计证据。
- 本微步骤复用既有 `booking:create` 权限，不新增面向顾客的管理员权限。
- 现有 Affiliate schema 已具备 Touch、Attribution 和 BudgetReservation 所需字段，本步不新增 migration。

## 3. API 合同

### 3.1 创建 Booking

扩展现有 `POST /api/v1/bookings` 请求体：

```json
{
  "scheduleSlotId": 1201,
  "serviceId": 88,
  "fulfillmentMode": "store",
  "affiliateCode": "NDO-7H4K8M2Q9R",
  "affiliatePublicToken": "publicTokenId.signature"
}
```

- `affiliateCode`、`affiliatePublicToken` 均可省略；全部省略时保持普通 Booking 行为。
- 两者同时存在时只解析 `affiliateCode`。
- 两者都必须是去空格后的非空字符串并有长度上限；请求体继续使用 Zod 严格校验。
- `affiliatePublicToken` 使用既有 `AffiliateLinkTokenService` 验证签名和数据库 token hash，原始 token 不写日志、审计或业务表。

成功后的 Booking payload 增加可空 `affiliate`：

```json
{
  "taskId": 31,
  "publicCode": "NDO-7H4K8M2Q9R",
  "source": "code",
  "originalPriceJpy": 12000,
  "customerDiscountJpy": 1000,
  "finalPriceJpy": 11000,
  "rewardAllocatedNdp": 1000,
  "attributionStatus": "attributed"
}
```

返回值不暴露领取者用户身份、token hash 或钱包信息。普通订单的 `affiliate` 为 `null`。订单列表和详情通过同一映射返回该摘要，取消后状态显示 `invalidated`。

### 3.2 优惠预校验

新增需登录且要求 `booking:create` 的 `POST /api/v1/affiliate/codes/validate`：

```json
{
  "publicCode": "NDO-7H4K8M2Q9R",
  "scheduleSlotId": 1201
}
```

服务端从档期解析店铺、正式 Shop Service、订单原价和服务时间，返回与创建 Booking 相同的价格和任务公开摘要。预校验只用于结账页展示，不预留档期或返点预算；创建 Booking 时必须在事务内再次完整校验。

本步不提供 URL 的独立预校验接口；URL 已由 `GET /api/v1/affiliate/resolve/:publicToken` 解析，最终归因仍以创建 Booking 事务结果为准。

## 4. 服务与价格范围解析

Booking 的联盟范围统一使用正式 `Service.id`：

- 店铺定价订单：直接使用档期的 `serviceId`。
- 技师定价订单：必须通过 `TechnicianService.sourceShopServiceId` 映射到正式 Shop Service。
- 技师自建服务没有 `sourceShopServiceId` 时，不可使用联盟任务，返回服务范围不匹配。
- 任务必须同时包含目标 `AffiliateTaskShop.shopId` 和目标 `AffiliateTaskService.serviceId` 快照。

订单原价使用 Booking 服务端已经解析的整数 JPY 当前价格，不信任客户端传入金额。`servicePriceSnapshot` 保留优惠前原价；`priceAmount` 与 `paymentAmountJpy` 写入优惠后的成交价。

优惠计算规则：

- `none`：优惠 0。
- `fixed_jpy`：`min(fixedDiscountJpy, originalPriceJpy)`。
- `percent`：`floor(originalPriceJpy * discountRateBps / 10000)`，再取百分比优惠上限和订单原价中的最小值。
- `minimumOrderAmountJpy` 对优惠前原价校验。
- 原价、优惠、成交价均为非负整数 JPY，`finalPriceJpy = originalPriceJpy - customerDiscountJpy`。

## 5. 归因资格

创建 Booking 的事务时刻必须同时满足：

- Claim 未删除、状态为 `active`，且 `expiresAt` 晚于当前时间。
- Task 未删除，状态为 `scheduled` 或 `active`，未暂停、结束、取消或拒绝，且当前时间早于 `taskEndsAt`。
- 目标服务的预约开始时间落在 `[taskStartsAt, taskEndsAt)` 内。
- Claim 获取窗口只控制领取行为；已生成且仍有效的码/URL 不因 `claimEndsAt` 到达立即失效。
- 店铺、服务范围匹配。
- 领取者不是当前顾客。
- BudgetReservation 未删除、状态为 `active`，且 `totalFrozenNdp - allocatedNdp - capturedNdp - releasedNdp` 至少等于一笔固定返点。
- 当前订单尚无有效 Attribution。

Claim/顾客的完成订单上限在完成结算微步骤中按已完成有效订单校验；本步只做预算硬上限，避免把尚未完成的预约提前计入完成上限。

## 6. 事务与分层

新增聚焦的 `AffiliateCheckoutService` 与 `AffiliateCheckoutRepository`，保持：

```text
BookingController
  → BookingService
    → BookingRepository.createBooking transaction
      → AffiliateCheckoutService transaction port
        → AffiliateCheckoutRepository(transaction client)
```

BookingRepository 继续拥有档期锁、冲突校验、BookedCount 更新和 Booking 创建事务。它增加一个可选事务内 `affiliate` 回调，向回调提供：事务 client、顾客、目标店铺、正式服务、原价和预约开始时间。回调负责：

1. 按优先级解析 code/token，锁定 Claim、Task、BudgetReservation。
2. 校验状态、签名、自我归因、服务范围、最低金额和剩余预算。
3. 计算优惠并把成交价交还 BookingRepository。
4. Booking 创建后，在同一事务创建 `AffiliateTouch` 与 `AffiliateAttribution`。
5. 原子递增 Claim 的 `codeUseCount`（仅 code）和 `attributedOrderCount`。
6. 原子递增 Task 与 BudgetReservation 的 `allocatedNdp`。
7. 分配后不足下一笔返点时，把 Task 与 BudgetReservation 标记为 `budget_exhausted` / `exhausted`。

`AffiliateTouch` 在本步表示一次实际用于结账的 code/URL 触点。URL 结账不增加纯链接点击数；独立落地页点击采集留到前端微步骤。

事务失败必须同时回滚档期占用、Booking、Touch、Attribution 和预算占用。并发最后一笔预算通过数据库行锁串行化，不能超出冻结总额。

取消沿用 `BookingRepository.transitionOrder` 已有的事务内 settlement callback。`BookingService` 把既有账本动作和联盟取消动作组合为同一个回调，在同一订单迁移事务中：

- 锁定订单的有效 Attribution、Task 与 BudgetReservation。
- 把 Attribution 更新为 `invalidated`，清空 `activeKey`，记录 `booking_cancelled`、失效时间。
- Task 与 BudgetReservation 的 `allocatedNdp` 各减一笔快照金额，不改 `capturedNdp`、`settledBudgetNdp` 或钱包余额。
- 若任务仍在有效期且原状态为 `budget_exhausted`，根据当前时间恢复为 `scheduled` 或 `active`；BudgetReservation 恢复 `active`。
- 保留 Claim 的历史 code/url 使用和 attributed 计数，不把不可变行为统计倒扣。
- 同一取消重复提交不重复释放。

## 7. 稳定错误合同

所有业务拒绝使用统一 AppError，不返回 Prisma 或 Node 原生错误：

| HTTP | message key | 场景 |
|---|---|---|
| 404 | `error.affiliate.promotion_invalid` | 码/token 不存在、签名失败、Claim 过期或撤销 |
| 409 | `error.affiliate.task_not_attributable` | 任务暂停、结束或时间无效 |
| 409 | `error.affiliate.self_attribution_forbidden` | 领取者与顾客相同 |
| 409 | `error.affiliate.promotion_scope_mismatch` | 店铺/服务不在任务范围 |
| 409 | `error.affiliate.minimum_order_amount_not_met` | 原价低于门槛 |
| 409 | `error.affiliate.budget_unavailable` | 剩余冻结预算不足一笔返点 |

若带联盟优惠的创建请求失败，不创建普通 Booking。客户端明确移除联盟信息后才可普通下单。

## 8. 审计与安全

- Attribution 与 Touch 是归因证据；取消只做状态迁移，不物理删除。
- 创建归因和取消失效分别写受审计的业务动作，证据只包含业务 ID、价格快照、归因来源和分配额度。
- 日志、审计和 API 响应禁止包含原始签名 token、token hash、JWT、钱包敏感信息或领取者身份。
- 优惠码可作为顾客主动提交的公开业务标识返回，但不得把码与领取者私有资料联表暴露。

## 9. 测试与验收

### 9.1 单元与集成测试

- `none`、固定 JPY、百分比 BPS、封顶、最低金额和不低于 0 的价格计算。
- 显式 code 优先于 URL；显式无效 code 不回退。
- 无效/过期/撤销 Claim、暂停/结束任务、自我归因、范围不匹配和预算不足。
- 店铺定价与有来源的技师定价可归因；无来源技师服务被拒绝。
- 普通 Booking 行为保持不变。
- 订单 payload 返回联盟价格快照，不暴露领取者身份。
- 取消使 Attribution 失效并精确释放一次额度；确认、开始、完成在本步不改联盟状态。
- OpenAPI、Zod、权限、统一错误响应均覆盖。

### 9.2 真实 MySQL 验收

提供带环境安全守卫和精确清理范围的正式验收脚本，验证：

- fixed/percent/none 三种优惠与订单价格快照。
- code 和 URL 归因、code 优先级及签名校验。
- 自我归因、范围、最低金额、任务状态和预算错误。
- 并发争抢最后档期与并发争抢最后返点额度，均不超卖或超支。
- 取消后 Attribution 失效、额度恢复、钱包余额与冻结额不变化。
- 本步没有创建 Reward，也没有领取者钱包入账。
- 审计证据存在且不包含原始 token。

## 10. 完成标准

- Booking 创建、优惠价格、Touch、Attribution 和返点额度占用处于同一事务。
- 取消与归因失效、额度释放处于同一事务且幂等。
- 普通 Booking 与既有账本状态机回归通过。
- 真实 MySQL 验收覆盖并发预算与取消释放。
- backend lint、完整 test、build 通过；frontend 完整 test、build 保持通过。
- README 与联盟总设计标记本微步骤的正式 API 和边界，不宣称完成奖励结算或 UI。
