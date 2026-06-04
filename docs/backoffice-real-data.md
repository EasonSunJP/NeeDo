# Step 12 — Backoffice / Merchant Admin Real Data

本文件记录 Step 12 第一批真实数据接入范围。目标是让运营后台与商户后台先从正式后端读取核心经营数据，同时保留既有 UI 结构，不重做后台界面。

## 本次接入范围

- 运营后台 Dashboard：读取真实订单、排班、财务对账、技师、店铺汇总。
- 运营后台订单中心：读取 `/api/v1/backoffice/orders`。
- 运营后台财务结算：读取 `/api/v1/backoffice/finance/settlements`，并可调用导出接口。
- 运营后台技师 / 店铺管理：读取真实 `TechnicianProfile` 与 `Shop` 数据。
- 商户后台 Dashboard：按当前登录身份的 `shop` scope 读取本店数据。
- 商户后台订单中心：读取 `/api/v1/merchant-admin/orders`。
- 商户后台财务结算：读取 `/api/v1/merchant-admin/finance/settlements`。
- 商户后台财务规则中心：读取、更新并预览本店工资、分成、奖金和 NDP 承担规则。
- 商户后台订单钱路：读取订单服务收入、NDP 冻结/扣除/返点、技师收入预估和 Money Timeline。
- 商户后台服务收入上报：上报线下/平台收款金额、支付渠道、备注与确认状态。
- 商户后台技师收入模式：按技师配置固定工资、时薪、分成、奖金/扣款和 NDP 承担，未配置时自动继承店铺规则。
- 商户后台工资单闭环：生成 Pay Run 草稿、重算草稿、发布、审批、记录支付、锁定归档，并查看 Payslip 行项目。
- 技师端工资单：读取个人 Payslip，查看 Money Timeline/行项目，确认或申诉。
- 运营后台工资汇总：只读查看 Pay Run 总额、未支付、申诉和周期状态。
- 商户后台员工列表：读取 `/api/v1/merchant-admin/technicians`。

调度中心后端接口已提供：

- `/api/v1/backoffice/schedule`
- `/api/v1/merchant-admin/schedule`

现有调度 UI 仍使用原本的排班工作台组件，下一批可把这些组件的数据源切换到上述接口。

## 新增 API

运营后台：

- `GET /api/v1/backoffice/dashboard`
- `GET /api/v1/backoffice/orders`
- `GET /api/v1/backoffice/schedule`
- `GET /api/v1/backoffice/finance/settlements`
- `GET /api/v1/backoffice/finance/settlements/export`
- `GET /api/v1/backoffice/finance/orders/:bookingOrderId`
- `GET /api/v1/backoffice/technicians`
- `GET /api/v1/backoffice/shops`

商户后台：

- `GET /api/v1/merchant-admin/dashboard`
- `GET /api/v1/merchant-admin/orders`
- `GET /api/v1/merchant-admin/schedule`
- `GET /api/v1/merchant-admin/finance/settlements`
- `GET /api/v1/merchant-admin/finance/settlements/export`
- `GET /api/v1/merchant-admin/finance/orders/:bookingOrderId`
- `PUT /api/v1/merchant-admin/finance/orders/:bookingOrderId/service-income-report`
- `GET /api/v1/merchant-admin/shops/:shopId/finance/rules`
- `PUT /api/v1/merchant-admin/shops/:shopId/finance/rules`
- `POST /api/v1/merchant-admin/shops/:shopId/finance/rules/preview`
- `GET /api/v1/merchant-admin/shops/:shopId/technicians/:technicianProfileId/compensation-profile`
- `PUT /api/v1/merchant-admin/shops/:shopId/technicians/:technicianProfileId/compensation-profile`
- `POST /api/v1/merchant-admin/shops/:shopId/technicians/:technicianProfileId/compensation-profile/preview`
- `GET /api/v1/merchant-admin/technicians`
- `GET /api/v1/merchant-admin/shop`

真实测试账号登录：

- 不再提供 passwordless `POST /api/v1/auth/test-login`。
- 测试账号必须使用 `POST /api/v1/auth/login` 的 `email + password` 链路。
- seed 会创建 `admin@example.com`、`operator@example.com`、`merchant@example.com`、`technician@example.com`、`customer@example.com`。
- 测试账号密码来自 `TEST_USER_DEFAULT_PASSWORD`；仅本地开发可 fallback 到 `ADMIN_DEFAULT_PASSWORD`。
- 本地 `vite dev` / `vite preview` 会把 `/api/v1` 代理到正式后端，默认目标为 `http://127.0.0.1:3000`；如后端地址不同，可通过 `NEEDO_API_PROXY_TARGET` 或 `VITE_API_PROXY_TARGET` 覆盖。

