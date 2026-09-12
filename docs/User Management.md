# User Management — NeeDo 账号体系、认证、权限、角色与 RBAC 专项开发文档

> 用户、技师、店铺与联盟营销身份的申请、审核、合同、银行名义、试用期和 30 天删除规则，以 [`IDENTITY_APPLICATION_WORKFLOWS.md`](./IDENTITY_APPLICATION_WORKFLOWS.md) 为准。

> 文档版本：v1.3.0
> 最后更新：2026-08-27
> 原文件名：`用户管理.md`  
> 新文件名：`User Management.md`  
> 适用阶段：Step 1「工程底座、数据库、认证权限」  
> 适用对象：Codex、AI coding agent、人类工程师  
> 核心目标：把 NeeDo 从 fake user / mock admin / localStorage 登录，升级为真实账号、真实数据库、真实权限和真实后台用户管理。
> v4 小步开发说明：本文件作为 User Management 总规范；实际执行时请拆分到 Step 04、Step 05、Step 06、Step 07，不要一次性完成全部 User Management。


---

## 0. 重命名规则

从本版本开始，模块统一命名为 **User Management**。

后续所有文档、PR、代码注释、Issue、任务说明中，优先使用：

```text
User Management
Auth
RBAC
Role
Permission
User Identity
```

不得再新增以下旧命名文件：

```text
用户管理.md
01A-用户管理_认证权限_RBAC专项开发文档.md
```

如仓库中已经存在旧文件，Codex 可以读取作为历史参考，但必须把正式引用迁移到：

```text
docs/User Management.md
```

---

## 1. Codex 必读文件

执行本专项前，Codex 必须先阅读：

1. `README.md`  
   判断当前仓库实际技术栈、路由、三端入口、mock 边界。
2. `AGENTS.md`  
   遵守 NeeDo 正式开发规范，尤其是禁止爆发式开发、禁止新增 fake API、禁止推倒现有前端。
3. `docs/User Management.md`  
   本文档。
4. `docs/01-正式开发第一步-工程底座_数据库_认证权限.md`  
   若存在，则本专项依附于 Step 1 执行。

冲突优先级：

```text
AGENTS.md > docs/User Management.md > README.md > 旧 demo 代码
```

若 CTO 其他项目文档要求 Vue / Pinia / Element Plus，但当前 NeeDo 仓库实际是 React / TSX / Vite，则必须以当前仓库为准，不得强制迁移技术栈。

---

## 2. 为什么 User Management 必须先做

NeeDo 当前已经有大量页面、三端入口、后台菜单、IM、Social、排班、订单和设置中心，但正式产品缺少账号与权限中枢。

如果没有 User Management，后续会出现严重问题：

1. 前端只能继续使用 fake user / mock admin。
2. 后台菜单无法按真实权限显示。
3. 平台运营、商户、技师、C 端用户的权限边界不清楚。
4. 订单、排班、钱包、IM、Social 无法绑定真实 userId。
5. 高并发下所有用户状态散落在本地状态，无法审计、限流、风控。
6. 后续 Booking、NDP、eKYC、订阅、后台审核都会返工。

因此 User Management 是正式产品开发的第一道地基。

---

## 3. 本专项总体目标

完成后必须达到：

1. 管理员可以用真实账号登录。
2. 登录返回 Access Token + Refresh Token。
3. 页面刷新后可通过 Refresh Token 恢复登录态。
4. Logout 后旧 Access Token 失效。
5. `/api/v1/auth/me` 返回当前用户、身份、角色、权限、菜单。
6. 后台菜单根据权限动态显示。
7. 页面和按钮级权限可以控制访问和操作。
8. 权限、角色、用户可以通过后台 CRUD 管理。
9. 所有 User / Role / Permission 数据来自 MySQL，不来自 mock。
10. Token、OTP、登录失败限流、黑名单、权限缓存使用 Redis。
11. 所有接口有 Zod、Swagger/OpenAPI、测试和审计日志。
12. 不破坏现有三端前端 UI，不重写整个前端。

---

## 4. 本专项边界

### 4.1 必须做

- 后端 User / Identity / Role / Permission 数据模型。
- Prisma migration 和 seed。
- 邮箱密码登录。
- 邮箱注册先验证 OTP，验证成功后才创建账号。
- 邮箱或不可变 NeeDoID + 密码登录。
- Google Identity Services 注册/登录，以及登录后绑定、密码设置和解绑。
- 首次 Google 使用或绑定验证邮箱；已绑定 Google 后续直接登录。
- OTP 发送与验证。
- JWT Access Token。
- Refresh Token。
- Logout 黑名单。
- `/auth/me`。
- 用户 CRUD。
- 用户启用 / 禁用。
- 用户软删除。
- 用户角色分配。
- 角色 CRUD。
- 角色权限分配。
- 权限 CRUD。
- 权限树。
- 登录日志。
- 审计日志。
- 前端登录接真实接口。
- 前端 httpClient / API adapter。
- 前端 token refresh。
- 前端权限守卫。
- 前端用户、角色、权限后台页面或接入现有后台页面。
- i18n 三语文案。
- Jest + Supertest + 前端关键测试。

