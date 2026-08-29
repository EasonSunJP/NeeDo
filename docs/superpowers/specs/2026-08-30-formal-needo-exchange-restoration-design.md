# NeeDo Exchange 正式数据恢复设计

## 1. 状态与目标

本设计于 2026-08-30 经用户逐段确认。目标是重新启用用户、商户和技师移动端的 NeeDo Exchange 页面，同时确保需求、情报、评论、点赞和转发全部来自正式 MySQL 数据，并能追溯到现有真实测试账号及其有效身份。

本设计恢复旧版页面的完整视觉和交互结构，但不恢复旧版浏览器 mock、静态数组、生成身份、`localStorage` 业务状态或静态演示分支。模拟的是本地测试环境中的发布内容和互动行为，不是账号、身份、权限、API 或持久化。

第一实施微步骤精确生成并展示：

- 20 条需求。
- 20 条情报。
- 每条 3–10 条评论。
- 每条 10–66 个不重复点赞账号。
- 每条 2–15 个不重复转发账号。

抢单、匹配、预约和支付明确留到最后阶段，不在本微步骤中显示入口、创建记录或制造成功状态。

## 2. 已确认产品规则

### 2.1 发布身份

- 当前身份为 `customer` 的登录账号只能发布需求。
- 当前身份为 `technician` 的登录账号只能发布情报。
- 当前身份为 `merchant_owner` 或 `merchant_staff` 的登录账号只能以当前店铺范围发布情报。
- 发布者由后端根据 Access Token 中的 `currentIdentityId` 解析；客户端不能提交作者用户 ID、身份 ID、店铺 ID或公开 NeeDoID。
- 新内容不经过运营审核，服务端校验通过后立即进入 `PUBLISHED` 状态。
- 本人可以撤回；到期内容由服务端状态规则移出默认活动列表。

### 2.2 页面与互动

- 页面只保留“需求”和“情报”两个标签，不恢复“全部”。
- 用户端默认打开需求；商户端和技师端默认打开情报。
- 列表支持标签、关键词、地区和活动状态筛选，并强制分页。
- 详情展示发布者公开头像、展示名、公开 NeeDoID、身份类型、正文、结构化条件和正式互动计数。
- 登录账号可以评论、点赞、取消点赞和转发；页面只在正式 API 成功后更新状态。
- 评论第一期为单层评论，不做楼中楼、评论点赞或评论编辑。
- 同一账号无论切换多少身份，对同一帖子最多形成一条有效点赞和一条有效转发记录。
- 转发第一期表示账号已完成一次外部分享或复制正式链接，不创建浏览器本地转发记录，也不伪造 IM 投递。

### 2.3 明确延期

以下能力在独立后续设计和实现中处理：

- 抢单和报价。
- 智能或人工匹配。
- 从需求或情报创建 Booking。
- 预付、到店支付、银行转账、退款和 NDP 结算。
- 运营审核、驳回和后台批量处理。
- 评论楼中楼、举报、风控评分和内容推荐排序。

## 3. 方案选择

采用独立正式 Exchange 数据域，不复用 `SocialPost`，也不从 Booking 或 Social 数据投影出需求和情报。

原因：

- Exchange 有独立的预算、价格、服务方式、服务时间、到期和撤回语义。
- 发布身份和未来抢单、匹配、预约、支付需要稳定外键和状态机边界。
- 评论、点赞和转发需要独立唯一约束、分页、审计和并发幂等。
- 复用 Social JSON 会把结构化交易前置信息与动态内容混合，增加未来迁移和审计风险。

后端继续遵守：

```text
Route
  -> Controller
  -> Service
  -> Repository
  -> Prisma / MySQL
```

Controller 只处理统一请求和响应；身份解析、状态校验、事务、幂等和审计由 Service 完成；Repository 只负责 Prisma 数据访问。

## 4. 数据模型

### 4.1 枚举

新增：

