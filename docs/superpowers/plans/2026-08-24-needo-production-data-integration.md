# NeeDo Production Data Integration Implementation Plan

> **For agentic workers:** Execute one task at a time. Use test-driven development for every behavior change and verification-before-completion before each handoff. Do not stage or commit unrelated user changes.

**Goal:** 将 NeeDo 四端核心交易、实时沟通与后台运营全部接入真实 API 和数据库，生成受环境保护的三个月模拟数据，并完成可正式部署的安全、测试与运维验收。

**Architecture:** 保留 React / TypeScript / Vite 多入口前端和 Express / TypeScript / Prisma 分层后端。所有正式业务状态经 `/api/v1/` 进入 Route → Controller → Service → Repository → MySQL；Redis 负责会话、限流和实时事件。前端只通过 typed API adapter 访问数据，生产构建禁止 mock、demo seed、测试登录和 localStorage 业务数据库。

**Tech Stack:** Node.js 22、React 19、TypeScript、Vite、Express、Zod、Prisma 7、MySQL 8、Redis、Jest、Supertest、Vitest、Docker Compose、Nginx。

**Authoritative design:** `docs/superpowers/specs/2026-08-24-needo-production-data-integration-design.md`

## Global Rules

- 按 `docs/00_MASTER_MICRO_STEP_PLAN.md` 顺序补齐已有 Step 05–14 的缺口，不回退已通过能力。
- 每个 Task 只能在测试、lint、build 与该 Task 运行验收通过后标记完成。
- 生产业务代码不得新增 mock、fake API、placeholder、TODO 或 FIXME。
- 所有新增接口必须包含 Zod、Swagger、RBAC、Service 测试和 API 集成测试。
- 所有列表接口分页，所有写操作按风险写审计日志，所有 scope 在后端验证。
- 外部付费 API 未配置时只返回明确的 disabled/provider-unavailable，不提供假成功。
- 每次 Git 提交必须使用 pathspec，只包含当前 Task 的文件；先检查现有 staged 文件。

---

### Task 1: Protect the production build from demo and mock execution

**Files:**
- Modify: `backend/src/config/env.ts`
- Modify: `backend/src/constants/test-login.constants.ts`
- Modify: `backend/prisma/seed.ts`
- Modify: `src/api/staticDemo.ts`
- Modify: `src/api/auth.ts`
- Modify: `vite.config.ts`
- Create: `backend/tests/production-safety.test.ts`
- Create: `src/api/productionSafety.test.ts`
- Modify: `.env.development.example`
- Modify: `.env.staging.example`
- Modify: `.env.production.example`
- Modify: `backend/.env.dev.example`
- Modify: `backend/.env.staging.example`
- Modify: `backend/.env.prod.example`

**Steps:**

- [ ] 写失败测试：`NODE_ENV=production` 时 test login、simulation seed、static demo 和 legacy auth 均被拒绝。
- [ ] 在后端配置中增加显式 `ALLOW_TEST_LOGIN`、`ALLOW_SIMULATION_SEED` 和生产互斥校验。
- [ ] 将前端 legacy/static adapter 放入显式 development-only capability；正式登录只走 `/api/v1/auth/login`。
- [ ] Vite production build 检测 `VITE_NEEDO_STATIC_DEMO`、legacy auth base URL 与测试入口并失败。
- [ ] 更新环境示例，不填真实密钥。
- [ ] 运行 Task 测试、前后端 lint/build。

**Run:**

```bash
npm test -- src/api/productionSafety.test.ts
npm run lint
npm run build
npm --prefix backend test -- production-safety.test.ts
npm --prefix backend run lint
npm --prefix backend run build
```

**Acceptance:** 生产构建无法启用任何 demo/test 数据路径；开发构建仍可在显式开关下运行。

---

