# AGENTS.md — NeeDo 小步正式开发规范

> 适用项目：NeeDo / LifeDance 日本本地生活服务平台与商家 SaaS 系统  
> 适用对象：Codex、AI coding agent、人类工程师  
> 当前阶段：从高保真 demo / mock workflow 迁移到正式产品开发  
> 核心原则：**一次只做一个微步骤；每一步必须可运行、可测试、可回滚；禁止爆发式重构。**

---

## 0. Codex 必读顺序

执行任何开发任务前，必须先阅读：

1. `README.md`
2. `AGENTS.md`
3. `docs/00_MASTER_MICRO_STEP_PLAN.md`
4. 与本次任务编号对应的阶段文档，例如 `docs/04_USER_MANAGEMENT_DATA_SEED.md`
5. 如本次任务涉及账号、认证、角色、权限，必须同时阅读 `docs/User Management.md`

历史文件 `用户管理.md` 只作为参考，正式命名统一为 **User Management**。

---

## 1. 当前项目判断

NeeDo 当前不是从零开始的新项目，而是已经有大量用户端、技师端、商户端、运营后台、IM、Social、排班、订单、设置中心与 mock workflow 的高保真 demo。

正式开发目标不是继续堆 demo，而是逐步完成：

1. 真实后端工程。
2. 真实数据库与 migration。
3. User Management、Auth、RBAC。
4. 基础业务 API。
5. 前端逐批去 mock。
6. Booking、排班、订单状态机、NDP 账本。
7. 后台真实运营能力。
8. IM / Social / 通知实时化。
9. 压测、监控、安全和上线准备。

---

## 2. 绝对禁止项

### 2.1 禁止爆发式开发

- 禁止一次性重构整个仓库。
- 禁止一次性替换所有 mock。
- 禁止一次性新增所有业务表并同时接所有页面。
- 禁止把前端、后端、数据库、订单、钱包、IM、Social、支付、压测合并成一个巨大 PR。
- 禁止跳过当前阶段验收进入下一阶段。

### 2.2 禁止推倒现有前端

- 必须先读取 `package.json`、`src/`、`src/App.*`、`src/pages/`、`src/features/` 后再判断实际前端技术栈。
- 当前仓库若是 React / TSX / Vite，就必须保留 React / TSX / Vite，不得因为参考了其他项目文档就强行迁移成 Vue / Pinia / Element Plus。
- 除非用户明确要求技术栈重构，否则不得改写现有前端主框架。
- 不得删除现有路由、页面、主题 token、三端入口、mock 兼容层，除非当前阶段文档明确要求替换。

### 2.3 禁止新增假实现

- 禁止新增 mock / demo / placeholder / fake API。
- 对旧 demo 已存在的 mock，可以暂时作为 legacy compatibility 保留，但不得继续扩张。
- 已进入正式开发阶段的模块必须接真实 API 与真实数据库。
- 禁止函数体内出现 `TODO`、`FIXME`、`not implemented`。
- 禁止省略核心逻辑。

### 2.4 禁止破坏安全

- 禁止明文存储密码。
- 禁止 API 响应或日志返回 `passwordHash`、OTP、access token、refresh token。
- 禁止绕过 RBAC 访问受保护接口。
- 禁止前端写死管理员权限或 fake admin。
- 禁止无审计日志地修改用户、角色、权限、订单、账本。

### 2.5 禁止低质量 API

- 禁止列表接口无分页返回全量数据。
- 禁止 Controller 写业务逻辑。
- 禁止 Controller 直接访问 Prisma。
- 禁止未经 Zod 校验直接读取 `req.body`。
- 禁止将 Node.js 原生异常直接返回给前端。

### 2.6 禁止硬编码

- 禁止硬编码端口、域名、密钥、数据库地址、Redis 地址。
- 禁止生产环境 debug 日志。
- 前端用户可见文案必须走现有 i18n 或补齐 i18n。

---

## 3. 小步开发顺序

正式开发必须按 `docs/00_MASTER_MICRO_STEP_PLAN.md` 的编号执行。每次只允许执行一个 Step。

