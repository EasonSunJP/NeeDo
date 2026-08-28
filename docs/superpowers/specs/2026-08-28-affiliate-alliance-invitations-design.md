# NeeDo 联盟好友候选与邀请闭环设计

## 1. 目标与微步骤边界

本微步骤建立联盟成员关系的第一个正式闭环：联盟负责人可以从自己的 NeeDo 双向好友中筛选已开通 Affiliate 身份的真实账号，邀请其成为合伙人或下级；受邀人可以在联盟页面查看邀请并接受或拒绝；邀请 72 小时后自动过期。所有状态必须写入 MySQL，并通过 `/api/v1/`、JWT、RBAC、Zod、OpenAPI、审计和正式前端完成操作。

本微步骤继续使用现有 `AffiliateAlliance`、`AffiliateAllianceMember`、`AffiliateAlliancePermission` 与唯一 `activeKey` 约束，不创建第二套用户、好友或联盟模型。

本微步骤不实现成员权限编辑、成员退出、负责人移除成员、合伙人自行邀请下级、负责人转让、合伙人绑定、联盟解散、任务受众、三方结算、联盟钱包转账、排行榜、商户端或运营后台。以上能力保持后续独立微步骤。

## 2. 已确认业务规则

- 邀请固定有效期为 72 小时，从邀请创建成功时间开始计算。
- 候选人必须是邀请人的 NeeDo 双向好友：双方各有一条未软删除、未拉黑的 `Contact`。
- 候选 User 必须有效且未软删除，并已拥有有效的 `scout` UserIdentity 和状态为 `ACTIVE` 的 AffiliateProfile。
- 候选人当前不能拥有任何有效联盟成员关系。
- 同一联盟不能向同一用户创建重复待处理邀请。
- 本微步骤只有当前联盟负责人可以发出邀请。
- 可邀请角色仅为 `partner` 或 `subordinate`，不能邀请第二名负责人。
- 邀请合伙人时不能指定直属上级；邀请下级时必须指定同联盟内当前有效的负责人或合伙人。
- 发出邀请和接受邀请时，后端都必须重新验证好友、账号、Affiliate 身份、联盟状态与成员资格，不能信任前端筛选结果。
- 接受后才创建有效 `AffiliateAllianceMember`；拒绝和过期都不能创建成员。
- 新合伙人和下级采用最小权限，五项成员权限全部为 `false`。权限编辑属于下一微步骤。
- 第一个成功接受的邀请占用全平台唯一有效联盟成员资格；来自其他联盟的邀请不能覆盖既有成员关系。
- 好友关系只在发送和接受时作为准入条件。加入后解除好友不会自动退出联盟。
- 创建、接受、拒绝和系统过期都必须保留领域记录与审计，不物理删除邀请历史。
- 创建联盟、发送邀请和接受邀请都不要求 eKYC 或银行账户；提现门禁不受影响。

## 3. 方案选择

采用端到端邀请闭环，而不是后端孤立模型或一次加入完整成员管理：

1. 后端孤立模型虽然改动较少，但用户无法实际查看和处理邀请，不满足真实可用。
2. 同时实现退出、移除、权限编辑和负责人转让会跨越多个状态机，违反小步开发规则。
3. 本方案只实现候选、邀请、接受/拒绝、过期、成员列表和必要 UI，形成独立可验收闭环。

## 4. 数据模型

新增 `AffiliateAllianceInvitationRole`：

```text
PARTNER
SUBORDINATE
```

新增 `AffiliateAllianceInvitationStatus`：

```text
PENDING
ACCEPTED
REJECTED
EXPIRED
```

新增 `AffiliateAllianceInvitation`：

```text
id                       Int, primary key
allianceId               Int, FK -> AffiliateAlliance
inviterMemberId          Int, FK -> AffiliateAllianceMember
inviteeUserId            Int, FK -> User
role                     AffiliateAllianceInvitationRole
proposedParentMemberId   Int?, FK -> AffiliateAllianceMember
status                   AffiliateAllianceInvitationStatus
pendingKey               String?, unique
expiresAt                DateTime
respondedAt              DateTime?
expiredAt                DateTime?
version                   Int
createdAt                DateTime
updatedAt                DateTime
deletedAt                DateTime?
```

`pendingKey` 仅在待处理期间写入：

```text
alliance:<allianceId>:invitee:<inviteeUserId>
```

接受、拒绝或过期时在同一事务中把 `pendingKey` 置空，从而保留历史并允许未来重新邀请。数据库增加角色/直属上级组合检查：合伙人必须没有 `proposedParentMemberId`，下级必须有直属上级。所有关联字段、状态、到期时间和软删除字段建立查询索引。已应用的联盟 migration 不修改，使用新的增量 migration。

`User`、`AffiliateAlliance` 和 `AffiliateAllianceMember` 增加对应 relation 字段。现有成员 `activeKey=user:<userId>` 唯一约束继续作为并发接受时的最终数据库保护。

