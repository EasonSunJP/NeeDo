# Step 12 — Backoffice / Merchant Admin Real Data

本文件记录 Step 12 正式数据接入范围。运营后台与商户后台的总览、数据大屏和经营驾驶舱现已各自收敛为唯一的“数据大盘”，并从正式后端读取经营数据。

## 本次接入范围

- 运营后台 Dashboard：读取真实订单、排班、财务对账、技师、店铺汇总。
- 运营后台订单中心：读取 `/api/v1/backoffice/orders`。
- 运营后台财务结算：读取 `/api/v1/backoffice/finance/settlements`，并可调用导出接口。
- 运营后台技师 / 店铺管理：读取真实 `TechnicianProfile` 与 `Shop` 数据。
- 商户后台 Dashboard：按当前登录身份的 `shop` scope 读取本店数据。
- 商户后台订单中心：读取 `/api/v1/merchant-admin/orders`。
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
- `membership.memberCount` 是会员卡功能接通后的大字来源；本阶段会员数据源未建立，因此固定返回 `memberCount:null` 与 `memberDataStatus:"not_available"`。前端显示“会员数 —”和“会员功能尚未开放”，绝不把 `null` 转成 0，也不读取浏览器会员 Store。
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

- 隔离工作树以正式后端 `3000`、前端 `5180`、MySQL `3307`、Redis `6379` 启动；`/api/v1/health`、`/api/v1/ready` 与前端入口均通过。前后端监听进程的 cwd 均已核对为本隔离工作树。
- 正式 `admin@lifedance.com` 与 `merchant@example.com` 账号通过忽略跟踪的本地环境密码登录；验收过程未打印密码、Access Token 或 Refresh Token，也未修改订单、钱包、会员或其他业务数据。
- 运营数据大盘在 `1440×1000` 浅色与 `390×844` 窄屏完成验收：五个大指标、三个图表、三个 NDP 卡、六个预设期间、有效/无效自定义期间、城市应用/重置、失败后重试、键盘焦点、旧分析路由删除与横向溢出均通过。
- 商户数据大盘在 `1440×1000` 深色与 `390×844` 窄屏完成验收：店铺/计费/钱包、四个大指标、会员数不可用加真实利用者数、三个图表、NDP 成本拆分、冻结 NDP、期间筛选、无效期间恢复、失败后重试、键盘焦点、旧分析路由删除与横向溢出均通过。当前正式商户身份只有一个可管理店铺，因此切换按钮按合同隐藏；多店 Shop A → Shop B 轮换没有伪造浏览器证据，仍由自动化 API/状态机测试覆盖。
- 浏览器验收发现并修复了同店查询失败后遮罩阻断“重置/重试”，以及真正切店加载失败时遮罩阻断“重试”的两个恢复缺陷。同店失败现在保留并明确标记上次成功结果；遮罩仅在真实 owner 过渡的 loading 阶段冻结旧数据。
- 数据大盘 API、重试后的网络、SSE 导航退出与页面控制台没有未解释的失败；但两端共享的全局已发布内容加载仍发现五个 `/media/content/*` 404。它们是本地对象存储缺少已被数据库发布记录引用的媒体对象，不属于 Dashboard 请求，也不能在本次“禁止业务数据写入/无 migration”边界内伪造或修补。需由内容对象恢复或发布记录治理任务处理，详见对应实施计划的精确路径。

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

本微步骤仅交付 schema、migration、确定性回填与只读 checker。员工 CRUD API、商户页面正式切换、通知受众快照、共享数据库部署和浏览器验收仍未执行；在这些后续步骤完成前，现有技师员工接口仍是技师范围接口，不能宣称已经覆盖全部商户员工。

用户详情统一使用五个 tab：`基础资料`、`会员等级`、`预约与消费`、`权限与账号`、`用户动态`。头部只显示公开 NeeDoID 与业务状态，不显示内部 User/Profile 主键。用户动态通过独立分页 API 读取，每页可选 `10 / 30 / 50 / 100` 条，并复用正式联系人时间线视觉；正式空列表可显示明确的无记录状态，但不得用 demo 数值、列表行或 mock 关系补位。

商户用户管理只读会员等级；运营后台可在独立“会员等级”插页调用 `PUT /api/v1/backoffice/customers/:id/membership` 免费赋予等级，期限支持永久、按天或按月。后端持久化赋予方式、期限、起止时间与操作人，写操作要求 `backoffice:customers:write` 并记录 `backoffice.customer.membership.assign` 审计。此操作不扣款、不自动续费，也不触发转账。

会员授权 migration：`backend/prisma/migrations/20260829210000_customer_membership_grants/migration.sql`。既有用户默认保持 `self_service`，migration 不生成任何免费会员记录。

## 新增 API

运营后台：

- `GET /api/v1/backoffice/dashboard`
- `GET /api/v1/backoffice/orders`
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
