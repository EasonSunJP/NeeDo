# 技师状态同步与考勤验收

> 最新 main 语义集成验证见 [最新集成验收](main-integration.md)。下文为历史独立环境记录。

> 后续状态：功能已集成主工作区，并在本地共享数据库应用三条 migration。最新验证和运行地址见 [主工作区集成验收](local-integration.md)；本文保留首次独立环境验收的历史边界。

2026-09-06。独立分支 `codex/technician-work-status`；基线快照 `22a2e32b9d380d0d8e34541da59fec1d6128d547`。快照包含创建工作区前已有的未提交代码；后续集成仅使用本次功能提交的差异，不能把快照中的其他任务改动重复合入。

## 实现

- 出勤、移动中、休息、退勤写入正式状态、不可变事件及审计；CAS 防覆盖，命令幂等防重复。
- 服务按钮先读取当前实际服务订单，包括跨午夜服务，然后打开正式订单履约页面；服务状态由正式开始/结束/自动到期事务同步。
- 排班义务来自 SHOP 排班，个人可预约时间不作为出勤要求。排班与预约迟到分别计为不同义务；严格超过即异常，展示原始计划/实际时间和偏差秒数。
- 同一义务的迟到/早退只计一次。补到岗和补开始服务追加结清事件；预约改期后仍按已记录的异常基准结清。早退确认保存原因和受影响预约快照；班段内多笔预约不重复增加早退次数。
- 从功能启用时刻开始检测，不凭空追溯旧数据。后台工作器在没有打开页面时检测；三端读取同一状态，以 SSE 提示刷新，并有前台轮询、重连和重新进入恢复。
- 商户需当前门店从属关系；跨店订单详情、原因和关联预约按门店范围隐藏。运营使用正式权限与身份，不绕过 RBAC。
- 月度卡片与明细来自同一异常事实集合，列表分页；今日/近7天/近30天/本周/本月/今年/自定义日期均按东京时区、后端 UTC 半开区间查询。全部/迟到/早退可筛选。
- 三端复用 ContactEventTimelinePanel 的时间、节点、头像/系统图标和气泡布局；异常红色，普通事件跟随当前主题。补充记录走正式 API，刷新后仍保留。五语言文案已补齐。

## API 与数据库

配置的 `/api/v1` 前缀下：

- 技师 `/technician-work-status/me`：GET/PATCH；GET `/events`；POST `/comments`。
- 运营 `/backoffice/technicians/:id/work-status` 与商户 `/merchant-admin/technicians/:id/work-status`：GET、GET `/events`、POST `/comments`。
- 服务状态变更沿用原有正式订单开始/结束接口。
- OpenAPI：`backend/src/api/work-status.openapi.ts`；Zod、权限、分页及身份范围均由正式路由/服务执行。
- 两条新增 migration：`20260906190000_technician_work_status`、`20260906200000_work_status_affected_orders`。新增独立状态、事件、异常、启用时间、受影响预约快照表，无财务罚款或历史批量回填。
- MySQL 必须使用 UTC。既有 migration 的 CURRENT_TIMESTAMP 遵循该前提；本次隔离 mysqld 初始继承 JST，已只在隔离环境对齐 UTC 和新建夹具时间。已应用 migration 未被改写。

## 自动验证

实际退出码均为 0：

- 前端：9 个定向测试文件、67 项测试通过；包含状态写入成功/失败、早退确认/修改原因重试、最新服务导航、延迟响应版本保护、日期边界、月度卡片筛选和时间线链接。
- 后端 API/domain/service：4 suites / 27 tests。
- 后端 service/fulfillment/expiry：3 suites / 56 tests，含四项独立审查回归。
- 跨午夜实际服务订单与商户范围：1 test。
- 既有 affiliation/backoffice/expiry 定向回归：3 suites / 29 tests；与上述有重叠，不相加为总数。
- 前后端 build、前端 TypeScript 检查、后端所有改动文件 ESLint、git diff --check 通过。前端构建仍有既有大包体积提示。
- Prisma generate 使用本 worktree 私有 backend node_modules。
- `ENV_FILE=<isolated-test-env> npm --prefix backend run check:work-status-flow`：真实 Prisma/MySQL 事务验证严格时间边界、个人排班排除、工作器去重、结清、CAS、重试、早退预览无写入、月度计数、分页/时间筛选、跨店隔离、运营身份别名、评论、审计、关联两笔预约及最终回滚无夹具残留。
- 独立代码审查的 8 项发现全部修复并复核关闭。

## 浏览器实测

使用正式 seed 账号，在隔离 MySQL/Redis 上通过真实登录 UI 登录三端，没有注入虚假 API 或权限。

- 技师出勤按钮成功，商户员工列表和运营月度卡片约 0.34 秒内显示出勤。
- 当时排班/预约迟到共 2 次；提前退勤确认展示 3 笔受影响预约，提交后早退为 1 次，三端显示退勤。另一预约随后超过时间，工作器使迟到增至 3 次，符合零宽限规则。
- 运营和商户详情刷新后都保留早退关联订单；运营“早退”筛选只返回 1 条早退事实，迟到筛选正常。
- 自定义 2020-01-01 至 2020-01-02 返回空列表。
- 技师补充记录提交并重新载入页面后保留。
- 浅色/深色时间线均检查；技师 390px 宽无横向溢出，运营窄屏明细已截图检查。
- 已证明预览前端/后端监听 cwd 为该 worktree 和其 backend，health/ready、前端代理及延迟存活通过。
- Vite 既有规则忽略 `**/.worktrees/**`，初次热更新未刷新新文件。已重启本次独立预览，并直接核对实际返回的源模块后重跑最终 UI 验收。

截图：[运营时间线](operations-timeline.png)、[商户时间线](merchant-timeline.png)、[技师窄屏](technician-narrow.png)、[运营窄屏明细](incident-list-narrow.png)。

## 运行及集成边界

隔离预览前端为 `http://127.0.0.1:15180`，后台为 13318，隔离 MySQL 为 13317，隔离 Redis 为 16389。这些仅为本次验收参数，不是产品硬编码。原有 5180/3000 运行目录及共享数据库没有切换。

完整新库迁移链在原有 `20260906100000_booking_sos` 失败：MySQL 3823，`sos_alerts_lifecycle_check` 引用的 `resolved_by_identity_id` 与 FK SET NULL 冲突。本任务未修改该迁移。为独立核验本功能，另建临时库，从本任务之前 Prisma schema 建基线，再实际应用本次两条增量 migration；DDL 与真实事务检查通过。该结果不代表完整仓库迁移链已修复。

本次仅保存独立本地功能提交；没有切换共享运行目录，没有向远端推送、部署或对共享数据库执行 migration。集成前应先处理既有迁移链问题并确认数据库 UTC。后台每位技师的启用后义务/历史仍会重读，未宣称高容量压力验收。
