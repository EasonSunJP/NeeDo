# NeeDo 商户端联盟营销任务工作区与大版本隔离设计

## 1. 状态、目标与交付边界

本设计在 2026-08-30 经用户逐段确认，并补充确认以下发布边界：联盟营销当前不是紧急上线能力，应作为后续独立大版本继续开发；本次及后续联盟营销提交必须保留在独立 Git 分支和 worktree 中，在用户明确批准大版本整合前不得合入 `main`。

本微步骤的产品目标是完成商户端“我的联盟营销”正式工作区，让有权限的商户成员可以使用真实 API 和真实数据库：

- 查看、筛选和分页读取自己可管理的联盟营销任务。
- 以当前店铺或商户账号下多个店铺为发布主体创建任务。
- 选择正式在营店铺和有效服务。
- 配置佣金、客户优惠、时间窗口和领取限制。
- 维护日语、英语、韩语、繁体中文和简体中文内容。
- 在提交前看到只读的平台服务费和预算冻结预览。
- 提交审核，并查看服务端持久化的状态、拒绝原因、预算快照和时间线。
- 在统一身份切换页的“联盟营销”名称旁显示固定 `TEST` 标签。

本微步骤不是把整个联盟营销大版本一次性合入现行产品，也不改变 `main` 的发布内容。完成标准是功能在隔离 worktree 中可运行、可测试、可回滚，并具备后续大版本验收条件。

## 2. 已有正式基础与当前缺口

### 2.1 继续复用的正式基础

后端已经具备以下正式任务能力，页面不得复制第二套状态机或本地数据源：

- `AffiliateTaskService`、`AffiliateTaskRepository`、平台费解析和账本冻结。
- `shop` 与 `merchant_account` 两种发布主体。
- `draft`、`pending_review`、`scheduled`、`active`、`paused`、`budget_exhausted`、`ended`、`cancelled`、`rejected` 状态。
- 五语言翻译、`lockVersion` 乐观锁和范围快照。
- 提交时的平台费一致性检查、商户余额检查和原子预算冻结。
- RBAC、Zod、OpenAPI、分页、软删除和 AuditLog。

继续复用以下权威写接口：

```text
GET   /api/v1/merchant-admin/affiliate/tasks
POST  /api/v1/merchant-admin/affiliate/tasks
GET   /api/v1/merchant-admin/affiliate/tasks/:taskId
PATCH /api/v1/merchant-admin/affiliate/tasks/:taskId
PUT   /api/v1/merchant-admin/affiliate/tasks/:taskId/locales/:locale
POST  /api/v1/merchant-admin/affiliate/tasks/:taskId/submit
```

现有权限保持权威：

```text
page:merchant-affiliate-task
button:merchant-affiliate-task-create
button:merchant-affiliate-task-submit
```

### 2.2 当前缺口

当前商户后台没有正式联盟营销入口、任务页面和前端 API client。现有写接口也没有提供适合页面使用的“当前账号可管理哪些发布主体、店铺和服务”读取契约，页面不能安全推断商户账号范围，更不能从 legacy mock 或 `stores[0]` 取得默认店铺。

因此本微步骤只新增页面所需的最小正式读取能力和费用预览，不扩展达人市场、榜单或邀请流程。

## 3. Git、worktree 与发布隔离

### 3.1 当前功能工作树

本功能在以下隔离环境继续开发：

```text
branch:   codex/affiliate-merchant-task-workspace
worktree: .worktrees/affiliate-merchant-task-workspace
```

所有本规格、实现、测试和验收证据都提交到该分支。不得在根工作树的 `main` 上复制、暂存、提交或回滚这些文件。

### 3.2 联盟营销大版本隔离规则

