# 07 — 前端登录、httpClient、权限守卫

> 本文档用于指导 Codex 执行 Step 07。  
> 每次只执行本 Step，不要跨步骤开发。  
> 完成后必须通过验收，再进入下一 Step。

---

## 1. 阶段目标

在保留现有前端 UI 和技术栈的基础上，接入真实 Auth / RBAC，不替换全部 mock。

---

## 2. 必须先读

- `README.md`
- `AGENTS.md`
- `docs/User Management.md`
- `docs/06_RBAC_USER_ROLE_PERMISSION_API.md`

---

## 3. 本步必须做

- 新增或改造统一 httpClient。
- 接入 /auth/login、/auth/refresh、/auth/logout、/auth/me。
- Access Token 使用内存状态，Refresh Token 安全持久化。
- 实现请求拦截器和 401 refresh 流程。
- 实现路由守卫。
- 实现权限菜单和按钮权限 helper。
- 只接入登录、权限、后台 User/Role/Permission 页面。
- 补三语言 i18n。

---

## 4. 本步禁止做

- 不要重构三端 UI。
- 不要替换所有 mock。
- 不要改 Booking、IM、Social。
- 不要把前端框架迁移成别的技术栈。

---

## 5. 交付物

- `src/api/httpClient.*`
- `src/api/auth.*`
- `src/auth/* 或现有等价路径`
- 登录页接入真实 API
- `后台 User/Role/Permission 页面接真实 API`
- i18n 更新
- 前端测试

---

## 6. 验收标准

- [ ] 管理员可真实登录。
- [ ] 刷新页面后可恢复登录态。
- [ ] 无权限路由跳 403 或隐藏。
- [ ] 按钮权限可控制显示。
- [ ] 旧页面 UI 未破坏。
- [ ] 前端 lint/test/build 通过。

---

## 7. 给 Codex 的命令

```text
请阅读 README.md、AGENTS.md、docs/User Management.md、docs/07_FRONTEND_AUTH_PERMISSION_INTEGRATION.md。本次只执行 Step 07：前端登录、httpClient、权限守卫。请先确认当前前端实际技术栈并保留它。请接入真实 /api/v1/auth/*、/users、/roles、/permissions，新增或改造统一 httpClient、token refresh、路由守卫、权限菜单、按钮权限和必要的后台 User/Role/Permission 页面。不要重构三端 UI，不要替换所有 mock，不要做 Booking/NDP/IM/Social。完成后运行前端 lint/test/build，并更新文档。
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

---

## 9. 2026-05-25 执行记录

本次 Step 07 已按当前仓库实际技术栈执行：前端保持 React 19 / TypeScript / Vite / React Router 7，不迁移框架，不重构三端 UI，不替换 Booking / NDP / IM / Social mock。

### 已接入内容

- 新增统一前端 API 层：
  - `src/api/httpClient.ts`
  - `src/api/auth.ts`
  - `src/api/userManagement.ts`
- Auth 接入真实接口：
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/otp/send`
  - `POST /api/v1/auth/otp/verify`
  - `POST /api/v1/auth/refresh`
  - `POST /api/v1/auth/logout`
  - `GET /api/v1/auth/me`
- User / Role / Permission 后台页面接入真实接口：
  - `GET /api/v1/users`
  - `POST /api/v1/users`
  - `POST /api/v1/users/:id/enable`
  - `POST /api/v1/users/:id/disable`
  - `DELETE /api/v1/users/:id`
  - `PUT /api/v1/users/:id/roles`
  - `GET /api/v1/roles`
  - `POST /api/v1/roles`
  - `DELETE /api/v1/roles/:id`
  - `PUT /api/v1/roles/:id/permissions`
  - `GET /api/v1/permissions`
  - `GET /api/v1/permissions/tree`
  - `POST /api/v1/permissions`
  - `DELETE /api/v1/permissions/:id`

### 前端安全与权限实现

- Access Token 仅保存在前端模块内存中，不写入 localStorage。
- Refresh Token 按当前后端响应形态持久化到 `needo.auth.refresh-token`，用于刷新页面后恢复登录态。
- 统一 httpClient 在受保护请求 401 时调用 `/auth/refresh`，刷新成功后重试原请求；刷新失败会清理本地登录态。
- `/auth/me` 是前端用户、身份、角色、权限、菜单的单一来源。
- 路由守卫会等待 refresh 恢复完成后再判断跳转。
- 后台菜单按 `menu:*` 权限隐藏；User / Role / Permission 页面按 `page:*` 权限守卫；创建、删除、启停、分配按钮按 `button:*` 权限显示。
- 旧测试账号登录入口已从正式登录页移除；Google / QR 登录不再创建 fake session，后续需等正式后端接口。

### 验证

- `npm test` 通过：38 个测试文件，228 个测试。
- `npm run lint` 通过。
- `npm run build` 通过。
- Browser smoke 通过：`http://localhost:5181/pf-admin.html#/login/admin` 可渲染后台登录页，验证码 tab 可切换；未登录访问 `#/admin/users` 会跳转到 `#/login/admin?redirect=%2Fadmin%2Fusers`，控制台无相关 error / warning。

## 10. 2026-05-26 登录态跨客户端门户执行记录

- 默认入口继续保持用户端 `#/`。
- 已登录用户端后，可直接进入商户端、技师端、Afirieito 这类非后台客户端门户的启动页和基础壳层，不再要求重新输入账号密码。
- 运营后台、商户后台仍只接受真实 RBAC 门户身份，不把用户端登录态提升为后台权限。
