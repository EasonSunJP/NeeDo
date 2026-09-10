# NeeDo Exchange 情报直达正式预约设计

**日期：** 2026-09-05
**状态：** 产品语义已确认，待按独立实施计划开发
**范围：** 让商户或技师发布的 Exchange 情报绑定一个正式可预约服务，并让顾客从情报详情进入既有 Booking checkout，以情报活动价创建正式订单；同时统一情报详情中的店铺、技师和服务信息卡。

## 1. 背景与现状

NeeDo Exchange 当前已经完成正式需求与情报发布、选配抢单、精确匹配、匹配结果转预约及逐单双边取消。所有写入均通过 `/api/v1`、Prisma、MySQL、RBAC、审计和幂等边界完成。

情报直达预约尚未完成：

- `ExchangeIntelligence` 只有服务方式、地址摘要、服务区域和价格文本，没有正式 `Service` 或 `TechnicianService` 外键；
- 情报发布接口接受客户端提交的地址、服务区域和目录原价，不能证明这些展示内容来自当前店铺或技师的正式服务资料；
- 情报详情的发布者卡由快照字段临时拼接，没有复用已批准的店铺、技师和服务信息卡；
- 情报详情底部预约按钮明确禁用；
- `BookingOrder` 没有情报来源关系，通用预约也不能证明活动价来自哪一条有效情报；
- 现有 `/checkout/:serviceId` 只接受数字店铺服务 ID，技师服务入口生成的带前缀参数会被拒绝。

因此不能只启用按钮或传递前端价格。必须建立正式服务关系、服务端授权与价格解析、订单来源证据、数据库约束，以及两类服务的 checkout 入口。

## 2. 已确认产品语义

1. 一条新情报必须绑定作者当前作用域内一个已审核、启用且可预约的正式服务。
2. 商户身份只能绑定当前店铺的 `Service`；技师身份只能绑定本人当前有效从属店铺下的 `TechnicianService`。
3. 顾客从情报创建预约时，订单锁定情报展示的活动价，不改用预约时的目录现价。
4. 活动价不得高于发布时由服务端解析的目录价；客户端不能提交目录原价、店铺 ID、技师 ID、服务归属或订单价格。
5. 预约必须继续使用既有 `BookingOrder`、`ScheduleSlot`、订单状态机、通知、审计、支付方式和幂等系统，不新建 Exchange 专用订单或排班系统。
6. 本步骤只创建普通正式预约，不自动收取服务款、不调用外部支付、不处理支付退款，也不改变 Affiliate 奖励/退款规则。
7. 情报已撤回、关闭、过期，服务已停用/下架/失去审核资格，作者已失去对应店铺或技师关系，或所选时段不在情报服务时间范围内时，不允许新建预约。
8. 同一有效情报可以被不同顾客预约不同可用时段；通用 Booking 的并发、容量及同一顾客待处理预约替换规则继续生效。

## 3. 采用方案

采用“正式服务绑定 + 复用通用 Booking + 情报来源快照”。

不采用以下方案：

- 只把按钮跳到普通服务详情：无法保证活动价、情报有效期和订单来源一致。
- 由前端把活动价提交给通用 Booking：价格可篡改，且无法形成审计证据。
- 新建 Exchange 情报订单表：会复制排班、订单、支付和履约状态机。

## 4. 数据模型与 migration

使用一份前向 additive migration，不修改任何已应用 migration。

### 4.1 `ExchangeIntelligence`

新增：

- `serviceId Int?`：店铺服务外键；
- `technicianServiceId Int?`：技师服务外键；
- `serviceNameSnapshot String?`：发布时服务名称快照；
- `serviceDurationSnapshot Int?`：发布时服务时长快照；
- 与 `Service`、`TechnicianService`、`BookingOrder` 的 Restrict 关系；
- 两个服务外键索引及软删除查询索引。

数据库 CHECK 允许两种且仅两种结构：

1. 旧情报：两个服务外键和两个服务快照全部为空；
2. 新情报：两个服务外键恰好一个非空，名称非空，时长为正整数。

应用层从新版本开始拒绝未绑定服务的发布。旧情报不会根据标题、价格或作者随意猜测服务关系；它们仍可读取和互动，但返回 `booking.available=false` 及稳定不可预约原因。

### 4.2 `BookingOrder`

