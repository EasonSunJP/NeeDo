# IM 联系人聊天自动翻译与语言能力展示设计

日期：2026-08-31

范围：用户端、技师端、商户端共用的正式 IM 单聊联系人信息页、聊天内容显示和正式会话偏好

## 背景与根因

当前 App 的 `I18nRuntime` 会通过 `MutationObserver` 扫描页面文字，并把命中全局翻译表的文本按当前 App 语言替换。聊天气泡没有与这个全局界面翻译边界隔离，因此用户发送的正文也被当成 UI 文案处理。例如简体中文消息“测试测试”会在日文界面被替换成“テストテスト”。

该行为目前没有联系人级开关，也不是一个显式、可持久化的聊天偏好。它还可能只替换正文中命中 NeeDo 内置翻译表的片段，使显示结果与服务器保存的原文不一致。

联系人资料中的 `identityCard.languages` 已经来自正式目录资料，但 `ConversationIdentityProfileCard` 直接渲染原始字符串，所以 `ja / zh / en` 等语言代码会暴露给用户。当前语言区域还套有独立重边框容器，与用户确认的完整语言名称胶囊布局不一致。

## 已确认目标行为

- 单聊“联系人信息”页新增“聊天内容自动翻译”开关。
- 开关默认关闭；所有现有和新建会话参与记录均以关闭状态起步。
- 关闭时，历史消息和新消息都显示服务器原文，不接受全局界面 i18n 的隐式替换。
- 打开时，当前会话中所有已加载和新到达的可翻译文字按当前 App 语言使用 NeeDo 现有翻译规则显示。
- 开关只影响当前登录身份看到的当前会话；对方账号可独立设置，不互相覆盖。
- 原始消息、消息 metadata、发送内容和数据库记录永不因显示翻译而修改。
- 设置通过正式 API 和数据库持久化；刷新、重登和换设备后继续生效。
- 联系人语言能力使用真实资料中的语言列表，但显示完整语言名称而不是代码。
- 语言区域按参考图使用完整名称胶囊自然换行，不固定给所有联系人补齐七种语言。

## 方案选择

采用“服务端会话参与者偏好 + 显式消息显示转换”方案。

不采用以下方案：

- 保存到 `Contact`：删除好友后 Contact 会被物理删除，但未删除方仍可能保留只读会话历史；翻译偏好不应随好友关系行丢失。
- 保存到 `localStorage`：无法跨设备，也会在正式 IM 中制造平行浏览器业务状态。
- 继续依赖全局 `MutationObserver` 自动修改聊天 DOM：关闭开关后 React 不一定能可靠恢复已经被观察器改写的文本节点，也无法清晰区分 UI 文案与用户内容。

## 数据模型与迁移

在 `ConversationParticipant` 增加当前身份、当前会话独享的字段：

```prisma
autoTranslateMessages Boolean @default(false) @map("auto_translate_messages")
```

迁移使用 additive migration `20260831120000_conversation_auto_translate_messages`：

- 为 `conversation_participants` 增加非空布尔列 `auto_translate_messages`。
- 数据库默认值为 `FALSE`，既有参与记录统一回填为关闭。
- 不修改 Conversation、Message、Contact、FriendRequest 或消息正文。
- 不增加新的索引；该字段只随已经按会话和身份定位的参与者行读取与更新。

该偏好继续服从正式 IM 的 active identity 边界。相同 User 切换到不同身份时，只读取该身份对应的 `ConversationParticipant`，不会复用另一个身份的设置。

## API 与后端数据流

复用现有接口：

```text
PATCH /api/v1/im/conversations/:conversationId/preferences
```

请求体新增可选字段：

```json
{
  "autoTranslateMessages": true
}
```

合同规则：

