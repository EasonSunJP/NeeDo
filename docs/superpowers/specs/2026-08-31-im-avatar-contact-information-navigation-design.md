# IM 头像进入对应联系人信息页设计

日期：2026-08-31

范围：用户端、技师端、商户端共用的正式 IM 单聊、群聊消息头像与群成员头像

## 背景与根因

当前聊天页已经有完整的“联系人信息”链路，但头像没有统一按头像所属账号进入这条链路：

- 消息头像通过 `resolveImProfilePath` 进入通用用户、技师或店铺资料页。
- 群成员头像也使用同一通用资料路由。
- 单聊的“更多”按钮进入当前会话的信息页，因此直接把群成员头像连到当前会话信息页会错误打开群设置，而不是该成员的信息。
- 正式 `GET /api/v1/im/directory/:userId` 会拒绝目标账号等于当前账号，导致本人头像无法复用联系人资料页。

因此问题不是头像缺少点击能力，而是点击目标仍按通用资料或当前会话解析，没有按头像实际代表的账号解析联系人信息。

## 已确认目标行为

- 点击哪个可识别账号的头像，就进入该账号的联系人信息页。
- 适用于单聊双方头像、群聊中每条消息的发送者头像，以及群信息页中的群成员头像。
- 点击群成员头像只打开该成员的信息，不打开当前群聊的设置页。
- 本人头像也进入本人的联系人式资料页。
- 好友继续进入该账号对应的完整单聊联系人信息页，复用现有身份资料卡、标签、动态、免打扰、置顶和开始聊天等能力。
- 非好友进入该账号的联系人资料页，并显示正式好友关系或申请动作。
- 本人联系人信息只显示适用于本人的正式身份资料，不显示添加好友、删除联系人、拉黑、免打扰、置顶或开始聊天等关系/会话操作。
- 群隐私模式隐藏成员真实身份时，匿名头像继续不可点击，不能借此绕过隐私设置。

## 方案比较

### 方案 A：统一按头像账号进入 DirectoryProfile（采用）

所有可识别头像统一使用 `config.routes.directoryProfile(user.id)`。DirectoryProfile 再根据正式关系状态决定最终页面：

- `friend`：沿用现有幂等逻辑，解析该账号的直接会话并进入完整联系人信息页。
- `none`、`incoming_pending`、`outgoing_pending`：停留在账号对应的联系人资料页。
- 新增 `self`：停留在只读的本人联系人资料页，不渲染好友动作。

优点是头像只表达“这个账号是谁”，不会依赖头像所在的单聊或群聊；好友、非好友和本人都由同一正式资料合同决定。

### 方案 B：前端按联系人和会话分别拼接不同路由（不采用）

好友头像直接进入 ContactDetail 或直接会话信息，非好友进入 DirectoryProfile，本人进入个人中心。

该方案无需扩展 API，但会把关系判断复制到消息页、群成员页等多个入口，而且本人仍不是联系人信息页。Store 尚未同步时还可能把好友错误地当作非好友。

### 方案 C：所有头像继续进入通用 ProfileDetail（不采用）

改动最少，但页面不是用户指定的联系人信息页，也缺少联系人关系和会话设置能力。

## 正式 API 与数据合同

扩展现有 DirectoryProfile 合同，不新增表或 migration：

```text
relationship = none
             | friend
             | incoming_pending
             | outgoing_pending
             | self
```

当 `targetUserId === auth.userId` 时：

1. 服务层不再返回 `error.realtime.contact_self`。
2. 继续解析当前已认证的个人身份 scope。
3. 使用当前身份的 `identityId` 作为目标身份读取安全资料卡。
4. Repository 返回 `relationship: self`、`contactId: null`、`friendRequest: null`。
5. 不查询或制造本人 Contact、FriendRequest、Follow 或 Conversation。

身份资料卡必须按传入的目标 identity 选择资料类型。为避免多身份账号在技师端或商户端点击本人头像却显示默认 customer 资料，DirectoryProfile 查询需要读取 identity `id`，并让身份卡构建逻辑优先选择 `targetIdentityId` 对应的身份；找不到时才沿用当前安全 fallback。