### 4.2 本专项不做

- 不做 Booking 下单。
- 不做 NDP 钱包账本。
- 不做 Stripe / 支付。
- 不做 LINE / Apple 三方登录正式接入。
- 不把 Google 登录扩大为 Google Calendar 接入；Calendar 的 OAuth scope、
  consent 和 provider token 生命周期必须作为独立任务设计。
- 不做完整 eKYC 审核流。
- 不做完整商户入驻。
- 不做完整技师资料审核。
- 不做 IM WebSocket。
- 不做 Social 后端。
- 不做 Request 大厅。
- 不做会员订阅。
- 不一次性替换所有 mock 数据。
- 不重构现有前端视觉和导航结构。

---

## 5. NeeDo 账号体系定义

NeeDo 不是单一后台系统，正式账号体系需要同时支持五类主体：

| 主体 | 说明 | Step 1 处理方式 |
|---|---|---|
| 平台运营用户 | NeeDo 内部运营、客服、财务、超级管理员 | 必须完整支持 |
| 商户 / 店铺用户 | 店长、店铺员工、经纪人、介绍人 | 建账号、身份、角色基础；业务资料后续补齐 |
| 技师 / 服务者 | 独立技师、挂靠技师、员工技师 | 建账号、身份、角色基础；技师档案后续接业务 API |
| C 端用户 | 普通用户、Premium / VIP / Black 用户 | 建账号基础；会员、钱包后续接入 |
| 经纪人 / 介绍人 | 管理技师组、拉新、分销收益 | Step 1 可建身份类型和基础角色，收益系统后续实现 |

### 5.1 核心原则

```text
User / Account
  负责：登录凭证、邮箱、手机号、密码、OTP、Token、登录状态

UserIdentity
  负责：当前账号在 NeeDo 中扮演什么身份
  例如：customer / technician / merchant_owner / merchant_staff / broker / scout / platform_admin

Role / Permission
  负责：在某个作用域中能做什么
  例如：平台级用户管理、某个店铺的排班管理、某个商户的财务查看
```

一个账号可以拥有多个身份。例如：

- 同一个人既是 C 端用户，也是技师。
- 店长既可以作为普通用户预约，也可以切换到商户端管理店铺。
- 平台运营人员也可能有测试用 C 端身份。
- 经纪人可以管理多个店铺或多个技师组。

---

## 6. 推荐 PR 拆分

User Management 必须拆成小 PR，不允许一次性爆发式开发。

### PR-U01：数据库模型、migration、seed

交付：

- `User`
- `UserIdentity`
- `Role`
- `Permission`
- `UserRole`
- `RolePermission`
- `LoginLog`
- `AuditLog`
- Prisma migration
- seed 初始化系统角色、权限、超级管理员

验收：

- `prisma migrate dev` 成功。
- `prisma db seed` 成功。
- 数据库中有超级管理员账号。
- 数据库中有系统角色和基础权限。
- 没有业务表使用物理删除。

---

### PR-U02：Auth、Token、OTP、Session

