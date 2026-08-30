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
- [x] 高频实时事件通过进程内 SSE + Redis Pub/Sub 分发，不为每次投递增加数据库写入，也不按用户创建 Redis 订阅。

## 6.1 完成记录（2026-08-25）

- 正式 IM 路由已接入会话、消息、联系人、好友申请、已读与未读数 API。
- 正式 Social 路由已接入动态列表、单条详情、发布、关注、通知与已读 API。
- 用户端、商户端和技师端共用原有完整 Social 页面；已删除 `formal-pages.tsx` 极简版及按账号/环境切换页面实现的分支，正式接口只通过 Provider/adapter 注入数据。
- 动态发布事件向作者及当前关注者分发 `social.post.created` SSE 事件。
- 正式模式复用原有完整 IM / 联系人页面及交互结构，仅由 `formal-api.ts` 将页面状态模型映射到正式 REST/SSE；静态演示模式才会安装旧浏览器 mock adapter。
- 已删除曾用于正式账号的简化 IM 页面和双路由切换分支，所有 IM 路由只有一套页面实现，避免账号或环境切换时进入错误设计。
- 正式模式不写入旧 IM/Social 浏览器业务数据库；草稿等纯 UI 状态可保留在本地。置顶、免打扰、已读/未读和个人删除现已写入正式 `conversation_participants` 状态；联系人拉黑/解除拉黑写入当前账号自己的 `contacts.blocked_at`，由 `contact:block` 权限保护并发送 `contact.updated`；高级群设置仍不会制造假成功。
- 会话“删除”只设置当前参与者的 `hidden_at`，不删除共享成员或消息；新消息到达后会重新显示该会话。
- 真实模拟账号运行验收已覆盖：建会话、发消息、未读清零、非成员 404、公开动态、关注者可见性、取消关注隔离和单条动态读取。
- 正式 Social 测试 Seed 会更新 210 个三个月模拟账号及 6 个固定入口账号，共写入 3,240 条正式 `SocialPost`：每账号 15 条，纯文字、单图、多图、视频、引用各 3 条；所有媒体均使用可持久化 URL，不写入 `blob:` 临时地址。
- 216 个正式测试账号统一使用由环境变量提供的同一测试密码，并改为真实日文店名、店铺官方受付名和人物姓名；每个账号精确建立 36 个双向好友，且同时覆盖店铺服务号、技师和普通用户。
- 三个月本地模拟 Seed 会在正式 Prisma/MySQL 表中生成 210 个客户会话、860 条跨月消息和 420 条双向联系人关系；重复执行仅替换带模拟命名空间的 IM 数据，不删除人工创建的会话。
- `sim.customer.100@needo.local` 固定拥有 12 个真实关联联系人/会话与 68 条跨三个月消息；校验脚本同时确认每个会话含该正式账号及一个可独立登录的真实对方账号。
- 共享正式客户账号 `customer@example.com` 会同步恢复客户资料、NDP 钱包及 2 个预览会话，便于从用户端测试入口直接验收个人中心与聊天页。
- 消息表情反应已落到正式 `MessageReaction` 表，并通过带 RBAC 权限的 `PUT/DELETE /api/v1/im/conversations/:conversationId/messages/:messageId/reactions` 写入或撤销；刷新页面后仍可读取当前用户和其他参与者的反应，变更同时分发 `message.reaction.updated` SSE 事件。
- 同一消息、同一表情的多账号反应按首次写入顺序聚合为一个条目，前端在第一个姓名后继续追加后续姓名；桌面右键/长按只显示 NeeDo 菜单，不再同时打开浏览器原生上下文菜单遮挡操作。
- 正式请求在本地校验当前登录会话用户与 JWT `sub`；仅在发现跨标签页令牌主体不一致时合并执行一次刷新，若仍不一致则清除会话并拒绝请求，避免以错误账号写入且不增加正常请求量。
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

## 6.3 撤回超时提示可见性修复（2026-08-29）

