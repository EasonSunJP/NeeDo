# 技师端确定版 UI 与身份个人数据域设计

## 1. 目标与权威来源

本设计于 2026-08-30 经用户确认，采用“确定版视觉交互层 + 当前正式数据层”的恢复方式：

- 视觉权威：`stash@{0}` 中的技师日程、订单详情和编辑流程，以及当前仍保留的完整 `TechnicianPortalPage`。
- 数据权威：当前 `main` 的 `/api/v1`、JWT 当前身份、RBAC、Prisma/MySQL、正式 Schedule、Booking、IM、Social 和 Exchange API。
- 禁止整文件回滚后继续使用 `entityStore`、`scheduleStore`、`technicianScheduleStore`、`formalRuntimeFallbacks` 或 `localStorage` 业务状态。
- 删除简易版、mock 版和重复正式页；同一路由只保留一套完整 UI。

## 2. 身份共享矩阵

个人资料、通讯录、动态、聊天记录、日程和需求使用同一套服务端身份域规则：

| 当前身份 | 个人数据域 |
| --- | --- |
| `customer` / `user` | 账号的 customer 主身份域 |
| `scout` / 联盟营销 | 与同账号 customer 主身份域共用 |
| `technician` | 当前技师身份独立域 |
| `merchant*` | 当前商户或店铺身份独立域 |
| 其他身份 | 当前身份独立域；平台后台不自动继承个人数据 |

服务端根据 Access Token 的 `currentIdentityId` 解析 canonical personal identity。客户端不得提交或覆盖 owner identity。联盟营销身份只共享个人数据域；联盟任务、佣金、合约、钱包等联盟业务资料仍保留其独立正式模型。

## 3. 数据模型

不新增并行用户体系。沿用 `UserIdentity`，在需要隔离的正式表上增加身份外键：

- `Contact.ownerIdentityId / contactIdentityId`。
- `FriendRequest.requesterIdentityId / targetIdentityId`。
- `Conversation.createdByIdentityId`。
- `ConversationParticipant.identityId`。
- `Message.senderIdentityId`。
- `SocialPost.authorIdentityId`。
- `Follow.followerIdentityId / followingIdentityId`。
- `Notification.recipientIdentityId / actorIdentityId`。
- `ExchangePost.ownerIdentityId`，保留 `authorIdentityId` 作为实际发布身份快照来源。

所有新增字段先通过 additive migration 回填：账号现有记录归入 customer 主身份；同账号 scout 解析到相同 canonical identity。没有 customer 身份的账号使用记录创建时可证明的默认有效身份。回填完成后添加外键、索引和新的唯一约束。禁止删除现有消息、动态、联系人和需求历史。

## 4. API 与权限边界

- Authenticate middleware 继续验证 token 和当前身份，Service 通过统一 `PersonalIdentityScopeResolver` 得到 `actorIdentityId`。
- IM、通讯录、动态、通知、需求“我的内容”查询均使用 canonical identity，不再只使用 `userId`。
- 对方身份来自正式公开身份解析；不能用内部用户 ID 猜测或前端身份参数替代。
- 会话参与资格由 `ConversationParticipant.identityId` 判定；同账号的技师身份不能读取 customer/scout 会话。
- 动态作者、关注关系和通知收件箱按 identity 隔离；customer/scout 因 canonical identity 相同而共享。
- Exchange 保留公开发布身份，但列表中的“我的需求”、撤回权限和私有需求访问使用 `ownerIdentityId`。
- Booking 中 customer/scout 继续按账号共享客户预约；技师按 `technician_profile`、商户按 `shop` 隔离，不把正式日程搬回浏览器 Store。

## 5. 个人资料

- customer/scout 共同读取和保存 `CustomerProfile`；`CustomerProfileService` 明确允许 scout 解析同账号 customer profile。
- technician 新增 `GET/PATCH /api/v1/technician-profile/me`，只允许当前 `technician_profile` scope，写入 `TechnicianProfile` 并记录审计。
- merchant 继续使用 Shop/merchant profile 正式接口。
- 技师端所有保存按钮必须等待正式 PATCH 成功；失败保留编辑内容并显示错误，不再调用 `updateTechnicianEntity` 制造成功。

## 6. 技师 UI 恢复

`/technician/schedule`、日程详情、编辑、订单详情恢复确定版的：

- 日/周/月切换、日期移动、返回今天。
- 汇总卡、工作摘要、时间轴、日历格、状态颜色、冲突标识。
- 排班/预约详情、正式状态记录、编辑和删除确认。
- 当前主题、移动端全屏页头、返回路径和底部安全区。

旧 UI 的数据计算被抽成纯 `formal-schedule-presentation` 映射，输入仅为正式 `BookingScheduleSlot`、`BookingOrder` 和当前技师资料。未启用的正式班次转让不能显示可成功提交的 mock 流程；保留无假写入的明确不可用状态，直到正式状态机实现。

## 7. 删除策略

从正式生产依赖图中删除：

- `FormalRoutePage` 简易技师壳及其简易日程列表。
- 技师正式页面对 `formalRuntimeFallbacks`、`entityStore`、`scheduleStore`、`shiftPlanningStore`、`technicianScheduleStore` 的导入。
- IM/Social/Exchange/Technician 的 mock、demo、静态环境切换和假成功分支。
- 同一路由的重复页面实现；兼容路由只能重定向到唯一完整页面。

不删除仍被非本次正式模块合法使用的旧兼容文件；只有在生产导入数归零且测试证明无引用后才删除文件。

## 8. 错误、迁移与回滚

- API 加载失败显示可重试错误，不能回退到 demo 数组。
- 空数据与加载失败分开显示。
- migration 只新增列、回填、索引和外键，不修改已应用 migration。
- 回填脚本先 dry-run 输出数量和无法解析项；存在无法解析项时 fail closed。
- 每个子步骤独立提交，可逐项 revert；不 push、不部署、不写生产数据库。

## 9. 验收

- TDD 红绿证据覆盖 canonical identity 矩阵、跨身份不可见、customer/scout 共享、正式资料持久化和 UI 无 mock。
- 前后端 lint、全部测试、正式构建通过。
- 本地正式服务 health/ready 通过。
- 使用正式测试账号在桌面及 390px、440px 验收资料、通讯录、动态、聊天、日程、需求和订单详情；检查刷新持久化、身份切换、网络请求、控制台和水平溢出。

