# 店铺会员中心与用户会员卡包基础设计

## 1. 背景与目标

线上商户端 `/merchant/member` 仍可直接打开，但展示的是旧浏览器 Store 驱动的演示页面；当前私有仓库为了移除本地 mock，已将该页面替换为“功能暂未开放”的能力封锁页。用户端个人中心虽然保留“会员”入口外观，但入口错误指回 `/me`，也没有读取店铺会员关系。

本轮恢复一个正式、可持续扩展的店铺会员基础纵切：

- 商户端恢复会员总览、会员列表、会员卡只读视图、活动记录和分析页面。
- 用户端个人中心增加真正的会员入口，并提供“我的会员店铺”列表与会员详情／会员卡状态。
- 所有数量、列表和状态来自正式 API 与 MySQL；无数据时显示真实空态，不生成演示记录。
- 会员功能入口、商户页面标题和用户会员页统一显示 `Test` 角标，表示功能处于测试阶段，不表示数据是测试数据。
- 商户只允许操作当前服务端身份所绑定的店铺；用户只允许查看自己的店铺会员关系。
- 本轮唯一写操作是“开通店铺会员关系”。开卡、充值、核销、退款继续作为后续独立微步骤。

平台级 `CustomerProfile.membershipLevel` 继续表示 NeeDo 平台会员等级；本轮店铺会员是独立的商户私域关系，两者不得合并或互相推断。

## 2. 参考产品模式

本设计吸收成熟会员产品的通用信息架构，但不复制其品牌或视觉：

- Square Loyalty 将客户档案、会员进度、奖励、关联卡和活动记录集中展示；NeeDo 对应为“店铺关系摘要 + 会员卡状态 + 最近活动”。
- LINE MINI App 会员卡示例强调用户快速找到店铺数字会员卡，同时由服务端绑定真实用户标识；NeeDo 对应为个人中心统一入口、按店铺分组、服务端自身份范围。
- 多店会员必须以店铺为一级对象，避免把同一用户在不同商户的余额、次数或状态混在一起。

参考链接：

- https://squareup.com/help/us/en/article/3952-create-a-loyalty-program-with-square
- https://squareup.com/help/us/en/article/5347-how-customers-redeem-their-rewards
- https://developers.line.biz/ja/docs/line-mini-app/demo/membership-demo/

## 3. 当前微步骤范围

### 3.1 本轮包含

1. 正式数据库表与 migration：店铺会员关系、会员卡只读投影。
2. 商户端真实分页／聚合／详情／候选用户／开通接口。
3. 用户端真实分页／详情接口。
4. 服务端店铺范围、用户自范围和 RBAC。
5. 开通会员的事务内审计与并发唯一性保护。
6. 商户端和用户端页面、加载态、错误态、空态、重试和窄屏布局。
7. OpenAPI、三端可见权限、五语言文案、专项测试与正式构建。

### 3.2 本轮明确不包含

- 开卡或发放会员卡。
- 会员卡充值、余额调整、赠送金额。
- 次卡／权益卡核销。
- 退款申请、审批或退款入账。
- 优惠券、积分、付费会员、营销自动化。
- 从旧 localStorage／IndexedDB 导入历史演示数据。

会员卡表在本轮只提供正式读取合同，为用户查看已有卡状态和后续小步骤提供稳定地基；本轮不开放任何卡写接口。生产库没有卡时，页面明确显示“暂无会员卡”。

## 4. 数据模型

### 4.1 `ShopCustomerMembership`

表达一个 CustomerProfile 与一家 Shop 的私域会员关系：

```text
id                 Int, internal primary key
publicId           UUID, API public identifier
shopId             Shop foreign key
customerProfileId  CustomerProfile foreign key
status             ACTIVE | ENDED
source             MERCHANT_MANUAL
activeKey          nullable unique concurrency key
startedAt          DateTime
endedAt            nullable DateTime
createdById        nullable User foreign key
updatedById        nullable User foreign key
createdAt / updatedAt / deletedAt
```

约束与索引：

- 当前有效关系使用 `shop:<shopId>:customer:<customerProfileId>` 作为 `activeKey`；结束关系时清空，允许未来重新加入并保留历史。
- 列表按 `shopId + status + startedAt + deletedAt` 和 `customerProfileId + status + startedAt + deletedAt` 建索引。
- 所有读取过滤 `deletedAt IS NULL`。

