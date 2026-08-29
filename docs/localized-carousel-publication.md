# NeeDo 多语言轮播与联盟公告正式发布

> 本地验收日期：2026-08-29（Asia/Tokyo）
>
> 范围：用户端首页轮播、联盟营销首页带图公告轮播、联盟正式公告
>
> 状态：自动化、本地真实数据库 checker 与主代理实际浏览器验收均已完成；本文分别记录各层证据，不把组件测试等同于浏览器验收

## 1. 已实现边界

本微步骤通过现有 React / Vite 前端和 Express / Prisma / MySQL 后端提供两套相互独立的内容：

- `USER_HOME`：用户端首页轮播，由运营后台单独配置。
- `AFFILIATE_HOME_NOTICE`：联盟营销首页带图公告轮播，由运营后台单独配置，可指向正式联盟公告及其可见任务。
- 联盟正式公告：具有独立版本、五语言正文、立即发布、定时发布、停用和历史回滚生命周期。
- 固定内容语言为简体中文 `zh-CN`、繁体中文 `zh-TW`、英语 `en`、日语 `ja`、韩语 `ko`。
- 首次录入一个语言时复制到五个语言版本；此后可以逐语言独立修改，也可以显式复制到全部语言。发布前校验五种语言完整性。
- 公共读取只返回当前语言、当前有效发布版本和公开安全标识，不暴露数据库数字主键。
- 轮播目标必须来自正式 Shop、Technician、Service、OfficialAnnouncement 或 AffiliateTask 记录；发布时重新校验目标状态和作用域。

本次没有把动态、聊天、Request 或其他领域内容改造成多语言，也没有新增 mock、浏览器业务数据库或正式模式 fallback。

## 2. 数据库与持久化

迁移：

- `backend/prisma/migrations/20260829090000_localized_carousel_publication/migration.sql`
- `backend/prisma/migrations/20260829093000_localized_carousel_permissions/migration.sql`

主要正式表：

- `official_announcements`
- `official_announcement_releases`
- `official_announcement_translations`
- `carousel_releases`
- `carousel_slides`
- `carousel_slide_translations`
- `content_publication_commands`
- `media_assets`
- `audit_logs`

`services.public_id` 用于 Service 的公开目标跳转；Shop、Technician、Service、Announcement 和 AffiliateTask 目标均由正式 repository 解析。发布版本不可就地改写，回滚会从历史版本创建更高版本；`source_release_id` 保留来源关系。发布命令写入 `content_publication_commands` 以支持幂等重放。

## 3. 正式 API

所有路径均位于 `/api/v1`，请求使用 JWT、Zod、统一响应 envelope 和 RBAC。

媒体上传：

- `POST /backoffice/content/media`

联盟公告后台：

- `GET|POST /backoffice/affiliate/announcements`
- `GET /backoffice/affiliate/announcements/affiliate-tasks`
- `GET /backoffice/affiliate/announcements/:publicId/history`
- `GET|PATCH /backoffice/affiliate/announcements/:publicId/releases/:releaseId`
- `GET /backoffice/affiliate/announcements/:publicId/releases/:releaseId/preview`
- `POST .../:releaseId/publish`
- `POST .../:releaseId/schedule`
- `POST .../:releaseId/disable`
- `POST .../:releaseId/rollback`
- `GET /affiliate/announcements/:publicId?locale=<locale>`

两种固定场景分别使用以下后台基路径：

- `/backoffice/content/carousels/user-home`
- `/backoffice/content/carousels/affiliate-home-notice`

每个基路径提供场景读取、`releases` 创建、`history`、`targets`、release 读取/替换、逐语言 PATCH、显式 `copy-to-all`、preview、publish、schedule、disable 和 rollback。客户端读取路径为：

- `GET /content/carousels/user-home?locale=<locale>`
- `GET /affiliate/content/carousel?locale=<locale>`

## 4. 权限与审计

内容权限：

