# 12 — 运营后台与商户后台真实数据接入

## 店铺前端五语言展示编辑

- 商户在原店铺展示页内编辑，不再进入新的全屏编辑页；编辑状态右侧提供日语、英语、韩语、简体中文、繁体中文切换。
- `GET /api/v1/merchant-admin/shop/presentation` 返回五个语言草稿以及当前店铺可引用的正式媒体与服务。
- `PUT /api/v1/merchant-admin/shop/presentation/locales/:locale` 只更新所选语言，使用 `expectedLockVersion` 防止覆盖并在事务内写入审计日志。
- `POST /api/v1/merchant-admin/shop/presentation/media` 接收 JPEG、PNG 或 WebP 原始字节，创建绑定当前店铺和商户身份的 `MediaAsset`；首页轮播图限制为 1–5 张。
- 服务套餐只本地化名称、说明、适用对象、标签、亮点和图片；价格、币种、时长及服务归属继续来自正式 `Service`。
- 公开 `GET /api/v1/shops/:id?locale=...` 按请求语言投影已保存的店铺、轮播图和服务展示文案，没有该语言记录时回退正式基础资料。

> 本文档用于指导 Codex 执行 Step 12。  
> 每次只执行本 Step，不要跨步骤开发。  
> 完成后必须通过验收，再进入下一 Step。

---

## 1. 阶段目标

让运营后台和商户后台从真实 API 读取用户、店铺、技师、订单、排班、账本数据，具备基础管理和对账能力。

---

## 2. 必须先读

- `README.md`
- `AGENTS.md`
- `docs/11_NDP_LEDGER_FINANCE_RECONCILIATION.md`

---

## 3. 本步必须做

- 运营后台 Dashboard 接真实指标。
- 商户后台订单中心接真实订单。
- 调度中心读取真实排班与 Booking。
- 财务结算读取 ledger。
- 技师/店铺管理接真实用户身份。
- 所有后台操作受 RBAC 控制。
- 增加导出 CSV/Excel 基础能力。

---

## 4. 本步禁止做

- 不要重做后台 UI。
- 不要新增 fake dashboard data。
- 不要做 IM/Social 实时化。
- 不要做大规模压测。

---

## 5. 交付物

- admin dashboard APIs
- merchant admin APIs
- 前端后台 API adapters
- 后台权限点补齐
- 导出接口
- `tests/backoffice*.test.ts`
- `docs/backoffice-real-data.md`

---

## 6. 验收标准

- [x] 运营后台关键指标来自真实数据库。
- [x] 商户后台能看真实订单/排班/账本。
- [x] 无权限用户不能访问管理操作。
- [x] 导出数据与数据库一致。
- [x] 旧 mock 后台数据不再用于已接入页面。

---

## 7. 给 Codex 的命令

```text
请阅读 README.md、AGENTS.md、docs/12_BACKOFFICE_MERCHANT_ADMIN_REAL_DATA.md。本次只执行 Step 12：运营后台与商户后台真实数据接入。请让运营后台和商户后台的 Dashboard、订单中心、调度中心、财务结算、技师/店铺管理逐步接真实 API 和真实数据库。所有后台操作必须受 RBAC 控制，并补齐审计日志。不要重做后台 UI，不要新增 fake dashboard data，不要做 IM/Social 实时化和压测。完成后运行 lint、test、build，并更新 docs/backoffice-real-data.md。
```

---

## 8. 完成后必须回复的内容

Codex 完成本步后，必须输出：

1. 本次修改的文件清单。
2. 新增或修改的接口清单。
3. 新增或修改的数据表 / migration 清单。
4. 运行过的命令和结果。
5. 已通过的验收项。
6. 未完成项与原因。

若某项没有完成，必须明确说明，不得假装完成。

## 9. 2026-08-25 完成记录

