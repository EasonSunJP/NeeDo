# 运营实时数据大屏本地验收记录

验收时间：2026-09-06 23:37–23:49 JST
代码分支：`codex/operations-live-screen-frontend`
验收提交：`ee22ea68314761e22cd2823430f57294e57aad55`

## 验收边界

本记录只证明本地开发环境中的正式 MySQL、Redis、运营 API 与浏览器页面验收。它不代表远端推送、部署、生产 migration 或生产登录验收。

| 项目 | 状态 | 证据 |
|---|---|---|
| 本地实现 | 通过 | 独立 `/admin/live-screen` 页面、正式 snapshot/SSE、全国与都道府县地图、主题、全屏和自动滚动已提交 |
| 本地 migration | 已应用 | `20260906120000_live_dashboard_administrative_regions`，正式 checker 校验 migration checksum 通过 |
| 本地 N03 参考目录 | 已写入并通过 | `N03-20260101`：COUNTRY 1、ADMIN1 47、ADMIN2 1918、东京特别区 23 |
| 正式 MySQL/Redis 校验 | 通过 | JP、东京 `13`、新宿 `13104` 聚合、财务分离、缓存、SSE、隐私字段及回滚清理全部 passed |
| 本地浏览器验收 | 通过 | 5182 前端 + 3011 同分支运营 API，官方测试管理员真实登录，snapshot/SSE/地图资源均为 200，控制台 0 error |
| 远端 push | 未执行 | 本任务未推送 |
| 部署 | 未执行 | 本任务未部署 |
| 生产 migration | 未执行 | 仅本地开发库已应用 |

## 运行时证明

- 前端：PID `81271`，端口 `5182`，cwd 为功能 worktree 根目录。
- 运营 API：PID `75860`，端口 `3011`，cwd 为功能 worktree 的 `backend/`。
- 前端使用 `NEEDO_OPS_API_PROXY_TARGET=http://127.0.0.1:3011`，避免把功能分支页面接到其他 worktree 的 3001 运行时。
- 浏览器登录使用官方测试管理员 `adminb@lifedance.com`；凭据只从未跟踪的 `backend/.env.dev` 读取，未写入脚本输出、URL、`window.name` 或 opener。

## 正式数据验收

本地库最初已有 migration 表结构但缺少 N03 目录。为避免全量 seed 改动其他业务数据，本次只调用已存在且幂等的 `seedAdministrativeRegionCatalog()` 写入正式目录，再运行回滚型 checker：

```bash
FORMAL_BACKEND_ENV_FILE=/absolute/path/to/backend/.env.dev \
AUTH_TOKEN_AUDIENCE=needo-ops-api \
SERVICE_NAME=needo-ops-api \
LIVE_DASHBOARD_REDIS_URL=redis://127.0.0.1:6379 \
LIVE_DASHBOARD_CHECK_ROLLBACK=true \
LIVE_DASHBOARD_CHECK_RUN_ID=local-20260906-b \
npm --prefix backend run check:live-dashboard
```

Checker 结果：

- schema：migration/catalog/database checksum 一致；1 个 country、47 个 admin1、1918 个 admin2、23 个东京特别区。
- booking location：到店与上门订单生成 `N03-20260101` 不可变地点快照。
- regional aggregates：JP、东京、新宿完整 snapshot 与直接 MySQL 聚合一致。
- finance：JPY、NDP、Test NDP 与平台净收入保持分离。
- cache：三层范围、三个周期均完成 miss→hit；祖先 generation fence 生效。
- SSE：事件顺序、replay、cursor reset、5000ms retry、30000ms heartbeat 和隐私字段排除通过。
- cleanup：`database=clean`、`redis=clean`，无 marker 残留。

## 浏览器验收

### 路由、会话和布局