- 每个尚未完成的联盟营销纵向切片使用独立 `codex/affiliate-*` 分支和独立 worktree。
- 已经位于独立 worktree 的联盟邀请、联盟资料和本任务工作区保持隔离，不移动到根工作树。
- 没有独立工作树但仍需继续开发的联盟分支，在再次开发前才创建明确命名的 worktree；不得为了“整理”而批量改写历史。
- 已经存在于 `main` 的联盟营销基础代码、migration 和测试不做逆向删除或历史重写。隔离只约束新增和未发布工作，避免破坏现行代码与其他任务的祖先关系。
- 功能完成后只记录分支、HEAD、依赖和验收状态，不自动 merge、cherry-pick、push 或部署。
- 后续大版本整合时，新建独立的 `codex/affiliate-release-*` 集成 worktree，从当时最新且干净的 `main` 创建；联盟功能分支只合入该集成分支，完整回归和浏览器验收通过且用户明确批准后，才允许进入 `main`。
- 联盟分支需要吸收现行公共修复时，只把已提交的 `main` 合入联盟分支或发布集成分支；不得把联盟分支反向合入其他进行中的任务分支。
- 任何联盟分支存在预期 RED 契约测试、migration 不一致或资金流未验证时，均标记为不可整合。

### 3.3 不影响其他任务的约束

- 不改写、删除或暂存根工作树中的未提交文件。
- 不改动其他 worktree 的分支指针、工作目录或运行端口。
- 不复用其他任务的临时数据库，不在共享数据库执行无清理边界的 destructive seed。
- 不修改非联盟模块的公共逻辑，除非页面接入不可避免；任何共享组件修改必须保持默认行为不变并有回归测试。
- 不改变用户、技师、店铺身份的切换行为；`TEST` 仅是联盟身份的视觉标记。
- 不以“联盟版本尚未上线”为理由加入空页面、假数据、静默 fallback 或绕过权限的入口。

## 4. 信息架构与路由

### 4.1 商户端导航

在现有 `MerchantAdminLayout` 中新增“联盟营销”分组。本微步骤只显示“我的联盟营销”一个可用菜单项。

以下未来入口不在本微步骤显示，也不创建空路由：

- 达人广场。
- 达人动态。
- 营销热榜。

建议正式路由：

```text
/merchant-admin/affiliate/tasks
```

路由、菜单和页面都由 `page:merchant-affiliate-task` 保护。没有权限时不展示菜单；直接访问返回既有权限拒绝页面，不渲染任务数据。

### 4.2 身份切换页 `TEST` 标签

统一身份切换页中的联盟营销行显示为：

```text
联盟营销  TEST
```

规则：

- `TEST` 紧邻联盟营销名称，而不是放在说明文本、操作按钮或页面顶部。
- 只在 `row.kind === "affiliate"` 的身份行显示，用户、技师和店铺身份不显示。
- 无论联盟身份处于未开通、审核中、可切换或当前身份，标签都保持可见。
- 使用现有主题 token，浅色和深色主题均有可读对比度；不新增全局颜色常量。
- `TEST` 是稳定环境标记，沿用运营后台现有大写文案，不做语言翻译。
- 无障碍名称包含“联盟营销 TEST”；标签本身不响应点击，不改变行的点击、键盘或禁用语义。
- 该修改随联盟大版本分支隔离，不单独合入 `main`。

## 5. 发布主体与正式资源读取

### 5.1 原则

前端只能使用服务端根据当前会话和 RBAC 返回的可管理范围。后端不接受页面声称的账号所有权，不因请求带有内部 ID 就授予访问。

读取链路为：

```text
当前会话
  -> 可管理发布主体
  -> 该主体下有效店铺
  -> 所选店铺下有效服务
  -> 当前时点平台费预览
```

每一级都重新验证 `deletedAt IS NULL`、账号有效、商户成员关系和店铺归属。

### 5.2 发布主体列表

新增分页读取接口：

```text
GET /api/v1/merchant-admin/affiliate/publishers?page=1&pageSize=20&keyword=...
```

响应中的每个主体至少包含：

```ts
type MerchantAffiliatePublisherOption = {
  publisherType: "shop" | "merchant_account";
  merchantAccountId: number | null;
  shopId: number | null;
  displayName: string;
  current: boolean;
  manageableShopCount: number;
};
```

`merchantAccountId` 和 `shopId` 是后续 API 请求所需的技术字段。前端不得把 `merchantAccountId` 渲染、复制、搜索或作为商户编号展示。商户主体只显示正式商户名称；单店主体显示店铺名称和店铺公开 ID。

接口使用 `page:merchant-affiliate-task`，必须分页，默认每页 20，最大 100。Repository 负责范围过滤，Service 负责当前会话和主体可管理性规则，Controller 只处理请求响应。

### 5.3 店铺列表

新增分页读取接口：

