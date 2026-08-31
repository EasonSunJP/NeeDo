# NeeDo 店铺会员卡规则、发卡与 NDP 返点设计

## 1. 目标与边界

本设计把现有店铺会员基础层扩展为可配置、可发卡、可执行、可审计的正式会员卡系统。店铺可以创建会员卡方案，配置不同消费场景下的 NDP 返点规则，向客户发放带初始金额或次数的卡，并让后续订单、人工调整和通知严格对应发卡时的规则版本。

本设计锁定以下产品原则：

- 会员规则不修改订单价格，不提供折扣、会员价、优惠券、免费服务、实物或赠送次数。
- 所有规则奖励只能是 NDP；每笔客户 NDP 返点都会额外产生平台服务费。
- 当前默认平台费率为客户返点的 `10%`，由运营后台配置，并在店铺发布规则时明确展示。
- 店铺配置或发布规则时不冻结 NDP。服务正式完成时才从店铺钱包扣除客户返点与平台费。
- 店铺余额不足不阻止服务完单；返点进入待发放，记录店铺欠付，店铺充值后按时间顺序自动补发，平台不垫付。
- 发卡可录入线下已付款或历史补录的初始金额、初始次数，发卡后直接生效。
- 规则不会自动增加卡内金额或次数。只有店铺人工变更且客户确认后，才允许修改余额、次数、有效期或既有卡规则。
- 已发卡绑定不可变规则版本。修改方案只影响新版本和以后发出的卡，不追溯覆盖老卡。
- 开卡、返点执行、客户确认调整、充值、核销和退款继续按独立微步骤交付。

Square 等成熟忠诚度产品支持按到店、消费金额、指定商品或分类累计奖励，并提供多档奖励、排除项和有效期。本设计借鉴其“类型化规则＋清晰适用范围”的思路，但 NeeDo 只输出 NDP，不复制折扣或免费商品能力。

参考：

- https://squareup.com/help/us/en/article/3952-create-a-loyalty-program-with-square
- https://developer.squareup.com/docs/loyalty/overview
- https://developers.line.biz/ja/docs/line-mini-app/demo/membership-demo/

## 2. 分步交付

### 微步骤 A：会员卡方案与规则配置

- 运营后台配置会员返点平台费率。
- 店铺创建、编辑、试算、发布和停用会员卡方案。
- 规则使用正式类型目录和强校验参数。
- 发布时生成不可变版本并锁定平台费率。
- 不发卡、不扣钱包、不产生客户返点。

### 微步骤 B：正式发卡

- 店铺从已发布方案向当前店铺有效会员发卡。
- 录入线下付款或历史补录来源、初始金额／次数、有效期和说明。
- 发卡写入方案版本快照、操作人和审计。
- 不执行充值、核销或退款。

### 微步骤 C：订单规则执行与 NDP 结算

- 订单保存适用会员卡和规则版本快照。
- 完单时服务端计算规则命中、客户返点、平台费和店铺总成本。
- 店铺余额充足时原子结算；不足时创建待发放欠付。
- 店铺后续充值按 FIFO 自动补发。
- 实际退款冲正保留给独立退款微步骤，但本步必须保存可冲正的完整来源关系。

### 微步骤 D：客户确认的卡片变更

- 店铺提交金额、次数、有效期或规则版本变更申请。
- 客户收到站内通知并查看变更前后差异。
- 客户同意后事务生效；拒绝、取消、过期均不改变卡。
- 所有申请、响应和最终变更写入审计。

### 后续独立微步骤

- 储值充值。
- 次卡／储值卡核销。
- 退款与 NDP 返点冲正。
- 风控、批量导入、报表和导出。

## 3. 核心领域模型

### 3.1 `MembershipRewardFeePolicyVersion`

运营平台费率使用只增不改的版本表：

```text
id / publicId
versionNumber
feeRateBps
status               ACTIVE | SUPERSEDED
effectiveAt
note
createdById
createdAt / updatedAt / deletedAt
```

- `feeRateBps` 为 `0..10000` 的安全整数，`1000` 表示 `10%`；系统初始版本为 `1000 bps`。
- 同一时间只允许一条已生效的 `ACTIVE` 版本。新版本生效后，旧版本只改为 `SUPERSEDED`，费率、创建人和说明不可改写。
- 发布方案时按服务端时间读取已生效版本，并把 `feeRateBps` 写入方案版本快照；历史方案和已发卡不跟随费率变化。