### Task 2: Add formal email/password registration and approval lifecycle

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_registration_approval/migration.sql`
- Modify: `backend/src/validators/auth.validator.ts`
- Modify: `backend/src/repositories/auth.repository.ts`
- Modify: `backend/src/services/auth.service.ts`
- Modify: `backend/src/controllers/auth.controller.ts`
- Modify: `backend/src/routes/auth.routes.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/src/constants/error-codes.ts`
- Modify: `backend/tests/auth.test.ts`
- Modify: `src/api/auth.ts`
- Modify: `src/pages/auth/LoginPage.tsx`
- Modify: `src/pages/auth/LoginPage.test.ts`

**Steps:**

- [ ] 先写注册冲突、弱密码、技师待审核、禁用账号、角色创建和敏感字段不回传测试。
- [ ] 扩展 profile 审核状态；生成 Prisma migration，不手改已应用 migration。
- [ ] 实现 `POST /api/v1/auth/register`，只允许 customer/technician 两种公开注册意图。
- [ ] 用户注册创建 customer identity；技师注册创建 pending profile，审核前禁止技师业务权限。
- [ ] 店铺和运营账号继续由受保护管理 API 创建。
- [ ] 前端注册表单接正式 API，补齐三语言 i18n 和错误状态。
- [ ] 更新 OpenAPI 并完成真实 MySQL 集成测试。

**Acceptance:** 用户可自主注册登录；技师可注册但审核前不能接单；没有短信或假 OTP 依赖。

---

### Task 3: Complete shop, technician, customer, and service write APIs

**Files:**
- Modify: `backend/src/validators/backoffice.validator.ts`
- Modify: `backend/src/repositories/backoffice.repository.ts`
- Modify: `backend/src/services/backoffice.service.ts`
- Modify: `backend/src/controllers/backoffice.controller.ts`
- Modify: `backend/src/routes/backoffice.routes.ts`
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/master-data-api.test.ts`
- Modify: `src/api/backofficeRealData.ts`
- Modify: `src/pages/admin/MerchantsPage.tsx`
- Modify: `src/pages/admin/TechniciansPage.tsx`
- Modify: `src/pages/admin/UsersPage.tsx`
- Modify: `src/pages/merchant-admin/MerchantAdminPeoplePage.tsx`

**Steps:**

- [ ] 写分页、创建／更新、审核、软删除、重复邮箱、跨店越权和审计失败测试。
- [ ] 补齐店铺创建／审核、技师审核／归属、客户详情、店铺服务 CRUD。
- [ ] 所有商户查询从 auth identity scope 解析 shopId，拒绝前端传入其他店铺。
- [ ] 扩展 typed adapter，移除这些页面中的 `data/mock` 和 `merchantAdminDemo`。
- [ ] 运营详情采用集中抽屉展示关联数据，不增加重复页面跳转。

**Acceptance:** 运营可管理真实店铺／技师／用户；店铺只能管理自己的人员和服务。

---

### Task 4: Connect schedule and availability end to end

**Files:**
- Modify: `backend/src/validators/booking.validator.ts`
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/controllers/booking.controller.ts`
- Modify: `backend/src/routes/booking.routes.ts`
- Modify: `backend/tests/booking-service.test.ts`
- Modify: `backend/tests/booking-api.test.ts`
- Modify: `src/features/booking/api.ts`
- Create: `src/features/scheduling/api.ts`
- Create: `src/features/scheduling/api.test.ts`
- Modify: `src/components/scheduling/UnifiedUserCalendar.tsx`
- Modify: `src/components/scheduling/UnifiedUserCalendar.test.ts`
- Modify: `src/features/technician-schedule/route-pages.tsx`

**Steps:**

- [ ] 写 availability/slot 分页、重叠检查、跨店越权、时区边界和 slot 并发预约测试。
- [ ] 补齐排班写 API 与事务性 slot 状态变更。
- [ ] 新建 scheduling typed adapter，将真实 UTC/ISO 数据映射到现有日历。
- [ ] 移除 `UnifiedUserCalendar` 的订单 mock；localStorage 只保留标签／折叠等 UI 偏好。
- [ ] 技师和店铺排班操作接正式 API，提供 loading/empty/error/conflict 状态。

**Acceptance:** 排班在刷新、跨设备和多角色下保持一致；同一时段不能被重复预约。

---

### Task 5: Complete booking, manual payment, NDP, and cancellation flows

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_manual_payment_flow/migration.sql`
- Modify: `backend/src/validators/booking.validator.ts`
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/services/ledger.service.ts`
- Modify: `backend/src/controllers/booking.controller.ts`
- Modify: `backend/src/routes/booking.routes.ts`
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/manual-payment-api.test.ts`
- Modify: `backend/tests/booking-service.test.ts`
- Modify: `backend/tests/ledger-service.test.ts`
- Modify: `src/features/booking/api.ts`