- `conversationPreferencesBodySchema` 接受 `isPinned`、`isMuted`、`autoTranslateMessages` 中至少一个字段。
- 接口继续要求 Bearer 鉴权与既有 `conversation:list` 权限。
- Repository 只更新当前认证 active identity 的有效参与者行。
- 越权或不存在的会话继续返回安全的 `error.realtime.conversation_not_found`。
- 更新成功返回完整 `ConversationPayload`，其中包含服务器确认后的 `autoTranslateMessages`。
- 更新不发布消息 SSE，也不影响对方参与者；它是当前查看者的读取偏好。
- 复用现有个人会话偏好失败语义，不新增假成功或本地补写。

读取链路统一扩展：

```text
ConversationParticipant.autoTranslateMessages
  -> ConversationPayload.autoTranslateMessages
  -> RealtimeConversation.autoTranslateMessages
  -> IM Conversation.autoTranslateMessages
  -> 联系人信息开关和聊天显示策略
```

OpenAPI 同步声明请求字段和响应字段；不新增路由、权限、轮询或实时连接。

## 前端状态与开关交互

在单聊 `ImConversationInfoPage` 中，将新开关放在“消息免打扰”和“置顶聊天”之前：

```text
聊天内容自动翻译        [开关]
打开后按当前 App 语言显示；关闭后显示原文

消息免打扰              [开关]
置顶聊天                [开关]
```

群聊仍显示“信息设置”，本微步骤不在群聊页增加该开关。

交互采用服务器确认状态：

1. 用户点击开关。
2. Store 调用正式 `PATCH .../preferences`。
3. 成功后以完整 Conversation 响应替换当前会话状态。
4. 失败时继续显示上一次服务器确认值，并显示可本地化错误提示。
5. 请求进行中禁用该开关，避免连续点击产生乱序结果。

不把该值写入浏览器业务存储，不用乐观状态伪装保存成功。

## 消息翻译显示边界

用户生成的消息内容无论开关状态如何，都必须放在 `data-no-i18n` 边界内，阻止全局 `I18nRuntime` 隐式改写。显示转换由 IM 模块显式完成。

新增纯显示 helper，输入为原始 `ConversationMessage`、目标 App 语言和 `autoTranslateMessages`，输出只用于渲染的派生值。它不得修改 Store 中的消息对象。

开关关闭：

- 文字消息显示原始 `content`。
- 引用文字、图片说明和其他用户输入说明显示原值。
- 判断贴纸、普通 emoji、媒体、文件名、用户名和 NeeDoID 保持原样。

开关打开：

- 文字消息的文本片段通过现有 `translateText` 规则转换到当前 App 语言。
- 结构化 `richText` 只转换 `text` segment；判断贴纸 segment 继续使用原 SVG 资产，不降级为普通文字。
- 图片说明及其结构化文字 segment 使用同一规则。
- 引用预览使用派生后的显示文本；被引用的原消息和引用关系不变。
- 会话列表最后一条文字摘要使用同一会话偏好显示，避免聊天内已翻译但列表摘要仍显示原文。
- 当前翻译表无法识别的自由文本保留原文；本微步骤不引入外部机器翻译供应商或外部费用。

所有写操作继续使用原始服务端内容：

- 发送、重发和转发不写入派生翻译。
- 标准撤回后的重新编辑草稿恢复原文和原始结构化 segment。
- 回复关系、消息搜索索引和持久化本地加密缓存仍以原文为事实源。
- 消息菜单“复制”复制当前可见文字；开关关闭复制原文，打开复制当前显示的翻译文字。媒体和结构化贴纸的既有复制负载继续保留完整类型信息。

切换开关只重新计算当前会话的显示值，不重新请求或重写消息历史。

## 语言能力标准化与视觉

新增 IM 专用的纯函数语言标签标准化层。它只改变展示标签，不改正式资料字段。

规范标签至少覆盖：

| 接受的常见值 | 显示标签 |
|---|---|
| `ja`、`ja-JP`、`Japanese`、`日本語` | `日本語` |
| `zh`、`zh-CN`、`zh-Hans`、`zh-Hant`、`Chinese`、`中文` | `中文` |
| `en`、`en-US`、`English` | `English` |
| `ko`、`ko-KR`、`Korean`、`한국어` | `한국어` |
| `th`、`th-TH`、`Thai`、`ไทย` | `ไทย` |
| `vi`、`vi-VN`、`Vietnamese`、`Tiếng Việt` | `Tiếng Việt` |
| `es`、`es-ES`、`Spanish`、`Español` | `Español` |

