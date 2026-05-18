# NeeDo Afirieito 后台开发文档

版本：v0.1  
日期：2026-05-18  
范围：NeeDo 独立 Afirieito PC 后台、产运后台 Afirieito 同步页、Afirieito H5 推广者端的共享数据与逻辑

## 1. 文档目标

本文档用于让后续开发者快速接手 NeeDo Afirieito 后台。重点说明：

- 当前 NDA管理后台有哪些入口、路由、页面模块和兼容路径。
- 前端组件、业务状态、mock 数据和本地持久化如何连接。
- 推广计划、推广者、链接/码/QR、佣金、结算、风控和审计日志的状态机规则。
- 后续接入真实后端、权限、同步和发布时需要补齐的工作。

当前实现是“前端可运行 + 本地状态可变更 + 逻辑测试覆盖”的阶段。数据仍以 `src/features/business-cps/model.ts` 的种子数据和 `localStorage` 运行态为主，尚未接入真实数据库/API。

## 2. 当前系统边界

### 2.1 三个 Afirieito 表面

| 表面 | 入口 | 主要用途 | 关键文件 |
|---|---|---|---|
| 独立 Afirieito PC 后台 | `afirieito-admin.html#/NDA-admin` | Afirieito 运营直接管理推广计划、链接、素材、归因、佣金、结算、钱包、风控 | `src/pages/business-cps/BusinessCpsAdminPage.tsx`, `src/components/business-cps/BusinessCpsAdminLayout.tsx`, `src/pages/admin/CpsPage.tsx` |
| 产运后台 Afirieito 同步页 | `pf-admin.html#/admin/afirieito` 或 `/admin/afirieito` | 产运后台查看 Afirieito 独立系统同步镜像，用于总控、复核、财务和风控裁决 | `src/pages/admin/CpsPage.tsx` |
| Afirieito H5 推广者端 | `afirieito.html#/afirieito` | 推广者/BD/代理查看推广、素材、团队、收益、结算、风控提示 | `src/pages/mobile/BusinessCpsPage.tsx` |

`CpsWorkspace` 是独立后台和产运同步页的共享工作区。它通过 `scope` 区分行为：

- `scope="business-admin"`：独立 Afirieito PC 后台，可操作业务状态。
- `scope="ops-sync"`：产运后台同步镜像，强调复核和总控。

### 2.2 推荐打开方式

开发和预览时优先使用：

```text
http://127.0.0.1:<port>/afirieito-admin.html#/NDA-admin
http://127.0.0.1:<port>/afirieito-admin.html#/NDA-admin/statistics
http://127.0.0.1:<port>/afirieito.html#/afirieito
```

不要使用 `/dist/afirieito-admin.html#/NDA-admin` 作为本地预览路径。该路径可能加载静态资源但 React 不正确挂载，导致空白页面。

## 3. 入口与路由

### 3.1 Vite HTML 入口

`vite.config.ts` 的 Rollup input 已注册：

- `afirieito`: `afirieito.html`
- `afirieitoAdmin`: `afirieito-admin.html`
- `pfAdmin`: `pf-admin.html`

Vite dev/preview fallback 会把这些路径转到正确 HTML：

- `/NDA-admin`, `/afirieito-admin`, `/business-admin`, `/login/NDA-admin`, `/login/afirieito-admin`, `/login/business-admin` -> `afirieito-admin.html`
- `/afirieito`, `/business`, `/login/afirieito`, `/login/business` -> `afirieito.html`

### 3.2 App 路由

`src/App.tsx` 中 Afirieito 相关路由：

- H5：`/afirieito`, `/afirieito/plan`, `/afirieito/data`, `/afirieito/organization`, `/afirieito/promotions`, `/afirieito/links`, `/afirieito/materials`, `/afirieito/referrals`, `/afirieito/team`, `/afirieito/earnings`, `/afirieito/reporting`, `/afirieito/risk`, `/afirieito/notifications`, `/afirieito/me`
- H5 设置：`/afirieito/settings/*`
- PC 后台：`/NDA-admin`, `/NDA-admin/*`
- 兼容重定向：`/afirieito-admin` -> `/NDA-admin`, `/business-admin` -> `/NDA-admin`
- 产运同步页：`/admin/afirieito`