新增：

- `exchangeIntelligencePostId Int?`，外键直接引用 `exchange_intelligences.post_id`，从数据库层保证来源确实存在 Intelligence 子记录；
- `exchangeIntelligence` 可选关系；
- `[exchangeIntelligencePostId, createdAt]` 索引。

该字段不是唯一键：同一情报允许产生多张独立预约。订单已有的 `serviceNameSnapshot`、`serviceDurationSnapshot`、`servicePriceSnapshot`、`priceAmount`、`paymentAmountJpy` 和 `serviceSnapshotJson` 保存活动价及服务快照，不新增第二套金额字段。

### 4.3 约束与旧数据

- 所有新外键使用 `ON DELETE/UPDATE RESTRICT`；
- 软删除记录不作为新预约来源；
- migration 不更新、删除或伪造旧业务记录；
- 本地 simulation/Exchange seed 更新为从真实已审核服务中选择确定性绑定，不创建影子店铺、技师或服务；
- migration checker 必须核对物理字段、CHECK、索引、外键、Prisma migration 记录及旧行不变性。

## 5. 发布与读取 API

### 5.1 服务选项

新增受保护分页接口：

`GET /api/v1/exchange/intelligence/service-options?page=1&page_size=20`

服务端根据当前 active identity 返回：

- 商户：当前作用域店铺内已审核、启用、可预约的 `Service`；
- 技师：本人有效从属店铺下已审核、启用、可预约的 `TechnicianService`；
- 其他身份：403。

每项包含：

- `serviceRef`：`shop:{serviceId}` 或 `technician:{technicianServiceId}`；
- 服务名称、时长、目录价、服务方式及可用状态；
- 正式店铺摘要；
- 技师服务额外返回规范 `s##########` 技师 ID 和技师摘要。

列表必须分页、过滤软删除，避免 N+1，并声明 OpenAPI、Zod 与 RBAC permission。

### 5.2 发布情报

`POST /api/v1/exchange/posts` 的 Intelligence 分支新增必填 `serviceRef`，保留作者输入的标题、详情、内容语言、活动价和服务/有效时间。

以下字段不再由客户端作为权威来源：

- `originalPriceJpy`；
- `serviceMode`；
- `addressLabel`；
- `serviceAreas`；
- 店铺、技师及服务归属 ID。

为避免同一 `/api/v1` 版本内的旧客户端突然失效，这些旧字段可在过渡期保持 optional，但 Repository 一律忽略其业务值并使用正式关系重新解析；响应和新前端只使用服务端值。`serviceRef` 对新发布必填，缺失时返回稳定错误，不能继续产生新的无绑定情报。

Service 在事务内重新读取服务、店铺、技师从属与当前身份范围，解析目录价、服务方式、地址和服务区域，保存关系与快照，并写审计。幂等 fingerprint 必须包含 `serviceRef` 和活动价；相同 key 不同服务或价格返回稳定 409。

### 5.3 情报详情投影

正式情报 payload 增加：

- `booking.available`；
- `booking.unavailableReason`；
- `booking.target`：服务类型和 API 服务 ID；
- `booking.originalPriceJpy` 与 `booking.campaignPriceJpy`；
- `booking.serviceName`、`durationMinutes`、服务方式；
- `publisherCard`：当前正式店铺或技师卡片投影；
- `serviceCard`：当前正式服务投影。

实体卡只返回公开业务字段，不返回内部 user/identity/relation ID、电话、邮箱、家庭地址或未公开认证资料。技师链接统一使用 `s##########`；店铺使用正式公开 ID/路由，不把内部数字关系键显示为店铺 ID。

## 6. Checkout 与 Booking

### 6.1 路由

保留现有店铺服务兼容路由：

- `/checkout/:serviceId`

新增明确的技师服务路由：

- `/checkout/technician-service/:technicianServiceId`

情报入口附加 `exchangePost=<postId>`。前端使用统一的 typed catalog reference，不再生成随后会被 `CheckoutPage` 拒绝的伪 service ID。

为保证技师服务链接刷新后仍能独立恢复，新增受保护的顾客只读接口：

`GET /api/v1/technician-services/{id}/booking-context`

它只返回仍隶属有效店铺与公开技师、已审核、启用、可预约的技师服务及预约所需公开卡片字段；不存在或不可公开统一返回 404，不泄露下架原因或内部从属关系。

