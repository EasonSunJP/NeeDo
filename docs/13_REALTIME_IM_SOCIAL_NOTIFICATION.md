# 13 — IM / Social / Notification 后端化

> 本文档用于指导 Codex 执行 Step 13。  
> 每次只执行本 Step，不要跨步骤开发。  
> 完成后必须通过验收，再进入下一 Step。

---

## 1. 阶段目标

在核心交易链路稳定后，再把 IM、Social、通知从浏览器 mock state 迁移到真实后端和实时事件。

---

## 2. 必须先读

- `README.md`
- `AGENTS.md`
- `docs/12_BACKOFFICE_MERCHANT_ADMIN_REAL_DATA.md`

---

## 3. 本步必须做

- 设计 Conversation、Message、Contact、FriendRequest、SocialPost、Follow、Notification 基础模型。
- 先做 REST API，再做 WebSocket/SSE。
- 实现消息分页、游标、未读数。
- 实现通知事件：订单状态、接单、取消、完单、好友申请、系统通知。
- 前端只替换 IM/Social API adapter，不改 UI。
- 实时服务与 REST 服务边界清晰。

---

## 4. 本步禁止做

- 不要与 Booking/NDP 状态机混在同一 PR。
- 不要一次性实现所有社交高级功能。
- 不要改现有 IM/Social 视觉。
- 不要无分页返回消息历史。

---

## 5. 交付物

- `IM/Social/Notification models`
- REST APIs
- `WebSocket/SSE gateway`
- 前端 adapter 接入
- `tests/realtime*.test.ts`
- `docs/realtime.md`

---

## 6. 验收标准

- [x] 消息历史使用 `beforeId` 游标分页。
- [x] 会话、好友申请、通知未读数来自正式数据库，并由全局 SSE 订阅刷新。
- [x] 订单确认、开始、完成和取消能够写入持久化通知。
- [x] SSE 返回事件 ID 与重试提示；断线后客户端携带 `Last-Event-ID` 并重新读取未读数和当前资源。
- [x] 高频实时事件只通过内存网关分发，不为每次投递增加数据库写入。

## 6.1 完成记录（2026-08-25）

- 正式 IM 路由已接入会话、消息、联系人、好友申请、已读与未读数 API。
- 正式 Social 路由已接入动态列表、单条详情、发布、关注、通知与已读 API。
- 用户端、商户端和技师端共用原有完整 Social 页面；已删除 `formal-pages.tsx` 极简版及按账号/环境切换页面实现的分支，正式接口只通过 Provider/adapter 注入数据。
- 动态发布事件向作者及当前关注者分发 `social.post.created` SSE 事件。
- 正式模式复用原有完整 IM / 联系人页面及交互结构，仅由 `formal-api.ts` 将页面状态模型映射到正式 REST/SSE；静态演示模式才会安装旧浏览器 mock adapter。
- 已删除曾用于正式账号的简化 IM 页面和双路由切换分支，所有 IM 路由只有一套页面实现，避免账号或环境切换时进入错误设计。
- 正式模式不写入旧 IM/Social 浏览器业务数据库；草稿等纯 UI 状态可保留在本地。置顶、免打扰、已读/未读和个人删除现已写入正式 `conversation_participants` 状态；联系人拉黑/解除拉黑写入当前账号自己的 `contacts.blocked_at`，由 `contact:block` 权限保护并发送 `contact.updated`；标签、媒体上传和高级群设置仍不会制造假成功。
- 会话“删除”只设置当前参与者的 `hidden_at`，不删除共享成员或消息；新消息到达后会重新显示该会话。
- 真实模拟账号运行验收已覆盖：建会话、发消息、未读清零、非成员 404、公开动态、关注者可见性、取消关注隔离和单条动态读取。
- 正式 Social 测试 Seed 会更新 210 个三个月模拟账号及 6 个固定入口账号，共写入 3,240 条正式 `SocialPost`：每账号 15 条，纯文字、单图、多图、视频、引用各 3 条；所有媒体均使用可持久化 URL，不写入 `blob:` 临时地址。
- 216 个正式测试账号统一使用由环境变量提供的同一测试密码，并改为真实日文店名、店铺官方受付名和人物姓名；每个账号精确建立 36 个双向好友，且同时覆盖店铺服务号、技师和普通用户。
- 三个月本地模拟 Seed 会在正式 Prisma/MySQL 表中生成 210 个客户会话、860 条跨月消息和 420 条双向联系人关系；重复执行仅替换带模拟命名空间的 IM 数据，不删除人工创建的会话。
- `sim.customer.100@needo.local` 固定拥有 12 个真实关联联系人/会话与 68 条跨三个月消息；校验脚本同时确认每个会话含该正式账号及一个可独立登录的真实对方账号。
- 共享正式客户账号 `customer@example.com` 会同步恢复客户资料、NDP 钱包及 2 个预览会话，便于从用户端测试入口直接验收个人中心与聊天页。
- 消息表情反应已落到正式 `MessageReaction` 表，并通过带 RBAC 权限的 `PUT/DELETE /api/v1/im/conversations/:conversationId/messages/:messageId/reactions` 写入或撤销；刷新页面后仍可读取当前用户和其他参与者的反应，变更同时分发 `message.reaction.updated` SSE 事件。
- 三个月模拟 Seed 为 10 个店铺账号、100 个技师账号和 100 个客户账号分配可复现的生成式头像：店铺使用 10 张互不重复的店内环境、前台或招牌照片，人物在 AI 真人与卡通头像池中稳定随机；当前共分配 210 个账号、71 张不同头像资源，重跑 Seed 不会改变同一账号的头像。
- 6 个固定入口测试账号也由正式 User Management Seed 写入头像：`merchant@example.com` 使用店铺环境照片，admin、operator、affiliate、technician、customer 使用人物头像；不会只在前端显示临时占位图。
- 模拟数据校验会核对每个账号的数据库头像地址与计划一致，并确认对应图片资源存在；聊天列表使用配套 512px JPEG 缩略图，避免加载原始大图或出现无效头像。

