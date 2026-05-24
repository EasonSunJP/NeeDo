# 06 — RBAC / User / Role / Permission API

> 本文档用于指导 Codex 执行 Step 06。  
> 每次只执行本 Step，不要跨步骤开发。  
> 完成后必须通过验收，再进入下一 Step。

---

## 1. 阶段目标

实现权限、角色、用户管理后端 API 和 RBAC 中间件，不做前端页面。

---

## 2. 必须先读

- `README.md`
- `AGENTS.md`
- `docs/User Management.md`
- `docs/05_AUTH_OTP_TOKEN_SESSION.md`

---

## 3. 本步必须做

- 实现 Permission CRUD、权限树。
- 实现 Role CRUD、角色权限分配。
- 实现 User CRUD、启用/禁用、软删除、用户角色分配。
- 实现 authorize middleware。
- 每个受保护接口声明 permission。
- 写审计日志。
- 写 Zod、Swagger、Jest、Supertest。

---

## 4. 本步禁止做

- 不要写前端页面。
- 不要改 UI。
- 不要写 Booking/NDP。
- 不要允许删除自己/禁用自己/移除自己 admin。

---

## 5. 交付物

- `permission validator/repository/service/controller/routes`
- `role validator/repository/service/controller/routes`
- `user validator/repository/service/controller/routes`
- `authorize.middleware.ts`
- audit log service
- `tests/permission*.test.ts`
- `tests/role*.test.ts`
- `tests/user*.test.ts`

---

## 6. 验收标准

- [ ] Permission/Role/User 接口全部分页。
- [ ] 角色权限分配在事务中执行。
- [ ] 用户角色分配在事务中执行。
- [ ] 系统角色/权限有保护。
- [ ] 审计日志记录关键操作。
- [ ] RBAC 测试通过。

---

## 7. 给 Codex 的命令

```text
请阅读 README.md、AGENTS.md、docs/User Management.md、docs/06_RBAC_USER_ROLE_PERMISSION_API.md。本次只执行 Step 06：RBAC / User / Role / Permission API。请实现 Permission、Role、User 的后端 CRUD、权限树、角色权限分配、用户角色分配、启用/禁用、软删除、authorize middleware 和 AuditLog。所有列表必须分页，所有接口必须有 Zod、Swagger/OpenAPI、permission 声明和测试。不要开发前端页面，不要改 UI，不要做 Booking/NDP/IM/Social。完成后运行 lint、test、build。
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
