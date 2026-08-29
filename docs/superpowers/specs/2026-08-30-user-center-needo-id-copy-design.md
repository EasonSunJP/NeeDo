# 个人中心 NeeDo ID 点击复制设计

## 目标

在用户端个人中心 `/me` 中，用户点击展示为 `ID {publicId}` 的整行后，系统自动把真实可用的公开 NeeDo ID 写入剪贴板。界面前缀 `ID` 和它后面的空格仅用于显示，不得进入剪贴板。

## 方案选择

采用语义化整行按钮并直接调用浏览器 Clipboard API。

- 不给现有 `<p>` 只增加 `onClick`，因为那会缺少原生键盘操作语义。
- 不复用链接分享工具，因为本次复制的是公开账号标识，不涉及分享 URL、系统分享或分享计数。
- 复用个人中心已有的 toast 状态显示成功和失败反馈，不新增第二套提示组件。

## 交互与数据流

1. 个人中心继续从正式 `GET /api/v1/customer-profile/me` 数据映射出 `currentCustomer.systemId`。
2. 页面仍显示 `ID {currentCustomer.systemId}`，整行都是点击区域，并提供 `复制 NeeDo ID` 的无障碍名称。
3. 点击或用键盘激活后，只调用 `navigator.clipboard.writeText(currentCustomer.systemId)`。
4. 成功时显示现有本地化文案 `已复制`。
5. Clipboard API 不可用或写入失败时显示现有本地化文案 `复制失败，请手动复制`，不得静默伪装成功。
6. 复制操作不修改个人资料、不调用写 API、不写入浏览器业务存储，也不改变 ID。

## 视觉与可访问性

- 保留当前 ID 行的字号、颜色、截断和卡片布局。
- 只增加整行可点击的按钮语义、指针反馈与清晰的 focus 状态。
- 浏览态和资料编辑态均允许复制，因为 NeeDo ID 在两种状态下都保持只读。

## 测试与验收

- 先在 `UserCenterPage.interaction.test.tsx` 增加失败测试：点击整行后，剪贴板必须收到 `u3141592653`，不得收到 `ID u3141592653`。
- 覆盖复制成功反馈。
- 覆盖 Clipboard API 拒绝时的失败反馈。
- 运行个人中心聚焦测试、前端 TypeScript lint 和正式生产构建。
- 浏览器验收时在用户端 `/me` 实际点击 ID 行，核对剪贴板内容和成功提示；再模拟 Clipboard API 失败，核对失败提示。

## 范围边界

- 不改后端、数据库、migration、API 或 RBAC。
- 不改变公开 ID 格式或来源。
- 不改其他资料卡、商户员工卡或登录注册页的复制交互。
- 不新增 mock、placeholder、硬编码账号或新的用户可见文案。