- 运营后台 Dashboard、订单、排班、财务、店铺、技师和用户管理均使用正式分页 API。
- 商户后台 Dashboard、订单、排班、财务、工资单、店铺设置和人员管理均使用当前 `shop` 身份范围的正式 API。
- 商户调度中心已移除正式路由对浏览器 dispatch store 的依赖，支持正式排班时段创建、阻塞/恢复和软删除；自动/智能排班在正式合同完成前保持生产保护状态。
- 订单、排班、人工收款、退款、财务规则、工资单和管理写操作由后端 RBAC、范围校验、事务和 AuditLog 保护。
- CSV 导出使用后端真实响应；模拟账号 XLSX 属于本地 seed 工具输出，不进入正式 API。
- 本轮未新增 schema 或 migration；复用了已经完成的 Step 10-13 数据表与接口。

验证结果：

- 前端：141 个测试文件、697 项测试通过；TypeScript lint 与 Vite production build 通过。
- 后端：50 个测试文件、198 项测试通过；ESLint 与 TypeScript build 通过。

## 10. 2026-08-26 技师榜单正式数据

运营后台入口：`/pf-admin.html#/admin/technicians?module=ranking`。

正式接口：

- `GET /api/v1/backoffice/technician-rankings`：分页读取聚合榜单。
- `GET /api/v1/backoffice/technician-rankings/export`：按相同条件导出 CSV，最多 5,000 行。

两个接口均要求 `backoffice:technicians:list` 权限，分别写入
`backoffice.technician_rankings.list` 与
`backoffice.technician_rankings.export` 审计记录。列表支持技师关键字、店铺、城市、
统计期间、指标、升降序和分页筛选；CSV 与当前筛选、排序、统计口径完全一致。

统计期间按 `Asia/Tokyo` 日历解释：

- 默认本月。
- 今日、近 7 天、近 30 天。
- 自定义起止日，起止日均包含在统计范围内。
- 历史累计。

指标口径：

- 已完成订单服务金额：仅统计状态为 `completed` 且未退款的订单，汇总正式
  `service_amount_jpy`；加钟后的最终服务金额计入原订单。
- 已完成订单数：按 Booking 主订单去重，同一订单内加钟仍只计 1 单。
- 工作天数：按订单完成时间转换为东京日期去重，当天至少完成 1 单计 1 天。
- 已软删除的账号、技师资料、订单和财务记录均不进入统计。

前端提供期间切换、自定义日期、技师/店铺/城市筛选、三指标排序、服务金额比例条、
服务端分页、CSV 导出和正式技师详情抽屉。本轮复用现有 Booking、OrderFinancial、
TechnicianProfile 与 Shop 数据，没有新增 schema 或 migration，也没有新增 mock 数据。

专项测试覆盖：期间边界与输入校验、东京日历换算、SQL 聚合口径、分页与汇总、RBAC、
审计、CSV、OpenAPI、前端 API adapter 和榜单页面接线。

## 11. 2026-08-29 店铺与员工工资结算周期

商户“门店设置”新增店铺默认工资结算周期；员工详细信息卡新增继承店铺规则或员工个人覆盖。两处均接正式数据库和 API，不读取浏览器 mock，也不接受客户端 `shopId`。

正式接口：

- `GET/PUT /api/v1/merchant-admin/payroll-schedule-policy`
- `GET/PUT /api/v1/merchant-admin/employees/:needoId/payroll-schedule-policy`

读取要求 `merchant-admin:payroll:read`，写入要求 `merchant-admin:payroll:write`。员工目标必须是当前 JWT 店铺的有效从属，path 只接受 canonical 技师 NeeDoID。更新店铺规则和员工覆盖分别写入 `merchant_admin.payroll_schedule_policy.update` 与 `merchant_admin.employee_payroll_schedule_override.update` 审计日志。

新增版本化表：

- `shop_payroll_schedule_policies`
- `technician_payroll_schedule_overrides`
- `business_calendar_dates`

Migration 为 `20260829123000_employee_payroll_schedule_policy`。日本日期固定使用 `Asia/Tokyo`，支持每日、每周、每月结算，以及法定节假日或周末时提前至前一个营业日、顺延至下一个营业日。2025–2027 官方节假日取自日本内阁府 CSV，migration 固定导入 54 条并记录来源版本。