## RBAC 与审计

新增权限点：

- `backoffice:dashboard:read`
- `backoffice:orders:list`
- `backoffice:schedule:list`
- `backoffice:finance:list`
- `backoffice:finance:export`
- `backoffice:finance-order:read`
- `backoffice:technicians:list`
- `backoffice:shops:list`
- `merchant-admin:dashboard:read`
- `merchant-admin:orders:list`
- `merchant-admin:schedule:list`
- `merchant-admin:finance:list`
- `merchant-admin:finance:export`
- `merchant-admin:finance-order:read`
- `merchant-admin:finance-income-report:write`
- `merchant-admin:finance-rules:read`
- `merchant-admin:finance-rules:write`
- `merchant-admin:finance-rules:preview`
- `merchant-admin:compensation-profile:read`
- `merchant-admin:compensation-profile:write`
- `merchant-admin:compensation-profile:preview`
- `merchant-admin:technicians:list`
- `merchant-admin:shop:read`

每个 Step 12 后台接口都会通过 JWT + RBAC middleware。商户后台接口会从当前身份读取 `scopeType=shop` 与 `scopeId`，只返回该店铺范围内的数据。

审计日志动作包括：

- `backoffice.dashboard.read`
- `backoffice.orders.list`
- `backoffice.schedule.list`
- `backoffice.finance.list`
- `backoffice.finance.export`
- `backoffice.technicians.list`
- `backoffice.shops.list`
- `merchant_admin.dashboard.read`
- `merchant_admin.orders.list`
- `merchant_admin.schedule.list`
- `merchant_admin.finance.list`
- `merchant_admin.finance.export`
- `merchant_admin.finance_rules.read`
- `merchant_admin.finance_rules.update`
- `merchant_admin.finance_rules.preview`
- `merchant_admin.finance_order.read`
- `merchant_admin.finance_order.service_income_report`
- `backoffice.finance_order.read`
- `merchant_admin.compensation_profile.read`
- `merchant_admin.compensation_profile.update`
- `merchant_admin.compensation_profile.preview`
- `merchant_admin.technicians.list`
- `merchant_admin.shop.read`
- `auth.test_login`

## 财务口径

后台财务结算不再把 `FinanceReconciliation.actualAmount` 当作服务流水。真实财务视图读取 `order_financials`，并明确拆分服务金额与 NDP 账本金额：

- `estimatedServiceGmvJpy`: 估算服务 GMV，来自 Booking 价格或 `order_financials.serviceAmountJpy`。
- `platformCollectedServiceAmountJpy`: 平台代收服务金额，本次只保留字段，不做复杂清分。
- `offlineReportedServiceAmountJpy`: 商户线下上报服务金额。
- `unknownOrUnreportedServiceAmountJpy`: 未上报或未知服务金额。
- `platformNdpRevenue`: 平台 NDP 净收入，等于实际 B 端平台费扣除用户返点成本后的净额。
- `userRewardNdpCost`: 用户返点成本。
- `pendingHoldNdp`: 已冻结但尚未扣除或释放的 NDP。
- `campaignDiscountNdp`: 活动减免 NDP。
- `releasedNdp`: 已释放冻结 NDP。
- `appliedFeeRuleIds`: 命中的费用规则 ID。
- `serviceIncomeStatus`: `unreported`、`reported`、`confirmed`。
- `paymentChannel`: `unknown`、`platform_online`、`offline_cash`、`offline_card`、`bank_transfer`、`other`。
- `technicianEstimatedIncomeJpy`: 根据当前技师收入模式预估的技师净收入。
- `shopEstimatedGrossProfitJpy`: 服务金额扣除技师毛收入和店铺承担 NDP 后的店铺预估毛利。
- `moneyTimelineStatus`: `needs_income_report`、`needs_review`、`complete`。
- `moneyTimeline`: `{ type, label, amountJpy?, amountNdp?, actorType, occurredAt, status, metadata }[]`。

