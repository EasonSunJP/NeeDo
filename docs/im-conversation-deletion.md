# Step 13：删除会话及当前身份历史

聊天列表左滑删除继续使用现有 DELETE /api/v1/im/conversations/{conversationId}。
后端在同一事务中设置当前身份 hiddenAt、clearedThroughMessageId、已读状态并记录 im.conversation.deleted_for_user 审计。复用现有消息列表/搜索/摘要的清除边界，重新打开同一私聊或群聊不返回旧历史；其他成员的记录及群成员关系不变。无需新增表或 migration。

前端成功删除后清除会话消息内存、分页、草稿、待转发记录和活动会话状态；删除前正在加载的历史页返回后丢弃。清空聊天记录复用相同缓存清理。正式分支没有启用 IndexedDB 消息/媒体持久化，localStorage 只保存 UI 草稿和搜索词。

回归：src/features/im/chat-home.test.tsx 覆盖左滑展示及点击删除；src/features/im/pages.test.ts 覆盖删除按钮到 store 的绑定；src/features/im/store.test.ts 覆盖私聊/群聊、真实 localStorage 草稿键清除、延迟历史响应、实时事件和重开；backend/tests/im-conversation-deletion.repository.test.ts 覆盖身份范围内的事务清除、审计和重开查询边界。

验证结果（2026-09-05）：前端定向 203 项；后端仓储/服务 51 项、API/OpenAPI 96 项通过。根目录 lint、后端修改文件 ESLint、后端 build、前端 build --mode formal 通过。`check:im-conversation-deletion-flow` 在当前工作树的 3100/5280 独立运行环境和本地正式 MySQL 上通过：已有私聊删除并重新建立后返回零条旧消息；临时群聊删除后由成员发送新消息，只返回删除后的新消息；检查器随后删除临时群聊/消息/审计并逐字段恢复已有私聊参与者状态。默认前端 build 被既有 VITE_LEGACY_AUTHORIZATION / VITE_LEGACY_AUTH_BASE_URL 配置保护拦截，未修改或绕过保护。标准 3000/5180 监听仍属于 .worktrees/main-agent-admin-integration，未切换该实例；未合并、推送或部署。