- “发送超过3分钟后无法撤回”不再复用输入栏上方的低对比录音状态条，改为位于输入栏上方的高层级、高对比 `role="alert"` 浮层，避免提示已经生成但用户无法明显看到。
- 客户端已知过期时仍不发送撤回 mutation；若客户端与服务端时间存在偏差并由服务端权威返回撤回窗口过期，前端会先关闭消息操作面板，再显示同一提示。
- 定向回归测试覆盖提示浮层的可访问性、层级、字号和服务端失败时关闭操作面板；隔离正式后端、前端和测试账号的浏览器验收确认提示可见，且过期操作的撤回请求数为 0。

## 6.4 本地搜索、好友目录、图片消息、即时到达与黑名单（2026-08-29）

- 聊天列表和会话内搜索只对当前设备已经加载到统一 IM store 的联系人、会话摘要与消息做包含式模糊匹配；输入关键词不会向服务器逐会话查询，也不会为每次按键制造历史消息请求。尚未加载的远端旧历史不在本地结果中。
- 添加好友使用受 `contact:list` 权限保护的分页 `GET /api/v1/im/directory`，只返回活跃、未删除、非本人、尚未加入通讯录账号的 `userId / needoId / username / avatarUrl`，支持昵称和不可变 NeeDoID 的包含式搜索。`POST /api/v1/im/contacts` 由服务端固定 `source=manual` 并恢复软删除联系人，不接受客户端伪造 owner/source。
- 相册图片改为真实文件选择和 `POST /api/v1/im/conversations/:conversationId/media` 原始字节上传；服务端先验证会话成员资格，再校验 JPEG/PNG/WebP 魔数及 8 MiB 上限，并写入不可猜测的 256-bit 文件名。消息 metadata 只持久化媒体 URL 和安全元数据，不再调用 `featureUnavailable` 或发送示例图片。
- 同一浏览器标签页共享一条 SSE 连接，页面隐藏时关闭，恢复或断线重连后只进行一次会话/当前消息补拉。`message.created` 事件现在会立即合并进当前会话，不再只刷新会话摘要；不使用高频轮询。
- “信息设置”和通讯录共用 `contacts.blocked_at` 权威状态：拉黑后操作项立即显示“解除黑名单”，任一入口修改都会通过 `contact.updated` 同步。直接会话接收方已拉黑发送方时，服务端在写消息前返回 `error.im.recipient_blocked`，发送方保留失败气泡并显示“对方将你拉黑，信息发送失败”。
- 本节不新增数据表或 migration；沿用现有 User、Contact、Conversation、ConversationParticipant、Message 和 SSE 网关。

## 6.5 IM 跨实例即时到达与背压保护（2026-08-29）

- 正式后端不再把实时事件限制在单个 Node 进程内。每个后端实例只建立一个 Redis channel 订阅和一个专用发布连接，发送请求与接收者 SSE 落到不同实例时仍可即时投递。
- 同实例事件先直接送达本地 SSE，再向 Redis 发布带实例标识的定向 envelope；发布实例忽略自己的回环消息，因此本地与跨实例都只投递一次。Redis 短暂不可用不会影响已经落库的消息，也不会阻断同实例客户端。
- 跨实例 envelope 限制为 256 KiB，并校验实例标识、事件 id、事件类型、接收用户 id 和时间字段；畸形、超限或回环数据不会进入客户端事件流。
- Node `response.write()` 报告背压时立即关闭该慢连接并从订阅表移除，浏览器按既有 SSE 重连与 REST 补拉恢复，避免服务端为慢客户端保留无界内存。
- Redis Pub/Sub 仅承担低延迟投递，不作为消息事实源，也不承诺历史重放。Message 继续以 MySQL 为权威，`Last-Event-ID` 后的断线恢复继续通过会话、当前消息和未读 REST 资源完成。
- Redis 订阅连接失败时，每个后端进程只运行一个 5–30 秒指数退避重连，不随在线人数增加，也不访问数据库。
- 前端仍维持“一个可见浏览器标签页共享一条 SSE、隐藏时释放、恢复时一次补拉”，没有新增定时轮询或按组件重复连接。
- 本节不新增数据表或 migration；新增 `REALTIME_REDIS_CHANNEL` 环境配置及 Redis 实时总线生命周期管理。

