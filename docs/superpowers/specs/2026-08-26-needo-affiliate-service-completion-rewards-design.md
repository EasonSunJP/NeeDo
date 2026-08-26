# NeeDo 联盟营销正式化设计

## 1. 背景与根因

运营后台原 `/admin/afirieito` 曾挂载浏览器本地状态驱动的完整 CPS 工作区。正式数据化过程中，该路由被替换成单一能力门禁页，导致完整页面、子导航与业务流程从运营界面消失。

本设计不恢复旧的本地 GMV、佣金、钱包和结算种子数据，也不保留独立 NDA（NeeDoAfirieito）平台。NeeDo 将把联盟营销正式收口到现有商户、店铺、用户和运营体系中，用真实 MySQL、正式 API、钱包账本、订单状态机、RBAC 和审计日志驱动。

## 2. 已确认产品决策

- 放弃独立 NDA PC 平台及其独立后台。
- 商户 PC 后台和店铺端都可以发布联盟营销任务。
- 商户集团账号可以选择旗下一个或多个店铺；单店账号只能选择当前店铺。
- 所有已登录且状态正常的 NeeDo 用户均可从统一联盟营销前端领取任务。
- 任务类型只保留“服务完成返点”，删除“预约返点”。
- 领取成功后，为“领取用户 × 任务”生成唯一专属优惠码和签名 URL。
- 专属码同时承担归因和顾客优惠；顾客优惠与领取者返点分开核算。
- 领取者返点仅支持每笔符合条件的完成订单固定 NDP，不支持按订单金额百分比返点。
- 保存草稿不冻结资金；点击“提交发布”时，发布者钱包必须有不少于任务总预算的可用 NDP，提交成功后立即全额冻结并进入待审核。
- 预约、确认、到店或服务中只记录归因，不产生返点。订单正式进入 `COMPLETED` 后才结算。
- 取消、拒单、未履约不结算；任务结束、取消或审核拒绝时解冻未使用预算。
- 运营后台 Afirieito 用于查看和管理联盟任务、发布者、领取者、优惠码、链接、归因、返点、预算、风控、审计和导出。

## 3. 参考产品原则

信息架构参考巨量星图当前官方产品中的需求方项目/任务管理、任务状态筛选、投后数据，以及承接方任务大厅、我的任务、履约和收益管理。NeeDo 不复制巨量星图品牌、颜色、文案、创作者报价或内容交付模型，而是把核心链路改造成适用于本地生活服务的：

```text
商户/店铺发布任务
→ NeeDo 用户领取
→ 生成专属优惠码和 URL
→ 顾客预约目标店铺服务
→ 记录唯一归因
→ 服务完成
→ 从冻结预算结算固定 NDP 返点
```

官方参考：

- 巨量星图官网：https://www.xingtu.cn/
- 客户旅程与项目下单：https://www.xingtu.cn/help-center/demander/132080
- 达人入驻、接单和财务流程：https://www.xingtu.cn/help-center/author/109194
- 个体达人/MCN 达人结算：https://www.xingtu.cn/help-center/author/109200

## 4. 单一领域与三端边界

联盟营销只实现一套后端领域和一套前端视图模型，不维护 NDA、演示版、运营版、商户版之间相互复制的业务逻辑。

| 入口 | 角色 | 主要职责 |
|---|---|---|
| 商户 PC 后台 | 商户集团及授权管理者 | 多店任务发布、预算、任务管理、领取和效果数据 |
| 店铺端 | 当前店铺身份 | 单店任务发布、暂停、预算进度和完成订单 |
| 联盟营销前端 | 所有正常 NeeDo 用户 | 任务大厅、领取任务、专属码/URL、数据和收益 |
| 运营后台 Afirieito | 平台运营、财务、风控 | 审核、全平台数据、预算、归因、返点、冲正、审计和导出 |