交付 API：

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/register/verify`
- `POST /api/v1/auth/google/init`
- `POST /api/v1/auth/google`
- `POST /api/v1/auth/google/verify`
- `GET /api/v1/auth/google/link`
- `POST /api/v1/auth/google/link/init`
- `POST /api/v1/auth/google/link`
- `POST /api/v1/auth/google/link/verify`
- `POST /api/v1/auth/password/setup`
- `POST /api/v1/auth/password/setup/verify`
- `POST /api/v1/auth/google/unlink`
- `POST /api/v1/auth/google/unlink/verify`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

验收：

- 邮箱或 NeeDoID + 密码登录可用。
- 邮箱注册在 OTP 验证前不创建 User。
- Google 首次使用验证、已绑定直接登录、账号绑定、密码设置和安全解绑可用。
- Refresh Token 可刷新 Access Token。
- Logout 后 Access Token 黑名单生效。
- `/auth/me` 返回身份列表、当前身份、角色、权限和菜单。
- 错误码、Redis key、密码强度、限流全部实现。

---

### PR-U03：Role / Permission / RBAC

交付：

- 权限列表、权限树、创建、编辑、软删除。
- 角色列表、详情、创建、编辑、分配权限、软删除。
- RBAC middleware。
- 每个受保护 API 声明 permission。
- 权限缓存与缓存失效。

验收：

- admin 可以管理角色和权限。
- 普通用户不能访问角色 / 权限管理接口。
- 系统角色不能删除。
- 系统权限不能随意删除。
- 权限变更后用户权限缓存被清理。

---

### PR-U04：User CRUD、User Identity、用户角色分配

交付：

- 用户列表、创建、编辑、禁用、启用、软删除。
- 用户角色分配。
- 用户身份列表。
- 当前身份切换。
- 身份作用域校验。
- 登录日志和审计日志。

验收：

- 管理员可以管理用户。
- 响应中不返回 `passwordHash`。
- 不能禁用自己。
- 不能删除自己。
- 不能删除超级管理员。
- 不能移除自己的最后一个 admin 权限。
- 同一账号可以拥有 customer + technician + merchant 身份。
- 无对应身份时不能进入对应端。

---

### PR-U05：前端接入、权限守卫、后台页面

交付：

- 统一 `httpClient`。
- `auth.api.ts`。
- `user-management.api.ts`。
- auth store / state。
- 登录页接真实 API。
- Token refresh。
- Logout。
- 路由守卫。
- 权限 helper / hook / directive。
- 用户管理页面。
- 角色管理页面。
- 权限管理页面。
- 三语 i18n。

验收：

- 未登录访问受保护页面跳转登录。
- 登录后根据身份和权限进入对应端。
- Access Token 过期后自动刷新。
- Refresh 失败后清理状态并跳登录页。
- 用户、角色、权限页面可用。
- 前端无 fake admin、无硬编码 token、无新增 mock。

---

## 7. 数据库模型建议

### 7.1 User

`User` 是登录账号，不是 C 端用户画像。

```prisma
model User {
  id                Int        @id @default(autoincrement())
  needoId           String     @unique @map("needo_id") @db.VarChar(32)
  email             String     @unique @db.VarChar(255)
  phone             String?    @unique @db.VarChar(32)
  emailVerifiedAt   DateTime?  @map("email_verified_at")
  passwordHash      String?    @map("password_hash") @db.VarChar(255)
  username          String     @db.VarChar(100)
  avatarUrl         String?    @map("avatar_url") @db.VarChar(500)
  isActive          Boolean    @default(true) @map("is_active")
  sessionGeneration Int        @default(0) @map("session_generation")
  lastLoginAt       DateTime?  @map("last_login_at")
  createdAt         DateTime   @default(now()) @map("created_at")
  updatedAt         DateTime   @updatedAt @map("updated_at")
  deletedAt         DateTime?  @map("deleted_at")

  identities   UserIdentity[]
  userRoles    UserRole[]
  loginLogs    LoginLog[]
  auditLogs    AuditLog[]
  externalAccounts ExternalAuthAccount[]

  @@index([email])
  @@index([phone])
  @@index([isActive])
  @@index([deletedAt])
  @@map("users")
}
```

`needoId` 的正式格式是 lowercase `n` + 10 位十进制数字。它由后端在
邮箱验证完成、创建基线账号的事务中分配，永久 immutable，专门作为稳定
登录标识。`username`、CustomerProfile/UserIdentity 的 display name 是可编辑
昵称：新账号初始值等于 `needoId`，后续修改显示名称不得回写或替换
`needoId`。Google-only 账号允许 `passwordHash=null`，但仍必须有已验证邮箱、
NeeDoID、基线 customer identity/role/profile。

### 7.2 UserIdentity

`UserIdentity` 表示账号在 NeeDo 中的业务身份。

```prisma
model UserIdentity {
  id          Int       @id @default(autoincrement())
  userId      Int       @map("user_id")
  type        String    @db.VarChar(50) // platform | customer | technician | merchant | broker | scout
  scopeType   String?   @map("scope_type") @db.VarChar(50) // global | shop | technician_group
  scopeId     Int?      @map("scope_id")
  displayName String?   @map("display_name") @db.VarChar(100)
  isDefault   Boolean   @default(false) @map("is_default")
  isActive    Boolean   @default(true) @map("is_active")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  deletedAt   DateTime? @map("deleted_at")

  user User @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([type])
  @@index([scopeType, scopeId])
  @@index([deletedAt])
  @@map("user_identities")
}
```

### 7.3 Role

```prisma
model Role {
  id          Int       @id @default(autoincrement())
  name        String    @db.VarChar(100)
  code        String    @unique @db.VarChar(100)
  description String?   @db.VarChar(500)
  isSystem    Boolean   @default(false) @map("is_system")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  deletedAt   DateTime? @map("deleted_at")

  userRoles        UserRole[]
  rolePermissions  RolePermission[]

  @@index([code])
  @@index([deletedAt])
  @@map("roles")
}
```

### 7.4 Permission

```prisma
model Permission {
  id          Int       @id @default(autoincrement())
  name        String    @db.VarChar(100)
  code        String    @unique @db.VarChar(100)
  type        String    @db.VarChar(50) // api | menu | page | button
  module      String    @db.VarChar(100)
  description String?   @db.VarChar(500)
  isSystem    Boolean   @default(false) @map("is_system")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  deletedAt   DateTime? @map("deleted_at")

  rolePermissions RolePermission[]

  @@index([code])
  @@index([type])
  @@index([module])
  @@index([deletedAt])
  @@map("permissions")
}
```

### 7.5 UserRole

`UserRole` 必须支持作用域，方便商户 / 店铺 / 经纪人权限后续扩展。

```prisma
model UserRole {
  id        Int      @id @default(autoincrement())
  userId    Int      @map("user_id")
  roleId    Int      @map("role_id")
  scopeType String?  @map("scope_type") @db.VarChar(50) // global | shop | technician_group
  scopeId   Int?     @map("scope_id")
  createdAt DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id])
  role Role @relation(fields: [roleId], references: [id])

  @@unique([userId, roleId, scopeType, scopeId])
  @@index([userId])
  @@index([roleId])
  @@index([scopeType, scopeId])
  @@map("user_roles")
}
```

### 7.6 RolePermission

```prisma
model RolePermission {
  id           Int      @id @default(autoincrement())
  roleId       Int      @map("role_id")
  permissionId Int      @map("permission_id")
  createdAt    DateTime @default(now()) @map("created_at")

  role       Role       @relation(fields: [roleId], references: [id])
  permission Permission @relation(fields: [permissionId], references: [id])

  @@unique([roleId, permissionId])
  @@index([roleId])
  @@index([permissionId])
  @@map("role_permissions")
}
```

### 7.7 LoginLog

```prisma
model LoginLog {
  id         Int      @id @default(autoincrement())
  userId     Int?     @map("user_id")
  email      String   @db.VarChar(255)
  ip         String   @db.VarChar(50)
  userAgent  String?  @map("user_agent") @db.VarChar(500)
  status     String   @db.VarChar(20) // success | failed | locked
  failReason String?  @map("fail_reason") @db.VarChar(255)
  createdAt  DateTime @default(now()) @map("created_at")

  user User? @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([email])
  @@index([createdAt])
  @@map("login_logs")
}
```

### 7.8 AuditLog

```prisma
model AuditLog {
  id         Int      @id @default(autoincrement())
  actorId    Int?     @map("actor_id")
  action     String   @db.VarChar(100)
  targetType String   @map("target_type") @db.VarChar(100)
  targetId   Int?     @map("target_id")
  ip         String?  @db.VarChar(50)
  userAgent  String?  @map("user_agent") @db.VarChar(500)
  metadata   Json?
  createdAt  DateTime @default(now()) @map("created_at")

  actor User? @relation(fields: [actorId], references: [id])

  @@index([actorId])
  @@index([action])
  @@index([targetType, targetId])
  @@index([createdAt])
  @@map("audit_logs")
}
```

---

## 8. Seed 初始化

### 8.1 系统角色

必须初始化：

| code | 名称 | 说明 | isSystem |
|---|---|---|---|
| `admin` | 超级管理员 | 全局最高权限 | true |
| `operator` | 平台运营 | 运营后台日常操作 | true |
| `finance` | 财务人员 | 财务、账本、对账 | true |
| `support` | 客服人员 | 用户支持、工单、订单协助 | true |
| `merchant_owner` | 店铺负责人 | 店铺最高管理权限 | true |
| `merchant_staff` | 店铺员工 | 店铺日常操作 | true |
| `technician` | 技师 | 服务者端权限 | true |
| `customer` | 普通用户 | C 端基础权限 | true |
| `broker` | 经纪人 | 管理技师组 / 代运营 | true |
| `scout` | 介绍人 | 拉新 / 分销 | true |
| `viewer` | 只读观察员 | 后台只读 | true |

可兼容保留 `editor`，但不作为 NeeDo 核心角色。

### 8.2 最低权限码

#### User Management

```text
user:list
user:create
user:update
user:delete
user:assign-role
user:status:update
user:identity:list
user:identity:switch
menu:user-management
page:user-management
button:user:create
button:user:update
button:user:disable
button:user:delete
button:user:assign-role
```

#### Role Management

```text
role:list
role:create
role:update
role:delete
role:assign-permission
menu:role-management
page:role-management
button:role:create
button:role:update
button:role:delete
button:role:assign-permission
```

#### Permission Management

```text
permission:list
permission:create
permission:update
permission:delete
menu:permission-management
page:permission-management
button:permission:create
button:permission:update
button:permission:delete
```

#### 平台后台基础

```text
menu:dashboard
page:dashboard
menu:admin-settings
page:admin-settings
```

---

## 9. Auth API 规格

### 9.1 POST /api/v1/auth/login

请求：

```json
{
  "loginIdentifier": "admin@example.com",
  "password": "Abcd@1234"
}
```

响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "accessToken": "jwt",
    "refreshToken": "jwt",
    "expiresIn": 900
  }
}
```

