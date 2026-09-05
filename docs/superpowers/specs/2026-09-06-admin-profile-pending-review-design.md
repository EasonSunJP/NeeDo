# NeeDo 运营后台登录资料与待办展开设计

**日期：** 2026-09-06  
**适用阶段：** Step 07 前端登录与权限守卫、Step 12 运营后台真实数据  
**状态：** 已获用户确认，待实施  
**范围：** 运营后台侧栏登录管理员资料、“待处理”和“审核”指标及其展开列表

## 1. 现状与问题

运营后台侧栏当前直接写死以下内容：

- 姓名 `David Stainberry`；
- 头像 `/images/generated/profiles/profile-03.jpg`；
- 角色“平台运营管理员”；
- “待处理”数量 `36`；
- “审核”数量 `19`。

这些值不来自当前登录 session、用户端资料或正式业务 API。账号菜单虽然读取了 session 的邮箱和 username，但标题姓名仍由调用方传入固定值。

现有正式能力包括：

- `/auth/me` 已返回同一 User 的 username、avatarUrl、当前身份、全部身份、角色和权限；
- 用户端正式资料由 CustomerProfile.displayName 和同一 User 的头像事实组成；
- `/backoffice/orders` 可按 status 分页读取全平台正式订单；
- `/ops/merchant-applications` 可按 submitted、under_review 等状态分页读取正式店铺身份申请；
- 独立 FieldJob 表、状态机和 API 尚未启用，因此原演示文案所指的“36 个上门工单”不能作为正式待处理列表。

## 2. 目标

1. 侧栏头像和名称跟当前登录管理员的用户端资料保持同源；
2. 删除固定个人资料与固定数字，不保留 demo 回退；
3. “待处理”展示正式待确认订单数量，点击后原位展开最近列表；
4. “审核”展示正式待审核店铺身份申请数量，点击后原位展开最近列表；
5. 列表项可进入对应正式详情，展开区可进入完整筛选列表；
6. 所有读取遵守现有 JWT、身份范围、RBAC 和分页契约。

## 3. 方案选择

采用“扩展自资料契约、复用现有分页业务 API、侧栏懒加载”的方案。

不新增同时聚合认证、订单和身份审核的巨型侧栏接口。该接口会把三个不同权限域绑定在一起，并形成第二套订单和审核统计来源。

不只把数字卡改成跳转链接。用户已明确要求点击展开并显示详细列表。

不继续使用上门工单口径。正式 FieldJob 能力尚未接通；本设计把“待处理”定义为已有正式状态机中的待确认订单。未来 FieldJob 正式化后，如需加入统一运营队列，应另做有明确分类和权限的聚合设计。

## 4. 登录管理员资料来源

### 4.1 正式显示名称

`/auth/me` 增加可空字段 `profileDisplayName`：

```ts
profileDisplayName: string | null
```

后端按当前 User 读取未软删除的 CustomerProfile.displayName。该读取是登录用户自己的最小资料投影，不受当前激活身份是 operations 影响，也不开放其他用户资料。

前端显示名称按以下顺序解析：

```text
session.profileDisplayName.trim()
-> session.username.trim()
-> session.email
```

不使用固定英文姓名，不使用本地 mock profile，也不因接口失败恢复 `David Stainberry`。

### 4.2 头像

头像直接读取 `/auth/me` 已有的 `avatarUrl`。该字段来自同一 User，并在用户端头像保存后通过正式 session refresh 更新。

头像为空或图片加载失败时，以最终显示名称的首字生成无图片占位，不引用生成式示例头像。

### 4.3 用户端资料更新后的同步

用户端保存资料时，如果 displayName 或 avatarUrl 任一发生变化，调用现有 `refreshSession()`。同一浏览器的已登录门户继续使用现有认证信封同步机制，不新增独立管理员资料缓存。

重新进入或刷新运营后台时，`/auth/me` 始终重新投影当前 CustomerProfile.displayName 和 User.avatarUrl。