## 6.2 标准撤回与重新编辑完成记录（2026-08-28）

- 新增受 `message:recall` 权限保护的正式接口 `POST /api/v1/im/conversations/:conversationId/messages/:messageId/recall`；当前只接受 `{ "mode": "standard" }`，由服务端发送时间和撤回期限判定是否仍在三分钟窗口内。
- 标准撤回在同一事务中将消息正文和 metadata 清空、写入持久化 recalled tombstone、移除表情回应、写入内容无关的删除同步记录与审计记录；重复请求幂等，且只有第一次状态变化会发布不含原文的 `message.recalled` SSE 事件。
- 历史消息、增量同步和 SSE 合并均以 recalled 终态优先，旧的 active history 不得覆盖 tombstone；离开聊天、返回、刷新或重连后只显示撤回残留，不会恢复已撤回正文。
- 发送方固定显示“你撤回了一条消息”，接收方固定显示“对方撤回了一条消息”。发送方成功撤回文本消息后，原文只作为当前设备草稿回填输入栏，输入框获得焦点且光标位于末尾；重新编辑发送会创建新消息，原撤回残留不消失，清空草稿也不删除残留。
- 已知超过三分钟的消息在前端直接显示“发送超过3分钟后无法撤回”且不发 mutation；服务端仍独立校验权威期限并返回明确的窗口过期错误，避免通过旧客户端绕过。
- 新增 deployment migration `20260828060000_message_recall_permission`，为既有数据库 upsert `message:recall` 并恢复 admin、merchant owner/staff、technician、customer 的正式 IM 权限，避免只更新 Seed 后旧环境继续返回 403。
- 自动化验收覆盖 repository 事务、service 事件、API/RBAC/OpenAPI、部署权限迁移、正式前端 adapter、终态合并、残留文案、草稿恢复和三分钟提示；后端定向 5 suites / 22 tests、前端定向 6 files / 100 tests 均通过。变更后完整回归同样通过：后端 173 suites / 1,051 tests（另有原有条件性跳过 5 suites / 24 tests），前端 189 files / 1,022 tests。
- 隔离正式运行环境的双账号浏览器验收已通过：两次真实撤回成功；发送方/接收方残留、草稿回填、焦点和光标、编辑重发后残留、清空草稿后残留、双方刷新防正文复活均符合要求；过期消息显示指定提示且确认没有发出撤回请求。

---

## 7. 给 Codex 的命令

```text
请阅读 README.md、AGENTS.md、docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md。本次只执行 Step 13：IM / Social / Notification 后端化。请先实现最小可用 REST API 和基础数据模型，再接 WebSocket/SSE 实时事件。重点是 Conversation、Message、Contact、FriendRequest、SocialPost、Follow、Notification、未读数、分页和订单状态通知。不要改现有 IM/Social UI，不要一次性实现所有高级社交功能，不要与 Booking/NDP 混在一个 PR。完成后运行 migration、lint、test、build，并更新 docs/realtime.md。
```

---

## 8. 完成后必须回复的内容

Codex 完成本步后，必须输出：

1. 本次修改的文件清单。
2. 新增或修改的接口清单。
3. 新增或修改的数据表 / migration 清单。
4. 运行过的命令和结果。
5. 已通过的验收项。
6. 未完成项与原因。

若某项没有完成，必须明确说明，不得假装完成。
