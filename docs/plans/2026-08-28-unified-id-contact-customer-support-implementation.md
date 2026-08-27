# NeeDo 统一 ID、身份隔离、通讯录与 Customer Support 实施计划

> **执行要求：** 后续必须使用 `executing-plans` 按任务逐项执行，并在每个任务内遵守 `test-driven-development`。一次只执行一个微步骤；每步完成测试、真实数据检查和提交后再进入下一步。

**目标：** 把现有 `n...`、前端 `systemId`、User 级 IM/Social 关系和演示服务号迁移为已批准的统一公开号、身份级数据隔离、真实好友流程、店铺服务号、多人客服和广告群发系统。

**总体架构：** 保留现有 `User` 作为账号级登录/eKYC 主体，扩展 `UserIdentity` 为身份级业务主体；用 `PublicIdentifier` 统一登录、检索和展示。IM、Social、资料与业务资源逐批从 `userId` 迁移到 `identityId`。Shop/Merchant 使用独立实体号码，Customer Support 通过独立模型连接 Shop、担当 `b` 身份、Support Conversation 和 Broadcast Campaign。

**技术栈：** Node.js 22、Express、TypeScript strict、Prisma/MySQL、Redis、JWT、Zod、Jest/Supertest、React/TypeScript/Vite/Vitest。

## 执行纪律

- 本计划是一个程序级计划，不是一次性 PR。每个“任务”是独立提交和验收点。
- 不允许跨任务提前接 UI，也不允许为等待后端而新增 mock。
- 每个 schema 任务使用新的 migration；不得修改已应用 migration。
- 迁移脚本必须先支持 `--dry-run`，只有对账通过才允许 `--apply`。
- 每次提交前运行该任务列出的定向测试；阶段结束再运行完整 backend/frontend 验证。
- 正式切换前可以存在“新增但未启用”的字段，运行时任何时刻只能有一套登录、搜索和展示规则。
- 当前工作分支只保存设计与计划；开始实现前从最新 `main` 创建新的隔离 worktree，并先处理与并行分支的合并状态。

---

## 任务 1：建立只读现状审计和切换护栏

**文件：**

- 新建：`backend/scripts/audit-unified-identity-cutover.ts`
- 新建：`backend/tests/unified-identity-cutover-audit.test.ts`
- 修改：`backend/package.json`
- 新建：`docs/verification/unified-identity-cutover-audit.md`

**步骤 1：先写失败测试**

测试审计器必须发现并分类：

```ts
expect(report.legacyIdentifierCounts).toMatchObject({
  userNeedoId: expect.any(Number),
  frontendSystemIdReferences: expect.any(Number),
  persistedMessageIdentifierSnapshots: expect.any(Number)
});
expect(report.unresolvedOwnership).toEqual(expect.any(Array));
expect(report.mutatedRows).toBe(0);
```

覆盖 User、UserIdentity、CustomerProfile、TechnicianProfile、Shop、MerchantAccount、Contact、FriendRequest、ConversationParticipant、Message、SocialPost、Follow、Notification、BookingOrder 和 Ledger 的所有旧关联。

**步骤 2：运行测试并确认失败**

```bash
cd backend
npm test -- tests/unified-identity-cutover-audit.test.ts
```

预期：测试因审计器不存在而失败。

**步骤 3：实现最小只读审计器**

- 只允许 Prisma `findMany/count/groupBy`，禁止任何 mutation。
- 输出 JSON 和 Markdown 摘要。
- 把无法判断应归属 `U/NEEDO/S/B/O` 的记录列为 `unresolvedOwnership`。
- 增加 `npm run audit:unified-identity`。

**步骤 4：验证**

```bash
cd backend
npm test -- tests/unified-identity-cutover-audit.test.ts
npm run audit:unified-identity -- --dry-run
```

确认真实数据库报告存在，且写入计数为0。

**步骤 5：提交**

```bash
git add backend/scripts/audit-unified-identity-cutover.ts backend/tests/unified-identity-cutover-audit.test.ts backend/package.json docs/verification/unified-identity-cutover-audit.md
git commit -m "test: add unified identity cutover audit"
```

---

## 任务 2：新增统一号码与公开号数据地基

**文件：**

- 修改：`backend/prisma/schema.prisma`
- 新建：`backend/prisma/migrations/20260828090000_unified_public_identifier_foundation/migration.sql`
- 新建：`backend/tests/unified-public-identifier-schema.test.ts`
- 修改：`backend/tests/openapi.test.ts`

**步骤 1：写 schema 失败测试**

验证以下约束存在：

- `User.accountNo` 为 nullable 的 `Char(10)` 过渡字段；
- `User.primaryIdentityType` 只允许 `U/NEEDO`；
- `Shop.shopNo` 与 `MerchantAccount.ownerNo` 为 nullable 的10位过渡字段；
- 新增最小 `CustomerSupportAccount`，允许后续回填 Shop 一对一服务号；
- `PublicIdentifier.publicId` 唯一；
- `PublicIdentifier` 可指向 UserIdentity、Shop、MerchantAccount 或 CustomerSupportAccount；
- `VanityNumberRule` 和 `VanityNumberReservation` 有软删除和索引；
- 已分配号码状态可以 tombstone，不能复用。

**步骤 2：运行失败测试**

```bash
cd backend
npm test -- tests/unified-public-identifier-schema.test.ts
```

**步骤 3：添加 additive migration**

- 只新增表、enum、nullable 字段和索引。
- 暂不删除 `User.needoId`。
- 暂不切换任何运行时读写。
- MySQL 保存数字部分为字符串，保留前导零。