旧 `/NDA-admin*`、`/afirieito-admin*`、`/CPS-admin*`、`/cps-admin*` 和 `/business-admin*` 不再承载独立产品。兼容入口统一重定向到运营后台登录并携带 `/admin/afirieito` 目标路径。旧独立后台组件在正式三端通过验收后删除。

用户侧保留现有 `/afirieito` 路由兼容历史深链，页面名称统一显示“联盟营销”。

## 5. 页面信息架构

### 5.1 商户 PC 后台

一级入口名称为“联盟营销”，位于商户后台经营能力区。

- 联盟营销总览
  - 活跃任务
  - 已冻结预算
  - 已结算返点
  - 剩余预算
  - 领取人数
  - 归因预约数
  - 完成服务数
  - 完成转化率
- 任务管理
  - 全部、草稿、待审核、待开始、进行中、已暂停、预算耗尽、已结束、已取消、已拒绝
  - 服务端分页、关键词、店铺、服务、日期和状态筛选
- 发布任务向导
  - 基础信息
  - 店铺和服务范围；服务可选“全部当前服务”或“指定服务”
  - 固定返点与总预算
  - 顾客优惠
  - 时间和归因规则
  - 确认冻结预算并提交
- 任务详情
  - 状态时间线
  - 预算进度
  - 领取者
  - 专属码和 URL
  - 归因订单
  - 完成订单与返点
  - 风险和审核记录

### 5.2 店铺端

店铺端使用与商户 PC 相同的任务合同，但页面采用移动优先的精简操作布局，不另写一套业务规则。

- 我的联盟任务
- 快速发布任务
- 任务详情与状态
- 当前店铺预算进度
- 领取人数、归因预约和完成订单
- 暂停、继续、提前结束
- 返点记录

店铺端不能选择其他店铺，也不能读取集团内其他店铺的数据。

### 5.3 联盟营销前端

- 任务大厅
  - 推荐、最新、即将结束、高返点
  - 店铺、地区、服务类别和关键词筛选
- 任务详情
  - 店铺和服务
  - 每单固定返点
  - 顾客优惠
  - 有效期、归因规则、预算状态和推广要求
- 领取确认
  - 规则确认
  - 禁止自我归因说明
  - 成功后立即显示专属优惠码和 URL
- 我的任务
  - 推广中、已暂停、已结束
- 推广工具
  - 复制优惠码
  - 复制签名 URL
  - 分享入口
- 数据
  - 链接访问
  - 使用优惠码
  - 归因预约
  - 服务完成
  - 有效返点
- 收益
  - 待结算、已结算、已冲正
  - 钱包账本入口

### 5.4 运营后台 Afirieito

恢复完整 Afirieito 一级导航，不再只显示“能力状态”。

- 数据总览
- 任务审核与任务管理
- 发布商户与店铺
- 领取用户
- 优惠码与推广链接
- 归因订单
- 返点与预算
- 冲正与财务对账
- 风险事件
- 审计日志
- CSV 导出

运营后台不创建浏览器本地记录。所有筛选、分页、聚合和导出来自服务端。

## 6. 视觉与交互方向

- 保留 NeeDo 当前 React、TSX、Vite、后台主题 token、移动端主题 token 和共享组件。
- PC 页面采用巨量星图式任务中心结构：顶部核心指标、状态 tabs、紧凑筛选条、任务表格和侧边详情抽屉。
- 联盟营销前端采用任务卡连续信息流，不使用运营后台的数据密度；任务卡突出店铺、服务、每单返点、顾客优惠、剩余预算状态和截止时间。
- 发布流程使用分步向导，最后一步明确展示“可用 NDP、将冻结 NDP、发布后可结算订单上限”。
- 所有金额明确区分 `JPY` 与 `NDP`，不混用“日元返点”和 NDP 余额文案。
- 用户可见文案补齐中文、日文和英文 i18n。

## 7. 数据模型

所有新表均包含 `id`、`createdAt`、`updatedAt`、`deletedAt`，所有关联字段建立索引，列表查询过滤软删除。

