# 首页等级与 PWA 聊天输入区一致性设计

## 目标

修复用户首页头像等级与个人中心正式经验等级不一致、聊天表情/附件面板过矮，以及安装态移动 PWA 中输入区底边与首页主导航不一致并暴露空白的问题。

## 数据与组件边界

- 首页继续通过 `useCustomerSelfProfile` 读取正式客户资料，等级直接使用该资源已经映射的 `Customer.experienceLevel`，不再从评价 `activeScore` 推导。
- `ImChatComposer` 的表情与附件窗口继续共用 `.im-composer-panel`，以同一高度合同保证常规移动视口中至少容纳两排操作项；短视口允许面板按可用空间收缩并滚动，输入框不能被挤出可见区域。
- `useVisualViewportFrame` 分离可见视口高度与聊天房间定位高度。可见视口高度继续限制面板；安装态移动 PWA 在键盘关闭时让聊天房间使用 `top: 0; bottom: 0; height: auto`，与首页固定主导航共用底边。键盘开启时继续使用实时 `visualViewport` 像素边界。

## 异常与恢复

- 没有 `visualViewport` 或不是安装态移动 PWA 时保留现有动态视口行为。
- `pageshow`、可见性恢复与 viewport resize/scroll 重新计算边界，不新增轮询、遮罩或浏览器业务状态。
- 本次不改 API、数据库、migration、权限或远程环境。

## 验证

- 首页测试证明头像等级使用正式 `experienceLevel`，不再调用评价分数等级换算。
- composer 测试证明表情和附件面板共享双排高度合同，且短视口仍可收缩滚动。
- viewport 生命周期测试覆盖 iPhone/Android 安装态键盘关闭、键盘开启和恢复，并断言关闭时使用与主导航一致的底边锚定。
- 运行相关 Vitest、lint/typecheck、生产构建；需要浏览器布局复验时使用 5181 等空闲端口，不操作 5180。