## 5. 权限与身份边界

新增权限：

```text
affiliate-alliance:members:list
affiliate-alliance:candidates:list
affiliate-alliance:invitations:list
button:affiliate-alliance-invite
button:affiliate-alliance-invitation-respond
```

权限迁移只授予 `scout` 与 `admin` 角色，并软撤销其他角色的对应权限。所有当前用户接口仍先要求当前身份为有效 Affiliate（内部类型 `scout`）；拥有 admin 权限不能绕过当前身份要求。

服务层再执行领域授权：

- 成员、候选、当前联盟已发送邀请和发送邀请：仅当前有效联盟负责人。
- 收到邀请列表、接受和拒绝：仅邀请中的受邀用户本人。
- 前端隐藏入口不能替代服务端身份、角色和目标用户校验。

## 6. 正式 API

所有列表必须分页，默认 `page=1&pageSize=20`，最大 `pageSize=100`。搜索只匹配服务端返回允许公开的 `needoId` 和显示名。

```text
GET  /api/v1/affiliate/alliances/me/members
GET  /api/v1/affiliate/alliances/me/eligible-contacts
GET  /api/v1/affiliate/alliances/me/invitations
POST /api/v1/affiliate/alliances/me/invitations
GET  /api/v1/affiliate/alliance-invitations/mine
POST /api/v1/affiliate/alliance-invitations/:id/accept
POST /api/v1/affiliate/alliance-invitations/:id/reject
```

### 6.1 候选列表

查询参数：`q`、`page`、`pageSize`。响应仅包含：

```text
needoId
displayName
avatarUrl
```

不返回内部 `userId`、邮箱、手机号、身份主键、好友 Contact 主键或银行/eKYC 数据。

### 6.2 发送邀请

请求体使用不可变公开标识，不接受内部用户 ID：

```json
{
  "inviteeNeedoId": "u1234567890",
  "role": "partner",
  "proposedParentMemberId": null
}
```

下级邀请必须提交有效的一层成员 ID。成功返回 201 和邀请摘要。重复待处理邀请返回稳定 409；非好友、未开通 Affiliate、已有联盟、无效直属上级、联盟非 active 或非负责人均返回稳定业务错误。

### 6.3 邀请列表

联盟已发送邀请和本人收到邀请分别分页。可按 `pending / accepted / rejected / expired` 筛选。响应包含邀请 ID、联盟公开信息、邀请人/受邀人公开信息、角色、预定直属上级公开信息、状态、创建时间、到期时间和响应时间，不返回内部用户 ID。

### 6.4 接受与拒绝

接受请求不接收成员、联盟、角色或上级参数，全部从邀请记录读取。拒绝请求同样为空请求体。两者均要求受邀人本人和当前 Affiliate 身份。

## 7. 事务、并发与状态机

### 7.1 创建邀请

单事务内重新验证：邀请人有效 owner 成员、联盟 active、双向未拉黑好友、受邀账号与 Affiliate 状态、无有效成员关系、无相同待处理邀请、角色与直属上级合法。事务创建邀请并写 `affiliate_alliance.invitation_created` 审计。

### 7.2 接受邀请

单事务内执行：

1. 条件读取并锁定受邀人本人的待处理邀请。
2. 校验 `expiresAt > now`；到期时转为 `EXPIRED` 后返回稳定过期错误。
3. 重新验证联盟 active、邀请人与受邀人仍为双向未拉黑好友、受邀账号与 Affiliate 仍有效。
4. 重新验证角色和直属上级仍有效。
5. 创建唯一 `activeKey=user:<inviteeUserId>` 的成员。
6. 创建五项全为 false 的 `AffiliateAlliancePermission`。
7. 条件更新邀请为 `ACCEPTED`，清空 `pendingKey`，写 `respondedAt`。
8. 写 `affiliate_alliance.invitation_accepted` 审计。

任何一步失败整笔回滚。两个联盟并发接受同一用户时，只允许一个成员写入成功；另一个稳定返回 `error.affiliate_alliance.already_joined`，不能泄漏数据库原生异常。

### 7.3 拒绝邀请

单事务条件更新本人的待处理、未到期邀请为 `REJECTED`，清空 `pendingKey`，写 `respondedAt` 和 `affiliate_alliance.invitation_rejected` 审计。重复拒绝或接受已结束邀请返回稳定状态冲突。

### 7.4 三天过期

`AffiliateAllianceInvitationExpiryService` 在 backend 启动时执行一次，并按环境配置间隔扫描。每批按主键游标处理固定数量的 `PENDING` 且 `expiresAt <= now` 记录，在事务中改为 `EXPIRED`、清空 `pendingKey`、写 `expiredAt`，并以 `actorId=null` 写 `affiliate_alliance.invitation_expired` 系统审计。

