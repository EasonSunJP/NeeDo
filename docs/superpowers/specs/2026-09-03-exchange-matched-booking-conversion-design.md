# NeeDo Exchange 匹配结果转正式预约设计

**日期：** 2026-09-03

**状态：** 产品语义已确认，待按独立实施计划开发

**范围：** 将一个已成功匹配的 Exchange Demand 原子转换为多张正式 `PENDING` Request BookingOrder；不实现服务款支付、匹配后取消或发布费结算。

## 1. 目标

NeeDo Exchange 已完成正式 Request 发布、选择性抢单、精确匹配、预算追加与目标人数减少。匹配成功后，每个 `ExchangeMatchParticipant` 已经锁定服务者、店铺、服务、排班、报价和预计服务时间，但尚未占用 `ScheduleSlot.bookedCount`，也没有正式订单。

本微步骤增加一次由 Request 发布者明确触发的预约转换：

- 一个匹配结果只允许转换一次；
- 一位入选 Participant 对应一张独立 `BookingOrder`；
- 同一命令内全部订单成功，或全部零写入；
- 订单继续复用现有 Booking、Schedule、Order Fulfillment、Request dispatch fee、Checkout、Review 和审计系统；
- 不新增平行订单、排班、钱包、支付或本地 mock 系统。

完成后的主链路是：

```text
Exchange Demand → Claim → Match → Participant
  → 原子预约转换
  → 每位 Participant 一张 PENDING Request BookingOrder
  → 现有接单与履约链路
```

## 2. 已确认的产品语义

发布者点击一次“确认预约”，服务端为全部已匹配 Participant 原子创建各自独立的 `PENDING` 订单。

- 同一 Exchange 批次内的订单允许共同存在；不触发普通用户“新 PENDING 取消旧 PENDING”规则。
- 转换开始前已存在的、非 Exchange 保护的普通 `PENDING` 预约，仍按当前正式规则被替换、释放容量并写状态历史。
- 任意 Participant、服务、时段、容量、版本或并发校验失败时，整个批次回滚。
- 本步骤只创建预约，不收服务款、不调用外部支付、不 capture/release Exchange 发布费。

## 3. 方案比较

### 3.1 采用：Exchange 原子批次转换

新增 Exchange 匹配预约转换命令，由专用 Service/Repository 在一个 Prisma 事务中协调现有 Match、Participant、ScheduleSlot 与 BookingOrder 表。

优点：

- 保留“一位技师、一家店、一个时段、一张订单”的现有履约模型；
- 可以正确使用 Participant 报价，而不是当前服务目录价；
- 可以在一处处理 Participant 临时时段锁向正式订单容量的原子转移；
- 能证明幂等重放、并发竞争和失败回滚没有部分订单；
- 后续每位服务者可独立接单、履约、追加项目、结算和评价。

### 3.2 不采用：逐条调用现有 `/api/v1/bookings`

现有通用创建接口会：

- 对普通用户逐次取消旧 `PENDING`，导致前一位入选者的订单被后一位取消；
- 把正在转换的 Participant 自身当作技师时间冲突；
- 使用服务目录价，而不是已匹配报价；
- 无法保证多个订单全成或全败。

因此不能通过前端循环或多个独立 HTTP 请求完成转换。

### 3.3 不采用：一张聚合订单包含多位服务者

当前 `BookingOrder`、服务码、接单、履约、追加项目、结算和评价均以一个 shop、technician、service、slot 为边界。聚合订单会迫使这些正式系统整体重构，超出一个可运行、可测试、可回滚的微步骤。

## 4. 数据模型

使用前向 additive migration，不修改已应用 migration。

### 4.1 ExchangeMatchParticipant

新增：

- `bookingOrderId Int? @unique`：转换后的正式订单；FK `onDelete/onUpdate: Restrict`；
- `bookedAt DateTime?`：预约转换提交时间；
- `serviceNameSnapshot String`：匹配时服务名快照；
- `serviceDurationSnapshot Int`：匹配时服务时长快照。

调整：

- `activeReservationKey` 改为 nullable；匹配成功至预约转换前非空，订单创建后清空；
- Participant 不软删除、不改写 claim 事实；订单关系和 `bookedAt` 表达临时锁已转换。