### 7.1 `AffiliateTask`

- 发布主体：`publisherType = merchant_account | shop`
- `publisherId`
- 名称、说明、封面 MediaAsset
- `rewardNdpPerCompletedOrder`
- `totalBudgetNdp`
- `reservedBudgetNdp`
- `allocatedBudgetNdp`
- `settledBudgetNdp`
- `releasedBudgetNdp`
- 顾客优惠类型：`none | fixed_jpy | percent`
- 固定优惠 JPY、优惠比例 BPS、百分比优惠上限 JPY
- 最低订单金额 JPY
- 领取开始/结束、任务开始/结束、归因有效天数
- 每个领取者最大有效完成订单数
- 每个顾客最大有效完成订单数
- 服务范围模式：`all_current_services | selected_services`
- 状态、审核人、审核时间、拒绝原因、版本号

### 7.2 范围表

- `AffiliateTaskShop`：任务允许的店铺。
- `AffiliateTaskService`：任务允许的服务快照。
- 选择 `all_current_services` 时，提交发布事务把所选店铺当时全部可发布服务显式写入 `AffiliateTaskService`；选择 `selected_services` 时只写入用户选择的服务。
- `AffiliateTaskService` 无记录不代表全量，任务提交时必须至少写入一个服务；后续新增服务不会自动进入旧任务。

### 7.3 `AffiliateClaim`

- 任务、领取用户
- 唯一公开优惠码
- 不可猜测的签名 URL token hash
- 状态、领取时间、失效时间
- 点击、优惠码使用、归因预约、完成订单和返点聚合缓存
- 唯一约束：同一用户同一任务只能有一个未删除 Claim

原始 URL token 只在生成时返回，数据库保存哈希和公开短链标识，不记录可直接伪造的签名材料。

### 7.4 `AffiliateTouch`

- Claim、任务、领取用户
- 匿名访问标识或已登录顾客用户 ID
- 来源：`url | code`
- 落地店铺、服务、发生时间、过期时间
- 请求指纹只保存风控需要的最小化哈希，不保存明文设备敏感数据

### 7.5 `AffiliateAttribution`

- Task、Claim、BookingOrder、领取用户、顾客用户、店铺、服务
- 归因来源和 Touch
- 归因时间、有效期快照
- 订单原价、顾客优惠、成交价快照
- 为该订单占用的固定返点 NDP 快照
- 状态：`attributed | qualified | settled | invalidated | reversed`
- 唯一约束：一笔 BookingOrder 最多一个有效 Attribution

### 7.6 `AffiliateReward`

- Attribution、Task、Claim、BookingOrder
- 发布者钱包、领取者用户钱包
- 固定返点 NDP 快照
- 状态：`pending | settled | reversed | reversal_pending`
- 应冲正、已追回和待追回 NDP
- 结算和冲正 LedgerTransaction
- 结算、冲正时间和原因
- 唯一约束：一笔 Attribution 最多一个未删除 Reward

### 7.7 `AffiliateBudgetReservation`

- Task、发布者钱包
- 总冻结、订单已占用、已捕获、已解冻 NDP
- 状态：`active | exhausted | released`
- 冻结、捕获、解冻 LedgerTransaction
- 唯一 idempotency key

### 7.8 `AffiliateRiskEvent`

- 可选关联 Task、Claim、Attribution、Reward
- 风险规则码、主体类型与主体 ID
- 风险等级：`low | medium | high | critical`
- 状态：`open | reviewing | released | rejected`
- 证据 JSON、冻结 NDP、审核人、审核时间和处理原因
- 风险证据只允许追加和状态迁移，不允许物理删除或覆盖原始证据

### 7.9 钱包扩展

`WalletOwnerType` 增加 `MERCHANT_ACCOUNT`：

