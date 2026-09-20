# NeeDo Detailed Repository Operating Guide

> 作用：承载 `AGENTS.md` 不适合每轮注入的详细工程规则。
> 根 `AGENTS.md` 是宪法与导航；本文是按任务按需读取的详细 source of truth。
> 最后核验：2026-09-19。

## 1. 如何使用本文

- 先从根 `AGENTS.md` 确定任务边界，再只读取本文相关章节。
- 技术事实以当前代码、`package.json`、lockfile、构建/部署配置和 migration 为准。
- 领域文档描述业务契约；历史计划和 QA 记录只证明其明确记录的时点与范围。
- 若本文与现行实现冲突，先确认实现是否为正式权威，再在同一微步骤修正文档；不要继续传播冲突。

## 2. 当前工程基线

### 2.1 前端与入口

- React / TypeScript strict / Vite / React Router / Tailwind。
- 根目录有独立 HTML 入口：`index.html`、`user.html`、`technician.html`、`merchant.html`、`store-admin.html`、`pf-admin.html`、`afirieito.html`、`afirieito-admin.html`。
- 这些入口共享 `src/main.tsx`、`src/App.tsx` 与现有路由/权限基础设施；修改共享代码时必须回看所有相关 portal。
- Vitest 覆盖组件、domain helper、路由、配置和浏览器行为；构建输入以 `vite.config.ts` 为准。

### 2.2 后端与数据

- `backend/` 是正式 Express/TypeScript 后端；包含 client、operations、merchant 三个服务入口。
- 正式持久化为 Prisma + MySQL，运行态会话/OTP/限流/事件等按现有实现使用 Redis。
- 测试使用 Jest/Supertest，根 `backend/package.json` 的分片 runner 是完整后端套件入口。
- `backend/prisma/schema.prisma` 与 migration 目录是物理数据结构权威；已应用 migration 不可重写。
- OpenAPI 实现位于 `backend/src/api/openapi.ts`。新增或改变正式接口时必须同步契约、验证器、权限和测试。

### 2.3 当前 PWA 与 native 状态

- 多入口已有 `.webmanifest`、图标、standalone 判断、safe-area/viewport 处理和安装提示逻辑。
- 当前未找到 Service Worker 文件或注册代码，因此不得宣称完整离线 PWA、SW cache 更新或 push service-worker 已实现。
- 当前未找到 `ios/`、`android/`、`capacitor.config.*` 或 Capacitor dependency。移动执行文档是计划，不是已落地 native wrapper。
- 任何 native 框架、插件、App ID、签名、权限或 Store 发布工作都需要独立批准和对应设备/审核证据。

## 3. 任务分解与计划

### 3.1 何时需要计划

以下任一情况先写简短执行计划或使用已有批准计划：

- 跨前后端、schema、状态机或三个以上 portal。
- 涉及 Auth/RBAC、Booking/Schedule/Order、NDP/Wallet、支付/退款/结算、数据迁移、缓存协议或发布。
- 风险无法通过单个聚焦测试与一次回滚隔离。
- 预计需要多个独立提交或多轮环境验证。

计划必须包含：范围、顺序、每步验收、失败回滚、明确禁止项、远程授权边界。不要写没有执行动作的报告式方案。

### 3.2 微步骤边界

每个微步骤应能回答：

1. 哪个具体失败或缺口被解决？
2. 哪些文件/层允许改变？
3. 哪个测试或运行时证据证明成功？
4. 如何撤销而不破坏无关状态？
5. 哪些相关能力仍然未完成？

`docs/00_MASTER_MICRO_STEP_PLAN.md` 保存正式化路线历史与领域顺序，但仓库已实施大量后续能力。执行前必须核对当前代码、migration 和领域文档，不得因编号表仍写“未开始”就重复建设，也不得因旧完成记录就跳过当前验收。

## 4. Cross-Surface Impact Map

### 4.1 适用范围

Booking、Request、Schedule、Order、NDP、Wallet、Payment、Refund、Commission、Settlement、Pricing、Account、Role、Permission、IM、Social、Notification 等共享业务必须做影响图。

### 4.2 最小模板

