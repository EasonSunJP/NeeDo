# 首页等级与 PWA 聊天输入区一致性设计

## 目标

修复用户首页头像等级与个人中心正式经验等级不一致、聊天表情/附件面板过矮、安装态移动 PWA 中输入区底边与首页主导航不一致，以及 Android Chrome 旧内核白色描边/聊天列表背景断层、iPhone Safari 键盘态输入区留缝和 Android 9 低性能设备首登/滚动卡顿的问题。

## 数据与组件边界

- 首页继续通过 `useCustomerSelfProfile` 读取正式客户资料，等级直接使用该资源已经映射的 `Customer.experienceLevel`，不再从评价 `activeScore` 推导。
- `ImChatComposer` 的表情与附件窗口继续共用 `.im-composer-panel`，以同一高度合同保证常规移动视口中至少容纳两排操作项；短视口允许面板按可用空间收缩并滚动，输入框不能被挤出可见区域。
- `useVisualViewportFrame` 分离可见视口高度与聊天房间定位高度。可见视口高度继续限制面板；安装态移动 PWA 在键盘关闭时让聊天房间使用 `top: 0; bottom: 0; height: auto`，与首页固定主导航共用底边。键盘开启时用实时 `visualViewport` 计算上、下边界并以 `height:auto` 拉伸，避免 Safari 地址栏/键盘动画期间固定像素高度和布局视口错位。
- 所有正式 HTML 入口声明 `interactive-widget=resizes-content`，让支持该策略的 Chromium 在软键盘出现时原生同步 Layout 与 Visual Viewport。iOS WebKit/PWA 存在 `visualViewport` 高度与偏移恢复异常，因此仍由 hook 负责双边锚定和恢复；不采用会主动允许键盘覆盖页面的 VirtualKeyboard overlay 模式。
- Android Chrome 旧内核若不支持 `color-mix()`，边框颜色声明会整体失效并露出 Tailwind 浅色默认值，聊天玻璃背景也会露出父级高饱和渐变。仅在 `@supports not` 分支提供主题线色和聊天页纯色背景回退；支持 `color-mix()` 的现代浏览器保持现有视觉。根节点同时同步主题的 `color-scheme`，让可控的浏览器/系统底部色跟随明暗主题。
- Android 9 或浏览器报告低内存/低并发能力时，在启动阶段写入 `data-needo-performance-profile="reduced"`。该模式不减少业务数据，只关闭持续宠物动画及约 14MB 动画资源的自动预解码，缩短首登过场的固定等待并将同步图片解码改为异步，同时关闭 GPU 密集的玻璃模糊、大阴影和长动画。现代 Android 继续使用完整效果。

## 异常与恢复

- 没有 `visualViewport` 或不是安装态移动 PWA 时保留现有动态视口行为。
- `pageshow`、可见性恢复与 viewport resize/scroll 重新计算边界，不新增轮询、遮罩或浏览器业务状态。
- 本次不改 API、数据库、migration、权限或远程环境。

## 验证

- 首页测试证明头像等级使用正式 `experienceLevel`，不再调用评价分数等级换算。
- composer 测试证明表情和附件面板共享双排高度合同，且短视口仍可收缩滚动。
- viewport 生命周期测试覆盖 iPhone/Android 安装态键盘关闭、键盘开启和恢复，并断言关闭时使用与主导航一致的底边锚定。
- iPhone Safari 测试断言聊天房间的上下边界之和精确落在可视视口，Android 兼容测试断言旧内核回退不再产生白色边框或聊天背景断层。
- HTML 入口测试断言正式页面同时保留 `viewport-fit=cover` 与 `interactive-widget=resizes-content`。
- 性能测试以 OPPO Reno A / Android 9 UA 验证 reduced 判定，验证现代 Android 不被误降级，并检查宠物资源、过场与高成本 CSS 的接线。
- 运行相关 Vitest、lint/typecheck、生产构建；需要浏览器布局复验时使用 5181 等空闲端口，不操作 5180。