## 6.6 IM 发送确认与即时到达浏览器修复（2026-08-29）

- 正式前端以 `POST /api/v1/im/conversations/:conversationId/messages` 返回的持久化 Message 作为发送成功的权威确认；消息成功落库后不再同步追加一次会话列表读取。
- 会话摘要继续由发送前的本地乐观状态和后续 `message.created` SSE 更新；若兼容适配器明确返回会话对象，Store 仍会合并该对象。
- 该修复消除了“消息已经落库，但后续会话读取超时导致气泡显示发送失败”的假失败路径，并为每次成功发送减少一次 REST 请求，不新增轮询或实时连接。
- 双模拟账号正式运行验收确认：消息创建返回 `201`，接收方 SSE 在同一时刻收到相同 message id，事件只投递一次。
- 本节不新增接口、数据表或 migration。

## 6.7 双标签账号隔离、恢复白屏与限流隔离（2026-08-29）

- 当前标签页的 session、portal 和 refresh token 改为 `sessionStorage`，access token 继续只保留在页面内存；同一个 Chrome 或无痕会话中的两个标签可以登录不同账号，不再互相覆盖活动身份。按门户记住的授权仍保留在既有本地存储中，未新增 Cookie、轮询或后台请求。
- 旧的共享活动会话键会在读取、写入和退出时清除，避免升级前残留继续引发跨标签身份竞争。新标签仍可使用按门户记住的正式 refresh token 自动恢复。
- 受保护路由的门户恢复不再被 React StrictMode 的 effect 清理永久卡在 pending；恢复成功进入目标页，恢复失败进入登录页，不再渲染空白根节点。
- 全局 API 限流保持原阈值不变。匿名、伪造或过期 Bearer 请求继续按 IP 限流；只有通过现有 `AuthTokenService` 验证签名和有效期的 access token 才按用户 ID 隔离额度。同一用户更换 token 不能重置额度，不同真实用户不会因共享 NAT/IP 互相触发 429。
- 同一无痕浏览器上下文双账号验收覆盖：两边同时进入聊天、SSE 即时收信、双方同时重载、新标签按记住授权恢复；全程无 401、429、重复消息或发送失败。
- 本节不新增接口、数据表或 migration，不提高限流阈值。

## 6.8 设置页正式资料空状态保护（2026-08-29）

- 旧浏览器实体缓存已退役并固定返回空快照，设置首页、资料编辑、服务范围和账户页不得再假设 `Customer / Technician / Store` 数组至少存在一条记录；缺少正式实体时显示真实空状态，不生成默认账号或演示资料。
- 设置首页的资料、服务范围与账户摘要改为可空计算，用户当前位置也有明确的安全回退，避免读取 `nickname`、`serviceAreas`、`area` 或 `phone` 时触发恢复页。
- 用户资料编辑改为读取并写入正式 `/api/v1/customer-profile/me`，不再调用已退役且不会持久化的浏览器实体更新函数；技师或店铺正式资料未接入时显示“资料不可用”，不制造保存成功。
- 正式客户资料请求在 React StrictMode effect 重放期间共享同一个进行中请求；用户主动重试仍会强制发起新请求。5180 浏览器验收确认设置首页、资料编辑、服务范围和账户页均可见，资料接口只请求一次，且无页面错误、HTTP 错误或 429。
- 本节不新增接口、轮询、数据表或 migration。

## 6.9 单条消息仅对本人永久删除（2026-08-29）

