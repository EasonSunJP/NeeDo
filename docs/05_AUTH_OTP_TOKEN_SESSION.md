# 05 — Auth / OTP / Token / Session

> 本文档用于指导 Codex 执行 Step 05。  
> 每次只执行本 Step，不要跨步骤开发。  
> 完成后必须通过验收，再进入下一 Step。

---

## 1. 阶段目标

实现真实登录、OTP、JWT、Refresh Token、Logout、/auth/me，但不做用户管理 CRUD 页面。

---

## 2. 必须先读

- `README.md`
- `AGENTS.md`
- `docs/User Management.md`
- `docs/04_USER_MANAGEMENT_DATA_SEED.md`

---

## 3. 本步必须做

- 实现邮箱密码登录。
- 实现 OTP 发送与验证。
- 实现 JWT Access Token 与 Refresh Token。
- Refresh Token 存 Redis，支持吊销。
- Logout 后 Access Token 加黑名单。
- 实现 /api/v1/auth/me 返回用户、身份、角色、权限、菜单。
- 实现登录失败限流。
- 写 Zod、Swagger、测试、登录日志。

---

## 4. 本步禁止做

- 不要写 Role/Permission CRUD。
- 不要写前端页面。
- 不要接三方登录。
- 不要写 Booking/NDP。

---

## 5. 交付物

- `backend/src/validators/auth.validator.ts`
- `backend/src/repositories/auth.repository.ts`
- `backend/src/services/auth.service.ts`
- `backend/src/controllers/auth.controller.ts`
- `backend/src/routes/auth.routes.ts`
- `backend/src/middlewares/authenticate.middleware.ts`
- `backend/tests/auth.test.ts`
- `Swagger/OpenAPI 更新`

---

## 6. 验收标准

- [ ] 邮箱密码登录可用。
- [ ] OTP 发送/验证可用。
- [ ] Refresh Token 可换 Access Token。
- [ ] Logout 后旧 token 失效。
- [ ] /auth/me 返回角色权限。
- [ ] 登录失败限流生效。
- [ ] 敏感字段不泄露。

---

## 7. 给 Codex 的命令

```text
请阅读 README.md、AGENTS.md、docs/User Management.md、docs/05_AUTH_OTP_TOKEN_SESSION.md。本次只执行 Step 05：Auth / OTP / Token / Session。请实现 /api/v1/auth/login、/api/v1/auth/otp/send、/api/v1/auth/otp/verify、/api/v1/auth/refresh、/api/v1/auth/logout、/api/v1/auth/me。必须使用 Zod、Swagger/OpenAPI、JWT、Redis Refresh Token、Redis token blacklist、登录失败限流、LoginLog。不要开发 Role/Permission/User CRUD，不要开发前端页面，不要接 LINE/Apple/Google 登录，不要做 Booking/NDP/IM/Social。完成后运行 auth 测试、lint、test、build。
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