规则：

- 比较时忽略大小写并裁剪首尾空格。
- 同一规范语言只显示一次，保留第一次出现的顺序。
- 未知但非空的值显示裁剪后的原值，不静默删除。
- 空字符串不渲染。

视觉调整只作用于 `ConversationIdentityProfileCard` 的语言能力 section：

- 保留“语言能力”标题。
- 移除当前独立的重边框内层卡片感，使用资料卡内自然 section 间距。
- 胶囊显示完整标签，水平宽度随文字自然增长。
- 使用现有 `--client-*` token，保持当前紫色描边/文字语义和圆角。
- 手机宽度自然换行，长标签不得被截断或造成横向溢出。
- 实际只渲染该联系人的正式语言列表，不把参考图中的七项当作固定默认值。

## 好友关系与正式语言来源修正

补充验收截图暴露了两个既有正式数据读取问题，本微步骤一并修正：

- `contacts` 也承载客服、技师申请和初始化业务联系人，双向 Contact 记录本身不等于好友。只有双方仍有效且 `source = "friend_request"` 的双向记录才能把 directory relationship 判定为 `friend`，也只有这种记录才能触发 `already_friends`。
- 有有效待处理好友申请时，待处理关系和对应“拒绝 / 添加好友”操作优先于历史或业务联系人记录；从“新的朋友”进入资料页时不得自动跳到“开始聊天”。
- 技师身份卡必须读取正式 `TechnicianProfile.languages`。当公开 customer 资料的语言列表为空，而同一用户存在已发布的公开技师资料语言时，联系人语言能力可回退到该正式技师列表；不得为没有正式值的联系人生成默认语言。
- 私密 customer 资料、未发布或已删除的技师资料不能作为上述语言回退来源。

## 错误、并发与兼容边界

- 同一开关更新进行中禁止再次提交；最终 UI 只接受相应 PATCH 返回的服务器状态。
- 切换 App 语言时，已打开自动翻译的会话立即按新语言重新派生显示，不写数据库。
- 切换 active identity 或账号后，必须读取新身份的 ConversationPayload，不沿用前一个身份内存中的偏好。
- SSE 新消息合并后读取当前 Conversation 的偏好，不能以事件到达时的临时全局值改写原消息。
- 消息输入框是权威原文边界：contenteditable 内的用户输入节点必须排除在 `I18nRuntime` 之外，不能让运行时展示翻译经后续 input/paste 事件写回 draft 或发送 payload。输入框的可视 placeholder 与 `aria-placeholder` 必须在存在 `I18nProvider` 时由当前 App 语言显式派生并单独保持可本地化；没有 Provider 的独立/复用挂载必须保留调用方传入的原文，不能改用系统语言 fallback。
- 旧客户端会忽略新增响应字段；数据库默认关闭，因此不会继续发生隐式聊天翻译。
- 除纠正“业务 Contact 被误判为好友”和待处理资料页操作外，本微步骤不改变好友申请、好友删除、黑名单、会话保留、消息发送权限或身份资料隐私规则。
- 保留当前工作区中日程与联系人时间线的无关未提交修改。

## TDD 与自动化测试

实施必须先写失败测试并确认按预期失败，再写最小实现。

后端覆盖：

1. schema 和 migration 定义非空、默认关闭的 `auto_translate_messages`，且 migration 不修改 Message/Contact。
2. Zod 接受单独的 `autoTranslateMessages`，拒绝空偏好请求和非布尔值。
3. Repository 只修改请求者 active identity 的参与者行，对方参与者保持不变。
4. Conversation 列表、单条回读、偏好 PATCH 响应都返回服务器值。
5. Service、API、RBAC 和 OpenAPI 合同覆盖成功、越权与未找到。
6. 双向非 `friend_request` Contact 不会覆盖有效待处理申请，也不会触发 `already_friends`。
7. 技师语言和公开 customer 空语言时的正式技师语言回退正确；私密或未发布资料不泄漏语言。

