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