```text
Change / initiating actor:

Affected surfaces:
- User:
- Technician / Cast / Staff:
- Shop mobile:
- Merchant Admin:
- Operations / Super Admin:
- Other portal:

Authoritative path:
UI → API → Auth/RBAC → Service/state machine → Repository/DB

Side effects:
- Ledger / finance / audit:
- Schedule / capacity / conflict:
- Cache / invalidation:
- Realtime event / notification:
- Reporting / reconciliation:

Explicitly unaffected:
Pending evidence:
Rollback:
```

### 4.3 判定规则

- 不要求每项都修改，但每项必须被检查并标记“受影响 / 不受影响 / 未验证”。
- UI projection 不是业务权威。任何“成功”必须对应服务端状态、事务提交和必要副作用。
- 同一逻辑对象不得在多个 portal 或 Web/native 客户端各自实现独立状态机。
- 若后端契约改变，检查旧前端、已发布 PWA cache、未来移动客户端的兼容窗口；优先扩展后收缩。

## 5. Web-first, multi-platform-ready

### 5.1 Desktop Web

验证 Chrome、Safari、Edge、Firefox 中与变更相关的：

- keyboard navigation、focus 可见性、mouse 与 pointer 行为；
- 宽屏下 Header、Navigation、Content 的共同 max-width；
- modal/drawer、滚动容器、sticky/fixed 元素和浏览器缩放；
- 路由直达、刷新与多入口跳转。

背景允许铺满 viewport，主要操作区不得随超宽显示器无限拉宽。不要创建第二套 desktop layout token。

### 5.2 Mobile Web

验证与任务相关的：

- iPhone Safari 与 Android Chrome；
- touch target、无 hover 主路径、long press 与 pointer cancellation；
- safe area、notch/Dynamic Island、Home Indicator；
- browser toolbar、`visualViewport`、virtual keyboard；
- scroll locking、overscroll、back navigation、orientation；
- 弱网/中断、deep link、文件/照片上传、camera、location。

不得用固定机型像素补丁替代共享布局、safe-area 或 viewport 根因修复。

### 5.3 Responsive matrix

优先使用现有 breakpoint/token，并按受影响页面覆盖：

| 范围 | 代表宽度 |
|---|---|
| 小屏手机 | 320–375 CSS px |
| 主流手机 | 390–430 CSS px |
| 平板/窄桌面 | 768–1024 CSS px |
| 桌面 | 1280 CSS px 及以上 |
| 超宽屏 | 验证 max-width 与信息密度，不拉伸核心 UI |

Browser emulation 是布局证据，不是 installed PWA、真实键盘、系统返回、权限、相机、推送或 native 性能证据。

## 6. PWA 与版本兼容

若任务引入或修改 Service Worker，必须独立设计并验证：

- manifest 与 scope；
- installability 与 standalone launch；
- precache 只包含明确、版本化的 app shell；
- navigation/offline fallback；
- cache namespace 和 schema version；
- storage quota、容量上限与 eviction；
- activate/update/rollback 策略；
- deep link 与多 HTML 入口；
- notification/push 的权限与生命周期；
- 旧客户端与新 API 的兼容期。

禁止 `cache.addAll` 或同等策略永久缓存全部业务响应、私有数据或无限媒体。必须防止：

```text
Old JS + New API
New JS + Old Cache
Account A cache + Account B session
```

HTML/入口应可重新验证；hashed static assets 可长期 immutable；Auth、写接口、admin 和交易响应不得进入共享公共 cache。

## 7. Future iOS / Android readiness

当前没有 native wrapper。未来 iOS / Android 工作统一按 [`NeeDo Web / iOS / Android 共存开发执行文档`](superpowers/plans/2026-09-11-needo-web-ios-android-execution.md) 推进；安装框架或插件、生成平台工程、确定 App ID、签名及 Store 发布仍需明确授权，没有对应代码、构建和设备证据前一律视为未实现。

## 8. Local-first UX, server-authoritative transactions

### 8.1 可缓存数据

在满足隐私、容量和失效规则时，可以持久缓存：

- conversation list / chat history；
- social feed text 与有界媒体缩略图；
- shop / technician profile；
- service metadata、categories、settings metadata；
- schedule / availability snapshot；
- order history snapshot；
- 非敏感用户偏好。

关闭网页、退出 PWA 或系统回收进程不应自动清除仍有效且安全的缓存。使用平台合适的 persistent storage；当前 Web 优先复用已有 IndexedDB/缓存基础设施。

### 8.2 服务端最终权威

以下内容不能以本地 cache 作为最终真值：