### 4.4 角色文案

侧栏副标题不再固定为“平台运营管理员”。优先展示当前 operations 身份的正式 displayName；为空时展示经过 i18n 的“运营后台成员”。账号菜单与侧栏资料卡使用同一个解析结果。

角色和权限判断仍以 session.roles、session.permissions 和当前 operations 身份为准；显示文案不能授予权限。

## 5. 待处理订单

### 5.1 口径

“待处理”仅统计正式 BookingOrder 状态为 `pending` 的全平台订单，与订单管理页“待确认”筛选保持一致。

请求：

```text
GET /api/v1/backoffice/orders?page=1&pageSize=5&status=pending
```

数字读取分页响应的 total，展开区读取同一响应的 list。不得从 Dashboard 图表值、本地数组或固定数字推导第二个统计结果。

### 5.2 展开列表

每条展示：

- 订单编号；
- 顾客显示名；
- 店铺名称；
- 预约开始时间；
- 本地化状态。

按正式 API 当前排序显示最近五条。点击条目进入：

```text
/admin/orders?status=pending&orderId=<id>
```

订单管理页读取 query 参数，应用 `pending` 筛选并打开对应正式详情抽屉。“查看全部”进入 `/admin/orders?status=pending`。

## 6. 待审核店铺申请

### 6.1 口径

“审核”统计仍需运营处理的两种状态：

- `submitted`；
- `under_review`。

现有接口一次只接受一个 status，因此侧栏并发请求两页正式数据：

```text
GET /api/v1/ops/merchant-applications?page=1&page_size=5&status=submitted
GET /api/v1/ops/merchant-applications?page=1&page_size=5&status=under_review
```

数字为两个 total 之和。展开列表合并两组结果，按 submittedAt（为空时使用 createdAt）倒序排序并截取最近五条。

### 6.2 展开列表

每条展示：

- 申请编号；
- 店铺名称；
- 申请人或代表者姓名；
- 提交时间；
- 本地化状态。

点击条目进入：

```text
/admin/merchant-applications?status=pending&applicationId=<applicationId>
```

审核页把 `status=pending` 解释为 submitted 与 under_review 的联合视图，并根据 applicationId 请求正式详情。“查看全部”进入 `/admin/merchant-applications?status=pending`。

## 7. 侧栏组件与交互

新增聚焦单一职责的 `AdminOperatorSummary` 组件，接收当前 session 和权限查询函数，负责：

- 解析并显示管理员资料；
- 按权限加载两类摘要；
- 管理展开、收起、加载、错误与重试状态；
- 输出详情链接和“查看全部”链接。

交互规则：

- “待处理”和“审核”均为真实 button，带 `aria-expanded` 和关联面板 id；
- 同一时间只展开一个面板；
- 页面首次显示时加载当前用户资料，并为有权限的卡片加载第一页以显示真实数量；
- 展开后复用已成功读取的数据；点击重试才重新请求失败资源；
- 切换登录账号或 portal session 时清空旧摘要并重新读取，不能短暂显示上一账号的名称、头像、数量或列表；
- 数量为 0 时仍可展开，显示明确空状态；
- 展开列表限制为五条，侧栏自身保持滚动可用，不挤压或遮挡主导航。

## 8. 权限边界

- 当前 session 必须是 admin portal 且当前身份是 operations，才显示运营资料摘要。
- 具有 `backoffice:orders:list` 才显示并请求“待处理”。
- 具有 `ops:merchant-application:read` 才显示并请求“审核”。
- 无权限时隐藏对应卡片，不发出请求，也不显示 403 数量。
- 点击订单详情继续由订单读取权限保护；点击申请详情继续由申请读取权限保护。
- 前端隐藏只用于体验，后端 JWT、身份和 RBAC 仍是唯一授权依据。

## 9. 错误与竞态处理

