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
- [x] `20260829130000_order_acceptance_pause` 已通过 dry-run 后应用到正式本地 `needo_dev`；61 个 migration 状态一致，真实流程检查完成并恢复精确基线。
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
