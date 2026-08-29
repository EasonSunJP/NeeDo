# IM 聊天列表媒体摘要设计

## 背景与根因

正式 IM 会话接口返回的最新媒体消息以资源 URL 作为 `content`，并在 metadata 中保存 `needoMessageType` 与 `needoMessageExt`。前端正式适配器已经能把这些字段恢复为 `image`、`voice`、`video`、`file` 等消息类型，但生成聊天列表的 `lastMessagePreview` 时又直接读取 `content`，因此列表显示了媒体 URL。

旧 mock、本地乐观发送和会话摘要重算已经使用 `buildMessagePreview`。正式会话映射没有复用这条统一链路，是本次问题的根因。

## 目标

聊天列表的最新消息摘要必须表达消息类型或文件名，不得暴露图片、视频、音频或文件资源 URL。

固定显示规则：

- 图片：`图片`
- 视频：`视频`
- 语音或音频：`音频`
- PDF、Word、Excel、ZIP 及其他普通文件：metadata 中的原文件名
- 普通文件缺少可用文件名：`文件`
- 文本、表情、撤回、系统、位置、名片、服务卡片和日程邀请：保留现有语义

文件名只做展示，不改变下载地址、消息正文或附件 metadata。

## 方案

采用统一摘要函数方案：

1. 完善 `src/features/im/model.ts` 的 `buildMessagePreview`，让媒体摘要符合上述规则。
2. `src/features/im/formal-api.ts` 在把正式 `lastMessage` 转为 `ConversationMessage` 后，调用同一个 `buildMessagePreview`，不再直接读取媒体 `content`。
3. 本地乐观发送、会话重算、正式 bootstrap、刷新和正式会话读取继续共享同一套摘要规则。
4. 为新增的 `音频` 文案补齐现有五语体系中的繁体中文、日文、英文和韩文翻译；原文件名保持用户提供的原文，不做翻译。

不采用以下方案：

- 在聊天列表组件里检测 URL 或文件扩展名：URL 可能是无扩展名或签名地址，且会复制领域规则。
- 后端新增 `previewText` 字段：会扩大 API、OpenAPI 和后端映射范围，而当前 metadata 已足够可靠地恢复消息类型与文件名。

## 数据流

```text
正式 Conversation.lastMessage
  -> toConversationMessage（恢复消息类型和 ext）
  -> buildMessagePreview（生成类型或文件名摘要）
  -> Conversation.lastMessagePreview
  -> UnifiedConversationPreviewText
```

聊天房间仍使用原始 `content` 和 `ext.url` 渲染或下载媒体；只有列表摘要消费格式化后的文本。

## 回退与安全边界

- 文件 metadata 缺少、格式错误或没有非空 `fileName` 时显示 `文件`，不得回退到 URL。
- 图片、视频和音频即使缺少 metadata，也按已恢复的消息类型显示类型摘要。
- 不从 URL 猜测 MIME 类型或文件名。
- 不修改数据库、migration、后端接口、媒体存储、发送流程或下载流程。
- 不新增 mock、占位 API 或并行聊天页面。

## 测试与验收

按 TDD 先增加失败测试，再修改实现：

1. 正式会话适配器将图片 URL 映射为 `图片`，摘要中不包含 URL。
2. 视频消息映射为 `视频`。
3. 语音或音频消息映射为 `音频`。
4. PDF 和其他普通文件显示 metadata 中的原文件名。
5. 文件名缺失时显示 `文件`，而不是 `content` URL。
6. 文本消息摘要保持不变。
7. 新增媒体摘要文案通过五语翻译测试。

定向测试通过后运行相关 IM 回归、前端 lint、正式 production build，并在正式本地运行环境中用真实媒体消息验证聊天列表不再显示 URL。浏览器验收与自动化测试分别记录，不用 build 结果替代可见页面验收。

## 非目标

- 不新增视频、音频或普通文件上传能力。
- 不改变消息气泡、媒体预览器、下载名称或聊天列表布局。
- 不处理 Social 动态、通知中心或其他 URL 预览。
