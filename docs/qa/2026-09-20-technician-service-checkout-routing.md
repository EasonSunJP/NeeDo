# 技师自主定价预约参数闭环

## 缺陷与根因

店铺处于技师定价模式时，店铺页选择的来店日期、人数和时间没有进入技师服务列表 URL。服务列表又生成依赖 `shop`、`technician` 查询参数的旧 checkout URL，导致进入确认页后回退到当天，并失去可由正式技师服务上下文恢复的预约目标。

## 修复边界

- 店铺页进入技师服务列表时保留 `date`、`people`、`time`。
- 服务列表使用正式 `/checkout/technician-service/:technicianServiceId` 路由，并只转交预约选择参数。
- 合法的 `scheduleSlotId` 可在刷新或返回重进时保留；无效值不写入新 URL，过期或与服务不匹配的值仍由 checkout 可预约时段解析拒绝。
- checkout 从正式技师服务上下文显示服务、店铺和技师，从服务对应的正式 slot 恢复内部技师 ID，并将指名费计入显示价格和 `expectedPriceAmountJpy`。
- 前端不把 `shop`、`technician` 参数作为下单权威。Booking 事务继续以 `technicianServiceId`、`scheduleSlotId` 和数据库中的服务所有权、店铺归属、排班、冲突、容量、可见性及价格为准。

## 本地验收

- 路由单元测试覆盖日期、时间、人数、合法/非法 slot 参数及 scoped portal 路径。
- checkout 往返测试覆盖直接刷新、技师服务/技师/日期/时间/价格显示、指名费和提交 payload。
- 既有后端聚焦测试覆盖跨店归属拒绝、技师服务上下文资格、服务所有权反推、过期/不可用 slot、并发占用及角色作用域。

本修复不新增 API、数据库字段或 migration，不修改 staging/production 数据。