要求：

- `loginIdentifier` 接受规范化 verified email 或 immutable NeeDoID；不得把
  可编辑昵称当成账号 ID。
- 邮箱/NeeDoID 不存在和密码错误返回相同错误，防止枚举。
- 已完成注册验证的账号后续密码登录不重复发送 OTP。
- 登录成功写 `LoginLog`。
- 登录失败写 `LoginLog`。
- 连续失败触发 Redis 锁定。

### 9.2 POST /api/v1/auth/register 与 /auth/register/verify

开始请求：

```json
{
  "email": "user@example.com",
  "password": "Abcd@1234"
}
```

开始响应只有 `{ challengeId, maskedEmail, expiresIn, cooldownSeconds }`。
`POST /api/v1/auth/register` 不创建 User；密码仅以 bcrypt cost 12 hash 放在
受保护的短期 challenge metadata 中。邮件投递失败必须取消 challenge 并返回
稳定错误，禁止静默成功、响应 OTP、写日志或新增取码接口。

验证请求：

```json
{
  "challengeId": "00000000-0000-4000-8000-000000000000",
  "otp": "123456"
}
```

验证成功才在一个数据库事务中创建 verified baseline customer、不可变
NeeDoID、默认 identity/role、profile、audit，然后返回 NeeDo
access/refresh token。新用户 nickname/display name 初始等于 NeeDoID，之后只
允许修改 display name。

