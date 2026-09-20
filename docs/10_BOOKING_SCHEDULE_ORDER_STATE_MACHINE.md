# 10 — Booking / Schedule / Order 状态机

> 本文档用于指导 Codex 执行 Step 10。  
> 每次只执行本 Step，不要跨步骤开发。  
> 完成后必须通过验收，再进入下一 Step。

---

## 1. 阶段目标

实现第一期核心交易主链路：Booking 免费预约、排班可用时段、订单确认/取消/完单状态机。Request 只预留底层枚举，不开放前端入口。

---

## 2. 必须先读

- `README.md`
- `AGENTS.md`
- `docs/09_FRONTEND_MOCK_RETIREMENT_BATCH1.md`

---

## 3. 本步必须做

- 设计 BookingOrder、ScheduleSlot、Availability、OrderStatusHistory。
- 实现技师/店铺可用时段读取。
- 实现 Booking 创建、确认接单、取消、开始服务、完成服务。
- 实现防超卖与冲突校验。
- 实现订单状态历史。
- 前端 checkout/orders 逐步接 API。
- Request 只预留 enum，不开放 UI。

---

## 4. 本步禁止做

- 不要实现 Request 大厅。
- 不要实现完整 NDP 扣费；只可调用待实现账本接口或预留 service boundary。
- 不要改 IM/Social。
- 不要改会员订阅。

---

## 5. 交付物

- `Booking/Schedule/Order Prisma models`
- Order state machine service
- Booking APIs
- Schedule APIs
- `前端 checkout/orders 接入`
- `tests/booking*.test.ts`
- `docs/order-state-machine.md`

---

## 6. 验收标准

- [x] 用户可以创建 Booking。
- [x] B 端可以确认接单。
- [x] 取消和完单状态正确。
- [x] 冲突时不能重复预约。
- [x] 状态历史可审计。
- [x] 测试覆盖状态机。
- [x] 商户和技师可用当前登录身份维护正式可预约时段，不能跨店或跨技师操作。
- [x] 合作技师可在多个有效从属店铺分别排班；只有 `confirmed` / `in_service` 预约会形成跨店硬锁，确认时在同一事务内串行校验，冲突返回统一的 `error.schedule.conflict`。
- [x] 技师本人发布的可排班时段标记为 `technician + affiliated_shops`，店铺发布的时段保持 `shop + shop_only`，不通过前端推断公开范围。
- [x] 运营、商户集团与店铺的暂停接单状态持久化并分别释放；暂停期间仍展示时段并允许创建 `pending`，但在结算前阻止 `pending → confirmed`。
- [x] 普通用户创建新 `pending` 时，在同一事务内取消其全部旧 `pending`、释放时段容量并记录替换历史；最高级 `black` 会员可保留多个 `pending`。
- [x] `20260829130000_order_acceptance_pause` 已通过 dry-run 后应用到正式本地 `needo_dev`；61 个 migration 状态一致，真实流程覆盖 membership 解除并发、多个旧 Affiliate 归因的预算原子复用并恢复精确基线。
- [x] 本地真实 MySQL 验证时区、重叠冲突、并发容量与清理。

---

## 7. 给 Codex 的命令

```text
请阅读 README.md、AGENTS.md、docs/10_BOOKING_SCHEDULE_ORDER_STATE_MACHINE.md。本次只执行 Step 10：Booking / Schedule / Order 状态机。请实现第一期 Booking 免费预约链路、可用时段、订单状态机、防超卖冲突校验、订单状态历史，并逐步接入 checkout/orders 前端页面。Request 只允许预留 orderType 枚举和数据库兼容字段，不开放 Request 大厅或前端入口。不要实现完整 NDP 钱包扣费，不要做 IM/Social/会员订阅。完成后运行 migration、lint、test、build，并更新 docs/order-state-machine.md。
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

---

## 2026-09-11 服务时间门禁与运营测试开关

正式履约时间门禁使用服务器时间与订单持久化快照。`随时服务测试` 关闭时，已确认订单只能从 `startsAt - 30 分钟` 起开始服务；服务中订单只能在服务会话 `expectedEndsAt` 到达后结束。开始与结束分别以 `error.order.service_start_too_early` 和 `error.order.service_end_too_early` 拒绝，且不产生部分状态、会话或事件写入。

运营后台显式开启开关后，仅跳过上述两个时间比较；身份归属、技师服务码、订单状态、未处理追加项目、幂等、付款与结算规则保持不变。订单事务直接读取当前激活的 `PlatformSettingVersion`，缺失设置或默认值均按关闭处理。设计与验证边界见 [Operations Anytime Service Test Design](superpowers/specs/2026-09-11-anytime-service-test-design.md)。

## 2026-09-13 登录后排班预加载与缓存生命周期

- `GET /api/v1/schedule/preload` 仅依据已认证账号在服务端解析其有效商户与技师身份；客户端不能传入店铺或技师作用域。
- 登录恢复或身份切换完成后，前端异步预取当前 14 天周期，第一页完成后其余分页最多 4 路并发；排班列表查询只选择响应需要的字段。
- 24 小时内的加密 IndexedDB 排班缓存先显示，同时后台刷新。缓存显示期间在画面中央显示 50% 透明度的 12 点 Loading，`pointer-events: none`，不阻断查看、滚动和点击。
- 关闭页面或 PWA 不会清空缓存；明确退出登录或切换到其他账号时，会物理删除该账号及其商户预览子作用域的持久缓存。排班写操作继续失效 `calendar:` 缓存。
- 设计与执行边界见 [设计说明](superpowers/specs/2026-09-13-schedule-login-preload-design.md) 与 [实施计划](superpowers/plans/2026-09-13-schedule-login-preload.md)。

## 2026-09-20 排班计划周期服务端权威

- 排班周期、目标技师、技师反馈和最终班次以 MySQL 为唯一权威来源；浏览器 `localStorage` 不再承载这些生命周期状态。
- 商户通过 `/api/v1/merchant-admin/schedule-cycles` 创建、保存、发起、提前结束反馈、自动确认、发布或取消周期。店铺作用域只从当前已认证商户身份解析，客户端不能指定其他店铺。
- 技师通过 `/api/v1/technician/schedule-cycles` 读取本人被指派的已发起周期，并只可提交本人的反馈。运营通过 `/api/v1/backoffice/schedule-cycles` 分页只读查看周期。
- 发起、自动确认与最终发布使用幂等键；生命周期写入、审计记录及班次/可预约时段投影在同一 `Serializable` 事务中完成。
- 自动确认遍历整个周期，而不是按周模板截断到 7 天；发布时把已确认班次投影为正式 `Availability` 和 `ScheduleSlot`，用户端继续只读取服务端可预约时段。
- 本地真实 MySQL 验收覆盖两个独立商户会话读取同一周期、技师反馈、非零自动确认、最终可预约投影及运营可见性，并在结束后清理测试数据。
