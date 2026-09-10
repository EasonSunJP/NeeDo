# 设置首页关闭按钮与底部导航移除设计

## 目标

设置目录首页右侧显示 NeeDo 已有的通用关闭按钮，并且不再显示门户底部导航。左侧返回按钮继续保留。

## 范围

- 仅调整统一设置目录首页；设置子页的现有返回、关闭与底部操作不变。
- 用户、技师、商户与 Afirieito 设置入口复用同一行为。
- 关闭按钮返回当前身份的“我的”页面，并使用替换导航，避免关闭后通过浏览器返回再次进入设置页。
- 不改 API、持久化、RBAC、i18n 文案、主题 token 或业务数据。

## 组件设计

`PageScaffold` 增加可选的 `showBottomNav` 参数并原样传递给 `MobileShell`，默认值保持为 `true`，因此其他页面不受影响。

`SettingsHomePage` 固定向 `PageScaffold` 传递 `showBottomNav={false}`，并新增 `onClose`、`closeTo`、`closeLabel` 三个可选参数，转交给已有 `AppTopBar`。关闭按钮继续由 `AppTopBar` 的共享控制样式与 `close` 图标渲染。

`UnifiedSettingsPage` 为设置首页提供 `closeTo={getPortalMePath(portal)}`，使每个门户关闭后回到各自“我的”页面。

## 验收

- 设置首页头部同一行包含左侧返回、标题与说明、右侧通用关闭按钮。
- 用户、技师、商户、Afirieito 设置首页均不渲染底部导航，也不保留底部导航安全区占位。
- 关闭按钮分别返回 `/me`、`/technician/me`、`/merchant/me`、`/afirieito/me`。
- 定向测试、TypeScript 检查通过，并在移动视口验证设置首页。