本模块只计算并记录自然结算日和计划支付日。实际支付完成仍由财务人员在财务结算页手工登记；本次没有增加转账、薪资金额、分成编辑或支付状态变更。

本地 `needo_dev` 已在完整 SQL 备份后部署并通过专项 checker：`ready=true`、`officialJapanHolidayRows=54`、`issues=[]`。新规则表空表起步，不创建模拟默认值。

## 12. 2026-08-29 员工日程与跨店隐私投影

员工详细信息卡复用正式调度日历，提供日、周、月视图。页面只调用正式接口，不读取浏览器排班 store，也不创建第二套日程数据：

- `GET /api/v1/merchant-admin/employees/:needoId/schedule?from=...&to=...&view=day|week|month`
- 权限：`merchant-admin:employee-affiliation:read`
- 范围：店铺取自 JWT；员工必须是当前店铺的有效从属；path 只接受 canonical 技师 NeeDoID。
- 审计：`merchant_admin.employee_schedule.read`。

接口返回面向当前店铺的服务端投影：

- 当前店铺的排班和预约可返回本店详情；预约可进入现有订单详情。
- 其他店铺仅把 `confirmed` / `in_service` 预约合并为灰色锁定区间，固定文案为“其他店铺已有确认安排”。投影不返回来源店铺、顾客、服务、订单、价格、地址、备注或参与者字段，也不可点击和编辑。
- 合作技师本人发布且标记为 `affiliated_shops` 的可排班时段可向其有效从属店铺公开；遇到跨店硬锁时，后端先扣除锁定区间。
- 店铺各自建立的排班计划可重叠且互不可见；订单从 `pending` 确认时才在事务中建立跨店硬锁，避免两个店铺同时确认同一技师同一时间。

Migration 为 `20260829150000_employee_schedule_privacy`，为 `availabilities` 增加来源与可见范围枚举，并补充技师跨店时段查询索引。前端灰色锁定样式沿用商户后台既有色板、圆角和日历组件，没有新增 mock 数据或自动转账逻辑。

## 13. 2026-08-29 员工薪酬连接

员工详细信息卡新增正式“薪酬与结算”面板，以公开 NeeDoID 调用：

- `GET /api/v1/merchant-admin/employees/:needoId/compensation-profile`
- `PUT /api/v1/merchant-admin/employees/:needoId/compensation-profile`
- `POST /api/v1/merchant-admin/employees/:needoId/compensation-profile/preview`

店铺范围只从当前 JWT 身份取得，后端要求当前有效从属并复用现有版本化薪酬规则、店铺默认规则、工资单、工资行项目、订单财务及计算引擎。响应不返回内部 `shopId`、`technicianProfileId`、从属 ID 或操作人 ID。读取、更新和预估沿用既有薪酬 RBAC；更新继续写入 `merchant_admin.compensation_profile.update` 审计记录。

卡片可查看并编辑计薪模式、基础月薪、时薪、日薪、单次报酬、分成、保障最低额和 NDP 分摊，并显示最新工资单的订单数、工时、服务收入、工资构成、净应付、已付及未付。失败保存保留用户草稿，员工切换或关闭抽屉会使旧请求失效。预估只计算展示，不生成工资单、不登记支付；实际支付仍由财务人员手工处理，系统不发起自动转账。

本微步骤没有新增 schema 或 migration，没有新增 mock，也没有修改旧财务工作区仍在使用的内部 ID 兼容路由。

## 14. 2026-08-30 联盟营销平台抽成规则运营页面

运营后台新增 `/pf-admin.html#/admin/afirieito/fee-rules`，用于读取正式数据库中的当前全局抽成、下一排期费率和不可变版本历史，并在具备写权限时创建新的全局或店铺版本。页面不编辑或删除历史版本，也不会重算已经冻结预算的联盟营销任务；任务继续使用提交时保存的费率快照。

正式接口：