- `page:backoffice-user-home-carousel`
- `button:backoffice-user-home-carousel-edit`
- `button:backoffice-user-home-carousel-publish`
- `page:backoffice-affiliate-announcement`
- `button:backoffice-affiliate-announcement-edit`
- `button:backoffice-affiliate-announcement-publish`
- `page:backoffice-affiliate-notice-carousel`
- `button:backoffice-affiliate-notice-carousel-edit`
- `button:backoffice-affiliate-notice-carousel-publish`
- `button:backoffice-content-media-upload`

`admin` 和 `operator` 具有相应运营写权限；`viewer` 只具有三个读取权限；联盟端公开读取仍需正式联盟市场权限。浏览器验收必须同时使用可写运营账号和只读账号验证 403，不得用前端隐藏按钮代替后端 RBAC。

审计动作包括：

- `content.media.uploaded`
- `content.affiliate_announcement.draft_created`
- `content.affiliate_announcement.locale_updated`
- `content.affiliate_announcement.metadata_updated`
- `content.affiliate_announcement.publish|schedule|disable`
- `content.affiliate_announcement.rollback_cloned`
- `content.carousel.draft_created`
- `content.carousel.draft_replaced`
- `content.carousel.locale_updated`
- `content.carousel.locale_copied_to_all`
- `content.carousel.publish|schedule|disable`
- `content.carousel.rollback_cloned`

成功激活由 `content_publication_commands.action=activate` 提供幂等证据；同表还记录 `create`、`publish`、`schedule`、`disable`、`rollback` 等命令。激活失败才通过 scheduler 的失败审计路径写入 `audit_logs`。审计只保存必要主体、目标和发布元数据，不记录密码、token、数据库凭据或银行信息。

## 5. 本地真实数据库 checker

运行前必须确认固定场景 `USER_HOME` 与 `AFFILIATE_HOME_NOTICE` 都没有任何未删除的 release。checker 会先查询这两个 scene；任一 scene 已存在 release 时立即 fail closed，且不会覆盖、归档或清理已有内容。请改用专用的空白 `needo_dev` 或 `needo_test`，不要为了运行 checker 删除业务内容。

命令：

```bash
ENV_FILE=/absolute/local/path/backend/.env.dev \
  npm --prefix backend run check:localized-carousel-publication-flow
```

脚本启动前要求显式存在的 `ENV_FILE`，且只接受：

- `NODE_ENV=development|test`
- `DEPLOY_ENV=local|test`
- 本机 MySQL 主机和显式允许的 `needo_dev|needo_test` 数据库
- 本机 Redis

数据库 pathname 会先执行 URL decode、Unicode NFKC normalize 和小写归一化，再压缩连接符检查任意 `prod`、`production`、`staging` 连写或编码变体；`needo_%70rod_dev`、`needoproduction_dev` 等均会被拒绝。它同时拒绝 production/staging 标志、远程 MySQL/Redis 和 allowlist 外数据库。实际安全函数调用完成前不加载 Prisma 或业务 service。输出数据库目标时移除用户名和密码。

每次运行只生成一个唯一 marker，并通过正式 Service/Repository 创建真实媒体、账号/身份、公开标识、Shop、Technician、Service、联盟身份、Wallet、AffiliateTask、公告及两种轮播版本。执行内容为：五语言首存、英语独立编辑、公告发布、两场景立即发布、定时激活、停用、历史回滚、五语言公开读取、目标对账和审计对账。

`finally` 只删除本次捕获的精确 ID 和媒体文件。所有 Service 命令和 scheduler 的 `actor_user_id=null` 激活命令都先通过本次唯一 idempotency key 捕获 command ID，再只按该 ID 删除；不会按跨表可碰撞的裸 `release_id` 删除。回滚版本的自关联先限定在本次 release ID 集合内置空，再按同一集合删除；没有空条件或全表 `deleteMany`。