### 3.3 Hash 与兼容

`afirieito-admin.html` 内设置：

```html
<meta name="needo-hash" content="#/NDA-admin" />
```

`portal-entry.js` 负责门户入口识别和旧路径兼容。旧 `business-admin` 与小写 `cps-admin` 仍应保留兼容，避免历史链接失效。

## 4. 页面模块与菜单

### 4.1 侧栏菜单配置

侧栏菜单统一在：

```text
src/components/afirieito/sidebar/afirieitoSidebarMenus.ts
```

核心类型：

- `CpsWorkspaceModuleKey`: 工作区模块枚举。
- `CpsSidebarMenu`: 一级菜单。
- `CpsSidebarPage`: 二级页面或单页入口。

当前工作区模块：

```text
dashboard, plans, wizard, team, links, materials, crm, tracking,
attribution, settlement, wallet, risk, promoters
```

### 4.2 菜单到模块映射

| 菜单/页面 | 路由 | 模块 | 当前状态 |
|---|---|---|---|
| 数据分析 / 统计数据 | `/NDA-admin/statistics` | `dashboard` | 已挂载 |
| 数据分析 / 推广者检查 | `/NDA-admin/member-inspector` | `promoters` | 已挂载 |
| 概览 / 数据看板 | `/NDA-admin/dashboard` | `dashboard` | 已挂载 |
| 概览 / 账户 | `/NDA-admin/account` | 无 | 占位页 |
| 概览 / 公告 | `/NDA-admin/news` | 无 | 占位页 |
| 链接与素材 / 推广链接生成 | `/NDA-admin/links-builder` | `links` | 已挂载 |
| 链接与素材 / 推广素材生成 | `/NDA-admin/ad-creatives-builder` | `materials` | 已挂载 |
| 横幅素材 / 片前广告 / 快捷链接 | 多个 `/NDA-admin/*` | 无 | 占位页 |
| 白标设置 | `/NDA-admin/whitelabels` | 无 | 占位页 |
| 返佣结算 / 结算总览 | `/NDA-admin/payout-overview` | `settlement` | 已挂载 |
| 提现审核 / 结算记录 | 多个 `/NDA-admin/*` | 无 | 占位页 |
| 分销计划 / 推广计划管理 | `/NDA-admin/referral-models` | `plans` | 已挂载 |
| 分销计划 / 下级推广者 | `/NDA-admin/referral-affiliates` | `team` | 已挂载 |
| 服务 / 文档 | 多个 `/NDA-admin/*` | 无 | 占位页 |

未挂载模块统一渲染 `CpsPlaceholderPage`，展示页面说明、功能预留和“返回 Afirieito 总览”。

### 4.3 产运后台模块参数

产运后台主要通过 query 参数访问模块：

```text
/admin/afirieito?module=plans
/admin/afirieito?module=links
/admin/afirieito?module=settlement
/admin/afirieito?module=risk
```

`getActiveModule()` 支持别名，例如：

- `campaigns` -> `plans`
- `create` -> `wizard`
- `codes`, `qr`, `qrcode`, `carriers` -> `links`
- `commissions` -> `attribution`
- `payouts`, `reconcile` -> `settlement`
- `ndp`, `budget` -> `wallet`
- `agents`, `brokers` -> `promoters`

## 5. 关键文件结构

| 文件 | 责任 |
|---|---|
| `src/pages/business-cps/BusinessCpsAdminPage.tsx` | 独立 Afirieito PC 后台入口，包裹 `BusinessCpsAdminLayout` 与 `CpsWorkspace` |
| `src/components/business-cps/BusinessCpsAdminLayout.tsx` | PC 后台框架、主题、顶部按钮、侧栏状态、跨后台主题同步 |
| `src/components/afirieito/sidebar/CpsSidebar.tsx` | NDA管理后台左侧导航、账号菜单、折叠/展开、移动端抽屉 |
| `src/components/afirieito/sidebar/afirieitoSidebarMenus.ts` | 菜单、路由、权限标识、占位页配置 |
| `src/styles/afirieito/afirieitoSidebar.css` | Afirieito 侧栏视觉、响应式和主题变量 |
| `src/pages/admin/CpsPage.tsx` | `CpsWorkspace` 与所有 PC 后台/产运同步模块主体 |
| `src/pages/afirieito-admin/CpsPlaceholderPage.tsx` | 未实现页面占位 |
| `src/features/business-cps/model.ts` | Afirieito 领域类型、标签、种子数据和工具函数 |
| `src/features/business-cps/logic.ts` | 运行态、状态机、校验、审计日志、逻辑诊断 |
| `src/features/business-cps/logic.test.ts` | Afirieito 核心业务逻辑测试 |
| `src/pages/mobile/BusinessCpsPage.tsx` | Afirieito H5 推广者端 |