- `GET /api/v1/backoffice/affiliate/fee-rules`：分页读取全局或店铺版本历史。
- `GET /api/v1/backoffice/affiliate/fee-rules/summary?scopeType=global`：由服务端按同一评价时间返回当前规则、下一排期规则和最新版本号。
- `GET /api/v1/backoffice/affiliate/fee-rule-shops`：为抽成页面分页搜索已发布且未删除的店铺，只返回 `id`、`name`、`city`。
- `POST /api/v1/backoffice/affiliate/fee-rules`：使用 `expectedVersion` 创建下一不可变版本，必须填写费率、生效时间和变更原因。

读取要求 `page:backoffice-affiliate-fee-rule`，创建要求 `button:backoffice-affiliate-fee-rule-create`。接口继续要求运营全局或平台身份，创建事务同时写入不可变审计。店铺搜索不扩大财务角色的一般店铺管理权限；历史列表通过同一查询投影店铺名称与城市，避免 N+1 和已下架店铺标签丢失。

本微步骤复用现有 `affiliate_platform_fee_rules` 及其版本、审计和任务快照模型，没有新增 schema 或 migration。浏览器验收只检查读取、筛选、店铺选择、校验和确认页，不提交新的真实费率版本；写入行为由隔离的 API、Service 与 Repository 测试验证。

## 15. 2026-08-31 会员卡方案与 NDP 返点规则

商户会员中心保留现有“已发会员卡”页面，并新增“卡方案”工作区。会员入口及相关页面均显示 `TEST` 角标，提醒当前能力仍处于本地测试阶段。方案工作区沿用既有暗色视觉系统，按“卡种与有效期 → 初始发卡范围 → 基础返点 → 叠加奖励 → 范围与上限 → 试算发布”组织，支持储值卡、次卡、权益卡，不新增平行 mock 数据。

店铺可以设定发卡时允许的初始金额或次数范围；正式发卡与后续客户确认调整分别见第 16、17 节。本页不提供折扣、礼物、赠送服务或赠送次数选项，所有权益统一为 NDP 返点。

正式商户接口：

- `GET/POST /api/v1/merchant-admin/shop-membership-card-plans`
- `GET /api/v1/merchant-admin/shop-membership-card-plans/:publicId`
- `PATCH /api/v1/merchant-admin/shop-membership-card-plans/:publicId/draft`
- `POST /api/v1/merchant-admin/shop-membership-card-plans/:publicId/preview`
- `POST /api/v1/merchant-admin/shop-membership-card-plans/:publicId/publish`
- `POST /api/v1/merchant-admin/shop-membership-card-plans/:publicId/retire`

读取、维护、发布分别要求 `shop.member.card_plan.view`、`shop.member.card_plan.manage`、`shop.member.card_plan.publish`。店铺范围只取当前 JWT 的 `shop` 身份；草稿使用乐观锁，发布版本不可变，跨店公开 ID 返回不存在。创建、编辑、发布和停用写入审计。

运营后台新增 `/pf-admin.html#/admin/finance/membership-reward-fee`，展示当前费率、下一生效版本和分页历史，并在具备写权限时创建不可变费率版本：

- `GET /api/v1/backoffice/membership-reward-fee-policy`
- `POST /api/v1/backoffice/membership-reward-fee-policy/versions`

读取要求 `page:backoffice-membership-reward-fee`，创建要求 `button:backoffice-membership-reward-fee-create`。页面明确展示“客户返点 + 平台费 = 店铺总扣除”；默认平台费为 10%，发布方案时保存费率快照，之后运营变更费率不会回写旧方案。

新增表为 `membership_reward_fee_policy_versions`、`shop_membership_card_plans`、`shop_membership_card_plan_versions`、`shop_membership_reward_rules`；migration 为 `20260831150000_shop_membership_card_rule_configuration` 和 UTC 时间纠正 `20260831151000_membership_reward_fee_policy_utc_bootstrap`。本地真实数据库回滚验收已验证十类规则、RBAC 店铺边界、1000/100/1100 试算、费率快照和审计，且未改变现有会员卡、钱包或账本数据。

## 16. 2026-08-31 会员卡正式发卡