```text
GET /api/v1/merchant-admin/affiliate/shops
  ?publisherType=shop|merchant_account
  &merchantAccountId=...
  &page=1&pageSize=20&keyword=...
```

`shop` 主体忽略外部传入的商户账号范围，只返回当前会话所管理的当前店铺。`merchant_account` 主体必须验证该 `merchantAccountId` 位于当前用户可管理账号集合内。

响应项至少包含：

```ts
type MerchantAffiliateShopOption = {
  shopId: number;
  publicId: string;
  name: string;
  city: string;
  activeServiceCount: number;
};
```

页面展示 `name`、`publicId`、城市和有效服务数量。正式店铺公开 ID `publicId` 必须显示；数据库 `shopId` 只用于请求和选择状态，不作为店铺编号展示。

### 5.4 服务列表

新增分页读取接口：

```text
GET /api/v1/merchant-admin/affiliate/services
  ?shopIds=...
  &page=1&pageSize=20&keyword=...
```

后端先验证所有 `shopIds` 都属于当前选定且可管理的发布主体，再返回有效服务。响应项至少包含：

```ts
type MerchantAffiliateServiceOption = {
  serviceId: number;
  shopId: number;
  serviceName: string;
  priceJpy: number;
  shopName: string;
  shopPublicId: string;
};
```

页面展示服务名称、价格和所属店铺名称。服务数据库 ID `serviceId` 不显示；所属店铺的公开 ID只在店铺维度展示，不在每个服务名称后重复堆叠。

### 5.5 费用预览

新增只读接口：

```text
POST /api/v1/merchant-admin/affiliate/tasks/fee-preview
```

请求包含发布主体技术字段、所选 `shopIds` 和 `totalBudgetNdp`。客户端不指定费率解析时间；服务端按收到预览请求的当前时间解析，与现有 submit 语义一致。响应至少包含：

```ts
type MerchantAffiliateFeePreview = {
  evaluatedAt: string;
  effectiveAt: string;
  platformFeeBps: number;
  commissionBudgetNdp: number;
  platformFeeReserveNdp: number;
  grossFreezeNdp: number;
  shopRateStatus: "consistent";
};
```

预览必须复用正式平台费解析服务，验证多店费率一致性，并明确标记计算时间。预览不创建任务、不冻结钱包、不写账本；它不是提交事务的授权快照。

提交时服务端必须重新解析发布范围、服务状态、费率和余额。如果预览与提交之间规则变化，以提交事务为准，返回明确冲突或新的费用结果，不得静默使用过期预览。

多店费率不一致时返回 `error.affiliate.platform_fee_rate_mismatch`，且没有任务状态变更、钱包 mutation、Reservation、Ledger 或 AuditLog 成功记录。

## 6. ID 显示与隐私契约

页面采用“公开业务编号可见、内部关联键不可见”的规则：

| 对象 | 页面显示 | 页面不显示 |
|---|---|---|
| 联盟任务 | `taskCode` | 内部 `AffiliateTask.id` |
| 店铺 | 店铺名称、正式 `publicId` | 数据库 `shopId` |
| 服务 | 名称、价格、所属店铺名称 | `serviceId` |
| 商户主体 | 商户名称 | `merchantAccountId` |
| 达人/联盟成员 | 显示名、`needoId` | `userId`、`identityId` |

内部 ID 可以作为受类型约束的 API 参数和 React state 存在，但不得：

- 出现在可见文本、tooltip、复制按钮、表格列或空状态。
- 被当成公开编号写入 URL query、下载文件或用户可见错误。
- 被写入前端 debug 日志、埋点标签或 toast。

后端仍必须对每个内部 ID 做会话范围验证，不能把“前端隐藏”当成安全措施。

## 7. 页面结构与交互

### 7.1 列表工作区

页面沿用 `MerchantAdminLayout`、现有主题 token、表格、Badge、Drawer 和分页组件，不引入第二套 UI 框架。

顶部包含：

- 页面名称“我的联盟营销”。
- 简短的正式数据说明。
- 有创建权限时显示“创建任务”。
- 关键词、任务状态和发布主体筛选。

桌面列表列为：

- 任务编号 `taskCode`。
- 任务名称和当前内容语言。
- 店铺名称与正式店铺公开 ID；多店任务显示首批店铺摘要及总数。
- 状态。
- 单单佣金、平台费率和总冻结金额。
- 领取/任务时间窗。
- 最后更新时间。

