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

## 6.19 判断贴纸消息发送后保持图片形态（2026-08-30）

- 输入框中的判断贴纸发送时，正式消息 `content` 继续保存可搜索、可复制的文字回退，同时在既有 `needoMessageExt` metadata 中保存版本化、结构化的文字与判断贴纸分段；不新增接口、表或 migration。
- 发送中的乐观气泡、发送失败气泡、正式发送成功气泡、SSE/历史重载、转发、引用预览和图片说明统一读取该分段，并继续使用共享 SVG 贴纸图片，不把 `OK / NO / Pending / +1 / Done / Cool / Good / Thanks` 拼成普通 DOM 文字。
- 客户端只在分段版本有效、判断值属于固定目录且所有分段合并后与服务端正文完全一致时启用贴纸渲染；异常、旧版或被篡改的 metadata 安全回退到正文。
- 标准撤回成功后会从结构化分段恢复输入框贴纸 token，而不是把判断值恢复为普通文字。纯文字与普通 Unicode 表情的发送合同保持不变。

## 6.20 动态详情回复栏复用聊天输入框（2026-08-30）

- 用户端、商户端和技师端共用的动态详情页底部快捷回复栏改为复用正式聊天 `ImChatComposer`，不再维护独立黑色渐变 footer、输入框尺寸和按钮样式。
- Social 左侧使用当前认证账号的 40×40 圆形头像替代聊天语音按钮；聊天默认语音输入、录音和既有行为保持不变。
- Social 保留共享表情面板；“+”复用正式聊天附件面板的交互，但只提供能由 Social 正式接口持久化的相册、拍照和位置。曾经进入完整回复页的旧接线已由 6.21 删除。
- 快捷回复继续通过正式 Social provider/API 创建；提交会裁剪并物化共享 composer 草稿，成功后才清空，受限评论状态保留可见输入栏并原生禁用交互。
- 本节只修改共享前端组件、Social 快捷回复接线、测试与文档；不新增 API、schema、migration、mock、轮询或浏览器业务持久化。

## 6.21 动态单一回复系统、正式回复计数与判断贴纸（2026-08-31）

- 用户端、商户端和技师端的所有回复入口统一进入动态详情并聚焦底部聊天式输入框；完整回复模式、替代详情模式及其入口已经删除，历史回复深链和旧 `replyToPostId` compose 链接只做无 UI 的替换重定向。
- 详情页头部统一为“回复动态”。每条回复使用独立圆角容器和容器间距，不再把多条回复包进同一个外框或用内部白线拼接。
- 底部回复栏复用正式聊天输入框：左侧用当前账号头像替代语音按钮，右侧保留共享表情和“+”。“+”只提供能通过正式 Social API 落库的相册、拍照和位置，不再打开已废弃的第二套回复页。
- `SocialPost.replyToPostId` 是带索引和外键的正式自关联；migration `20260831000000_social_reply_relation` 从有效 JSON 关系回填现有回复。列表、详情和创建响应的 `replyCount` 均由未删除子记录权威计算，前端不再依赖媒体信封计数。
- 详情页不再依赖启动时最多 100 条的时间线缓存：父动态通过正式详情 API 单独水合，回复通过 `replyToPostId` 服务端筛选逐页取完。缓存和请求按精确 `currentIdentity.id` 隔离；切换身份或离开详情会取消旧请求。SSE 只用完整分页快照原子替换当前讨论串，遇到重复页等不完整结果时保留上一份完整数据。
- 判断贴纸保存严格校验的版本化结构与文字回退。时间线、详情、独立回复卡、引用预览和刷新后的正式数据继续显示共享 SVG；没有结构化 `richText` 的普通 `Pending` 等文字仍按文字显示。
- 快捷回复的文字、判断贴纸、图片和位置均走同一个正式创建接口；回复卡会直接渲染持久化的图片/视频附件和位置标签。图片上传失败、提交失败或目标身份切换时保留或隔离草稿，不产生临时成功态。
- 本切片不新增 mock、轮询或平行回复状态，也不改变聊天端语音按钮和聊天完整附件能力。

## 6.21.1 PWA 聊天窗口底边统一（2026-09-06）

- 键盘关闭时，聊天窗口不再以 `100dvh` 作为固定高度并放弃 bottom 锚点；改为同时锚定视口顶部和底部，避免 iOS standalone PWA 的动态视口高度偏短时让整页悬空。
- 输入框容器与主页底部导航复用 `safe-nav-bottom`，不再维护聊天页独立的 safe-area padding。
- 输入框获得焦点、软键盘可见时，聊天窗口仍按实时 `visualViewport` 的高度、顶部和横向偏移收缩，不遮挡编辑区。
- 本微步骤没有新增 API、数据库表或 migration，也没有改变 IM 数据流。

## 6.21.2 Android / iPhone PWA 可见视口统一（2026-09-09）

- 6.21.1 的 `100dvh` 回退在部分 Android standalone PWA 中仍可能保留与实际可见应用区域不一致的动态高度，使固定聊天窗口提前结束，并把其余页面背景暴露为大块空白。
- iOS 与 Android standalone PWA 在键盘关闭时统一以 `visualViewport` 的实时高度、顶部和横向边界约束聊天窗口；键盘弹出期间继续沿用同一坐标系，收起后随恢复的可见视口重新占满应用区域。
- 普通浏览器窗口和桌面 standalone 继续使用动态 CSS 视口，不把可能包含浏览器工具栏变化的像素高度写死。
- 回归测试分别覆盖 iPhone 键盘关闭、Android 键盘关闭，以及 Android 键盘弹出后恢复；本微步骤不新增 API、数据库表、migration、mock 或轮询。

## 6.22 单聊自动翻译、语言能力与待处理好友资料修复（2026-08-31）

### 正式偏好边界