### 9.3 Google 注册/登录

1. `POST /api/v1/auth/google/init` 以 `{}` 取得
   `{ clientId, nonce, nonceChallengeId, expiresIn }`。
2. 浏览器把 nonce 交给 Google Identity Services，再把
   `{ credential, nonceChallengeId }` POST 到 `/api/v1/auth/google`。
3. 已绑定 subject 返回 `status=authenticated` 和 NeeDo token；首次 subject
   返回 `status=verification_required` 和邮箱 challenge。
4. 首次流程使用 `{ challengeId, otp }` 调用
   `/api/v1/auth/google/verify`。同 verified email 的既有账号被绑定；不同邮箱
   创建独立 Google-only baseline customer。只有新建账号时响应包含 NeeDoID。

要求：

- OTP 6 位数字。
- Google credential 必须校验 signature、issuer、audience、nonce、expiry、
  email 和 `email_verified`；nonce 单次使用并原子消费。
- 首次 Google 使用/注册和登录后绑定都验证邮箱；相同绑定后续登录不重复
  OTP。
- 不存 Google access token、refresh token 或 client secret，只存 provider
  subject、规范化邮箱和验证/使用时间。
- subject 已属于其他用户时返回 stable conflict，不静默合并。
- Google 登录只申请 identity claims；Google Calendar 权限、consent 和 token
  存储是完全独立的功能。

### 9.4 POST /api/v1/auth/refresh

请求：

```json
{
  "refreshToken": "jwt"
}
```

要求：

- 校验 Refresh Token 签名。
- 校验 Redis 中 `auth:v2:refresh:{userId}:{jti}` 是否存在。
- 返回新的 Access Token。
- 可选实现 Refresh Token rotation，但必须保证旧 token 可吊销。

### 9.5 POST /api/v1/auth/logout

请求：

```json
{
  "refreshToken": "jwt"
}
```

要求：

- 当前 Access Token 的 jti 写入 Redis 黑名单。
- 删除 Refresh Token Redis key。
- 记录审计日志。

### 9.6 GET /api/v1/auth/me