“已发会员卡”工具栏新增 `开卡 TEST`。具备 `shop.member.card.issue` 的店铺负责人或管理员可在同一移动端弹层中选择当前店铺有效会员、仍启用的当前已发布方案，并按方案卡型录入最终初始金额或次数。线下已付款须填写业务参考号或说明；历史补卡和人工发放须填写说明。无权限账号仍可查看卡片，但不显示开卡按钮。

正式接口：

- `POST /api/v1/merchant-admin/shop-memberships/:membershipPublicId/cards`
- 权限：`shop.member.card.issue`
- 请求：`planPublicId`、类型对应的 `initialPrincipalJpy` / `initialUses`、`issuanceSource`、可空参考号/说明和必填 `idempotencyKey`。

服务端按当前 JWT 店铺范围再次校验会员、方案和当前发布版本，计算有效期并保存方案版本、费率、来源、初始值和操作人快照。会员卡、审计和用户通知在同一事务中提交。商户发卡成功后刷新真实卡列表；用户个人中心的店铺会员详情显示当前金额/次数、初始值、方案版本、开卡时间、来源、有效期和平台费率快照，且明确说明“开卡不会自动产生 NDP”。业务参考号和内部说明不返回用户端卡片读取合同。

Migration 为 `20260831160000_shop_membership_card_issuance`。本地 `needo_dev` 已验证物理列、CHECK、外键、幂等唯一索引和默认 RBAC；回滚式正式数据流验证三种卡型、审计、通知、幂等重放、内容冲突以及钱包/NDP 账本零变化。充值、核销和退款仍保持后续独立微步骤，不在本页面提供假操作。

## 17. 2026-08-31 会员卡金额/次数调整与 72 小时客户确认

“已发会员卡”对有效储值卡和次数卡新增 `申请调整 TEST`，并增加“调整申请”队列。具备 `shop.member.card.adjust.request` 的店铺负责人或管理员可提交最终本金或最终剩余次数及可核对原因；`merchant_staff` 默认不授权。权益卡不支持此调整。店铺可查看全部状态并在客户决定前撤回。

用户个人中心“我的会员”顶部新增 `TEST` 待办卡，按店铺与会员卡展示变更前、变更后、店铺说明和剩余时间。用户必须先选择同意或拒绝，再二次确认提交；服务端只接受当前 customer identity 所有的请求。客户必须在创建后 72 小时内判断，截止时刻及之后直接失效，绝不自动同意。

正式接口：

- `POST /api/v1/merchant-admin/shop-membership-cards/:publicId/adjustment-requests`
- `GET /api/v1/merchant-admin/shop-membership-card-adjustment-requests`
- `POST /api/v1/merchant-admin/shop-membership-card-adjustment-requests/:publicId/cancel`
- `GET /api/v1/customer-profile/me/shop-membership-card-adjustment-requests`
- `POST /api/v1/customer-profile/me/shop-membership-card-adjustment-requests/:publicId/decision`

申请、决定、撤回、到期和快照失效均写审计并通知相关双方。批准使用数据库时间、请求行锁和会员卡 `lockVersion` 条件更新；储值卡只改本金、不改赠送余额，次数卡同步调整总次数以保持已消费次数不变。每张卡仅允许一个待确认申请，进入任何终态都会释放唯一待办键。定时 worker 与列表惰性处理共用同一到期事务。

Migration 为 `20260831170000_shop_membership_card_adjustment_approval`。由于本地 migration 基线另有未应用 IM migration，本次在 `needo_dev` 仅执行并登记该已审查的 additive migration，没有夹带应用无关 migration。物理库独立确认 20 个业务/状态列、7 个 CHECK/外键、4 个唯一索引、卡 `lock_version` 与默认 `admin`/`merchant_owner` 授权。

`check:shop-membership-card-adjustment-flow` 在回滚事务中验证：储值本金 10000→12000 且赠送余额 500 不变；次数卡剩余 4→6、总次数 10→12 且已消费 6 次不变；拒绝、撤回、到期均不改卡；旧快照不会覆盖更新后的 4500；跨店/跨客户隐藏、请求/决定幂等、11 条操作审计、2 条系统审计、15 条通知、钱包与 NDP 账本零变化。事务结束后全库保护基线完全恢复。