### 6.2 Checkout 读取

Checkout 同时读取：

- 正式店铺服务或技师服务详情；
- 对应 availability；
- 指定情报的当前 booking projection。

只有在情报仍可预约且服务关系完全匹配时展示活动价。页面明确显示“来自 NeeDo 情报”、目录价、活动价、发布店铺/技师卡、服务卡、可预约时段和支付方式。所有时段必须完整落在情报的 `serviceStartAt <= slot.startsAt < slot.endsAt <= serviceEndAt` 范围内。

活动价是订单的服务价快照。当前 `main` 已有或随后合并的交通费、税费、会员卡等正式规则继续作为独立明细处理，不得把它们悄悄覆盖进活动价，也不得因本步骤改变其计算顺序。Affiliate 折扣/奖励不与情报活动价新增叠加规则。

### 6.3 创建预约

通用创建预约请求增加可选 `exchangeIntelligencePostId`。客户端仍不提交价格。

Repository 在同一事务中按稳定顺序锁定：

1. 顾客及当前身份；
2. 情报 Post/Intelligence；
3. 绑定 Service 或 TechnicianService、店铺、技师从属；
4. ScheduleSlot；
5. 会冲突的 Booking。

然后重新验证：

- 情报类型、状态、有效期与服务时间；
- 服务引用与请求 service ID 完全一致；
- 服务、店铺、技师从属仍有效、已审核、可预约；
- slot 的店铺、技师、服务、时间和容量一致；
- 活动价仍为情报中持久化金额；
- 当前顾客具备现有 Booking permission 和合规资格。

成功后创建一张普通正式 `PENDING` BookingOrder：

- `exchangeIntelligencePostId` 指向来源情报；
- 服务金额快照使用情报活动价；
- 服务名称/时长使用情报不可变快照并与当前关系交叉校验；
- `serviceSnapshotJson` 记录不含隐私的来源类型、post ID、目录价、活动价和服务 ref；
- slot 容量、状态历史、通知、审计及现有财务前置规则与普通 Booking 保持一致；
- 不自动完成支付。

幂等重放必须返回同一订单；相同 key 绑定不同情报、服务、slot 或付款字段必须冲突。并发争抢最后容量时只允许一个事务成功。

## 7. 信息卡与页面设计

情报详情不再维护独立 `PublisherCard` 视觉和字段拼接，改为复用正式共享组件：

- 店铺/技师：`UnifiedProfileCard` 对应的正式 variant；
- 服务：`UnifiedServiceInfoCard`；
- checkout 使用相同 mapper 与字段顺序，避免详情与结账显示不一致。

### 7.1 店铺卡最低字段

- 正式公开店铺 ID；
- 店铺名称、头像/封面；
- 营业/可预约与审核状态；
- 评分、评价数；
- 地址与服务方式；
- 服务名称、目录价、活动价、时长；
- 指向正式店铺详情的入口。

### 7.2 技师卡最低字段

- 规范 `s##########` 技师 ID；
- 姓名、头像、所属店铺；
- 从业年数、接单率、评分、评价数；
- 服务区域和语言能力；
- 服务名称、目录价、活动价、时长；
- 指向正式技师资料及技师服务的入口。

缺失的可选公开资料显示明确空状态，不使用假头像、假评分、假评价、假地址或由内部数字 ID 拼接的公开 ID。服务或实体已变为不可公开时，保留订单快照，但新 checkout fail closed。

## 8. RBAC、隐私与审计

- 新服务选项 permission 只分配给 technician、merchant_owner、具备发布资格的 merchant_staff 及 admin；
- 发布继续要求 Exchange Intelligence 发布 permission，并由 Service 复核 identity scope；
- 预约继续要求正式 Booking create permission；情报来源不能扩大该权限；
- API 不接受 actor user ID、identity ID、shop ID、technician ID、价格或认证状态；
- 审计记录发布时选择的 service ref、活动价和目标公开实体类型；预约审计记录来源 post ID 和订单 ID，不保存电话、邮箱、完整用户地址或 token；
- 通知复用正式 Booking 通知，增加可本地化的情报来源说明，不泄露服务备注以外的私人内容。

## 9. 稳定错误与失败处理

至少覆盖：