**Steps:**

- [ ] 写允许／禁止状态转换、幂等完成、不同取消方、线下收款确认、退款标记和账本平衡测试。
- [ ] 新增 payment method/status/confirmedBy/confirmedAt 等正式字段和 migration。
- [ ] 在单一事务内完成 slot、订单历史、WalletHold、Ledger 和通知变更。
- [ ] 提供店铺／运营收款确认与充值／提现人工审核接口；所有动作审计。
- [ ] 补齐 OpenAPI 和稳定错误码。

**Acceptance:** 订单从创建到完成／取消可真实流转，重试不重复扣款或结算。

---

### Task 6: Connect customer and technician core application pages

**Files:**
- Modify: `src/pages/user/HomePage.tsx`
- Modify: `src/pages/user/CategoryPage.tsx`
- Modify: `src/pages/user/ServiceDetailPage.tsx`
- Modify: `src/pages/user/StoreDetailPage.tsx`
- Modify: `src/pages/user/CheckoutPage.tsx`
- Modify: `src/pages/user/UserOrdersPage.tsx`
- Modify: `src/pages/user/UserOrderDetailPage.tsx`
- Modify: `src/pages/user/UserCenterPage.tsx`
- Modify: `src/pages/mobile/TechnicianPortalPage.tsx`
- Modify: `src/pages/mobile/NeedoRoutePages.tsx`
- Modify: `src/pages/mobile/MerchantOrderRoutePages.tsx`
- Modify: relevant adjacent tests

**Steps:**

- [ ] 为真实加载、空数据、401、403、409、服务器失败和重试编写页面／adapter 测试。
- [ ] 将分类、店铺、技师、服务、预约、订单详情全部映射到正式 API。
- [ ] 删除用户订单的 localStorage 业务删除状态，改为服务器软删除／隐藏偏好 API 或只读归档规则。
- [ ] 技师待办、确认、开始、完成和取消使用真实 booking API。
- [ ] 保持现有 UI 和路由，补齐三语言错误文案。

**Acceptance:** 用户和技师可在两个浏览器会话中完成同一订单闭环，刷新后状态不丢失。

---

### Task 7: Complete operations and merchant admin core real-data pages

**Files:**
- Modify: `src/pages/admin/DashboardPage.tsx`
- Modify: `src/pages/admin/OrdersAdminPage.tsx`
- Modify: `src/pages/admin/FinancePage.tsx`
- Modify: `src/pages/admin/AnalyticsPage.tsx`
- Modify: `src/pages/admin/DataCenterPage.tsx`
- Modify: `src/pages/admin/ReviewsPage.tsx`
- Modify: `src/pages/merchant-admin/MerchantAdminDashboardPage.tsx`
- Modify: `src/pages/merchant-admin/MerchantAdminOrdersPage.tsx`
- Modify: `src/pages/merchant-admin/MerchantAdminAnalyticsPage.tsx`
- Modify: `src/pages/merchant-admin/MerchantAdminSettingsPage.tsx`
- Modify: `src/api/backofficeRealData.ts`
- Modify: relevant tests

**Steps:**

