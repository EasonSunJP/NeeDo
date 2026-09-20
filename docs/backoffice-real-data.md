# Step 12 — Backoffice / Merchant Admin Real Data

本文件记录 Step 12 正式数据接入范围。运营后台与商户后台的总览、数据大屏和经营驾驶舱现已各自收敛为唯一的“数据大盘”，并从正式后端读取经营数据。

## 本次接入范围

- 运营后台 Dashboard：读取真实订单、排班、财务对账、技师、店铺汇总。
- 运营后台订单中心：分页读取 `/api/v1/backoffice/orders`，详情读取 `/api/v1/backoffice/orders/:id`。
- 运营后台财务结算：读取 `/api/v1/backoffice/finance/settlements`，并可调用导出接口。
- 运营后台技师 / 店铺管理：读取真实 `TechnicianProfile` 与 `Shop` 数据。
- 商户后台 Dashboard：按当前登录身份的 `shop` scope 读取本店数据。
- 商户后台订单中心：分页读取 `/api/v1/merchant-admin/orders`，详情读取店铺范围强制隔离的 `/api/v1/merchant-admin/orders/:id`。
- 商户后台财务结算：读取 `/api/v1/merchant-admin/finance/settlements`。
- 商户后台财务规则中心：读取、更新并预览本店工资、分成、奖金和 NDP 承担规则。
- 商户后台订单钱路：读取订单服务收入、NDP 冻结/扣除/返点、技师收入预估和 Money Timeline。
- 商户后台服务收入上报：上报线下/平台收款金额、支付渠道、备注与确认状态。
- 商户后台技师收入模式：按技师配置固定工资、时薪、分成、奖金/扣款和 NDP 承担，未配置时自动继承店铺规则。
- 商户后台工资单闭环：生成 Pay Run 草稿、重算草稿、发布、审批、记录支付、锁定归档，并查看 Payslip 行项目。
- 技师端工资单：读取个人 Payslip，查看 Money Timeline/行项目，确认或申诉。
- 运营后台工资汇总：只读查看 Pay Run 总额、未支付、申诉和周期状态。
- 商户后台员工列表与详细信息卡：按 canonical 技师 NeeDoID 读取 `/api/v1/merchant-admin/employees`，维护本店员工基础资料、从属关系、日程、工资结算周期及薪酬规则，并显示最新正式工资单统计。
- 商户后台门店设置：维护店铺默认工资结算周期，并由后端计算本期自然结算日与计划支付日。

## 统一数据大盘正式合同（2026-08-31）

### 唯一路由与查询

- 运营后台唯一页面为 `/admin`，调用 `GET /api/v1/backoffice/dashboard`。
- 商户后台唯一页面为 `/merchant-admin`，调用 `GET /api/v1/merchant-admin/dashboard`。
- 两端页面、标题和菜单统一命名为“数据大盘”。旧 `/admin/analytics`、`/merchant-admin/analytics`、`AnalyticsPage` 与 `MerchantAdminAnalyticsPage` 已从生产路由和页面入口删除，不保留第二套 Dashboard DTO。
- Dashboard 查询参数为 `period=today|last7days|last30days|week|month|year|custom`；缺省为 `last7days`。`period=custom` 必须同时传 `from=YYYY-MM-DD` 和 `to=YYYY-MM-DD`，其他期间禁止传 `from`/`to`；自定义首尾日期均包含且最多 366 天。
- 运营接口可额外传 `city=<数据库中持久化的精确城市值>`；城市选项只读取响应中的 `filter.availableCities`。商户接口严格拒绝 `city`，两端都不接受客户端 `shopId`。

所有日期按 `Asia/Tokyo` 日历解释。`today` 按小时分桶；`last7days`、`last30days`、`week`、`month` 和不超过 92 天的自定义范围按天分桶；`year` 及超过 92 天的自定义范围按月分桶。服务端返回 `bucket.key` 与 `bucket.label`，浏览器不重新解释 UTC。上一周期与当前周期等长并紧邻：流量指标比较两个完整期间，累计指标比较两个期末存量。`changeRatePercent=(current-previous)/previous*100`，保留两位；上一期为 0 时返回 `null`，不伪造增长率。

### 具名响应字段

两个 Dashboard 都返回同一具名结构，旧的松散 `metrics` 标签数组和 `orders`、`technicians`、`shops` 预览数组不再返回：

- `filter`: `period`、`from`、`to`、`previousFrom`、`previousTo`、`timeZone="Asia/Tokyo"`、`granularity`、`city`、`availableCities`。
- `summary`: `availableScheduleSlots`、`activeTechnicians`、`registeredTechnicians`、`shopCount`、`newCustomers`、`pendingOrders`、`serviceGmvJpy`。前三项和运营端的店铺/新增用户项使用 `{ current, previous, changeRatePercent }`；商户端 `shopCount` 与 `newCustomers` 为 `null`。
- `series.buckets[]`: `key`、`label`、`orderCount`、`serviceGmvJpy`、`platformNetRevenueNdp`、`frozenNdp`、`shopCount`、`registeredTechnicianCount`、`shopEstimatedGrossProfitJpy`、`scheduleTotalHours`、`scheduleAvailableHours`、`scheduleBookedHours`。
- `finance`: `platformNetRevenue`、`frozen`、`userReward` 均为 `{ ndp, testNdp }`；运营端另有 `walletStock`、`withdrawn`，商户端另有 `shopNdpCost={ totalNdp, platformNdp, userRewardNdp }`。
- `shop`: 商户端返回 `publicId`、名称、城市、地址、状态、`billing` 与当前 `wallet`；运营端为 `null`。`billing` 给出 `cadence=monthly|annual|free`、`state=trial|paid|free|overdue`、`trialEndsAt`、`paidThrough`。钱包使用 `status=available|not_opened` 区分余额 0 与未开通，并返回 `currency=NDP`、`availableBalance`、`frozenBalance`；这是当前快照，不随历史期间变化。
- `membership`: 运营端为 `null`；商户端见下方会员合同。
- `scope`: 运营端为 `{ kind:"platform", shopPublicId:null }`；商户端为 `{ kind:"shop", shopPublicId }`，店铺使用服务端签名后的公开 ID。

### 运营指标口径

- `availableScheduleSlots`: 期间内未删除、状态为 `AVAILABLE` 的正式 `ScheduleSlot` 数。
- `activeTechnicians`: 期间内至少有一个排班时段，或参与至少一笔非取消订单的未删除技师去重数。
- `registeredTechnicians`: 截至期间结束时未删除正式技师档案累计数；不要求已发布或期间活跃。
- `shopCount`: 截至期间结束时未删除正式店铺累计数。
- `newCustomers`: 期间内新建且未删除的 `CustomerProfile` 去重数。
- 订单总量按服务时间统计未删除订单；服务 GMV 只统计已完成、未退款订单的正式服务金额。
- 平台 NDP 净收入为实际 B 端平台费与 Request fee 扣除已入账用户返点；冻结 NDP 为各分桶结束时仍有效的正式 hold 存量。
- 用户奖励 NDP 只统计期间内实际入账返点；存量 NDP 为期末所有钱包正数可用余额加冻结余额；提现 NDP 只统计已审核通过、关联正式账本交易且已扣减钱包的金额。
- 正式 NDP 是主值，Test NDP 只作为明确标注的次级值；Test NDP 不进入提现、可结算值或正式主值。

运营城市筛选作用于订单、GMV、排班、店铺、技师、新增用户及能够按订单店铺追溯的 NDP 指标。`finance.walletStock` 与 `finance.withdrawn` 始终是全平台口径，并固定带 `cityFilterApplied:false`、`scopeLabel:"platform_global"`；页面标记“不受城市筛选影响”。

### 商户指标、利润与会员合同

商户数据始终限制在当前已签名店铺范围：

- 可排班、活跃技师、注册技师沿用上方口径，但只统计当前店铺。
- `membership.memberCount` 已接正式会员卡数据，返回 `memberDataStatus:"ready"`，以前述大字展示。按当前店铺、有效会员关系和已发行且未过期的有效会员卡，对有效、非测试用户去重；多张卡不重复计人。不读取浏览器会员 Store，数据不可用时仍不得把 `null` 转成 0。
- `membership.completedCustomerCount` 是当前筛选期间内至少完成一笔订单的用户去重数，重复完成多单仍只计一人，并以小字“利用者数”显示。
- `shopEstimatedGrossProfitJpy = 服务 GMV - 技师毛收入 - 店铺承担 NDP`，只统计已完成、未退款且服务收入已上报或确认的订单。
- 技师毛收入沿用薪酬引擎：`基础报酬 + 订单分成 + 保底补足 + 奖金 - 扣款`。技师承担 NDP 不属于毛收入，只在技师净收入中扣除。
- 排班柱状图按分桶显示 `scheduleTotalHours`、`scheduleAvailableHours`、`scheduleBookedHours`。总排班时长是有效 `AVAILABLE` 与 `BOOKED` 时段时长之和；空闲和已预约是总时长的状态拆分，不与总时长再次相加。
- `shopNdpCost.totalNdp = platformNdp + userRewardNdp`，分别显示平台净收入与用户返点；`finance.frozen` 是期间结束时当前店铺仍有效的正式平台费 hold 存量。

### 多店列表、切店、RBAC 与审计

多店商户使用：