**步骤 4：生成 Prisma Client 并验证**

```bash
cd backend
npm run prisma:generate
npm test -- tests/unified-public-identifier-schema.test.ts
npm run build
```

**步骤 5：提交**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260828090000_unified_public_identifier_foundation backend/tests/unified-public-identifier-schema.test.ts backend/tests/openapi.test.ts
git commit -m "feat: add unified public identifier schema"
```

---

## 任务 3：实现号码分配、靓号封印和统一解析服务

**文件：**

- 新建：`backend/src/services/public-identifier.service.ts`
- 新建：`backend/src/repositories/public-identifier.repository.ts`
- 新建：`backend/src/validators/public-identifier.validator.ts`
- 新建：`backend/tests/public-identifier.service.test.ts`
- 新建：`backend/tests/public-identifier.repository.test.ts`
- 修改：`backend/src/constants/error-codes.ts`
- 暂不删除：`backend/src/services/needo-id.service.ts`

**步骤 1：写分配器失败测试**

必须覆盖：

```ts
expect(formatPersonId("U", "0000000123")).toBe("u0000000123");
expect(formatPersonId("NEEDO", "0000000123")).toBe("needo0000000123");
expect(formatPersonId("S", "0000000123")).toBe("s0000000123");
expect(isReservedVanityNumber("6666661234")).toBe(true);
expect(isReservedVanityNumber("1234567890")).toBe(true);
expect(isReservedVanityNumber("0077007700")).toBe(true);
```

再测试唯一冲突重试8次、非唯一异常不重试、耗尽时抛稳定领域错误。

**步骤 2：运行失败测试**

```bash
cd backend
npm test -- tests/public-identifier.service.test.ts tests/public-identifier.repository.test.ts
```

**步骤 3：实现服务**

- `IdentifierAllocator` 只生成10位数字字符串。
- 候选先经过规则和手动封印表，再原子插入注册表。
- 分配器提供 Shop/CS 同数字的成对候选和原子注册能力；实体审批接入在任务10完成。
- `cs0000000000` 使用显式 seed，不进入随机分配。
- 重试耗尽映射到 i18n key `error.identifier.allocation_busy`，中文显示“当前网络繁忙，请稍后再试”。
- 解析器只接受批准格式，不接受 `n...`。

**步骤 4：验证**

```bash
cd backend
npm test -- tests/public-identifier.service.test.ts tests/public-identifier.repository.test.ts
npm run lint -- --no-cache
```

**步骤 5：提交**

```bash
git add backend/src/services/public-identifier.service.ts backend/src/repositories/public-identifier.repository.ts backend/src/validators/public-identifier.validator.ts backend/src/constants/error-codes.ts backend/tests/public-identifier.service.test.ts backend/tests/public-identifier.repository.test.ts
git commit -m "feat: add formal public identifier allocation"
```

---

## 任务 4：建立可复跑的真实数据回填脚本

**文件：**

- 新建：`backend/scripts/backfill-unified-identifiers.ts`
- 新建：`backend/scripts/check-unified-identifier-cutover.ts`
- 新建：`backend/tests/unified-identifier-backfill.test.ts`
- 修改：`backend/package.json`

**步骤 1：写失败测试**

使用测试数据库 fixture 验证：

- 所有旧 `n...` User 获得全新随机 `accountNo`；
- 不能把 `n0000000237` 直接变为 `u0000000237`；
- 平台公司账号生成 NEEDO 主身份，普通账号生成 U；
- 已审核技师生成同数字 S；
- 真实店铺员工/商户关系生成 B/O；
- Shop、MerchantAccount、CS 获得独立号码；
- 第二次执行不重复生成或修改已完成记录；
- `--dry-run` 不写数据库；
- 无法判断身份归属时失败并输出异常报告。

**步骤 2：运行失败测试**

```bash
cd backend
npm test -- tests/unified-identifier-backfill.test.ts
```

**步骤 3：实现脚本**

- 分页批处理，批次大小通过参数配置。
- 每批使用短事务。
- 生成真实前后数量对账。
- `--apply` 必须要求显式确认参数和目标环境保护。
- 不删除旧字段。

**步骤 4：在真实开发数据库演练**

```bash
cd backend
npm run backfill:unified-identifiers -- --dry-run
npm run check:unified-identifier-cutover
```

先保存 dry-run 报告，不执行正式 apply。

**步骤 5：提交**

```bash
git add backend/scripts/backfill-unified-identifiers.ts backend/scripts/check-unified-identifier-cutover.ts backend/tests/unified-identifier-backfill.test.ts backend/package.json
git commit -m "feat: add unified identifier backfill tooling"
```

---

## 任务 5：切换 Auth、Google 和 Session 到统一身份

**文件：**

- 修改：`backend/src/repositories/auth.repository.ts`
- 修改：`backend/src/services/auth.service.ts`
- 修改：`backend/src/validators/auth.validator.ts`
- 修改：`backend/src/middlewares/authenticate.middleware.ts`
- 修改：`backend/src/services/auth-token.service.ts`
- 修改：`backend/src/repositories/user.repository.ts`
- 修改：`backend/src/repositories/backoffice.repository.ts`
- 修改：`backend/tests/auth.test.ts`
- 修改：`backend/tests/google-auth.service.test.ts`
- 修改：`backend/tests/auth-registration-recovery.integration.test.ts`
- 修改：`backend/tests/auth-repository-google.integration.test.ts`
- 修改：`src/api/auth.ts`
- 修改：`src/auth/AuthProvider.tsx`
- 修改：`src/auth/AuthProvider.test.ts`
- 修改：`src/pages/auth/LoginPage.tsx`
- 修改：`src/pages/auth/LoginPage.test.ts`

**步骤 1：写登录矩阵失败测试**

覆盖：

```text
纯 accountNo / 手机 / 邮箱 / Google → 真实主身份 U 或 NEEDO
u... / needo... / s... / b... / o... + 密码 → 指定有效身份
shop... / owner... / cs... → 拒绝登录
撤销身份 → 拒绝，不回退
首次 Google 注册 → 新 U，不创建 NEEDO
```

Token 和 `/auth/me` 必须返回 `activeIdentityId`、`activePublicId`、可切换身份列表及共享 eKYC，不能只返回旧 `needoId`。

**步骤 2：运行失败测试**

```bash
cd backend
npm test -- tests/auth.test.ts tests/google-auth.service.test.ts tests/auth-registration-recovery.integration.test.ts
cd ..
npm test -- src/auth/AuthProvider.test.ts src/pages/auth/LoginPage.test.ts
```

**步骤 3：实现单一 LoginResolver**

- Repository 不再直接 `OR email/needoId`。
- 纯数字先解析 accountNo；带前缀只查 PublicIdentifier。
- 手机、邮箱和 Google 解析到 User 后选择真实主身份。
- JWT/session context 绑定身份 ID；Shop scope 继续单独验证。
- 新注册和 Google 首次注册使用 IdentifierAllocator。
- 在最终删除 migration 前，如旧 `User.needoId` 仍为非空约束，只允许写入新的主身份公开号作为过渡占位；任何正式读路径都不得再读取该字段。
- 前端不推测前缀，只消费 `/auth/me`。

**步骤 4：真实登录检查**

```bash
cd backend
npm test -- tests/auth.test.ts tests/google-auth.service.test.ts tests/auth-registration-recovery.integration.test.ts tests/auth-repository-google.integration.test.ts
npm run check:registration-flow
npm run check:google-auth-flow
cd ..
npm test -- src/auth/AuthProvider.test.ts src/pages/auth/LoginPage.test.ts
```

**步骤 5：提交**

```bash
git add backend/src/repositories/auth.repository.ts backend/src/services/auth.service.ts backend/src/validators/auth.validator.ts backend/src/middlewares/authenticate.middleware.ts backend/src/services/auth-token.service.ts backend/src/repositories/user.repository.ts backend/src/repositories/backoffice.repository.ts backend/tests/auth.test.ts backend/tests/google-auth.service.test.ts backend/tests/auth-registration-recovery.integration.test.ts backend/tests/auth-repository-google.integration.test.ts src/api/auth.ts src/auth/AuthProvider.tsx src/auth/AuthProvider.test.ts src/pages/auth/LoginPage.tsx src/pages/auth/LoginPage.test.ts
git commit -m "feat: cut auth over to unified identities"
```

---

## 任务 6：建立身份级资料、会员与业务归属

**文件：**

- 修改：`backend/prisma/schema.prisma`
- 新建：`backend/prisma/migrations/20260828100000_identity_scoped_profiles/migration.sql`
- 修改：`backend/src/repositories/customer-profile.repository.ts`
- 修改：`backend/src/services/customer-profile.service.ts`
- 修改：`backend/src/repositories/identity-activation.repository.ts`
- 修改：`backend/src/services/identity-activation.service.ts`
- 修改：`backend/src/repositories/core-read.repository.ts`
- 修改：`backend/tests/customer-profile.repository.test.ts`
- 修改：`backend/tests/customer-profile.service.test.ts`
- 修改：`backend/tests/identity-activation.service.test.ts`
- 新建：`backend/tests/identity-data-isolation.integration.test.ts`

**步骤 1：写身份隔离失败测试**

同一 User 创建 U、S、B、O，验证：

- nickname、avatar、bio、基础资料互不覆盖；
- eKYC、手机号、邮箱共享；
- membership 只允许主身份；
- 查询必须携带 activeIdentityId；
- 撤销 S 不影响 U/B/O。

**步骤 2：运行失败测试**

```bash
cd backend
npm test -- tests/identity-data-isolation.integration.test.ts tests/customer-profile.service.test.ts tests/identity-activation.service.test.ts
```

**步骤 3：实现最小身份资料迁移**

- `UserIdentity` 或独立 `IdentityProfile` 保存 nickname/avatar/bio/base profile。
- CustomerProfile/TechnicianProfile 改为关联对应 identityId。
- 账号级 eKYC 不复制到身份表。
- 会员字段只挂主身份并增加数据库/服务约束。
- 此任务只迁资料，不同时迁 IM、订单和钱包。

**步骤 4：验证并提交**

```bash
cd backend
npm run prisma:generate
npm test -- tests/identity-data-isolation.integration.test.ts tests/customer-profile.repository.test.ts tests/customer-profile.service.test.ts tests/identity-activation.service.test.ts
git add backend/prisma/schema.prisma backend/prisma/migrations/20260828100000_identity_scoped_profiles backend/src/repositories/customer-profile.repository.ts backend/src/services/customer-profile.service.ts backend/src/repositories/identity-activation.repository.ts backend/src/services/identity-activation.service.ts backend/src/repositories/core-read.repository.ts backend/tests/customer-profile.repository.test.ts backend/tests/customer-profile.service.test.ts backend/tests/identity-activation.service.test.ts backend/tests/identity-data-isolation.integration.test.ts
git commit -m "feat: isolate public profile data by identity"
```

---

## 任务 7A：建立正式的身份级地址与收藏 API

**文件：**

- 修改：`backend/prisma/schema.prisma`
- 新建：`backend/prisma/migrations/20260828110000_identity_addresses_favorites/migration.sql`
- 新建：`backend/src/repositories/identity-resource.repository.ts`
- 新建：`backend/src/services/identity-resource.service.ts`
- 新建：`backend/src/controllers/identity-resource.controller.ts`
- 新建：`backend/src/validators/identity-resource.validator.ts`
- 新建：`backend/src/routes/identity-resource.routes.ts`
- 修改：`backend/src/app.ts`
- 修改：`backend/src/constants/permissions.constants.ts`
- 修改：`backend/src/api/openapi.ts`
- 新建：`backend/tests/identity-address-favorite-api.test.ts`
- 修改：`backend/tests/openapi.test.ts`
- 新建：`src/api/identityResources.ts`
- 修改：`src/pages/user/FormalCheckoutPage.tsx`
- 修改：`src/pages/user/ServiceDetailPage.tsx`

**步骤 1：写失败测试**

- 同一账号的 U、S、B、O 保存不同地址列表，API 只返回 activeIdentityId 的地址。
- 收藏 Shop、Technician、Service 时使用 `(identityId, targetType, targetId)` 唯一约束。
- 删除使用软删除，再次收藏恢复同一关系。
- 列表分页，所有写入验证目标存在且未删除。

**步骤 2：运行失败测试**

```bash
cd backend
npm test -- tests/identity-address-favorite-api.test.ts tests/openapi.test.ts
```

**步骤 3：实现正式 API 并替换页面本地状态**

- 新建 `IdentityAddress` 与 `IdentityFavorite`，不把地址塞进 User 或前端 local state。
- Route → Controller → Service → Repository 分层，Zod/OpenAPI/permission 完整。
- FormalCheckoutPage 从真实地址 API 读取和保存。
- ServiceDetailPage 的收藏按钮调用正式 API，不再只切换 React state。

**步骤 4：验证并提交**

```bash
cd backend
npm run prisma:generate
npm test -- tests/identity-address-favorite-api.test.ts tests/openapi.test.ts
cd ..
npm test -- src/pages/user/ServiceDetailPage.test.ts src/pages/user/FormalCheckoutPage.test.ts
git add backend/prisma/schema.prisma backend/prisma/migrations/20260828110000_identity_addresses_favorites backend/src/repositories/identity-resource.repository.ts backend/src/services/identity-resource.service.ts backend/src/controllers/identity-resource.controller.ts backend/src/validators/identity-resource.validator.ts backend/src/routes/identity-resource.routes.ts backend/src/app.ts backend/src/constants/permissions.constants.ts backend/src/api/openapi.ts backend/tests/identity-address-favorite-api.test.ts backend/tests/openapi.test.ts src/api/identityResources.ts src/pages/user/FormalCheckoutPage.tsx src/pages/user/ServiceDetailPage.tsx src/pages/user/ServiceDetailPage.test.ts src/pages/user/FormalCheckoutPage.test.ts
git commit -m "feat: add identity-scoped addresses and favorites"
```

---

## 任务 7B：迁移 NDP、订单、利用次数和评分到身份

**文件：**

- 修改：`backend/prisma/schema.prisma`
- 新建：`backend/prisma/migrations/20260828113000_identity_scoped_business_data/migration.sql`
- 修改：`backend/src/repositories/ledger.repository.ts`
- 修改：`backend/src/services/ledger.service.ts`
- 修改：`backend/src/repositories/booking.repository.ts`
- 修改：`backend/src/services/booking.service.ts`
- 修改：`backend/src/repositories/core-read.repository.ts`
- 新建：`backend/tests/identity-business-data-isolation.integration.test.ts`
- 修改：相关 booking、ledger 测试

**步骤 1：写失败测试**

同一账号不同身份分别创建 NDP 流水、订单、利用次数和评分，断言每个 API 只返回 activeIdentityId 的数据。测试 U/NEEDO 会员不影响 S/B/O。

**步骤 2：运行失败测试**

```bash
cd backend
npm test -- tests/identity-business-data-isolation.integration.test.ts
```

**步骤 3：按资源逐项迁移**

顺序固定为：NDP → 消费者订单/利用次数 → 技师订单/评分 → B/O 操作审计。每完成一种资源就执行对账，不允许一个 migration 中猜测无法确认的归属。

**步骤 4：验证并提交**

```bash
cd backend
npm run prisma:generate
npm test -- tests/identity-business-data-isolation.integration.test.ts tests/ledger-service.test.ts tests/booking-api.test.ts
git add backend/prisma/schema.prisma backend/prisma/migrations/20260828113000_identity_scoped_business_data backend/src/repositories/ledger.repository.ts backend/src/services/ledger.service.ts backend/src/repositories/booking.repository.ts backend/src/services/booking.service.ts backend/src/repositories/core-read.repository.ts backend/tests/identity-business-data-isolation.integration.test.ts backend/tests/ledger-service.test.ts backend/tests/booking-api.test.ts
git commit -m "feat: scope business data to active identity"
```

---

## 任务 8：把 IM、联系人、好友、通知和 Social 迁到 identityId

**文件：**

- 修改：`backend/prisma/schema.prisma`
- 新建：`backend/prisma/migrations/20260828120000_identity_scoped_realtime_social/migration.sql`
- 修改：`backend/src/repositories/realtime.repository.ts`
- 修改：`backend/src/services/realtime.service.ts`
- 修改：`backend/src/controllers/realtime.controller.ts`
- 修改：`backend/src/validators/realtime.validator.ts`
- 修改：`backend/src/routes/realtime.routes.ts`
- 修改：`backend/tests/realtime-service.test.ts`
- 修改：`backend/tests/realtime-api.test.ts`
- 修改：`backend/tests/realtime-repository-identity.test.ts`
- 修改：`src/features/realtime/api.ts`
- 修改：`src/features/im/formal-api.ts`
- 修改：`src/features/im/formal-api.test.ts`

**步骤 1：写身份级社交失败测试**

- Contact/FriendRequest/ConversationParticipant/Message sender/Reaction/SocialPost/Follow/Notification 全部使用 identityId。
- 同一账号的 U 和 B 互相不可见对方好友与聊天。
- b/o 未成为好友时不能创建普通 direct Conversation。
- Support Private Session 以后通过显式 conversation kind 豁免，不开放通用陌生人私聊。
- 最近30天动态状态按目标 identityId 和可见性查询。

**步骤 2：运行失败测试**

```bash
cd backend
npm test -- tests/realtime-service.test.ts tests/realtime-api.test.ts tests/realtime-repository-identity.test.ts
```

**步骤 3：迁移和实现**

- 添加新 identity 外键并按当时默认/业务身份回填。
- 所有 RealtimeService 方法从 authenticated context 读取 activeIdentityId。
- API payload 返回真实 `publicId`，不返回前端推测用 systemId。
- 保留现有30天 activity-status API，但参数和权限改为 identityId。

**步骤 4：验证并提交**

```bash
cd backend
npm run prisma:generate
npm test -- tests/realtime-service.test.ts tests/realtime-api.test.ts tests/realtime-repository-identity.test.ts
cd ..
npm test -- src/features/im/formal-api.test.ts src/features/im/pages.test.ts
git add backend/prisma/schema.prisma backend/prisma/migrations/20260828120000_identity_scoped_realtime_social backend/src/repositories/realtime.repository.ts backend/src/services/realtime.service.ts backend/src/controllers/realtime.controller.ts backend/src/validators/realtime.validator.ts backend/src/routes/realtime.routes.ts backend/tests/realtime-service.test.ts backend/tests/realtime-api.test.ts backend/tests/realtime-repository-identity.test.ts src/features/realtime/api.ts src/features/im/formal-api.ts src/features/im/formal-api.test.ts
git commit -m "feat: scope realtime and social data by identity"
```

---

## 任务 9：实现好友设置、3天过期和新的朋友状态

**文件：**

- 修改：`backend/prisma/schema.prisma`
- 新建：`backend/prisma/migrations/20260828130000_friend_policy_and_expiry/migration.sql`
- 修改：`backend/src/repositories/realtime.repository.ts`
- 修改：`backend/src/services/realtime.service.ts`
- 修改：`backend/src/validators/realtime.validator.ts`
- 修改：`backend/src/routes/realtime.routes.ts`
- 新建：`backend/src/workers/friend-request-expiry.worker.ts`
- 新建：`backend/tests/friend-request-lifecycle.test.ts`
- 修改：`backend/tests/realtime-api.test.ts`
- 修改：`src/features/settings/UnifiedSettingsPages.tsx`
- 修改：`src/features/settings/UnifiedSettingsPages.test.ts`
- 修改：`src/features/im/model.ts`
- 修改：`src/features/im/pages.tsx`
- 修改：`src/features/im/pages.test.ts`
- 修改：`src/i18n/translations.ts`
- 修改：`src/i18n/translations.test.ts`

**步骤 1：写状态机失败测试**

覆盖 REJECT_ALL、REQUIRE_APPROVAL、ACCEPT_ALL；PENDING/ACCEPTED/REJECTED/EXPIRED；72小时过期；PENDING 重发不通知；拒绝后3天冷却；冷却或过期后新申请重新通知。

**步骤 2：运行失败测试**

```bash
cd backend
npm test -- tests/friend-request-lifecycle.test.ts tests/realtime-api.test.ts
cd ..
npm test -- src/features/settings/UnifiedSettingsPages.test.ts src/features/im/pages.test.ts
```

**步骤 3：实现后端和 UI**

- 设置按 identityId 保存，默认 REQUIRE_APPROVAL。
- 重复申请使用事务和唯一 active-key 防并发重复。
- Worker 与读取时惰性过期共同保证状态准确。
- “新的朋友”右侧显示已添加、过期、拒绝、待处理。
- 设置入口放入“个人资料与认证”。

**步骤 4：验证并提交**

```bash
cd backend
npm run prisma:generate
npm test -- tests/friend-request-lifecycle.test.ts tests/realtime-api.test.ts
cd ..
npm test -- src/features/settings/UnifiedSettingsPages.test.ts src/features/im/pages.test.ts src/i18n/translations.test.ts
git add backend/prisma/schema.prisma backend/prisma/migrations/20260828130000_friend_policy_and_expiry backend/src/repositories/realtime.repository.ts backend/src/services/realtime.service.ts backend/src/validators/realtime.validator.ts backend/src/routes/realtime.routes.ts backend/src/workers/friend-request-expiry.worker.ts backend/tests/friend-request-lifecycle.test.ts backend/tests/realtime-api.test.ts src/features/settings/UnifiedSettingsPages.tsx src/features/settings/UnifiedSettingsPages.test.ts src/features/im/model.ts src/features/im/pages.tsx src/features/im/pages.test.ts src/i18n/translations.ts src/i18n/translations.test.ts
git commit -m "feat: add identity friend request policies"
```

---

## 任务 10：接入 Shop、Owner 和一对一 Customer Support ID

**文件：**

- 修改：`backend/prisma/schema.prisma`
- 新建：`backend/prisma/migrations/20260828140000_shop_owner_customer_support_constraints/migration.sql`
- 修改：`backend/src/repositories/merchant-application-review.repository.ts`
- 修改：`backend/src/services/merchant-application-review.service.ts`
- 修改：`backend/src/repositories/identity-activation.repository.ts`
- 新建：`backend/src/repositories/customer-support.repository.ts`
- 新建：`backend/tests/shop-owner-support-identifier.test.ts`
- 修改：`backend/tests/merchant-application-review.repository.test.ts`
- 修改：`backend/tests/identity-activation.service.test.ts`

**步骤 1：写失败测试**

- 商户审核生成 `owner...`。
- 店铺审核同事务生成 `shop...` 和同数字 `cs...`。
- 一个 Shop 只能有一个 CS。
- 一个 Merchant 可关联多个 Shop 和多个 O 人员。
- `cs0000000000` seed 唯一且无 Shop。
- owner 不可普通检索，shop 可名称/完整 ID 检索。
- 真实回填完成后把 `shopNo/ownerNo` 提升为正式非空唯一约束，并封闭临时 nullable 状态。

**步骤 2：实现并验证**

```bash
cd backend
npm test -- tests/shop-owner-support-identifier.test.ts tests/merchant-application-review.repository.test.ts tests/identity-activation.service.test.ts
npm run prisma:generate
npm test -- tests/shop-owner-support-identifier.test.ts tests/merchant-application-review.repository.test.ts tests/identity-activation.service.test.ts
```

**步骤 3：提交**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260828140000_shop_owner_customer_support_constraints backend/src/repositories/merchant-application-review.repository.ts backend/src/services/merchant-application-review.service.ts backend/src/repositories/identity-activation.repository.ts backend/src/repositories/customer-support.repository.ts backend/tests/shop-owner-support-identifier.test.ts backend/tests/merchant-application-review.repository.test.ts backend/tests/identity-activation.service.test.ts
git commit -m "feat: create formal shop owner and support identifiers"
```