- `ExchangePostType`：`DEMAND / INTELLIGENCE`。
- `ExchangePostStatus`：`PUBLISHED / WITHDRAWN / EXPIRED`。
- `ExchangeServiceMode`：`STORE / ONSITE / FLEXIBLE`。

数据库值使用小写映射，API 固定返回 `demand / intelligence`、`published / withdrawn / expired` 和 `store / onsite / flexible`。

### 4.2 ExchangePost

保存两类内容共有的稳定主体：

- `id`。
- `type / status`。
- `authorUserId / authorIdentityId`。
- 由后端写入的发布者公开快照：`publisherPublicId / publisherDisplayName / publisherAvatarUrl / publisherIdentityType`。
- `title / detail / contentLocale`。
- `areaLabel`。
- `serviceStartAt / serviceEndAt / expiresAt`，统一以 UTC 存储。
- `idempotencyKey`，用于发布重试和本地正式 Seed 的稳定 upsert。
- `withdrawnAt`。
- `createdAt / updatedAt / deletedAt`。

发布者快照只保存创建时已经可公开的数据，用于身份展示名或头像后续变化时保持历史发布证据；快照不包含邮箱、手机号、内部账号编号或敏感资料。`authorUserId` 和 `authorIdentityId` 仍保留正式外键，证明内容来自真实账号和身份。

索引至少覆盖：

- `(type, status, expiresAt, createdAt)`。
- `(authorUserId, createdAt)`。
- `(authorIdentityId, createdAt)`。
- `(areaLabel, type, status)`。
- `deletedAt`。

### 4.3 ExchangeDemand

与一个 `DEMAND` 帖子一对一，保存：

- `postId`。
- `budgetMinJpy / budgetMaxJpy`。
- `createdAt / updatedAt / deletedAt`。

Service 强制预算为非负整数且 `budgetMinJpy <= budgetMaxJpy`。只有 `DEMAND` 帖子可以拥有该记录。

### 4.4 ExchangeIntelligence

与一个 `INTELLIGENCE` 帖子一对一，保存：

- `postId`。
- `serviceMode`。
- `addressLabel`，仅保存发布者明确选择公开的服务地点说明。
- `serviceAreas` JSON 字符串数组。
- `originalPriceJpy / campaignPriceJpy`。
- `createdAt / updatedAt / deletedAt`。

Service 强制价格为非负整数，存在活动价时不得高于原价。只有 `INTELLIGENCE` 帖子可以拥有该记录。

### 4.5 ExchangeComment

保存：

- `id / postId`。
- `authorUserId / authorIdentityId`。
- 公开作者快照。
- `content`。
- `idempotencyKey`。
- `createdAt / updatedAt / deletedAt`。

评论按 `(postId, createdAt, id)` 稳定分页。撤回、过期或软删除帖子不能新增评论，已有评论仍可随详情以只读方式查看。

### 4.6 ExchangeLike

保存 `postId / actorUserId / actorIdentityId / createdAt / updatedAt / deletedAt`。有效记录以 `(postId, actorUserId)` 唯一，账号切换身份不能重复增加计数。

点赞使用软删除恢复语义：再次点赞恢复原记录，取消点赞设置 `deletedAt`。并发 `PUT` 或 `DELETE` 结果幂等。

### 4.7 ExchangeShare

保存 `postId / actorUserId / actorIdentityId / idempotencyKey / createdAt / updatedAt / deletedAt`。有效记录以 `(postId, actorUserId)` 唯一，因此同一账号对同一帖子最多计数一次。

正式分享按钮只有在系统分享完成或正式链接复制成功后才调用 API；取消系统分享不增加计数。第一期不保存外部接收人，也不声明消息已经送达。

### 4.8 关系与删除