- `GET /api/v1/merchant-admin/manageable-shops?page=1&page_size=20`，`page_size` 范围为 1–100。响应为标准分页 `{ list, total, page, page_size }`；每项只返回 `publicId`、`name`、`city`、`status`、`selected`。
- `POST /api/v1/auth/merchant-shop/switch`，请求体为 `{ refreshToken, shopPublicId }`，其中公开 ID 必须匹配 `shop` 加 10 位数字。成功响应返回轮换后的 `accessToken`、`refreshToken`、`expiresIn`、`me` 与已签名的 `shopPublicId`。

直接 shop-scoped 身份只能看到自己的店铺；merchant-account-scoped 身份只能看到当前 `MerchantAccount` 有效且未删除 membership 所管理的店铺。服务端在切换时重新验证身份、商户账号、membership、店铺状态和权限，并轮换 Access/Refresh Token；旧 Access Token 加入黑名单，旧 Refresh Token 被原子替换。Refresh 会重新验证店铺关系；离开商户身份会清除店铺上下文；切到单店身份会固定其店铺。商户订单、排班、财务、员工和设置统一读取同一服务端范围解析器，客户端不得通过任意 `shopId` 扩权；旧店铺迟到响应不能覆盖新店铺数据。

Dashboard 与店铺列表读取分别要求 `backoffice:dashboard:read`、`merchant-admin:dashboard:read`；切店要求 `auth:me:read`。正式审计 action 为 `backoffice.dashboard.read`、`merchant_admin.dashboard.read`、`merchant_admin.manageable_shops.read` 与 `auth.merchant_shop.switch`。切店审计先写 durable authorized-attempt，再通过 Redis 原子 session commit 与恢复 worker 完成；不得出现已轮换 session 却无审计证据的成功路径。

本次复用现有 Booking、OrderFinancial、ScheduleSlot、TechnicianProfile、Shop、Wallet、Ledger、Hold、Withdrawal、MerchantAccount、MerchantShopMembership 与 SaaS 计费数据，**没有新增 Prisma schema 或 migration**，也没有新增 mock、静态曲线或浏览器本地会员数据。

### 本地正式运行验收（2026-08-31）

以下保留当日验收记录。会员接口与多店浏览器验收的最新结果见
[2026-09-05 收尾验证](./verification/2026-09-05-dashboard-final-closure.md)，不再以当时的未接通描述判断当前状态。

- 隔离工作树以正式后端 `3000`、前端 `5180`、MySQL `3307`、Redis `6379` 启动；`/api/v1/health`、`/api/v1/ready` 与前端入口均通过。前后端监听进程的 cwd 均已核对为本隔离工作树。
- 正式 `admin@lifedance.com` 与 `merchant@example.com` 账号通过忽略跟踪的本地环境密码登录；验收过程未打印密码、Access Token 或 Refresh Token，也未修改订单、钱包、会员或其他业务数据。
- 运营数据大盘在 `1440×1000` 浅色与 `390×844` 窄屏完成验收：五个大指标、三个图表、三个 NDP 卡、六个预设期间、有效/无效自定义期间、城市应用/重置、失败后重试、键盘焦点、旧分析路由删除与横向溢出均通过。
- 商户数据大盘在 `1440×1000` 深色与 `390×844` 窄屏完成验收：店铺/计费/钱包、四个大指标、会员数不可用加真实利用者数、三个图表、NDP 成本拆分、冻结 NDP、期间筛选、无效期间恢复、失败后重试、键盘焦点、旧分析路由删除与横向溢出均通过。当前正式商户身份只有一个可管理店铺，因此切换按钮按合同隐藏；多店 Shop A → Shop B 轮换没有伪造浏览器证据，仍由自动化 API/状态机测试覆盖。
- 浏览器验收发现并修复了同店查询失败后遮罩阻断“重置/重试”，以及真正切店加载失败时遮罩阻断“重试”的两个恢复缺陷。同店失败现在保留并明确标记上次成功结果；遮罩仅在真实 owner 过渡的 loading 阶段冻结旧数据。
- 数据大盘 API、重试后的网络、SSE 导航退出与页面控制台没有未解释的失败；但两端共享的全局已发布内容加载当时发现五个 `/media/content/*` 404。2026-09-05 复查发现这五个对象均存在于主检出目录的 `backend/runtime/content-media`；原先“文件缺失”的判断不准确，问题是运行工作树的相对存储目录未指向这些文件。不得通过替换发布记录或伪造图片掩盖路径错误。

调度中心后端接口已提供：

- `/api/v1/backoffice/schedule`
- `/api/v1/merchant-admin/schedule`
- `GET/POST /api/v1/merchant-admin/schedule/slots`
- `PATCH/DELETE /api/v1/merchant-admin/schedule/slots/:id`

商户电脑后台调度中心已完成正式数据切换：现状页分页读取当前 `shop` 身份范围的 `ScheduleSlot`；排班页支持按正式服务时长创建时段、阻塞/恢复和软删除，所有写操作都由后端做范围校验、冲突校验和审计。预约一览统一进入正式订单中心。旧 `dispatch-center` 浏览器 store、静态订单和模拟预测不再从正式商户后台路由进入；自动/智能排班在规则版本、审批状态机和优化器合同完成前显示生产保护页。

商户核心读取采用有限次瞬时重试，只覆盖网络异常、`408`、`429` 和 `5xx`；`401`、`403` 与所有写请求都不得自动重试。最终读取错误统一转换为本地化提示，不把 `error.*` 键直接展示给用户；排班读取失败时也不得同时展示“0 条”的虚假库存状态。过期且无法刷新的会话进入重新登录流程，多身份账号进入后台路由前必须通过正式身份切换接口并校验当前活动身份与目标门户一致。

## 正式人员集中详情合同

人员列表只负责分页、搜索与选择记录；选择后必须按该记录的正式 ID 再请求独立详情合同。四个入口及详情 URL 为：

| 后台入口 | 页面路由 | 正式详情 URL |
|---|---|---|
| 商户员工列表 | `/merchant-admin/people?module=staff` | `GET /api/v1/merchant-admin/employees/:needoId` |
| 商户用户管理 | `/merchant-admin/people?module=users` | `GET /api/v1/merchant-admin/customers/:id` |
| 运营技师管理 | `/admin/technicians` | `GET /api/v1/backoffice/technicians/:id` |
| 运营用户资料 | `/admin/users?view=customers` | `GET /api/v1/backoffice/customers/:id` |

列表行不包含完整详情，打开抽屉时先清空上一条详情并显示正式详情 loading；请求失败时保留当前所选 ID 和可用的“重试”，关闭抽屉会使未完成请求失效。资料保存或技师审核成功后，必须同时重新读取列表与当前打开的详情。禁止用列表行、旧 domain mapper、浏览器状态、local/session storage、mock 或静态记录补齐详情，也禁止在详情请求失败时回退显示列表摘要。

商户详情由当前已认证的 `shop` identity 强制限定范围：技师必须属于当前店铺，客户必须与当前店铺存在正式预约关系；越权 ID 返回 not found。商户客户详情中的预约、技师详情中的店铺/排班/薪酬，以及账号的角色与身份只允许返回当前店铺范围或无店铺泄露风险的正式数据，不得包含其他店铺的预约、角色或身份。运营详情在平台 RBAC 允许时读取全局正式记录。

运营后台技师详情保留平台范围的正式资料栏目。商户员工入口使用独立“员工详细信息卡”：path 只使用公开 NeeDoID，显示当前店铺从属、联系方式、账号状态、正式日程投影、薪酬与结算及工资结算周期；不得从旧全局技师详情或列表行补齐跨店资料。

### 商户员工正式数据地基

`ShopEmployee` 现在是用户与店铺之间的正式任职关系，覆盖店主、管理员、普通员工、会计、司机、总务、厨师和技师等人员。`ShopEmployeeRole` 保存全局系统角色与未来可扩展的店铺自定义角色；`ShopEmployeeRoleAssignment` 以起止时间保存任职角色，不能用浏览器标签替代。技师仍以既有 `TechnicianProfile` 和 `TechnicianShopAffiliation` 作为技师资格及店铺从属权威；`ShopEmployee` 只关联到对应正式从属，不复制或改写技师关系。

迁移 `20260903130000_shop_employee_foundation` 只从正式数据库证据回填：店铺 owner、有效 shop-scoped 商户身份、有效 MerchantAccount 店铺关系，以及当前有效的技师从属。旧商户页面中仅保存在 localStorage、没有正式 `User` 和店铺关系的手工姓名不会被迁移，也不会被通知受众使用。只读检查命令 `npm --prefix backend run check:shop-employee-foundation` 只输出五类聚合缺口数量，不输出用户邮箱、姓名或员工明细。

商户后端现提供只读 `GET /api/v1/merchant-admin/employee-directory`，从 `ShopEmployee` 分页返回当前店铺全部正式人员，而不只返回技师。查询支持 `page`、`pageSize`、`keyword`、`status` 和 `roleCode`；店铺范围只取自当前已认证 shop identity，严格拒绝调用方传入 `shopId`。接口复用 `merchant-admin:employee-affiliation:read`，返回用户级公开 NeeDoID、姓名、头像、联系方式、任职状态/时间、五语言职务，以及当前正式技师关系存在时的可空技师投影；不返回员工、用户、职务、从属或身份内部主键。该路由只挂载于独立商户后端，运营后端不提供此路由。