## 6. 数据模型

### 6.1 运行态

`BusinessCpsRuntimeState` 当前包含：

```ts
campaigns: BusinessCpsCampaign[]
promoters: BusinessCpsPromoter[]
promoterPermissions: BusinessCpsPromoterPermission[]
promoterTeamNodes: BusinessCpsPromoterTeamNode[]
promotionLinks: BusinessCpsPromotionLink[]
promotionCodes: BusinessCpsPromotionCode[]
qrCodes: BusinessCpsQrCode[]
commissionRecords: BusinessCpsCommissionRecord[]
settlementBatches: BusinessCpsSettlementBatch[]
riskEvents: BusinessCpsRiskEvent[]
auditLogs: BusinessCpsAuditLog[]
```

本地存储 key：

```text
needo.afirieito.runtime.v1
```

初始化流程：

1. `readInitialCpsRuntimeState()` 从浏览器存储读取快照。
2. `normalizeBusinessCpsRuntimeState()` 合并/兜底缺失数组。
3. 用户操作后 `CpsWorkspace` 通过 `writeBrowserStorage()` 写回。

### 6.2 主要实体

| 实体 | 说明 | 关键字段 |
|---|---|---|
| `BusinessCpsCampaign` | 推广计划 | `type`, `sponsor`, `status`, `budgetTotal`, `budgetUsed`, `ruleTemplateIds`, `riskRules`, `materialIds`, `roi` |
| `BusinessCpsPromoter` | 推广者/BD/代理/商户/平台节点 | `role`, `inviteCode`, `monthIncome`, `withdrawable`, `frozen`, `riskScore`, `status` |
| `BusinessCpsPromoterPermission` | 推广者权限 | `canCreateLink`, `canCreateCode`, `canCreateQr`, `canCreateSubPromoter`, `canWithdraw` |
| `BusinessCpsPromoterTeamNode` | 团队树和分成规则 | `parentPromoterId`, `level`, `budgetMode`, `commissionRate`, `commissionBasis`, `releaseCondition`, `riskCondition` |
| `BusinessCpsPromotionLink` | 推广短链 | `landingType`, `landingUrl`, `status`, `allowCommission`, `signature` |
| `BusinessCpsPromotionCode` | 推广码 | `purpose`, `status`, `usedCount`, `commission` |
| `BusinessCpsQrCode` | 推广 QR | `styleType`, `scans`, `ekycCompletions`, `abnormalScans` |
| `BusinessCpsAttributionRecord` | 归因记录 | `sourcePath`, `carrier`, `evidence`, `commissionRecordId`, `status` |
| `BusinessCpsCommissionRecord` | 佣金记录 | `model`, `baseAmount`, `commissionAmount`, `status`, `expectedSettlementDate`, `riskReason` |
| `BusinessCpsSettlementBatch` | 结算批次 | `commissionIds`, `grossAmount`, `frozenAmount`, `payableAmount`, `status`, `payoutMethod` |
| `BusinessCpsRiskEvent` | 风险事件 | `severity`, `subject`, `systemAction`, `amountFrozen`, `status` |
| `BusinessCpsAuditLog` | 操作审计 | `actor`, `action`, `target`, `targetType`, `reason`, `beforeValue`, `afterValue`, `ip` |

## 7. 业务状态机

### 7.1 推广计划状态

状态：

```text
draft -> reviewing -> scheduled -> active -> paused / ended
risk_paused -> paused / ended
ended -> archived
```

动作：

- 草稿：提交审核。
- 审核中：审核通过、归档。
- 待开始：开始、归档。
- 进行中：暂停、终止。
- 暂停中：恢复、终止、归档。
- 风控暂停：风控解除、终止。
- 已终止：归档。