响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": 1,
    "email": "admin@example.com",
    "username": "Admin",
    "isActive": true,
    "currentIdentity": {
      "id": 1,
      "type": "platform",
      "scopeType": "global",
      "scopeId": null
    },
    "identities": [
      { "id": 1, "type": "platform", "scopeType": "global", "scopeId": null }
    ],
    "roles": ["admin"],
    "permissions": ["user:list", "role:list", "permission:list"],
    "menus": ["menu:dashboard", "menu:user-management"]
  }
}
```

### 9.7 登录后 Google 与密码安全管理

正式 API：

- `GET /api/v1/auth/google/link`：读取 `{ linked, maskedEmail, hasPassword, canUnlink }`。
- `POST /api/v1/auth/google/link/init`：创建绑定到当前 user 的 Google nonce。
- `POST /api/v1/auth/google/link`：验证 Google credential 后，向 NeeDo email
  创建 OTP challenge。
- `POST /api/v1/auth/google/link/verify`：OTP 正确后原子创建绑定。
- `POST /api/v1/auth/password/setup` 和 `/password/setup/verify`：允许
  Google-only 用户经 NeeDo email OTP 设置第一个密码。
- `POST /api/v1/auth/google/unlink` 和 `/google/unlink/verify`：只有已有密码时
  才允许经 OTP 解绑。

所有接口从 Bearer token 解析当前用户，body 不接受 userId。Google unlink
成功后必须软删除 binding、推进数据库/Redis session generation、撤销该用户
全部 refresh token、把当前 access token 加黑名单并返回 `{ signedOut: true }`。
客户端立即清空本地登录态。短期 completion receipt 只用于在 token 已失效后
安全重试同一个 unlink 完成响应，不能恢复 session 或执行第二次解绑。

---

## 10. User Management API 规格

### 10.1 GET /api/v1/users

查询参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `page` | number | 默认 1 |
| `page_size` | number | 默认 20，最大 100 |
| `keyword` | string | 搜索邮箱、用户名、手机号 |
| `isActive` | boolean | 状态筛选 |
| `roleId` | number | 角色筛选 |
| `identityType` | string | 身份类型筛选 |

要求：

- 必须分页。
- 不得返回 `passwordHash`。
- 必须过滤软删除。

### 10.2 POST /api/v1/users

请求：

```json
{
  "email": "user@example.com",
  "phone": "+819012345678",
  "username": "Taro",
  "password": "Abcd@1234",
  "roleIds": [2],
  "identities": [
    { "type": "customer", "scopeType": "global", "scopeId": null }
  ]
}
```

### 10.3 PUT /api/v1/users/:id

可修改：

- username
- phone
- avatarUrl

不可通过此接口修改：

- email
- passwordHash
- roles
- permissions

### 10.4 PATCH /api/v1/users/:id/status

请求：

```json
{
  "isActive": false
}
```

要求：

- 不能禁用自己。
- 不能禁用最后一个 admin。

### 10.5 DELETE /api/v1/users/:id

要求：

- 软删除。
- 不能删除自己。
- 不能删除最后一个 admin。
- 删除前解除 UserRole 或标记失效。

### 10.6 GET /api/v1/users/:id/roles

返回用户已分配角色。

### 10.7 PUT /api/v1/users/:id/roles

请求：

```json
{
  "roleIds": [1, 2],
  "scopeType": "global",
  "scopeId": null
}
```

要求：

- 全量替换。
- 必须事务。
- 不允许移除自己的最后一个 admin 权限。

### 10.8 GET /api/v1/users/:id/identities

返回用户身份列表。

### 10.9 PUT /api/v1/users/:id/identities

全量替换或按业务规则更新身份。

### 10.10 POST /api/v1/auth/identity/switch

请求：

```json
{
  "identityId": 2
}
```

要求：

- identity 必须属于当前用户。
- identity 必须 active。
- 切换后 `/auth/me` 返回该身份对应权限。

---

## 11. Role API 规格

- `GET /api/v1/roles`
- `GET /api/v1/roles/:id`
- `POST /api/v1/roles`
- `PUT /api/v1/roles/:id`
- `PUT /api/v1/roles/:id/permissions`
- `DELETE /api/v1/roles/:id`

要求：

- 列表分页。
- 创建 / 更新有 Zod。
- 分配权限必须事务。
- `isSystem=true` 角色禁止删除。
- code 不允许修改。

---

## 12. Permission API 规格

- `GET /api/v1/permissions`
- `GET /api/v1/permissions/tree`
- `POST /api/v1/permissions`
- `PUT /api/v1/permissions/:id`
- `DELETE /api/v1/permissions/:id`

要求：

- 列表分页。
- 支持 keyword、type、module 筛选。
- code 全局唯一。
- type 只能是 `api | menu | page | button`。
- code 不允许修改。
- `isSystem=true` 权限禁止删除或只允许修改 name / description。

---

## 13. Redis Key 规范

| 用途 | Key | TTL |
|---|---|---|
| Formal email challenge | `auth:verification:email:{challengeId}` | 固定 600s |
| Formal OTP 冷却 | `auth:verification:cooldown:{HMAC}` | 固定 60s |
| Google nonce | `auth:verification:google-nonce:{nonceChallengeId}` | `AUTH_GOOGLE_NONCE_TTL_SECONDS`，最大 600s |
| 登录失败计数 | `login:fail:{ip}:{email}` | 300s |
| 账号锁定 | `login:lock:{email}` | 300s |
| Access Token 黑名单 | `token:blacklist:{jti}` | Access Token 剩余 TTL |
| Refresh Token | `auth:v2:refresh:{userId}:{jti}` | 最大 7d |
| Refresh Token 用户索引 | `auth:v2:refresh:user:{userId}` | 当前最长 refresh TTL |
| Session generation | `auth:v2:session:generation:{userId}` | 不过期；账号安全变更时推进 |
| Unlink completion receipt | `auth:verification:unlink-complete:{challengeId}` | 600s |
| 用户权限缓存 | `rbac:user:{userId}:identity:{identityId}` | 300s |
| 用户 me 缓存 | `auth:me:{userId}:identity:{identityId}` | 120s |

权限、角色、用户身份变化时，必须清理相关 RBAC 和 `/auth/me` 缓存。
数据库 `users.session_generation` 是账号级会话代数的唯一事实来源。多 API 可以为
audience 隔离 refresh token 和 Redis logical DB，但每次 access/refresh 校验必须读取
数据库代数；新登录只能把当前 API 的 Redis 代数单向推进到数据库值，并在同一个
Redis 原子操作中撤销该分区的旧代数 refresh token。Redis 代数高于数据库值时必须
拒绝，禁止回退。账号安全事务先提交数据库代数后，即使其他 API 的 Redis 分区尚未
清理，旧 token 也会因数据库代数不匹配立即失效，随后由各分区的新登录安全收敛。
正式注册/Google/account-security 流不得使用历史 `otp:{email}` 通用 key；它们
必须携带 purpose、user binding 和 attempt counter。OTP 只存 HMAC digest，
cooldown email identity 使用 HMAC，Google nonce 使用 AES-256-GCM；allowlisted
challenge metadata 是 Redis JSON，不是密文，必须由 Redis 私网、ACL、传输与备份
控制保护。
`AUTH_VERIFICATION_MAX_ATTEMPTS` 最大为 5，最后一次错误会销毁 challenge；成功
验证立即消费。Google nonce 只能原子消费一次。Unlink 通过单个 Redis 原子操作
完成 challenge finalize、all-refresh revoke、session generation 同步、access
blacklist 和 completion receipt。

---

## 14. Zod 校验要求

必须至少实现：

```text
backend/src/validators/auth.validator.ts
backend/src/validators/user.validator.ts
backend/src/validators/role.validator.ts
backend/src/validators/permission.validator.ts
backend/src/validators/identity.validator.ts
```

密码强度：

```typescript
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,128}$/;
```

---

## 15. 错误码最低要求

```typescript
export const ErrorCodes = {
  INVALID_CREDENTIALS: 40101,
  INVALID_OTP: 40102,
  OTP_EXPIRED: 40103,
  TOKEN_EXPIRED: 40104,
  TOKEN_INVALID: 40105,
  TOKEN_BLACKLISTED: 40106,

  FORBIDDEN: 40301,
  ACCOUNT_DISABLED: 40302,
  CANNOT_DELETE_SYSTEM: 40303,
  CANNOT_MODIFY_SELF: 40304,
  IDENTITY_FORBIDDEN: 40305,

  USER_NOT_FOUND: 40401,
  ROLE_NOT_FOUND: 40402,
  PERMISSION_NOT_FOUND: 40403,
  IDENTITY_NOT_FOUND: 40404,

  EMAIL_ALREADY_EXISTS: 40901,
  ROLE_CODE_EXISTS: 40902,
  PERMISSION_CODE_EXISTS: 40903,
  PHONE_ALREADY_EXISTS: 40904,

  ACCOUNT_LOCKED: 42901,
  OTP_COOLDOWN: 42902,
  RATE_LIMIT_EXCEEDED: 42903,
} as const;
```

---

## 16. 前端接入要求

### 16.1 技术栈判断

Codex 必须先检查当前仓库技术栈。不要盲目使用 Vue 文件路径。

若当前仓库是 React / TSX / Vite，建议目录：

```text
src/
├── api/
│   ├── httpClient.ts
│   ├── auth.api.ts
│   └── user-management.api.ts
├── auth/
│   ├── authStore.ts
│   ├── permissionGuard.tsx
│   ├── permissions.ts
│   └── usePermission.ts
├── pages/
│   ├── auth/
│   └── admin/
│       ├── UserManagementPage.tsx
│       ├── RoleManagementPage.tsx
│       └── PermissionManagementPage.tsx
└── i18n 或 locales/
```

若当前仓库确实是 Vue，则可以使用：

```text
src/
├── api/
├── views/
├── stores/
├── router/
├── permission/
└── locales/
```

### 16.2 Token 管理

- Access Token 存储于内存状态，不长期存 localStorage。
- Refresh Token 可以存 localStorage，但必须在 logout 时清理。
- HTTP 请求自动注入 Authorization。
- 401 时自动 refresh；refresh 失败则清理状态并跳登录页。
- 登录成功后调用 `/auth/me` 获取权限和身份。

### 16.3 路由与权限

- 未登录访问受保护页面，跳登录页。
- 无权限访问页面，跳 403 页面或显示无权限状态。
- 菜单由 `menu:*` 权限控制。
- 页面由 `page:*` 权限控制。
- 按钮由 `button:*` 权限控制。
- API 操作仍以服务端 RBAC 为准，前端隐藏按钮不能代替后端校验。

### 16.4 三端身份切换

前端应支持根据 `currentIdentity.type` 进入不同端：

| identity type | 默认入口 |
|---|---|
| `customer` | `/` 或 `/me` |
| `technician` | `/technician` |
| `merchant` / `merchant_owner` / `merchant_staff` | `/merchant` 或 `/merchant-admin` |
| `platform` | `/admin` |
| `broker` / `scout` | 后续可进入 broker hub，本阶段可显示无入口或只读入口 |

---

## 17. i18n key 最低要求

必须至少包含中文、日文、英文三语。示例 key：

```typescript
{
  auth: {
    login: 'Login',
    logout: 'Logout',
    email: 'Email',
    password: 'Password',
    otpCode: 'OTP code',
    sendOtp: 'Send OTP',
    resendIn: 'Resend in {seconds}s',
    loginSuccess: 'Login successful',
    loginFailed: 'Invalid email or password',
    accountLocked: 'Account locked. Try again in {minutes} minutes',
  },
  userManagement: {
    title: 'User Management',
    userList: 'Users',
    createUser: 'Create user',
    editUser: 'Edit user',
    assignRoles: 'Assign roles',
    identities: 'Identities',
    active: 'Active',
    inactive: 'Inactive',
  },
  roleManagement: {
    title: 'Role Management',
    assignPermissions: 'Assign permissions',
  },
  permissionManagement: {
    title: 'Permission Management',
    permissionTree: 'Permission tree',
  }
}
```

---

## 18. 高并发设计要求

User Management 第一阶段不要求直接支撑 10 万同时在线，但必须避免将来返工：

1. JWT 本地验签，避免每次请求查数据库。
2. `/auth/me` 和用户权限使用 Redis 短 TTL 缓存。
3. 权限变更后清理缓存。
4. 登录、OTP、refresh、用户列表接口加限流。
5. 列表接口必须分页，最大 `page_size=100`。
6. 常用查询字段加索引：email、phone、roleId、permission code、identity type、scope。
7. 审计日志可先同步写入，但接口设计要允许后续改为队列。
8. Access Token 保持短有效期，Refresh Token 支持吊销。
9. Redis key 统一 TTL，防止无限增长。

---

## 19. 测试要求

### 19.1 后端

必须实现：

```text
backend/tests/auth.test.ts
backend/tests/user.service.test.ts
backend/tests/role.service.test.ts
backend/tests/permission.service.test.ts
backend/tests/rbac.middleware.test.ts
```

覆盖：

- 正常邮箱与 NeeDoID 密码登录。
- 密码错误返回统一错误。
- 连续失败 5 次后锁定。
- 邮箱注册在 OTP 验证前无 User，验证后创建完整 baseline customer。
- OTP 使用后失效。
- Google 首次 OTP 绑定、重复直接登录和独立 Google-only 注册。
- Google-only 密码设置和 Google unlink 全 session 撤销。
- Token refresh。
- Logout 后 token 黑名单生效。
- `/auth/me` 返回权限列表。
- 创建用户。
- 禁用用户。
- 不允许禁用自己。
- 不允许删除自己。
- 创建角色并分配权限。
- 全量替换角色权限。
- 删除系统角色返回错误。
- 权限树返回正确分组。

### 19.2 前端

必须覆盖：

- 登录表单渲染。
- 空表单校验。
- 登录成功后保存 auth state。
- 401 后 refresh 流程。
- 权限 helper 正确判断。
- 无权限按钮不展示。

---

## 20. 验收标准

全部满足后，User Management 才算完成：

### 功能验收

- [ ] 邮箱或 NeeDoID + 密码登录端到端可用。
- [ ] Email registration 在 OTP 验证前不创建 User，验证后返回 immutable NeeDoID。
- [ ] Google first-use OTP、repeat direct login、Google-only registration 端到端可用。
- [ ] Google-only password setup 与 Google unlink 的全 session 撤销可用。
- [ ] Token refresh 可用。
- [ ] Logout 后旧 token 无法使用。
- [ ] `/auth/me` 返回当前用户、身份、角色、权限、菜单。
- [ ] 权限 CRUD 可用。
- [ ] 角色 CRUD 可用。
- [ ] 角色权限分配可用。
- [ ] 用户 CRUD 可用。
- [ ] 用户角色分配可用。
- [ ] 用户身份切换可用。
- [ ] 前端动态菜单根据权限正确显示。
- [ ] 前端按钮权限正确控制显示。

### 代码质量验收

- [ ] Prisma migration 已生成并提交。
- [ ] Seed 可运行。
- [ ] Swagger / OpenAPI 完整。
- [ ] Zod schema 完整。
- [ ] Jest / Supertest 通过。
- [ ] 前端关键测试通过。
- [ ] lint 通过。
- [ ] build 通过。
- [ ] README / docs 已更新。

### 安全验收

- [ ] bcrypt 加密生效。
- [ ] 密码强度校验生效。
- [ ] 登录限流生效。
- [ ] OTP 冷却生效。
- [ ] Token 黑名单生效。
- [ ] API 响应无 `passwordHash`。
- [ ] 日志无 token / OTP 原文。
- [ ] CORS 不使用 `*`。

---

## 21. Codex 最终执行原则

每次只做一个 PR 范围。完成 PR-U01 前，不得做 PR-U02；完成后端 Auth 前，不得接前端整套权限；完成 User Management 前，不得进入 Booking、NDP、IM、Social、支付或压测。

宁可每个 PR 小一点、可运行、可测试，也不要一次性生成大而不稳的代码。
