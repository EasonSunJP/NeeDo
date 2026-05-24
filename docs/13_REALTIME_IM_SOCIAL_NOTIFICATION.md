# 13 — IM / Social / Notification 后端化

> 本文档用于指导 Codex 执行 Step 13。  
> 每次只执行本 Step，不要跨步骤开发。  
> 完成后必须通过验收，再进入下一 Step。

---

## 1. 阶段目标

在核心交易链路稳定后，再把 IM、Social、通知从浏览器 mock state 迁移到真实后端和实时事件。

---

## 2. 必须先读

- `README.md`
- `AGENTS.md`
- `docs/12_BACKOFFICE_MERCHANT_ADMIN_REAL_DATA.md`

---

## 3. 本步必须做

- 设计 Conversation、Message、Contact、FriendRequest、SocialPost、Follow、Notification 基础模型。
- 先做 REST API，再做 WebSocket/SSE。
- 实现消息分页、游标、未读数。
- 实现通知事件：订单状态、接单、取消、完单、好友申请、系统通知。
- 前端只替换 IM/Social API adapter，不改 UI。
- 实时服务与 REST 服务边界清晰。

---

## 4. 本步禁止做

- 不要与 Booking/NDP 状态机混在同一 PR。
- 不要一次性实现所有社交高级功能。
- 不要改现有 IM/Social 视觉。
- 不要无分页返回消息历史。

---

## 5. 交付物

- `IM/Social/Notification models`
- REST APIs
- `WebSocket/SSE gateway`
- 前端 adapter 接入
- `tests/realtime*.test.ts`
- `docs/realtime.md`

---

## 6. 验收标准

- [ ] 消息历史分页。
- [ ] 未读数正确。
- [ ] 订单状态能触发通知。
- [ ] WebSocket 断线重连策略清楚。
- [ ] 高频事件不会打爆数据库。

---

## 7. 给 Codex 的命令

```text
请阅读 README.md、AGENTS.md、docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md。本次只执行 Step 13：IM / Social / Notification 后端化。请先实现最小可用 REST API 和基础数据模型，再接 WebSocket/SSE 实时事件。重点是 Conversation、Message、Contact、FriendRequest、SocialPost、Follow、Notification、未读数、分页和订单状态通知。不要改现有 IM/Social UI，不要一次性实现所有高级社交功能，不要与 Booking/NDP 混在一个 PR。完成后运行 migration、lint、test、build，并更新 docs/realtime.md。
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
