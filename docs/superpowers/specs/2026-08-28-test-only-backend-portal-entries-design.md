# 测试版后台入口隔离与新标签页设计

## 背景

身份切换页同时承载正式的前台身份切换，以及只用于当前本地/测试阶段的三个后台入口。现有后台入口配置、渲染和点击逻辑都位于 `src/features/settings/UnifiedSettingsPages.tsx`，点击通过 `window.location.assign()` 跳转，因此会覆盖当前前台页面。

## 已确认需求

- 后台入口继续在现有本地和测试环境中显示，本次不新增环境开关。
- 后台入口是临时测试能力，不得与正式前台身份切换逻辑继续混放。
- 商户后台、运营后台、NDA 管理后台均在新的浏览器标签页打开。
- 打开后台不能改变当前前台身份或当前页面。
- 以后移除该功能时，应只需删除一个独立组件、一个 import 和一个组件调用点。
- 不改后台鉴权、路由、入口地址或三个后台本身的实现。

## 方案比较

### 方案 A：独立测试组件，使用安全的新标签页链接（采用）

新增 `TestOnlyBackendPortalEntries.tsx`，将三个入口的配置、说明、列表行和链接行为完整收口。组件使用语义化 `<a>`，并设置 `target="_blank"` 与 `rel="noopener noreferrer"`。身份切换页只保留一个组件调用点。

优点是隔离最完整、浏览器行为原生、键盘和辅助技术可直接识别链接，未来删除范围最小。代价是测试入口行会拥有一小段仅供该临时组件使用的样式代码。

### 方案 B：只抽离入口配置和打开函数

把地址及 `window.open()` helper 放到单独文件，但继续在身份切换页渲染后台区块。

改动较少，但临时 UI 仍与正式身份切换耦合，未来删除仍需在主页面里清理多处代码，不符合“容易整块删除”的目标。

### 方案 C：原文件内改为 `window.open()`

保留现状，只把 `window.location.assign()` 改为 `window.open()`。

能解决新标签页要求，但没有形成测试能力边界；而且脚本打开窗口的语义与可访问性不如真实链接清楚。

## 组件边界

新增文件：

- `src/features/settings/TestOnlyBackendPortalEntries.tsx`
  - 私有保存三个后台入口配置。
  - 渲染完整“后台入口”区块。
  - 每行使用新标签页链接。
  - 继续接收现有翻译函数，保持当前多语言行为。

修改文件：

- `src/features/settings/UnifiedSettingsPages.tsx`
  - 删除后台入口配置和 `openBackendPortal()`。
  - 导入并渲染 `<TestOnlyBackendPortalEntries t={t} />`。
  - 前台身份切换、申请、审核状态和正式 API 调用保持不变。

## 链接与安全行为

三个目标地址保持现状：

- `/store-admin.html#/login/merchant-admin`
- `/pf-admin.html#/login/admin`
- `/afirieito-admin.html#/NDA-admin`

每个链接必须同时具备：

- `target="_blank"`：新标签页打开。
- `rel="noopener noreferrer"`：新页面不能通过 `window.opener` 操作前台页，并避免发送不必要的来源信息。
- 明确的 `aria-label`：包含“进入后台”和目标后台名称。

当前前台标签页不导航、不刷新，也不调用身份切换 API。

## 测试与验收

采用测试先行：

1. 先新增组件测试，断言三个链接的地址、`target` 和 `rel`；在组件不存在时确认测试按预期失败。
2. 实现独立组件并让测试通过。
3. 更新身份切换页测试，断言主页面只挂载独立组件，且不再包含 `window.location.assign()` 或内联后台入口配置。
4. 运行定向 Vitest、完整前端测试、TypeScript lint 和 formal build。
5. 启动本地页面，在身份切换页逐个点击三个入口，确认新标签页打开、原标签页仍停留在身份切换页，并检查桌面及截图所示手机宽度的布局。

## 非目标

- 不把入口限制到静态演示模式。
- 不新增新的 Vite 环境变量或 feature flag。
- 不改变前台身份切换规则。
- 不自动赋予或绕过任何后台权限。
- 不删除后台页面或路由。
