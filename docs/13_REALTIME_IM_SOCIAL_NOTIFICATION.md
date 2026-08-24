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

- [x] 消息历史使用 `beforeId` 游标分页。
- [x] 会话、好友申请、通知未读数来自正式数据库，并由全局 SSE 订阅刷新。
- [x] 订单确认、开始、完成和取消能够写入持久化通知。
- [x] SSE 返回事件 ID 与重试提示；断线后客户端携带 `Last-Event-ID` 并重新读取未读数和当前资源。
- [x] 高频实时事件只通过内存网关分发，不为每次投递增加数据库写入。

## 6.1 完成记录（2026-08-25）

- 正式 IM 路由已接入会话、消息、联系人、好友申请、已读与未读数 API。
- 正式 Social 路由已接入动态列表、单条详情、发布、关注、通知与已读 API。
- 动态发布事件向作者及当前关注者分发 `social.post.created` SSE 事件。
- 正式模式不再自动 hydrate 或写入旧 IM/Social 浏览器业务数据库；旧页面仅在显式 static-demo + frontend-bypass 会话中保留。
- 文件消息、媒体动态、草稿、回复、点赞、转发、引用、收藏、组织通讯录、黑名单和高级群设置尚无正式合同，生产页面显示明确的未启用状态，不制造假成功。
- 真实模拟账号运行验收已覆盖：建会话、发消息、未读清零、非成员 404、公开动态、关注者可见性、取消关注隔离和单条动态读取。

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