### 3.2 `ShopMembershipCardPlan`

店铺级会员卡方案：

```text
id / publicId
shopId
status              DRAFT | ACTIVE | RETIRED
currentVersionId    nullable，指向当前已发布版本
draftVersionId      nullable，指向唯一可编辑草稿
createdById / updatedById
createdAt / updatedAt / deletedAt
```

约束：

- 方案严格限定当前 `shopId`。
- 删除为软删除；已存在发卡记录的方案只能停用，不能物理删除。
- 每个方案最多保留一个可编辑草稿；草稿也使用正式版本和规则表持久化，不保存为前端 JSON 或 localStorage。
- 发布和更新使用乐观版本，拒绝静默覆盖并发编辑。

### 3.3 `ShopMembershipCardPlanVersion`

草稿可编辑，发布后不可变：

```text
id / publicId
planId
versionNumber
nameSnapshot
descriptionSnapshot
cardType             STORED_VALUE | COUNT | BENEFIT
validityMode         NEVER | FIXED_DAYS | FIXED_DATE
validityValue        nullable
platformFeeRateBps   default 1000
status               DRAFT | PUBLISHED | RETIRED
publishedById / publishedAt
createdAt / updatedAt / deletedAt
```

`platformFeeRateBps=1000` 表示 `10%`。草稿发布时读取当前运营费率并写入快照；发布完成后，版本正文、规则和费率都禁止原地修改。再次编辑从当前发布版本复制出下一版本草稿，运营费率改变后，旧版本和已发卡不追溯变化。

### 3.4 `ShopMembershipRewardRule`

每条规则属于一个方案版本；仅所属版本为 `DRAFT` 时可编辑：

```text
id / publicId
planVersionId
kind
ruleGroup            BASE | BONUS | LIMIT | EXCLUSION
config               JSON
sortOrder
createdAt / updatedAt / deletedAt
```

`config` 不是任意脚本。每个 `kind` 都有独立 TypeScript 类型、Zod strict schema、OpenAPI discriminator、服务端 evaluator 和测试。禁止 `eval`、表达式字符串或前端自算财务结果。

### 3.5 `ShopMembershipCard`

在现有表上增加：

```text
planId / planVersionId
issuedById
issuanceSource       OFFLINE_PAID | HISTORICAL_REPLACEMENT | MANUAL_GRANT
issuanceReference    nullable
issuanceNote         nullable
initialPrincipalJpy  nullable
initialUses          nullable
platformFeeRateBpsSnapshot
```

发卡后现有 `principalBalanceJpy`、`remainingUses` 和 `totalUses` 使用发卡输入初始化。储值卡的次数字段必须为空；次卡的金额字段必须为空；权益卡两类值均为空，权益卡只承载 NDP 返点规则，不承载礼物、免费服务、折扣或隐藏金额。

### 3.6 `ShopMembershipRewardSettlement`

订单返点事实：

```text
id / publicId
shopId / customerProfileId
membershipId / cardId / planVersionId
bookingOrderId
status               PENDING | PAID | REVERSED | VOID
eligibleAmountJpy
customerRewardNdp
platformFeeRateBps
platformFeeNdp
totalShopDebitNdp
shopWalletId / customerWalletId / platformWalletId
ledgerTransactionId  nullable
idempotencyKey        unique
paidAt / reversedAt
createdAt / updatedAt / deletedAt
```

### 3.7 `ShopMembershipRewardRuleHit`

保存每个命中规则的计算依据和结果，用于解释、审计和冲正：

```text
id
settlementId / ruleId
ruleKind
basisSnapshot
rewardNdp
createdAt / updatedAt / deletedAt
```

### 3.8 `ShopMembershipCardAdjustmentRequest`

人工变更申请：

```text
id / publicId
shopId / cardId / customerProfileId
status               PENDING_CUSTOMER | ACCEPTED | REJECTED | CANCELLED | EXPIRED
changeType           BALANCE | USES | EXPIRY | RULE_VERSION
beforeSnapshot / afterSnapshot
reason
requestedById / requestedAt
respondedAt / appliedAt
version
createdAt / updatedAt / deletedAt
```