原有 `/api/v1/merchant-admin/employees` 及其详情、日程、从属、薪酬和工资接口继续保持技师范围，不在本微步骤中改变。员工写 API、商户页面切换、通知员工/技师受众快照、共享数据库 migration 部署和认证浏览器验收仍未执行；因此现在可以确认“全部正式员工”的后端只读合同已建立，但不能宣称商户通知链路已经完成。

用户详情统一使用五个 tab：`基础资料`、`会员等级`、`预约与消费`、`权限与账号`、`用户动态`。头部只显示公开 NeeDoID 与业务状态，不显示内部 User/Profile 主键。用户动态通过独立分页 API 读取，每页可选 `10 / 30 / 50 / 100` 条，并复用正式联系人时间线视觉；正式空列表可显示明确的无记录状态，但不得用 demo 数值、列表行或 mock 关系补位。

商户用户管理只读会员等级；运营后台可在独立“会员等级”插页调用 `PUT /api/v1/backoffice/customers/:id/membership` 免费赋予等级，期限支持永久、按天或按月。后端持久化赋予方式、期限、起止时间与操作人，写操作要求 `backoffice:customers:write` 并记录 `backoffice.customer.membership.assign` 审计。此操作不扣款、不自动续费，也不触发转账。

会员授权 migration：`backend/prisma/migrations/20260829210000_customer_membership_grants/migration.sql`。既有用户默认保持 `self_service`，migration 不生成任何免费会员记录。

## 新增 API

运营后台：

- `GET /api/v1/backoffice/dashboard`
- `GET /api/v1/backoffice/orders`
- `GET /api/v1/backoffice/orders/:id`
- `GET /api/v1/backoffice/schedule`
- `GET /api/v1/backoffice/finance/settlements`
- `GET /api/v1/backoffice/finance/settlements/export`
- `GET /api/v1/backoffice/finance/orders/:bookingOrderId`
- `GET /api/v1/backoffice/technicians`
- `GET /api/v1/backoffice/shops`
- `GET /api/v1/backoffice/customers/:id/timeline`
- `PUT /api/v1/backoffice/customers/:id/membership`

商户后台：

- `GET /api/v1/merchant-admin/dashboard`
- `GET /api/v1/merchant-admin/orders`
- `GET /api/v1/merchant-admin/orders/:id`
- `GET /api/v1/merchant-admin/schedule`
- `GET /api/v1/merchant-admin/finance/settlements`
- `GET /api/v1/merchant-admin/finance/settlements/export`
- `GET /api/v1/merchant-admin/finance/orders/:bookingOrderId`
- `PUT /api/v1/merchant-admin/finance/orders/:bookingOrderId/service-income-report`
- `GET /api/v1/merchant-admin/shops/:shopId/finance/rules`
- `PUT /api/v1/merchant-admin/shops/:shopId/finance/rules`
- `POST /api/v1/merchant-admin/shops/:shopId/finance/rules/preview`
- `GET /api/v1/merchant-admin/shops/:shopId/technicians/:technicianProfileId/compensation-profile`
- `PUT /api/v1/merchant-admin/shops/:shopId/technicians/:technicianProfileId/compensation-profile`
- `POST /api/v1/merchant-admin/shops/:shopId/technicians/:technicianProfileId/compensation-profile/preview`
- `GET /api/v1/merchant-admin/technicians`
- `GET /api/v1/merchant-admin/shop`
- `PATCH /api/v1/merchant-admin/shop`
- `GET /api/v1/merchant-admin/payroll-schedule-policy`
- `PUT /api/v1/merchant-admin/payroll-schedule-policy`
- `GET /api/v1/merchant-admin/employees/:needoId/payroll-schedule-policy`
- `PUT /api/v1/merchant-admin/employees/:needoId/payroll-schedule-policy`
- `GET /api/v1/merchant-admin/employees/:needoId/compensation-profile`
- `PUT /api/v1/merchant-admin/employees/:needoId/compensation-profile`
- `POST /api/v1/merchant-admin/employees/:needoId/compensation-profile/preview`
- `GET /api/v1/merchant-admin/customers/:id/timeline`

真实测试账号登录：

- 不再提供 passwordless `POST /api/v1/auth/test-login`。
- 测试账号必须使用 `POST /api/v1/auth/login` 的 `email + password` 链路。
- seed 会创建 `admin@example.com`、`operator@example.com`、`merchant@example.com`、`technician@example.com`、`customer@example.com`。
- 测试账号密码来自 `TEST_USER_DEFAULT_PASSWORD`；仅本地开发可 fallback 到 `ADMIN_DEFAULT_PASSWORD`。
- 本地 `vite dev` / `vite preview` 会把 `/api/v1` 代理到正式后端，默认目标为 `http://127.0.0.1:3000`；如后端地址不同，可通过 `NEEDO_API_PROXY_TARGET` 或 `VITE_API_PROXY_TARGET` 覆盖。

## RBAC 与审计

新增权限点：

- `backoffice:dashboard:read`
- `backoffice:orders:list`
- `backoffice:schedule:list`
- `backoffice:finance:list`
- `backoffice:finance:export`
- `backoffice:finance-order:read`
- `backoffice:technicians:list`
- `backoffice:shops:list`
- `merchant-admin:dashboard:read`
- `merchant-admin:orders:list`
- `merchant-admin:schedule:list`
- `merchant-admin:finance:list`
- `merchant-admin:finance:export`
- `merchant-admin:finance-order:read`
- `merchant-admin:finance-income-report:write`
- `merchant-admin:finance-rules:read`
- `merchant-admin:finance-rules:write`
- `merchant-admin:finance-rules:preview`
- `merchant-admin:compensation-profile:read`
- `merchant-admin:compensation-profile:write`
- `merchant-admin:compensation-profile:preview`
- `merchant-admin:technicians:list`
- `merchant-admin:shop:read`
- `merchant-admin:payroll:read`
- `merchant-admin:payroll:write`

每个 Step 12 后台接口都会通过 JWT + RBAC middleware。商户后台接口会从当前身份读取 `scopeType=shop` 与 `scopeId`，只返回该店铺范围内的数据。

审计日志动作包括：

- `backoffice.dashboard.read`
- `backoffice.orders.list`
- `backoffice.schedule.list`
- `backoffice.finance.list`
- `backoffice.finance.export`
- `backoffice.technicians.list`
- `backoffice.shops.list`
- `merchant_admin.dashboard.read`
- `merchant_admin.orders.list`
- `merchant_admin.schedule.list`
- `merchant_admin.finance.list`
- `merchant_admin.finance.export`
- `merchant_admin.finance_rules.read`
- `merchant_admin.finance_rules.update`
- `merchant_admin.finance_rules.preview`
- `merchant_admin.finance_order.read`
- `merchant_admin.finance_order.service_income_report`
- `backoffice.finance_order.read`
- `merchant_admin.compensation_profile.read`
- `merchant_admin.compensation_profile.update`
- `merchant_admin.compensation_profile.preview`
- `merchant_admin.technicians.list`
- `merchant_admin.shop.read`
- `merchant_admin.payroll_schedule_policy.update`
- `merchant_admin.employee_payroll_schedule_override.update`
- `auth.test_login`

## 商户工资结算周期

工资结算周期与现有财务规则、收入模式、Pay Run 和 Payslip 分离：本模块只负责店铺默认周期、员工个人覆盖和计划支付日。正式支付是否完成仍由财务人员在财务结算页手工登记，本模块不触发资金转账，也不改变工资单支付状态。

持久化使用版本化 `shop_payroll_schedule_policies` 与 `technician_payroll_schedule_overrides`。员工覆盖绑定当前店铺的 `TechnicianShopAffiliation`；默认继承店铺规则，关闭继承后才保存完整员工规则。所有范围来自 JWT 当前店铺，接口不接受客户端 `shopId`。

结算频率支持每日、每周和每月。日期计算固定使用 `Asia/Tokyo`；月结算日 29–31 在短月落到当月最后一天。遇周末或日本法定节假日时按规则提前至前一个营业日，或顺延至下一个营业日。2025–2027 日本官方节假日固定导入 `business_calendar_dates`，来源版本为 `cabinet-office-2026-08-29`，官方源为 <https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv>。

前端在“门店设置”显示店铺默认规则，在员工详细信息卡显示继承来源或个人规则，并只使用后端返回的本期范围、自然结算日和计划支付日。保存失败保留草稿；切换员工或关闭详情会使上一请求失效，不能串用其他员工的规则。

## 员工薪酬与工资统计

员工详细信息卡以 canonical 技师 NeeDoID 读取、编辑和预览当前 JWT 店铺范围的薪酬规则。服务端先验证该员工与当前店铺的有效从属，再复用版本化 `TechnicianCompensationProfile`、店铺默认规则和既有 `CompensationEngine`；客户端不提交 `shopId` 或 `technicianProfileId`。读取要求 `merchant_admin.compensation_profile.read`，更新和预览分别要求既有 update/preview 权限，更新写入 `merchant_admin.compensation_profile.update` 审计记录。

卡内统计只读取当前店铺与当前员工最新、未删除的正式工资单；完成订单数按工资单引用订单去重，有效工时来自已完成预约，服务收入来自已上报或已确认的订单财务，基础工资、分成、奖金、补贴、扣款、NDP 分摊、净应付、已付和未付来自持久化工资单。响应只返回公开 NeeDoID、脱敏后的有效规则和汇总，不返回内部店铺、技师资料、从属或操作人 ID。

