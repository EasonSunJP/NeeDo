# 联盟营销个人资料正式验收记录

> 验收日期：2026-08-28
> 验收范围：联盟营销身份自助开通、同一 NeeDo ID、独立联盟营销资料、外部社交主页链接
> 状态：本地正式环境验收通过；未推送、未部署

## 1. 本微步骤交付边界

本微步骤完成联盟营销正式化的第一个可用纵向切片：已登录的真实 NeeDo 用户可以在不完成 eKYC 的情况下接受正式联盟营销合同并开通身份，继续使用原用户的不可变 `needoId`，随后通过正式 API 和 MySQL 持久化独立的联盟营销简介、优势领域、服务区域、合作状态和外部社交平台主页。

页面不使用 `localStorage`、演示数据或假接口保存资料。资料、外部主页、合同证据、RBAC 和审计日志均由正式后端处理。

本微步骤不表示完整的商户端、达人广场、达人动态、营销热榜或运营后台监控已经完成；这些能力仍按已批准设计拆分为后续微步骤。

## 2. 数据库与 migration

| Migration | 内容 | 正式本地库状态 |
|---|---|---|
| `20260828110000_affiliate_profile_channels` | `affiliate_profiles`、`affiliate_profile_channels`、合作状态枚举、版本与软删除索引 | 已应用 |
| `20260828113000_affiliate_profile_permissions` | `page:affiliate-profile`、`button:affiliate-profile-edit` 及角色授权 | 已应用 |

`ENV_FILE=/Users/eason/Documents/New project/backend/.env.dev npx prisma migrate status --schema prisma/schema.prisma` 返回：43 个 migration，`Database schema is up to date!`。

## 3. 正式 API 与权限矩阵

所有接口均使用 `/api/v1` 前缀、JWT 鉴权、Zod 校验、统一响应格式和 OpenAPI 文档。

| 方法与路径 | 用途 | Permission |
|---|---|---|
| `GET /contracts/affiliate/current` | 读取当前联盟营销合同 | `contract:read` |
| `POST /identity-activations/affiliate` | 保存合同证据并开通联盟营销身份 | `contract:accept` |
| `GET /affiliate/profile` | 读取本人联盟营销资料与外部主页 | `page:affiliate-profile` |
| `PATCH /affiliate/profile` | 更新简介、优势、地区、合作状态 | `button:affiliate-profile-edit` |
| `POST /affiliate/profile/channels` | 新增外部主页 | `button:affiliate-profile-edit` |
| `PATCH /affiliate/profile/channels/:channelId` | 更新外部主页 | `button:affiliate-profile-edit` |
| `DELETE /affiliate/profile/channels/:channelId` | 软删除外部主页 | `button:affiliate-profile-edit` |

资料和渠道写入使用 `expectedVersion` / `expectedProfileVersion` 做乐观并发控制。更新资料、新增、更新和删除渠道均写入 `AuditLog`；未开通身份、无权限、版本冲突、重复渠道和渠道数量上限分别返回正式 403、409 或校验错误。

## 4. 外部主页安全规则

- 仅接受 `https:` URL；拒绝用户名、密码、URL fragment、localhost、单标签主机、`.local`、`.internal` 和 IP 地址。
- X 仅允许 `x.com` / `twitter.com` 及其子域；Instagram、YouTube、TikTok 仅允许各自正式域及子域。
- 自定义平台必须填写 1–60 字符名称，可以使用其他公开 HTTPS 域名。
- 单个用户最多保存 10 个外部主页；主页 URL 最长 500 字符。
- 页面只展示用户填写的链接，不声称 NeeDo 已验证外部粉丝数或其他平台数据。
- 页面链接固定使用 `target="_blank"` 和 `rel="noopener noreferrer"`。

## 5. 身份、eKYC 与银行规则验收

浏览器正式验收账号以普通用户身份接受合同后：

```json
{
  "affiliateIdentityActive": true,
  "affiliateContractAccepted": true,
  "ekycRecordCount": 0,
  "bankAccountCount": 0
}
```

因此已验证“开通联盟营销不要求 eKYC 或银行账户”。提现边界保持不变：发起联盟营销 NDP 提现前必须完成有效 eKYC、绑定真实银行账户，并由后端校验银行账户名义与 eKYC 姓名一致；本微步骤没有绕过或修改该规则。

联盟营销身份没有创建第二个 `User` 或第二个公开 ID。激活后的业务身份继续公开同一用户的不可变 `needoId`，内部 identity 主键不返回页面。

## 6. 自动化验证

### 后端

```bash
npm test -- tests/affiliate-profile-schema.test.ts \
  tests/affiliate-profile-permissions-migration.test.ts \
  tests/affiliate-permissions.test.ts \
  tests/affiliate-channel-url.service.test.ts \
  tests/affiliate-profile.repository.test.ts \
  tests/affiliate-profile.service.test.ts \
  tests/affiliate-profile-api.test.ts \
  tests/affiliate-identity-activation-api.test.ts \
  tests/openapi.test.ts \
  tests/auth.test.ts \
  tests/check-test-login-script.test.ts
```

