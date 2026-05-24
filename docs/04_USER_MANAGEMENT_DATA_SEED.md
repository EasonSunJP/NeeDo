# 04 — User Management 数据模型、Migration、Seed

> 本文档用于指导 Codex 执行 Step 04。  
> 每次只执行本 Step，不要跨步骤开发。  
> 完成后必须通过验收，再进入下一 Step。

---

## 1. 阶段目标

只完成 User Management 的数据库模型和初始化数据，不写登录 API，不写前端。

---

## 2. 必须先读

- `README.md`
- `AGENTS.md`
- `docs/User Management.md`
- `docs/03_DATABASE_PRISMA_SCHEMA_FOUNDATION.md`

---

## 3. 本步必须做

- 新增 User、UserIdentity、Role、Permission、UserRole、RolePermission、LoginLog、AuditLog。
- 所有表满足 id、createdAt、updatedAt、deletedAt 规则，关联字段建索引。
- 初始化系统角色：admin、operator、finance、support、merchant_owner、merchant_staff、technician、customer、broker、scout、viewer。
- 初始化基础权限：auth、user、role、permission、menu、dashboard。
- 从 ADMIN_DEFAULT_PASSWORD 读取超级管理员初始密码。
- 生成 migration 和 seed。
- 编写 seed 测试或最小验证脚本。

---

## 4. 本步禁止做

- 不要写 /auth/login。
- 不要写 OTP。
- 不要写前端登录页。
- 不要写 Booking/NDP/IM/Social。
- 不要硬编码 admin 密码。

---

## 5. 交付物

- `backend/prisma/schema.prisma 更新`
- `backend/prisma/migrations/*`
- `backend/prisma/seed.ts`
- `backend/src/constants/permissions.constants.ts`
- `docs/database.md 更新`

---

## 6. 验收标准

- [ ] migration 成功。
- [ ] seed 成功。
- [ ] admin 用户存在且密码来自环境变量。
- [ ] 系统角色和权限存在。
- [ ] passwordHash 不会出现在任何日志或 API 响应中。

---

## 7. 给 Codex 的命令

```text
请阅读 README.md、AGENTS.md、docs/User Management.md、docs/04_USER_MANAGEMENT_DATA_SEED.md。本次只执行 Step 04：User Management 数据模型、Migration、Seed。请只实现 User、UserIdentity、Role、Permission、UserRole、RolePermission、LoginLog、AuditLog 的 Prisma schema、migration 和 seed。seed 必须初始化 admin/operator/finance/support/merchant_owner/merchant_staff/technician/customer/broker/scout/viewer 角色、基础权限和超级管理员账号；超级管理员密码必须从 ADMIN_DEFAULT_PASSWORD 环境变量读取。不要开发登录 API、OTP、前端页面、Booking、NDP、IM、Social。完成后运行 migrate、seed、lint、test、build，并更新 docs/database.md。
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
