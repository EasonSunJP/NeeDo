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