- 管理员资料来自已验证 auth contract；`profileDisplayName` 非字符串或 avatarUrl 非字符串/null 时，auth contract 拒绝响应。
- 某一摘要加载失败时只影响该摘要，另一摘要和管理员资料继续可用。
- 401 交给现有认证失效处理；403 隐藏/禁用对应资源并提示权限已变化；5xx 和网络错误显示“加载失败，重试”。
- 使用 AbortController 或请求序号阻止账号切换、组件卸载和快速重试后的旧响应覆盖新状态。
- 展开列表不缓存到 localStorage；session 信封只保存正式自资料字段，不保存业务列表。
- 任何错误路径都不得恢复固定的 36、19、David Stainberry 或示例头像。

## 10. i18n 与可访问性

- 新增的标签、空状态、错误、重试、查看全部和资料回退文案支持 zh、zh-Hant、ja、en、ko。
- 日期使用当前后台语言与 Asia/Tokyo 展示，服务端仍返回 ISO 8601 UTC。
- 数字按钮提供包含数量的可访问名称；展开面板通过 `aria-controls` 关联。
- 列表项可通过键盘聚焦并进入详情；加载状态使用 `aria-live="polite"`，错误使用 `role="alert"`。
- 图片 alt 使用当前管理员显示名称，不使用固定“运营管理员头像”。

## 11. 测试与验收

### 11.1 后端与契约

- `/auth/me` 返回当前 User 对应的 CustomerProfile.displayName；无 CustomerProfile 时返回 null；
- 不同 User 不会互相读取 profileDisplayName；软删除资料不返回；
- auth contract、session envelope 和 portal session 轮换保留新字段；
- 订单和店铺申请请求继续经过现有分页、身份范围和 RBAC；
- submitted 与 under_review 的 total 组合规则有纯函数测试。

### 11.2 前端

- 源码和渲染结果中不存在 David Stainberry、固定 profile-03.jpg、36 或 19；
- 名称按 profileDisplayName、username、email 顺序回退；头像为空和加载失败均显示首字；
- 用户端名称或头像变化后触发 session refresh；
- 无对应权限不请求、不渲染卡片；
- 两类数据独立加载、独立失败、独立重试；
- 点击展开/收起、互斥面板、零数据空状态和最多五条均通过交互测试；
- 点击条目和查看全部生成正确 query；订单页和审核页能恢复筛选并打开指定详情。

### 11.3 浏览器验收

使用至少两个真实运营账号验证：

1. 登录后侧栏显示各自用户端名称、头像和身份文案；
2. 在用户端修改名称和头像，刷新 session 后运营后台同步；
3. 数字与正式 API total 一致；
4. 展开两类列表，逐条进入真实详情；
5. 使用缺少单项权限的运营账号确认卡片隐藏且网络中没有越权请求；
6. 验证深链接刷新、空数据、接口失败、重试、键盘操作、控制台错误和侧栏溢出。

本地测试、浏览器验收、合并 main、远端推送和 staging 部署是独立状态，不得互相替代。

## 12. 非目标

- 不在本步骤创建 FieldJob 表或上门工单状态机；
- 不建立跨订单、退款、SOS、通知和身份审核的统一运营任务中心；
- 不允许直接在展开列表中批准、驳回或修改订单；
- 不重构整个 AdminLayout 导航系统；
- 不修改用户端公开资料可见性规则；
- 不增加后台专用头像或后台专用昵称；
- 不执行 staging 部署或正式数据库写入。

## 13. 回滚策略

- UI 回滚后 auth 新字段可以安全保留，旧客户端会忽略它；
- auth 字段回滚不修改 CustomerProfile 或 User 数据；
- 侧栏摘要只读，不产生业务写入，回滚不需要数据修复；
- 深链接 query 为可选参数，旧页面忽略时仍可打开基础列表；
- 已删除的硬编码示例资料不得作为回滚后的正式兜底重新引入。