- 所有业务表均包含 `id / createdAt / updatedAt / deletedAt`；一对一详情表也使用独立 `id` 并对 `postId` 建唯一约束。
- 所有关联使用外键和索引，禁止物理删除正式帖子与互动。
- 默认查询必须过滤所有层级的 `deletedAt IS NULL`。
- 发布者账号或身份停用后，历史内容仍保留，但不能再以无效身份写入新内容或互动。
- 本阶段不创建 Offer、Match、Booking 或 Payment 外键占位表。

## 5. API 合同

统一前缀 `/api/v1/exchange`，继续使用项目标准成功、错误和分页 envelope。

### 5.1 读取

- `GET /posts`：分页读取。参数包括 `type`、`query`、`area`、`status`、`page`、`page_size`；普通前台默认只返回未过期的 `PUBLISHED`。
- `GET /posts/:id`：读取详情、发布者公开信息、正式计数及当前账号的 `liked / shared / canWithdraw` 状态。
- `GET /posts/:id/comments`：按 `createdAt + id` 稳定分页读取评论。

列表查询通过聚合子查询或分组查询取得评论、点赞和转发数，不能对每张卡片执行独立计数查询。

### 5.2 写入

- `POST /posts`：根据当前身份创建需求或情报并直接发布。
- `POST /posts/:id/withdraw`：仅发布身份本人可撤回；重复撤回返回同一终态。
- `POST /posts/:id/comments`：创建单层评论。
- `PUT /posts/:id/like`：幂等点赞。
- `DELETE /posts/:id/like`：幂等取消点赞。
- `POST /posts/:id/shares`：在分享完成后幂等记录转发。

所有写接口使用 Zod；`idempotencyKey` 由客户端为一次逻辑操作生成，服务端同时执行唯一约束和业务幂等校验。

### 5.3 权限

新增并由正式角色 Seed 分配：

- `exchange:posts:list`。
- `exchange:posts:detail`。
- `exchange:posts:create-demand`。
- `exchange:posts:create-intelligence`。
- `exchange:posts:withdraw-own`。
- `exchange:comments:list`。
- `exchange:comments:create`。
- `exchange:likes:write`。
- `exchange:shares:create`。

读取和互动权限分配给已启用的客户、技师和商户角色；发布需求只分配给客户，发布情报只分配给技师和商户角色。Service 仍必须重新校验当前身份类型和范围，不能只依赖前端按钮或角色名称。

### 5.4 审计

写入以下 AuditLog action：

- `exchange.post.publish`。
- `exchange.post.withdraw`。
- `exchange.comment.create`。
- `exchange.like.create / exchange.like.remove`。
- `exchange.share.create`。
- `exchange.post.expire`。

审计 metadata 只包含公开或内部业务安全字段，不记录帖子全文、评论全文、邮箱、手机号、Token 或其他敏感信息。

## 6. 状态、并发与错误

### 6.1 发布和撤回

- `POST /posts` 在一个事务中写入主体、类型详情和审计。
- `DEMAND` 与 `INTELLIGENCE` 字段组合由 Service 严格校验，不能创建混合或缺失详情。
- 撤回只允许 `PUBLISHED -> WITHDRAWN`，重复请求返回已有终态，不重复审计。

### 6.2 自动过期

- 前台活动查询始终使用 `status=PUBLISHED AND expiresAt>now`，即使后台扫描暂未执行也不会展示过期内容。
- 有界后台 worker 将到期的 `PUBLISHED` 批量更新为 `EXPIRED`，写入一次系统审计，并使用稳定游标避免大数据扫描。
- `WITHDRAWN` 不会再次被过期 worker 改写。

### 6.3 互动并发

- 点赞和转发依靠数据库唯一约束及事务处理并发重复请求。
- 评论使用 `idempotencyKey` 防止网络重试生成重复评论。
- 计数永远从有效互动记录聚合，不在帖子表维护可漂移的浏览器计数。

### 6.4 错误状态

