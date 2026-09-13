# 正式上门工单只读投影契约

## 结论

运营后台上门工单不建立第二套 `FieldJob` 状态表。`BookingOrder` 已持久化履约方式、预约时段、客户、店铺、技师、订单状态历史、服务会话、收据、支付、退款争议、逾期处置、绩效判定与 SOS，因此它是唯一事实源。新能力只提供可审计的只读投影，避免订单与工单状态漂移。

本地正式运营测试数据使用 `home_visit`，新正式预约合同使用 `home`。两者都代表已经下单的上门履约方式，投影必须同时覆盖；不得根据服务名称或服务目录的 `serviceMode` 猜测订单履约方式。

## API

- `GET /api/v1/backoffice/field-jobs`
  - 权限：`backoffice:field-jobs:read`
  - 服务端分页：`page`、`pageSize`
  - 筛选：`keyword`、`status`、`assignment`
  - 仅返回未软删除且 `fulfillmentMode IN ('home', 'home_visit')` 的正式订单。
- `GET /api/v1/backoffice/field-jobs/:id`
  - 权限：`backoffice:field-jobs:read`
  - 非上门订单与不存在的订单统一返回 `error.field_job.not_found`。

列表与详情读取均写入正式审计日志。页面不提供派工、改派、导航、照片上传、异常上报或完工写操作；已有状态机、支付、退款和异常处置继续由对应正式模块负责。

## 隐私与授权

- 默认地址只返回行政区域，地址行固定为 `null`。
- 仅 `backoffice:field-jobs:address:read` 可读取订单创建时冻结的完整履约地址快照。
- 仅 `sos:list` 可读取活动 SOS 数量；无权限时固定返回 `null`。
- 不返回客户邮箱、电话、支付引用、退款证据、内部备注或服务开始秘密材料。
- `admin` 与 `operator` 获得两项专用权限；`viewer` 与 `finance` 不自动获得。

## 正式证据投影

- 技师分配：`BookingOrder.technicianProfileId` 及关联技师公开标识。
- 状态机：`BookingOrder.status` 与 `OrderStatusHistory`。
- 服务凭证：仅从 `OrderServiceSession` 投影 `not_issued`、`issued`、`verified` 三态及核验时间。
- 履约证据：服务开始/预计结束/结束、收据确认与支付状态。
- 异常摘要：活动 SOS、活动退款申请、未解决争议、逾期处置与绩效判定，仅返回计数或公开状态。

## 验证与回滚

- 契约、RBAC、脱敏、审计、OpenAPI 和迁移由 Jest 覆盖。
- 前端严格解析 API 响应，出现未声明字段即拒绝，防止敏感字段意外穿透。
- `npm run check:field-job-projection` 只允许本机 dev/test/local 数据库，并独立枚举正式上门订单后与仓储投影逐项比对；远程、staging、production 环境会被拒绝。
- 回滚时先撤回前端入口与两条 GET 路由；索引可单独移除。专用权限保留不会授予额外写能力。