`FinanceReconciliation` 与 `/api/v1/finance/reconciliation` 仍保留为账本交易对账和导出接口，但不再作为 Backoffice / Merchant Admin 的服务流水来源。

## 商户财务规则中心 v1

`shop_finance_rule_sets` 保存商户侧财务规则版本。当前 v1 支持：

- `wageMode`: `fixed_per_order`、`commission`、`base_plus_commission`、`hourly`。
- `commissionRatePercent`、`fixedOrderPayJpy`、`hourlyRateJpy`、`guaranteedMinimumJpy`。
- 月单量、月 GMV、评分触发的奖金规则，以及迟到/取消、评分低于阈值触发的扣款规则。
- `ndpFeeBearer`: `shop`、`technician`、`split`，并支持 `technicianNdpSharePercent`。
- preview 返回 `technicianGrossIncomeJpy`、`technicianNetIncomeJpy`、`shopGrossMarginJpy`、`shopNdpShareNdp`、`technicianNdpShareNdp`。

更新规则不会覆盖历史版本；服务层会归档旧 active 版本并创建新 active 版本，同时写入审计日志。

## Step 12A：订单钱路 + 技师收入模式基础

`OrderFinanceService` 基于 `BookingOrder`、`OrderFinancial`、`WalletHold`、`FeeCalculationLog` 与当前收入规则生成订单财务详情。商户和运营后台读取同一 DTO；商户侧额外可以上报服务收入，写回 `order_financials` 并追加 Money Timeline。

`CompensationEngine` 是纯计算层，统一输出：

- `basePayJpy`
- `commissionPayJpy`
- `minimumGuaranteeAdjustmentJpy`
- `bonusPayJpy`
- `deductionJpy`
- `technicianGrossIncomeJpy`
- `technicianNdpShareNdp`
- `shopNdpShareNdp`
- `technicianNetIncomeJpy`
- `shopEstimatedGrossProfitJpy`

`technician_compensation_profiles` 保存技师级收入配置版本。若某个技师没有 active override，接口会 fallback 到 `shop_finance_rule_sets` 的 active 店铺规则；这保证静态站点和未来动态站点使用同一套前端 DTO，不需要重做页面。

`order_financials` 在 Step 12A 扩展以下字段：

- `service_income_reported_by_id`
- `service_income_reported_at`
- `service_income_confirmed_by_id`
- `service_income_confirmed_at`
- `service_income_note`
- `service_income_proof_url`

## Step 12B：工资单闭环

`PayrollService` 使用已完成且收入已上报/确认的 Booking 订单生成店铺工资周期。计算口径复用 Step 12A 的 `CompensationEngine`，并把基础工资、分成、保底补足、奖金、扣款、NDP 分摊和人工行项目写入 `payslip_lines`，确保每一笔技师收入都有来源订单、规则或人工调整记录。

生命周期固定为：

```text
draft -> reviewing -> published -> confirmed / disputed -> approved -> scheduled -> paid -> locked
```

当前切片落地的操作边界：

- 草稿可生成和重算；发布后不允许重算覆盖金额。
- 商户可发布、审批、记录支付、锁定工资周期。
- 商户财务结算页已接入工资调整申请列表、创建、提交、审批和驳回操作，使用正式 `merchantPayrollCenterApi` typed API。
- 商户和运营后台可导出 Pay Run CSV，技师可导出自己的 Payslip CSV；正式 payroll 导出路由直接返回 `text/csv; charset=utf-8` 与 `Content-Disposition` 文件名，前端通过 `httpClient.requestCsvExport` 转换为下载 envelope，暂不做 Excel/PDF。
- 技师可读取自己的工资单，发布后可确认或申诉。
- 运营后台只读查看工资周期汇总，不参与商户支付动作。
- 本轮不接银行代付、不做文件上传、不做税务/发票；奖金/补贴/扣款只做基础申请、提交、审批/驳回和工资单应用，不做多级审批或外部附件流。

## Step 12C：Payroll 闭环硬化

Step 12C 在 Step 12B 的工资单基础上补齐申诉处理、支付记录确认和状态机硬约束，不扩大到 Request 调度费、银行代付、税务/发票、Excel/PDF 或上线性能拆包。

新增闭环规则：

