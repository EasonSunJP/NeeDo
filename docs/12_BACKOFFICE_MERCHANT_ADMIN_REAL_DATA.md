# 12 — 运营后台与商户后台真实数据接入

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