- API 失败显示当前语言的重试状态，不回退到浏览器数据。
- 空列表与加载失败必须区分。
- 无效身份返回稳定 permission/identity 错误，不自动切换身份。
- 已撤回、已过期和不存在的帖子不泄漏敏感字段；写操作返回稳定不可操作错误。

## 7. 正式测试数据

### 7.1 数据来源

新增独立的本地正式 Exchange 计划、Seed 和 checker。它们复用现有三个月模拟计划中的真实 `User`、`UserIdentity`、`PublicIdentifier`、CustomerProfile、TechnicianProfile 和 Shop，不创建影子账号、假 NeeDoID 或前端身份。

Seed 在写入前必须确认：

- 部署环境为 local 或 test。
- MySQL 主机为本地地址且数据库名不含生产标记。
- `ALLOW_SIMULATION_SEED=true`。
- 所需真实测试账号、有效身份和公开 ID 已存在。

任何条件不满足时 fail closed。

### 7.2 精确分布

- 从有效客户身份中确定性选择 20 个发布者，每人发布一条需求。
- 从有效技师和店铺身份中确定性选择 20 个发布者，每人发布一条情报；计划在技师和店铺之间保持代表性分布。
- 每条帖子使用固定种子伪随机生成 3–10 条评论、10–66 个不重复点赞账号和 2–15 个不重复转发账号。
- 评论、点赞和转发账号全部来自其余有效正式测试账号；同一帖子内点赞和转发 actor 不重复。
- 内容覆盖不同服务类别、东京及周边地区、预算、服务方式、有效时间和原始语言；结构化时间和价格必须通过与正式 API 相同的领域校验。
- 40 条帖子在验收窗口内全部为有效 `PUBLISHED`，并具有明确未来到期时间。

### 7.3 幂等与保护

- 帖子、评论和分享使用带 `needo_exchange_simulation` 命名空间的确定性 `idempotencyKey`。
- 重复执行只 upsert 本命名空间的 Seed 数据，结果数量和 actor 映射完全一致。
- Seed 不删除、覆盖或重新归属人工发布、其他测试数据或其他功能数据。
- 如果发现同一 Seed key 已被不匹配的正式记录占用，流程停止并报告冲突，不能强制覆盖。
- checker 独立查询数据库，不复用 Seed 的期望对象作为实际结果。

### 7.4 Checker 验收

checker 必须验证：

- 恰好 20 条 Seed 需求和 20 条 Seed 情报。
- 每条评论数在 3–10、点赞数在 10–66、转发数在 2–15。
- 每个发布者和互动者均关联未删除、已启用的真实 User 和 UserIdentity。
- 每个发布者均有正确身份类型和有效 PublicIdentifier。
- 需求与情报详情字段、金额、时间、状态和软删除关系合法。
- 点赞和转发不存在同帖同账号重复有效记录。
- 不存在孤儿评论、点赞、转发或错误类型详情。
- 重复 Seed 返回 noop 或精确 upsert，不增加记录。

## 8. 前端恢复

### 8.1 单一正式页面

恢复 2026-08-28 下线前的完整页面布局、卡片、详情和发布表单，但只把它作为视觉和交互参考。生产页面统一使用新的 `src/features/exchange` API adapter 和资源 hooks，不保留正式/legacy 页面选择。

页面入口保持：

- 用户端 `/needo`。
- 商户端 `/merchant/needo`。
- 技师端 `/technician/needo`。
- 各入口下的 `/posts/:postId` 详情。

### 8.2 列表与详情

- 只显示“需求 / 情报”两个标签。
- 卡片展示真实发布者公开信息、服务条件、到期倒计时和数据库聚合计数。
- 详情从正式详情与评论 API 读取，不从列表对象拼接虚构客户资料、订单、评分或支付状态。
- 评论分页加载；发布评论成功后使用服务端返回记录更新页面。
- 点赞和取消点赞使用服务端返回状态与计数。
- 分享通过系统分享或复制正式链接；成功后再记录 share。

### 8.3 发布表单