接受接口独立检查 `expiresAt`，所以即使定时扫描尚未处理，过期邀请也绝不能被接受。扫描间隔和批量大小通过正式 env schema 配置，不能在路由或页面硬编码运行环境。

## 8. 前端体验

继续使用 `/afirieito/organization`、共享 `MobileShell`、主题 token 和联盟页面作用域翻译，不新增平行页面或浏览器业务存储。

### 8.1 负责人

- 联盟章程后显示服务端分页成员列表。
- “邀请成员”打开同页抽屉或面板，读取双向好友候选。
- 选择合伙人时不显示直属上级；选择下级时必须从当前 owner/partner 列表选择直属上级。
- 已发送邀请单独显示状态和剩余有效时间。
- 成功邀请后重新读取候选和邀请列表，不在浏览器伪造记录。

### 8.2 未加入联盟的 Affiliate

- 收到的待处理邀请显示在创建联盟表单之前。
- 可以查看联盟、邀请人、角色、直属上级和到期时间，并接受或拒绝。
- 接受成功后重新读取 `/alliances/me` 并进入已加入联盟视图。
- 用户仍可创建自己的联盟；如创建先成功，之后接受邀请将返回已有联盟冲突。

### 8.3 已加入的非负责人

- 显示联盟概要、负责人、本人角色和本人真实权限。
- 没有 `canViewAllianceWallet` 时不渲染联盟钱包余额。
- 不显示负责人专用候选、发送邀请或已发送邀请管理入口。

文案补齐简体中文、繁体中文、日语、英语和韩语。所有列表均有加载、空状态、分页、权限错误、邀请过期、冲突和重试状态。

## 9. 错误契约

至少提供以下稳定错误键：

```text
error.affiliate_alliance.owner_required
error.affiliate_alliance.invitee_not_eligible
error.affiliate_alliance.mutual_contact_required
error.affiliate_alliance.invitation_duplicate
error.affiliate_alliance.invitation_not_found
error.affiliate_alliance.invitation_expired
error.affiliate_alliance.invitation_state_conflict
error.affiliate_alliance.parent_invalid
error.affiliate_alliance.already_joined
```

Controller 不返回 Prisma、URL、SQL 或 Node 原生异常。404 不泄漏其他用户邀请是否存在；邀请不属于当前受邀人时统一按 not found 处理。

## 10. 测试与真实验收

### 10.1 自动测试

- Schema/migration：新表、外键、索引、唯一 pendingKey、角色/直属上级约束、软删除字段。
- Validator：分页、搜索、角色、直属上级组合、空响应 body 和未知字段拒绝。
- Service：身份、owner、本人响应、稳定错误、3 天边界和最小权限。
- Repository：双向未拉黑好友、Affiliate 状态、分页、并发唯一成员、事务回滚和审计。
- API：JWT、RBAC、scope、201/200/403/404/409、严格 JSON 和 OpenAPI。
- Frontend：仅调用正式 API、角色选择、下级上级选择、邀请/接受/拒绝刷新、非 owner 不显示管理入口、无钱包权限不显示余额、无 localStorage 业务回退。
- i18n：联盟页面作用域文案齐全且不覆盖全局通用词汇。

### 10.2 本地真实 MySQL 验收脚本

新增显式 `ENV_FILE` 验收脚本，拒绝 production/staging、远程 MySQL 和生产样式数据库名。脚本创建唯一 marker 账号和关系并精确清理，只操作捕获的 ID。

脚本必须证明：

1. 单向联系人、拉黑联系人、未开通 Affiliate 和已有联盟用户不进入候选。
2. 合法双向好友可以收到 partner/subordinate 邀请。
3. 重复待处理邀请被唯一约束阻止。
4. 拒绝不创建成员。
5. 72 小时边界后无法接受且状态变为 expired。
6. 接受创建一名成员、一行全 false 权限和一条接受审计。
7. 两个联盟并发接受同一用户时只有一个成功。
8. fresh repository/service 能重新读取成员和邀请状态。
9. 清理后 marker 用户、好友、联盟、成员、权限、邀请和审计残留均为零。

### 10.3 浏览器验收

使用两个已开通 Affiliate 的本地正式账号和真实双向好友关系：负责人发出邀请，受邀人切换真实会话后接受或拒绝，负责人刷新后看到数据库成员状态。再验证 390×844 视口、简中/日语/英语、完整滚动范围和浏览器控制台零 error。

## 11. 完成边界

只有 migration、正式 API、页面操作、真实 MySQL 脚本、自动测试、lint、TypeScript build、production build 和双账号浏览器验收全部通过，才可以声明本微步骤完成。

完成本微步骤不代表整个联盟营销平台完成。下一安全微步骤是成员权限编辑；退出、移除与负责人转让仍应继续拆分，不能在本轮顺带实现。
