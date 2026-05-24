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

- [ ] 用户可以创建 Booking。
- [ ] B 端可以确认接单。
- [ ] 取消和完单状态正确。
- [ ] 冲突时不能重复预约。
- [ ] 状态历史可审计。
- [ ] 测试覆盖状态机。

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
