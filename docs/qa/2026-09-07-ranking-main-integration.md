# 排行筛选与详情：本地 main 集成

本次仅集成 Step 12 排行榜微修复，不推送、不部署。

## 来源和范围

来源提交：`private` 分支 `d73f7e66e182f10379898018f7806c4f35cf2acd`。
该提交包含四项功能及 staging 脚本；本次只提取排行相关补丁，不合并整条 private 历史。
集成前共享 `main` 为 `79b194715709f65abef0001bce8c39098f7c87d6`，工作区干净。

- 服务、技师、用户消费三类排行都有服务类型筛选和完整列表详情入口。
- 详情继承大盘初始查询，可独立选择统计期间、自定义起止日期、城市、服务类型、排序口径。
- 每页选择 10、50、100 条，筛选变化回到第一页；过期响应不会覆盖当前结果。
- 关闭排行详情保留大盘查询，实体记录仍使用当前页面已有详情抽屉。
- 正式 API、前端响应投影和 OpenAPI 的每页上限同步为 100，页码上限保证安全整数。
- 沿用真实订单凭证、权限、历史服务快照、后端排序及读取审计，没有 schema 或 migration 变更。

时间线、轮播编辑、用户列表抽屉刷新修复和部署钩子不在本次 main 提取范围。
因此原混合提交本身不会成为 main 祖先；以独立排行提交及文件内容比较确认包含关系。

## 验证命令

前端：`npx vitest run src/features/dashboard src/pages/admin/DashboardPage.test.ts src/pages/admin/RankingEmbeddedDrawers.test.tsx src/api/backofficeRealData.test.ts src/api/backofficeDashboard.test.ts`。

后端：`npm test -- --runInBand --runTestsByPath tests/analytics-ranking-api.test.ts tests/analytics-ranking-openapi.test.ts tests/analytics-ranking.repository.test.ts tests/analytics-ranking.service.test.ts`。

两端分别执行 `npm run build`；后端修改模块与测试执行定向 ESLint，最后执行 `git diff --check`。
后端额外覆盖真实 createApp 路由接受 10/50/100 条并传递城市、分类到仓库。

本次验证的是共享 main 源码和构建，不代表重新完成浏览器登录验收或远端部署验收。

## 结果

前端 14 文件 / 100 项通过；后端 4 套 / 43 项通过。前后端构建、后端定向 ESLint、
`git diff --check` 均通过。前端构建保留既有大 chunk 提示。
日志：`/tmp/needo-ranking-main-ui.log`、`/tmp/needo-ranking-main-backend.log`、
`/tmp/needo-ranking-main-frontbuild.log`、`/tmp/needo-ranking-main-backbuild.log`。

11 个排行文件与来源提交内容完全相同。排行 repository 仅提取分页上限变更，
保留 main 既有金额公式；OpenAPI 仅提取排行参数变更；API 测试额外增加三个分页用例。

## 补充：旧分页测试边界

额外回归在 `src/api/backofficeDashboard.test.ts:300` 复现一项失败：旧测试仍要求
`pageSize=11` 在发出请求前被拒绝。正式合同已经扩为 1..100，11 是合法请求，
未提供有效响应的测试 mock 导致后续投影报 `error.api`。业务实现符合新合同。
仅把非法测试边界改为 101，并将合法请求/响应契约参数化为 10、11、50、100。
修复前该文件 72 项通过、1 项失败；修复后连同相关前端回归共 15 文件 / 176 项通过。
复现及回归日志：`/tmp/needo-ranking-boundary-red.log`、`/tmp/needo-ranking-boundary-green.log`。
后端排行 4 套 / 43 项重跑通过，前端构建与 `git diff --check` 通过；日志为
`/tmp/needo-ranking-boundary-backend.log`、`/tmp/needo-ranking-boundary-build.log`。