列表必须使用服务端返回的 `total`、`page` 和 `page_size`。不得把当前页数组长度当作全局统计，也不在页面加载后用浏览器数组重新模拟分页。

点击行在桌面打开右侧详情/编辑 Drawer；窄屏进入占满视口的编辑表面。两种布局使用同一份表单模型和 API，不维护两套字段规则。

### 7.2 创建与编辑向导

编辑器分六步：

1. 基本信息。
2. 发布主体、店铺和服务范围。
3. 单单佣金与客户优惠。
4. 领取窗口、任务窗口和次数限制。
5. 五语言内容。
6. 财务确认与提交审核。

首次保存直接调用正式创建接口生成数据库 `draft`，再使用服务端返回的 `taskCode`、内部 `id` 和 `lockVersion` 继续编辑。不得把草稿只保存在 `localStorage`、页面内数组或 mock store。

只有 `draft` 可编辑。`rejected`、`pending_review` 及其他状态在本微步骤均为只读；页面不新增“强行改回草稿”或复制被拒任务的行为。

### 7.3 单店与多店

单店模式：

- 发布主体是 `shop`。
- 店铺由会话授权范围决定，不允许页面替换成未授权店铺。
- 创建请求不发送 `merchantAccountId` 或额外 `shopIds`。

多店模式：

- 发布主体是 `merchant_account`。
- 必须选择当前成员可管理的一个商户主体和至少一个有效店铺。
- 服务选择只能来自已选店铺。
- 删除某店铺时，页面同步移除该店铺下已选服务，并要求重新预览费用。
- 所有选中店铺在费用预览和最终提交各自的服务端解析时点，平台费率必须一致。

改变发布主体时清空不再有效的店铺、服务和费用预览；不得保留隐藏的旧 ID 进入提交请求。

### 7.4 服务范围

`all_current_services` 表示提交时对所选店铺全部当前有效服务生成范围快照。为兼容现有严格写契约，页面发送 `selectedServiceIds: []`，不得发送隐藏的旧服务 ID。

`selected_services` 要求至少选择一个服务，页面发送去重后的内部 `serviceId` 数组。后端再次验证服务处于有效状态且属于任务店铺；验证失败返回 `error.affiliate.service_scope_invalid`，不得自动忽略无效服务。

### 7.5 奖励、优惠和时间

表单必须覆盖现有正式字段：

- `rewardNdpPerCompletedOrder`。
- `totalBudgetNdp`。
- `customerDiscountType`。
- `fixedDiscountJpy`、`discountRateBps`、`discountCapJpy`。
- `minimumOrderAmountJpy`。
- `claimStartsAt`、`claimEndsAt`、`taskStartsAt`、`taskEndsAt`。
- `attributionWindowDays`。
- `maxCompletedOrdersPerClaim`、`maxCompletedOrdersPerCustomer`。

前端提供即时格式和关联校验，后端 Zod 与 Service 保持最终权威。所有金额使用整数单位，NDP 不用浮点数，比例使用 bps。

## 8. 五语言与乐观锁

正式内容语言顺序保持：

```text
ja -> en -> ko -> zh-TW -> zh-CN
```

页面标签分别显示日语、English、한국어、繁體中文和简体中文；API 使用现有 `ja`、`en`、`ko`、`zh-TW`、`zh-CN` 代码。

创建时选择 `sourceLocale`，服务端用源语言初始化五份内容并标记 `isInitialCopy`。之后每种语言通过 locale 接口独立保存；“同步到全部语言”只有用户明确触发时才发送 `syncToAll: true`。

每次更新都发送最新 `lockVersion`。发生 `error.affiliate.task_conflict` 时：

- 不丢弃当前表单内容。
- 不自动覆盖服务器版本。
- 显示冲突说明和“重新读取”动作。
- 重新读取后由用户重新确认修改和费用预览。

页面不得自动重试写请求，因为重复写可能覆盖另一会话的更改。

## 9. 财务预览、提交与原子性

财务确认步骤显示：

- 佣金预算。
- 平台服务费率。
- 平台服务费预留金额。
- 商户钱包总冻结金额。
- 费用计算时间和“提交时重新校验”的提示。

提交审核调用现有 submit 接口。Service 在一个正式事务中重新验证：