- 消息操作菜单中的“删除”不再只写当前 React 页面状态；`DELETE /api/v1/im/conversations/:conversationId/messages/:messageId` 会写入当前账号自己的持久化删除墓碑。
- 新增 `message_user_deletions` 表，唯一约束为当前用户与消息；共享 `messages` 记录和对方聊天历史不变，重复删除幂等且没有恢复接口。
- 消息分页和当前账号的会话摘要都排除其删除墓碑，因此离开聊天、刷新、重登或重新补拉后不会复活；对方仍能读取原消息。
- 接口沿用 `message:list` 权限并验证当前用户仍是会话成员，越权消息统一返回安全的未找到错误；删除动作写入不含正文的审计记录。
- 前端只在正式接口成功后移除气泡，失败时保留原消息并显示可本地化提示；未新增轮询或实时连接。
- 新增 migration `20260829200000_message_user_deletion`，并补齐 repository、service、API、OpenAPI、正式前端 adapter 和刷新隔离回归测试。

## 6.10 回到最新消息按钮（2026-08-30）

- 会话页以消息列表末尾标记的可见性决定是否显示“回到最新消息”圆形向下箭头；按钮复用动态发布按钮的固定位置和玻璃视觉，但不可拖动。
- 用户查看历史消息时不会因新消息到达被强制拉到底部；点击按钮或手动回到底部后按钮自动消失，消息菜单和媒体全屏预览期间不会遮挡操作。
- 该能力仅维护前端瞬时滚动状态，不新增接口、轮询、mock 或浏览器持久化业务数据。

## 6.11 Social 联系人提醒、图片上传与共享玻璃头部（2026-08-30）

- 新增受 Bearer 鉴权和 `social-post:create` 权限保护的 `POST /api/v1/social/media?fileName=...`。请求体为原始图片字节，只接受 JPEG、PNG、WebP，单张上限 8 MiB；服务端同时校验 Content-Type 与文件魔数，磁盘文件名不可由客户端控制。
- 图片先写入当前用户自己的待绑定 `MediaAsset`，成功后写入不含图片内容的审计记录。数据库写入失败会补偿删除磁盘文件；接口只返回 `publicId / url / mimeType / fileSize`，不暴露内部数据库主键。
- `POST /api/v1/social/posts` 新增可选 `mentionUserIds`，最多 50 个且去重。服务端只接受当前认证用户拥有、未删除、未拉黑且目标账号仍有效的联系人；任一联系人失效时整次发布返回冲突，不产生部分动态或部分通知。
- 动态、图片资产绑定、每位联系人的 `NotificationType.SOCIAL` 通知和审计记录在同一数据库事务中完成。提交的图片项只包含 `mediaAssetPublicId`，服务端校验资产所有权与待绑定状态，并在持久化动态中替换为规范媒体 URL。
- 事务成功后发布既有 `social.post.created`，并为每条提醒通知发布 `notification.created`；失败时不发送成功事件。提醒通知标题为“动态提醒”，payload 只保存 `kind=post_mention` 与动态 ID 等必要字段。
- “提醒谁看”候选项从分页 `GET /api/v1/im/contacts` 读取，排除本人、拉黑和无效账号；支持联系人备注、用户名与 NeeDoID 搜索，不再回退到 Social 时间线作者列表。
- 正式发布页在选择图片后立即上传，上传中禁止发布；失败图片保留本地预览并可重试或删除。当前切片明确不开放视频上传，避免继续制造无法持久化的媒体成功状态。
- Social 的地点、提醒、可见范围和评论权限选择页复用聊天窗口同源的 `MobileFullscreenHeader` 与 `needo-composer-glass-header`，不再渲染独立实色顶栏或容器外返回按钮。

## 6.12 双槽位快捷回复与统一目录（2026-08-30）