OpenAPI、后端 payload 类型、前端 realtime API 类型和 `DirectoryProfile` 模型同步加入 `self`，保持响应结构不变。

## 前端路由与渲染

新增一个纯目标解析 helper，输入当前 IM scope、头像用户和群隐私状态，输出联系人信息路由或 `undefined`：

```text
已识别 user + 非匿名状态
  -> config.routes.directoryProfile(user.id)

未知 user 或匿名群成员
  -> undefined
```

应用位置：

1. `ImConversationRoomPage` 的每条普通消息头像。
2. `ImConversationInfoPage` 的群成员头像。

不把路由写成 `config.routes.conversationInfo(currentConversationId)`，因为群聊中的头像目标是成员账号而不是当前群聊。

`ImDirectoryProfilePage` 增加 `self` 展示分支：

- 标题继续为“联系人信息”。
- 复用 `ConversationIdentityProfileCard` 展示正式身份资料。
- 保留进入本人动态页的只读入口；隐藏只属于联系人关系的标签区域。
- 不渲染 `ImFriendProfileActionBar` 或任何联系人/会话设置动作。
- `self` 不触发 `ensureDirectConversation`。
- `friend` 的现有跳转、加载、失败重试保持不变。

## 隐私、安全与错误边界

- 群聊 `hideMemberProfiles` 生效时，匿名化姓名和头像不得生成联系人路由。
- 未知、已删除或尚未同步的发送者没有可验证 user 时，头像保持非链接状态。
- 本人资料复用服务端安全字段裁剪，不从浏览器 mock、Social 缓存或本地个人中心拼装。
- 本人查询不得创建自好友、自关注、自会话或审计伪记录。
- 好友资料跳转仍依赖 `ensureDirectConversation` 的幂等语义，不创建平行单聊。
- 已删除好友但保留历史的一方仍由 DirectoryProfile 的正式关系决定；头像点击不得恢复参与者或授予发送权限。
- 不修改群设置入口、“更多”按钮、群聊标题或其他会话设置行为。

## TDD 与验收

按以下顺序执行：

1. 后端 Service RED：本人 DirectoryProfile 不再抛错，并以当前身份调用 Repository。
2. 后端 Repository RED：本人返回 `self`，不读取 Contact/FriendRequest，并按目标 identity 构建资料卡。
3. OpenAPI RED：`RealtimeDirectoryProfile.relationship` 包含 `self`。
4. 前端模型/adapter RED：正式 `self` 状态可无损映射。
5. 前端路由 RED：消息头像和群成员头像都按其 `user.id` 使用 DirectoryProfile 路由，不使用当前群会话信息路由。
6. 前端隐私 RED：匿名群成员头像不产生目标。
7. 页面 RED：`self` 显示身份资料卡且没有好友动作，也不触发直接会话跳转。
8. 实现最小生产代码使定向测试转绿，再运行完整相关 IM、OpenAPI、lint 与正式 production build。

浏览器验收使用正式本地账号和真实 API，在移动端视口检查：

- 单聊点击对方头像进入对方完整联系人信息。
- 单聊点击本人头像进入本人只读联系人信息。
- 群聊逐个点击不同成员头像，页面身份随目标账号变化，且不进入群设置。
- 群聊点击本人头像进入本人只读联系人信息。
- 隐私群匿名头像不能打开真实成员资料。
- 返回聊天、刷新、跨用户端/技师端/商户端路由前缀均正确。
- 控制台无新增错误，页面无横向溢出，点击头像不会同时触发消息长按/右键动作。

浏览器验收不得为了制造场景写入正式数据库；若当前环境没有可用群聊或隐私群数据，明确记录未验收项，不用 mock 代替。

## 非目标

- 不重做联系人信息页视觉或字段。
- 不改变好友申请 72 小时状态机、删除好友、拉黑、发送权限或群隐私规则。
- 不改变通用 ProfileDetail 页面和 Social 个人主页入口。
- 不新增 schema、migration、mock、浏览器业务持久化或平行联系人页面。
- 不修改当前工作区中的排班与联系人事件时间线未提交内容。