1. 锁定数据库中的当前任务，确认仍为可提交状态且没有并发状态变化。
2. 五语言内容完整。
3. 发布主体仍归当前成员管理。
4. 店铺和服务仍有效且范围一致。
5. 多店平台费率一致。
6. 商户钱包可用余额覆盖佣金预算与平台费。
7. 幂等预算冻结成功。
8. 任务进入 `pending_review` 并写不可变审计。

任何一步失败必须整体回滚。重复点击或网络重试不得产生第二笔冻结。页面成功状态只依据服务端成功响应，不在请求发出时预先把状态改为审核中。

## 10. 详情、状态与时间线

详情必须重新读取正式任务，不从列表行拼装完整对象。显示：

- `taskCode`、名称、发布主体名称、店铺公开 ID。
- 当前状态和拒绝原因。
- 佣金、优惠、平台费和冻结快照。
- 店铺及服务名称/价格快照。
- 五语言完成状态。
- `createdAt`、`updatedAt`、`submittedAt`、`reviewedAt`、`activatedAt`。

时间线只使用服务端任务字段和经当前权限允许返回的审计摘要。达人出现于后续领取或合作视图时，必须显示 `needoId`，不得显示内部 `userId` 或 `identityId`。

## 11. 错误与恢复

页面必须显式处理：

- `401`：会话失效，进入既有登录恢复流程。
- `403`：当前身份没有读取、创建或提交权限。
- 发布主体范围变化：重新读取主体并清理失效选择。
- `error.affiliate.publisher_scope_invalid`：发布主体或店铺不再可管理。
- `error.affiliate.service_scope_invalid`：服务已失效或不属于所选店铺。
- `error.affiliate.platform_fee_rate_mismatch`：多店费率不一致，禁止提交。
- 余额不足：显示佣金、平台费和总缺口，不伪造余额。
- `error.affiliate.task_content_required`：定位到缺失语言。
- `error.affiliate.task_conflict`：保留本地输入并提示重新读取。
- `error.affiliate.task_not_editable`：转为只读并刷新状态。
- 网络或服务错误：保留草稿输入，提供人工重试，不循环请求。

错误文案补齐日语、英语、韩语、繁体中文和简体中文。用户可见文本不直接显示 Node.js、Prisma、SQL 或内部 ID。

## 12. 安全、分层与审计

- 所有新接口保持 `/api/v1/` 前缀和统一响应格式。
- Controller 只处理 `req/res`，Service 处理业务规则，Repository 只访问 Prisma。
- query、params 和 body 全部使用严格 Zod schema。
- OpenAPI 精确描述请求、分页响应、状态码和错误。
- 列表过滤软删除记录，关联字段有索引，避免按行重复查询。
- 读取接口使用 `page:merchant-affiliate-task`；创建/编辑使用 `button:merchant-affiliate-task-create`；提交使用 `button:merchant-affiliate-task-submit`。
- 页面使用相同权限隐藏或禁用操作，但后端 RBAC 始终为权威。
- 创建、编辑语言、提交、预算冻结和审核结果使用现有审计链路。
- 费用预览只读，不写成功审计；安全拒绝可进入既有安全日志，但不能制造业务成功记录。
- 日志不得记录 access token、refresh token、银行信息或完整请求体中的内部关联数组。

## 13. 测试与验收

### 13.1 后端自动化

至少覆盖：

- 发布主体分页、搜索、软删除和当前成员范围。
- 单店主体不能越权选择其他店铺。
- 商户主体可以选择其下多个有效店铺。
- 无权商户账号、混入其他商户店铺和无效服务全部拒绝。
- 服务列表只返回已授权店铺的有效服务。
- 费用预览金额精确、无钱包 mutation、无 Reservation 和 Ledger。
- 多店费率一致时返回唯一费率，不一致时精确失败。
- 创建、编辑、五语言、提交和 `lockVersion` 冲突。
- 余额不足、重复提交和并发提交只冻结零次或一次。
- OpenAPI 与 Zod 契约、RBAC 权限、分页上限和审计行为。
- ID 响应字段满足技术调用需要，用户可见错误不泄漏内部 ID。

### 13.2 前端自动化

至少覆盖：

