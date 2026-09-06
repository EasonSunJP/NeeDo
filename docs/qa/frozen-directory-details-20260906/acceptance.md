# 用户与员工列表：冻结详情列

2026-09-06。用户指定：后台用户、员工列表最右侧详情改为胶囊按钮，并冻结该列，方便窄屏打开详情抽屉。

## 实现范围

基于 main `f3f6fd0e`，独立分支 `codex/frozen-directory-details`。

- 运营与商户统一用户表格：复用现有 Button 的圆角胶囊样式，保留原用户 ID 和详情回调；最右侧表头、单元格均冻结。
- 商户员工及既有用户资料表格：通过 DataTable 的可选 `frozenDetailLabel` 启用单个“详情”按钮和冻结列。默认表格不受影响。原查看、编辑均指向同一抽屉，此处合为单个明确入口。
- 右侧列宽 104px，`sticky/right:0`，表头高于正文，按钮高 32px。底色在主题色下叠加实色背景，避免商户半透明主题透出后方文字；分隔阴影使用现有主题变量。
- 保留列表筛选、分页、抽屉内容和权限路径。手机员工列表沿用卡片布局，提供胶囊详情按钮；用户表格在窄屏继续横向滚动并保持右侧详情可见。
- 使用现有“详情”翻译，没有新增 API、migration 或业务数据写入。该 UI 微步骤不加入 technician work-status 纯补丁。

## 验证

- 开始前现有 UnifiedUserDirectory 测试通过。
- UnifiedUserTable、UnifiedUserDirectory、UserListPage：3 文件 / 9 tests 通过。
- 最终 `npm run build` 通过，保留既有大包体积提示；`git diff --check` 通过。
- 真实登录页面登录运营与商户测试账号，实际检查三类列表：运营用户、商户用户、商户员工。
- 1024px 视口：用户列表滚动 417px、员工列表滚动 163px 后，详情列右边界均保持 x=1003px；按钮圆角 9999px、高 32px；不透明底色验证通过。
- 三类列表点击详情均成功打开正式资料抽屉；390px 抽屉均无页面横向溢出。
- 另从 390px 列表直接点击：运营用户详情按钮 x=285px、宽 50px，员工卡片按钮 x=41px、宽 308px；均位于屏内且能打开详情，无读取失败或横向溢出。
- 首次截图发现商户主题底色 alpha 为 0.84，已增加同主题实色底层并重启验收环境；最终截图和浏览器断言均使用修正后的样式。

## 运行与集成边界

验收前端 `http://127.0.0.1:15182`，主 API 13320、运营 API 13321、商户 API 13322。监听 cwd 已核实均属于本分支，数据库和 Redis 的 ready 检查通过。使用当前 main 正式分角色 API 启动配置；不覆盖其他任务的 5180/3000 或技师状态 15180 预览。

用户随后明确授权验证后合并 main。功能提交 `1cfbd266` 已快进合入本地 main；合并后在 main 重跑 3 文件 / 9 tests 及 `npm run build -- --mode formal` 均通过。未推送或部署。回滚仅需撤销这五个 UI 文件的差异，无数据库回滚。node_modules 为本地运行依赖，不纳入提交。

截图：[运营用户](operations-users.png)、[商户用户](merchant-users.png)、[商户员工](merchant-staff.png)、[390px 用户列表](operations-users-mobile-list.png)、[390px 员工卡片](merchant-staff-mobile-list.png)、[390px 员工详情](merchant-staff-narrow-drawer.png)。


## 合并后的运行核对

2026-09-06 19:17 JST，只读请求 5180 的 UnifiedUserTable/DataTable 模块仍得到不含冻结详情列的旧缓存。因此 Git 合并成功不等同于 5180 已显示新 UI。本任务未停止跨任务服务：5180/3000 的 cwd 为 main 工作区，但 3001 为另一个会员任务的 backend。已交由运行环境协调任务统一核对代理并刷新前端；本功能实际浏览器验收地址仍为 15182。

技师 work-status 是独立功能，未因本 UI 合并而自动合入。其前置通知模块尚在修复，由通知任务自行完成验收及 main 集成，再依次处理 SOS、work-status；禁止合并含其他任务改动的 `22a2e32b` 快照。