- additive migration `20260831120000_conversation_auto_translate_messages` 在 `conversation_participants` 增加非空布尔列 `auto_translate_messages`，默认值为 `FALSE`。该字段依附现有唯一边界 `conversationId + identityId`，因此同一账号的不同活动身份、不同会话以及同一会话的对方成员互不共享设置。
- `PATCH /api/v1/im/conversations/:conversationId/preferences` 接受可选布尔字段 `autoTranslateMessages`，并继续要求 `isPinned`、`isMuted`、`autoTranslateMessages` 至少提交一项。Service/Repository 只查找当前 Bearer 会话所认证的活动身份参与者；响应、OpenAPI、正式前端 transport 和 Store 模型均返回明确布尔值，兼容旧响应时安全回退为 `false`。
- “聊天内容自动翻译”只出现在一对一联系人信息页，默认关闭；群信息页不显示。提交期间开关锁定，Store 只在正式 PATCH 成功并返回完整会话后替换确认值；失败保留原确认状态并显示五语言可本地化错误，不使用 optimistic state、`localStorage` 或 `sessionStorage` 保存此业务偏好。刷新、重登和身份切换后的来源仍是服务端会话 payload。

### 只影响显示的自动翻译

- 用户消息正文节点显式标记 `data-no-i18n`，阻止全局 `I18nRuntime` 把用户内容误当界面文案。开关开启后，共享纯函数只对聊天页中对方消息气泡的 rich-text 文字片段调用现有 App `translateText`；对方图片/视频消息的说明文字使用同一边界。判断贴纸 SVG/结构化 token、原始正文与 metadata 不变，也未接入 DeepL、Google Translate、OpenAI 或其他外部翻译服务。
- 当前账号自己发送的消息、气泡内引用、输入框上方待发送引用、会话列表摘要、置顶摘要、会话内搜索结果和复制结果始终使用原文，不读取自动翻译偏好。系统消息、撤回残留、文件名、卡片字段和判断贴纸也不进入自动翻译。
- 关闭开关会直接从 Store 的原始消息重新渲染对方气泡原文，不需要回写或重新拉取。转发、重发、撤回恢复、搜索输入以及发送/持久化链路继续读取原始 `ConversationMessage`；任何派生翻译都不会写入 Store、REST/SSE payload 或数据库。

### 联系人语言与好友状态修复

- 联系人资料卡将 `ja/ja-JP/Japanese`、`zh/zh-CN/zh-Hant/Chinese`、`en/en-US/English`、`ko/ko-KR/Korean`、`th/th-TH/Thai`、`vi/vi-VN/Vietnamese`、`es/es-ES/Spanish` 统一显示为 `日本語 / 中文 / English / 한국어 / ไทย / Tiếng Việt / Español`。别名按规范化显示值去重；未知但非空的正式值会裁剪后保留，大小写不同的相同未知值也会去重。资料源不被修改，pill 使用 `flex-wrap` 和 `max-width` 避免窄屏横向撑开。
- 目录资料正式查询补齐技师 `languages` 与 `visibility`。技师语言只在资料已发布且可见性为 `public` 时返回；客户身份优先使用公开客户资料中的语言，仅当它为空时才允许回退到同一账号已发布且公开的技师资料语言。私密、已删除或不合格资料不会通过 fallback 泄露语言。
- 目录关系与好友申请创建判断只把双方未删除且 `source = friend_request` 的 Contact 视为好友；`technician_application` 等业务联系人既不会让目录误报“好友”，也不会让发送好友申请错误返回 `already_friends`。
- 资料页先解析仍在有效期内的正式申请，再处理可能滞后的 `relationship`。接收方保持两个独立按钮“拒绝”和“添加好友”，发出方保持只读“等待对方验证”，并禁止在有效申请存在时自动创建/跳转聊天；过期申请不能覆盖真实好友关系，已接受且没有有效申请的好友仍进入完整联系人信息页。

### 2026-08-31 自动化验证记录

- 聚焦后端命令 `npm --prefix backend test -- conversation-auto-translate-schema.test.ts realtime-api.test.ts realtime-service.test.ts realtime-repository-identity.test.ts friend-request-lifecycle.repository.test.ts openapi.test.ts`：沙箱内首次因 Supertest 临时监听 `0.0.0.0` 返回 `listen EPERM`；在受控权限下原命令重跑通过，`8` 个 suites、`100` 个 tests、`0` failures。Jest 的 `openapi.test.ts` 正则同时匹配仓库已有的 `backoffice-profile-detail-openapi.test.ts` 与 `exchange.openapi.test.ts`，所以实际为 8 个 suites。
- 范围收窄先把错误行为改成测试预期，确认旧实现产生 `13` 个失败，再修改实现；收窄后的 IM 聚焦回归为 `8` 个 test files、`145` 个 tests 全部通过。语言能力和好友按钮独立回归为 `6` 个 test files、`94` 个 tests 全部通过；前端全量为 `264` 个 test files、`1,675` 个 tests 全部通过。
- 后端偏好、目录资料、好友申请生命周期和 OpenAPI 聚焦回归为 `9` 个 suites、`117` 个 tests 全部通过。新工作树首次运行前先执行 `npm run prisma:generate`；未连接或修改数据库。
- `npm --prefix backend run prisma:generate`、`npm --prefix backend run lint`、`npm --prefix backend run build` 与根目录 `npm run lint` 均退出 `0`。计划命令 `npm --prefix backend exec -- prisma validate` 从仓库根目录解析 schema，因找不到 `./prisma/schema.prisma` 退出 `1`；在 `backend/` 目录执行等价的 `npm exec -- prisma validate` 后正式 schema 校验通过。
- `npm run verify:production-build` 当前为 **GREEN**：Vite 成功转换 `503` 个模块，生成的 `i18n-B5Wo-LxK.js` 为 `3,703,025` bytes、`main-eHabnjBK.js` 为 `3,389,214` bytes；生产审计通过 `8` 个 HTML entries 与 `23` 个 assets，总命令退出 `0`。同次构建仍显示仓库既有的 `SocialProfilePage.tsx` 静态/动态混合导入警告和大 chunk 警告，但不影响既有门禁判定。
- `git diff --check` 与从基线 `cbf05a86` 到当前实现 HEAD 的 `git diff --check cbf05a86..HEAD` 均通过。禁止模式扫描只命中仓库既有的 IM 草稿/滚动/筛选/最近表情等 UI 状态持久化，以及一个新增测试的 `window.localStorage.clear()` 清理；实现差异没有新增浏览器业务偏好、`TODO`、`FIXME`、`not implemented`、`sessionStorage` 或外部翻译提供商引用。人工差异核对确认派生翻译只进入对方气泡 render helper，没有赋回 `ConversationMessage`、Store 或发送/转发/重发/撤回输入。

### 仍待授权的正式验收