---

## 任务 11：实现服务号订阅、固定分类与担当授权

**文件：**

- 修改：`backend/prisma/schema.prisma`
- 新建：`backend/prisma/migrations/20260828150000_customer_support_subscriptions_assignments/migration.sql`
- 新建：`backend/src/services/customer-support.service.ts`
- 新建：`backend/src/repositories/customer-support.repository.ts`
- 新建：`backend/src/controllers/customer-support.controller.ts`
- 新建：`backend/src/validators/customer-support.validator.ts`
- 新建：`backend/src/routes/customer-support.routes.ts`
- 修改：`backend/src/app.ts`
- 修改：`backend/src/constants/permissions.constants.ts`
- 修改：`backend/src/api/openapi.ts`
- 新建：`backend/tests/customer-support-subscription-api.test.ts`
- 新建：`backend/tests/customer-support-assignment-api.test.ts`
- 修改：`backend/tests/openapi.test.ts`

**步骤 1：写失败测试**

- U/NEEDO identity 可添加多个 CS；S 被拒绝。
- 添加单向立即生效；CS 不能反向添加用户。
- 删除订阅停止新咨询/广告，但历史保留。
- 固定分类只有 COMPLAINT/INQUIRY/OTHER/ADVERTISING。
- 前三类可创建咨询，ADVERTISING 不可。
- 每类至少1个有效 B 担当；B 可重复分配多个分类。
- B/O Shop scope 校验严格。

