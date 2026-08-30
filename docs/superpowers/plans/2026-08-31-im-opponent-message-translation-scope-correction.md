# IM 对方消息自动翻译范围修正实施计划

> 执行边界：只修正已经确认的翻译范围，并保留语言能力与好友按钮修复；不应用 migration、不启动浏览器、不写正式业务数据。

## Task 1：用失败测试锁定正确范围

- 修改 `src/features/im/message-translation.test.ts`、`src/features/im/components.action-menu.test.tsx`、`src/features/im/pages.test.tsx`。
- 先让测试明确要求：对方正文/媒体说明可翻译；本人消息、引用、摘要、置顶、搜索和复制保持原文。
- 运行聚焦测试并确认新断言在实现前失败。

## Task 2：删除扩大范围的接线

- 收窄 `src/features/im/message-translation.ts`，只保留消息正文 rich-text 的显示转换。
- 在 `src/features/im/pages.tsx` 只为对方气泡启用翻译；恢复摘要、置顶、搜索、复制和引用的原文路径。
- 在 `src/features/im/components.tsx` 固定引用预览为原文，仅当前气泡正文/媒体说明接收翻译选项。
- 删除 `src/features/im/model.ts`、`src/features/im/store.ts`、`src/features/im/formal-api.ts` 和相关测试中只服务于扩展范围的 preview provenance。

## Task 3：保留并复核其他用户明确要求

- 运行语言能力标准化和联系人资料卡测试。
- 运行好友申请资料页动作测试，确认待处理状态仍显示“拒绝/添加好友”，好友资料仍显示语言能力。
- 不改变其正式 API、关系判断和隐私边界。

## Task 4：文档与完整验证

- 将 `README.md` 和 `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md` 的旧扩大范围说明修正为当前范围。
- 运行聚焦测试、前端全量测试、`npm run lint`、`npm run verify:production-build`、`git diff --check`。
- 汇报尚需用户单独授权的 migration 与真实浏览器验收，不把它们标记为已完成。