- 同一用户对同一消息有两个互相独立的回复槽位：一个判断回复和一个普通表情。判断值固定为 `OK`、`NO`、`Pending`、`+1`、`Done`、`Cool`、`Good`、`Thanks`；同一类别不能同时存在第二个不同值，但判断回复和普通表情可以共存。再次点击当前值使用精确值 DELETE 取消，不会替换或删除同类别的其他值。
- reaction mutation 事务先按会话成员资格锁定权威消息行，再检查当前用户的有效槽位。同值 PUT 幂等返回且不增加版本；同类别已有不同值时返回 `40946 / error.im.reaction_slot_occupied`；只有真实新增或删除才递增 `reactionVersion` 并发布 `message.reaction.updated` SSE。
- REST 响应与 SSE 均携带单调递增的 `reactionVersion`，前端拒绝旧版本覆盖新状态。界面不再乐观插入或撤销回应，只在正式 REST 成功后采用完整聚合；409、429 与其他失败会保留最后确认状态并显示明确提示。
- 消息操作栏折叠时混合显示当前设备最近使用的判断和普通表情，并把“更多”固定在末尾；展开顺序以及输入框右侧表情面板的顺序统一为“常用表情 → 判断表情 → 一般表情”。v2 最近使用存储会迁移旧 v1 最近表情，最多保留 8 个唯一有效值；消息回应只在成功新增后记录，输入框插入则立即记录。
- 八个判断值使用独立、透明、紧凑的本地 SVG 字标，视觉高度不超过 26px。选中项保持彩色高亮并可再次点击取消；同一已占用类别的其他项使用原生 `disabled`、灰度和禁止指针，不进入 Store 或 API。
- 消息下方已经发送的判断回复使用独立摘要尺寸：字标固定为 22px 高并保留 SVG 自然宽度，不再被 28px 按钮压窄；普通表情以及操作栏、输入框目录仍保持原有紧凑尺寸。
- `20260830090000_message_reaction_slots` 数据迁移会先为每条历史重复槽位写入 `audit_logs` 可恢复快照，再按 `updated_at DESC, id DESC` 保留最新一条并软删除旧记录；同目录 `rollback.sql` 是显式运维回滚工件。`npm run check:message-reaction-slots` 只读检查所有有效记录，不满足双槽位约束时以非零状态退出。

## 6.13 通讯录好友软删除（2026-08-30）

> 历史切片：本节记录的单向软删除已由 6.16 的双向物理解除规则替代，不再是当前正式行为。

- 正式 IM adapter 的 `deleteContact` 不再返回 `error.feature_unavailable`，而是调用受 Bearer 鉴权与 `contact:delete` 权限保护的 `DELETE /api/v1/im/contacts/:contactId`。
- 后端只允许软删除当前认证账号拥有且仍有效的联系人行；其他账号的联系人、共享会话与消息均不受影响，越权目标统一返回安全的未找到错误。
- 软删除与 `im.contact.deleted` 审计写入同一事务，成功后发送 `contact.updated`，前端立即把该关系标记为 deleted，并通过后续正式联系人重读保持刷新后的状态一致。
- 新增 deployment migration `20260830060000_contact_delete_permission`，为 admin、merchant owner/staff、technician 与 customer 恢复 `contact:delete` 角色权限；不新增数据表、轮询、mock 或平行联系人状态。

## 6.13 已发布动态正式编辑保存（2026-08-30）

- 新增 `PATCH /api/v1/social/posts/:id`，沿用 Bearer 鉴权与 `social-post:create` 权限；仓储层同时匹配动态 ID、当前作者和未删除状态，非作者统一返回未找到，避免泄露或越权修改。
- 编辑请求沿用发布时的严格 Zod 媒体合同。原动态已经绑定且仍属于作者的图片可以复用，新上传图片仍须处于作者自己的待绑定状态；任一图片归属不符时整个事务回滚。
- 动态正文、可见范围、地点、媒体顺序、提醒联系人、待绑定图片、审计记录在同一事务中保存；已有互动计数不会因编辑被重置。提醒通知只发送给本次新增的联系人，不会在每次保存时重复提醒原联系人。
- 正式媒体信封开始保存 `mediaAssetPublicId` 与 `mentionUserIds`；旧动态会从规范 `/media/content/<sha256>.<ext>` URL 恢复可编辑图片引用，因此编辑页不需要重新上传原图。
- 保存成功后发布 `social.post.updated`，作者与关注者刷新正式时间线；前端只在 PATCH 成功后替换本地动态并离开编辑页，失败时保留编辑内容和错误提示。