**步骤 2：实现 Route → Controller → Service → Repository**

所有列表分页、Zod、OpenAPI、permission 和审计齐全。不得把业务逻辑放 Controller。

**步骤 3：验证并提交**

```bash
cd backend
npm run prisma:generate
npm test -- tests/customer-support-subscription-api.test.ts tests/customer-support-assignment-api.test.ts tests/openapi.test.ts
git add backend/prisma/schema.prisma backend/prisma/migrations/20260828150000_customer_support_subscriptions_assignments backend/src/services/customer-support.service.ts backend/src/repositories/customer-support.repository.ts backend/src/controllers/customer-support.controller.ts backend/src/validators/customer-support.validator.ts backend/src/routes/customer-support.routes.ts backend/src/app.ts backend/src/constants/permissions.constants.ts backend/src/api/openapi.ts backend/tests/customer-support-subscription-api.test.ts backend/tests/customer-support-assignment-api.test.ts backend/tests/openapi.test.ts
git commit -m "feat: add service subscriptions and support assignments"
```

---

## 任务 12：实现多人客服 Conversation 状态机

**文件：**

- 修改：`backend/prisma/schema.prisma`
- 新建：`backend/prisma/migrations/20260828160000_customer_support_conversations/migration.sql`
- 修改：`backend/src/services/customer-support.service.ts`
- 修改：`backend/src/repositories/customer-support.repository.ts`
- 修改：`backend/src/controllers/customer-support.controller.ts`
- 修改：`backend/src/validators/customer-support.validator.ts`
- 修改：`backend/src/routes/customer-support.routes.ts`
- 修改：`backend/src/services/realtime-event.gateway.ts`
- 新建：`backend/tests/customer-support-conversation-state.test.ts`
- 新建：`backend/tests/customer-support-claim-race.integration.test.ts`
- 新建：`backend/tests/customer-support-notification.test.ts`

