# 店铺会员卡金额/次数调整确认设计

日期：2026-08-31  
状态：用户已确认采用“店铺提交调整后的目标值，客户在 72 小时内同意或拒绝”的方案 A  
范围：发卡后的人工金额/次数纠正微步骤；不包含充值、核销、退款或 NDP 返点

## 1. 目标

为已正式开卡的店铺会员卡增加一个可授权、可审计、可幂等、可并发保护的调整申请流程：

- 店铺不能直接改写客户卡内金额或次数，只能提交“调整后的目标值”和业务原因；
- 储值卡只允许调整本金余额，次数卡只允许调整剩余次数，权益卡不支持本流程；
- 客户必须在申请创建后的 72 小时内明确同意或拒绝；
- 客户同意前，卡片金额和次数保持不变；
- 超过 72 小时未决定则申请过期，不自动同意，也不修改卡片；
- 客户同意时再次检查卡片版本与申请快照，避免把过期数据覆盖到新状态；
- 申请、决定、撤回、过期和失效均留下正式审计记录及必要通知；
- 本流程不产生 NDP，不扣店铺钱包，也不写充值、核销、退款或 NDP 账本；
- 商家端和用户端新增界面继续显示 `TEST` 角标。

## 2. 方案比较与选择

### 方案 A：店铺提交目标值，客户确认后落卡

店铺填写最终应有的本金余额或剩余次数，系统保存申请前快照；客户同意时才把卡片更新为目标值。目标值比“增加/减少多少”更容易让客户判断，也能避免重复提交、前端符号和并发计算造成歧义。采用此方案。

### 方案 B：店铺提交正负差额，客户确认后累加

差额更适合充值或核销等有明确交易方向的行为，但人工纠正中容易出现正负号误解；客户也需要自行计算最终状态，因此不采用。

### 方案 C：店铺直接修改，再允许客户申诉

该方案无法满足“客户同意才能修改”，且会形成先改账后补授权的风险，因此不采用。

## 3. 状态机与 72 小时规则

调整申请状态为：

- `PENDING`：等待客户决定；
- `APPROVED`：客户同意且目标值已经原子写入卡片；
- `REJECTED`：客户拒绝，卡片未变；
- `CANCELLED`：客户决定前由有权限的店铺人员撤回，卡片未变；
- `EXPIRED`：客户未在期限内决定，卡片未变；
- `INVALIDATED`：决定时发现卡片已被其他正式行为修改，旧申请失效，卡片未被旧目标覆盖。

`expiresAt` 由服务端在创建申请时设为 `createdAt + 72 小时`。决定接口以服务端时间为准：只有 `now < expiresAt` 才允许同意或拒绝；`now >= expiresAt` 时先把仍为 `PENDING` 的申请原子更新为 `EXPIRED`，再返回已过期结果。

过期处理采用两层保障：读取或操作申请时执行惰性过期，同时由后台周期任务扫描到期的 `PENDING` 申请。两条路径都用 `status = PENDING AND expiresAt <= now` 的条件更新并清空 `pendingKey`，保证只发生一次状态转换。过期状态、系统审计和双方通知在同一事务内完成；不得因任务延迟而延长客户决定期限。

同一张卡同一时间最多有一个 `PENDING` 申请。申请被拒绝、撤回、过期或失效后，店铺可以基于最新卡片状态重新提交。

## 4. 数据模型

新增 `ShopMembershipCardAdjustmentRequest`：

- `id`、`publicId`、`createdAt`、`updatedAt`、`deletedAt`；
- `cardId`：目标会员卡；
- `shopId`：申请发生时的店铺范围，便于强制店铺隔离；
- `requestedById`：申请人；
- `status`：上述状态枚举；
- `pendingKey`：仅待决定状态保留的卡片唯一键，用数据库唯一约束保证一张卡只有一个待处理申请；
- `reason`：店铺填写的业务原因，去除首尾空白后为 1–500 字符；
- `beforePrincipalBalanceJpy`、`targetPrincipalBalanceJpy`：储值卡申请使用，其他类型为空；
- `beforeRemainingUses`、`targetRemainingUses`：次数卡申请使用，其他类型为空；
- `cardLockVersionBefore`：创建申请时的卡片并发版本；
- `requestIdempotencyKey`、`requestFingerprint`：创建请求幂等与同键冲突识别；
- `decisionIdempotencyKey`、`decisionFingerprint`：客户决定请求幂等与同键冲突识别；
- `expiresAt`、`decidedAt`、`decidedById`；
- `cancelledAt`、`cancelledById`；
- `invalidatedAt`。

在 `ShopMembershipCard` 增加 `lockVersion Int @default(1)`。本步及后续所有会改变本金余额、奖励余额、剩余次数、总次数或卡状态的正式行为，都必须在事务中比较并递增该版本，不能绕过并发保护。

所有关联字段、状态加到期时间、店铺加创建时间、客户读取所需关系均建立索引；删除继续采用软删除。API 不返回内部数据库 ID。

## 5. 调整值规则

### 储值卡