## 6.14 动态页默认好友筛选修复（2026-08-30）

- 用户端、商户端和技师端每次进入完整动态页时统一默认选择“好友”，不再让浏览器中残留的“附近”或“我的动态”筛选覆盖入口默认值。
- “附近”“好友”“我的动态”仍可在当前页面自由切换；本修复只移除跨页面、跨刷新持久化的筛选记忆，不修改正式 Social API、好友关系、动态数据或视觉结构。
- 本地正式账号验收确认：先切到“我的动态”再刷新，页面会重新选中“好友”，并显示来自真实互相关注账号的动态。

## 6.15 双向通讯录好友与 Social 关系对齐（2026-08-30）

- 正式 Social 动态响应新增 `viewerIsFriend`，由后端根据双方均存在、未删除且未拉黑的 Contact 关系计算；单向手动联系人不会被误判为好友。
- Follow 继续只表达关注关系，好友筛选同时接受“正式双向 Contact”或“互相关注”，不再要求已经存在真实双向 Contact 的账号必须额外补写 Follow 才能看到公开动态。
- 好友空状态说明同步改为“好友发布的内容”，避免继续把正式双向 Contact 错写成必须互相关注。
- 接受好友申请后仍由后端事务建立双向 Contact；前端不再调用正式环境不可用的本地 `ensureMutualFollow`，而是在接口成功后刷新正式 Social 数据。
- 本地正式库只读核对确认：`LifeDance 管理员 2` 与 `LifeDance 管理员` 双向 Contact 均有效，后者的 `123456788888888` 公开动态真实存在，而两者之间没有 Follow；该组合纳入 repository 与前端筛选回归测试。
- 本节不修改现有数据、不新增 migration、mock、轮询或平行好友状态。

## 6.16 群聊隐私消息消失倒计时修复（2026-08-30）

- 群聊开启隐私模式后，新消息在服务端创建事务内快照当前 `privacyPolicyVersion`，并以服务端 `createdAt + disappearingTtlSeconds` 写入不可变 `expiresAt`；后续修改群设置不会回写旧消息期限。
- 正式消息 API / OpenAPI 返回 `expiresAt` 与 `privacyPolicyVersionAtSend`。前端只用这两个服务端权威字段生成倒计时，不再信任客户端 metadata 中可伪造的消失时间。
- 群聊隐私倒计时编辑器只显示小时和分钟；小时范围为 `0–99`，分钟范围为 `0–59`。超限时显示“时间上限最大为99小时59分钟”并阻止创建或保存。
- 正式创建与隐私更新 API 将 `disappearingTtlSeconds` 统一限制为 `60–359940` 秒；不新增 schema 或 migration。
- 消息历史和会话摘要在清理 worker 提交前也会过滤已到期消息，避免刷新页面短暂恢复；1 秒周期 worker 到期后在串行化事务中清空正文与 metadata、删除回应和本人删除记录、写入无正文的审计及删除同步记录，再硬删除隐私消息。
- 到期提交后向发送时的群成员发布不含正文的 `message.deleted` SSE，当前会话立即补拉并移除消息；同时修复未读数、已读游标和会话最后消息时间。
- 本节沿用现有 `messages`、`im_deletion_sync` 与审计结构，不新增 migration、mock、轮询或平行消息实现。

## 6.17 好友验证、双向解除与身份资料卡（2026-08-30）

本节替代 6.13 的“单向软删除”行为，并收紧 6.15 中 Contact 与 Follow 的边界。搜索结果不再直接创建联系人或会话；用户必须先进入账号资料页，再发送正式好友申请。

