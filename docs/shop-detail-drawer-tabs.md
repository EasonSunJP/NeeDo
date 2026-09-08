# 店铺详情抽屉双插页（Step 12）

运营后台店铺列表的「查看详情」使用「店铺 SaaS 情报」和「店铺展示」两个插页。默认显示 SaaS 情报，保留原有计费、人工锁定、封号、技师人数与集团合计字段。

店铺展示复用用户端 `UnifiedFormalStoreDetail` 的嵌入模式，调用现有公开 `GET /api/v1/shops/:id`，继续使用正式店铺投影、服务菜单、技师与展示组件的首页、环境、菜单、动态、情报、地图导航。加载与失败重试在抽屉内显示。未公开或不可用的店铺显示正式接口错误，不回退到演示数据。

集团账户按旗下店铺选择展示，集团 ID 不作为店铺 ID 请求。空集团显示无旗下店铺；切换账户或重新打开抽屉恢复 SaaS 插页，切换集团下的店铺重置内部展示状态。展示颜色映射到当前后台主题。

本次只改前端组合与翻译，没有新增接口、数据表、migration 或写入能力。既有工作目录存在其他未提交修改；本次从 main 提取独立分支，仅提交抽屉相关改动。

验证命令：

```sh
npx vitest run src/components/admin/MerchantAccountDetailDrawer.test.tsx src/pages/user/StoreDetailPage.test.ts src/pages/user/StoreDetailEmbedded.test.tsx
npm run lint
VITE_LEGACY_AUTHORIZATION='' VITE_LEGACY_AUTH_BASE_URL='' npm run build
```

默认构建会被本机配置中遗留认证变量触发的生产保护拒绝；验证构建只在进程环境中清空旧变量，保留原保护与环境文件。

原开发目录验证：5 个测试文件、51 项测试通过，包含真实展示组件的六插页切换与失败重试；类型检查和清空旧变量后的生产构建通过。本次变更仅用于本地提交与 main 集成；未推送或部署。

## 2026-09-07 正式浏览器补验

- 登录故障根因：本地管理员 `userId=1` 的 MySQL `sessionGeneration=3`，Redis 缓存版本为 `0`。正式服务在 `storeRefreshToken` 拒绝版本不一致后返回 `token_invalid`，与抽屉无关。
- 使用既有 `revokeAllRefreshTokens(1, 3)` 清理该账号已失效的刷新会话并对齐 Redis；写入 `auth.local_session_generation.reconcile_requested` 和 `auth.local_session_generation.reconciled` 审计。未修改密码、权限、数据库会话版本或认证保护逻辑。
- 本次配套前后端均来自当前工作目录，前端 `127.0.0.1:5297` 代理后端 `127.0.0.1:3001`。正式登录、`auth/me`、身份切换、商家账单列表、店铺 16 / 1 / 2 / 10 详情及预约导航均返回 200。
- Chrome 已完成 390×844 手机与 1440×1000 桌面检查：SaaS 原字段保留；六个展示插页可切换；集团从 Aoyama 切换 Roppongi 后店名、地址、地图同步；独立店铺无集团选择框；新开账户默认 SaaS 插页。手机抽屉 `scrollWidth=clientWidth=379`，无横向溢出。
- 截图保存在 `artifacts/shop-detail-drawer-qa-20260907/desktop.png` 和 `mobile.png`。临时浏览器尺寸已恢复。

## main 集成复验

基线为 `79b19471`。扩展检查 `masterDataPages.test.ts` 发现已有的商户人员页断言失败：测试期待 `backofficeRealDataApi.customers("merchant-admin", ...)`，但 main 的人员页已不使用该调用。已确认失败测试及被检查的人员页与 main 完全一致，本次不修改该模块。

隔离工作树的相关测试为 3 个文件、45 项通过，新增日语加载提示检查。复验依赖与 main 保持一致；原开发目录缺少 main 已声明的 zod，不能直接复用其完整 node_modules。

使用与 main 一致的依赖后，`npm run lint` 与清空遗留认证变量后的 `npm run build` 均通过；构建仅保留既有大体积 chunk 提示。合入队列由协调任务串行管理，未推送 GitHub、未部署。

## 2026-09-08 信息卡 / 列表双模式与店铺后台入口

- 店铺列表默认保持信息卡模式；账单摘要右侧新增信息卡和列表两个可访问的图标按钮。
- 列表按真实店铺展开集团，列为 ID、店名、创建者、地区、平台抽成、月费、状态、添加时间和详情。平台抽成按本期产品规则显示 `0%`；未加入代理商、级别、手机号、区域分成、利润、提现或营业额字段。
- 列表与信息卡共用原有正式账单数据和右侧详情抽屉。列表每行“详情”打开对应店铺；抽屉保留“店铺 SaaS 情报”和“店铺展示”。
- 抽屉新增“打开该店铺后台”。集团详情使用当前选择的旗下店铺，独立店铺使用自身 ID；新标签页进入现有只读代看，前端阻止非 GET 请求，后端再次按预览店铺 ID 校验并拒绝所有写入。
- Chrome 在隔离的本地运营和商户 API 代理上验收：新标签页保留运营页，Roppongi Recovery Lounge 的正式数据大盘加载成功；只读提示和写入拦截提示可见。另以 `390×844` 验证列表自动转为字段卡片，没有出现已排除字段。
- 本地接口实测向只读预览发送店铺 PATCH 返回 `40301 / error.merchant_preview.read_only`，未发生写入。
