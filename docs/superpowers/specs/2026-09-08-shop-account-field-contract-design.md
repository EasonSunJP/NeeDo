# 店铺列表正式字段与详情读取设计

## 范围

运营后台店铺列表的“创建者”和“平台抽成”必须来自正式 SaaS 账号 API；点击“详情”后必须重新读取当前集团或店铺，而不是长期使用列表快照。

## 数据权威

- `shops.created_by_id` 保存创建店铺记录的运营用户。运营创建店铺写当前操作人，商家申请审核通过创建店铺写审核人。历史记录无法可靠推断时保持 `null`，界面显示“未记录”。
- 本期店铺列表的平台抽成为产品固定规则 `0%`。该规则由服务端字段 `platformCommissionRatePercent` 返回；不复用按 NDP 金额计费的 `ShopPlatformFeePolicy`，也不在前端写死。
- 单店详情使用 `GET /api/v1/backoffice/shops/:id/saas-account`，集团详情继续使用 `GET /api/v1/backoffice/merchant-accounts/:id`。两者沿用读取权限，并写审计。

## 安全与兼容

新外键允许空值并采用 `ON DELETE SET NULL`，避免伪造历史创建者或因用户软删除破坏店铺记录。详情接口使用现有 JWT、RBAC、Zod 参数校验、统一响应和 OpenAPI 契约。

## 前端行为

列表显示创建人名称与 NeeDo ID；平台抽成读取 API 数值。详情先立即展示当前列表快照，再在抽屉内刷新；刷新失败保留现有内容、显示错误并允许重试。请求序号防止快速切换店铺时旧响应覆盖新选择。