- 本轮没有应用 `20260831120000_conversation_auto_translate_messages` migration，没有修改正式数据库，没有启动或接管浏览器端口，没有发送测试消息，也没有执行部署或线上验收。
- 生产 bundle 预算门禁已恢复为 GREEN；仍需用户明确授权，才可在受控本地正式环境核对端口/工作树归属、应用 migration、用双方真实测试身份验证默认关闭与身份/对端隔离、验证 `测试测试` 的历史/新消息开关与刷新持久化、验证只有对方气泡正文和对方媒体说明发生显示翻译，并检查本人消息、贴纸、引用、复制、置顶、列表、搜索、转发仍使用原始 payload；同时核对真实资料语言与移动端换行、console/请求/安全区，并清理临时消息与偏好。

## 6.23 点击录音、自动试听与正式语音消息（2026-08-31）

- 用户端、技师端和商户端共用的会话页把语音入口改为单击开始录音；录音浮层会模糊、压暗并禁用下层会话界面。录音气泡从 `59″ 后将停止录音` 开始倒计时，录音态只显示 X 与停止，不包含长按、上滑取消、转文字按钮或底部半圆。
- 手动停止或达到 59 秒上限都只结束录音并自动试听，不再自动发送。预览态固定显示 X、重放与纸飞机发送；重放从头开始，只有用户明确点击发送才调用正式接口。发送失败保留同一个本地 Blob 与 object URL 供重试，发送成功才关闭浮层并把焦点还给语音按钮；文字草稿和引用消息保持不变。
- 正式接口为 `POST /api/v1/im/conversations/:conversationId/voice`，使用原始音频请求体，只接受 WebM、MP4 或 Ogg，最大 8 MiB，并要求 Bearer 鉴权与 `message:create` 权限。服务端生成不可预测的媒体文件名，消息只保存配置后的 `/media/im/<opaque>.<audio-ext>` URL 和必要元数据，不保存 data URL 或音频字节。
- 服务端先复用正式发送资格预检，再在创建 Message 的事务内重验成员、拉黑、好友、业务会话或群成员资格；Message 创建失败会补偿删除已经写入的媒体文件。成功响应、发送方 Store、接收方 SSE 与历史重载继续使用同一个权威 Message。
- 本切片不新增 schema、migration、mock、轮询、转写或平行消息实现。前端 9 个聚焦套件 174 项测试、后端 7 个聚焦套件 95 项测试、前后端 lint/类型构建、i18n 审计和正式生产构建安全门均已通过；完整会话页运行测试与录音 hook、浮层、共享 composer 测试共同覆盖单击打开、停止试听、失败保留、成功关闭和焦点恢复。浏览器页面点击、权限、失败重试、双账号 SSE/重载播放仍待隔离正式运行验收，当前不标记为已通过。

## 6.24 服务端权威语音时长与纯音频校验（2026-08-31）

- `durationSeconds=1..59` 继续作为兼容客户端的整数提示，但不再作为消息时长权威值。服务端在正式发送资格预检通过后、媒体落盘前解析请求体，要求可证明存在音频轨且不存在视频轨；解析失败、轨道信息不完整、视频媒体或真实时长超过 `59.5` 秒都统一返回 `400 / error.im.voice_duration_invalid`。
- 服务端权威整数时长为真实秒数向上取整后限制到 `1..59`；客户端提示与权威整数最多允许相差 1 秒。成功消息的 `needoMessageExt.duration` 只保存该权威整数，不再保存 query 提示值。
- WebM、MP4 与 Ogg 使用固定版本 `music-metadata@11.15.0` 在 Node Worker 中解析。默认最多同时运行 2 个 Worker、排队 8 项、每项 2 秒超时，并限制 Worker 的 old/young heap 与 stack。队列不预复制音频；任务获得活动槽位后才创建一次专用缓冲区并转移给 Worker，Worker 使用零拷贝 Buffer 视图，避免满队列时重复放大 8 MiB 请求体。
- 任何实际媒体校验失败都发生在存储、Message 事务、未读数、成功审计与 SSE 之前；原有 transaction-time 成员/好友/拉黑/业务会话/群成员重验和媒体补偿删除保持不变。本切片不新增接口、schema、migration、mock、转写或系统级媒体二进制依赖。
- A1 聚焦后端验证为 6 个套件、85 项测试全部通过；后端全量为 328 个套件、2228 项测试通过，另有 10 个套件、38 项按既有配置跳过。后端 lint、TypeScript build、正式前端 production build 与 bundle audit 均通过。独立代码审查关闭了 Worker 缓冲区复制与生命周期测试问题，最终 P0–P3 均为零。
- B1 已在隔离正式本地运行中完成浏览器录音验收：单击语音入口、授权麦克风、停止后自动试听、手动重放，以及 X / 重放 / 纸飞机按钮均已验证；为避免产生业务数据，验收未点击发送。`npm audit --omit=dev` 仍报告现有其他依赖路径中的 12 项告警（1 low、4 moderate、7 high），新增 `music-metadata` 路径未出现在告警列表，本切片未执行自动升级。

## 6.25 消息多选、不可变聊天记录与正式翻译（2026-08-31）

### 数据、权限与身份边界

- additive migration `20260831160000_im_chat_records_translation` 新增 `ImChatRecordBundle`、`ImChatRecordItem`、`ImChatRecordDelivery`、`ImChatRecordFavorite`、`ImMessageTranslation` 和 `ImMessageBatchDeleteCommand`，以及 `message:forward`、`message:favorite`、`message:translate` 三个正式权限；本轮只校验 migration/schema，没有应用到共享数据库。
- 记录包由当前正式身份创建，服务端只接受来源会话和 1–100 个消息 ID，重新验证参与者、本人可见性、撤回/过期/隐私状态并按权威顺序生成不可变快照。媒体复制到受保护记录项存储，失败时整单回滚并补偿文件。卡片 metadata 只保存公开 UUID 与最小已验证摘要，不内嵌完整正文。
- 详情读取要求当前身份是创建者、有效收藏所有者，或仍可读取对应投递消息的目标会话参与者；失败统一为安全未找到。收藏移除只软删除当前身份的收藏关系。三人及以上标题统一为五语言“群聊记录”，不再展示任意两个人名。
- 批量删除在一个事务中为当前身份写 `MessageUserDeletion` 并保存幂等命令结果，1–100 条先全量验证再落库；共享 `Message` 和对方可见历史不变。写动作审计不含正文。

