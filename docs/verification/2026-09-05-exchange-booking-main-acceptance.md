# Exchange 匹配预约转换：本地 main 验收

日期：2026-09-05（Asia/Tokyo）。

## 合并结果

- 原 main：`055a6199199d8029570423104045358dfb28fd14`。
- 验证后的代码提交：`ede241793733e204b7d3e63b8568ab1f971e4421`。
- 已将 `codex/exchange-matched-booking-conversion` 快进合并到本地 main。
- `055a6199` 的官方通知 Prisma 模型修复已先同步到功能分支，Prisma 自动合并无冲突，两项功能的模型均保留。
- 最后的小修正包括 HashRouter 订单链接，以及“一次确认、每位入选服务者一张独立订单”的五语言说明。
- 合并前后未覆盖原有未跟踪的 `node_modules` 符号链接。未修改联盟营销功能文件，联盟营销退款相关开发继续暂停。
- 本轮没有远程推送、部署、生产迁移或新增本地 SQL 执行。既有预约转换 migration 的本地数据库验收见 README。

## 自动化验证

后端完整套件按四个互不重叠的 Jest 分片验证，所有分片退出码均为 0：

| 分片 | 通过套件 | 通过测试 | 跳过套件 | 跳过测试 |
| --- | ---: | ---: | ---: | ---: |
| 1/4 | 150 | 995 | 5 | 9 |
| 2/4 | 151 | 1,149 | 3 | 12 |
| 3/4 | 149 | 1,024 | 5 | 10 |
| 4/4 | 152 | 1,264 | 2 | 21 |
| 合计 | 602 | 4,432 | 15 | 52 |

跳过项保留仓库既有的集成测试门禁；不把它们计入通过数。最初误用不分片命令触发 Node 4GB 堆内存上限，随后改为分片并设置 `NODE_OPTIONS=--max-old-space-size=8192`，完整重新覆盖全部测试文件。第一分片完成后，剩余三个分片并行执行。

- 前端全量：374 文件、2,612 测试通过；最后的说明文案调整另经详情页 16 项及合并后 Exchange 39 项测试验证。
- 整合后的后端 lint/build、Prisma generate/validate 通过；前端 lint/build 通过。
- main 合并后的重点回归：后端 4 套件、89 测试；前端 4 文件、39 测试，均通过。
- `git diff --check` 通过。构建仍报告既有的大文件分块提示；未在本微步骤扩大打包重构范围。

## 正式浏览器验收

使用既有本地测试账号，经真实密码登录，在独立无头 Chrome 会话中复验已保存的 Demand `62` 和订单 `46540`（`ND202609042208537783`）。本轮只读取已有订单，没有重复创建预约或执行支付。

- 发布者 Admin2：匹配结果来自正式 API；创建按钮保持关闭；刷新后可从订单链接进入 `user.html#/orders/46540`。
- 入选技师 `s7325776482`：匹配响应只包含本人一条 Participant；不可创建预约；刷新后可进入 `technician.html#/technician/orders/46540`。
- 未入选技师：详情页不显示匹配卡或订单链接；请求匹配详情得到 HTTP 404。
- 发布者、入选技师均在 440×956 和 320×956 验证 `scrollWidth <= innerWidth`，没有页面 JavaScript 错误。
- 以上正向及反向检查均已在合并后的 main、`http://127.0.0.1:5180` 上重新通过。

## main 运行证明

运行工作树：`/Users/eason/Documents/New project/.worktrees/main-agent-admin-integration`，分支 `main`。

| 服务 | 端口 | 验收时 PID | 进程工作目录 |
| --- | ---: | ---: | --- |
| 前端 | 5180 | 14207 | main 工作树根目录 |
| client API | 3000 | 14208 | main 工作树的 backend |
| operations API | 3001 | 14210 | main 工作树的 backend |
| merchant API | 3002 | 14209 | main 工作树的 backend |

`5180/api/v1/ready` 返回 `code: 0`，服务为 `needo-backend`，MySQL 和 Redis 均为 `ok`。服务运行在独立后台 screen 会话 `needo-main-exchange-20260905` 中。

## 后续边界

本微步骤完成。匹配后双方取消、Exchange 发布费终态处理、服务款支付和结算仍需独立微步骤；本次没有自动实现这些功能。