本模块没有新增 schema 或 migration，也没有复制工资引擎。卡内预估不会保存工资单或登记支付；实际支付仍由财务人员在财务结算页手工登记，系统不提供自动转账。

Migration：

```text
backend/prisma/migrations/20260829123000_employee_payroll_schedule_policy/migration.sql
```

2026-08-29 本地正式开发库在完整 SQL 备份后部署，专项 checker 结果为 `ready=true`、`officialJapanHolidayRows=54`、`issues=[]`。部署不会创建任何店铺或员工默认规则行。

## 财务口径

后台财务结算不再把 `FinanceReconciliation.actualAmount` 当作服务流水。真实财务视图读取 `order_financials`，并明确拆分服务金额与 NDP 账本金额：

- `estimatedServiceGmvJpy`: 估算服务 GMV，来自 Booking 价格或 `order_financials.serviceAmountJpy`。
- `platformCollectedServiceAmountJpy`: 平台代收服务金额，本次只保留字段，不做复杂清分。
- `offlineReportedServiceAmountJpy`: 商户线下上报服务金额。
- `unknownOrUnreportedServiceAmountJpy`: 未上报或未知服务金额。
- `platformNdpRevenue`: 平台 NDP 净收入，等于实际 B 端平台费扣除用户返点成本后的净额。
- `userRewardNdpCost`: 用户返点成本。
- `pendingHoldNdp`: 已冻结但尚未扣除或释放的 NDP。
- `campaignDiscountNdp`: 活动减免 NDP。
- `releasedNdp`: 已释放冻结 NDP。
- `appliedFeeRuleIds`: 命中的费用规则 ID。
- `serviceIncomeStatus`: `unreported`、`reported`、`confirmed`。
- `paymentChannel`: `unknown`、`platform_online`、`offline_cash`、`offline_card`、`bank_transfer`、`other`。
- `technicianEstimatedIncomeJpy`: 根据当前技师收入模式预估的技师净收入。
- `shopEstimatedGrossProfitJpy`: 服务金额扣除技师毛收入和店铺承担 NDP 后的店铺预估毛利。
- `moneyTimelineStatus`: `needs_income_report`、`needs_review`、`complete`。
- `moneyTimeline`: `{ type, label, amountJpy?, amountNdp?, actorType, occurredAt, status, metadata }[]`。

`FinanceReconciliation` 与 `/api/v1/finance/reconciliation` 仍保留为账本交易对账和导出接口，但不再作为 Backoffice / Merchant Admin 的服务流水来源。

## 商家 SaaS 计费与人工封号

运营后台“店铺与商家”使用正式 `merchant_accounts`、集团从属关系、计费档案、免费期间、SaaS 账单、付款和封号记录。集团默认显示为一张卡片，展开后在同一集团边框内显示旗下店铺；卡片直接显示可点击的账号类型、付费模式、计费状态和月费。

核心规则：

- 店铺类型按有效技师数自动判定，不提供人工锁定：1 人为单人店铺并永久免费，2 人以上为付费店铺；集团为独立付费主体。
- 首次符合付费条件时开启一次 3 个自然月试用。启用月剩余不足 15 天时追加 15 天且不占人工追加次数；试用中断后不得再次开启。
- 人工追加支持 `+1 / +2 / +3` 月快捷项、按日追加和选择开始付费日，最多人工追加 3 次。
- 月费默认 `¥9,800`；年费为月费乘以 10，服务期为连续 12 个自然月。付费模式和金额可分别人工锁定，账号类型不可锁定。
- 集团可选择统一付款或集团与店铺分别付款；统一付款金额为集团自身加所有需付费店铺。例如集团下 4 家付费店铺时为 `¥9,800 × 5 = ¥49,000`。
- 欠费仅在运营后台红名，不影响前端展示，不自动封号。所有封号均为人工操作且不禁止登录；既有预约和进行中服务保留，只阻止新增排班、重新开放时段和新预约。
- 集团封号支持“集团及旗下店铺一并封号”或“仅封集团并解除店铺从属关系”。后一种会把各店铺当前最高权限账号提升为店铺管理员。
- 支付提供方可在人工审核与 Stripe 适配器之间切换；当前开发环境使用人工审核，正式 Stripe 密钥和 Webhook 在上线配置中注入。

正式 API 以 `/api/v1/backoffice` 为前缀，覆盖商家账户分页/详情、集团从属关系、计费档案、试用追加与中断、免费期间、SaaS 账单、人工付款审核、人工封号/解封以及商家/店铺软删除。全部写接口通过 Zod、JWT、细粒度 RBAC 和审计日志。

计费弹窗底部按账单显示历史付费记录，包括账单编号、计费期间、应付金额、账单状态、付款时间、付款方式和外部凭证编号。免费期间与账单历史读取同时接受 `backoffice:saas-billing:read` 或商家详情读取权限 `backoffice:merchant-accounts:read`，避免能查看商家卡片却无法读取详情历史的权限断层；写入仍要求原有独立写权限。

卡片“营业设置”右侧提供“切换到商户后台”。运营账号进入后仍保留自己的平台身份，通过 `X-NeeDo-Merchant-Preview-Shop-Id` 选择只读店铺范围；集团账户可在顶部切换旗下店铺。只读代看仅允许 `GET`，前端在发出请求前拦截写操作，后端认证中间件再次拒绝携带该范围头的所有非 `GET` 请求，并在审计元数据记录 `readOnlyMerchantPreview` 与 `previewShopId`。退出后返回原运营后台店铺与商家页面。

## 商户财务规则中心 v1

`shop_finance_rule_sets` 保存商户侧财务规则版本。当前 v1 支持：

- `wageMode`: `fixed_per_order`、`commission`、`base_plus_commission`、`hourly`。
- `commissionRatePercent`、`fixedOrderPayJpy`、`hourlyRateJpy`、`guaranteedMinimumJpy`。
- 月单量、月 GMV、评分触发的奖金规则，以及迟到/取消、评分低于阈值触发的扣款规则。
- `ndpFeeBearer`: `shop`、`technician`、`split`，并支持 `technicianNdpSharePercent`。
- preview 返回 `technicianGrossIncomeJpy`、`technicianNetIncomeJpy`、`shopGrossMarginJpy`、`shopNdpShareNdp`、`technicianNdpShareNdp`。

更新规则不会覆盖历史版本；服务层会归档旧 active 版本并创建新 active 版本，同时写入审计日志。

## Step 12A：订单钱路 + 技师收入模式基础

`OrderFinanceService` 基于 `BookingOrder`、`OrderFinancial`、`WalletHold`、`FeeCalculationLog` 与当前收入规则生成订单财务详情。商户和运营后台读取同一 DTO；商户侧额外可以上报服务收入，写回 `order_financials` 并追加 Money Timeline。

未收款且未到预约开始时间就取消的 Booking 在财务列表、详情和 CSV 中统一投影为 `cancelled`：服务 GMV、未上报收入、技师收入和店铺毛利均为 0，Money Timeline 不生成待上报收入或技师分账事件。BookingOrder 的原始报价继续保留为订单审计事实。读取层同时兼容修复前已写成 `compensated/unreported` 的历史行，不把这类行重新计入营收或工资来源。

`CompensationEngine` 是纯计算层，统一输出：

- `basePayJpy`
- `commissionPayJpy`
- `minimumGuaranteeAdjustmentJpy`
- `bonusPayJpy`
- `deductionJpy`
- `technicianGrossIncomeJpy`
- `technicianNdpShareNdp`
- `shopNdpShareNdp`
- `technicianNetIncomeJpy`
- `shopEstimatedGrossProfitJpy`

`technician_compensation_profiles` 保存技师级收入配置版本。若某个技师没有 active override，接口会 fallback 到 `shop_finance_rule_sets` 的 active 店铺规则；这保证静态站点和未来动态站点使用同一套前端 DTO，不需要重做页面。

`order_financials` 在 Step 12A 扩展以下字段：

- `service_income_reported_by_id`
- `service_income_reported_at`
- `service_income_confirmed_by_id`
- `service_income_confirmed_at`
- `service_income_note`
- `service_income_proof_url`

## Step 12B：工资单闭环

`PayrollService` 使用已完成且收入已上报/确认的 Booking 订单生成店铺工资周期。计算口径复用 Step 12A 的 `CompensationEngine`，并把基础工资、分成、保底补足、奖金、扣款、NDP 分摊和人工行项目写入 `payslip_lines`，确保每一笔技师收入都有来源订单、规则或人工调整记录。

生命周期固定为：

```text
draft -> reviewing -> published -> confirmed / disputed -> approved -> scheduled -> paid -> locked
```

当前切片落地的操作边界：

- 草稿可生成和重算；发布后不允许重算覆盖金额。
- 商户可发布、审批、记录支付、锁定工资周期。
- 商户财务结算页已接入工资调整申请列表、创建、提交、审批和驳回操作，使用正式 `merchantPayrollCenterApi` typed API。
- 商户和运营后台可导出 Pay Run CSV，技师可导出自己的 Payslip CSV；正式 payroll 导出路由直接返回 `text/csv; charset=utf-8` 与 `Content-Disposition` 文件名，前端通过 `httpClient.requestCsvExport` 转换为下载 envelope，暂不做 Excel/PDF。
- 技师可读取自己的工资单，发布后可确认或申诉。
- 运营后台只读查看工资周期汇总，不参与商户支付动作。
- 本轮不接银行代付、不做文件上传、不做税务/发票；奖金/补贴/扣款只做基础申请、提交、审批/驳回和工资单应用，不做多级审批或外部附件流。