### 正式接口与前端行为

- 新接口为 `POST /im/conversations/:targetConversationId/chat-records`、`GET /im/chat-records/:publicId`、分页 `GET /im/chat-records/:publicId/items?beforePosition=&pageSize=50`、鉴权媒体读取、聊天记录收藏的创建/分页 `GET /im/chat-record-favorites?page=1&pageSize=20`/移除、`POST /im/conversations/:conversationId/messages/delete-for-me` 及 `POST /im/conversations/:conversationId/messages/translations`，统一位于 `/api/v1`，使用 Bearer、Zod、RBAC 与 OpenAPI；分页字段按实际契约使用 `pageSize`。
- 长按菜单保持既有玻璃容器、箭头、表情区与仅半透明压暗的无滤镜下层；动作固定四列两行。常用表情在一次打开期间冻结，使用记录只影响下次打开。
- 多选以长按消息为锚点，左侧圆圈是唯一逐条切换入口；上下“选择到这里”与底部转发/复制/收藏/删除栏固定悬浮。普通点按消息区取消，实际拖动或滚动后抬手不取消，文字选区手柄拖动不滚动并退出多选。一次最多 100 条。
- 单条/多条转发都是一张不可变聊天记录卡；收藏整体保存为一项，二者复用带右侧关闭按钮和信息入口的只读全屏窗口。用户中心 `/me/favorites` 保留动态收藏，并通过同一入口下的 `/me/favorites/chat-records` 进入聊天记录收藏。多选复制按权威顺序输出 `发送者:内容`，显示译文存在时复制显示译文，否则复制原文。

### DeepL Free 与无密钥行为