规则：

- 操作必须填写不少于 4 个字的原因。
- 预算使用率达到 100% 时，开始/恢复会进入 `budget_exhausted`。
- 推广计划进入非 active 状态时，相关链接会暂停新增返佣，历史追踪保留。
- 每次状态变更写入 `auditLogs`。

### 7.2 推广者和团队树

新增下级推广者规则：

- 上级必须存在。
- 上级必须具备 `canCreateSubPromoter`。
- 团队树最多支持 3 级。
- 推广者名称至少 2 个字符。
- 邀请码至少 4 位，且只能包含字母、数字、下划线或横线。
- 邀请码全局唯一。
- 分成比例必须在 0% 到 100%。
- 结算延迟天数必须在 0 到 365。
- 返佣释放条件、风控冻结条件、规则有效期必填。

新增成功后：

- 创建 `BusinessCpsPromoter`。
- 创建 `BusinessCpsPromoterTeamNode`。
- 创建权限记录。
- 更新上级和祖先节点的 `teamSize` / `directChildren`。
- 写入审计日志。

### 7.3 链接 / 码 / QR 承载体

推广链接状态：

```text
active -> paused / risk_frozen
paused -> active / risk_frozen / discarded
risk_frozen -> active / discarded
```

规则：

- 暂停、恢复、冻结、作废必须填写原因。
- `allowCommission` 只有在链接 active、活动 active、预算未达上限时才为 true。
- 历史数据不删除，后续追踪继续可查。

落地页校验：

- 已批准 host：`needo.jp`, `www.needo.jp`, `needo.dackou.com`
- 已批准路径：`/app/register`, `/register/user`, `/shop/apply`, `/merchant/apply`, `/cast/apply`, `/technician/apply`, `/request/new`, `/checkout`, `/orders/new`, `/membership`, `/member/subscribe`
- 链接需要绑定有效活动、素材和渠道。
- 素材必须属于同一活动。
- 非启用状态不得允许新增返佣。
- 预算达到上限后不得允许新增返佣。

### 7.4 佣金状态

状态主链路：

```text
estimated -> pending -> locked -> withdrawable -> withdrawing -> paid
```

特殊动作：

- 非 paid / clawed_back / cancelled 状态可冻结为 `risk_frozen`。
- 非 paid / clawed_back / cancelled 状态可取消为 `cancelled`。
- `risk_frozen` 可确认回 `pending`。
- `paid` 可冲正追回为 `clawed_back`。

规则：

- 佣金状态变更必须填写原因。
- 状态变更不直接改写金额。
- 风控冻结会记录 `riskReason`。
- 每次动作写审计日志。

### 7.5 结算批次状态

状态：

```text
draft -> reviewing -> approved -> paid
draft/reviewing/approved -> rejected
```

规则：

- 操作必须填写原因。
- `payableAmount <= 0` 时不能审核通过或支付。
- 可支付金额应满足：`grossAmount - frozenAmount + adjustmentAmount`。
- 变更写审计日志。

### 7.6 风控事件状态

状态：

```text
new -> reviewing -> released / rejected
new/reviewing -> reviewing (继续冻结)
```

联动规则：

- 释放风险事件：关联佣金回到 `pending`。
- 继续冻结：关联佣金进入 `risk_frozen`。
- 驳回：关联佣金进入 `cancelled`。
- 人工动作必须填写原因。
- 风控动作写审计日志，并记录风险状态与佣金状态的前后值。

## 8. 逻辑诊断

`buildBusinessCpsLogicDiagnostics()` 会检查：

- 活动 active 但预算已达上限。
- 推广链接绑定活动/素材/渠道是否有效。
- 推广链接落地页是否为批准页面。
- 非 active 链接或活动是否仍允许新增返佣。
- 结算可支付金额是否等于 `grossAmount - frozenAmount + adjustmentAmount`。
- 风险冻结金额与关联佣金状态是否对齐。

无阻断问题时输出“核心逻辑校验通过”。

## 9. UI 与主题

### 9.1 PC 后台布局

`BusinessCpsAdminLayout` 提供：