- 商户集团发布的任务从 MerchantAccount NDP 钱包冻结。
- 单店发布的任务从 Shop NDP 钱包冻结。
- 所有领取用户的返点进入 User NDP 钱包。

现有 `Wallet`、`WalletLedger`、`LedgerTransaction`、`FinanceReconciliation` 和 `AuditLog` 继续作为资金与审计权威记录，不再创建第二套联盟钱包。

## 8. 状态机

### 8.1 任务

```text
DRAFT
  → PENDING_REVIEW  提交并全额冻结预算
  → SCHEDULED       运营审核通过但开始时间未到
  → ACTIVE          开始时间到达，或审核通过时已经到达开始时间
  → PAUSED          发布者或运营暂停
  → ACTIVE          符合条件时恢复
  → BUDGET_EXHAUSTED 未占用预算不足一笔固定返点
  → ENDED           到期或正常提前结束

PENDING_REVIEW → REJECTED  全额解冻
BUDGET_EXHAUSTED → ACTIVE  订单取消或冲正释放额度，且任务仍在有效期内
DRAFT/PENDING_REVIEW/SCHEDULED/ACTIVE/PAUSED/BUDGET_EXHAUSTED → CANCELLED  解冻未使用预算
```

已结算金额不可通过取消任务撤回。任务结束或取消只释放尚未被归因订单占用的预算；结束前已经形成的有效归因继续保留一笔固定返点额度，直到订单完成、取消或被正式判定无效。任务更新使用乐观锁版本号，修改预算、返点、店铺、服务或优惠规则时必须创建新版本；已经形成的订单使用原快照。

### 8.2 归因和返点

```text
Attribution: attributed
BookingOrder: PENDING / CONFIRMED / IN_SERVICE
  → 归因成立时占用一笔固定返点额度，但不向领取者结算

BookingOrder: COMPLETED
  → 校验归因、店铺、服务、Claim、顾客上限和领取者上限
  → Attribution: qualified
  → 捕获该订单已占用的固定返点预算
  → 领取者 User 钱包入账
  → Attribution/Reward: settled

BookingOrder: CANCELLED before completion
  → Attribution: invalidated
  → 释放该订单占用的返点额度；任务仍可接受归因时回到任务可用预算，否则解冻回发布者钱包
  → Reward 不创建或保持无效
```

订单归因使用 `taskId + bookingOrderId` 组成的额度占用幂等键，订单完成事件和返点结算使用同一业务组合生成独立幂等键。同一事件重复投递不会重复占用、扣减预算或入账。

### 8.3 完成后退款

完成后发生正式退款时：

- Attribution 进入 `reversed`。
- 创建不可变冲正 LedgerTransaction，并将相同 NDP 从领取者钱包退回发布者任务预算来源；任务仍在有效期且允许新归因时恢复为任务未占用预算，否则退回发布者钱包。
- 领取者可用余额足够时立即完成冲正。
- 可用余额不足时进入 `reversal_pending`，记录待追回金额并冻结领取者新的联盟收益，直到追回完成。
- 运营后台可查看但不能手工改写账本余额；人工处理只能通过受审计的冲正 Service。

## 9. 归因优先级与防滥用

- 顾客在结账明确输入有效优惠码时，优惠码优先于 URL Touch。
- 未输入优惠码时，使用归因有效期内最近一次有效 URL Touch。
- 一笔订单只能绑定一个任务和一个领取者。
- 领取者与 BookingOrder.customerUserId 相同时禁止返点和专属优惠。
- 发布任务的 MerchantAccount 所有者、目标 Shop 所有者是否领取不作为角色级禁止条件，但同一顾客自我归因始终禁止；运营可以通过风险规则限制同集团员工异常领取。
- 已过期、暂停、未占用预算不足一笔返点、店铺/服务不匹配的码和 URL 不产生新归因。
- Claim、优惠码和 URL 不因页面刷新重新生成。
- 归因创建时使用数据库事务和行锁占用一笔返点额度；完成时只能捕获该订单已占用额度，防止并发超支。
- 同一顾客、设备哈希、支付参考或异常集中完成订单触发风险事件，但风控只冻结待结算返点，不直接删除证据。