## Step 12C：Payroll 闭环硬化

Step 12C 在 Step 12B 的工资单基础上补齐申诉处理、支付记录确认和状态机硬约束，不扩大到 Request 调度费、银行代付、税务/发票、Excel/PDF 或上线性能拆包。

新增闭环规则：

- 技师只能在 `published` 状态确认或申诉工资单。
- `disputed` 工资单必须由商户处理申诉后回到 `published / resolved`，再交给技师确认。
- Pay Run 只能从 `draft / reviewing` 发布；存在未解决申诉时不能审批；未全额支付时不能锁定归档。
- 商户只能对 `approved / scheduled` 的 Payslip 记录支付，禁止超付。
- 技师可确认具体支付记录收款，`payout_records.technician_confirmed_at` 保留收款确认时间；支付记录确认仅允许在 `scheduled / paid` 的 Payslip 上发生，`locked` 后禁止继续确认。
- `paid / locked` 后禁止技师继续确认或申诉工资单，禁止商户继续新增支付记录；工资周期已关闭时禁止新增奖金、补贴或扣款调整申请。

Step 12C 扩展字段：

- `payslips.dispute_resolved_at`
- `payslips.dispute_resolved_by_id`
- `payslips.dispute_resolution_note`
- `payout_records.technician_confirmed_at`

新增正式 API：

- `GET /api/v1/merchant-admin/pay-runs`
- `GET /api/v1/merchant-admin/pay-runs/export`
- `POST /api/v1/merchant-admin/pay-runs`
- `GET /api/v1/merchant-admin/pay-runs/:id`
- `POST /api/v1/merchant-admin/pay-runs/:id/recalculate`
- `POST /api/v1/merchant-admin/pay-runs/:id/publish`
- `POST /api/v1/merchant-admin/pay-runs/:id/approve`
- `POST /api/v1/merchant-admin/pay-runs/:id/lock`
- `POST /api/v1/merchant-admin/payslips/:id/payout-records`
- `POST /api/v1/merchant-admin/payslips/:id/resolve-dispute`
- `GET /api/v1/merchant-admin/payroll-adjustments`
- `POST /api/v1/merchant-admin/payroll-adjustments`
- `POST /api/v1/merchant-admin/payroll-adjustments/:id/submit`
- `POST /api/v1/merchant-admin/payroll-adjustments/:id/approve`
- `POST /api/v1/merchant-admin/payroll-adjustments/:id/reject`
- `GET /api/v1/technician/payslips`
- `GET /api/v1/technician/payslips/export`
- `GET /api/v1/technician/payslips/:id`
- `POST /api/v1/technician/payslips/:id/confirm`
- `POST /api/v1/technician/payslips/:id/dispute`
- `POST /api/v1/technician/payslips/:payslipId/payout-records/:payoutRecordId/confirm`
- `GET /api/v1/backoffice/pay-runs`
- `GET /api/v1/backoffice/pay-runs/export`

Payroll CSV 导出响应合同：

- `GET /api/v1/merchant-admin/pay-runs/export`
- `GET /api/v1/technician/payslips/export`
- `GET /api/v1/backoffice/pay-runs/export`

以上三个接口不使用 `{ code, message, data }` JSON envelope，而是返回 CSV 下载响应：

```text
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="<scope>-<YYYY-MM-DD>.csv"
```

前端正式 API adapter 使用 `httpClient.requestCsvExport` 读取真实 CSV body，并保持 `downloadCsvExport` 所需的 `{ filename, contentType, csv }` 调用形状；静态 demo 仍只作为 same-shape compatibility。

## Step 12E：Request 财务 API 适配

Step 12E 不新建 Request 大厅、调度大厅、退款状态机或前端入口；本步只把既有 `BookingOrder.orderType = request` 和 C 端 Request dispatch fee 接入正式后端订单/账本/API 适配。

新增/收紧的写侧口径：

- `POST /api/v1/bookings` 允许 `orderType = request`，默认仍为 `booking`，旧前端不传该字段时行为不变。
- Request 确认接单时计算 `c_request_dispatch_fee`，默认 seed 为 `500 NDP`，付款方为 customer user wallet。
- seed 通过账本初始化给 demo customer 与 `customer@example.com` 钱包充值 `1000 NDP`，用于 Request dispatch fee 冻结/完单 smoke flow。
- Request 确认接单会冻结 C 端钱包，并写入 `order_financials.c_request_fee_hold_ndp`。
- Request 完单会实扣 C 端冻结的 dispatch fee，并写入 `order_financials.c_request_fee_actual_ndp`。
- Request 取消会释放剩余 C 端 dispatch fee 冻结；本步不做商户违约赔付和 Request refund 状态机。

新增/收紧的展示口径：

- `OrderFinanceDetail` 返回 `orderType`、`cRequestFeeHoldNdp`、`cRequestFeeActualNdp` 和 `requestFeeNdpRevenue`。
- 平台 NDP 净收入统一按 `bPlatformFeeActualNdp + cRequestFeeActualNdp - userRewardNdp` 计算。
- 待处理冻结统一按 `bPlatformFeeHoldNdp + cRequestFeeHoldNdp - bPlatformFeeActualNdp - cRequestFeeActualNdp - releasedNdp` 计算，结果不小于 0。
- Money Timeline 在存在 C 端 Request fee 时显示 `request_fee_hold` / `request_fee_captured`。
- 运营后台和商户后台财务结算列表、详情抽屉与 CSV 导出带出 Request fee 字段；静态预览只做 same-shape compatibility。

本步不新增 migration，因为 `c_request_fee_hold_ndp` 与 `c_request_fee_actual_ndp` 已在 `order_financials` 中存在。

正式验收脚本：

- `cd backend && ENV_FILE=.env.dev npm run check:finance-request-flow -- --base-url http://127.0.0.1:3000/api/v1`

该脚本使用真实 `/api/v1`、真实登录账号、真实 `ScheduleSlot` 和真实 `Wallet` 数据，连续验证一单 Request 完单扣除和一单 Request 取消释放。输出只包含订单 ID、状态、金额断言和失败原因，不打印 access token、refresh token、密码或敏感字段。

## 技师榜单正式数据

运营后台的 `/admin/technicians?module=ranking` 使用正式聚合接口，不在浏览器内拼接订单或财务数据：

- `GET /api/v1/backoffice/technician-rankings`：分页读取当前筛选、期间与排序下的榜单。
- `GET /api/v1/backoffice/technician-rankings/export`：以相同筛选、期间和排序导出 CSV，最多 5,000 行。

两个接口均要求 `backoffice:technicians:list`，并分别写入
`backoffice.technician_rankings.list` 和
`backoffice.technician_rankings.export` 审计记录。列表支持关键字、店铺、城市、统计期间、指标、排序方向和分页；导出不接受客户端汇总或浏览器补算。

统计窗口以 `Asia/Tokyo` 日历解释：默认本月，也支持今日、近 7 天、近 30 天、自定义起止日（首尾均包含）与历史累计。仅统计未软删除、状态为 `completed` 且未退款的正式订单；服务金额读取 `OrderFinancial.serviceAmountJpy`，已入账的加钟金额计入原订单；每个 Booking 主订单只计一笔完成订单；完成时间转换为东京日期后，当天至少完成 1 单才计为 1 个工作日。

CSV 为带 BOM 的 UTF-8 内容，并会中和可能被表格软件解释为公式的单元格前缀；服务端仍执行与列表相同的鉴权、查询校验、过滤和排序，不能用导出绕过 RBAC。独立实库 checker 只读取本地非生产 MySQL，启动前拒绝生产环境标志、远程主机和生产式数据库名，不写入或清理任何业务记录：

```bash
ENV_FILE=.env.dev npm --prefix backend run check:technician-ranking-flow
```

本次只增加了现有 Booking、OrderFinancial、TechnicianProfile 与 Shop 的只读聚合合同，未新增 migration 或 mock 数据。浏览器验收（各期间、排序、筛选、分页、CSV、错误/空态和详情抽屉）仍由主代理在运行中的正式服务上执行；本文档与静态测试不替代该验收。

## 运营实时大盘 microstep A 数据合同（2026-09-06）

microstep A contains no live-screen page。这个微步骤只交付正式数据地基、只读 API、缓存和 SSE 合同；运营端大屏页面及交互属于后续微步骤，不能把本文的后端验收表述为页面或浏览器验收。

- 快照：`GET /api/v1/backoffice/dashboard/live-snapshot?country=JP&admin1=13&admin2=13104&period=today`。`country` 固定为 `JP`；`admin1`、`admin2` 逐级可选，`admin2` 必须带所属 `admin1`；`period` 为 `today`、`last7days` 或 `last30days`。`Accept-Language` 支持 `zh-CN`、`zh-TW`、`ja`、`en`、`ko`，无法识别时回退日语。所有范围以不可变的 `BookingServiceLocation` 服务发生地为准，全国范围保留 unresolved 覆盖率，东京/新宿等下钻只纳入 verified 归属。
- 事件：`GET /api/v1/backoffice/dashboard/live-events` 使用与快照相同的查询参数和 `backoffice:dashboard:read` 权限。客户端以 `Last-Event-ID` 续传；服务端发送 `retry: 5000`、每 30 秒 heartbeat，并只发送白名单化的 `order.changed` 和 `metrics.invalidate` 字段。事件不得包含客户姓名、邮箱、电话、地址、备注或内部数字关联 ID。游标已过保留窗口或不再存在时返回 `409 error.live_dashboard.cursor_reset_required`，客户端必须丢弃旧游标、重新取快照后重连，不能静默跳过事件。
- Redis 快照 key 使用 `dashboard:live:v1:{country}:{admin1|-}:{admin2|-}:{period}`，TTL 为 300 秒；订单变化触发 country → admin1 → admin2 的 generation-fenced 失效。Stream 最多保留 100 条且保留窗口为 5 分钟；发布、回放、排序、背压断开和隐私白名单均由正式 Redis 测试覆盖。