- [ ] 增加后台聚合契约测试，确保同一筛选口径下仪表盘、列表和财务总额一致。
- [ ] 移除核心后台页面的订单、结算、服务和商户 mock。
- [ ] 店铺设置从真实 shop/profile/rule API 读取；文档上传未正式实现时显示 disabled，不显示 demo 文件。
- [ ] 所有列表分页、筛选、排序；详情操作后精确失效和刷新。
- [ ] 对无正式后端的外围模块先从生产导航隐藏或显示“尚未启用”，不得展示假运营指标。

**Acceptance:** 运营和店铺后台看到的订单、人员、排班和财务与数据库一致。

---

### Task 8: Remove remaining production mock dependencies

**Files:**
- Modify: remaining files reported by `rg "data/mock|merchantAdminDemo|mockInstalled" src`
- Modify: production navigation and route capability configuration
- Create: `scripts/audit-production-mocks.mjs`
- Create: `scripts/audit-production-mocks.test.mjs`
- Modify: `package.json`

**Steps:**

- [ ] 建立允许列表式静态审计，生产入口不得 import `src/data/mock`、`src/data/merchantAdmin` 或安装 fetch mock。
- [ ] 对已有正式后端的页面接真实 adapter。
- [ ] 对尚未建后端且不属于首期核心的装修、库存、营销、现场任务、Exchange 等模块使用 capability gate 隐藏或明确 disabled。
- [ ] 不删除 demo 数据源本身，保留给 `dev:static`，但保证生产依赖图不可达。
- [ ] 将审计加入 `npm run build` 前置验证。

**Acceptance:** 生产依赖扫描为零违规；静态 demo 仍可独立运行且不会影响正式构建。

---

### Task 9: Replace IM browser database with real REST and SSE

**Files:**
- Modify: `src/features/im/api.ts`
- Modify: `src/features/im/store.ts`
- Modify: `src/features/im/model.ts`
- Modify: `src/features/im/pages.tsx`
- Delete or dev-gate: `src/features/im/seed.ts`
- Modify: `src/features/im/api.test.ts`
- Modify: `src/features/im/model.test.ts`
- Modify: `backend/src/services/realtime.service.ts`
- Modify: `backend/src/repositories/realtime.repository.ts`
- Modify: `backend/src/routes/realtime.routes.ts`
- Modify: `backend/tests/realtime-api.test.ts`

**Steps:**

- [ ] 写会话分页、消息游标、成员越权、重复发送、SSE 重连和遗漏补取测试。
- [ ] 将 `im/api.ts` 改成纯 HTTP/SSE adapter，删除 fetch mock 安装与浏览器业务数据库。
- [ ] localStorage 只保留折叠、滚动位置和标签显示等 UI 偏好。
- [ ] 事件以 cursor/Last-Event-ID 重连；事件到达后按资源 ID 增量刷新。
- [ ] 禁止未正式实现的文件上传走 base64/localStorage。

**Acceptance:** 两个真实账号可即时收发消息，刷新和断线重连后记录完整且越权请求被拒绝。

---

### Task 10: Replace Social local state with real REST and SSE

**Files:**
- Modify: `src/features/social/context.tsx`
- Create: `src/features/social/api.ts`
- Create: `src/features/social/api.test.ts`
- Modify: `src/features/social/timeline.ts`
- Modify: `src/features/social/pages/*.tsx`
- Modify: `backend/src/services/realtime.service.ts`
- Modify: `backend/src/repositories/realtime.repository.ts`
- Modify: `backend/src/routes/realtime.routes.ts`
- Modify: `backend/tests/realtime-api.test.ts`

**Steps:**

- [ ] 写动态分页、可见性、关注幂等、通知已读、跨账号越权和 SSE 更新测试。
- [ ] 新建 typed social adapter；context 只协调远端数据和 UI 状态。
- [ ] 删除 `needo.social.module.*` 业务持久化和 demo avatar/image 数据依赖。
- [ ] 未接对象存储前禁止图片发布，只允许后端支持的正式内容类型。
- [ ] 打通通知中心和未读计数。