完成前逐类核对 User、CustomerProfile、UserIdentity、PublicIdentifier、UserRole、Category、Shop、TechnicianProfile、Service、AffiliateProfile、Wallet、AffiliateTask、预算预留、任务店铺/服务关联、Announcement/Release/Translation、Carousel Release/Slide/Translation、MediaAsset、ContentPublicationCommand、AuditLog 的 captured IDs，并读取媒体文件确认物理文件不存在。任意一项非零都会使 checker 失败，不会输出 `cleanup: complete`。

2026-08-29 的实际本地目标经脱敏确认为 `development/local`、`mysql://127.0.0.1:3307/needo_dev`、本机 Redis；`/api/v1/health` 与 `/api/v1/ready` 均返回 HTTP 200。真实运行输出：

```text
PASS independent English announcement edit persisted
PASS both carousel scenes published
PASS historical release rolled back as a higher version
PASS scheduled successor activated
PASS published scene disabled
PASS all five localized public projections reconciled
PASS publication audit actions reconciled
PASS cleanup residue verification across all captured rows and media files: 0
status: ok
cleanup: complete
```

动态 marker 和 public ID 已在同一次运行的 `finally` 中删除，因此不是可用于浏览器验收的 seed ID。

## 6. 自动化证据

TDD 首次 RED：

```bash
npm --prefix backend test -- --runInBand \
  tests/localized-carousel-publication-flow-script.test.ts
```

最初 4 项失败，因为 checker 和 package command 尚不存在。实现后增加的 badge 长度及 release 自关联清理回归也分别先失败。安全 review 的修复先得到 6 个失败的 source/safety 契约和 1 个缺少 exact-ID helper 的真实 MySQL RED，再修复为 GREEN。

最终结果：

- checker 契约：1 suite / 18 tests，通过。
- exact command cleanup 真实 MySQL 回归：1 suite / 1 test，通过；同 numeric `release_id` 的异聚合命令被保留。
- 计划 focused backend：16 suites / 186 tests，通过。
- 计划 focused frontend：10 files / 149 tests，通过。
- 完整 backend：226 suites / 1,548 tests 通过；另有条件跳过 9 suites / 37 tests，其中包含默认关闭、只在显式本地 ENV_FILE 下运行的 exact cleanup integration。
- 完整 frontend：195 files / 1,113 tests，通过。
- `npm --prefix backend run lint`：通过。
- `npm --prefix backend run build`：通过。
- `npm run lint`：通过。
- `npm run i18n:quality`：退出 0；14,196 entries，四个目标语言缺失均为 0，spreadsheet error、英语 CJK 泄漏、韩语混合泄漏、繁简泄漏均为 0。报告保留仓库既有日语简体扫描 460 项和 same-as-source 41 项。
- `npm run i18n:audit`：信息审计退出 0；仓库级抽取结果为 11,547 个中文源、7,527 已覆盖、4,020 个既有未覆盖候选，不作为本微步骤新增五语言数据库内容的替代证据。
- `npm run verify:production-build`：通过；正式 bundle 审计为 8 个 HTML entries 和 22 个 assets。
- `git diff --check`：通过。

组件/API 测试和 checker 证明代码、正式 service、事务、数据库与清理边界，不证明实际页面视觉和交互已完成浏览器验收。

## 7. 实际浏览器验收

主代理在隔离服务 backend `3002`、frontend `5181`、MySQL `3307`、Redis `6379` 上完成验收，避免干扰主 checkout 的既有端口。`/api/v1/health` 与 `/api/v1/ready` 均为 200/ready。所有密码仅从 ignored 本地环境读取，没有写入文档、命令输出或浏览器存储检查。

实际路由：

- `/pf-admin.html#/admin/carousel`
- `/pf-admin.html#/admin/afirieito/announcements/carousel`
- `/user.html#/`
- `/user.html#/services/f2315c0a-a30c-11f1-b188-7c2544e7baed`
- `/afirieito.html#/afirieito`
- `/afirieito.html#/afirieito/announcements/96cf30ba-2bc0-4dbe-9259-2ea04948df61`