- Booking availability 与最终确认；
- Request、final Order state；
- NDP/Wallet、Payment、Refund、Settlement、Commission；
- Auth、RBAC、eKYC、risk state。

客户端时间、push、notification 和 cache 只用于展示或触发重新读取，不能单独证明交易完成。

### 8.3 Cache-first rendering

```text
valid local cache
→ render immediately
→ background freshness/version check
→ incremental sync
→ merge
→ update only affected UI
```

后台刷新不得清空可用内容、整页闪烁、重置 scroll、丢失输入或覆盖当前选择。相同 scope/key 的并发读取应去重；身份或关键变更后执行 targeted invalidation。

### 8.4 Incremental sync

按现有契约选择 `updatedAt`、version、cursor、ETag、since/delta、targeted invalidation、WebSocket/SSE/push。禁止 aggressive polling、逐项 N+1 请求、组件各自重复请求或无条件 full collection refetch。

### 8.5 Prefetch

登录或入口可在不阻塞主流程时低优先级预取高概率数据，例如今日/近期 schedule、staff list、today orders、service/pricing metadata、pending tasks。必须满足：

- 可复用、可取消、去重；
- 不无限预取历史；
- Data Saver、弱网、低电量或后台状态合理降级；
- 权限/身份变化后不继续使用旧 scope 数据。

### 8.6 Cache safety

所有持久缓存需要：

- schema version、freshness/TTL；
- capacity、LRU/eviction；
- corruption recovery；
- account/identity/tenant isolation；
- logout、account switch、account deletion 处理；
- privacy 与必要加密；
- quota failure 和 write failure 的非破坏性降级。

普通业务 cache 不得保存 password、OTP、raw eKYC、server secret 或不安全 raw token。媒体 cache 必须有容量上限。

## 9. Booking / Schedule snapshot 模式

浏览与选择阶段优先复用有效的 local schedule/availability snapshot，避免每次选择日期、人员、服务、时间都触发一次完整 API 往返。

推荐流程：

```text
local schedule/availability snapshot
→ select shop / technician / service / time
→ one authoritative confirm request
→ server transaction and concurrency validation
→ targeted cache refresh/invalidation
```

服务端最终确认至少重新验证：

- availability 和 schedule；
- overlapping orders / reservations；
- service duration；
- shop-technician-service 关系；
- identity、permissions；
- pricing/version；
- 必要 financial conditions。

冲突返回稳定业务错误（沿用或扩展现有错误码），前端只刷新相关 technician/date/availability，不全量刷新 App。只有服务端事务成功才显示 Booking 成立。

## 10. Offline 与弱网

- 可展示最近一次成功同步的安全缓存，并明确 freshness/离线状态。
- Booking、Request、Payment、NDP transaction、Refund、permission change 不得离线伪造成功。
- 未知结果的写请求先查询服务端结果；同一逻辑重试复用幂等键，不生成新键造成重复扣款或重复预约。
- 若未来设计 offline mutation queue，必须单独定义 idempotency、conflict resolution、expiry、用户确认、撤销和账号切换行为；默认禁止静默入队。

## 11. 服务器压力与可扩展性

新增或修改数据流时记录/检查：

- requests per interaction 与 duplicate requests；
- per-item request、DB query count、N+1；
- payload/media size；
- polling/reconnect frequency；
- cache hit/miss；
- pagination/filtering；
- concurrency、pool、Redis 和带宽影响。

优先复用 server-side pagination/filter、deduplication、cancellation、debounce/throttle、batching、incremental update、bounded concurrency、正确索引、CDN/object storage 和有理由的 background job。

原则是 **Measure before optimize**。检查 User/Cast/Shop 数量扩大 10 倍时是否明显失效，但不要为假设规模盲目加入 Redis、MQ、cache、microservice、分库分表或新的同步系统。

优先级：

1. Data correctness
2. Security
3. Stability
4. Backward compatibility
5. Testability
6. Performance / server cost
7. Scalability
8. Developer convenience

## 12. Financial / NDP safety

- 复用现有 `LedgerService`、wallet、hold、reconciliation、audit 和 domain state machine，不建立第二套余额。
- 金额/NDP 使用现有整数/Decimal 约定，禁止 JavaScript 浮点运算成为财务权威。
- 每个 mutation 定义 transaction boundary、idempotency key、retry、concurrent request、partial failure、audit trail、source event/reference。
- 明确防止 double booking、double charge、double NDP deduction、double refund、double commission、double settlement。
- 交易状态与 ledger 状态在同一事务或明确的可靠补偿协议中保持一致；失败不得留下半成功 UI 或孤立财务记录。
- `NDP` 与 `TEST_NDP` 不得混算、互转或进入错误的 settlement/export。