结果：11 个 suite、121 个测试全部通过。

同时通过：

- `npx prisma validate --schema prisma/schema.prisma`
- `npm run build`
- `npm run lint`
- 本分支 27 个变更后端 TypeScript 文件的 focused Prettier 检查

仓库级 `npm run format:check` 仍会报告 150 个本微步骤之外的既有格式文件；本次变更涉及的后端 TypeScript 文件全部通过 focused 检查。

### 前端

```bash
npm test -- src/api/affiliateProfile.test.ts \
  src/features/affiliate-profile/AffiliateProfilePage.test.tsx \
  src/features/identity-applications/i18n.test.ts \
  src/i18n/translations.test.ts \
  src/App.test.tsx \
  src/auth/portalEntry.test.ts
```

结果：6 个文件、57 个测试全部通过。

`npm run verify:production-build` 通过，正式 bundle 审计通过 8 个 HTML 入口和 22 个 assets。`npm run i18n:audit` 与 `npm run i18n:quality` 均退出 0；质量报告中四种目标语言的缺失项均为 0。信息型 `i18n:audit` 仍报告 3,599 个仓库级既有抽取缺口，质量报告也保留既有日语简体字扫描基线；本页新增文案已有四语映射，并通过浏览器逐项验收。

## 7. 正式服务与真实账号验收

正式本地服务状态：

- MySQL `3307`：可连接。
- Redis `6379`：健康。
- 后端 `3000 /api/v1/health`：HTTP 200，`status=ok`。
- 后端 `3000 /api/v1/ready`：HTTP 200，`status=ready`，数据库和 Redis 均为 `ok`。
- 前端 `5180 /afirieito.html`：HTTP 200。
- 前端代理 `5180 /api/v1/health`：HTTP 200，正式后端响应。

API 验收账号：`a***@example.com` / `u********89`。浏览器验收账号：`s***@needo.local` / `u********10`。两者均为本机正式测试数据库中的真实用户记录，未在代码或文档中保存密码。

已验证：

1. `/auth/me` 返回不可变 `needoId`。
2. 未开通账号读取/修改资料和领取任务返回 403。
3. 无 eKYC 用户可以接受合同并开通身份。
4. 激活响应不暴露内部 identity ID，业务端显示同一 `needoId`。
5. 简介、优势、地区、合作状态和两个外部主页通过正式 API 写入；其中一个主页随后通过正式 DELETE 接口删除。
6. 页面刷新、退出重登和后端重启后资料与剩余主页仍存在。
7. 合同、资料和渠道写入产生可审计记录；激活没有创建 eKYC 或银行账户记录。

## 8. 浏览器验收

入口与路由：

- 开通页：`/user.html#/me/identity/affiliate/contract`
- 正式资料页：`/afirieito.html#/afirieito/me`

开通完成后的跳转缺陷已在验收中发现并修复：现在统一通过业务端 HTML 入口进入 `#/afirieito/me`，不再错误跳到空白直链 `/afirieito/me`。

浏览器检查覆盖：

- 简体中文：`联盟营销个人资料`、浅色主题、1280×900。
- 英文：`Affiliate profile`、深色主题、1280×900。
- 日语：`アフィリエイトプロフィール`、深色主题、430×932。
- `needoId` 可见且 input 为只读。
- 保存简介、优势、地区和合作状态。
- 新增 Instagram 和自定义 HTTPS 主页，检查 `_blank` / `noopener noreferrer`，删除自定义主页。
- 刷新、退出、重新登录后资料持久化。
- 修复显式多语言页面被运行时二次翻译的问题；日语不再出现重复变形，用户填写的 `東京都` 等原文不会被自动改写。
- 最终页面 console warning/error：0。

截图位置：

- `/private/tmp/needo-affiliate-contract-zh.png`
- `/private/tmp/needo-affiliate-profile-zh-desktop.png`
- `/private/tmp/needo-affiliate-profile-en-desktop.png`
- `/private/tmp/needo-affiliate-profile-ja-mobile.png`

## 9. 后续微步骤（本次未实现）

下一批能力必须继续复用当前正式身份、资料、Booking、NDP Ledger、RBAC 和 AuditLog，不得新增平行 demo：

1. 确认并扩展既有联盟组织层级、邀请、成员归属和专属任务，避免覆盖此前结构。
2. 商户后台顶部“联盟营销”入口，以及“我的联盟营销、达人广场、达人动态、营销热榜”四个真实工作区。
3. 达人筛选、邀请、任务协作和榜单，仅使用 NeeDo 可验证的真实履约、转化和完成数据。
4. 运营后台全店铺监控、平台抽成比例配置、风险与审计。
5. 联盟营销提现资格、eKYC、真实银行账户名义一致性和正式结算 UI。

以上能力属于后续独立微步骤，不应把本次个人资料纵向切片误标为完整联盟营销平台已完成。