用户需求表单包含服务内容、期望时间、地区、预算范围和备注。商户/技师情报表单包含服务内容、有效时间、服务方式、地区或公开地址、价格和备注。

表单字段使用现有五语言 i18n。模拟帖子正文保留发布账号设定的原始语言，不做浏览器伪翻译；`contentLocale` 用于显示原始语言标识和未来正式翻译能力。

### 8.4 不显示的能力

页面不显示抢单、报价、匹配、预约或支付按钮。详情也不生成订单、客户评分、预付款、现金金额或履约时间线。后续交易微步骤必须使用新的正式状态机和 API 增量接入。

## 9. 旧 mock 清理

“完全不要有残留”定义为当前源码、运行时和正式构建产物中：

- 不存在 Exchange 业务 mock 数组、浏览器 Seed、生成发布者或生成 NeeDoID。
- 不存在 `needo.exchange.*` 的 `localStorage` 读写。
- 不存在 `needoExchangeBridge`、旧 composed-post store、静态演示 Exchange adapter 或 API 失败后的 demo fallback。
- 不存在继续返回空数组、`null` 或 `error.feature_unavailable` 的旧 Exchange capability stub。
- 不从历史浏览器数据导入正式数据库。
- 单元测试 fixtures 只能位于测试文件内，不能被生产代码导入。

新增永久 guard test 扫描 Exchange 页面、路由、adapter 和正式 bundle。正式数据失败时只能展示 loading/error/empty/retry 状态。

本设计不重写 Git 历史。旧 mock 曾存在的历史提交属于可审计开发记录；破坏性历史重写不影响当前产品数据正确性，也不属于本任务授权范围。

## 10. 测试与验收

### 10.1 后端

- Repository 测试：分页、筛选、聚合、软删除和无 N+1 查询形态。
- Service 单元测试：身份类型、字段组合、状态转换、幂等、撤回和过期。
- API 集成测试：Zod、RBAC、统一 envelope、分页和错误码。
- 并发测试：重复点赞、取消点赞、评论重试和转发重试。
- AuditLog 测试：每个正式写操作的 action、actor 和安全 metadata。
- OpenAPI 测试：所有 Exchange 路径、参数、响应和权限声明。
- 本地真实 MySQL checker：精确数据量、actor 映射、关系完整性和重复执行。

### 10.2 前端

- Adapter 测试：请求合同、分页、错误和幂等键。
- 页面测试：两个标签、搜索、地区、加载、空、错误和重试。
- 详情测试：真实公开身份、评论分页、点赞、取消点赞和分享计数。
- 发布测试：用户只能提交需求，商户/技师只能提交情报。
- 撤回测试：只有本人可见撤回控制并使用正式响应更新状态。
- Guard 测试：禁止 mock、`localStorage`、生成身份、静态演示分支和 capability stub 回归。

### 10.3 浏览器验收

使用现有真实客户、技师和商户测试账号，在正式后端、MySQL 和 Redis 上验证：

- 用户端打开需求并发布一条正式需求。
- 技师端和商户端打开情报并分别验证正式发布权限。
- 从其他真实测试账号评论、点赞、取消点赞和分享。
- 刷新、重新登录和切换身份后，帖子与互动仍保持数据库状态。
- API 失败时只显示可重试错误，不出现旧数据。
- 390px、440px 和桌面宽度下检查标题、标签、卡片、表单、弹层、滚动、底部导航、溢出和隐藏状态。
- 检查控制台错误和请求中是否包含内部作者 ID、邮箱、手机号或敏感字段。

### 10.4 完成门禁

完成前必须通过：

- 前后端定向和完整测试。
- 前后端 lint 与 TypeScript build。
- Prisma migration 状态和真实 MySQL checker。
- `npm run verify:production-build`。
- 三身份正式浏览器验收。

本地 merge、push、部署和线上验收保持独立；本任务不授权 push、部署或生产数据库写入。