现有 Participant 由新的 migration 按 `serviceId` 或 `technicianServiceId` 从仍受 Restrict FK 保护的正式服务记录回填名称和时长，再收紧为非空。新的匹配写入同步保存这两个快照。

### 4.2 BookingOrder

新增：

- `fulfillmentAddressSnapshot Json?`：仅 `home` Demand 保存发布时完整 `line1/line2/line3`；店内服务为 null，使用入选 shop 的正式地址；
- 反向一对一 `exchangeMatchParticipant` 关系。

每张转换订单固定：

- `orderType = REQUEST`；
- `status = PENDING`；
- `customerUserId = ExchangePost.authorUserId`，客户端不可提交；
- shop、technician、service/technicianService、scheduleSlot 来自 Participant；
- `priceAmount`、`servicePriceSnapshot`、`paymentAmountJpy` 使用 `quoteAmountJpy`；
- `currency = JPY`；
- `startsAt/endsAt` 使用 Participant 时间快照；
- `fulfillmentMode` 从 Demand `home/store` 映射；
- `serviceNameSnapshot`、`serviceDurationSnapshot` 使用 Participant 不可变快照；
- `serviceOwnerType/serviceOwnerId` 根据 shop service 或 technician service 在服务端解析；
- 不接受客户端价格、服务、身份、地址、时段或付款字段。

### 4.3 MatchEvent 与版本

`ExchangeMatchEventType` 新增 `BOOKINGS_CREATED`。

一次成功转换：

- `ExchangeRequestMatching.status` 保持 `MATCHED`；
- `version` 增加 1；
- 追加一个批次级 `BOOKINGS_CREATED` 事件；
- 事件记录 Participant/Booking ID、数量、报价总额、version before/after，不写地址、留言、电话、邮箱或令牌；
- 事件保存唯一 `Idempotency-Key` 与请求 fingerprint，作为重放权威。

不新增 Booking batch 表；Matching、Participant 的唯一订单关系和单个批次事件已足够表达转换结果。

## 5. API、RBAC 与错误

### 5.1 创建预约批次

```http
POST /api/v1/exchange/posts/{id}/matching/bookings
Idempotency-Key: <16..191 chars>
```

请求：

```json
{
  "expectedVersion": 7
}
```

