# 12 — 运营后台与商户后台真实数据接入

> 本文档用于指导 Codex 执行 Step 12。  
> 每次只执行本 Step，不要跨步骤开发。  
> 完成后必须通过验收，再进入下一 Step。

---

## 1. 阶段目标

让运营后台和商户后台从真实 API 读取用户、店铺、技师、订单、排班、账本数据，具备基础管理和对账能力。

---

## 2. 必须先读

- `README.md`
- `AGENTS.md`
- `docs/11_NDP_LEDGER_FINANCE_RECONCILIATION.md`

---

## 3. 本步必须做

- 运营后台 Dashboard 接真实指标。
- 商户后台订单中心接真实订单。
- 调度中心读取真实排班与 Booking。
- 财务结算读取 ledger。
- 技师/店铺管理接真实用户身份。
- 所有后台操作受 RBAC 控制。
- 增加导出 CSV/Excel 基础能力。

---

## 4. 本步禁止做

- 不要重做后台 UI。
- 不要新增 fake dashboard data。
- 不要做 IM/Social 实时化。
- 不要做大规模压测。

---

## 5. 交付物

- admin dashboard APIs
- merchant admin APIs
- 前端后台 API adapters
- 后台权限点补齐
- 导出接口
- `tests/backoffice*.test.ts`
- `docs/backoffice-real-data.md`

---

## 6. 验收标准

- [x] 运营后台关键指标来自真实数据库。
- [x] 商户后台能看真实订单/排班/账本。
- [x] 无权限用户不能访问管理操作。
- [x] 导出数据与数据库一致。
- [x] 旧 mock 后台数据不再用于已接入页面。

---

## 7. 给 Codex 的命令

```text
请阅读 README.md、AGENTS.md、docs/12_BACKOFFICE_MERCHANT_ADMIN_REAL_DATA.md。本次只执行 Step 12：运营后台与商户后台真实数据接入。请让运营后台和商户后台的 Dashboard、订单中心、调度中心、财务结算、技师/店铺管理逐步接真实 API 和真实数据库。所有后台操作必须受 RBAC 控制，并补齐审计日志。不要重做后台 UI，不要新增 fake dashboard data，不要做 IM/Social 实时化和压测。完成后运行 lint、test、build，并更新 docs/backoffice-real-data.md。
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

## 9. 2026-08-25 完成记录

- 运营后台 Dashboard、订单、排班、财务、店铺、技师和用户管理均使用正式分页 API。
- 商户后台 Dashboard、订单、排班、财务、工资单、店铺设置和人员管理均使用当前 `shop` 身份范围的正式 API。
- 商户调度中心已移除正式路由对浏览器 dispatch store 的依赖，支持正式排班时段创建、阻塞/恢复和软删除；自动/智能排班在正式合同完成前保持生产保护状态。
- 订单、排班、人工收款、退款、财务规则、工资单和管理写操作由后端 RBAC、范围校验、事务和 AuditLog 保护。
- CSV 导出使用后端真实响应；模拟账号 XLSX 属于本地 seed 工具输出，不进入正式 API。
- 本轮未新增 schema 或 migration；复用了已经完成的 Step 10-13 数据表与接口。

验证结果：

- 前端：141 个测试文件、697 项测试通过；TypeScript lint 与 Vite production build 通过。
- 后端：50 个测试文件、198 项测试通过；ESLint 与 TypeScript build 通过。

## 10. 2026-08-26 技师榜单正式数据

运营后台入口：`/pf-admin.html#/admin/technicians?module=ranking`。

正式接口：

- `GET /api/v1/backoffice/technician-rankings`：分页读取聚合榜单。
- `GET /api/v1/backoffice/technician-rankings/export`：按相同条件导出 CSV，最多 5,000 行。

两个接口均要求 `backoffice:technicians:list` 权限，分别写入
`backoffice.technician_rankings.list` 与
`backoffice.technician_rankings.export` 审计记录。列表支持技师关键字、店铺、城市、
统计期间、指标、升降序和分页筛选；CSV 与当前筛选、排序、统计口径完全一致。

统计期间按 `Asia/Tokyo` 日历解释：

- 默认本月。
- 今日、近 7 天、近 30 天。
- 自定义起止日，起止日均包含在统计范围内。
- 历史累计。

指标口径：

- 已完成订单服务金额：仅统计状态为 `completed` 且未退款的订单，汇总正式
  `service_amount_jpy`；加钟后的最终服务金额计入原订单。
- 已完成订单数：按 Booking 主订单去重，同一订单内加钟仍只计 1 单。
- 工作天数：按订单完成时间转换为东京日期去重，当天至少完成 1 单计 1 天。
- 已软删除的账号、技师资料、订单和财务记录均不进入统计。

前端提供期间切换、自定义日期、技师/店铺/城市筛选、三指标排序、服务金额比例条、
服务端分页、CSV 导出和正式技师详情抽屉。本轮复用现有 Booking、OrderFinancial、
TechnicianProfile 与 Shop 数据，没有新增 schema 或 migration，也没有新增 mock 数据。

专项测试覆盖：期间边界与输入校验、东京日历换算、SQL 聚合口径、分页与汇总、RBAC、
审计、CSV、OpenAPI、前端 API adapter 和榜单页面接线。
