# NeeDo 联盟营销退款责任与奖励保留设计

## 1. 状态与目标

- 设计日期：2026-09-07
- 状态：已获产品确认，等待独立实施计划
- 适用范围：已经完成服务的订单退款、退款投诉及其联盟营销奖励处理
- 明确排除：服务完成前的取消、爽约或未完成责任与奖励规则；该部分必须作为后续独立微步骤设计和实施

本设计解决三个问题：

1. 用户申请退款、商户处理退款与用户确认到账必须形成正式、可审计的业务链路。
2. 平台运营只能介入已经产生投诉的退款争议，不能审核或裁定普通退款申请。
3. 服务已经完成后产生的退款属于店铺责任，已经结算的联盟营销奖励永久保留，不得冲正或追回。

## 2. 已确认业务规则

1. 退款必须由用户发起申请。
2. 商户同意退款时，责任归属为店铺；该结论来自正式退款处理动作，不根据自由文本推断。
3. 商户提交退款凭证不等于用户已经收到退款。用户必须明确确认到账，退款才能完成。
4. 商户拒绝退款后，如果用户和店铺均未投诉，案件停留在商户已拒绝状态，平台不得介入裁定。
5. 商户拒绝退款后，用户或店铺可以主动向平台投诉。只有正式投诉案件存在时，平台运营才可以介入并裁定。
6. 订单服务已经完成后，不论后续由商户同意退款还是平台裁定退款，联盟营销奖励都保持已结算状态。
7. 服务完成后的退款不得创建联盟奖励冲正或追回账本，不得扣减推广者钱包，不得把奖励改为 `reversal_pending` 或 `reversed`。
8. 前端不能直接选择联盟奖励结果。奖励结果只能由服务端根据订单已完成这一正式事实执行固定政策。

## 3. 方案选择

### 3.1 采用方案：独立退款案件

新增独立的订单退款案件聚合，保存申请、商户处理、退款凭证、用户到账确认、投诉和平台裁定。退款案件通过 `bookingOrderId` 关联订单，但不把多阶段状态塞入现有 `BookingOrder.paymentRefund*` 字段。

现有订单付款退款字段继续作为最终退款投影和兼容数据，只有退款实际完成后才更新。它们不再承担退款申请或投诉状态机的职责。

### 3.2 未采用方案

- **直接扩展 `BookingOrder`**：字段较少，但无法完整表达申请、拒绝、投诉、裁定和到账确认，也难以保存不可变的处理历史。
- **直接依赖客服 Conversation**：客服会话适合沟通，不适合作为财务和责任事实来源；当前客服投诉正式后端链路也尚未形成可复用的完整案件聚合。

## 4. 状态机

```text
用户提交申请
  -> merchant_review_pending
      -> merchant_approved
          -> refund_pending
              -> customer_confirmation_pending
                  -> refunded
      -> merchant_rejected
          -> disputed                 # 只有用户或店铺主动投诉
              -> refund_pending       # 平台裁定支持退款
              -> dispute_rejected     # 平台裁定不支持退款
```

### 4.1 状态含义

- `merchant_review_pending`：等待商户处理，平台无裁定权。
- `merchant_approved`：商户接受退款申请，同时正式记录店铺责任。
- `merchant_rejected`：商户拒绝申请；没有投诉时不再自动流转。
- `disputed`：用户或店铺已经主动投诉，平台运营获得该案件的裁定权限。
- `refund_pending`：商户同意或平台支持退款，等待实际退款证据。
- `customer_confirmation_pending`：商户已提交退款凭证，等待用户确认到账。
- `refunded`：用户确认收到退款，案件完成，并更新订单最终退款投影。
- `dispute_rejected`：平台驳回投诉，案件关闭。

状态只能按允许的方向前进。每个命令必须携带幂等键和预期版本；重复相同请求返回原结果，不同载荷复用同一幂等键必须冲突。

## 5. 数据设计

### 5.1 `OrderRefundCase`

建议至少保存：

- `id`、`publicId`、`bookingOrderId`
- `status`、`version`
- `requestedById`、`requestedAt`、`requestReason`
- `merchantDecisionById`、`merchantDecisionAt`、`merchantDecisionNote`
- `responsibility = shop`
- `refundAmountJpy`、`currency`
- `refundSubmittedById`、`refundSubmittedAt`、`refundReference`
- `customerConfirmedById`、`customerConfirmedAt`
- `createdAt`、`updatedAt`、`deletedAt`

一个订单同一时间只能存在一个未关闭退款案件。金额必须来自正式订单付款数据或经受控修订后的正式金额，不能信任前端任意金额。

### 5.2 `OrderRefundDispute`

建议至少保存：

- `id`、`publicId`、`refundCaseId`
- `openedById`、`openedByIdentityId`、`openedAt`
- `reason`、`evidenceSnapshot`
- `status`
- `resolvedById`、`resolvedAt`、`resolution`
- `publicResolutionReason`、`internalNote`
- `version`、`createdAt`、`updatedAt`、`deletedAt`