### 4.2 `ShopMembershipCard`

表达一家店发给某个店铺会员关系的卡片状态：

```text
id                 Int, internal primary key
publicId           UUID, API public identifier
membershipId       ShopCustomerMembership foreign key
cardNo             public card number
name               card display name snapshot
type               STORED_VALUE | COUNT | BENEFIT
status             ACTIVE | FROZEN | EXPIRED | VOID
principalBalanceJpy nullable Int
bonusBalanceJpy     nullable Int
remainingUses       nullable Int
totalUses           nullable Int
issuedAt             DateTime
expiresAt            nullable DateTime
frozenAt             nullable DateTime
createdAt / updatedAt / deletedAt
```

余额只用于状态展示，不与 NDP 钱包混合。未来充值、核销和退款必须通过独立账本与事务实现，不能直接在本轮页面修改这些字段。

## 5. 商户端信息架构

所有商户页面延续现有 NeeDo 深浅主题、圆角、边线和移动端外壳。桌面端提高信息密度，窄屏按单列重排，不产生横向溢出。

### 5.1 总览

- 标题“会员中心”旁显示红色 `Test` 角标。
- 指标：有效会员、今日新增、有效会员卡、即将到期会员卡；均来自当前店铺聚合。
- 主操作仅保留“开通会员”。
- 开卡、充值、核销、退款以“后续能力”说明展示，不渲染可点击的假按钮。
- 最近活动仅显示正式开通审计和未来卡业务事件；空时显示真实空态。

### 5.2 会员

- 服务端分页，默认 20 条，支持关键字和状态过滤。
- 展示公开 NeeDoID、显示名称、状态、加入时间、会员卡数量和最近活动时间。
- 详情抽屉／页面不显示 User ID 或 CustomerProfile ID。
- “开通会员”先搜索当前店铺存在正式预约关系的用户；已是有效会员者不进入候选列表。
- 提交体只包含公开 NeeDoID，服务端重新解析用户、预约关系和当前店铺范围。

### 5.3 会员卡

- 只读分页，支持卡类型和状态过滤。
- 显示卡名、掩码卡号、所属用户、余额或剩余次数、状态和到期时间。
- 无卡时解释“已开通的店铺会员会保留；开卡将在后续步骤开放”。
- 不提供开卡、充值、核销或退款入口。

### 5.4 活动记录

- 展示当前店铺会员域的正式操作记录，服务端分页。
- 本轮至少包含开通会员事件；未来卡操作沿用同一事件合同。
- 会员读取本身不写审计，避免查看行为污染活动记录。

### 5.5 分析

- 只展示当前可由店铺会员关系与卡状态可靠计算的数据：有效会员、期间新增、有效／冻结／到期卡数和趋势。
- 不展示 GMV、复购率、ROI 或消费金额，直到会员账本与订单归因合同完成。
- 无数据返回 0 或空序列，不生成演示曲线。

## 6. 用户端信息架构

### 6.1 个人中心入口

- 保留截图中的双列服务工具布局。
- “会员”入口改为 `/me/memberships`，说明改为“查看已加入店铺与会员卡状态”。
- 右侧显示当前有效店铺会员数；同时在卡片右上角显示红色 `Test` 角标。
- 数量加载失败时显示 `—`，不冒充 0；入口仍可进入并在目标页重试。

### 6.2 我的会员

- 顶部标题“我的会员”加 `Test` 角标。
- 按店铺展示卡片：店铺名称、城市、会员状态、加入时间、会员卡数量、即将到期提示和最近更新时间。
- 默认展示有效关系，同时允许查看已结束关系。
- 空态提供返回首页或浏览店铺入口，不生成推荐会员卡。

### 6.3 会员详情

- 店铺摘要为一级标题，会员关系状态为二级信息。
- 会员卡按卡片展示类型、状态、余额／次数、到期时间和掩码卡号。
- 没有卡时仍展示有效店铺会员关系，并显示“暂无会员卡”。
- 提供“查看店铺”导航；扫码核销、充值和退款不在本轮出现。

## 7. API 合同

### 7.1 商户端