## 10. 顾客优惠规则

- `none`：仅归因，无订单优惠。
- `fixed_jpy`：订单固定减免 JPY，不得超过订单原价。
- `percent`：按 BPS 计算，必须设置单笔最高优惠 JPY。
- 发布者可设置最低订单金额。
- 优惠在 Booking 创建事务中校验并固化价格快照。
- 顾客优惠属于商户价格折让，不从联盟返点 NDP 冻结预算中扣除。
- 同一订单只允许一个联盟优惠码，不与其他排他优惠叠加；可叠加规则必须由正式定价合同明确返回。

## 11. API 设计

所有接口使用 `/api/v1/`、JSON、Zod、统一响应结构、OpenAPI、服务端分页、ISO 8601 时间和 RBAC。

### 11.1 商户与店铺发布端

- `GET /api/v1/merchant-admin/affiliate/tasks`
- `POST /api/v1/merchant-admin/affiliate/tasks`
- `GET /api/v1/merchant-admin/affiliate/tasks/:taskId`
- `PATCH /api/v1/merchant-admin/affiliate/tasks/:taskId`
- `POST /api/v1/merchant-admin/affiliate/tasks/:taskId/submit`
- `POST /api/v1/merchant-admin/affiliate/tasks/:taskId/pause`
- `POST /api/v1/merchant-admin/affiliate/tasks/:taskId/resume`
- `POST /api/v1/merchant-admin/affiliate/tasks/:taskId/end`
- `GET /api/v1/merchant-admin/affiliate/tasks/:taskId/claims`
- `GET /api/v1/merchant-admin/affiliate/tasks/:taskId/attributions`
- `GET /api/v1/merchant-admin/affiliate/tasks/:taskId/rewards`

店铺移动端复用同一 Service，并通过当前 Shop 身份强制缩小范围；路由使用现有 merchant portal API 约定，不允许请求体指定其他 shopId。

### 11.2 联盟营销领取端

- `GET /api/v1/affiliate/tasks`
- `GET /api/v1/affiliate/tasks/:taskId`
- `POST /api/v1/affiliate/tasks/:taskId/claims`
- `GET /api/v1/affiliate/claims`
- `GET /api/v1/affiliate/claims/:claimId`
- `GET /api/v1/affiliate/claims/:claimId/metrics`
- `GET /api/v1/affiliate/rewards`
- `GET /api/v1/affiliate/resolve/:publicToken`
- `POST /api/v1/affiliate/codes/validate`

领取接口从当前身份取 userId，不接受客户端指定领取者。

### 11.3 运营后台

- `GET /api/v1/backoffice/affiliate/dashboard`
- `GET /api/v1/backoffice/affiliate/tasks`
- `GET /api/v1/backoffice/affiliate/tasks/:taskId`
- `POST /api/v1/backoffice/affiliate/tasks/:taskId/approve`
- `POST /api/v1/backoffice/affiliate/tasks/:taskId/reject`
- `POST /api/v1/backoffice/affiliate/tasks/:taskId/suspend`
- `GET /api/v1/backoffice/affiliate/publishers`
- `GET /api/v1/backoffice/affiliate/claims`
- `GET /api/v1/backoffice/affiliate/attributions`
- `GET /api/v1/backoffice/affiliate/rewards`
- `GET /api/v1/backoffice/affiliate/reversals`
- `GET /api/v1/backoffice/affiliate/risks`
- `GET /api/v1/backoffice/affiliate/audit-logs`
- `GET /api/v1/backoffice/affiliate/exports/:dataset`

## 12. 权限设计

至少新增以下权限：