- 只允许提交 `targetPrincipalBalanceJpy`；
- `targetPrincipalBalanceJpy` 必须是 0 至数据库安全整数上限内的整数，且不能等于申请时当前本金余额；
- `bonusBalanceJpy` 不参与人工纠正，也不会随申请变化；
- 方案的开卡金额上下限只约束首次开卡，不用于阻止经客户明确同意的后续人工纠正。

### 次数卡

- 只允许提交 `targetRemainingUses`；
- `targetRemainingUses` 必须是非负整数，且不能等于申请时当前剩余次数；
- 客户同意时，用 `difference = targetRemainingUses - beforeRemainingUses` 计算差值，并把 `totalUses` 同步增加该差值，从而保留“已使用次数 = totalUses - remainingUses”不变；
- 事务必须保证调整后的 `totalUses` 不小于既有已使用次数。

### 通用限制

- 仅 `ACTIVE`、未冻结、未作废且未到期的会员卡可申请；所属会员关系也必须有效；
- 权益卡、历史缺少正式归属的卡、已删除卡不支持；
- 请求体只接受与卡类型相匹配的一种目标字段；
- 店铺不能在请求中提供店铺 ID、客户 ID、申请前值或卡片版本，这些全部由后端根据 JWT 店铺范围和数据库状态生成。

## 6. 创建申请

正式接口：

`POST /api/v1/merchant-admin/shop-membership-cards/:cardPublicId/adjustment-requests`

请求示例：

```json
{
  "targetPrincipalBalanceJpy": 12000,
  "targetRemainingUses": null,
  "reason": "核对线下收款记录后修正卡内本金",
  "idempotencyKey": "uuid-or-client-generated-key"
}
```

服务依次验证店铺身份、权限、当前店铺卡片、卡状态、卡类型、目标值和待处理唯一性。仓储在一个 Prisma 事务内：

1. 再次读取卡片最新状态，并记录其 `lockVersion`；
2. 确认没有待处理申请；
3. 保存申请前快照、目标值、卡片版本和精确到期时间；
4. 写入 `merchant.shop_membership_card.adjustment.request` 审计日志；
5. 为卡片所属客户写入 `SYSTEM` 站内通知。

同一幂等键与相同规范化请求重放时返回同一申请，不重复写审计和通知；同键不同请求返回 409。数据库唯一约束负责阻止并发创建两条待处理申请。

创建申请绝不修改会员卡、店铺钱包、客户 NDP 钱包或任何账本。

## 7. 客户决定

正式接口：

`POST /api/v1/customer-profile/me/shop-membership-card-adjustment-requests/:publicId/decision`

请求体：

```json
{
  "decision": "approve",
  "idempotencyKey": "uuid-or-client-generated-key"
}
```

客户身份从 JWT 及 CustomerProfile 解析，不能由客户端指定。服务只允许卡片所属客户读取和决定申请。

同意时，在一个数据库事务中按固定顺序读取申请和卡片，并以状态、`lockVersion` 和申请前快照作为条件更新（compare-and-swap），完成：

1. 校验申请仍为 `PENDING` 且未到期；
2. 校验卡片仍有效；
3. 比较 `lockVersion`、卡片类型及申请前本金/次数快照；
4. 若任一快照不一致，把申请更新为 `INVALIDATED`，不覆盖卡片，并通知双方由店铺重新提交；
5. 若一致，把目标值写入卡片并递增 `lockVersion`；
6. 把申请更新为 `APPROVED` 并清空 `pendingKey`；
7. 写入客户同意审计和店铺站内通知。

拒绝时只把申请更新为 `REJECTED`、清空 `pendingKey`，写入审计并通知店铺，不修改卡片。撤回、过期和失效也必须清空 `pendingKey`。

决定幂等键与决定内容共同形成指纹：相同请求重放返回同一最终结果；同键不同决定返回 409。并发同意、同意与过期、同意与撤回只能有一个状态转换成功。

## 8. 店铺撤回

正式接口：

`POST /api/v1/merchant-admin/shop-membership-card-adjustment-requests/:publicId/cancel`

仅当前店铺且拥有调整权限的人员可撤回仍为 `PENDING`、未过期的申请。撤回写入 `merchant.shop_membership_card.adjustment.cancel` 审计并通知客户；卡片不发生变化。已决定或已到期申请不能撤回。

## 9. 查询 API

商家端分页列表：

`GET /api/v1/merchant-admin/shop-membership-card-adjustment-requests?page=1&page_size=20&status=pending&cardPublicId=...`

用户端分页列表：

`GET /api/v1/customer-profile/me/shop-membership-card-adjustment-requests?page=1&page_size=20&status=pending`

现有会员卡详情返回一个安全的当前待处理申请摘要，便于用户从个人中心直接看见确认入口。返回内容包括：

- 申请公开 ID、状态、创建时间、到期时间和服务端计算的剩余秒数；
- 店铺、会员卡和卡方案的安全公开信息；
- 调整维度、申请前值、目标值和差值；
- 店铺填写的原因；
- 决定、撤回、过期或失效时间。

内部 ID、完整卡号、幂等键、指纹和内部审计 metadata 不对外返回。所有列表必须分页，并按当前店铺或当前客户强制隔离。

