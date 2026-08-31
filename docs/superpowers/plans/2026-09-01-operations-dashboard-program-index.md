# Operations Dashboard Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved operations/merchant dashboard program through seven independently reviewable and deployable subprojects.

**Architecture:** Preserve the existing React/Vite frontends and Express/Prisma backend. Build formal persistence and service contracts first, then compose dashboard/read models from those facts; no frontend calculation may replace repository/service aggregation.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Express, Zod, Prisma, MySQL 8, Jest, Supertest

## Global Constraints

- Implement one subproject and one reviewer gate at a time; do not combine this program into one PR.
- Do not add mock, demo, placeholder, fake API, `TODO`, or `FIXME` code.
- Use `/api/v1/`, Zod validation, OpenAPI, JWT/RBAC, pagination, audit logging, UTC storage, ISO 8601 API times, and `Asia/Tokyo` analytics boundaries.
- Money uses integer minor units or Prisma Decimal; never aggregate with JavaScript floating point.
- Reserved integrations return `dataStatus: "not_connected"` and `null`, never a fabricated zero.
- Each database change gets a new migration; never edit an already-applied migration.
- Every task ends with focused tests and a small commit; production build and browser acceptance gate each subproject.
- Do not push, deploy, or mutate production data without separate authorization.

---

## Subproject order

- [ ] **1. Carousel published-preview parity** — execute [2026-09-01-carousel-published-preview-parity.md](./2026-09-01-carousel-published-preview-parity.md).
- [ ] **2. Formal order fulfillment and settlement** — execute [2026-09-01-order-fulfillment-checkout-settlement.md](./2026-09-01-order-fulfillment-checkout-settlement.md).
- [ ] **3. Shared analytics contract and comprehensive overview** — execute [2026-09-01-dashboard-analytics-contract-overview.md](./2026-09-01-dashboard-analytics-contract-overview.md).
- [ ] **4. Membership detail and three rankings** — execute [2026-09-01-membership-and-rankings.md](./2026-09-01-membership-and-rankings.md).
- [ ] **5. Agent commissions and operating costs** — execute [2026-09-01-agent-commissions-operating-costs.md](./2026-09-01-agent-commissions-operating-costs.md).
- [ ] **6. Service taxonomy and search trends** — execute [2026-09-01-service-taxonomy-search-trends.md](./2026-09-01-service-taxonomy-search-trends.md).
- [ ] **7. Navigation cutover and legacy-page retirement** — execute [2026-09-01-dashboard-navigation-cutover.md](./2026-09-01-dashboard-navigation-cutover.md).

## Cross-plan interface locks

```ts
export type AnalyticsDataStatus = "ready" | "not_connected" | "not_available";

export interface AnalyticsMetricPayload {
  metricKey: string;
  currentValue: number | null;
  previousValue: number | null;
  comparisonPercent: number | null;
  comparisonDirection: "up" | "down" | "flat" | "unavailable";
  unit: "jpy" | "ndp" | "people" | "count";
  dataStatus: AnalyticsDataStatus;
  description: string;
  formula: string;
  detailRoute: string | null;
}

export type CompletedConsumptionOrder = {
  status: "completed";
  paymentEvidence: "ndp_ledger" | "technician_receipt_confirmation";
  checkoutAmountJpy: number;
  fullyReversed: false;
};
```

Later plans must consume these names and semantics rather than creating parallel dashboard or completion definitions.

## Approved requirement coverage

| Requirement group | Owning plan |
|---|---|
| 首页轮播图后台已发布预览、克隆与用户端同源 | Carousel published-preview parity |
| 服务开始、追加服务、服务结束、结账、现金/NDP/其他支付、确认收款、双向评价、1 NDP = 1 JPY 可配置 | Formal order fulfillment and settlement |
| 营业总额、车费、优惠金额、消耗品销售总额 | Dashboard analytics contract and comprehensive overview |
| 专属技师佣金、兼职技师佣金、营销佣金、代理商分佣、NDP 收入、联盟营销收益、消耗品销售利润 | Dashboard analytics contract plus agent commissions/cost integration |
| 新增用户、新增付费会员、技师入驻、代理商入驻、加盟商入驻、供货商入驻 | Dashboard analytics contract plus partner-profile events |
| 会员数大字、利用者数小字、会员增减图例、城市/时间/NeeDo ID/昵称分页检索 | Membership detail and rankings |
| 服务项目 TOP10、技师 TOP10、用户消费 TOP10，GMV/次数切换及稳定并列排序 | Membership detail and rankings |
| 代理商用户标记、介绍店铺、奖励金额、分成比例、支付方式、纯利润与运营成本分摊 | Agent commissions and operating costs |
| 运营服务类型、用户搜索标签、搜索关键词 TOP10、城市/时间过滤、多关键词趋势对比 | Service taxonomy and search trends |
| PF运营改为运营管理、加盟商/供货商 TEST 不可点击、代理正式入口、单一数据大盘与旧 URL 迁移 | Dashboard navigation cutover |

The existing large KPI cards, dual-line charts, merchant shop-information/account/wallet card, NDP summary cards and shop switcher remain owned by the approved 2026-08-31 dashboard implementation; these plans extend them and must not remove them.

## Release checkpoints

After each subproject:

1. Confirm `git status -sb`, exact changed-file scope, HEAD and listener PID/cwd.
2. Run focused backend and frontend tests listed in that plan.
3. Run `cd backend && npm run build`, root `npm run lint`, and root `npm run build`.
4. Replay the affected workflow on the project standard ports and inspect console errors and horizontal overflow.
5. Record what is implemented, what remains, and whether changes are local-only, merged, pushed, deployed, or live-accepted.