- `menu:affiliate`
- `page:affiliate-marketplace`
- `button:affiliate-claim`
- `menu:merchant-affiliate`
- `page:merchant-affiliate-task`
- `button:merchant-affiliate-task-create`
- `button:merchant-affiliate-task-submit`
- `button:merchant-affiliate-task-pause`
- `menu:backoffice-affiliate`
- `page:backoffice-affiliate`
- `button:backoffice-affiliate-review`
- `button:backoffice-affiliate-suspend`
- `button:backoffice-affiliate-reversal`
- `button:backoffice-affiliate-export`

商户集团范围来自 `MerchantShopMembership`，单店范围来自当前 Shop 身份。Controller 不接受任意作用域，Service 必须再次校验发布者钱包、店铺归属和服务归属。

## 13. 分层与事务边界

```text
Route
  → Controller     仅处理 req/res
  → Service        状态机、权限作用域、预算事务、归因、结算
  → Repository     Prisma 数据访问
  → MySQL
```

关键事务：

1. 提交发布：锁定发布者钱包 → 校验可用余额 → 固化店铺与服务范围快照 → 创建 BudgetReservation → available 减少、frozen 增加 → 任务进入待审核 → AuditLog。保存草稿不进入该事务，也不冻结资金。
2. 订单创建：解析码/URL → 锁定任务预算 → 校验任务范围和未占用余额 → 占用一笔固定返点额度 → 计算顾客优惠 → 创建 Booking 和 Attribution 快照。
3. 服务完成：锁定任务预算和钱包 → 幂等校验 → 捕获该订单已占用返点 → 发布者 frozen 减少 → 领取者 available 增加 → Reward、FinanceReconciliation、AuditLog。
4. 订单取消或归因失效：锁定 Attribution 和任务预算 → 释放订单占用额度 → 仍在接受归因的任务恢复可用预算，否则解冻回发布者钱包 → AuditLog。
5. 任务结束：锁定 BudgetReservation → 解冻未被订单占用的剩余预算 → 保留有效归因额度 → 更新任务状态 → AuditLog。
6. 退款冲正：锁定 Reward 和双方钱包 → 创建冲正或待追回记录 → 更新 Attribution/Reward → AuditLog。

任一写入失败必须完整回滚，不能只改任务状态而未同步钱包。

## 14. 错误与空状态

- 余额不足：返回稳定业务错误，不创建任务冻结记录。
- 任务未占用预算不足一笔返点：任务自动进入 `BUDGET_EXHAUSTED`，新订单不形成有效归因。
- 码无效、过期或范围不匹配：结账页解释原因，但仍允许用户移除优惠码继续普通预约。
- 正式 API 加载失败：保留完整页面骨架和重试，不回退浏览器种子数据。
- 没有任务、领取或返点：显示正式空状态，不生成示例指标。
- 权限或范围越权：统一返回 forbidden/not found，不泄露其他商户、店铺或用户数据。

## 15. 本地正式测试数据

- 增加仅限 local/staging、拒绝生产和远程数据库的联盟营销 seed。
- Seed 使用正式 MerchantAccount、Shop、Service、User、Wallet、BookingOrder 和联盟表。
- 覆盖多店商户任务、单店任务、无优惠、固定 JPY 优惠、百分比优惠、活跃/暂停/预算耗尽/结束任务。
- 覆盖多个领取账号、唯一优惠码/URL、有效和失效归因、完成结算、取消不结算、退款冲正。
- 不把 Seed 数字描述为真实运营业绩，不在生产 bundle 中写死账号或密码。

## 16. 实施拆分原则

该能力属于 Step 12 后台真实数据和 Step 11 NDP 账本的延伸，必须按独立微步骤完成，不一次性混改整个仓库：

