# 排行筛选与完整列表本地修复

日期：2026-09-07。Step 12 微修复。仅本地，未推送、未部署。

## 原因与实现

`AnalyticsRankingPanel` 原本仅对 technician/customer 渲染分类筛选，
`AnalyticsRankingsSection` 未向 service 传分类；请求固定第一页，缺少完整列表入口。
现三类面板均使用正式启用分类，详情抽屉每页 10/50/100 条，继承大盘初始范围，可独立查询统计时间和城市，支持排序、
分类、重试、上下页，切换筛选回到第一页，取消/过期请求不会覆盖新结果。
实体详情继续在当前页面打开，关闭排行详情不改变大盘筛选与 URL。

## 本地运行定位

实际页面为 `http://127.0.0.1:5180/pf-admin.html#/admin`，代码目录为
`/Users/eason/Documents/New project/.worktrees/dashboard-remaining-acceptance`。
前端原 PID 10708，Vite 5180；后端 PID 7829（3000）及运营 PID 10926（3001），
均通过 lsof cwd 与进程命令核实。Vite 运营代理使用 `/ops-api/v1` → 本机 3001。
发现 Vite 返回旧版组件后，仅按原参数重启本地前端。

## 验收

- 失败测试先复现服务分类控件缺失及 section 未传分类，然后实现修复。
- 组件测试覆盖继承城市/自定义期间/分类/口径、21 条记录的分页、末页禁用、
  筛选归一页、详情回调、关闭保留大盘、旧响应丢弃与错误重试。
- 登录浏览器近 7 天正式服务榜返回 3 条：切换按摩分类返回空列表；恢复全部分类后
  返回 3 条。详情显示范围、总数、分类、金额、次数与 TEST 标记。
- 从详情记录打开服务 753，原有服务详情正常加载，URL 保持 `#/admin`。
- 全年真实数据触发既有 409 完成凭证不完整，三类排行一致；本次没有改写历史订单
  或放松校验。真实后续页浏览器验收受此数据问题限制，分页已由组件与后端回归覆盖。
- `npx vitest run src/features/dashboard src/pages/admin/DashboardPage.test.ts src/pages/admin/RankingEmbeddedDrawers.test.tsx src/api/backofficeRealData.test.ts`：14 个文件、97 项通过。
- `npm --prefix backend test -- --runInBand --runTestsByPath tests/analytics-ranking-api.test.ts tests/analytics-ranking.service.test.ts tests/analytics-ranking.repository.test.ts`：37 项通过。
- `npm run lint` 与最终 `npm run build` 通过；构建保留已有大 chunk 提示。
- 最终桌面与 390×844 窄屏验证通过，详情 scrollWidth/clientWidth 均为 379，
  无横向溢出；分类与完成次数排序有效，长名称/ID 可换行，浏览器尺寸已恢复。
- 关闭详情后大盘仍为近 7 天、全部服务类型及 GMV 排序。

## 回滚范围

仅恢复本次三个 dashboard 实现/翻译文件及对应两份测试和文档的差异；
不影响同时进行的退款 schema 工作，不需要数据库回滚。

后续时间/城市查询与页大小扩展验收见 [运营后台本地修复](2026-09-07-operations-ui-local.md)。