- 从运营数据大盘把统计期间改为 `month` 后点击“实时数据大屏”，新标签页精确打开 `/pf-admin.html#/admin/live-screen?country=JP&period=today`。
- 原页面 URL、`month` 筛选和值保持不变；新页 `window.opener === null`、`window.name === ""`，URL 不含 token。
- 页面没有运营后台侧栏或顶栏；1920×1080 与 2560×1440 的 `scrollWidth === clientWidth`。
- 日间与 `blue-black` 深色主题均完成截图和人工检查。

### 地图和实时状态

- 全国地图包含 47 个可聚焦区域，颜色按北海道、东北、关东、中部、关西、中国、四国、九州/冲绳分组，保留白色边界、日文名称与冲绳插图。
- 东京地图包含 23 个特别区；键盘依次选择东京与新宿后，URL 为 `admin1=13&admin2=13104`，新宿 `aria-pressed=true`。
- connected 控制帧按严格结构消费；安静 SSE 连接显示“实时连接正常”，不再发生连接成功后立即重连的循环。
- snapshot、SSE、全国地图和东京地图响应均为 200；`stale` 警告为 0，浏览器控制台 error 为 0。

### 6 分钟连接与请求频率

- 在页面进入稳定连接后连续观察 380 秒；期间既有大屏 SSE 没有重新建立，只有 5 分钟 reconciliation 产生 1 次 snapshot 200。
- 时钟每秒刷新和列表本地滚动没有触发任何额外 snapshot 或 SSE 请求。
- 模拟标签页隐藏期间请求增量为 0；恢复可见后精确产生 1 次 snapshot 200 和 1 条新的 SSE 200，没有 burst。
- 恢复后状态仍为“实时连接正常”，控制台 error 为 0。
- 正式 checker 另行创建并回滚隔离订单，验证两条严格排序 SSE 事件、successor replay、cursor reset、去重与隐私字段排除；浏览器长时观察不保留测试订单。

### 全屏

- 真实浏览器 Fullscreen API 的进入和按钮退出通过，按钮正确切换“进入全屏/退出全屏”。
- 拒绝 `requestFullscreen` 后显示“无法进入全屏，当前页面仍可正常使用”，画布仍可见。
- 无头 Chrome 不把 Playwright 合成的 `Esc` 当作浏览器级退出手势；本轮用 `document.exitFullscreen()` 做受控恢复。页面的 `fullscreenchange` 状态同步和按钮退出另有专项测试覆盖。

### 截图

- `/private/tmp/needo-live-screen-1920.png`
- `/private/tmp/needo-live-screen-tokyo.png`
- `/private/tmp/needo-live-screen-2560-dark.png`

## 自动化结果

- `npm run maps:jp:check`：47 prefectures、1918 municipalities、Tokyo 23 special wards、checksums 与 gzip budgets 全部通过。
- 前端大屏专项：11 个测试文件、73 个测试通过。
- 修复专项：SSE 控制帧、安静连接状态与地图插图 pointer-events 共 14 个测试通过。
- 后端大屏专项：13 个测试套件、122 个测试通过。
- 前后端 lint 通过。
- 前后端 build 通过；前端仅保留现有 Zod 注释、SocialProfilePage 混合导入和大 chunk 警告。
- `npm run i18n:audit` 退出码为 0；仓库级报告仍列出 7816 个既有 missing 项，不能表述为全仓翻译清零。本大屏新增文案已加入现有多语言表。

## main 合并复验

2026-09-07 00:10 JST 已将功能分支合并到本地 `main`，并在 `main` 工作树重新生成 Prisma Client、同步前端依赖后完成复验：