- `admin-shell merchant-admin-shell cps-admin-shell` 三层 class，复用后台主题变量。
- 左侧 `CpsSidebar`。
- 顶部按钮：打开 Afirieito H5、打开产运 Afirieito 同步、语言切换、主题菜单。
- 移动端菜单按钮和遮罩。
- 侧栏折叠状态持久化。

侧栏本地存储：

```text
afirieito_sidebar_collapsed
afirieito_sidebar_expanded_keys
```

### 9.2 主题同步

NDA管理后台主题 key：

```text
needo.afirieito-admin.theme
needo.afirieito-admin.theme.mode
```

继承来源：

- `needo.admin.theme`
- `needo.merchant-admin.theme`
- `needo.client.theme`

手动修改 NDA管理后台主题时，会镜像到：

- `needo.admin.theme`
- `needo.merchant-admin.theme`

对于客户端兼容主题，也会写入：

- `needo.client.theme`

注意：`blue-black` 是经典蓝黑后台主题。蓝黑主题下的 Afirieito 侧栏选中态应使用 `--admin-accent` / `--admin-accent-strong`，避免写死紫色。

### 9.3 视觉约束

- 侧栏使用 `src/styles/afirieito/afirieitoSidebar.css`。
- 后台共享主题变量在 `src/styles.css`。
- 新增按钮、菜单、卡片时优先使用 `--admin-*` token，不要写死一套私有颜色。
- 占位页必须清楚显示预留功能，不要让未挂载路由空白。

## 10. 权限与登录现状

当前 demo 账号：

```text
账号：afirieito@needo.jp
通用密码：Admin.2026
验证码：260417
```

H5 Afirieito 路由使用 `protect("business", ...)`。PC 独立 NDA管理后台当前路由直接挂载 `BusinessCpsAdminPage`，侧栏账号区域会读取 `useAuth()` 的 session，但生产化前仍需要补齐路由级登录保护和后端 RBAC。

菜单中已经预留 `permission` 字段，如：

- `cps:analytics:view`
- `cps:promoter:inspect`
- `cps:link:manage`
- `cps:payout:overview:view`
- `cps:referral:model:view`
- `cps:risk:view`
- `cps:docs:api:view`

后续真实权限接入建议：

1. 将 `permission` 字段接到统一 RBAC。
2. 在 `CpsSidebar` 中过滤无权限菜单。
3. 在 `CpsWorkspace` 模块入口做二次校验。
4. 所有状态机动作接入后端权限校验和审计。
5. 区分平台运营、Afirieito 运营、财务、风控、推广者管理员等角色。

## 11. 当前测试与验证

核心测试：

```bash
npm run lint
npm test -- src/features/business-cps/logic.test.ts
```

`logic.test.ts` 当前覆盖：

- 暂停活动时保留历史链接，并写审计日志。
- 可支付金额为 0 时阻止结算审核。
- 佣金状态机不改金额。
- 风险事件释放联动佣金回 pending。
- 新增下级推广者时创建团队节点、权限、分成条件和日志。
- 编辑推广者资料、权限和分成规则。
- 拒绝任意外部落地页。
- 初始逻辑诊断为通过状态。

推荐浏览器验证路径：

```text
afirieito-admin.html#/NDA-admin
afirieito-admin.html#/NDA-admin/statistics
afirieito-admin.html#/NDA-admin/links-builder
afirieito-admin.html#/NDA-admin/referral-affiliates
afirieito-admin.html#/NDA-admin/payout-overview
afirieito-admin.html#/NDA-admin/anti-fraud
afirieito.html#/afirieito
pf-admin.html#/admin/afirieito?module=promoters
```

## 12. 新增模块开发流程

### 12.1 新增 NDA管理后台页面

1. 在 `cpsSidebarMenus.ts` 添加菜单或 reserved page。
2. 设置 `path`, `permission`, `description`, `features`。
3. 若页面复用现有工作区模块，填 `workspaceModule`。
4. 若是全新模块，先扩展 `CpsWorkspaceModuleKey`。
5. 在 `src/pages/admin/CpsPage.tsx` 添加模块标题和渲染分支。
6. 如涉及业务动作，在 `logic.ts` 增加状态机或操作函数。
7. 在 `logic.test.ts` 增加状态机和边界测试。
8. 浏览器打开对应路由，确认不是占位页/空白页。