## 10. RBAC 与身份范围

新增权限 `shop.member.card.adjust.request`：

- 与现有正式开卡权限保持一致，默认授予角色代码 `admin` 和 `merchant_owner`；
- 不默认授予 `merchant_staff`，可由店铺角色管理按需授权；
- 创建、查询商家列表和撤回都执行 JWT、权限与服务层 shop scope 三重校验；
- 跨店卡片或申请统一按找不到处理，防止枚举。

客户决定接口不使用店铺权限，而是严格校验当前客户就是卡片所属会员。前端隐藏按钮不能替代服务端鉴权。

## 11. 审计与通知

审计动作：

- `merchant.shop_membership_card.adjustment.request`；
- `merchant.shop_membership_card.adjustment.cancel`；
- `customer.shop_membership_card.adjustment.approve`；
- `customer.shop_membership_card.adjustment.reject`；
- `system.shop_membership_card.adjustment.expire`；
- `system.shop_membership_card.adjustment.invalidate`。

metadata 保存公开标识、调整维度、申请前值、目标值、原因、卡片版本和状态时间，不保存完整卡号或敏感认证信息。

通知使用 i18n key，覆盖申请待确认、店铺撤回、客户同意、客户拒绝、申请过期和申请失效。通知 payload 只携带安全公开标识及深链目标。客户收到申请通知后进入会员卡详情决定；店铺在客户决定后收到结果通知。

申请、同意、拒绝、撤回及其对应审计和通知必须与状态转换处于同一事务，避免出现“卡已改但申请未完成”或“已通知但事务失败”。

## 12. 商家端交互

已发会员卡的详情/操作区新增 `申请调整 TEST`：

- 弹层先展示客户、卡类型和当前正式值；
- 根据卡类型只显示“调整后本金”或“调整后剩余次数”；
- 实时展示“当前值 → 目标值”和增加/减少差值；
- 原因必填，并明确提示“提交后不会立即修改，客户须在 72 小时内同意”；
- 有待处理申请时禁用重复提交，展示剩余时间、申请内容和撤回入口；
- 历史区域显示最终状态和时间，不把过期或拒绝误写成已修改。

无权限时不显示申请与撤回按钮。前端校验只用于交互提示，后端规则仍是最终权威。

## 13. 用户端交互

个人中心的会员入口继续按店铺展示客户拥有的会员卡。存在待处理申请时：

- 店铺卡片显示醒目的“待你确认”状态及剩余时间；
- 会员卡详情顶部显示确认卡片，包含店铺、卡号尾号、申请原因、申请前值、目标值、差值和精确到期时间；
- 提供“同意修改”和“拒绝修改”两个清晰动作，并在最终提交前二次确认；
- 同意成功后刷新卡片真实余额/次数；拒绝、过期、撤回或失效后展示对应只读结果；
- 倒计时仅作视觉提示，服务端 `expiresAt` 始终是决定是否超时的唯一依据；
- 通知深链进入该会员卡详情，而不是把授权动作仅藏在通知列表中。

界面保持现有暗色移动端设计、可滚动、可键盘操作，并在会员入口、调整入口和确认卡片上显示 `TEST` 角标。新增文案补齐现有全部语言资源。

## 14. 错误契约

使用稳定的业务错误键并由统一错误处理中间件映射，不返回原生异常。至少覆盖：

- 卡片或申请不存在；
- 卡类型、状态或目标值不允许；
- 目标值与当前值相同；
- 已存在待处理申请；
- 申请已决定、已撤回或已过期；
- 卡片快照冲突导致申请失效；
- 幂等键与请求内容冲突；
- 当前身份无权限或不是卡片所属客户。

## 15. 明确不做

- 不做充值、核销、退款；
- 不自动增加金额、次数或 NDP；
- 不调整奖励余额；
- 不扣店铺钱包，不写 NDP 或财务账本；
- 不为权益卡调整礼物、折扣或其他权益；
- 不修改卡片有效期、卡状态或卡方案版本；
- 不在 72 小时后自动同意；
- 不部署或推送线上。

## 16. 验收

- migration 验证枚举、字段、外键、索引、待处理唯一约束和卡片 `lockVersion`；
- Service 单元测试覆盖两类卡、目标值、原因、状态、权限、跨店、幂等、撤回和快照冲突；
- 时间测试覆盖 72 小时前一刻可决定、到达期限立即过期、重复扫描不重复写入；
- 路由集成测试覆盖 JWT、RBAC、客户归属、Zod、分页及统一响应；
- 真实数据库测试覆盖并发双击同意、同意与过期竞争、同意与撤回竞争、事务失败回滚；
- 真实数据库验收证明只有客户同意会改变本金或次数，且 NDP 钱包、店铺钱包及相关账本前后均不变；
- 前端组件测试覆盖权限、按卡类型表单、差值展示、72 小时提示、同意/拒绝及全部终态；
- lint、相关测试和 build 通过；
- 本地 440×956 窄屏浏览器检查商家申请和用户确认全链路、滚动、溢出、错误态及控制台。