- 日本地图静态校验通过；前端相关范围 14 个测试文件、137 个测试通过，lint 与生产构建通过。
- 后端实时大屏 13 个测试套件、122 个测试通过，lint 与构建通过。
- 回滚型正式检查器使用独立 run id 再次通过 schema、订单地点快照、区域聚合、财务分离、缓存、SSE 与最终清理，数据库及 Redis 均无测试残留。
- 5180、3000、3001、3002 均由同一 `main` 工作树运行；三套 API 直连 health/ready 与 5180 代理 health 均通过。
- 5180 浏览器复验使用官方测试管理员真实登录；实时连接正常，全国 47 个区域、东京 23 区与新宿下钻通过，snapshot、SSE、地图资源全部为 200，控制台 error 为 0。
- 本次仍未执行远端 push、部署或生产 migration。

## 2026-09-07 响应式地图与日期轴复验

本次验收时间为 02:40–03:12 JST；功能分支 `codex/live-dashboard-responsive-map-controls`，最终实现提交 `941e3247`，验收口径文档提交 `b1887560`。本节仅证明本地实现和正式 API 浏览器验收；尚未将本次响应式变更合并到本地 main，未 push、部署或执行 migration。

### 自动化门禁

- `npm run maps:jp:search-index`、`npm run maps:jp:check`：1965 条搜索索引、47 都道府县、1918 市区町村、东京 23 特别区、校验和及 gzip 预算通过。
- 计划 Task 7 所列前端完整范围：16 文件、171 tests 通过（10.06s）；包括索引、搜索、导航、地图排布/缩放、趋势、响应式、页面、SSE状态和入口回归。
- 前端 `npm run lint`、`npm run build` 通过；795 modules，Vite 构建 10.76s。保留既有 Zod PURE 注释、SocialProfilePage 混合导入、大 chunk 警告。
- `npm run i18n:audit` 退出 0；最终汇总 source 15622、covered 7796、missing 7826。新增文案已进入翻译表，此结果不代表既有全仓缺失清零。
- 后端计划范围 7 suites、91 tests 通过（7.94s），lint/build 通过。本次后续前端修复与已测后端树完全相同（`git diff --quiet cbeaf6dc..HEAD -- backend` 退出 0）。
- feature worktree 后端首次缺少依赖，安装并生成 Prisma Client 后复测；sandbox 的 Prisma cache 与 Supertest 临时端口 EPERM 均经批准重跑通过，不是产品测试失败。

### 实际供应运行时

最终前端 5180 PID `30079`，运营 API 3011 PID `22383`，cwd 分别为本 feature worktree 根和 `backend/`。前端显式配置 `NEEDO_OPS_API_PROXY_TARGET=http://127.0.0.1:3011`，运营服务使用 `needo-ops-api` audience/service，正式本地 MySQL `needo_dev`（127.0.0.1:3307）和 Redis 6379（运营 session DB1、live dashboard DB0）。直连 3011 与 5180 `/ops-api/v1/` 代理的 health/ready 均 code0，数据库、Redis healthy；03:11 延迟存活复验通过。

原 5180 所在的 `dashboard-remaining-acceptance` checkout 已被其他任务切换为 `codex/order-refund-case-backend` @`39fe8751`，3000/3001 的后端树与本分支存在差异，因此保留其进程并使用本分支隔离 3011。未把异分支 API 当成本次同树证据；3002 不在本次运营页链路。

本地 Vite 曾在 cwd 正确时仍返回旧缓存模块。已仅重启本任务前端，并在最终矩阵之前直接验证 5180 供应的地图源码包含 `selectedCode: scope.admin2`、`focusedCode: activeCode`、`labelViewport`。旧缓存期间截图不计入最终结论。

Chrome skill 所需 `scripts/browser-client.mjs` 在本机缺失，因此本次使用独立 headless Chromium/Playwright，以官方测试管理员真实登录运营端；没有复用或宣称验证用户现有 Chrome profile、扩展或安装 PWA。凭据仅从现有未跟踪 env 私下读取，未写入日志或验收文件。

### 桌面与手机实测

下表每个桌面尺寸均测试 `classic-white-black` 与 `blue-black`，以及日本真实 7 日数据和新宿零值数据，共 20 个样本。全部 `scrollWidth === clientWidth`、`scrollHeight === clientHeight`、整页 transform `none`，控制台 0 error。