补充运行时与归属合同：compatibility backend、operations API、merchant API 必须使用同一个 `LIVE_DASHBOARD_REDIS_URL` 共享快照、generation 与 Stream；各端 `REDIS_URL` 继续隔离认证/session。拆分 API 缺少共享配置时拒绝启动，退出时关闭专属 live Redis clients。`dev:formal` 从 `FORMAL_LIVE_DASHBOARD_REDIS_URL` 向三个进程传入同一目标。

全国总量与 unresolved 覆盖率包括符合既有资格条件但尚无服务地点快照的历史订单；区域子级指标和下钻仍只使用 verified 快照。普通 home Booking 将官方行政名称与 estimate 接受的规范地址绑定，错配在容量预占与 estimate 消耗前拒绝。Exchange 转单在同一事务创建地点快照：可靠店铺地点为 verified，自由文本 home 地址或未核验店铺为 unresolved；只在事务提交后发布新订单和被替代订单的变化。

Booking 历史服务地点回填默认只预览，不写库：

```bash
FORMAL_BACKEND_ENV_FILE=/absolute/path/to/.env.dev npm --prefix backend run backfill:booking-service-locations
```

应用必须显式给出预览计数以避免目标漂移；脚本还提供具名 run 的恢复路径：

```bash
FORMAL_BACKEND_ENV_FILE=/absolute/path/to/.env.dev npm --prefix backend run backfill:booking-service-locations -- --apply --confirm-count=<preview-planned-count>
FORMAL_BACKEND_ENV_FILE=/absolute/path/to/.env.dev npm --prefix backend run backfill:booking-service-locations -- --restore-run=<run-id>
```

LifeDance 正式本地测试店铺的服务地区修复同样默认只预览，并且只允许连接本机
`needo_dev`。脚本以精确店名和 owner 邮箱唯一定位门店，不依赖会随数据重建变化的内部
shop ID；应用时必须回传 preview 的 `repairCount`。每个地区关系先通过当前官方行政区层级
解析，再与逐店审计和批次 manifest 在同一事务提交。恢复会核对 applied snapshot，发现并发
漂移即拒绝写入：

```bash
npm --prefix backend run repair:lifedance-shop-service-locations
npm --prefix backend run repair:lifedance-shop-service-locations -- --apply --confirm-count=<preview-repair-count>
npm --prefix backend run repair:lifedance-shop-service-locations -- --restore-run=<run-id>
```

最终形式化 checker 只允许明确的本地/开发 MySQL 与 Redis，并强制事务回滚和 run-prefix 清理：

```bash
FORMAL_BACKEND_ENV_FILE=/absolute/path/to/.env.dev LIVE_DASHBOARD_CHECK_ROLLBACK=true LIVE_DASHBOARD_CHECK_RUN_ID=task8-local-a npm --prefix backend run check:live-dashboard
```

`LIVE_DASHBOARD_CHECK_RUN_ID` 必须是显式、可复现且本次运行唯一的小写 token；checker 对它做稳定哈希，不使用 PID 或随机数，并在数据库或 Redis 已存在同名 run 前缀时拒绝继续。直接 MySQL oracle 以独立 raw SQL 逐节核对全国、东京、新宿和三个 period 的 headline、payments、orders、realtime、activity、trend、coverage 与排名；仅排名资格及排序 CTE 复用 Task 5 明确定义为正式权威的 `AnalyticsRankingRepository` CTE，其余映射与生产 `LiveDashboardRepository` 独立。

验收事实必须分开记录：本地代码提交不等于远端 push；远端 push 不等于部署；部署不等于 migration 已应用；migration 已应用也不等于正式 checker、API、SSE 或页面验收已经发生。本微步骤不执行 push、部署、生产 migration，也不声称存在 live-screen page。

## 数据来源

本次读取正式表：

- `BookingOrder`
- `ScheduleSlot`
- `LedgerTransaction`
- `Wallet`
- `PlatformFeeRuleSet`
- `PlatformFeeRule`
- `PlatformFeeTier`
- `PlatformFeeTimeWindow`
- `FeeCampaign`
- `FeeCalculationLog`
- `WalletHold`
- `OrderFinancial`
- `ShopFinanceRuleSet`
- `TechnicianCompensationProfile`
- `PayRun`
- `Payslip`
- `PayslipLine`
- `PayrollAdjustmentRequest`
- `PayoutRecord`
- `TechnicianProfile`
- `Shop`
- `User`
- `AuditLog`

本次新增 migration：

- `20260603090000_finance_rules_backoffice_metrics`：动态费用规则、费用计算日志、冻结记录和订单财务汇总。
- `20260603153000_shop_finance_rule_sets`：商户工资、分成、奖金和 NDP 承担规则版本。
- `20260603170000_order_finance_compensation_profiles`：订单服务收入上报字段与技师收入配置版本表。
- `20260603190000_payroll_center`：Pay Run、Payslip、工资行项目和支付记录表。
- `20260603222000_payroll_adjustment_requests`：工资奖金、补贴、扣款调整申请及应用标记表。
- `20260604013000_payroll_dispute_payout_closure`：工资单申诉处理字段与支付记录技师收款确认时间。

正式 readiness：

- `GET /api/v1/ready` 在数据库连通后会校验 Step 12 财务和 payroll 必需表列；如果缺少上述 migration 中的关键列，返回 `not_ready`，避免正式财务接口在运行时因 schema drift 变成 500。

## 正式 Seed 演示数据

`backend/prisma/seed.ts` 会补齐一组正式 finance/payroll 演示闭环数据，供本地和静态上线前的真实 API smoke 使用：

- `SEED-FINANCE-0001`：一单已完成 Booking，绑定正式 `BookingOrder`、`OrderFinancial` 和已确认的线下服务收入。
- 商户/运营财务结算列表可读取该订单的 GMV、B 端 NDP 平台费、用户返点成本和 Money Timeline。
- 商户、技师、运营 payroll 列表可读取一组 `PayRun`、`Payslip`、`PayslipLine` 和 `PayoutRecord`，并可导出 CSV。
- 该 seed 不新增 migration，不新增 mock API，也不开放 Request 前端入口；它只让正式数据库在验收时具备非空的财务/工资单样例。

## 前端接入文件

- `src/api/backofficeRealData.ts`
- `src/api/merchantFinanceRules.ts`
- `src/api/merchantFinanceCenter.ts`
- `src/api/merchantPayrollCenter.ts`
- `src/api/technicianPayrollCenter.ts`
- `src/pages/admin/DashboardPage.tsx`
- `src/pages/admin/OrdersAdminPage.tsx`
- `src/pages/admin/FinancePage.tsx`
- `src/pages/admin/MerchantsPage.tsx`
- `src/pages/admin/TechniciansPage.tsx`
- `src/pages/merchant-admin/MerchantAdminDashboardPage.tsx`
- `src/pages/merchant-admin/MerchantAdminOrdersPage.tsx`
- `src/pages/merchant-admin/MerchantAdminPeoplePage.tsx`
- `src/pages/merchant-admin/dispatch-center/DispatchCenterRoutePages.tsx`
- `src/pages/merchant-admin/dispatch-center/MerchantScheduleManagementPanel.tsx`
- `src/components/merchant-admin/MerchantStoreOperationsWorkspace.tsx`
- `src/pages/mobile/TechnicianPayrollPage.tsx`
- `src/pages/auth/LoginPage.tsx`
- `src/pages/auth/AdminLoginPage.tsx`
- `src/auth/AuthProvider.tsx`
- `src/api/auth.ts`
- `src/features/booking/api.ts`

## 边界

- 本次不做 IM / Social / Notification 实时化。
- 本次不做压测。
- 本次不重做后台 UI。
- 本次不做银行代付、税务/发票、文件上传和多级复杂审批；工资调整只覆盖基础申请、提交、审批/驳回、申诉处理、支付记录确认和锁定应用。
- 本次只做 Request dispatch fee 的后端/API/账本适配，不做 Request 大厅、复杂调度、退款、商户违约赔付或前端入口。
- 旧后台周边模块仍可能保留 legacy mock compatibility；正式运营/商户后台的核心指标、订单、排班、财务、技师、店铺入口不再使用这些兼容数据。

## 2026-09-06 数据大盘视觉证据补齐

本微步骤保持现有运营后台信息架构，只补齐排行榜、摘要趋势和大图表的正式数据证据：