1. ✅ 数据模型、migration、权限常量和领域纯状态机。
2. ✅ 任务发布、全额预算冻结和审核 API。
3. ✅ 领取、优惠码、签名 URL 和任务大厅 API。
4. ✅ Checkout 归因与顾客优惠价格快照。
5. ✅ 服务完成固定 NDP 返点。
6. 任务结束解冻和完成后退款冲正。
7. 商户 PC 完整任务 UI。
8. 店铺端发布和管理 UI。
9. 联盟营销前端完整 UI。
10. 运营后台 Afirieito 完整 UI、聚合与导出。
11. 本地正式 Seed、全量验证和逐页 UI 验收。

每个微步骤必须先写失败测试，完成后通过对应单元测试、集成测试、lint 和 build，才能进入下一步。运营后台路由只在正式合同和完整 UI 通过验收后从能力门禁切换，避免半真半假的页面上线。

截至 2026-08-26，第 4 个微步骤已接入正式 Booking 事务：优惠码优先于签名 URL，创建订单时同步验证 Claim、任务、店铺/服务范围、最低订单金额和未占用预算，保存原价/顾客优惠/实付价格快照及唯一 Attribution。并发最后一份预算和最后一个排班时段只能成功一笔；服务完成前取消会在同一订单状态事务内失效归因并释放占用额度。该微步骤不改变钱包余额，也不提前创建 `AffiliateReward`。

同日第 5 个微步骤已完成：订单从 `IN_SERVICE` 进入 `COMPLETED` 时，在同一个订单事务中把 Attribution 固定返点快照从发布者 frozen NDP 捕获到领取者 User available NDP，写入 Reward、双边 WalletLedger、FinanceReconciliation、AffiliateBudgetTransaction、AffiliateRewardTransaction 和审计。重复与并发完成保持幂等；领取者/顾客完成上限只失效归因并释放额度；冻结余额不足会回滚订单完成和全部联盟写入。

本地正式 MySQL 验收命令：

```bash
ENV_FILE=.env.dev npm --prefix backend run check:affiliate-checkout-attribution-flow
ENV_FILE=.env.dev npm --prefix backend run check:affiliate-service-completion-reward-flow
```

第 6 个微步骤及后续 UI 仍未实现，继续保持能力门禁。

## 17. 验收标准

- 独立 NDA 入口不再形成第四套产品。
- 商户集团可为旗下一个或多个店铺发布任务，单店账号不能越权选择其他店铺。
- 任务提交时全额冻结正确发布者钱包，余额不足时无任何部分写入。
- 所有正常 NeeDo 用户可以领取有效任务，每人每任务只有一个有效 Claim。
- 专属码和 URL 唯一、可解析、不可由客户端伪造领取者身份。
- 顾客优惠在订单中形成正式价格快照，不从返点预算扣除。
- 预约、确认、服务中均不结算；只有 `COMPLETED` 触发固定 NDP 返点。
- 重复完成事件不重复返点；并发完成订单不能超出总预算。
- 取消不结算并释放订单占用额度；任务结束解冻未占用预算且保留既有有效归因额度；完成后退款形成正式冲正或待追回记录。
- 商户 PC、店铺端、联盟营销前端和运营后台读取同一正式数据源。
- 运营后台完整显示任务、发布者、领取者、码/链接、归因、返点、预算、风控和审计。
- 正式页面没有 localStorage 业务状态、假 GMV、假 ROI、假佣金或假结算记录。
- 中文、日文、英文 i18n 完整。
- 前后端单元测试、API 集成测试、权限测试、OpenAPI 测试、migration 检查、lint 和 build 通过。
- 在 `127.0.0.1:5180` 使用商户集团、单店、普通用户和运营账号逐页验收全部字段、状态和资金变化。

## 18. 非目标

- 不建设独立 NDA 品牌、账号体系、钱包或后台。
- 不接入外部广告平台、社交媒体创作者市场或第三方联盟网络。
- 不支持按订单金额比例返点。
- 不支持预约即返点。
- 不使用浏览器存储作为正式任务、归因、返点或结算数据源。
- 不在本轮实现现金或银行卡自动打款；领取者收益进入现有 NDP 钱包。
