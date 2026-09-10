# 00 — NeeDo 正式产品开发小步总计划

> 目标：把 NeeDo 从 demo / mock workflow 迁移到正式产品开发。  
> 方法：拆成 14 个小步骤，每一步独立验收，避免高爆发开发。  
> 执行方式：每次只把一个 Step 的命令发给 Codex。

---

## 1. 为什么不建议只拆 5 步

5 步适合做路线图，但不适合直接交给 Codex 开发。原因：

1. 每一步范围太大，容易把数据库、后端、前端、权限、业务状态机混在一起。
2. Codex 容易一次性改很多文件，导致难以 review。
3. 一旦出错，很难判断是 schema、API、权限、前端状态还是 mock 替换导致。
4. 当前项目已有大量高保真前端和 mock workflow，不适合推倒重来。
5. User Management、Booking、NDP 账本、IM / Social 都是高风险模块，必须分开。

因此正式开发建议拆成 14 个小步骤。

---

## 2. 小步路线图

| Step | 文件 | 目标 | 是否写代码 |
|---|---|---|---|
| 01 | `01_REPO_AUDIT_AND_BASELINE.md` | 仓库审计、技术栈确认、风险清单、基线保护 | 少量文档/配置 |
| 02 | `02_BACKEND_SCAFFOLD_ENV_DOCKER.md` | 后端工程底座、环境变量、Docker dev | 是 |
| 03 | `03_DATABASE_PRISMA_SCHEMA_FOUNDATION.md` | Prisma、MySQL、Redis、migration 规则 | 是 |
| 04 | `04_USER_MANAGEMENT_DATA_SEED.md` | User Management 数据模型、角色权限 seed | 是 |
| 05 | `05_AUTH_OTP_TOKEN_SESSION.md` | 登录、OTP、JWT、Refresh Token、Logout | 是 |
| 06 | `06_RBAC_USER_ROLE_PERMISSION_API.md` | Permission / Role / User API 与 RBAC | 是 |
| 07 | `07_FRONTEND_AUTH_PERMISSION_INTEGRATION.md` | 前端登录、httpClient、权限守卫 | 是 |
| 08 | `08_CORE_READ_API_AND_API_CONTRACTS.md` | 首页、搜索、分类、资料的只读 API | 是 |
| 09 | `09_FRONTEND_MOCK_RETIREMENT_BATCH1.md` | 前端第一批去 mock，不碰交易状态机 | 是 |
| 10 | `10_BOOKING_SCHEDULE_ORDER_STATE_MACHINE.md` | Booking、排班、订单状态机 | 是 |
| 11 | `11_NDP_LEDGER_FINANCE_RECONCILIATION.md` | NDP 钱包、冻结、扣费、返点、对账 | 是 |
| 12 | `12_BACKOFFICE_MERCHANT_ADMIN_REAL_DATA.md` | 运营后台、商户后台真实数据接入 | 是 |
| 13 | `13_REALTIME_IM_SOCIAL_NOTIFICATION.md` | IM / Social / Notification 后端化 | 是 |
| 14 | `14_PRODUCTION_LOAD_TEST_OBSERVABILITY.md` | 压测、监控、安全、上线准备 | 是 |

---

## 3. 阶段门禁

### Gate A：正式工程地基

必须完成 Step 01、02、03 后，才能进入 User Management。

验收：

- 后端可以启动。
- MySQL / Redis 可以通过 Docker dev 启动。
- Prisma migration 可以运行。
- 健康检查接口可用。
- 环境变量示例齐全。

### Gate B：真实账号与权限

必须完成 Step 04、05、06、07 后，才能进入基础业务 API。

验收：

- 超级管理员 seed 成功。
- 邮箱密码登录可用。
- OTP 登录可用。
- Token refresh 可用。
- Logout 后 token 失效。
- `/api/v1/auth/me` 返回身份、角色、权限、菜单。
- 前端登录不再依赖 fake user。
- 权限菜单与按钮受 RBAC 控制。

### Gate C：基础页面去 mock

必须完成 Step 08、09 后，才能进入 Booking。