**Acceptance:** 动态、关注和通知由数据库驱动，跨浏览器状态一致。

---

### Task 11: Generate deterministic three-month simulation data and account exports

**Files:**
- Create: `backend/scripts/seed-simulation.ts`
- Create: `backend/scripts/verify-simulation.ts`
- Create: `backend/src/services/simulation-seed.service.ts`
- Create: `backend/tests/simulation-seed.test.ts`
- Modify: `backend/package.json`
- Modify: `.gitignore`
- Modify: `docs/deployment.md`

**Steps:**

- [ ] 先写生产拒绝、固定 seed 可重复、数量、排班无重叠、状态历史、账本平衡和幂等测试。
- [ ] 生成 10 店铺、100 技师、100 用户及三个月服务、排班和预约。
- [ ] 状态覆盖 PENDING、CONFIRMED、IN_SERVICE、COMPLETED、CANCELLED；取消覆盖用户／店铺不同阶段。
- [ ] 所有已完成订单具备付款确认、结算和通知；取消订单具备正确 slot 与账本处理。
- [ ] 生成 `outputs/simulation-data/simulation-accounts.csv` 和 `.xlsx`，包含账号类型、邮箱、密码、显示名、店铺、状态和备注。
- [ ] 运行独立一致性校验并输出 JSON 报告。

**Run:**

```bash
ALLOW_SIMULATION_SEED=true npm --prefix backend run seed:simulation
npm --prefix backend run verify:simulation
```

**Acceptance:** 数量精确，所有关系一致，账号清单可用，生产环境执行命令会被拒绝。

---

### Task 12: Production hardening, full verification, and deployment handoff

**Files:**
- Modify: `deploy/prod/docker-compose.yml`
- Modify: `deploy/prod/nginx.needo.conf.example`
- Modify: `docs/deployment.md`
- Modify: `docs/security.md`
- Modify: `docs/performance.md`
- Create: `scripts/production-smoke.mjs`
- Create: `scripts/production-smoke.test.mjs`
- Create: `docs/production-release-checklist.md`

**Steps:**

- [ ] 校验 Nginx `/api/v1/`、Swagger 权限、SSE buffering/timeout、CORS 和安全响应头。
- [ ] 完成 migration deploy、备份、恢复、健康、ready、日志、指标、限流和 Secret 检查。
- [ ] 添加四角色 smoke：注册／登录、人员审核、排班、预约、完成／取消、人工支付、账本、IM、Social。
- [ ] 运行前后端全量 lint/test/build、OpenAPI、静态 mock 审计、模拟数据校验。
- [ ] 在 staging 执行数据库备份恢复、滚动部署和回滚演练。
- [ ] 记录已暂缓外部 API、启用条件和上线后的监控告警。
- [ ] 获得实际服务器／云控制台或 SSH 权限后部署正式后端、数据库、Redis 和 Nginx；仅 FTP 静态上传不能完成正式上线。

**Run:**

```bash
npm test
npm run lint
npm run build
npm --prefix backend test
npm --prefix backend run lint
npm --prefix backend run build
node scripts/audit-production-mocks.mjs
node scripts/production-smoke.mjs --base-url http://127.0.0.1:5180
```

**Acceptance:** 所有自动检查通过；staging 真实业务闭环通过；具备可执行的生产部署与回滚证据。正式公网发布仍以取得服务器端权限为外部前置条件。

## Final Definition of Done

- 四端核心交易数据全部由正式 API/MySQL 驱动。
- 生产依赖图中无 mock、fake auth、demo seed 或 localStorage 业务数据库。
- 认证、RBAC、scope、审计、状态机、账本和实时重连均有自动化测试。
- 10 店铺、100 技师、100 用户与三个月模拟数据在非生产环境通过一致性校验。
- CSV/XLSX 模拟账号清单交付且未加入 Git。
- 前后端 lint/test/build、OpenAPI、smoke、备份恢复和回滚演练通过。
- 外部付费 API 未启用时行为明确、安全，不影响核心线下业务上线。