同一卡片同一 `changeType` 同时只能存在一条待客户确认申请。

## 4. 类型化规则目录

### 4.1 基础返点：每个版本必须且只能选择一种

1. `FIXED_PER_COMPLETION`
   - 每笔符合条件的完成服务固定返 `rewardNdp`。
2. `PERCENT_OF_ELIGIBLE_AMOUNT`
   - `floor(eligibleAmountJpy × rewardRateBps / 10000)`。
3. `SPEND_BLOCK`
   - `floor(eligibleAmountJpy / blockAmountJpy) × rewardNdpPerBlock`。

### 4.2 可叠加 NDP 奖励

1. `FIRST_CARD_USE_BONUS`
   - 该卡第一次符合条件的完单返固定 NDP，只触发一次。
2. `SERVICE_SCOPE_BONUS`
   - 指定服务或分类返固定 NDP，或增加一个 NDP 返点率。
3. `COMPLETION_MILESTONE_BONUS`
   - 累计完成第 X 次服务返固定 NDP；可配置一次性里程碑或每 X 次重复。
4. `SPEND_MILESTONE_BONUS`
   - 累计符合条件金额达到 X 日元返固定 NDP；每个门槛只触发一次。
5. `BIRTHDAY_MONTH_BONUS`
   - 客户生日月的符合条件完单返固定 NDP；每个自然年有次数上限。
6. `SCHEDULE_WINDOW_BONUS`
   - 指定日期范围、星期或本地时间段返固定 NDP。
7. `CONSECUTIVE_MONTH_BONUS`
   - 连续 X 个自然月都有符合条件完单时返固定 NDP；同一周期只触发一次。

所有奖励输出只能是非负安全整数 NDP。禁止优惠价格、折扣率、免费项目、优惠券、实物、卡内金额或次数变更。

### 4.3 范围、排除和上限

- 适用店铺固定为方案所属店铺。
- 可选择全部服务、指定服务或服务分类。
- 可排除服务和分类；排除优先于奖励。
- 可设置单笔、每日、每月和卡片生命周期客户返点上限。
- 可设置规则生效时间和失效时间，但不得晚于卡片有效期。
- 基础返点与全部命中的 BONUS 叠加，再统一应用上限。
- 客户返点结果向下取整；平台费使用 `ceil(customerRewardNdp × feeRateBps / 10000)`。
- `customerRewardNdp=0` 时平台费为 0，不创建空账本交易。

## 5. 规则版本和订单快照

1. 店铺编辑草稿并通过服务端试算。
2. 发布时读取当前运营平台费率，生成不可变方案版本。
3. 发卡时卡片绑定该方案版本和平台费率快照。
4. 创建／确认预约时，服务端确定会员卡是否适用并保存卡片、方案版本和预计返点摘要；不冻结钱包。
5. 完单时重新校验订单事实，但只使用订单已锁定的规则版本，不读取店铺后来修改的方案。`eligibleAmountJpy` 必须来自服务端最终订单财务快照，排除平台费、NDP 支付部分、已取消项目和已退款金额，禁止接受前端传入的可返点金额。
6. 规则命中、客户返点、平台费和钱包变动在同一业务事务中写入。
7. 重复完单、并发事件和 worker 重放使用订单与卡片组成的幂等键，不重复返点。

规则试算只用于展示，不能预留余额或替代完单事务。

## 6. NDP 结算和余额不足

### 6.1 正常结算

店铺设置客户每次返 `1,000 NDP`，版本费率为 `10%`：

```text
客户返点       1,000 NDP
平台服务费       100 NDP
店铺总扣款     1,100 NDP
```

同一账本事务：

- 店铺 available 减少 `1,100`。
- 客户 available 增加 `1,000`。
- 平台 available 增加 `100`。
- Settlement、RuleHit、LedgerTransaction、双边/多边分录、FinanceReconciliation 和 AuditLog 同时成功或同时回滚。

### 6.2 余额不足

- 服务完成状态不回滚。
- 创建唯一 `PENDING` Settlement 和店铺欠付证据，不给客户或平台部分入账。
- 客户收到“返点待发放”通知，展示应得金额而非虚假可用余额。
- 店铺充值审批成功后，按 `createdAt + id` FIFO 锁定并补发完整 Settlement。
- 同一笔充值不能重复补发；并发充值、完单和 worker 使用一致钱包锁顺序。
- 平台不垫付；欠付不得静默过期或删除。