- 服务项目、技师和用户 Top 10 使用同一套完整订单证据聚合。结果同时返回总 `gmvJpy` / `completedCount` 与 TEST 子集 `testGmvJpy` / `testCompletedCount`，并以 `dataComposition=formal|test|mixed` 明确来源；任何 TEST 贡献都显示红色 `TEST` 标签。
- TEST NDP 订单只接受 `TEST_NDP` 账本，正式订单仍只接受 `NDP`。有独立支付方式选择事件时，账本必须发生在选择之后；无独立选择事件的直接 NDP 路径，账本必须处于服务结束与支付确认之间。其他结算、事件、退款、身份、软删除与一致性条件继续 fail-closed。
- 五张摘要卡消费服务端 `headlineSeries3d`，固定为以 `Asia/Tokyo` 解释、截至同一 `evaluatedAt` 的连续 3 个自然日；每张卡只绘制三个有限数值点，缺失或矛盾数据不在浏览器中补造。
- 三张大折线图分别显示左右数值坐标轴；每个折线节点可由鼠标、Enter 或 Space 打开锚定详情，显示该日期全部序列的精确值，并支持关闭按钮、Escape 和筛选变化后的状态清理。原有无障碍数据表和 reduced-motion 规则保留。
- 三个排行榜标题控制行采用相同最小高度，服务榜补齐与另外两榜一致的分类筛选位置，因此分割线基线一致。

本地真实 MySQL 的近 7 天只读查询结果为：服务榜 3 项、技师榜 2 人、用户榜 1 人；用户榜合计 5 个完成订单、`testCompletedCount=5`，全部为 `dataComposition=test`。服务榜把每个完成订单的主服务及已接受加项分别计入服务完成次数，因此三项合计 10 次。未执行 seed、repair、migration 或 schema 修改。

本次新鲜验证结果：

- 后端聚焦测试：8 suites / 99 tests 通过；受显式本地 `needo_test` authority 保护的 MySQL fixture suite 默认跳过 1 test。
- 前端聚焦测试：9 files / 70 tests 通过。
- 后端 lint、后端 build、前端 typecheck lint、i18n audit 和前端 production build 均退出 0。
- `audit:production-bundle` 未通过：`main-BCYiBKko.js` 为 4,053,344 bytes（预算 4,000,000），`i18n-DvR3q3_2.js` 为 3,723,288 bytes（预算 3,704,096）；本微步骤未做跨模块拆包重构。
- 现有全量模拟数据 checker 已连接本地 MySQL，但被既有联系人基线差异阻断：预期 460，实际 462；未在本微步骤修复或写入联系人数据。
- 标准前端端口 `5180` 由原始检出目录占用，标准后端 `3000` 当时未监听。本分支在 `5286/3106/3107/3108` 隔离运行并到达运营后台登录页；由于新 origin 不继承既有登录态，认证后的视觉浏览器验收未宣称完成。

上述事实仅证明隔离分支的代码、测试、构建、只读数据库聚合和运行时可达性；不代表已合并到 `main`、已 push、已部署、已执行 migration，亦不代表 staging 已验收。

## 2026-09-06 角色人员列表与权限完整性

角色管理的每张角色卡现在通过正式 `GET /api/v1/users?roleId=<id>` 按需读取当前人员，接口继续使用 `user:list` 鉴权、Zod 查询校验、Service/Repository 分层和服务端分页。查询只匹配未删除的用户及有效 `UserRole` 关系；页面显示账号启停状态与该角色的作用域，不在浏览器中维护人员副本。

权限 API 核对结果：`GET /api/v1/permissions/tree` 已由 `PermissionRepository.listAll()` 读取数据库中全部未删除权限，并按模块与类型分组；系统权限由 `SYSTEM_PERMISSIONS` 统一定义并由正式 seed 以 code upsert。此次不新增第二套权限 API。旧前端存在三处过期限制：角色分配只读取列表前 100 项后再截取 40 项、权限树只显示数量、权限表没有翻页。现在角色分配直接使用完整权限树并支持搜索，权限树展示每个真实名称和 code，权限表继续使用分页列表 API 并提供翻页。

本微步骤没有 schema 或 migration 修改，也没有新增 mock、静态权限回退或浏览器本地角色数据。

隔离分支在 `3013/5183` 启动后完成认证 API smoke：数据库返回 11 个角色、36 个权限模块和 333 条有效权限；admin 角色分页返回 5 名当前人员，全部具有对应的有效角色分配。新前端 origin 未继承既有登录态，因此没有把未认证页面记作视觉验收。启动时还观察到本地 `needo_dev` 尚未应用另一分支的会员卡三色字段 migration；该差异与本微步骤无关，未在此执行 migration 或补写数据库。

## 2026-09-06 会员详细卡三色渐变与发布规则

本微步骤把原 `detailSurfaceColor` 保留为详细卡左上角色，并新增正式持久化字段 `detailSurfaceMiddleColor` 与 `detailSurfaceBottomColor`。运营后台预览和用户端详细会员卡共用 `linear-gradient(155deg, TOP 0%, MIDDLE 52%, BOTTOM 100%)`，避免两端视觉实现漂移。三个色阶的运营标签已补齐简体中文、繁体中文、日文、英文与韩文。

增量 migration `20260906130000_platform_membership_three_color_detail_surface` 先以原详细卡底色回填两个新字段，再将其收紧为 `NOT NULL` 并扩展现有 `#RRGGBB` 数据库约束，因此历史会员卡默认保持原有纯色效果。前后端继续校验十个颜色字段的十六进制格式，但不再以强调色与底色的对比度阻止保存或发布。

本地验收结果：

- 随机命名临时数据库迁移 checker 通过 5 项断言：两条旧记录回填一致、两个新字段均为非空、非法新色值被数据库约束拒绝；临时库已删除，`existingDatabaseModified=false`。
- 后端聚焦测试：12 suites / 44 tests 通过。
- 前端聚焦测试：9 files / 62 tests 通过。
- 后端 lint、后端 build、前端 typecheck lint 与前端 production build 均退出 0。

本微步骤未执行正式数据库 migration、未 push、未部署 staging；聊天无痕撤回的实际 IM 行为仍属于后续独立微步骤。

## 运营后台系统设置（2026-09-06）

运营后台的“系统设置”已从角色管理中拆出，固定使用
`/admin/settings/system?tab=basic|legal|storage|payment`；`/admin/roles` 继续只承载角色管理。
四个插页共用运营后台的 `ink/paper/line/mist` 视觉契约，现有 NDP 汇率页也已对齐该视觉体系，汇率版本、幂等键、409 冲突刷新锁和按评估时间分页逻辑未改变。

正式持久化与执行范围：

- 基础设置：站点开关、自助注册入口、Google 登录入口、登录页 LOGO、主导航 Request 图片，以及密码登录邮箱验证码总开关。验证码时间规则为“仅初次 / 每月初次 / 每次”单选，“新 IP 登录”可叠加；验证码关闭时保持原密码登录。关闭自助注册不会阻止运营后台通过正式用户管理 API 创建用户。品牌图片未配置数据库覆盖时，后台会显示客户端实际正在启用的系统默认图片，而不是“尚未设置”；登录页预览复用中央标识渲染，Request 预览复用主导航主题类，颜色会随各客户端 UI 主题适配。原生文件输入已替换为与运营后台一致的选择按钮、当前启用状态和格式说明。
- 政策和协议：目录分页、五种语言（`zh-CN`、`zh-TW`、`ja`、`en`、`ko`）独立草稿、分别保存、不可变发布版本、发布日期、发布历史、内部显示路径和链接开关。公开条款与隐私页面只读取已发布的当前语言版本，不跨语言回退；商户与 Affiliate 的接受快照继续使用正式协议版本。
- 储存设置：IM 消息默认 30 天、IM 媒体默认 3 天，只影响设置生效后创建的服务器记录；不要求或指示客户端删除本地聊天记录或媒体缓存。
- 支付设置：线下支付和 NDP 支付是当前可正式启停的能力，后端结算/支付入口会读取已发布设置并拒绝被关闭的方法。线下支付仍是现场人员、技师或店铺人工确认；PayPay、PayPal 保留为 NeeDo 发起的外部支付入口，Stripe 保留聚合支付项目入口，Apple 与 LINE 保留未来入口，这五项均不可操作且没有新增假 API、供应商调用或凭据字段。

正式 API：

- `GET /api/v1/platform/settings/public`
- `GET /api/v1/backoffice/system-settings`
- `PUT /api/v1/backoffice/system-settings/basic`
- `PUT /api/v1/backoffice/system-settings/payment`
- `GET /api/v1/legal-documents/:slug/current`
- `GET|POST /api/v1/backoffice/legal-documents`
- `PATCH /api/v1/backoffice/legal-documents/:publicId`
- `GET /api/v1/backoffice/legal-documents/:publicId/locales/:locale`
- `PUT /api/v1/backoffice/legal-documents/:publicId/locales/:locale/draft`
- `POST /api/v1/backoffice/legal-documents/:publicId/locales/:locale/publish`
- `GET /api/v1/backoffice/legal-documents/:publicId/locales/:locale/releases`

所有写入均经过 Zod、RBAC、乐观版本检查和审计。正式权限为
`backoffice:system-settings:read|write`、
`backoffice:system-brand-media:activate`、
`backoffice:im-retention:read|write`、
`backoffice:payment-settings:read|write`、
`backoffice:legal-documents:read|write|publish`。迁移只向 `admin` 与预定的 `operator` 角色授予写入/发布权限，`viewer` 只获得读取权限。

新增的加法迁移：

- `20260906100000_operations_system_settings`：平台设置版本、政策协议目录/语言草稿/发布版本、初始正式设置、权限与角色授权。
- `20260906110000_im_server_retention_defaults`：为既有 IM 服务器记录增加前瞻性的消息/媒体到期时间默认值与索引。