响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "exchangePostId": 42,
    "matchingVersion": 8,
    "bookedAt": "2026-09-03T00:00:00.000Z",
    "orders": [
      {
        "exchangeClaimId": 101,
        "orderId": 501,
        "orderNo": "ND...",
        "status": "pending",
        "providerPublicId": "u...",
        "quoteAmountJpy": 12000,
        "startsAt": "...",
        "endsAt": "..."
      }
    ]
  }
}
```

响应按 Participant ID 稳定排序。

### 5.2 读取投影

现有 `GET /api/v1/exchange/posts/{id}/matching` 增加：

- `viewer.canCreateBookings`；
- owner 可见所有 Participant 的 `bookingOrderId` 与订单状态；
- matched participant 只可见自己的订单关系，不得看到其他参与者的订单 ID；
- 未入选身份不能借转换结果扩大匹配或订单读取权限。

实际订单详情继续通过现有、身份作用域受限的 `GET /api/v1/orders/{id}` 读取。

### 5.3 权限

新增 `exchange:matching:book-own`，只授予允许发布 Demand 的正式角色。服务端仍必须验证：

- active identity 恰好是 `ExchangePost.ownerIdentityId`；
- post 是 Demand 且状态为 `matched`；
- matching 是 `matched` 且版本相等；
- 所有 Participant 尚未转换。

### 5.4 稳定错误

至少包括：

- `error.exchange.match_booking_not_found` — 不可见或不存在；
- `error.exchange.match_booking_not_allowed` — 当前身份不是 owner；
- `error.exchange.match_booking_invalid_state` — 尚未匹配或已进入不兼容终态；
- `error.exchange.match_booking_version_conflict` — expectedVersion 过期；
- `error.exchange.match_booking_already_created` — 使用不同幂等键重复转换；
- `error.exchange.match_booking_slot_unavailable` — 容量、排班或服务不再满足；
- `error.exchange.match_booking_idempotency_conflict` — 同键不同 payload；
- `error.exchange.match_cancellation_required` — Exchange 订单必须等待后续匹配取消协议，不能绕过普通 cancel API。

所有错误使用统一 AppError；不返回 Prisma、MySQL 或 Node 原生异常。

## 6. 原子事务

统一锁顺序与现有 Booking 事务对齐：

1. 解析 access context、RBAC、owner identity 与 E-KYC；
2. 检查同幂等键的 `BOOKINGS_CREATED` 事件；完全相同则返回原结果，不同 payload 返回冲突；
3. 锁 customer user；
4. 锁 ExchangePost 与 ExchangeRequestMatching，验证 owner、状态和 expectedVersion；
5. 按 Participant ID 锁全部有效 Participant，并证明数量等于匹配结果且全部未转换；
6. 按 technician ID 锁技师，再按 slot ID 锁 ScheduleSlot；
7. 验证 Participant 引用、服务快照、时段、slot 状态、容量、shop/service 可用性、其他 Booking 硬锁与其他有效 Participant 锁；转换集合中的 Participant 自身不构成冲突；
8. 按现有会员规则一次处理转换前已有的非 Exchange 保护 `PENDING`：普通会员取消并释放 slot 容量、写状态历史、执行现有 Affiliate 失效副作用；Black 会员继续保留；
9. 对每个 Participant 条件递增 slot `bookedCount`，创建 Request BookingOrder 与初始 OrderStatusHistory；
10. 写回 Participant `bookingOrderId/bookedAt` 并清空 `activeReservationKey`；
11. matching version 条件更新，追加 `BOOKINGS_CREATED`，写正式通知与批次审计；
12. 提交后发送现有实时通知；实时传输失败不得伪造事务失败或重复订单。

任何步骤失败，旧 PENDING 取消、容量变化、订单、Participant、事件、通知和审计全部回滚。

## 7. PENDING、冲突与取消保护

### 7.1 同批次并存

同一 Exchange 匹配可用于同时需要多位服务者，因此：

- 同批次订单可以在客户维度时间重叠；
- 每位 technician 仍必须唯一且无其他硬锁冲突；
- 每个 slot 仍严格执行 capacity；
- 每张订单独立占用一份 `bookedCount`。

### 7.2 普通预约替换规则

通用 Booking 创建的“替换旧 PENDING”查询必须排除已关联 `ExchangeMatchParticipant` 的订单，防止用户后来创建普通预约时静默取消 Exchange 合同。

转换批次开始前已有的普通、未受 Exchange 保护的 `PENDING` 仍按现有会员规则处理：普通会员替换，Black 会员保留。批次内部只执行一次判断，不互相取消。

### 7.3 匹配后取消边界

已匹配 Participant 的双方同意取消及 Exchange 发布费处理仍是后续独立微步骤。为避免通用订单取消绕过该协议：

- 关联 ExchangeMatchParticipant 的订单暂时拒绝普通 `POST /orders/{id}/cancel`；
- 返回 `error.exchange.match_cancellation_required`；
- 不修改订单、Participant、matching、slot、wallet 或发布费 hold；
- 本步骤不实现同意、拒绝、超时、capture 或 release。

## 8. 财务边界

预约转换只写 Booking/Match/Schedule/通知/审计数据：

- Exchange publication fee `WalletHold` 与 `ExchangeRequestFinancial` 保持 `HELD`；
- 不创建 LedgerTransaction、WalletLedger、FinanceReconciliation 或外部支付记录；
- 不冻结 Request dispatch fee；现有系统只在服务者确认 Request order 时冻结该订单的 customer dispatch fee；
- 不结算服务报价；`quoteAmountJpy` 只成为订单 JPY 价格快照；
- 不改变 NDP/TEST_NDP 的服务端货币解析规则；
- 不合并 publication fee 与 Request dispatch fee，两者继续是独立财务生命周期。

真实数据库检查必须对转换前后钱包余额、publication hold、ExchangeRequestFinancial、ledger、reconciliation 和 order-financial 基线作差异断言，证明创建预约本身零财务写入。

## 9. 高保真前端

不重做 Exchange 详情页或正式订单详情页。

### Request owner

现有“收到的抢单/匹配结果”面板在 `matched` 且未转换时显示：

- 匹配人数、报价总额和每位服务者摘要；
- 一次性的“确认预约”主操作；
- 明确说明将创建多张独立待接单预约、此步不收服务款；
- pending、错误、版本变化和幂等重试状态。

成功后刷新正式 matching 投影，按 Participant 展示：

- `待接单` 状态；
- order number；
- “查看订单”入口；
- 不再显示创建按钮。

### Matched provider

服务者只能看到自己的入选结果和对应订单入口，不能看到其他 Participant 的订单 ID、报价以外的隐私或客户联系方式。

### UI 验收

- 简体中文、繁体中文、日语、英语、韩语完整；
- 用户 authored 文本保持原文；
- 刷新后状态完全来自 API；
- 320px 与 440px 无横向溢出；
- loading、error、success、replay 和 stale-version 可访问；
- 不新增本地订单、localStorage 或前端推断状态。

## 10. 测试与验收

### 10.1 自动化

- Prisma schema/migration：字段、CHECK、unique、index、Restrict FK、枚举和回填；
- validator/controller/route/OpenAPI/RBAC；
- service：owner、身份、E-KYC、状态、版本、幂等、同键异载荷；
- repository：全批成功、slot 容量、报价快照、地址隐私、事件序列、订单历史、Participant 锁转移；
- 并发：两个转换命令只能一个提交；
- 回滚：中间任一 slot 失败时零订单、零容量变化、零 Participant 部分转换；
- 普通 Booking 回归：Exchange PENDING 不被替换，普通 PENDING 仍按原规则处理；
- cancel 回归：Exchange 订单普通取消零写入；
- UI：owner 创建、成功刷新、错误、重试、provider 单订单投影和五语言。

### 10.2 本地真实 MySQL 检查器

新增 local-only、rollback-contained 主流程检查器，并为真实并发增加单独的 guarded integration proof。两者都必须显式拒绝 production flags、远程 MySQL 和生产型数据库名。

主流程检查器必须：

- 创建 marker-scoped customer、Request、matching、多个 Participant、服务和 slots；
- 使用真实 Service/Repository 执行转换；
- 证明订单数等于 Participant 数、报价和地址快照正确；
- 证明同批次 PENDING 共存、旧普通 PENDING 被精确替换；
- 证明 idempotent replay、同键异载荷、stale version 和容量失败；
- 证明 slot/Participant 锁原子转移；
- 证明 publication hold 与所有钱包/账本/对账基线不变；
- 外层事务回滚并独立查询 marker 零残留。

并发 proof 使用独立数据库连接竞争同一 committed marker fixture，证明两个转换命令只能一个提交。它必须按捕获 ID 精确清理全部行，并在清理后对 marker、订单、slot 容量、Participant、事件、通知和审计做零残留或精确基线对账；不能以删除用户已有数据换取通过。

### 10.3 最终门禁

- focused backend/frontend tests；
- backend lint/build、Prisma validate/generate；
- repository-wide lint/test/build；
- migration 物理表、索引、FK、CHECK、RBAC 和 `_prisma_migrations` 对账；
- 最新 main 正式 backend/frontend listener PID、cwd、branch、proxy origin 证明；
- customer owner、matched provider 的真实浏览器验收；
- 320/440px console、network、overflow、刷新持久化；
- 合并前 `git diff --check`、范围审计和无 marker 残留。

## 11. 非目标与停止边界

本微步骤明确不做：

- quick matching；
- 未匹配手动 close；
- 匹配后双方取消协议；
- publication fee capture/release；
- 服务款支付、外部支付或支付回调；
- 订单状态机、Checkout、Review、Wallet 或 Ledger 重构；
- IM 会话自动创建；
- 推送、部署或生产迁移。

实现、测试、真实 MySQL、浏览器验收和本地 main 合并完成后必须暂停，不自动进入支付或取消微步骤。

## 12. 回滚与安全

- migration 只前向增加字段、关系和枚举值，并使现有 Participant 快照可验证；不修改历史 migration；
- 功能代码回滚不删除已经创建的正式订单或 Participant 历史；如需关闭入口，使用路由/权限能力门禁和前向 migration；
- 不运行 blanket migration deploy，除非独立确认所有 pending migrations 都属于本任务且安全；
- 不清理用户已有 Exchange、Booking、Wallet 或 Ledger 数据；检查器只回滚自己的 marker fixture；
- 未通过任何自动化、数据库或浏览器门禁时不得合并、推送或部署。
