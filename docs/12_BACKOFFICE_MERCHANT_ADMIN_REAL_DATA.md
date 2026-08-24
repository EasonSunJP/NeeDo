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