本地自动验证结果：

- 前端 `npm test`：354 个测试文件、2,473 项测试全部通过。
- 前端 `npm run lint`、`npm run i18n:quality`、`npm run verify:production-build`：全部通过；正式生产包审计通过 8 个 HTML 入口和 36 个资源。
- 后端系统设置定向测试：18 个套件、75 项测试全部通过；前端系统设置、公开投影、登录和 NDP 汇率聚焦回归另有 14 个文件、230 项测试通过。
- 后端 `npm --prefix backend run lint` 与 `npm --prefix backend run build`：全部通过。
- 后端全量基线运行暴露三个与本切片无关的既存问题：会员卡调整倒计时断言为 0、会员分析测试仍使用已不允许的 `operator` 身份类型，以及串行全量测试在约 4 GB 堆上最终 OOM；单独复跑 OpenAPI 超时项通过。本切片引入的两个 Auth repository 测试夹具已补齐登录证据端口并单独通过。

数据库与浏览器验收状态：

- 共享正式本地库 `needo_dev` 只执行了迁移状态读取，没有写入。系统设置分支只有 120 个历史迁移，而当前本地 `main` 已有 137 个；直接在临时库回放旧分支时，历史迁移 `20260902110000_agent_commission_operating_cost` 因已在 `main` 修正的外键规则失败。因此本次没有篡改已应用迁移，也没有把旧分支迁移历史写入共享库。
- 为完成可回滚验收，使用当前 `main` 的 137 个迁移与本分支两个加法迁移组成 139 个迁移的临时只读并集，部署到独立本地库 `needo_system_settings_qa_20260906`。139 个迁移全部成功，`prisma migrate status` 返回 schema up to date；两个功能迁移的 SHA-256 与分支文件逐字节一致。
- 在该隔离库运行 `backfill:system-settings` 成功，随后 `check:system-settings-flow` 通过真实 `/api/v1`、真实 Prisma/MySQL、RBAC、版本、审计和回滚校验；脚本结束时 `residue: 0`，没有把检查数据遗留到被测正式表。正式 seed 也在该隔离库成功完成，`admin`/`operator` 获得 10 项系统设置写入与发布权限，`viewer` 只有 4 项读取权限。
- 隔离服务分别监听后端 `3012`、前端 `5182`，进程 cwd 均指向当前功能 worktree；`/api/v1/health`、`/api/v1/ready`、运营后台入口与前端代理健康接口均返回 200。共享 `3000`/`5180` 服务没有停止或替换。
- 认证浏览器验收确认系统设置四个插页可以独立切换，`/admin/roles` 仍是独立角色管理页面。政策页新建了带公开链接的 QA 文档，中日文草稿切换时互不覆盖，并分别保存、发布为独立 v1；公开接口按 `zh-CN` 与 `ja` 返回相应标题、正文、发布日期、版本和显示位置。基础设置把验证码临时发布为“开启 + 每月初次 + 新 IP”，数据库生成 v2 和审计记录；随后经同一 UI 恢复为“关闭 + 仅初次 + 非新 IP”，生成 v3，字段与初始 v1 完全一致，历史版本未被覆盖。
- 基础设置品牌区已在认证浏览器中确认：两张卡片显示“系统默认 · 当前启用”，登录页中央标识与 Request 主导航中央按钮均显示实际默认资源；Request 预览呈现当前示例主题颜色，并明确提示其会随每位用户的 UI 主题适配。选择控件使用后台统一的圆角按钮，不再暴露浏览器原生文件输入。
- 储存页在浏览器显示默认 30/3 天和“只影响服务器前瞻保留、不删除设备本地记录/缓存”的边界；支付页显示当前线下/NDP 开关与 PayPay、PayPal、Stripe、Apple、LINE 的未接入项目入口。支付启停与 IM 保留期的真实写入/恢复由上述 checker 覆盖，本次浏览器没有重复制造额外版本。
- 角色卡片人员列表与权限树/API 最新性对账不在本系统设置微步骤内，未修改；它们必须作为独立的小步骤，以最新 User Management、权限常量、路由声明和数据库授权为共同依据实施。

## 政策目录补齐与编辑指引（2026-09-10）

运营后台政策目录固定覆盖 10 类当前业务文档：利用规约、个人信息保护方针、店铺服务规则与合同、联盟营销规则与合同、技师服务提供者协议、eKYC 同意与身份信息处理说明、取消与退款政策、NDP 使用规则、社区与内容发布规则，以及特定商取引法表示。

利用规约与个人信息保护方针继续从现有五语言正式内容源导入；店铺与联盟营销合同继续复用不可变合同正文和版本。其余六类在没有经过法务与运营审阅的正文时只创建后台目录，固定为 `isEnabled=false` 且没有发布版本，不会成为用户可见的假条款。运营人员仍须按语言保存草稿，并通过既有发布权限、版本锁和审计链路发布。

早期脚本遗留的 `other-rules-and-guides`、`cancellation-policy`、`service-provider-guide` 三个通用占位目录会在回填时受保护地软下线。只有名称、站内路径和空显示位置仍与旧脚本完全一致，同时保持未启用且不存在有效草稿或发布版本时才会执行；任何一项不满足都会报告冲突、保留原数据，并写入独立审计事件。

政策页顶部增加“选择政策类型 → 确认用户入口 → 完善各语言 → 保存并发布”流程图。新增表单可从推荐类型自动带出后台名称、稳定 slug、现有站内页面和建议展示场景；站内页面通过候选列表和 URL 组成示例说明，展示场景改为带中文用途说明的多选项，不再要求手工填写逗号代码。未知的历史显示位置会原样展示并保留，除非运营人员主动取消。

新增目录的业务关联如下：

- 技师协议：`technician-application`。
- eKYC 说明：`ekyc`、`merchant-application`、`technician-application`、`withdrawal`。
- 取消与退款：`booking-checkout`、`order-detail`、`cancellation`。
- NDP 规则：`ndp-wallet`、`booking-checkout`、`withdrawal`。
- 社区规则：`social-compose`、`social-report`。
- 特定商取引法表示：`paid-service`、`membership-purchase`、`footer`。

目录范围参考日本官方规则边界：个人信息的利用目的和第三方提供同意应具体、清晰；在线收费服务需要容易识别的销售条件及取消条件；符合前払式支払手段定义的价值还可能需要单独法定表示。运营主体、地址、代表者、价格、支付方式、eKYC 受托方、保存期限、退款和 NDP 法律性质等事实必须在启用前由 NeeDo 法务与运营确认。参考：[个人信息保护委员会通则指南](https://www.ppc.go.jp/personalinfo/legal/guidelines_tsusoku/)、[消费者厅通信销售规则](https://www.no-trouble.caa.go.jp/what/mailorder/rule.html)、[金融厅前払式支払手段资料](https://www.fsa.go.jp/common/about/pamphlet/shin-kessai.pdf)。

## 运营退款争议审核入口（2026-09-13）

`/admin/finance?module=refund-review` 现在进入正式退款争议审核工作区；为兼容已经发出的旧运营链接，`module=refunds` 解析为同一工作区。没有 `module` 查询参数时，`FinancePage` 继续显示原财务结算总览，两个模块不再同时发起请求或混用数据。

退款工作区只消费既有正式合同：

- `GET /api/v1/backoffice/refund-disputes`，要求 `backoffice:order-refund-dispute:read`，按 `open|resolved`、关键字和服务端分页读取已正式投诉的退款争议。
- `POST /api/v1/backoffice/refund-disputes/:disputeId/resolve`，要求 `backoffice:order-refund-dispute:resolve`，提交争议自身的 `expectedVersion`、唯一幂等键、公开裁定理由和可选内部备注。

页面按当前会话权限显示只读或可裁定状态，写操作需要二次点击确认。最终授权、身份范围、状态机、乐观版本、幂等、Affiliate 已结算奖励不撤回约束及审计仍全部由现有后端事务执行。页面不调用普通财务结算列表来推断退款案件，也不扩大直接支付退款接口的适用范围。

本微步骤没有新增 API、schema 或 migration，没有修改退款、支付、账本、RBAC 或审计后端契约，也没有新增 mock/fake/placeholder 数据。

## 订单金额历史兼容与跨端一致性（2026-09-13）

运营与商户订单接口继续共用 `projectOrderPayment`。存在有效 checkout 时，`checkoutAmountJpy` 始终是最终金额；无 checkout 时优先使用 `BookingOrder.paymentAmountJpy`。对于历史数据中 `paymentAmountJpy = 0`、但持久化 `priceAmount > 0` 的订单，接口读取同一订单的 `priceAmount` 作为兼容金额，并以 `amountSource = order_price` 明确标记来源，避免把兼容值伪装成已保存的支付金额。

新的正式 Booking 创建路径仍同时写入 `priceAmount` 与 `paymentAmountJpy`。未来六个月运营数据生成器也改为写入相同的持久化价格，并由独立 checker 对 `priceAmount`、`paymentAmountJpy` 和计划金额三方一致性进行核对。前端只格式化 API 返回的 `totalAmountJpy`，不使用常量、服务目录现价或浏览器 mock 兜底。

本微步骤没有 schema 或 migration 变化，没有改动支付状态机、RBAC、审计或金额写接口，也没有直接修订 staging/production 历史记录。