**步骤 1：写状态机失败测试**

```text
AVAILABLE → CLAIMED → AVAILABLE
AVAILABLE → CLAIMED → RESOLVED → AVAILABLE
```

再覆盖原子认领竞争、非担当403、非 claimedBy 回复403、关闭页面不释放、真实 b-ID sender、其他担当只读、＋/结束所需 payload、完整操作日志和通知路由。

**步骤 2：运行失败测试**

```bash
cd backend
npm test -- tests/customer-support-conversation-state.test.ts tests/customer-support-claim-race.integration.test.ts tests/customer-support-notification.test.ts
```

**步骤 3：实现最小状态机**

- Claim 使用条件更新或等价事务锁。
- Support Private Session 使用显式 conversation kind，不能放开普通陌生人消息。
- 每条消息保存 senderIdentityId。
- RESOLVED 后用户原 Thread 新消息执行 REOPEN，保留 category。

**步骤 4：验证并提交**

```bash
cd backend
npm run prisma:generate
npm test -- tests/customer-support-conversation-state.test.ts tests/customer-support-claim-race.integration.test.ts tests/customer-support-notification.test.ts
git add backend/prisma/schema.prisma backend/prisma/migrations/20260828160000_customer_support_conversations backend/src/services/customer-support.service.ts backend/src/repositories/customer-support.repository.ts backend/src/controllers/customer-support.controller.ts backend/src/validators/customer-support.validator.ts backend/src/routes/customer-support.routes.ts backend/src/services/realtime-event.gateway.ts backend/tests/customer-support-conversation-state.test.ts backend/tests/customer-support-claim-race.integration.test.ts backend/tests/customer-support-notification.test.ts
git commit -m "feat: add claimed customer support conversations"
```