| 服务端状态 | 发出方“新的朋友” | 接收方“新的朋友” | 资料页操作 |
|---|---|---|---|
| `PENDING` 且未满 72 小时 | 等待对方验证 | 待处理 | 发出方只读等待；接收方可拒绝或添加好友 |
| `ACCEPTED` | 成功添加 | 成功添加 | 已成为好友，不再显示申请按钮 |
| `REJECTED` | 被拒绝 | 已拒绝 | 双方都可立即重新申请 |
| `EXPIRED`，或数据库时间已到 `expiresAt` | 已过期 | 已过期 | 可发送一条新的好友申请 |

- 72 小时从数据库 UTC `createdAt` 精确计算。相同方向在同一个未过期窗口内重复申请只返回原记录，不更新时间、不新增通知或红点；拒绝后可立即重新申请，过期后再次申请会创建新记录并重新通知。
- 只有接收方未处理的有效申请计入通讯录和“新的朋友”红点；申请行点击后进入共享全屏资料页，接收方右上角为关闭，底部为拒绝和添加好友。
- 接受在一个事务中创建双方 Contact 与双方 Follow，并恢复或创建唯一的好友直接会话参与关系。双方“新的朋友”列表保留终态“成功添加”。
- 手动关注或取消关注只修改当前方向的 Follow，不创建、删除或降级 Contact。成为好友时的自动互相关注仍由接受事务完成；删除好友时双方 Follow 与双方 Contact 一起物理删除。
- 任一方删除好友会物理删除双方 Contact、双方 Follow，以及仅删除方在好友直接会话中的 `ConversationParticipant`。共享 Conversation 与 Message 保留给未删除方；删除方的聊天列表及历史入口被真正删除，不使用 `hiddenAt`。
- 未删除方保留原历史，但此后发送消息会在写入 Message、未读数和 SSE 之前返回 `error.im.not_friends`。双方仍可从资料页或搜索重新申请；重新接受后删除方以新的参与时间作为历史可见边界，旧历史不会恢复。
- `BUSINESS_CONTEXT` 直接会话与 `GROUP_MEMBERSHIP` 群聊继续使用原授权规则，不套用好友消息门禁。
- 正式接口为 `GET /api/v1/im/directory/:userId`、`POST /api/v1/im/friend-requests`、`POST /api/v1/im/friend-requests/:id/accept|reject`、`DELETE /api/v1/im/contacts/:contactId`；公开的直接 Contact 创建入口已移除。
- `GET /api/v1/im/directory/:userId` 同时返回相应身份的只读资料卡。聊天“信息设置”使用该正式资料替代简易联系人块：用户、技师、店铺分别显示其可公开基础信息，信用值来自 `ReviewSummary`；不显示积分、利用次数或个人资料隐私开关。私密用户资料降级为不含私密字段的账号卡，无评价显示“—”而不是伪造 0 分。
- additive migration 为 `20260830200000_friend_request_verification`；部署前运行只读 `npm run check:friendship-conversation-pairs`，确认现有好友直接会话不存在重复 pair 后再应用 migration。

## 6.18 被删除方会话设置关系动作与资料字段修复（2026-08-30）

- 一方删除好友后，另一方保留的正式一对一会话会重新读取目录关系摘要；“信息设置”不再留下空白好友操作区，而是显示正式“添加好友”。点击后调用既有好友申请 API；若对方已有有效申请，则同一入口按服务端状态接受申请；发出申请后显示“等待对方验证”。
- 仍是好友时继续显示既有拉黑/解除黑名单与删除联系人操作，不把好友关系操作降级成申请入口。`friendship.deleted` 触发的 bootstrap 移除 Contact 后，已打开的设置页也会重新读取资料关系，避免停留在旧 `friend` 状态。
- 聊天“信息设置”资料卡不再渲染城市。用户身份的基础信息固定保留性别、年龄、身高三项；缺少值时分别显示“不公开”或“未设置”，不因字段为空而删除项目。
- 信用值的可见性只调整聊天“信息设置”：普通用户端隐藏，技师端与商户/店铺端保留。个人中心的信用值展示和数据合同不变。
- 本节只修改共享正式前端组件、关系状态接线、测试和文档；不新增 API、schema、migration、mock、轮询或浏览器业务持久化。

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
