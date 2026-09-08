# 店铺列表正式字段与详情读取实施记录

1. 为 `Shop` 增加可空创建人外键与 migration，接通运营创建和申请审核创建两条写入路径。
2. SaaS 列表投影返回 `createdBy` 与服务端固定的 `platformCommissionRatePercent`。
3. 增加受 RBAC 保护的单店 SaaS 详情接口、Zod 路径校验、审计和 OpenAPI。
4. 前端列表使用正式字段，详情抽屉按集团或单店刷新并提供失败重试。
5. 使用 schema、API、OpenAPI、组件测试、类型检查和前后端构建验证。`needo_dev` 仅有本次 migration 待应用，但数据库含当前工作树缺失的已应用 migration，自动审批拒绝直接 deploy；本次不手工绕过，也不把 migration 文件误报为已物理应用。

迁移不回填历史创建者，避免把负责人或审核人错误当作建档操作人。所有操作限定本地环境，不推送、不部署。
