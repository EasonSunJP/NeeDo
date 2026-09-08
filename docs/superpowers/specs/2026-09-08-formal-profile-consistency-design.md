# NeeDo 正式资料一致性修复设计

## 目标

在本地修复用户个人中心、IM 联系人列表和联系人信息页之间的头像、自我介绍、会员种类与语言能力不一致问题。数据库、正式 API 和各消费页面必须表达同一份身份范围内的资料；页面不得用示例值伪装成已经保存的数据。

## 范围与边界

- 本微步骤只处理用户资料在个人中心和 IM 中的读取、展示与刷新。
- 不新增 mock、静态兜底会员、假头像或假语言。
- 不修改 staging，不推送，不部署，也不修改本地正式数据来掩盖代码缺陷。
- 不改变用户、技师、商户资料的隐私边界。
- 不扩展 NDP、订单、利用次数或社交资料能力。
- 当前其他工作区已有未提交修改；实现只在专用 `codex/formal-profile-consistency` worktree 中进行。

## 已确认的根因

1. `UserCenterPage` 和用户资料设置页在正式语言为空时自行显示 `日本語`，在正式简介为空时自行显示示例文案。联系人资料页读取数据库真实空值，因此两个页面看起来不同。
2. IM 联系人行和会话信息卡使用 IM 启动快照中的 `ImUser.avatar`。资料详情请求返回新的 participant 后，会话信息卡仍可能传入旧的 `user`。
3. IM 目录资料把旧 `CustomerProfile.membershipLevel` 直接作为会员种类，没有使用当前有效的平台会员 entitlement/adjustment 投影。
4. IM 长生命周期 store 需要在会话列表或联系人列表重新进入时刷新正式 bootstrap，才能让列表头像不依赖旧启动快照。

## 权威资料契约

用户身份的联系人资料由正式 IM API 投影：

- `user.avatarUrl`：该身份可公开的当前头像。
- `identityCard.displayName`：当前公开显示名。
- `identityCard.identityLabel`：数据库时钟下当前有效的平台会员等级。
- `identityCard.languages`：隐私规则允许返回的已保存语言列表。
- `identityCard.bio`：隐私规则允许返回的已保存自我介绍。

前端可把空值明确显示为“未设置”，但不得把空值替换成可被误认为真实资料的业务内容。语言名称归一化只改变显示标签，不修改或补充正式数组。

## 后端设计

`RealtimeRepository.getDirectoryProfile` 使用数据库 `dbNow` 查询当前生效的平台会员 adjustment 和 entitlement。有效 adjustment 优先于 entitlement；没有有效记录时返回 `free`。adjustment 按自身生效与取代时间解析；entitlement 可继续引用其授予时已发布、后来归档的不可变 tier version，与正式 `PlatformMembershipService.resolveMembershipAt` 保持一致，不能创建第二套页面级会员判断。

目录资料响应中的 participant 与 identity card 来自同一次查询结果。本微步骤不改变 schema，也不新增 migration。

隐私裁剪保持现状：非公开客户资料不得通过 IM 返回语言或简介；技师语言 fallback 只在客户语言为空且技师资料已发布并公开时生效。

## 前端设计

个人中心和用户资料编辑页直接以正式值初始化：空语言保持空数组，空简介保持空字符串。非编辑状态显示“未设置”；编辑区域使用 placeholder 提示写法时，placeholder 不进入保存 payload。

`ConversationIdentityProfileCard` 使用目录资料响应中的最新 `profile.user`。会话列表和联系人列表进入时调用正式 store refresh，更新联系人 participant；刷新失败保留最后一次已确认值，不做乐观伪造。

信息卡沿用个人中心的视觉层级与主题 token：头像与名称为第一层，会员与 NeeDo ID 为第二层，基础信息为三列，语言和简介为独立信息区。联系人卡不显示隐私开关、NDP、利用次数或其他仅本人可见数据。

## 测试与验收

1. 个人中心与资料设置页的空语言、空简介不再显示业务默认值。
2. 会话信息卡使用目录资料响应中的新头像。
3. 会话列表与联系人列表进入时刷新正式 store。
4. 后端对有效 adjustment、有效 entitlement、无有效会员返回正确 tier，且保留隐私与语言 fallback。
5. 聚焦前后端测试、lint、类型检查和 production build 通过。
6. 明确本地 listener 的 PID、cwd、branch 与 proxy 后完成本地浏览器验收。

## 完成标准

- 截图中的四类不一致都有回归测试。
- 同一个字段不存在页面级业务默认值或第二套会员判断逻辑。
- 没有 schema、migration、mock、staging、push 或 deployment 变更。
- 若真实数据为空，所有页面统一诚实显示为空态。