- 技师只能在 `published` 状态确认或申诉工资单。
- `disputed` 工资单必须由商户处理申诉后回到 `published / resolved`，再交给技师确认。
- Pay Run 只能从 `draft / reviewing` 发布；存在未解决申诉时不能审批；未全额支付时不能锁定归档。
- 商户只能对 `approved / scheduled` 的 Payslip 记录支付，禁止超付。
- 技师可确认具体支付记录收款，`payout_records.technician_confirmed_at` 保留收款确认时间；支付记录确认仅允许在 `scheduled / paid` 的 Payslip 上发生，`locked` 后禁止继续确认。
- `paid / locked` 后禁止技师继续确认或申诉工资单，禁止商户继续新增支付记录；工资周期已关闭时禁止新增奖金、补贴或扣款调整申请。

Step 12C 扩展字段：

- `payslips.dispute_resolved_at`
- `payslips.dispute_resolved_by_id`
- `payslips.dispute_resolution_note`
- `payout_records.technician_confirmed_at`

新增正式 API：

- `GET /api/v1/merchant-admin/pay-runs`
- `GET /api/v1/merchant-admin/pay-runs/export`
- `POST /api/v1/merchant-admin/pay-runs`
- `GET /api/v1/merchant-admin/pay-runs/:id`
- `POST /api/v1/merchant-admin/pay-runs/:id/recalculate`
- `POST /api/v1/merchant-admin/pay-runs/:id/publish`
- `POST /api/v1/merchant-admin/pay-runs/:id/approve`
- `POST /api/v1/merchant-admin/pay-runs/:id/lock`
- `POST /api/v1/merchant-admin/payslips/:id/payout-records`
- `POST /api/v1/merchant-admin/payslips/:id/resolve-dispute`
- `GET /api/v1/merchant-admin/payroll-adjustments`
- `POST /api/v1/merchant-admin/payroll-adjustments`
- `POST /api/v1/merchant-admin/payroll-adjustments/:id/submit`
- `POST /api/v1/merchant-admin/payroll-adjustments/:id/approve`
- `POST /api/v1/merchant-admin/payroll-adjustments/:id/reject`
- `GET /api/v1/technician/payslips`
- `GET /api/v1/technician/payslips/export`
- `GET /api/v1/technician/payslips/:id`
- `POST /api/v1/technician/payslips/:id/confirm`
- `POST /api/v1/technician/payslips/:id/dispute`
- `POST /api/v1/technician/payslips/:payslipId/payout-records/:payoutRecordId/confirm`
- `GET /api/v1/backoffice/pay-runs`
- `GET /api/v1/backoffice/pay-runs/export`

Payroll CSV 导出响应合同：

- `GET /api/v1/merchant-admin/pay-runs/export`
- `GET /api/v1/technician/payslips/export`
- `GET /api/v1/backoffice/pay-runs/export`

以上三个接口不使用 `{ code, message, data }` JSON envelope，而是返回 CSV 下载响应：

```text
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="<scope>-<YYYY-MM-DD>.csv"
```

前端正式 API adapter 使用 `httpClient.requestCsvExport` 读取真实 CSV body，并保持 `downloadCsvExport` 所需的 `{ filename, contentType, csv }` 调用形状；静态 demo 仍只作为 same-shape compatibility。

## Step 12E：Request 财务 API 适配

Step 12E 不新建 Request 大厅、调度大厅、退款状态机或前端入口；本步只把既有 `BookingOrder.orderType = request` 和 C 端 Request dispatch fee 接入正式后端订单/账本/API 适配。

新增/收紧的写侧口径：

- `POST /api/v1/bookings` 允许 `orderType = request`，默认仍为 `booking`，旧前端不传该字段时行为不变。
- Request 确认接单时计算 `c_request_dispatch_fee`，默认 seed 为 `500 NDP`，付款方为 customer user wallet。
- seed 通过账本初始化给 demo customer 与 `customer@example.com` 钱包充值 `1000 NDP`，用于 Request dispatch fee 冻结/完单 smoke flow。
- Request 确认接单会冻结 C 端钱包，并写入 `order_financials.c_request_fee_hold_ndp`。
- Request 完单会实扣 C 端冻结的 dispatch fee，并写入 `order_financials.c_request_fee_actual_ndp`。
- Request 取消会释放剩余 C 端 dispatch fee 冻结；本步不做商户违约赔付和 Request refund 状态机。

新增/收紧的展示口径：