- `error.exchange.intelligence_service_required`；
- `error.exchange.intelligence_service_not_found`；
- `error.exchange.intelligence_service_forbidden`；
- `error.exchange.intelligence_service_unavailable`；
- `error.exchange.intelligence_campaign_price_invalid`；
- `error.exchange.intelligence_booking_unavailable`；
- `error.exchange.intelligence_booking_service_mismatch`；
- 既有 Booking 的 slot unavailable、conflict、identity forbidden、idempotency conflict。

前端针对 loading、empty、403、404、409、过期、服务下架、slot 竞争和网络不确定失败提供明确可恢复状态。网络不确定失败重试复用原幂等 key；持久化版本或输入变化后才生成新 key。

## 10. 测试与验收

### 10.1 自动化

严格按 TDD 分批完成：

1. schema/migration contract；
2. service option repository/service/API/RBAC/OpenAPI；
3. Intelligence 发布授权、服务端字段解析及幂等；
4. Booking 来源、活动价、slot/服务/身份校验、回滚与并发；
5. 店铺服务与技师服务 checkout；
6. 店铺/技师/服务共享信息卡及五语言文案；
7. 发需求、发情报、抢单、匹配预约、双边取消回归。

最终运行：Prisma generate/validate、backend lint/build、frontend lint/build、相关测试、后端四分片完整 suite、前端完整 suite，以及 `git diff --check`。

### 10.2 真实 MySQL

guarded checker 只能连接明确的非生产本地 MySQL，使用随机 scratch 数据库和专用最小授权账号：

- 从空库应用当前全部 migration；
- 验证新 migration 的字段、CHECK、索引、Restrict FK 和 migration history；
- 真实商户发布店铺服务情报；
- 真实技师发布本人服务情报；
- 顾客分别按活动价创建订单；
- 验证订单来源、金额快照、slot 容量、状态历史、通知和审计；
- 验证跨店/冒用、旧情报、撤回/过期、下架服务、时间越界、价格篡改、幂等冲突、事务故障注入；
- 使用独立连接验证最后容量并发只有一个成功；
- checker 结束后删除捕获的全部 marker 数据、scratch database 和专用账号，并证明原数据库零修改。

本地 `needo_dev` migration 应用必须单独记录。若存在其他任务的未审 migration，不通过 blanket deploy 绕过；先确认 migration 顺序和所有权。

### 10.3 正式浏览器

在来源明确的隔离 runtime 与真实测试账号中完成：

1. 商户选择本店正式服务并发布情报；
2. 技师选择本人正式服务并发布情报；
3. 顾客从两个 portal 可见的正式 Exchange 情报详情读取内容；
4. 核对店铺卡、技师卡、服务卡全部字段、公开 ID、链接、图片、价格和时长；
5. 点击预约进入对应 checkout，核对来源、活动价、可用时段和卡片一致；
6. 分别创建店铺服务和技师服务订单，刷新后仍可读取；
7. 商户、技师和顾客订单详情显示相同来源及价格事实；
8. 回归发需求、发情报、选配抢单、匹配预约和双边取消；
9. 320×956、440×956 和桌面宽度无横向溢出；键盘焦点、loading/error/empty 可用；
10. 浏览器 console 无未豁免错误，网络请求无意外 4xx/5xx。

保存截图、关键 API 响应字段、订单号和数据库行证据。浏览器成功不替代数据库验收，自动测试成功也不替代浏览器验收。

## 11. 提交与发布边界

本微步骤完成定义：

- 功能分支实现并通过独立代码审查；
- migration、真实 MySQL、自动化、正式浏览器及卡片字段验收全部通过；
- 与最新本地 `main` 合并，且不覆盖其他工作树的未提交文件；
- 合并后重新运行重点回归并停止本轮 runtime。

远程 push、staging/production migration、部署、外部支付和 post-deploy smoke 是独立发布门禁，不因本地完成自动执行。

## 12. 后续独立微步骤

本设计不同时实现：

- Quick mode 自动匹配；
- 发布者手动结束未满员匹配及其费用规则；
- 服务款自动支付、退款或外部支付；
- Affiliate 退款责任或奖励冲正；
- 其他全站资料卡/mock 一次性重构。

这些能力必须分别完成产品语义、spec、migration/API/UI、真实 MySQL、浏览器和本地 main 门禁。