- 翻译业务依赖 `TranslationProvider`，首个实现为 DeepL；浏览器只调用 NeeDo 后端并且永远拿不到第三方 key。`IM_TRANSLATION_PROVIDER=disabled` 是无 key 默认值：后端仍可启动，符合条件的外部翻译请求返回脱敏的 provider-unavailable 错误，不伪造成功。选择 `deepl` 时缺少 HTTPS base URL 或非占位 key 会在启动配置校验失败。
- DeepL 官方当前限制为 API Free 每月 500,000 字符、单请求总大小 128 KiB；实现按 128 KiB 上限分块。HTTP 429 使用有限次数、带延迟的指数退避，HTTP 456 映射为额度耗尽，超时/不可用不缓存原文。参考 [Usage and limits](https://developers.deepl.com/docs/resources/usage-limits) 与 [Error handling](https://developers.deepl.com/docs/best-practices/error-handling)。
- 手动翻译只处理当前长按信息并在原文下方显示译文，再次长按切换为“隐藏译文”；会话自动翻译开启时手动按钮置灰，自动请求最多 50 个消息 ID。前端不提交原文，服务端只加载当前身份仍可见的用户文字或图片/视频说明。

### 验证和仍待授权项

- 五语言新增文案使用完整短语键处理动态选中数量和批量删除确认，不依赖片段拼接；日语“选择到这里”为 `ここまで`。自动化测试覆盖紧凑菜单、无滤镜遮罩、翻译显隐/复制、固定范围按钮、手势仲裁、不可变记录卡/详情、收藏分页、身份访问、媒体、幂等和仅本人删除。
- 本轮未应用 migration、未读取或修改共享数据库、未创建测试消息/收藏、未调用真实 DeepL，也未推送或部署；代码已在完整自动化验证后合并到本地 `main`。390px/440px 双账号浏览器验收依赖正式 migration、临时消息/收藏和仅本人永久删除验证，必须另行取得这些数据写入与清理授权；在此之前不标记为通过。

## 6.26 可听语音预览与居中放大控制（2026-08-31）

- 自动化聚焦命令 `npm test -- src/features/im/useImVoiceRecording.test.tsx src/features/im/ImVoiceRecordingOverlay.test.tsx src/features/im/pages.test.ts src/features/im/pages.test.tsx src/features/im/components.composer.test.tsx src/i18n/translations.test.ts` 通过：6 个 test files、154 个 tests、0 failures。
- 根目录 `npm test` 通过：264 个 test files、1,679 个 tests、0 failures。
- `npm run i18n:audit` 退出码为 0；本次输出摘要为 `zhSourceCount=12195`、`nonZhSourceCount=3200`、`coveredCount=7328`、`recoverableFromIndexedCount=0`、`missingCount=4867`。任务要求的既有 5 秒超时在本次重跑中未出现。
- 补齐测试 mock 的严格 `this: HTMLMediaElement` 类型后，`npm run lint` 通过；`npm run verify:production-build` 完成 TypeScript、formal Vite build 与 production bundle audit，8 个 HTML 入口和 23 个资产检查通过。最终 `git diff --check` 通过，没有放宽门禁。
- 随后主工作树出现与本语音切片无关的 Social 并行修改；本任务复核时 `npm run lint` 与 `npm run verify:production-build` 均在 `src/features/social/formal-adapter.test.ts:68:7` 因 `counters` 不属于 `RealtimeSocialPost` 而退出。该并行修改未纳入本次文档提交，也未放宽门禁。
- 正式运行监听已确认来自当前检出：前端 `5180` 的 cwd 为仓库根目录，后端 `3000` 的 cwd 为 `backend/`。在 `http://127.0.0.1:5180/user.html#/messages/2546` 实测单击打开、录音态 X + 停止、预览态 X + 重放 + 发送、动作区 `top-[57%]`、72×72 CSS 像素按钮、Blob 音频 `muted=false` / `defaultMuted=false` / `playsinline=true` 及播放进度；用户确认实际录音回放有声。`volume=1` 已由 hook 回归测试覆盖并在每次 `play()` 前设置，但本次浏览器检查接口未返回该属性，因此不标记为浏览器直接取值通过。440×956、320×956、持续静音输入提示、失败重试及双账号 SSE/重载播放仍未在本切片重新验收。

## 6.27 动态互动权威计数、用户收藏与好友私信转发（2026-08-31）

### 权威数据与权限边界

- additive migration `20260831150000_social_post_interactions` 新增 `social_post_likes`、`social_post_bookmarks`、`social_post_views` 与 `social_post_shares`。四张表均包含软删除时间与审计时间；点赞、收藏和浏览以 `postId + identityId` 唯一，转发以 `postId + actorIdentityId + targetUserId` 记录投递，并以 `actorIdentityId + idempotencyKey + targetUserId` 阻止重试重复消息。
- `social-post:interact` 已进入正式 permission catalog，并授予 `admin / merchant_owner / merchant_staff / technician / customer`。所有互动路由要求该权限；好友私信转发同时要求现有 `message:create`。Service 始终从当前 Bearer 会话解析活动身份，Controller 不直接访问 Prisma。
- 列表、详情和每个互动响应都返回服务端 `counters.likes / reposts / views / bookmarks` 与当前活动身份的 `viewerInteraction.liked / bookmarked / shared`。旧正式种子写在 media envelope 内的计数只作为兼容基线读取；新增关系计数叠加其上，不回写旧 JSON，也不把浏览器状态当作累计来源。

### 正式 REST 与实时事件

- `PUT /api/v1/social/posts/:id/like`、`DELETE /api/v1/social/posts/:id/like`、`PUT /api/v1/social/posts/:id/bookmark` 与 `DELETE /api/v1/social/posts/:id/bookmark` 使用幂等软恢复/软删除并返回权威动态。`POST /api/v1/social/posts/:id/view` 对同一活动身份只累计一次有效浏览。
- `GET /api/v1/social/posts?bookmarked=true&page=...&pageSize=...` 仍是分页接口，并只返回当前活动身份有效收藏的可见动态；资料隐私、作者屏蔽和 follower-only 可见性继续由 Repository 的统一可见性条件约束。
- `POST /api/v1/social/posts/:id/shares` 接受 1–20 个去重 `targetUserIds`，要求 `Idempotency-Key`，拒绝本人、非双向正式好友、拉黑关系和无权看到 follower-only 动态的收件人。事务内复用或恢复一对一 friendship conversation，并创建带 `needoMessageType = social-post-card` 的正式 Message；重复相同 key 只返回既有投递，不重复增加转发计数、未读数或 SSE。
- 点赞、收藏和首次浏览通过 `social.post.interaction.updated` 通知当前账号、作者及现有关注者刷新权威动态；首次好友转发继续使用正式 `message.created` 发送给双方。未新增轮询、浏览器业务存储或平行 IM 数据源。

### 前端统一入口

- 时间线和详情的点赞、收藏及浏览直接调用正式 API，并只提交服务端返回的 post/counter/viewer state。收藏入口改为客户个人中心 `/me/favorites`；页面数据来自正式 bookmarked 分页启动快照，复用同一动态卡片，取消收藏后按确认状态移除。
- “转发”页不再发布到公共时间线，也不再维护失效的快速转发/引用转发按钮；它加载正式联系人候选，支持搜索和多选，并把动态卡片发给所选好友。聊天消息模型、会话摘要和气泡共同识别 `social-post-card`，可从卡片返回原动态。
- 互动请求失败不再产生 optimistic 计数；原确认状态保留。所有三端继续复用 Social provider 与同一详情/时间线组件，本切片没有复制三套 UI。

### 自动化与本地正式验收

- 聚焦前端回归覆盖权威映射、正式 provider、好友转发页、详情浏览、个人中心收藏入口、IM 正式消息解析和翻译质量：8 个功能文件、145 项通过，独立 i18n quality 1 项通过。最终前端全量使用 `npm test -- --testTimeout=20000`，265 个文件、1,689 项通过；默认 5 秒上限的前一轮只有既有 `ReactionCatalog` 1 项在满负载下超时，该文件随后独立 3/3 通过。没有修改该组件、断言或生产超时。
- 聚焦后端 Social/Realtime/OpenAPI 回归为 6 个 suites、47 项通过。最终后端全量使用 `npm test -- --testTimeout=20000`，339 个 suites、2,290 项通过，另有 10 个 suites、38 项按既有配置跳过；默认 5 秒上限曾使两个 bcrypt 密集认证用例在满负载下超时，未修改 bcrypt rounds、限流或认证代码。
- `npm --prefix backend run lint`、`npm --prefix backend run build`、根目录 `npm run lint`、`npm run i18n:audit` 与 Prisma schema validate 均退出 `0`。正式 `npm run verify:production-build` 检查 8 个 HTML 与 25 个 assets 通过；页面专属五语文案留在懒加载的 `SocialFavoritesPage` / `SocialRepostPage` chunk，`i18n` chunk 为 3,703,450 bytes，没有提高 3,704,096 bytes 预算。
- 2026-08-31 再检查时，`needo_dev` 已存在成功的 `20260831150000_social_post_interactions` 记录，其 checksum `408ae19a...` 与当前仓库 migration 一致；此前因 MySQL 64 字符标识符上限失败的长索引版本保留为 rolled-back 记录。四张互动表、外键、短名称幂等唯一索引和五类角色授权均与当前 migration 一致，`prisma migrate status` 报告仓库 80 个 migration 全部已应用。本次没有手改 `_prisma_migrations` 或执行原始 DDL；数据库中仍有与本 Social 切片无关、当前 checkout 不包含的历史记录，不把它们解释或复制回仓库。
- 本地正式数据验收使用 `sim.customer.100@needo.local` 的 customer identity、动态 `64774` 和一个既有双向好友会话。真实 API 验证了点赞/取消及刷新持久化、收藏分页添加/移除、同身份两次浏览只累计一次、好友收到 `social-post-card`、重复同一 `Idempotency-Key` 不重复计数或消息、发送方互动 SSE 与接收方消息 SSE。验收脚本随后按精确 ID 删除 interaction/share/message/audit，并恢复 conversation 与 participant 的未读、last-read、隐藏状态和时间戳；复查所有 marker 为零、动态计数回到基线。
- 440×956 浏览器验收确认：详情首次进入从 1 次浏览变为 2，刷新仍为 2；用户中心 `/me/favorites` 收藏后可见且刷新持久；转发页加载 12 位正式好友，选择后发送按钮启用、取消后禁用；动态、收藏和转发页均无横向溢出且 console error 为零。浏览器产生的临时 bookmark/view 及对应 audit 已按精确 ID 清理，时间线恢复未收藏与原计数。

## 6.28 主动打开的 IM 图片/视频本地加密缓存（2026-09-05）

- 只有用户点击消息气泡进入全屏查看器后，客户端才以同源 `cache: no-store` 请求读取原图或原视频字节并写入 IndexedDB；全屏首开直接使用该响应生成的临时 Blob URL，不再二次直连远端 URL。聊天列表、消息气泡缩略图和仅收到消息都不会触发 IndexedDB 持久缓存。
- IndexedDB 数据库固定为 `needo.im.cache.v1`，以账号、会话和消息三重键隔离媒体记录。每个账号使用浏览器 Web Crypto 生成的不可导出 AES-256-GCM 密钥，AAD 同时绑定账号、会话和消息；媒体类型、MIME 和字节都位于密文内，不明文保存媒体 URL、文件内容或认证 token。
- 全屏查看器先读取当前账号的加密副本。本地副本存在时，即使服务端后来返回过期状态仍继续显示；不存在时，仅权威 `mediaState=expired` 或 HTTP 410 显示“图片已过期”/“视频已过期”，404、鉴权、网络与其他交付错误继续显示可重试的加载失败。气泡远端加载失败或显示过期状态后仍提供“查看本地副本”入口，使正式气泡到全屏缓存回退路径可达。
- IM 静态媒体响应改为 `Cache-Control: private, no-store`，前端展示路径统一追加 `needo_media_policy=2` 以立即绕开旧版本已经写入的一年期 immutable 条目，避免 IndexedDB 加密副本清除后浏览器仍使用历史明文 HTTP 缓存；公开内容媒体与头像的既有缓存策略不变。
- 登出或切换账号会在新凭证对订阅者可见前先丢弃旧账号的内存密钥并撤销活动 object URL。本人删除、标准撤回、历史返回的撤回墓碑以及在线 `privacy_expired` 事件会同步建立消息级终止标记并清除对应副本；`state + media` 使用同一个 IndexedDB 读写事务完成“无墓碑才写入”或“写墓碑并删除”，因此不同标签页中的旧下载也无法在删除后重新落盘。终止事务会先重试三次，持续失败则登记到当前会话的后台重试队列直至成功，同时保留 `error.im.local_cache_purge_failed` 可恢复状态并在会话页提示用户前往“账户与安全”清除当前设备缓存，不会静默宣称删除完全成功；实时隐私删除只有清理成功后才刷新移除消息，历史撤回墓碑则先应用权威状态并释放分页，再独立清理本地密文。隐私倒计时消息在 durable deletion sync 尚未完整接入前禁止进入持久缓存。
- 媒体字节已成功读取但 IndexedDB、配额或加密写入失败时，当前查看仍使用临时 Blob URL，并明确提示“媒体已显示，但本地缓存不可用”；终止删除竞态不降级展示旧字节。
- 用户、技师和商户端“账户与安全”页面新增当前账号的媒体缓存用量与二次确认清除入口；清除只影响当前设备和当前账号，不删除服务器消息。Afirieito 端不接入本切片。
- 本切片不新增后端接口、数据库表或 migration，仅收紧既有 `/media/im/*` 的 HTTP 缓存响应；不改变 IM/Social 主体视觉结构，不缓存语音、文件或 Social 媒体。服务端普通媒体过期 worker、410/权威 `mediaState` 生产契约、离线 deletion sync 和跨会话过期验收仍是后续独立微步骤；在这些服务端能力落地前，不把普通 404 误报成“已过期”。

## 6.29 会员权益驱动的无痕撤回（2026-09-06，本地代码验收）

- 撤回接口仍只接收兼容动作 `{ "mode": "standard" }`，客户端不能选择或根据会员展示状态推测无痕模式。`RealtimeService` 会在事务写入前，以撤回发生时刻解析当前用户的正式 `traceless_recall` 有效权益；当前有效会员资格、已发布等级/版本中的权益开关、权益目录全局开关与可用交付能力都必须同时满足。无资格按标准撤回处理；权益解析基础设施、目录或能力异常直接失败，消息保持原状，不允许静默降级造成双方分叉。
- 服务端将最终 `STANDARD` 或 `TRACELESS` 写为消息终态，并在响应中返回实际 `standard_recall` 或 `traceless_recall` action。重复请求读取并返回已持久化终态，之后会员升级、降级、版本或全局开关变化不会重释历史结果。现有发送者权限、会话参与者校验及 180 秒撤回窗口未改变。
- 标准撤回继续是双方可见的无正文占位。无痕撤回清理可识别内容，写入 `TRACELESS_RECALL` 删除同步事实和 `im.message.traceless_recall` 无内容审计事实；实时和删除同步载荷不得包含正文、译文、媒体 URL、存储键、文件名或缩略图。首次无痕撤回只对消息创建时已经在会话内且尚未阅读的接收者下调未读数；幂等重放不重复调整。
- 消息历史分页和会话最后一条消息共用可见性过滤：`TRACELESS` 行同时从历史和预览排除，不能泄露已撤回内容、消息类型或“已撤回”摘要；`STANDARD` 终态仍返回既有占位模型。在线 `message.recalled` 事件带服务端终态，且本切片已持久化内容无关的 `TRACELESS_RECALL` 删除同步事实；但尚无 `/im/sync` 路由或客户端读取器，离线设备的持久删除同步消费与缓存清理仍待后续独立步骤完成。
- 正式前端只相信响应和 SSE 中相互一致的服务端 action / `recallMode`。`standard` 保留现有占位和发送方草稿回填；`traceless` 清理终态媒体、按消息 ID 删除气泡、从剩余消息重建会话摘要并补拉权威启动数据。无痕删除屏障优先于陈旧历史、延迟乐观响应、重复或乱序 SSE，不能重新出现撤回残留。
- 本轮只完成本地代码与自动化验证边界：未新增或应用 migration，未推送、未部署到 staging/production，且未进行已认证双账号浏览器验收。后续发布前仍须在独立授权步骤中应用/核对正式数据库状态，并验证有权益与无权益账号的双方窗口、刷新历史、预览、未读数、SSE 与移动端显示。

## 6.30 个人中心与 IM 联系人资料一致性（2026-09-08，本地）

- 用户个人中心、资料编辑页和 Core Read 适配器不再把空语言伪装成 `日本語`，也不再把示例说明写成正式自我介绍。正式值为空时只在展示层显示“未设置”，保存 payload 保持空数组或空字符串。
- `GET /api/v1/im/directory/:userId` 的客户会员标签改为使用数据库时钟解析正式平台会员数据：当前有效的人工 adjustment 优先，其次是当前 entitlement；没有正式记录时返回 `free`。已授予 entitlement 可继续引用后来归档的不可变 tier version，与 `PlatformMembershipService.resolveMembershipAt` 的规则一致，不读取旧 `CustomerProfile.membershipLevel`。
- 会话列表和联系人列表在正式 IM store 进入 ready 状态时刷新 bootstrap，使联系人行、会话头像和显示名重新读取权威 participant。会话信息页同时使用本次 DirectoryProfile 响应中的 `user` 与 `identityCard`，避免新简介/语言配旧头像或旧 NeeDo ID。
- 联系人卡保持既有隐私裁剪，只显示该身份允许公开的字段；语言与自我介绍统一使用独立信息面板。平台四个会员等级分别显示为免费、白银、黄金和黑钻，并补齐繁中、日文、英文、韩文翻译，不再把白银合并为黄金。
- 本切片不新增表、migration、mock 或浏览器存储资料源；只在本地修改和验证，未推送、未部署 staging，也未修改远程环境。

## 6.31 IM 身份显示与 iPhone PWA 输入区回归修复（2026-09-09，本地 temp）

- IM 表情反应中的用户名称不再直接读取账号表的旧 `username`，而是与会话参与者和联系人列表共用当前消息身份的资料名解析规则；客户、技师、商户和其他身份分别读取各自的正式显示名。
- 打开其他联系人的资料时，优先沿用当前联系人记录中的 `contactIdentityId`。只有不存在联系人身份上下文时才回退到该账号的规范身份，避免同一账号的客户身份名、运营身份名和资料页标题互相串用。
- iPhone 已安装 PWA 在键盘关闭时使用 `visualViewport` 的实际可见像素边界约束聊天房间；普通 Safari 和非 iOS 环境继续使用 `100dvh`。键盘打开、关闭尾段、横竖屏和底部安全区的既有处理保持不变。
- 表情和更多功能面板的最小高度恢复为原先的 `min(72px, 40%)`，仍受当前可见聊天高度的上限与内部滚动约束。
- 本轮不新增数据库表、migration、mock 或数据修复脚本。服务共享信息卡同步移除店铺 ID 与店铺地址两行展示，但继续保留数据模型中的正式字段供其他获授权的详情表面使用。
- 本地前端使用 `codex/temp` 分支的独立 `5190` 端口运行；本节不构成 staging 或 iPhone 真机验收，未推送、未部署，也未修改任何远程环境。
- 前端定向 5 个文件、40 项及排除两份 Node runner `.mjs` 后的 Vitest 全量 500 个文件、3,356 项通过；根目录 TypeScript lint、formal production build 和 8 个 HTML/61 个资产的产物审计通过。后端相关仓储/服务/API 127 项、ESLint 与 TypeScript build 通过。默认 12 分片全量中，除既有 `backfill-technician-shop-affiliations.ts` 对可空 `shopId` 的类型错误外其余分片完成；一次无关 Backoffice HTTP 解析波动单文件复跑 32/32 通过，未为本切片扩大修改范围。

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

## PWA 聊天输入栏裁切修复（2026-09-07）

- 关闭键盘时，会话容器明确使用 `100dvh`，不再用 `height: auto` 加上下锚点拉伸；样式默认值也使用动态视口高度，避免固定定位布局区域偏高时输入栏落在可见区域之外。输入栏继续使用既有 `safe-nav-bottom` 安全区。
- 键盘弹出时继续使用 `visualViewport` 的高度与偏移；键盘关闭但编辑器仍有焦点时恢复动态视口。
- 回归：旧实现的两个高度断言失败；修复后 IM/PWA 定向测试通过。440×956 浏览器受控布局实验将固定定位包含块设置为 1018px，旧实现输入栏底边 984px，修复后 922px，保留测试设置的 34px 底部安全区。
- 上述实验验证布局算法，不等于 iOS 独立 PWA 真机验收。发布后仍需在 iPhone 16 Pro Max 主屏幕 PWA 检查冷启动、已有会话、键盘弹出/收起、表情/附件面板和横竖屏切换。本次未推送或部署。

### 本地补验（2026-09-08）

- 独立本地前端 `5191` 从本修复目录启动，并验证 `/api/v1/health` 代理通往正式后端；现有 `5180` 属于另一个运行工作树，不作为本次修改已加载的证据。
- `outputs/pwa-composer-qa/` 中的临时组件检查页直接导入正式 `ImStandaloneShell` 和 `ImChatComposer`。440×956 iframe 内，收起/表情/附件状态的容器底边均为 956px，输入栏完整位于可见区域内；模拟 34px 底部安全区时，输入栏底边为 922px。测量记录为 `outputs/pwa-composer-qa/evidence.json`。该页面不创建会话、不调用发送 API，也不构成登录聊天或 iPhone PWA 真机验收。
- IM/PWA 定向回归 4 files / 141 tests 通过。默认 `dist` 构建因共享输出目录 `ENOTEMPTY` 中止，改用本任务独立输出目录 `outputs/pwa-composer-build-20260908` 后，TypeScript 和 formal Vite 构建均通过（618 modules）；保留既有静态/动态导入分包提示，未清理或覆盖其他工作结果。

### 同类裁切补充排查（2026-09-08）

- 修正键盘检测：以可见高度收缩判定键盘，`offsetTop` 只用于定位，避免焦点抬升页面后误判键盘关闭。键盘已检测到时，编辑器失焦不立即恢复全屏；保留既有 80px 收缩阈值，视口恢复后回到 `100dvh`，不把无编辑焦点的陈旧短视口当作键盘。
- 增加 `pageshow` 尺寸刷新，避免从页面缓存恢复时继续使用之前的键盘像素高度；监听器随组件卸载清理。
- 表情/附件面板最大高度同时受当前聊天可见高度限制。面板展开时允许外部容器收缩，但输入框不参与压缩；面板留白放入滚动内容，避免多行输入时固定 padding 形成不可收缩高度。
- 新增 hook 回归：焦点导致视口上移、先失焦后关闭键盘、页面恢复、无焦点的陈旧视口。其中前 3 项在修复前失败，修复后通过。
- 完整聊天结构的本地组件验证（440×956、模拟键盘可见高度 320px、安全区 34px）：旧面板容器超出可见区；修复后单行和七行输入均保持容器底边 320px、面板底边 286px，七行输入底边 268px。测量在入场动画结束后进行。本节不构成 iPhone 已安装 PWA 真机验收，未推送或部署。

- 补充修复最终验证：5 files / 145 tests 通过，TypeScript + formal Vite 构建通过，输出为 `outputs/pwa-composer-build-20260908-extra-final`；标准高度下的输入栏、附件面板和 34px 安全区复测通过。

### 本地 main 整合（2026-09-08）

- 仅整合 PWA composer 修复，不合并源分支的其他历史提交。保留 main 原有 `Math.max(innerHeight, documentElement.clientHeight)` 键盘检测基准与 `visibilitychange` 恢复监听；关闭键盘时统一使用动态视口高度，替换物理屏幕高度推算。
- 保留 main 既有 iPhone/横竖屏/普通 Safari 测试，将新增生命周期回归放到独立测试文件。整合版本定向回归 6 files / 154 tests 通过。

- main 基线整合版本 TypeScript + formal Vite 构建通过（816 modules），输出保存在主工作区 `outputs/pwa-main-integration-build-20260908`；未推送或部署。

### 输入内容组合与键盘关闭尾段裁切修复（2026-09-08，本地）

- 会话输入区现在始终允许在聊天剩余高度内收缩。多行草稿、待发送图片和引用同时存在时，图片与文字区域在输入胶囊内部滚动，语音、表情、附件和发送按钮保持在可见区域；输入胶囊与 composer 根节点不再把自身固有高度撑出会话的 `overflow: hidden` 边界。
- 表情和附件面板获得按当前 composer 高度计算的最小可操作空间，同时继续受可见视口高度上限约束。低高度下先压缩并滚动草稿内容，不再把面板压到 0–10px。
- 键盘已经被识别后，关闭动画尾段即使可见高度差小于 80px，也继续使用 `visualViewport` 像素边界，直到视口完全恢复；首次加载的无焦点陈旧短视口仍使用 `100dvh`，`pageshow` 和可见性恢复继续清除陈旧键盘状态。
- 正常聊天页不渲染 `ClientEdgeMask` 底部遮罩；该遮罩属于带底部导航的 `MobileShell`。本地浏览器命中链检查确认输入胶囊底部的最上层元素仍属于 composer，黑色下部区域是会话高度错误时暴露的外层背景，不是覆盖输入框的遮罩。
- 本地生产组件几何验收覆盖 375/440/956px 宽度、210/250/320/956px 可见高度、6/34px 底部留白，以及单行/七行、图片、引用、表情和附件组合。18 组均满足输入区不越界、面板可操作、底部无遮罩覆盖；证据位于忽略目录 `outputs/chat-composer-clipping-fix/`。
- 测试先行验证了旧实现会在键盘关闭尾段提前回到 `100dvh`，且缺少受限高度内的草稿滚动容器；修复后 IM 定向回归 5 files / 155 tests、前端全量 483 files / 3,290 tests、TypeScript lint、formal Vite build 与 production bundle audit 均通过，构建检查 8 个 HTML 入口和 56 个资产。
- 本节没有修改 IM API、数据库、migration、消息业务逻辑或视觉主题。未在 staging 或物理 iPhone 上验收，未推送、未部署，也未修改任何远程环境。

### 首页等级、聊天面板与移动浏览器视口一致性修复（2026-09-09，本地）

- 首页头像下的等级改为直接读取 `GET /api/v1/customers/me` 经 Core Read 映射的正式 `experienceLevel`，与个人中心使用同一数据字段；不再把评价 `activeScore` 换算成另一套等级。
- 表情与附件继续共用 `.im-composer-panel`。常规移动视口优先展开至 340px，并保证 232px 的双排可操作下限；极短键盘视口仍按可见高度的 42% 收缩并内部滚动，输入栏不被挤出会话边界。
- 安装态 iOS/Android PWA 在键盘关闭时使用与首页主导航相同的 `bottom:0` 锚点；独立的可见高度变量只负责面板限高。键盘开启时根据 `visualViewport` 的 top、height 与布局高度计算房间 bottom，以双边锚定替代固定像素房间高度，避免 iPhone Safari 工具栏/键盘动画留下输入栏间隙。
- 已安装 PWA 的正常可见高度可能天然比布局视口少约一个浏览器安全区；键盘恢复判定改用已记录的 PWA 静止高度及容差，避免键盘关闭后长期保留陈旧的短视口状态。
- 所有正式 HTML 入口补充 `interactive-widget=resizes-content`。支持该 viewport 策略的 Chromium 会在软键盘出现时同步缩放 Layout Viewport，从浏览器层消除 `position: fixed` 仍锚定旧布局视口的问题；iOS WebKit 不依赖该扩展，继续使用上述 `visualViewport` 双边锚定与 PWA 静止高度恢复。未启用会让键盘覆盖内容的 `navigator.virtualKeyboard.overlaysContent`。
- 旧 Android Chromium 不支持 `color-mix()` 时，主题边框声明会被丢弃并回退成浅色默认边框，聊天玻璃背景也会露出父级渐变。新增仅在不支持 `color-mix()` 时生效的主题线色与聊天纯色表面回退；现代浏览器视觉不变。浏览器根节点的 `color-scheme` 同步当前明暗主题，减少可控系统/浏览器底栏与页面主题不一致。
- OPPO Reno A / Android 9 类设备的首登卡顿来自三项叠加：登录跳转后固定约 1.54 秒的过场等待、450ms 后自动开始的约 14MB 宠物动画资源串行加载/解码，以及多层 `backdrop-filter`、阴影和持续动画带来的滚动重绘。启动阶段现在按 Android 版本与公开硬件能力设置 reduced profile；该模式停止宠物资源自动预载和常驻动画，将过场缩短为最多约 220ms、图片改为异步解码，并减少玻璃合成与长动画。它不硬编码 OPPO 型号、不减少 API 数据，现代 Android 保持完整视觉。
- 本切片未修改 IM API、数据库、migration、消息数据或远程环境；staging 与 Android/iPhone 物理设备仍需在后续获授权发布后验收。