平台裁定必须写入不可变修订记录和审计日志；后续改判不能覆盖原裁定。

## 6. 权限边界

- 用户：只能为自己的已完成订单申请退款、确认到账、对已拒绝案件投诉。
- 商户/店铺：只能在授权店铺范围内同意或拒绝申请、提交退款凭证、对已拒绝案件投诉。
- 平台运营：只能读取并裁定 `disputed` 案件；不能替用户发起普通退款，也不能在无投诉时改变商户决定。
- 联盟奖励：任何角色都没有直接修改奖励结果的 API 权限。

建议使用独立权限而不是复用过宽的付款写权限：

- `user:order-refund:write`
- `merchant-admin:order-refund:write`
- `backoffice:order-refund-dispute:read`
- `backoffice:order-refund-dispute:resolve`

## 7. 联盟奖励处理

订单完成时，现有联盟奖励结算保持不变。退款案件创建和流转时，服务端只读取奖励用于展示和审计，不对其进行写操作。

退款完成事务必须验证：

1. 订单状态为 `completed`。
2. 退款案件状态为 `customer_confirmation_pending`。
3. 确认者是订单用户本人。
4. 对应联盟奖励如果存在，其状态在事务前后都保持 `settled`。
5. 不产生 `affiliate_reward_reversal` 或 `affiliate_reward_recovery` 账本交易。
6. 不修改 `reversalRequiredNdp`、`reversedNdp`、`outstandingRecoveryNdp`。

已有的 `reversal_pending`、`reversed` 状态和冲正词汇继续保留在领域基础设施中，但本流程禁止使用，避免删除共享基础结构造成无关回归。

## 8. 审计与财务一致性

以下动作必须写正式审计：

- 用户申请退款
- 商户同意或拒绝
- 用户或店铺发起投诉
- 平台裁定及后续改判
- 商户提交退款凭证
- 用户确认到账
- 最终订单退款投影更新

用户确认到账与最终订单退款投影更新必须在同一数据库事务中完成。任何一步失败都整体回滚。审计元数据记录案件、订单、店铺、金额、前后状态、版本和幂等键，但不得保存 access token、支付密钥或未经控制的敏感凭证内容。

## 9. API 边界

建议按角色提供明确命令 API：

- `POST /api/v1/orders/:id/refund-requests`
- `POST /api/v1/orders/:id/refund-requests/:caseId/confirm-receipt`
- `POST /api/v1/orders/:id/refund-requests/:caseId/complaints`
- `POST /api/v1/merchant-admin/orders/:id/refund-requests/:caseId/approve`
- `POST /api/v1/merchant-admin/orders/:id/refund-requests/:caseId/reject`
- `POST /api/v1/merchant-admin/orders/:id/refund-requests/:caseId/refund-evidence`
- `POST /api/v1/merchant-admin/orders/:id/refund-requests/:caseId/complaints`
- `GET /api/v1/backoffice/refund-disputes`
- `POST /api/v1/backoffice/refund-disputes/:id/resolve`

所有输入使用 Zod；列表必须分页；受保护接口必须有明确 permission；OpenAPI 必须同步；服务层决定状态与责任，Controller 不包含业务逻辑。

## 10. 错误处理

至少需要稳定区分：

- 订单不属于当前用户或店铺
- 订单不是已完成状态
- 已存在活动退款案件
- 状态不允许当前命令
- 预期版本冲突
- 幂等键载荷冲突
- 没有正式投诉却尝试平台裁定
- 非订单用户尝试确认到账
- 退款金额或币种与正式付款证据不一致

不得将 Prisma 或数据库原生异常直接返回前端。

## 11. 验证要求

实施必须遵循“先补失败测试，再修复”，至少证明：

1. 用户申请、商户同意、提交凭证、用户确认到账的完整成功链路。
2. 商户拒绝且没有投诉时，运营裁定返回拒绝。
3. 用户和店铺均可在商户拒绝后发起投诉。
4. 只有具备独立裁定权限的运营角色可以处理争议。
5. 并发处理、重复提交和陈旧版本不会产生重复退款案件或重复最终退款。
6. 用户未确认到账时，订单不得被标记为最终退款完成。
7. 完成订单的联盟奖励在商户退款和平台裁定退款后仍为 `settled`。
8. 推广者钱包余额不变，且没有联盟奖励冲正或追回账本记录。
9. 审计、订单退款投影和退款案件状态完整一致。

## 12. 后续独立微步骤

服务完成前取消、爽约或未完成的责任归因与联盟奖励支付不在本设计内。后续设计必须解决：

- 服务承接方责任时，即使订单未完成也支付联盟营销奖励。
- 用户责任时不支付奖励，并释放尚未结算的任务预算。
- 责任未知或存在争议时，预算保持锁定，不允许根据操作者或自由文本自动推断结果。
- 正式裁定、复核、申诉和审计的状态机及权限边界。

该后续能力不得复用本设计中的“完成后退款即店铺责任”作为未完成订单的自动责任结论。