## 18. 2026-09-01 会员卡线下收款充值

“已发会员卡”对具备 `shop.member.card.topup.create` 的店铺负责人或管理员开放 `充值 TEST`。按钮只出现在当前店铺有效储值卡且没有待客户确认调整时；次数卡、权益卡和非有效卡不出现。充值弹层同时展示充值前/后本金，要求录入实际收款整数金额、收款方式，并至少填写收款凭证或可核对备注。页面明确说明充值立即到账、只增加已收款本金、不会增加赠送金额、不会产生 NDP 或返点平台费。

商家会员卡工作区增加“充值记录 TEST”，用户个人中心“我的会员”增加本人只读充值记录。每条记录展示店铺或客户、卡号掩码、充值金额、本金前后值、收款方式、凭证、经办人和时间；页面没有修改、删除或用户端充值操作。

正式接口：

- `POST /api/v1/merchant-admin/shop-membership-cards/:publicId/top-ups`
- `GET /api/v1/merchant-admin/shop-membership-card-top-ups`
- `GET /api/v1/customer-profile/me/shop-membership-card-top-ups`

写入和商家历史要求 `shop.member.card.topup.create`，客户历史沿用 `customer-profile:read`。店铺范围和客户所有权均由当前 JWT identity 决定，客户端不能传 `shopId` 或用户 ID。充值使用卡行锁、数据库时间、`lockVersion` 条件更新和请求幂等键；本金变化、`shop_membership_card_topups`、审计和客户通知在同一事务提交。

Migration 为 `20260901040000_shop_membership_card_topup`。本地 `needo_dev` 已独立确认 16 个受检业务列、7 个 CHECK/外键、幂等唯一索引和仅 `admin`/`merchant_owner` 的默认授权。由于本地 migration 表另含当前分支没有的 Exchange migration，而当前分支有未应用 IM migration，本步没有运行会夹带无关变更的全量 deploy，只执行、核对并登记本次 additive migration。

`check:shop-membership-card-topup-flow` 已证明实收 5000 JPY 仅令本金 10000→15000、赠送余额保持 500；充值、审计、通知各 1 条；幂等、冲突、待确认调整、跨店、商家/客户只读范围均正确；NDP 钱包与账本零变化，临时业务数据全部回滚。核销和退款继续作为后续独立微步骤。

## 19. 2026-09-02 会员详细分析与三类完成订单排行

运营后台“新增付费会员”指标进入 `/pf-admin.html#/admin/analytics/members`，商户后台会员卡进入 `/store-admin.html#/merchant-admin/analytics/members`。页面共用正式会员趋势和分页会员列表：运营范围支持城市、期间、自定义日期、NeeDo ID、昵称和服务端分页；商户范围由当前 JWT 店铺决定，不接受城市或店铺覆盖。趋势固定为增加、减少、净变化三条序列，图例只能显示或隐藏，不提供运营自定义图表能力。

正式会员接口：

- `GET /api/v1/backoffice/analytics/members/trend`
- `GET /api/v1/backoffice/analytics/members`
- `GET /api/v1/merchant-admin/analytics/members/trend`
- `GET /api/v1/merchant-admin/analytics/members`

运营数据大盘最下方增加服务项目、技师、用户消费三个 `TOP10` 面板，统一调用 `GET /api/v1/backoffice/analytics/rankings/:kind`。每个面板独立切换 `gmv` 或 `completedCount`；技师和用户排行可按正式启用服务分类筛选，并继承数据大盘城市与期间。前端不重新排序后端响应。排行只接受有完整完成与收款凭证、未退款或冲正的订单；NDP、现金和其他方式分别要求正式账本或收款确认。相同主指标时按次指标降序、注册时间升序、数字 ID 升序确定唯一顺序。