- 商户路由和菜单受 `page:merchant-affiliate-task` 保护。
- 列表来自正式 API，没有 `localStorage`、mock 数据或 legacy CPS fallback。
- 单店和多店选择会清理失效的店铺、服务和费用预览。
- 服务 ID、商户账号 ID、内部用户/身份 ID 不进入可见 DOM。
- `taskCode`、店铺公开 ID和达人 `needoId` 在对应页面可见。
- 五语言 tab、显式全语言同步、409 冲突保留输入。
- 提交按钮遵守权限、请求中状态和服务端结果。
- 身份切换页只有联盟营销行显示 `TEST`，且无障碍名称正确。
- 现有用户、技师、店铺身份切换测试保持通过。
- 五语言文案审计通过。

### 13.3 正式依赖集成测试

使用受保护的本地 MySQL 和 Redis 测试数据验证：

- 单店提交精确冻结 `commissionBudgetNdp + platformFeeReserveNdp`。
- 多店同费率提交精确冻结一次。
- 多店费率不一致、余额不足、失效服务和权限拒绝均零冻结。
- 重复请求不产生重复 Reservation、Ledger 或 AuditLog 成功记录。
- 刷新、重新登录和重启后草稿、翻译、状态和预算快照仍可读取。
- 测试数据通过明确前缀、已知主键和反向依赖顺序精确清理，不清空共享业务表。

### 13.4 浏览器验收

在确认端口属于本 worktree 后，以正式后端和真实测试账号完成：

- 桌面宽度：列表、Drawer、六步编辑、五语言、费用预览和提交。
- 窄屏宽度：全屏编辑、长表单完整滚动、底部操作不遮挡内容。
- 单店和多店完整流程。
- 身份切换页联盟营销 `TEST` 标签的浅色/深色主题、当前/未开通/审核中状态。
- 刷新、重新登录和服务重启后的持久化。
- Console 无新 error，页面无横向溢出、隐藏面板或不可达按钮。

自动化测试、构建成功不能替代浏览器验收。

## 14. 非目标

本微步骤不包含：

- 达人广场、达人动态和营销热榜商户页面。
- 商户定向邀请或达人主动领取的新流程。
- 任务暂停、恢复、提前结束和撤销。
- Reward 退款冲正和达人提现。
- 新运营后台页面。
- 外部社交平台抓取或验证。
- 将联盟营销代码合入 `main`、推送远端或部署。
- 为未来能力预先放置空按钮、空菜单或假接口。

## 15. 回滚与后续大版本整合

本功能的最小回滚单位是 `codex/affiliate-merchant-task-workspace` 分支提交。由于不进入 `main`，暂停功能时只需停止该 worktree 的运行和开发，不需要在主线删除页面、migration 或公共组件。

后续大版本整合前必须建立联盟功能清单，逐项记录：

- 分支和 worktree。
- 精确 HEAD。
- 依赖的 `main` 基线。
- migration 顺序和数据库现状。
- 自动化测试结果。
- 正式 MySQL/Redis 验收结果。
- 桌面与窄屏浏览器验收结果。
- 已知风险和不可整合条件。

大版本集成分支必须先吸收当时最新 `main`，再按依赖顺序整合联盟功能。只有全部回归、migration 审计、资金原子性和浏览器验收通过，并取得用户明确批准，才允许单次、可追踪地进入 `main`。

## 16. 验收清单

- [ ] 所有新联盟营销提交仅存在于独立 worktree/分支，`main` 未被修改。
- [ ] 商户后台只新增可用的“我的联盟营销”，没有空的未来菜单。
- [ ] 身份切换页只有联盟营销名称旁显示 `TEST`。
- [ ] 单店和商户账号多店发布均使用正式授权范围。
- [ ] 任务、店铺和达人显示正确公开 ID。
- [ ] 服务 ID、商户账号 ID、内部用户和身份 ID不显示。
- [ ] 草稿、五语言和状态可跨刷新、重登录和重启持久化。
- [ ] 费用预览无财务 mutation，提交重新校验并只冻结一次。
- [ ] RBAC、Zod、OpenAPI、分页、软删除和审计完整。
- [ ] 全量前后端回归通过。
- [ ] 正式 MySQL/Redis 资金流验收通过并精确清理。
- [ ] 桌面和窄屏浏览器验收通过，Console 与布局无新增问题。
- [ ] 完成后只报告隔离分支状态，不自动 merge、push 或部署。