```text
GET  /api/v1/merchant-admin/shop-memberships/overview
GET  /api/v1/merchant-admin/shop-memberships?page=1&pageSize=20&keyword=&status=
GET  /api/v1/merchant-admin/shop-memberships/:publicId
GET  /api/v1/merchant-admin/shop-membership-candidates?page=1&pageSize=20&keyword=
POST /api/v1/merchant-admin/shop-memberships
GET  /api/v1/merchant-admin/shop-membership-cards?page=1&pageSize=20&type=&status=
GET  /api/v1/merchant-admin/shop-membership-activities?page=1&pageSize=20
GET  /api/v1/merchant-admin/shop-membership-analytics?period=last30days
```

开通请求：

```json
{
  "customerNeedoId": "u0000000123"
}
```

商户接口不接受 `shopId`。Service 只从已认证的 `currentIdentityScopeType=shop` 与 `currentIdentityScopeId` 解析店铺，Repository 所有查询再次带 `shopId`。

### 7.2 用户端

```text
GET /api/v1/customer-profile/me/shop-memberships?page=1&pageSize=20&status=
GET /api/v1/customer-profile/me/shop-memberships/:publicId
```

用户端不接受 `userId` 或 `customerProfileId`；Service 依据当前 customer identity scope 读取。

所有列表返回统一分页结构 `{ list, total, page, page_size }`。所有错误使用稳定 i18n key。

## 8. RBAC 与审计

正式权限：

- `shop.member.view`：商户会员、卡片和基础总览读取。
- `shop.member.create`：开通会员关系。
- `shop.member.analytics.view`：分析读取。
- `shop.member.operation_log.view`：活动记录读取。

角色策略：

- `merchant_owner` 拥有上述四项。
- `merchant_staff` 默认只有 `shop.member.view`；不开通会员，不查看分析和操作日志。
- 前端从 legacy portal feature fallback 中移除会员权限，必须以 `/auth/me` 返回的正式权限为准。
- 用户端沿用 `customer-profile:read`，并强制当前 customer identity 自范围。

开通会员与审计在同一 Prisma transaction 中完成：

```text
action: merchant.shop_membership.create
targetType: ShopCustomerMembership
targetId: internal membership id (audit only)
metadata: membershipPublicId, customerNeedoId, shopNo, source
```

审计元数据不包含手机号、邮箱、token 或内部 CustomerProfile ID。并发重复开通映射为稳定 409 `error.shop_membership.already_active`。

## 9. 错误、空态与并发

- 401：登录失效；403：身份或权限不符；404：会员或候选用户不存在；409：已是有效会员；5xx：服务暂不可用。
- 商户候选用户必须与当前店铺至少存在一笔未删除正式预约；跨店 NeeDoID 返回 404，不泄漏存在性。
- 页面加载失败保留当前筛选与已成功数据，并提供重试。
- 搜索与切换筛选使用 AbortController 或请求序号，迟到响应不得覆盖新条件。
- 开通成功后刷新总览、会员列表、候选列表和活动记录；失败保留搜索结果。

## 10. 测试与验收

### 10.1 后端

- migration、schema 索引、外键与软删除字段。
- 候选用户限定当前店铺预约关系，跨店和无预约不可见。
- 开通成功、重复／并发冲突、只读员工拒绝、错误身份拒绝。
- 商户所有读接口严格限定当前店铺；用户所有读接口严格限定本人。
- 事务内审计、敏感元数据排除、分页、Zod strict、OpenAPI。
- 卡片、活动与分析的真实空数据合同。

### 10.2 前端

- 商户导航与页面标题、用户个人中心入口和用户会员页都有 `Test` 角标。
- 商户五个视图、分页、筛选、开通对话框、空态、错误态和重试。
- 用户入口显示真实有效店铺数；列表与详情显示会员和卡状态。
- 无卡、无会员、403、超时和迟到响应。
- 五语言文案、深浅主题、键盘焦点、桌面／窄屏无横向溢出。

### 10.3 交付门禁

- `npx prisma validate`、migration contract、专项及全量测试通过。
- 前后端 lint/typecheck 和 `npm run verify:production-build` 通过。
- 本地正式前后端运行后，桌面与手机尺寸完成商户／用户浏览器验收，并检查控制台与网络错误。
- 生产迁移、后端和前端必须同批发布；发布后重新登录验证 RBAC，再验收真实空态与真实开通流程。
