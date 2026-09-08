# 运营发布时间线

运营后台 `/admin/operation-timeline` 展示当前运行环境的正式版本发布记录。列表按真实发布时间倒序排列，支持 10/30/50/100 条分页，并按东京自然日接受自定义开始、结束日期搜索。

## 数据来源

- 正式部署脚本在流量切换成功后调用 `record-release`，使用部署回执时间写入记录。Git commit 时间和构建时间不能代替发布时间。
- migration `20260907123000_release_publication_maintenance` 补录了 2026-09-07 JST 已有成功证据的五次 staging 发布。保存证据中仍为 `InProgress` 的 `243bc6d67c67` 未写入。
- 页面只查询服务端 `DEPLOY_ENV` 对应的环境，客户端不能通过参数读取其他环境。因而本地 `needo_dev` 的空列表不能说明 staging 没有数据。

## 手动维护

拥有 `backoffice:releases:write` 且当前身份为平台身份的管理员或运营人员可以手动添加记录。版本号、发布时间、更新内容和操作理由为必填，Git revision 可选。客户端生成 UUID 作为幂等键，环境由服务端决定。

手动记录和历史补录记录可以更正版本号与更新内容；原发布时间、部署标识和 Git 证据保持不变。修改使用 `lockVersion` 乐观锁，所有新增和更正都同步写入通用 `audit_logs` 和不可变的 `release_publication_revisions`。自动部署记录不可通过后台修改。

## API

- `GET /api/v1/backoffice/releases?page=1&pageSize=10&from=2026-09-01&to=2026-09-07`
- `POST /api/v1/backoffice/releases`
- `PATCH /api/v1/backoffice/releases/:id`

接口均要求 JWT、平台身份和对应 RBAC permission；列表分页，写入使用 Zod 严格校验，OpenAPI 路径包含实际 `API_PREFIX`。

## 本地验证

```bash
cd backend
npm run prisma:generate
npm run build
npm test -- --runInBand tests/release-publication.test.ts tests/release-publication-api.test.ts
DATABASE_URL=mysql://needo_dev:needo_dev_password@127.0.0.1:3307/needo_dev DEPLOY_ENV=local NODE_ENV=development ./node_modules/.bin/tsx scripts/check-release-publications.ts
```

数据库检查器只允许连接 localhost 的 `needo_dev` 或 `needo_test`，测试结束后清除临时发布、修订和审计记录。