### 6.3 取消和退款

- 未完成或已取消订单不产生 Settlement。
- 已完成订单后续退款必须引用原 Settlement 和规则命中快照。
- 退款冲正作为独立微步骤实现；在该步骤上线前，会员返点相关退款能力保持明确禁用，不能只改订单状态而遗漏 NDP。

## 7. 页面与交互

### 7.1 商户端会员卡页

现有“会员卡”页增加二级切换：

- `已发会员卡`
- `卡方案`

不增加第六个顶层标签，避免移动端拥挤。

卡方案列表显示：

- 名称、类型、草稿／启用／停用状态。
- 当前版本和已发卡数量。
- 基础返点摘要和最多三个额外奖励摘要。
- 平台费率、示例客户返点、平台费和店铺总成本。
- 编辑草稿、复制、试算、发布、停用操作。

### 7.2 方案编辑器

采用移动端可用的分步编辑器：

1. `基本信息`：名称、说明、卡类型、有效期。
2. `发卡设置`：允许的初始金额／次数范围、线下来源说明要求。
3. `基础返点`：三种基础公式选择其一。
4. `额外奖励`：添加类型化奖励、服务范围、排除项和上限。
5. `成本试算`：输入示例订单金额、服务和日期，服务端返回逐条命中、客户返点、平台费和总成本。
6. `发布确认`：展示不可变版本、平台费率和变更影响，只允许 owner 发布。

规则卡只显示当前类型需要的字段；不提供表达式编辑器或 JSON 输入框。

### 7.3 发卡页

- 从当前店铺有效会员中选择客户。
- 选择已发布方案和版本。
- 按卡类型录入初始金额或次数、有效期、线下付款／历史补录来源和说明。
- 提交前展示完整规则摘要和平台费说明。
- 成功后进入卡详情，并向客户发送发卡通知。

### 7.4 客户端

- 会员详情展示店铺、卡状态、金额／次数、有效期和规则版本摘要。
- 展示“预计可获得 NDP”的规则说明，但不承诺未完成订单的可用余额。
- 展示已发放、待发放和已冲正返点记录。
- 人工变更申请展示变更前后差异、店铺原因、同意／拒绝按钮和截止时间。

### 7.5 运营后台

- 在正式费用规则页面新增 `membership_reward` 规则族。
- 配置平台费率、生效时间和说明。
- 显示版本、修改人和审计，不允许修改历史版本。
- 默认费率 `1000 bps`；生产修改需要独立 RBAC permission。

所有会员功能继续显示 `Test` 角标。

## 8. API 与权限

### 8.1 微步骤 A API

```text
GET    /api/v1/merchant-admin/shop-membership-card-plans
POST   /api/v1/merchant-admin/shop-membership-card-plans
GET    /api/v1/merchant-admin/shop-membership-card-plans/:publicId
PATCH  /api/v1/merchant-admin/shop-membership-card-plans/:publicId/draft
POST   /api/v1/merchant-admin/shop-membership-card-plans/:publicId/preview
POST   /api/v1/merchant-admin/shop-membership-card-plans/:publicId/publish
POST   /api/v1/merchant-admin/shop-membership-card-plans/:publicId/retire

GET    /api/v1/backoffice/membership-reward-fee-policy
POST   /api/v1/backoffice/membership-reward-fee-policy/versions
```

列表必须分页；所有 body/query/params 使用 Zod strict；OpenAPI 公开每种规则 discriminator 和参数。

### 8.2 后续 API

```text
POST   /api/v1/merchant-admin/shop-memberships/:publicId/cards
POST   /api/v1/merchant-admin/shop-membership-cards/:publicId/adjustment-requests
POST   /api/v1/customer-profile/me/shop-membership-card-adjustments/:publicId/accept
POST   /api/v1/customer-profile/me/shop-membership-card-adjustments/:publicId/reject
GET    /api/v1/customer-profile/me/shop-membership-rewards
```

### 8.3 RBAC

新增权限：

```text
shop.member.card_plan.view
shop.member.card_plan.manage
shop.member.card_plan.publish
shop.member.card.issue
shop.member.card.adjust
shop.member.reward.view
platform.membership_reward_fee.manage
```