具体权威以 `docs/ledger.md`、`docs/order-state-machine.md` 和当前服务/测试为准。

## 13. 依赖、SDK 与新抽象

新增 package、plugin、SDK、utility、component、service、repository、adapter 或 cache layer 前：

1. 用 `rg` 搜索现有同类能力和调用方。
2. 说明为什么现有系统不能合理扩展。
3. 检查维护状态、license、安全、bundle/runtime/server cost。
4. 检查权限与数据采集、隐私、iOS/Android 与 Store 影响。
5. 取得依赖安装、付费资源或外部服务所需授权。

选择 minimum necessary complexity；不要为当前任务创建第二套相同业务逻辑。

## 14. Dead code 与清理

疑似垃圾先分类：

- P0：security / correctness / data loss；
- P1：performance / reliability；
- P2：dead code / duplication / unused dependency；
- P3：optional simplification。

删除前检查 static reference、dynamic import、route、feature flag、build input、test、migration、platform entry、runtime/database reference、rollback compatibility。资产清理还要检查 Vite `public/` 原样复制行为和数据库动态 URL。清理必须可恢复并保留 manifest/备份记录。

## 15. Localization freeze

非本地化任务中发现翻译、术语、typo、截断或 mapping 问题：

1. 不顺手改 `src/i18n/translations.ts` 或各 feature i18n。
2. 记录到 `docs/LOCALIZATION_ISSUES.md`。
3. 记录 locale、key、当前文本、screen/module、问题、建议、severity 和发现日期。

只有 security、legal、payment、privacy、permission、consent、account deletion 或 Store compliance 相关问题才是当前 Blocking Issue。其他项由独立本地化任务处理并覆盖当前 `zh`、`zh-Hant`、`ja`、`en`、`ko`。

## 16. 测试与验证矩阵

### 16.1 选择测试

| 变更 | 最低验证 |
|---|---|
| 纯文档 | 链接、命令、事实和 diff 检查 |
| pure helper/type | 聚焦 unit + typecheck/lint |
| React behavior | 聚焦 component/domain test + typecheck；视觉/交互则浏览器验证 |
| API/controller/service | unit + API/integration + lint/build |
| Prisma/repository/migration | migration status/guard + real local DB checker + rollback/cleanup proof |
| Auth/RBAC | happy path、unauthorized、forbidden、expired/stale session、audit |
| Booking/Order/NDP | happy path、permission denied、stale state、duplicate/retry、concurrency、cancel、timeout、partial failure |
| PWA/viewport | browser regression + installed-device telemetry where claimed |
| release/deploy | artifact audit、migration gate、health/ready、authenticated business smoke、rollback evidence |

先跑聚焦测试，再按共享影响扩大。失败时判断实现错误、需求变化还是既有无关问题；不得删测试、skip、放宽断言或只改 expected 来掩盖 bug。

### 16.2 证据等级

```text
source inspection
< unit/typecheck/build
< local API/database integration
< local authenticated browser flow
< installed PWA / physical iOS / physical Android
< pushed remote commit
< deployed staging/production
< post-deploy business acceptance
```

高层证据不能由低层证据推断。最终报告只声明实际完成的等级。

### 16.3 本地运行时识别

在复用或判断默认端口前：

1. 查 listener PID。
2. 查 PID 的 cwd/worktree。
3. 查 branch/commit 与 proxy target。
4. 查 `/health`、`/ready`。
5. 再执行认证 route 和业务交易验证。

如果 `5180` 属于其他任务或用户要求保持不动，使用另一个空闲端口。不要凭 UI 外观推断当前代码已加载，也不要从 health/ready 推断交易链路通过。

## 17. 文档与完成报告

- 更新现有 source of truth，避免新增重复设计文档。
- 当前事实、历史记录、计划和未验证项使用明确时态与日期。
- 每个完成报告包含：修改文件、行为变化、测试/命令与结果、未验证项、风险、回退方法。
- 本地 merge、push、deployment、browser acceptance 和 device acceptance 分开描述。