| 视口 | 地图绘图区高 px | 地图字形框高 px | 趋势基线到日期字形顶部间隔 px |
|---|---:|---:|---:|
| 1366×768 | 276.63 | 13 | 14.5 |
| 1440×900 | 371.94 | 13 | 18.1 |
| 1920×1080 | 480.91 | 13 | 22.6 |
| 2560×1440 | 761.70 | 13 | 33.0 |
| 1920×600 | 191.00 | 13 | 12.8 |

日本 47 名称与东京 62 名称在上述所有桌面尺寸完整显示，地图标签 CSS 字号 11px，实际字形框约 13px，不再随地图比例缩成小字。日间控件文字 rgb(16,19,26)，深色 rgb(245,247,255)，实际截图中的下拉、搜索、缩放控件均可读。趋势使用 `xMidYMid meet`，日期与绘图区分离；日本正式数据包含非零订单/JPY 支付曲线，新宿正式范围为零值曲线，没有替换 API 或注入假数据。

手机 320/390/440×844：document 宽分别为 320/390/440，scrollHeight 分别 2069/2074/2079；地图图形及其缩放控件隐藏，不留地图空占位，搜索、区域选择和所有数据面板保留，允许纵向滚动，横向无溢出，控制台 0 error。

### 地区交互、密集标签与刷新

- 全国搜索 `東京都`、`新宿区`、`13104`、`小笠原村` 返回完整路径；Enter 后分别到 admin1=13、admin2=13104、admin2=13104、admin2=13421，保留 period=last7days。级联选择日本→东京→新宿及清空下级一致；面包屑返回东京、日本通过。
- 缩放鼠标与键盘操作通过，范围 1–4，达到上下限禁用对应按钮；还原、切换层级自动还原通过。真实指针拖动改变几何变换，结束后标签重新对齐。
- 东京 62、冲绳 41 个名称真实 DOM 字形框重叠数均为 0；分别检查 37、33 条引导线，起点与正式静态地图行政锚点经当前变换后的误差均小于 0.1px。
- 北海道 1920×600 保留全部 195 个可聚焦区域路径，初始显示 111 名称；聚焦原隐藏 `01101` 后立即显示。1.5 倍缩放揭示此前隐藏的 `01608`、`01631`，两者锚点仍在当前可视地理范围内；提示 `109 / 195` 与实际 DOM 一致。缩放后视野变窄，总可见数不要求单调增加。选中 `01101` 后聚焦 `01102`，两者名称同时保留。
- 北海道拖动期间 DOM 几何持续变换而标签排布保持，pointerup 后重排；验证了延迟排布预览与结束对齐。搜索/焦点/缩放/拖动/还原业务请求增量均为 0；每次真实范围转换精确产生 1 snapshot 和 1 SSE。
- 更早同分支的 330.035 秒连续稳定观察仅出现 1 次 5 分钟 reconciliation snapshot、0 SSE 重建；最终修复后再次核对本地操作请求增量和范围切换计数一致。现有 60 秒合并失效与 5 分钟兜底节奏未修改。

### 证据位置与边界

最终矩阵 JSON：`/private/tmp/needo-responsive-qa/report.json`；北海道/引导线专项：`/private/tmp/needo-responsive-qa/hokkaido-report.json`；330 秒网络记录：`/private/tmp/needo-responsive-qa/network-report.json`；可复跑脚本：`/private/tmp/needo-responsive-qa.py`。

截图目录 `/private/tmp/needo-responsive-qa/`：`{classic-white-black,blue-black}-{1366x768,1440x900,1920x1080,2560x1440,1920x600}-{real,zero}.png`、`mobile-{320,390,440}.png`、`labels-13.png`、`labels-47.png`、`hokkaido-compact.png`。均为本机临时证据，不随仓库部署。