---

## 任务 13：实现广告 Campaign 和幂等投递

**文件：**

- 修改：`backend/prisma/schema.prisma`
- 新建：`backend/prisma/migrations/20260828170000_customer_support_broadcasts/migration.sql`
- 新建：`backend/src/services/support-broadcast.service.ts`
- 新建：`backend/src/repositories/support-broadcast.repository.ts`
- 修改：`backend/src/controllers/customer-support.controller.ts`
- 修改：`backend/src/validators/customer-support.validator.ts`
- 修改：`backend/src/routes/customer-support.routes.ts`
- 新建：`backend/tests/support-broadcast.service.test.ts`
- 新建：`backend/tests/support-broadcast-api.test.ts`

**步骤 1：写失败测试**

- 只有该 Shop 的 ADVERTISING 担当 B 可创建/发布。
- 同一 idempotency key 返回同一 Campaign。
- 发布时对 active subscription 做受众快照。
- 删除服务号的身份不接收。
- 用户端 sender 显示 cs-ID，审计记录真实 B。
- 广告不创建 Support Conversation。
- 回复广告必须选三类之一并保存 sourceBroadcastId。

**步骤 2：实现、验证、提交**

```bash
cd backend
npm run prisma:generate
npm test -- tests/support-broadcast.service.test.ts tests/support-broadcast-api.test.ts
git add backend/prisma/schema.prisma backend/prisma/migrations/20260828170000_customer_support_broadcasts backend/src/services/support-broadcast.service.ts backend/src/repositories/support-broadcast.repository.ts backend/src/controllers/customer-support.controller.ts backend/src/validators/customer-support.validator.ts backend/src/routes/customer-support.routes.ts backend/tests/support-broadcast.service.test.ts backend/tests/support-broadcast-api.test.ts
git commit -m "feat: add idempotent service account broadcasts"
```