验收：

- 首页、搜索、分类、店铺/技师/用户资料页可从 API 读取真实数据。
- mock adapter 被隔离，不能继续扩张。
- 旧 UI 不被破坏。

### Gate D：交易主链路

必须完成 Step 10、11 后，才能进入后台真实运营。

验收：

- Booking 下单、确认、取消、完单状态机可用。
- 排班可校验冲突。
- NDP 冻结、解冻、扣费、返点有完整 ledger。
- 财务流水可审计。

### Gate E：运营与上线

必须完成 Step 12、13、14 后，才能做大规模试点。

验收：

- 运营后台、商户后台读写真实数据。
- IM / Social 至少核心接口后端化。
- 压测报告、监控、日志、告警、备份、部署文档齐全。

---

## 4. 关于 10 万人同时访问

不要在 Step 1 就追求“10 万同时访问”。正确做法是：

1. 先保证数据模型和 API 正确。
2. 再保证权限、安全、审计正确。
3. 再保证核心交易状态机正确。
4. 最后在 Step 14 通过分级压测验证容量。

建议压测阶梯：

```text
1,000 并发 → 5,000 并发 → 10,000 并发 → 30,000 并发 → 100,000 并发访问峰值
```

这里的“100,000 同时访问”要拆成：

- 静态资源访问：优先交给 CDN。
- API 读请求：靠缓存、分页、索引、读写分离、限流。
- 登录与写请求：靠 Redis、队列、幂等、限流、横向扩容。
- WebSocket / IM：单独拆实时服务，不与普通 REST API 混跑。
- MySQL：避免热点写、避免 N+1、关键表索引、必要时拆读副本。

---

## 5. 使用纪律

每次只复制一个命令给 Codex。不要说“把 01-14 都做了”。

每个 Step 完成后，要求 Codex 输出：

1. 修改了哪些文件。
2. 新增了哪些接口。
3. 新增了哪些表或 migration。
4. 运行了哪些测试。
5. 哪些验收项已通过。
6. 是否有未完成项；如有，必须说明原因并不能伪装完成。

---

## 6. Step 11 / Step 12 联盟营销延伸微步骤进度

联盟营销正式化按照独立微步骤推进，不能把钱包、订单、后台与三端 UI 一次性混改。截至 2026-08-26：

1. 数据模型、migration、RBAC 权限与领域状态机：已完成。
2. 任务草稿、发布时全额冻结、运营审核与拒绝解冻 API：已完成，并通过本地 MySQL 事务验收。
3. 任务大厅、领取、唯一优惠码与签名 URL API：已完成，并通过并发领取、篡改拒绝和隔离验收。
4. Booking Checkout 归因、顾客优惠价格快照、奖励预算占用及完单前取消释放：已完成，并通过本地 MySQL 的最后预算/最后时段并发验收。
5. 服务完成固定 NDP 返点：已完成，并通过本地 MySQL 的精确入账、重复/并发幂等、限额释放及冻结余额不足整单回滚验收。
6. 任务结束自动解冻：已完成。backend 启动即执行并按间隔扫描，到期任务只释放当前未分配冻结 NDP；结束前有效 Attribution 的 allocated 预算继续保留；独立重访游标保证后续重新可释放的较小 ID 不饥饿，正式到期/预约事务对瞬态冲突进行有限重试。
7. 服务完成后退款：已完成后端正式案件、投诉门禁、用户到账确认与联盟奖励保留；三端页面验收尚未开始。
8. 服务完成前取消/未完成责任与联盟奖励：未开始，保持独立财务能力门禁。
9. 新的联盟 API、商户 PC、店铺端、联盟营销前端及运营后台 Afirieito 完整 UI：未开始，不能使用浏览器 mock 指标代替正式数据；本微步骤未新增 API 或 UI。

当前 Checkout 验收命令：

```bash
ENV_FILE=.env.dev npm --prefix backend run check:affiliate-checkout-attribution-flow
ENV_FILE=.env.dev npm --prefix backend run check:affiliate-service-completion-reward-flow
```