前端覆盖：

1. formal adapter、Store 和 model 完整映射该字段，缺失字段安全回退为 `false`。
2. 单聊联系人信息页显示开关，群聊信息设置页不显示。
3. 保存成功采用完整服务器响应；保存失败保留原确认状态并显示错误。
4. 日文 App 下关闭时“测试测试”保持原文，打开时显示“テストテスト”。
5. 全局 runtime translation 不得在关闭时改写聊天气泡、引用和媒体说明。
6. 判断贴纸混合消息在翻译开关开启后仍保持 SVG 贴纸形态，文字 segment 单独翻译。
7. 会话摘要与当前聊天的显示策略一致；发送/转发/撤回草稿仍保留原始负载。
8. 日文 App 下输入已知翻译词后，MutationObserver 周期和后续输入/粘贴都不能改写 draft；序列化发送 payload 仍是用户原文，placeholder 与无障碍占位文案仍显示日文。
9. `ja / zh / en / ko / th / vi / es` 显示为七个完整名称；别名去重、未知值保留、空值过滤。
10. 语言胶囊在窄屏换行且无横向溢出。
11. “新的朋友”待处理资料始终保留“拒绝 / 添加好友”，不会自动跳转为“开始聊天”。

## 浏览器验收

在确认 5180 由当前工作树提供、3000 正式后端 ready 后，以两个真实测试账号和移动端视口验收：

1. 双方进入同一正式单聊，确认新开关初始均关闭。
2. 一方发送“测试测试”，中文和日文 App 均先看到服务器原文。
3. 仅日文侧打开开关，当前历史和新消息显示“テストテスト”；中文侧不受影响。
4. 日文侧关闭开关，当前历史立即恢复原文。
5. 刷新、退出重登和重新进入会话，确认服务器偏好保持。
6. 验证判断贴纸、引用、图片说明、复制与会话列表摘要符合显示/原文边界。
7. 联系人语言代码按真实数据渲染为完整语言名称，窄屏自然换行。
8. 验证待处理联系人显示“拒绝 / 添加好友”，已成为好友且存在正式语言资料的联系人显示语言能力。
9. 检查浏览器控制台、失败请求、横向溢出、隐藏面板和底部安全区。

浏览器验收期间不修改正式业务数据之外的偏好和唯一测试消息；若创建临时消息，记录其双方可见性，不把本地运行验收描述为部署或线上验收。

## 文档与验证

完成后更新：

- `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`：追加本微步骤正式行为、数据边界与验收记录。
- `README.md`：补充联系人聊天自动翻译偏好与完整语言名称展示。
- OpenAPI：同步偏好请求和 Conversation 响应。

完成前运行定向前后端测试、Prisma generate/validate、完整 lint、相关 build 和 `npm run verify:production-build`。若本地正式数据库 migration 未获授权应用，只能报告 migration 文件与只读验证结果，不能声称数据库或浏览器持久化验收完成。

生产构建的 i18n chunk 预算必须继续作为精确门禁，而不是被取消或任意放宽。本微步骤新增五语言正式文案后，实际 chunk 为 `3,703,026` bytes，超过既有 `3,702,048` bytes 预算 `978` bytes。沿用仓库已经采用的最小 `2 KiB` 增量规则，只允许把 i18n 预算调整为 `3,704,096` bytes，并用边界测试证明 `3,703,026` bytes 通过而 `3,704,097` bytes 失败；main chunk 和其他生产审计规则保持不变。

## 非目标

- 不引入 Google、DeepL、OpenAI 或其他外部翻译供应商。
- 不新增自动语言检测、翻译质量评分、翻译缓存表或管理员翻译控制台。
- 不翻译或改写消息数据库正文、文件名、用户姓名、NeeDoID、判断贴纸资产和媒体二进制。
- 不把单聊偏好扩展到群聊。
- 不改变 App 支持的五种界面语言集合。
- 不重做联系人资料卡、聊天气泡、会话列表或联系人信息页的整体视觉。