新增权限 `backoffice:analytics-ranking:read` 与 migration `20260902100000_analytics_ranking_identity_permission`。平台排行与平台会员分析同时要求当前身份为 `platform` / `platform_admin` 且范围为全局或平台，避免用户切换到同为 global scope 的业务身份后复用角色权限读取平台数据。排行读取使用一致性事务快照，并写入 `backoffice.analytics_ranking.read` 审计。OpenAPI 锁定查询、分页、返回字段和错误响应；前端 adapter 对会员与排行响应执行严格运行时投影，拒绝额外字段、筛选错配、不安全整数及排行种类与实体种类错配。

服务排行以订单和追加服务保存的服务名称、公开 ID、数字 ID、分类 ID 快照为历史权威；migration 会对存量订单从当时仍受外键保护的目录记录一次性补齐这些快照。之后服务或分类被停用、软删除或调整分类，不会回溯性改写已完成订单所在统计窗口的排行。当前启用目录只决定筛选下拉项和新请求允许选择的分类。

验收命令 `check:membership-ranking` 只允许显式的本机 `needo_test` 数据库，在回滚事务内运行会员与排行真实 MySQL fixture，并覆盖付费/赠送/试用/续费来源、完整退款排除、城市/期间/分类、两种排行口径和稳定并列规则。未提供该隔离测试库时命令会在写入前终止，不会退化为使用 `needo_dev`。


## 2026-09-06 排行榜当前页面详情抽屉

大盘服务、技师、用户消费排行卡片改用页面内选中状态，直接复用服务项目抽屉、技师集中详情和统一用户详情抽屉。点击、关闭均不跳转管理列表，不改大盘 URL，不卸载榜单或重新请求大盘汇总，保留筛选及滚动位置。

服务抽屉通过现有正式分页服务 API 查找目标数字 ID；技师详情直接使用正式单条详情 API，用户详情沿用 operations 范围。加载失败在抽屉内显示并支持重试。本步没有新增 API、数据库表或 migration，没有改变统计口径。历史 `technician_service` 类型仍沿用原服务管理的范围限制并显示错误，不冒用同号的店铺服务。

回归测试：`DashboardPage.test.ts` 验证三类卡片开关不跳转、不刷新大盘；`RankingEmbeddedDrawers.test.tsx` 验证跨分页服务定位、详情失败重试与技师单条读取。现有排行榜及技师管理回归合计 17 个测试文件、103 项测试通过；追加高亮调整后，直接相关的 3 个文件、26 项测试再次通过。抽屉逻辑的 `npm run lint`、`npm run build` 已通过；最终颜色改动经 `npx vite build` 打包通过，`git diff --check` 通过。

卡片悬停和键盘焦点使用 `--admin-accent` 与 `--admin-surface` 混合，并增加同色细边框；按下状态进一步加深。经典蓝黑主题下实测高亮为深蓝色（RGB 约 39/48/82），替代旧 `hover:bg-paper/70` 的浅灰背景，其他主题跟随自身强调色。

正式浏览器验收：在 `http://127.0.0.1:5180/pf-admin.html#/admin` 通过真实测试账号正常登录并使用已有运营身份，点击服务 753、技师 LifeDance 管理员 2、用户 LifeDance 管理员，均加载现有正式详情。每次打开和关闭后 URL 始终为 `#/admin`，榜单仍挂载且可见；最后关闭后没有残留抽屉。未进行服务保存、用户调整或删除操作。

验收中发现本地旧前端模块缓存和旧后端版本混用：按原代理配置重启 5180 前端，重新生成 Prisma 客户端并按原环境文件、端口 3108 和 token audience 重启 main 后端。5180 来源恢复正常登录，用户详情从 500 恢复到 200；没有执行 migration 或 seed。远程推送和部署不在本次操作内。

## 2026-09-07 用户分组与详情抽屉补充

运营成员创建、统一分组详情、全屏遮罩、账号 LOG 日期/生成事件，以及用户和技师动态插页的接口与验证范围见 [实现与验收记录](superpowers/plans/2026-09-07-operations-member-create.md)。无数据库结构变更，日志和动态保持商户范围隔离。