- `merchant_owner` 默认拥有店铺卡方案管理、发布、发卡、调整和读取权限。
- `merchant_staff` 默认只读；以后可通过正式角色分配发卡／调整权限，不在前端硬编码。
- 平台费率仅 `admin` 的专用权限可管理。
- 客户只能读取本人卡、返点和变更申请，并只能响应属于本人的待确认申请。

## 9. 审计与通知

审计动作至少包括：

```text
merchant.shop_membership_card_plan.create
merchant.shop_membership_card_plan.publish
merchant.shop_membership_card_plan.retire
platform.membership_reward_fee.publish
merchant.shop_membership_card.issue
merchant.shop_membership_card_adjustment.request
customer.shop_membership_card_adjustment.accept
customer.shop_membership_card_adjustment.reject
membership.reward.pending
membership.reward.paid
membership.reward.reversed
```

审计元数据只保存 public ID、版本、规则摘要、金额和状态，不保存 token、密码、钱包敏感内部字段或完整客户隐私资料。

通知事件：发卡成功、返点已发放、返点待发放、待确认变更、变更已同意／拒绝／过期、返点冲正。通知由正式 Notification/Realtime 链路投递；失败不回滚已经成功的财务事务，但必须重试并可观测。

## 10. 错误与并发

- 401：登录失效。
- 403：身份或权限不符。
- 404：方案、版本、会员、卡或调整申请不属于当前作用域。
- 409：版本冲突、重复发布、重复发卡、重复响应、状态不允许或幂等冲突。
- 400：规则参数、范围、上限、卡类型字段或试算输入不合法。
- 店铺和客户接口均不得通过错误差异泄漏跨店或他人记录。
- 发布锁定方案行并递增版本号；并发发布只能成功一次。
- 完单结算锁定店铺钱包、订单财务事实和 Settlement；幂等重放不重复扣款。
- 余额不足只创建一次 PENDING；补发和新完单遵循统一锁顺序。
- 客户接受调整时校验申请 version、卡当前状态和 beforeSnapshot；过期或卡已变化返回 409，不盲写。

## 11. 测试与验收

### 11.1 规则和数据

- 每种 rule kind 的 Zod、OpenAPI 和 evaluator 单元测试。
- 百分比向下取整、平台费向上取整、零返点零费用、整数溢出和上限测试。
- 排除优先、范围限定、基础＋奖励叠加、单笔／周期／生命周期上限。
- 版本发布不可变、费率快照不追溯、跨店和软删除过滤。
- migration、索引、外键、唯一键和已应用 migration 安全。

### 11.2 财务和并发

- 充足余额的店铺、客户、平台三钱包守恒。
- 余额不足生成单一 PENDING，不部分入账。
- 充值后 FIFO 补发、并发充值／完单／worker 不重复。
- 重复完单幂等，规则修改后旧订单仍使用旧快照。
- 审计、对账和 RuleHit 与账本金额精确一致。
- 退款功能未实现前明确拒绝会员返点订单的假冲正路径。

### 11.3 前端

- 店铺卡方案列表、编辑器、规则字段切换、成本试算、发布确认和权限态。
- 运营费率页面、历史版本和审计展示。
- 发卡、客户规则摘要、返点状态和调整确认在对应微步骤分别验收。
- `Test` 角标、五语言、深浅主题、键盘焦点、390 px 与桌面无横向溢出。
- 迟到请求、失败重试、草稿保留、并发版本冲突和真实空态。

### 11.4 完成门禁

- 每个微步骤独立 migration、回滚点、专项测试和真实本地数据库验证。
- Prisma validate/generate、前后端 lint、全量 test、backend build 和正式 production build 全部通过。
- 浏览器使用正式测试身份验证 owner、只读 staff、客户自作用域、控制台和网络错误。
- 不新增 mock、localStorage 财务状态、前端权限绕过、直接余额修改或不可审计写入。

## 12. 最优页面方案结论

采用“卡方案列表＋分步规则编辑器＋服务端成本试算＋发布版本确认”的结构。规则使用类型化卡片，不采用可编程表达式。移动端在现有会员卡页内使用二级切换，不扩张顶层导航；桌面端复用同一信息架构并提高密度。该方案在店铺易用性、财务可解释性和未来订单行为扩展之间取得最稳妥的平衡。