### 12.2 新增业务动作

1. 在 `logic.ts` 定义 action union。
2. 增加 action label。
3. 增加 `getAvailable*Actions()`。
4. 增加 `getNext*Status()` 或业务校验函数。
5. 操作函数必须返回 `BusinessCpsActionResult`。
6. 操作函数必须保留金额/历史数据，除非需求明确要求改写。
7. 危险动作必须要求原因，并写 `auditLogs`。
8. UI 中通过 `ActionChip` 或按钮调用动作。
9. 增加测试，至少覆盖成功、非法状态、边界输入。

### 12.3 接入真实 API

建议将当前 localStorage 运行态替换为接口层：

```text
GET    /api/afirieito/runtime
GET    /api/afirieito/dashboard
POST   /api/afirieito/campaigns/:id/actions
POST   /api/afirieito/promoters
PATCH  /api/afirieito/promoters/:id
POST   /api/afirieito/links/:id/actions
POST   /api/afirieito/commissions/:id/actions
POST   /api/afirieito/settlements/:id/actions
POST   /api/afirieito/risks/:id/actions
GET    /api/afirieito/audit-logs
```

后端必须保持：

- 前端状态机与后端状态机一致。
- 每个 action 都写审计。
- 财务金额不可由前端直接覆盖。
- 风控动作必须联动佣金状态。
- 链接、码、QR 的历史数据不可因为暂停/作废而删除。
- 归因证据必须可追溯到事件流水、链接、码、QR、设备、eKYC、订单和支付记录。

## 13. 发布与回归清单

每次改 NDA管理后台，至少检查：

- `npm run lint` 通过。
- `npm test -- src/features/business-cps/logic.test.ts` 通过。
- `afirieito-admin.html#/NDA-admin` 能打开。
- 左侧菜单展开/折叠状态正常。
- `statistics`, `links-builder`, `referral-affiliates`, `payout-overview`, `anti-fraud` 可访问。
- 占位页面显示功能预留，不空白。
- 主题切换后选中态、按钮、卡片颜色正常。
- H5 `afirieito.html#/afirieito` 仍可打开。
- 产运后台 `/admin/afirieito?module=...` 仍可打开。
- 如涉及官方发布，补官方通知并重建 `dist`。

## 14. 当前风险与待办

| 优先级 | 待办 | 原因 |
|---|---|---|
| P0 | 为 PC NDA管理后台补路由级登录保护 | 当前 PC 后台入口直接挂载页面，生产前必须阻止未授权访问 |
| P0 | 后端 API + 数据库落地 | localStorage 只能用于 demo，无法满足真实运营 |
| P0 | 后端状态机与审计日志 | 前端已有规则，生产必须由后端强校验 |
| P1 | RBAC 权限落地 | 菜单已有 permission 字段，但尚未真正过滤/拦截 |
| P1 | Afirieito 与产运后台实时同步 | `/admin/afirieito` 当前是同一前端状态镜像，后续要接事件/接口同步 |
| P1 | 归因链路真实事件接入 | 需要打通曝光、点击、扫码、注册、eKYC、订单、支付、退款 |
| P1 | 结算与财务导出 | 需要真实付款资料、银行/NDP 钱包、批次导出和冲正 |
| P2 | 占位页逐步实装 | 账户、公告、文档、客服、白标等页面目前多为功能预留 |
| P2 | i18n 全量接入 | 现有 Afirieito 文案大量在组件内，后续需并入翻译表 |
| P2 | E2E 回归 | 建议为关键路由和状态动作补 Playwright 或浏览器回归 |

## 15. 开发口径

- Afirieito 是独立业务系统，不应再表现为普通用户会员页面。
- `NDA-admin` 是 PC 后台的 canonical route；`cps-admin` 和 `business-admin` 只做兼容。
- 产运后台的 `/admin/afirieito` 是同步和复核视角，不是主操作台。
- 所有危险动作必须有原因、状态机、审计日志。
- 金额和历史追踪数据默认不可删除、不可直接覆盖。
- UI 配色必须走主题变量，尤其是蓝黑主题不要出现粉紫/霓虹选中态。
- 新增页面先在菜单配置中挂清楚，不允许出现空白路由。
