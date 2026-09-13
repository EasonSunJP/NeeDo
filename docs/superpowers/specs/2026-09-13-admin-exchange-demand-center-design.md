# 运营后台 Exchange 需求与抢单核验中心设计

## 目标

把 `/admin/orders/demands` 与 `/admin/orders/info` 从源码门禁页替换为只读取正式 Exchange 数据的运营核验中心。页面必须展示持久化发布、抢单、匹配和发布费证据，不引入新的发布、审核、撤回、导出或资金写入能力。

## 已确认现状与根因

- `ExchangePost`、`ExchangeDemand`、`ExchangeClaim`、`ExchangeRequestMatching`、`ExchangeMatchParticipant`、`ExchangeMatchEvent`、`ExchangeRequestFinancial`、`WalletHold`、`LedgerTransaction` 与 `AuditLog` 已经是正式事实来源。
- 用户、商户、技师端通过现有 Exchange service/state machine 使用这些记录；发布费通过现有账本服务冻结，并在正式终态释放或实扣。
- 运营前端仍由 `NeedoExchangeAdminPage.tsx` 主动渲染“未启用”，现有测试也锁定该门禁；后端没有运营专用全量只读 projection 与 RBAC 路由，所以不能安全地直接删除门禁。

## 方案选择

采用独立的运营只读聚合边界：新增 `ExchangeOperationsRepository -> ExchangeOperationsService -> ExchangeOperationsController -> /backoffice/exchange/posts` 路径，直接聚合既有正式表。用户端 Exchange repository 不扩张为运营万能接口，因为其 owner/participant 可见性规则与运营核验语义不同；同时不新建表、不复制状态、不读取前端 mock。

列表接口提供类型、状态、匹配方式、发布身份与关键字筛选，统一分页；详情接口返回同一记录的需求/情报、抢单、匹配、发布费与时间线快照。两个接口都要求专用 `backoffice:exchange:read` permission，并仅挂载在 backoffice/ops route manifest。

## 数据与隐私边界

- 发布主体只返回脱敏 public ID、脱敏显示名和身份类型，不返回 userId、identityId、邮箱或电话。
- 需求地址只返回 `areaLabel` 与 `addressLine1`；`addressLine2`、`addressLine3` 和公开标记不进入运营 DTO，避免与独立“匹配前地址泄露”修复任务发生冲突。
- 抢单方返回脱敏服务者标识/姓名、店铺名、技师脱敏姓名、正式服务快照、报价、时段与状态；不返回联系方式。
- 发布费返回状态、金额、币种、规则版本、hold/实扣/释放数额与时间。账本时间线只返回交易类型、状态、金额、币种和发生时间，不返回钱包 owner ID 或内部 metadata。
- 运营详情不调用用户端 `findPostById`，因此不会误用“owner/matched participant”地址披露规则。

## 状态与异常处置边界

本次只展示现有正式状态：`published`、`matched`、`expired`、`withdrawn`、`closed`，以及现有 claim/matching/financial 状态。当前 Prisma 枚举没有 `draft` 或 `rejected`，也没有审核/驳回导致的通知、资金和审计规则，因此不新增审核、驳回或强制撤回写接口。页面明确标注为只读核验；草稿、驳回和运营强制处置留作产品状态机定义后的独立微步骤。

## 前端信息结构

沿用运营后台现有 `AdminLayout`、`ModuleShell`、`DataTable`、`Drawer`、`DetailGrid`、`Badge` 与按钮样式。列表优先显示状态、发布主体、服务范围、预算/价格、有效期、抢单与匹配数量、资金状态；抽屉依次展示发布内容、需求/情报参数、发布费证据、抢单响应、匹配结果与合并时间线。无需新增颜色、字体或动效系统。

## 错误与空态

- 401：提示重新登录。
- 403：提示当前身份没有 Exchange 运营核验权限。
- 404：提示记录不存在或已软删除。
- 5xx/网络失败：保留筛选状态并提供重试。
- 空列表：区分“正式库暂无记录”和“当前筛选无结果”，不生成示例数据。

## 验证

- 先把现有门禁测试改成失败测试，要求正式 API 消费、分页、筛选、详情和无 mock。
- 后端 service/repository/API 测试覆盖全量运营读取、状态/类型过滤、软删除、详情聚合、发布主体与地址脱敏、抢单/匹配/费用/审计时间线、401/403/404、分页及 dedicated permission。
- OpenAPI 与 permission migration 测试证明 Zod、分页上限、RBAC 和 ops-only 路由。
- 前端 API/page 测试覆盖正式数据、空态、错误态、分页、筛选、需求/情报模式与详情抽屉。
- 运行相关测试、前后端 lint/typecheck/build；再在非 5180 端口做页面/API 验证。合并本地 main 后才切换 5180，并重新做最终验证。

