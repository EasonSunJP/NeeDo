# 店铺列表正式字段与详情读取实施记录

1. 为 `Shop` 增加可空创建人外键与 migration，接通运营创建和申请审核创建两条写入路径。
2. SaaS 列表投影返回 `createdBy` 与服务端固定的 `platformCommissionRatePercent`。
3. 增加受 RBAC 保护的单店 SaaS 详情接口、Zod 路径校验、审计和 OpenAPI。
4. 前端列表使用正式字段，详情抽屉按集团或单店刷新并提供失败重试。
5. 使用 schema、API、OpenAPI、组件测试、类型检查和前后端构建验证。功能分支曾因落后于并行合入的 release migration 而出现历史差异；变基并合并最新 `main` 后，Prisma 只报告本次 migration 待应用。标准 `prisma migrate deploy` 已在本机 `needo_dev` 成功执行，字段、索引、外键及 migration 完成记录均已独立核对。

本地隔离运营 API 使用正式管理员登录后，商家账单列表和 `GET /api/v1/backoffice/shops/553/saas-account` 均返回 200。列表与详情都包含 `createdBy` 和 `platformCommissionRatePercent: 0`，并返回同一店铺 ID；历史店铺的创建者按设计为 `null`。详情读取生成了 `backoffice.shop_saas_account.read` 审计记录。验收服务已停止。

迁移不回填历史创建者，避免把负责人或审核人错误当作建档操作人。所有操作限定本地环境，不推送、不部署。