---

## 任务 14：接入用户、店铺和商户端真实服务号 UI

**文件：**

- 修改：`src/features/im/model.ts`
- 修改：`src/features/im/formal-api.ts`
- 修改：`src/features/im/role-config.ts`
- 修改：`src/features/im/pages.tsx`
- 修改：`src/features/im/route-pages.tsx`
- 修改：`src/features/im/formal-api.test.ts`
- 修改：`src/features/im/pages.test.ts`
- 修改：`src/App.tsx`
- 修改：`src/pages/mobile/TechnicianPortalPage.tsx`
- 修改：`src/pages/mobile/MerchantPortalPage.tsx`
- 修改：`src/i18n/translations.ts`
- 修改：`src/i18n/translations.test.ts`

**步骤 1：写 UI 失败测试**

- U/NEEDO 通讯录顺序：新的朋友、群聊、服务号、标签。
- 用户服务号列表支持多个店铺。
- S 不渲染服务号入口，且删除 `/technician/contacts/service-accounts` 路由。
- B/O 店铺上下文显示投诉、询问、其他、广告4项。
- 用户只显示投诉、询问、其他3个发起入口。
- 分类不显示为聊天输入框常驻 chips。
- 未选分类发送只提示，不创建消息。
- 广告在 cs 聊天窗口显示；回复先选分类。
- Support Thread 显示真实 b-ID，根消息显示可点击 `＋/结束`。

**步骤 2：运行失败测试**

```bash
npm test -- src/features/im/formal-api.test.ts src/features/im/pages.test.ts src/i18n/translations.test.ts
```

**步骤 3：只接正式 API**

- 不改 `src/features/im/seed.ts` 来伪造完成效果。
- 正式页面的数据源只能来自 Customer Support API 和 Realtime API。
- 删除 TechnicianPortal 中现存服务号展示。
- Merchant/O 切店后刷新 shop-scoped 队列和未读数。

**步骤 4：验证并提交**

```bash
npm test -- src/features/im/formal-api.test.ts src/features/im/pages.test.ts src/i18n/translations.test.ts
npm run lint
npm run build -- --mode formal
git add src/features/im src/App.tsx src/pages/mobile/TechnicianPortalPage.tsx src/pages/mobile/MerchantPortalPage.tsx src/i18n
git commit -m "feat: connect formal service account experiences"
```

