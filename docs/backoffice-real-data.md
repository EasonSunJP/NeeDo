# Step 12 — Backoffice / Merchant Admin Real Data

本文件记录 Step 12 第一批真实数据接入范围。目标是让运营后台与商户后台先从正式后端读取核心经营数据，同时保留既有 UI 结构，不重做后台界面。

## 本次接入范围

- 运营后台 Dashboard：读取真实订单、排班、财务对账、技师、店铺汇总。
- 运营后台订单中心：读取 `/api/v1/backoffice/orders`。
- 运营后台财务结算：读取 `/api/v1/backoffice/finance/settlements`，并可调用导出接口。
- 运营后台技师 / 店铺管理：读取真实 `TechnicianProfile` 与 `Shop` 数据。
- 商户后台 Dashboard：按当前登录身份的 `shop` scope 读取本店数据。
- 商户后台订单中心：读取 `/api/v1/merchant-admin/orders`。
- 商户后台财务结算：读取 `/api/v1/merchant-admin/finance/settlements`。
- 商户后台员工列表：读取 `/api/v1/merchant-admin/technicians`。

调度中心后端接口已提供：

- `/api/v1/backoffice/schedule`
- `/api/v1/merchant-admin/schedule`

现有调度 UI 仍使用原本的排班工作台组件，下一批可把这些组件的数据源切换到上述接口。

## 新增 API

运营后台：

- `GET /api/v1/backoffice/dashboard`
- `GET /api/v1/backoffice/orders`
- `GET /api/v1/backoffice/schedule`
- `GET /api/v1/backoffice/finance/settlements`
- `GET /api/v1/backoffice/finance/settlements/export`
- `GET /api/v1/backoffice/technicians`
- `GET /api/v1/backoffice/shops`

商户后台：

- `GET /api/v1/merchant-admin/dashboard`
- `GET /api/v1/merchant-admin/orders`
- `GET /api/v1/merchant-admin/schedule`
- `GET /api/v1/merchant-admin/finance/settlements`
- `GET /api/v1/merchant-admin/finance/settlements/export`
- `GET /api/v1/merchant-admin/technicians`
- `GET /api/v1/merchant-admin/shop`

临时测试登录：

- `POST /api/v1/auth/test-login`
- 仅在 `AUTH_TEST_LOGIN_ENABLED=true` 且非 production 环境可用。
- 不使用随机真实用户。后端固定使用专用测试账号 `admin@needo.life`，默认密码为 `admin`，密码仍按 bcrypt rounds 12 入库。
- 该测试账号仅在非 production 且 `AUTH_TEST_LOGIN_ENABLED=true` 时由 seed 创建；账号带有用户端、商户端、技师端、业务端、运营后台所需的测试身份。
- 测试登录按钮无需输入账号密码，但后端会按当前 portal 选择该测试账号的对应身份签发正式 access / refresh token。
- 本地 `vite dev` / `vite preview` 会把 `/api/v1` 代理到正式后端，默认目标为 `http://127.0.0.1:3100`；如后端地址不同，可通过 `NEEDO_API_PROXY_TARGET` 或 `VITE_API_PROXY_TARGET` 覆盖。

## RBAC 与审计

新增权限点：

- `backoffice:dashboard:read`
- `backoffice:orders:list`
- `backoffice:schedule:list`
- `backoffice:finance:list`
- `backoffice:finance:export`
- `backoffice:technicians:list`
- `backoffice:shops:list`
- `merchant-admin:dashboard:read`
- `merchant-admin:orders:list`
- `merchant-admin:schedule:list`
- `merchant-admin:finance:list`
- `merchant-admin:finance:export`
- `merchant-admin:technicians:list`
- `merchant-admin:shop:read`

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
- `merchant_admin.technicians.list`
- `merchant_admin.shop.read`
- `auth.test_login`

## 数据来源

本次只读取既有正式表：

- `BookingOrder`
- `ScheduleSlot`
- `FinanceReconciliation`
- `LedgerTransaction`
- `Wallet`
- `TechnicianProfile`
- `Shop`
- `User`
- `AuditLog`

没有新增数据表，也没有新增 migration。

## 前端接入文件

- `src/api/backofficeRealData.ts`
- `src/pages/admin/DashboardPage.tsx`
- `src/pages/admin/OrdersAdminPage.tsx`
- `src/pages/admin/FinancePage.tsx`
- `src/pages/admin/MerchantsPage.tsx`
- `src/pages/admin/TechniciansPage.tsx`
- `src/pages/merchant-admin/MerchantAdminDashboardPage.tsx`
- `src/pages/merchant-admin/MerchantAdminOrdersPage.tsx`
- `src/pages/merchant-admin/MerchantAdminPeoplePage.tsx`
- `src/components/merchant-admin/MerchantStoreOperationsWorkspace.tsx`
- `src/pages/auth/LoginPage.tsx`
- `src/pages/auth/AdminLoginPage.tsx`
- `src/auth/AuthProvider.tsx`
- `src/api/auth.ts`

## 边界

- 本次不做 IM / Social / Notification 实时化。
- 本次不做压测。
- 本次不重做后台 UI。
- 旧后台周边模块仍可能保留 legacy mock compatibility；已接入的核心指标、订单、财务、技师、店铺数据优先走真实 API。