- `OrderFinanceDetail` 返回 `orderType`、`cRequestFeeHoldNdp`、`cRequestFeeActualNdp` 和 `requestFeeNdpRevenue`。
- 平台 NDP 净收入统一按 `bPlatformFeeActualNdp + cRequestFeeActualNdp - userRewardNdp` 计算。
- 待处理冻结统一按 `bPlatformFeeHoldNdp + cRequestFeeHoldNdp - bPlatformFeeActualNdp - cRequestFeeActualNdp - releasedNdp` 计算，结果不小于 0。
- Money Timeline 在存在 C 端 Request fee 时显示 `request_fee_hold` / `request_fee_captured`。
- 运营后台和商户后台财务结算列表、详情抽屉与 CSV 导出带出 Request fee 字段；静态预览只做 same-shape compatibility。

本步不新增 migration，因为 `c_request_fee_hold_ndp` 与 `c_request_fee_actual_ndp` 已在 `order_financials` 中存在。

## 数据来源

本次读取正式表：

- `BookingOrder`
- `ScheduleSlot`
- `LedgerTransaction`
- `Wallet`
- `PlatformFeeRuleSet`
- `PlatformFeeRule`
- `PlatformFeeTier`
- `PlatformFeeTimeWindow`
- `FeeCampaign`
- `FeeCalculationLog`
- `WalletHold`
- `OrderFinancial`
- `ShopFinanceRuleSet`
- `TechnicianCompensationProfile`
- `PayRun`
- `Payslip`
- `PayslipLine`
- `PayrollAdjustmentRequest`
- `PayoutRecord`
- `TechnicianProfile`
- `Shop`
- `User`
- `AuditLog`

本次新增 migration：

- `20260603090000_finance_rules_backoffice_metrics`：动态费用规则、费用计算日志、冻结记录和订单财务汇总。
- `20260603153000_shop_finance_rule_sets`：商户工资、分成、奖金和 NDP 承担规则版本。
- `20260603170000_order_finance_compensation_profiles`：订单服务收入上报字段与技师收入配置版本表。
- `20260603190000_payroll_center`：Pay Run、Payslip、工资行项目和支付记录表。
- `20260603222000_payroll_adjustment_requests`：工资奖金、补贴、扣款调整申请及应用标记表。
- `20260604013000_payroll_dispute_payout_closure`：工资单申诉处理字段与支付记录技师收款确认时间。

正式 readiness：

- `GET /api/v1/ready` 在数据库连通后会校验 Step 12 财务和 payroll 必需表列；如果缺少上述 migration 中的关键列，返回 `not_ready`，避免正式财务接口在运行时因 schema drift 变成 500。

## 前端接入文件

- `src/api/backofficeRealData.ts`
- `src/api/merchantFinanceRules.ts`
- `src/api/merchantFinanceCenter.ts`
- `src/api/merchantPayrollCenter.ts`
- `src/api/technicianPayrollCenter.ts`
- `src/pages/admin/DashboardPage.tsx`
- `src/pages/admin/OrdersAdminPage.tsx`
- `src/pages/admin/FinancePage.tsx`
- `src/pages/admin/MerchantsPage.tsx`
- `src/pages/admin/TechniciansPage.tsx`
- `src/pages/merchant-admin/MerchantAdminDashboardPage.tsx`
- `src/pages/merchant-admin/MerchantAdminOrdersPage.tsx`
- `src/pages/merchant-admin/MerchantAdminPeoplePage.tsx`
- `src/components/merchant-admin/MerchantStoreOperationsWorkspace.tsx`
- `src/pages/mobile/TechnicianPayrollPage.tsx`
- `src/pages/auth/LoginPage.tsx`
- `src/pages/auth/AdminLoginPage.tsx`
- `src/auth/AuthProvider.tsx`
- `src/api/auth.ts`

## 边界

- 本次不做 IM / Social / Notification 实时化。
- 本次不做压测。
- 本次不重做后台 UI。
- 本次不做银行代付、税务/发票、文件上传和多级复杂审批；工资调整只覆盖基础申请、提交、审批/驳回、申诉处理、支付记录确认和锁定应用。
- 本次只做 Request dispatch fee 的后端/API/账本适配，不做 Request 大厅、复杂调度、退款、商户违约赔付或前端入口。
- 旧后台周边模块仍可能保留 legacy mock compatibility；已接入的核心指标、订单、财务、技师、店铺数据优先走真实 API。
