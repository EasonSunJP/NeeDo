# NeeDo 多语言轮播与联盟公告正式发布

> 本地验收日期：2026-08-29（Asia/Tokyo）
>
> 范围：用户端首页轮播、联盟营销首页带图公告轮播、联盟正式公告
>
> 状态：自动化与本地真实数据库 checker 已通过；实际浏览器验收由主代理独立执行，本文不把组件测试等同于浏览器验收

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

## 7. 浏览器交接

前置服务：backend `3000`、frontend `5180`、MySQL `3307`、Redis `6379`；health 和 readiness 都必须为 200/ready。账号使用：

- 可写运营账号：本地正式 seed 的 `admin@lifedance.com`，密码只从 ignored 本地环境读取，不写入文档或命令。
- 只读账号：任一真实账号必须在数据库中正式绑定 `viewer` 角色；如果当前 fixture 没有该账号，先由正式管理流程创建/分配，不得临时绕过 permission。
- 客户端：一个可正式登录的 customer 身份。
- 联盟端：一个已正式开通 Affiliate/scout 身份且具有联盟市场读取权限的账号。

内容目标必须已有有效公开 Shop、Technician、Service 和可见 AffiliateTask。Task 12 checker 数据已精确清理，所以浏览器没有必须复用的 checker public ID；创建内容时通过后台正式 picker 选择当前本地有效记录。

验收路由：

- `/pf-admin.html#/admin/carousel`
- `/pf-admin.html#/admin/afirieito/announcements/carousel`
- `/user.html#/`
- `/afirieito.html#/afirieito`
- `/afirieito.html#/afirieito/announcements/:announcementPublicId`

主代理逐项验收并保留截图/API/console 证据：

1. 用户轮播后台创建并发布 `USER_HOME`。
2. 联盟后台创建正式公告并发布独立的 `AFFILIATE_HOME_NOTICE`。
3. 首次日语输入出现在五个草稿页签；独立修改英语后日语不变。
4. preview、立即发布、定时发布、停用、历史回滚都发出真实 API 请求且结果正确。
5. 用户首页轮播位于提醒和快捷操作之间；Shop、Technician、Service 分别打开真实详情。
6. 联盟营销首页显示独立公告轮播；公告详情可打开，任务按钮只在服务端返回 `claimable=true` 时出现。
7. 刷新、退出再登录和 backend 重启后内容仍在。
8. `viewer` 可以读取，但编辑和发布由后端返回 403。
9. API 失败时首页其他功能仍可使用，不进入 root recovery page。
10. 最终相关浏览器 console warning/error 数为 0。

截至本文首次提交，上述浏览器步骤尚未由本 Task 12 子任务执行，不得标记为已通过。

## 8. 回滚与延期范围

应用回滚：先通过正式 API 停用 `USER_HOME` 和 `AFFILIATE_HOME_NOTICE` 当前发布版本，再部署上一版应用。已发布行和审计仍保留用于追踪；不得重新启用旧浏览器 `homeCarouselStore`、静态数组或 localStorage 作为正式内容源。

数据库迁移为增量结构。已有正式内容后不得直接 drop 新表；如确需归档或删除，必须另行审批并提供迁移、备份和审计方案。

证据限定的延期领域：店铺/技师/服务全资料多语言、联盟人物/联盟组织介绍、联盟任务正文、规则/利用规约更广范围的统一发布，以及 Social、聊天、Request。它们必须分别沿用正式 API、五语言持久化和发布边界完成，不能由本轮播功能推断为已完成。