| Step | 主题 | 是否允许跳过 |
|---|---|---|
| 01 | 仓库审计与基线保护 | 不允许 |
| 02 | 后端工程底座、环境、Docker | 不允许 |
| 03 | Prisma / MySQL / Redis 数据库地基 | 不允许 |
| 04 | User Management 数据模型与 Seed | 不允许 |
| 05 | Auth / OTP / Token / Session | 不允许 |
| 06 | RBAC / User / Role / Permission API | 不允许 |
| 07 | 前端登录、httpClient、权限守卫 | 不允许 |
| 08 | 基础业务读 API 与契约 | 不允许 |
| 09 | 前端第一批去 mock | 不允许 |
| 10 | Booking / Schedule / Order 状态机 | 不允许 |
| 11 | NDP 钱包账本与财务对账 | 不允许 |
| 12 | 运营后台与商户后台真实数据 | 不允许 |
| 13 | IM / Social / Notification 后端化 | 可延后，不可提前 |
| 14 | 压测、监控、安全、上线准备 | 上线前必须 |

任何一步没有通过验收，不得进入下一步。

---

## 4. 后端正式工程规则

后端默认采用：

- Node.js 22 LTS
- Express.js
- TypeScript strict mode
- Prisma + Prisma Migration
- MySQL 8.0 / UTF8MB4
- Redis
- JWT + Refresh Token
- Zod
- Jest + Supertest
- ESLint + Prettier
- Docker / Docker Compose

目录结构：

```text
backend/
├── src/
│   ├── api/
│   ├── app.ts
│   ├── server.ts
│   ├── config/
│   ├── constants/
│   ├── controllers/
│   ├── middlewares/
│   ├── permissions/
│   ├── prisma/
│   ├── repositories/
│   ├── routes/
│   ├── services/
│   ├── types/
│   ├── utils/
│   └── validators/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── tests/
├── package.json
└── Dockerfile
```

分层必须遵守：

```text
Route
  ↓
Controller       # 只处理 req/res
  ↓
Service          # 业务逻辑、事务、状态机
  ↓
Repository       # 只做 Prisma 数据访问
  ↓
Database
```

---

## 5. API 统一规范

- 正式接口统一前缀：`/api/v1/`
- 通信格式：JSON
- 入参校验：Zod
- 文档：Swagger / OpenAPI
- 鉴权：JWT + RBAC permission
- 列表：必须分页
- 时间：后端 UTC，API ISO 8601

成功响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

失败响应：

```json
{
  "code": 40001,
  "message": "error.key",
  "data": null
}
```

分页响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [],
    "total": 0,
    "page": 1,
    "page_size": 20
  }
}
```

---

## 6. 数据库规则

- 所有业务表必须有：`id`、`createdAt`、`updatedAt`、`deletedAt`。
- 所有删除默认软删除。
- 所有关联字段必须建索引。
- 列表接口必须过滤 `deletedAt IS NULL`。
- 禁止 N+1 查询。
- 禁止绕过 Prisma 手写危险 SQL。
- schema 变更必须生成 migration。
- 已应用 migration 不得手改。

---

## 7. User Management 安全底线

- Access Token 有效期不超过 15 分钟。
- Refresh Token 有效期不超过 7 天，存 Redis，可吊销。
- Logout 必须把 Access Token 加入 Redis 黑名单，并删除对应 Refresh Token。
- 密码必须 bcrypt，rounds ≥ 12。
- OTP 有效期不超过 10 分钟，使用后立即失效。
- 登录失败必须限流。
- `/auth/me` 必须返回用户身份、角色、权限、菜单，但禁止返回敏感字段。

---

## 8. 每步提交前检查清单

每个 Step 完成前必须自检：

- [ ] 没有新增 mock / demo / placeholder / fake API。
- [ ] 没有 TODO / FIXME / not implemented。
- [ ] 没有硬编码密钥、端口、数据库地址、域名。
- [ ] 所有新增接口有 Zod。
- [ ] 所有新增接口有 Swagger / OpenAPI。
- [ ] 所有受保护接口有 permission 声明。
- [ ] 所有列表接口分页。
- [ ] 新增 Service 有单元测试。
- [ ] 新增 API 有集成测试。
- [ ] 如有前端文案，三语言 i18n 已补齐。
- [ ] 如有 schema 变更，migration 已生成并提交。
- [ ] README / docs 已更新。
- [ ] lint、test、build 通过。

---

## 9. 生产质量优先

最终原则：**宁可拆得更细、做得更慢，也不要快速生成不可运行、不可验收、不可回滚的代码。**