---

## 任务 15：删除旧 ID 和假数据兼容层

**文件：**

- 修改：`backend/prisma/schema.prisma`
- 新建：`backend/prisma/migrations/20260828180000_remove_legacy_identifiers/migration.sql`
- 删除：`backend/src/services/needo-id.service.ts`
- 删除：`backend/tests/needo-id.service.test.ts`
- 修改：所有仍引用 `needoId` 的 backend service/repository/test
- 删除：`src/lib/systemIds.ts`
- 修改：`src/features/im/formal-api.ts`
- 修改：`src/features/im/model.ts`
- 修改：`src/features/im/api.ts`
- 修改：`src/features/im/seed.ts`
- 修改：`backend/prisma/seed.ts`
- 修改：`backend/scripts/seed-three-month-simulation.ts`
- 新建：`backend/tests/no-legacy-identifier-contract.test.ts`
- 新建：`src/lib/noLegacySystemIds.test.ts`

**步骤 1：写仓库级失败测试**

测试/脚本扫描正式运行时代码，拒绝：

- `User.needoId`；
- `n\d{10}`；
- `formatSystemId/hashSystemId`；
- 错误 `b/s` 前缀映射；
- formal adapter 中根据用户名推测 profileKind；
- 正式页面使用 IM seed 联系人。

历史 migration 和已批准设计文档可以进入白名单，运行时代码不得例外。

**步骤 2：执行正式 apply 前置检查**

```bash
cd backend
npm run check:unified-identifier-cutover
```

只有所有行已回填、所有外键已切换、旧字段读取为0时，才允许运行删除 migration。

**步骤 3：删除旧规则并验证**

```bash
cd backend
npm run prisma:generate
npm test -- tests/no-legacy-identifier-contract.test.ts
npm run build
cd ..
npm test -- src/lib/noLegacySystemIds.test.ts
npm run build -- --mode formal
```

**步骤 4：提交**

```bash
git status --short
git add backend/prisma/schema.prisma backend/prisma/migrations/20260828180000_remove_legacy_identifiers backend/src backend/tests/no-legacy-identifier-contract.test.ts src/lib src/features/im backend/prisma/seed.ts backend/scripts/seed-three-month-simulation.ts
git diff --cached --check
git commit -m "refactor: remove legacy identifier rules"
```

执行 `git add` 前必须确认 worktree 除本任务外为干净状态；若存在无关改动，停止并改为逐文件暂存。

---

## 任务 16：真实数据库端到端验收和发布前证明

**文件：**

- 新建：`backend/scripts/check-unified-identity-e2e.ts`
- 新建：`backend/scripts/check-customer-support-e2e.ts`
- 新建：`backend/tests/unified-identity-e2e.integration.test.ts`
- 新建：`backend/tests/customer-support-e2e.integration.test.ts`
- 新建：`docs/verification/2026-08-28-unified-identity-customer-support-acceptance.md`
- 修改：`backend/package.json`

**步骤 1：建立真实测试账号矩阵**

至少包含：

- 普通 U；
- 公司 NEEDO；
- 同账号 U/NEEDO + S；
- 同账号主身份 + B + O；
- 两个 Shop、一个 Merchant、多名 O/B；
- 已添加和未添加服务号的身份；
- 三种好友偏好。

全部通过正式注册、审核和 API 创建，禁止直接插入假 UI seed。

**步骤 2：运行完整验证**

```bash
cd backend
npm run prisma:status
npm run prisma:generate
npm run lint
npm test
npm run build
npm run check:unified-identity-e2e
npm run check:customer-support-e2e
cd ..
npm run lint
npm test
npm run i18n:audit
npm run i18n:quality
npm run build -- --mode formal
npm run audit:production-bundle
```

**步骤 3：本地 UI 验收**

逐身份实际登录并检查：

- 公开号和身份切换；
- 身份资料/订单/NDP/社交隔离；
- 新的朋友状态和3天规则；
- 用户通讯录服务号位置；
- 技师端无服务号；
- Shop/O 多店切换；
- 客服原子认领、释放、结束、重新打开；
- 广告发布、投递和回复分类；
- 联系人动态30天入口。

重启后端并重新登录，确认所有数据仍存在。

**步骤 4：记录证据并提交**

验收文档分别记录：命令、通过时间、测试账号、数据库计数、UI 路径、截图和未通过项。不得把“测试通过”写成“已部署”。

```bash
git add backend/scripts/check-unified-identity-e2e.ts backend/scripts/check-customer-support-e2e.ts backend/tests/unified-identity-e2e.integration.test.ts backend/tests/customer-support-e2e.integration.test.ts backend/package.json docs/verification/2026-08-28-unified-identity-customer-support-acceptance.md
git commit -m "test: verify unified identity and customer support end to end"
```

## 完成条件

只有以下条件同时满足，才能报告完成：

1. 正式 schema 和运行时代码只剩一套 ID 规则。
2. 旧 ID 无法登录、搜索或从 API 返回。
3. 所有身份级资料、资产、订单和社交关系通过真实数据库隔离测试。
4. 用户、技师、店铺、商户端 UI 与批准设计一致。
5. Customer Support 和广告在并发、权限、幂等和历史保留方面全部通过。
6. backend/frontend lint、完整测试、正式 build 和生产 bundle 审计通过。
7. 本地真实账号 UI 验收完成并留下证据。
8. 尚未推送、部署或发布时必须明确写为“本地提交完成”，不能扩大表述。