观察到的真实浏览器结果：

1. 运营后台存在两个分开的入口与编辑器：用户端首页轮播为 `USER_HOME`，联盟营销带图公告为 `AFFILIATE_HOME_NOTICE`；运营顶部导航显示“联盟营销 TEST”。
2. 用户轮播通过正式上传接口保存真实图片并选择正式 Service `#14 / AC Cleaning Diagnostics`。初始简体中文保存后，繁体中文、英语、日语、韩语都具有初始复制及来源提示；英语独立改为 `NeeDo Local Life Picks` 后，日语仍保持简体中文来源内容。
3. 用户轮播 preview 和立即发布成功。浏览器继续创建 v2、立即发布、停用 v2、从归档 v1 回滚生成 v3，再发布 v3；最终后台显示 `published v3 / disabled v2 / archived v1`。
4. 用户首页显示 `NeeDo 本地生活精选`，点击轮播进入真实 Service UUID 详情并显示 `AC Cleaning Diagnostics`。后端重启后点击“重试”，同一 v3 内容恢复，证明内容不是 localStorage 或静态数组。
5. 联盟后台正式发布公告 `联盟营销公测公告`；英语正文可独立修改，日语保留初始复制来源。独立联盟轮播发布后，联盟首页显示 `联盟营销公测现已开放`，点击打开正式公告详情及正文。
6. 联盟首页头部实际显示头像、`当前身份 · <NeeDo ID>`、`联盟营销`、`切换其他身份` 和任务搜索；身份选择页可见用户、技师、店铺、联盟营销，商户正式账号在用户与联盟营销身份之间切换无需重新登录。
7. 定时发布、scheduler 激活、Shop/Technician/Service/Announcement/AffiliateTask 全目标解析及 `claimable` 任务动作由第 5 节真实数据库 checker 完整执行。浏览器自动化无法可靠驱动 Chromium 原生 `datetime-local` 分段控件，因此没有把仅改变 DOM 值冒充为浏览器定时发布证据。
8. 只读验收使用已有平台身份账号，通过正式“账号管理”临时把角色从 `operator` 改为 `viewer`；页面可读取 `已发布 v3`，写入控件不可见，同时同一账号对正式 API 的读取为 HTTP 200、创建草稿和发布均为 HTTP 403 / code `40301`。验收后已通过正式界面恢复 `operator` 角色。为确认流程曾创建的临时普通账号也已通过正式界面软删除，没有留下额外可登录账号。
9. 人为停止 backend 后，在保持用户端会话的同一 SPA 中离开再返回首页：轮播区域显示“轮播内容读取失败 / 重试”，搜索、推荐内容和底部导航仍可用，没有进入 NeeDo root recovery page。重启 backend 后重试成功且轮播恢复。
10. 清洁页面重新检查用户首页、真实 Service 详情、联盟首页、联盟公告详情及运营轮播编辑器时，相关 console warning/error 都为 0。验收最初在 Service 详情发现 `Tokyo` 服务区域与标签重复导致 React duplicate-key error；已新增 `buildServiceTagLabels` 去重和回归测试，修复后重新打开详情页确认 console 为 0。

## 8. 回滚与延期范围

应用回滚：先通过正式 API 停用 `USER_HOME` 和 `AFFILIATE_HOME_NOTICE` 当前发布版本，再部署上一版应用。已发布行和审计仍保留用于追踪；不得重新启用旧浏览器 `homeCarouselStore`、静态数组或 localStorage 作为正式内容源。

数据库迁移为增量结构。已有正式内容后不得直接 drop 新表；如确需归档或删除，必须另行审批并提供迁移、备份和审计方案。

证据限定的延期领域：店铺/技师/服务全资料多语言、联盟人物/联盟组织介绍、联盟任务正文、规则/利用规约更广范围的统一发布，以及 Social、聊天、Request。它们必须分别沿用正式 API、五语言持久化和发布边界完成，不能由本轮播功能推断为已完成。
