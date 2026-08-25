# NeeDo Japan SaaS Landscape Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce one verified Excel workbook comparing NeeDo against a 50–60-product Japanese reservation/SaaS landscape, with 15–20 direct competitors researched in depth, every market-relevant NeeDo capability represented as a separate feature column, and public economic terms normalized and sourced.

**Architecture:** Keep all temporary research data and the single workbook builder in a conversation-specific directory under `/private/tmp`. Build the deliverable deterministically from normalized JSON using the bundled `@oai/artifact-tool` runtime, then export only the final `.xlsx` to the workspace output directory. The workbook separates source facts, feature judgments, formulas, and executive interpretation so every conclusion is traceable.

**Tech Stack:** Shell/`rg` for repository discovery; official web sources for live research; JSON for normalized evidence; bundled Node.js plus `@oai/artifact-tool` for workbook authoring, formula inspection, rendering, and XLSX export.

## Global Constraints

- Final output: `/Users/eason/Documents/New project/outputs/019fcda7-2369-7940-9583-4820c263797d/NeeDo_日本SaaS分层全景对比_2026-08-05.xlsx`.
- Deliver exactly one `.xlsx`; temporary scripts, JSON, render previews, and extracts remain under `/private/tmp/needo-japan-saas-019fcda7`.
- Include 50–60 publicly identifiable Japanese-market products and 15–20 direct competitors.
- Use one independent column for every market-relevant NeeDo capability.
- Exclude visual-only components, tests, build infrastructure, and duplicate route entries from the feature baseline.
- Distinguish `真实后端`, `可操作前端`, and `规划中` for NeeDo; do not present planned or mock-backed behavior as production-complete.
- Feature judgments are `✓`, `△`, `—`, `?`, or `N/A`; absence of public evidence is `?`, not `—`.
- Do not invent prices. Store numeric JPY and rates as typed values; record `需询价`, `部分公开`, or `条件浮动` when exact amounts are unavailable.
- Prefer official product, pricing, help-center, terms, app-store, partner, and payment-provider pages.
- Record a source URL, verification date `2026-08-05`, and confidence for every price record and every material direct-competitor feature judgment.
- Preserve all unrelated user changes already present in the worktree.

---

## File Map

- `/private/tmp/needo-japan-saas-019fcda7/needo_features.json`: normalized NeeDo feature dictionary and repository evidence.
- `/private/tmp/needo-japan-saas-019fcda7/products.json`: competitor universe, segmentation, and direct-competitor flags.
- `/private/tmp/needo-japan-saas-019fcda7/feature_evidence.json`: product-by-feature judgments and claim-level sources.
- `/private/tmp/needo-japan-saas-019fcda7/pricing.json`: normalized economic terms and pricing sources.
- `/private/tmp/needo-japan-saas-019fcda7/build-workbook.mjs`: the only workbook-authoring executable.
- `/private/tmp/needo-japan-saas-019fcda7/rendered/`: temporary sheet renders for visual QA.
- `/Users/eason/Documents/New project/outputs/019fcda7-2369-7940-9583-4820c263797d/NeeDo_日本SaaS分层全景对比_2026-08-05.xlsx`: final deliverable.

### Data contracts

`needo_features.json` entries:

```json
{
  "id": "booking.create",
  "domain": "预约订单",
  "featureZh": "创建到店或上门预约",
  "definition": "用户选择服务、时间、地点或门店并创建预约订单",
  "needoStatus": "可操作前端",
  "repoEvidence": ["src/pages/user/CheckoutPage.tsx", "docs/10_BOOKING_SCHEDULE_ORDER_STATE_MACHINE.md"]
}
```

`products.json` entries:

```json
{
  "id": "reserva",
  "name": "RESERVA",
  "company": "Control Technology",
  "productType": "综合预约SaaS",
  "vertical": "通用",
  "marketRole": "直接竞品",
  "officialUrl": "https://reserva.be/",
  "directCompetitor": true
}
```

`feature_evidence.json` entries:

```json
{
  "productId": "reserva",
  "featureId": "booking.create",
  "support": "yes",
  "summary": "官方功能页确认支持在线预约受理",
  "url": "https://reserva.be/",
  "sourceType": "官方功能页",
  "verifiedOn": "2026-08-05",
  "confidence": "高"
}
```

`pricing.json` entries:

```json
{
  "productId": "reserva",
  "pricingStatus": "公开",
  "setupFeeJpyMin": 0,
  "setupFeeJpyMax": 0,
  "monthlyFeeJpyMin": 0,
  "monthlyFeeJpyMax": null,
  "billingUnit": "契约/设施",
  "freePlan": true,
  "bookingFeeJpy": null,
  "paymentRateMin": null,
  "paymentRateMax": null,
  "paymentFixedFeeJpy": null,
  "marketplaceCommissionMin": null,
  "marketplaceCommissionMax": null,
  "cancellationFee": "以商户设定及支付条款为准",
  "addOnFees": "按官方价格页记录",
  "taxBasis": "按来源标注",
  "notes": "缺失字段保持 null，不推测",
  "url": "官方价格页 URL",
  "verifiedOn": "2026-08-05",
  "confidence": "高"
}
```

---

### Task 1: Prepare the isolated research runtime and workbook contract

**Files:**
- Create: `/private/tmp/needo-japan-saas-019fcda7/needo_features.json`
- Create: `/private/tmp/needo-japan-saas-019fcda7/products.json`
- Create: `/private/tmp/needo-japan-saas-019fcda7/feature_evidence.json`
- Create: `/private/tmp/needo-japan-saas-019fcda7/pricing.json`
- Create: `/private/tmp/needo-japan-saas-019fcda7/build-workbook.mjs`

**Interfaces:**
- Consumes: loader-provided Node.js executable, `node_modules` path, and `@oai/artifact-tool` API.
- Produces: four JSON arrays conforming exactly to the contracts above and one repeatable workbook builder.

- [ ] **Step 1: Load bundled workspace dependencies**

Call `codex_app__load_workspace_dependencies` and record the returned Node.js executable and `node_modules` path. Do not use system/global packages and do not install dependencies.

- [ ] **Step 2: Read spreadsheet authoring requirements**

Read `style_guidelines.md` and `artifact_tool_docs/API_QUICK_START.md` completely. Read `features/charts.md` because `执行摘要` includes charts.

- [ ] **Step 3: Create the temporary directory and dependency link**

Create `/private/tmp/needo-japan-saas-019fcda7`, then create its `node_modules` symlink to the loader-provided dependency directory.

- [ ] **Step 4: Initialize the four JSON files**

Write `[]` as the initial valid JSON content of each data file. Use `apply_patch`, not shell redirection or Python.

- [ ] **Step 5: Add schema assertions to the builder**

The builder must define and call these functions before any workbook creation:

```js
function assertFeature(feature) {}
function assertProduct(product) {}
function assertEvidence(evidence) {}
function assertPricing(pricing) {}
function assertDataset({ features, products, evidence, pricing }) {}
```

Assertions must reject duplicate IDs, unknown product/feature references, invalid enums, malformed URLs, dates other than `2026-08-05`, fewer than 50 or more than 60 products, fewer than 15 or more than 20 direct competitors, missing feature domains, and direct competitors without feature evidence.

- [ ] **Step 6: Run the initial validation and confirm intentional failure**

Run the builder with the bundled Node.js executable. Expected result: non-zero exit with a clear dataset-size validation error because arrays are empty.

### Task 2: Build and validate the NeeDo feature baseline

**Files:**
- Modify: `/private/tmp/needo-japan-saas-019fcda7/needo_features.json`

**Interfaces:**
- Consumes: current repository routes, user/merchant/technician/admin pages, feature modules, permissions, and formal-development documents.
- Produces: a deduplicated feature list grouped into seven workbook domains and using the exact `needoStatus` enum.

- [ ] **Step 1: Extract candidate capabilities from authoritative repository locations**

Inspect `README.md`, `src/App.tsx`, `src/pages/user/`, `src/pages/mobile/`, `src/pages/merchant-admin/`, `src/pages/admin/`, `src/features/`, `src/auth/featurePermissions.ts`, `docs/FRONTEND_IA.md`, `docs/10_BOOKING_SCHEDULE_ORDER_STATE_MACHINE.md`, `docs/11_NDP_LEDGER_FINANCE_RECONCILIATION.md`, `docs/12_BACKOFFICE_MERCHANT_ADMIN_REAL_DATA.md`, and `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`.

- [ ] **Step 2: Normalize atomic features**

Assign every feature to exactly one workbook domain:

```text
用户与集客
预约与订单
排班与调度
CRM与营销
门店经营
财务与后台
IM社交与平台
```

Split capabilities only when a competitor could reasonably support one without supporting the other. Merge route aliases, visual themes, repeated navigation entries, and the same capability exposed to multiple roles.

- [ ] **Step 3: Assign NeeDo maturity from evidence**

Use `真实后端` only when a formal API/database path is observable; use `可操作前端` when the current interface or legacy compatibility exists without confirmed end-to-end production data; use `规划中` when only the formal roadmap specifies the capability.

- [ ] **Step 4: Write the feature JSON**

Every entry must include `id`, `domain`, `featureZh`, `definition`, `needoStatus`, and at least one `repoEvidence` path. IDs use stable dotted English identifiers such as `booking.reschedule`, `schedule.conflict_detection`, and `crm.churn_alert`.

- [ ] **Step 5: Validate feature quality**

Run a local check that fails on duplicate IDs or labels, empty definitions, missing evidence paths, and domains outside the seven-item list. Manually review the list to ensure no visual-only or test-only item became a market feature.

### Task 3: Establish the 50–60-product Japanese-market universe

**Files:**
- Modify: `/private/tmp/needo-japan-saas-019fcda7/products.json`

**Interfaces:**
- Consumes: official product/company pages and discovery searches.
- Produces: a deduplicated competitor directory segmented by product type, vertical, and market role.

- [ ] **Step 1: Search by product segment**

Run separate Japanese-language searches for general booking systems, beauty/salon systems, restaurant reservations, fitness/lesson management, medical reservations, shift/workforce tools, POS/CRM/store systems, and marketplace/lead-generation reservation services.

- [ ] **Step 2: Verify market eligibility**

Include a product only when an official page shows current Japanese-market availability on `2026-08-05`. Exclude products whose official presence is unavailable, products confirmed discontinued, duplicate modules sold as one inseparable suite, and generic global SaaS without Japan-specific offering evidence.

- [ ] **Step 3: Normalize product identity**

Use one row per purchasable product or inseparable suite. Preserve distinct products when the vendor sells separate booking, shift, POS, or marketplace modules with materially different pricing.

- [ ] **Step 4: Select direct competitors with a reproducible rule**

Compute an initial relevance count across consumer booking, staff/room availability, store/technician profiles, CRM, payments/POS, multi-store operations, analytics, marketing/traffic, and mobile operations. Flag the top 15–20 products with at least four of these nine areas as direct competitors; review borderline products so vertical coverage is not lost.

- [ ] **Step 5: Validate portfolio balance**

Confirm the final directory contains 50–60 products, 15–20 direct competitors, at least five product types, and at least five verticals. Confirm every product has an official name, company when public, official URL, market role, and classification.

### Task 4: Research feature evidence for the direct competitor layer

**Files:**
- Modify: `/private/tmp/needo-japan-saas-019fcda7/feature_evidence.json`

**Interfaces:**
- Consumes: direct-competitor list and NeeDo feature dictionary.
- Produces: one explicit support judgment for every direct-competitor/feature pair, each backed by source evidence or marked `unknown`.

- [ ] **Step 1: Inspect official feature sources product by product**

For each direct competitor, inspect the official feature overview, pricing/plan comparison, help center, supported integrations, app pages, and terms when relevant.

- [ ] **Step 2: Map evidence to atomic NeeDo features**

Write `support` as `yes`, `partial`, `no`, `unknown`, or `na`. Use `partial` for higher-plan-only, add-on-only, integration-dependent, or materially narrower behavior. Use `no` only when the official product scope makes the absence explicit or logically conclusive.

- [ ] **Step 3: Capture audit fields**

Every direct-competitor claim includes a concise paraphrased summary, direct URL, source type, verification date, and confidence. Do not copy long marketing passages.

- [ ] **Step 4: Check matrix completeness**

Assert that `directCompetitorCount × featureCount` evidence entries exist. Count `unknown` separately and retain it in evidence completeness metrics.

### Task 5: Research the broad-layer feature signals and all-product pricing

**Files:**
- Modify: `/private/tmp/needo-japan-saas-019fcda7/feature_evidence.json`
- Modify: `/private/tmp/needo-japan-saas-019fcda7/pricing.json`

**Interfaces:**
- Consumes: all products and official feature/pricing sources.
- Produces: broad-layer category signals plus one normalized economic record for every product.

- [ ] **Step 1: Capture broad-layer feature evidence**

For non-direct products, research at least one official overview and map all clearly supported features. Fill unverified feature cells as `unknown`; do not force a complete negative matrix.

- [ ] **Step 2: Capture initial and monthly fees**

Record numeric minimum/maximum JPY values where public. Record billing unit, free-plan availability and limits, tax basis, monthly versus annual commitment, and `pricingStatus`.

- [ ] **Step 3: Capture variable and transaction economics**

Separately record per-booking fee, payment percentage range, fixed payment charge, marketplace commission range, cancellation/refund fee treatment, SMS/add-on costs, additional staff/store/account charges, and source notes.

- [ ] **Step 4: Resolve source conflicts**

When two official pages disagree, prefer the newer page with the more specific definition. Preserve the conflicting page in the source records and explain the chosen value in `notes`.

- [ ] **Step 5: Validate pricing coverage**

Assert one pricing record per product. Numeric values may be `null`, but `pricingStatus`, `notes`, `url`, `verifiedOn`, and `confidence` are mandatory. Confirm percentages are stored as decimals between `0` and `1`, not display strings.

### Task 6: Normalize evidence, calculate comparable metrics, and prepare workbook rows

**Files:**
- Modify: `/private/tmp/needo-japan-saas-019fcda7/build-workbook.mjs`

**Interfaces:**
- Consumes: four validated JSON arrays.
- Produces: ordered products, ordered features, source-index rows, category score formulas, evidence completeness formulas, and economic comparison rows.

- [ ] **Step 1: Define stable sort orders**

Order NeeDo first, then direct competitors by calculated coverage, then adjacent products by product type and name. Order features by the seven domains and stable `id` within each domain.

- [ ] **Step 2: Convert evidence values to display symbols**

Map `yes → ✓`, `partial → △`, `no → —`, `unknown → ?`, and `na → N/A`. NeeDo cells display `基准`.

- [ ] **Step 3: Define coverage and completeness formulas**

For each product/category row, use formulas equivalent to:

```excel
=IFERROR((COUNTIF(feature_range,"✓")+0.5*COUNTIF(feature_range,"△"))/(COUNTIF(feature_range,"✓")+COUNTIF(feature_range,"△")+COUNTIF(feature_range,"—")),0)
=IFERROR((COUNTIF(feature_range,"✓")+COUNTIF(feature_range,"△")+COUNTIF(feature_range,"—"))/(COUNTIF(feature_range,"✓")+COUNTIF(feature_range,"△")+COUNTIF(feature_range,"—")+COUNTIF(feature_range,"?")),0)
```

The first formula is functional coverage among judged applicable features; the second is evidence completeness. `N/A` is excluded from both denominators.

- [ ] **Step 4: Define visible domain weights**

Put editable weights in `评分规则`, initially equal at `1/7` for the seven domains. Calculate overall weighted coverage from the seven category results; do not hide constants inside formulas.

- [ ] **Step 5: Build a deduplicated source index**

Generate one row per distinct product/field-or-feature/source URL combination with product, evidence category, item, judgment/value, evidence summary, URL, source type, verification date, and confidence.

### Task 7: Build the formatted Excel workbook

**Files:**
- Modify: `/private/tmp/needo-japan-saas-019fcda7/build-workbook.mjs`
- Create: `/Users/eason/Documents/New project/outputs/019fcda7-2369-7940-9583-4820c263797d/NeeDo_日本SaaS分层全景对比_2026-08-05.xlsx`

**Interfaces:**
- Consumes: normalized rows and formulas from Task 6.
- Produces: one workbook containing every sheet and source required by the approved design.

- [ ] **Step 1: Create sheets in this exact order**

```text
阅读说明
执行摘要
竞品目录
NeeDo功能字典
全景总矩阵
直接竞品深度对比
用户与集客
预约与订单
排班与调度
CRM与营销
门店经营
财务与后台
IM社交与平台
经济条件
差距与机会
评分规则
来源索引
```

- [ ] **Step 2: Apply a consistent visual system**

Use dark navy title bands, restrained teal/blue accents, white content cells, alternating row shading, visible filter rows, frozen identifiers, wrapped multi-line headers, and compact legends. Apply conditional colors consistently: green `✓`, amber `△`, gray `—`, blue `?`, and muted `N/A`.

- [ ] **Step 3: Build the feature matrices**

Use products as rows and individual NeeDo capabilities as columns. Freeze product identity columns and header rows. Add filters, coverage, evidence completeness, product type, vertical, and market role before the feature columns.

- [ ] **Step 4: Build the economic table**

Store JPY values and percentages as numeric cells with appropriate formats. Separate public numbers from text explanations. Include setup fee, monthly range, billing unit, free plan, per-booking fee, payment rate and fixed fee, marketplace commission, cancellation/refund treatment, add-ons, tax basis, pricing status, source, confidence, and verification date.

- [ ] **Step 5: Build the executive summary and charts**

Show product counts by type/vertical, direct-competitor ranking by coverage and evidence completeness, pricing-model counts, and NeeDo differentiation opportunities. Use no more than three compact charts: product-type distribution, direct-competitor category coverage, and pricing-model distribution.

- [ ] **Step 6: Add source URLs and notes**

Place plain-text URLs in dedicated source columns. Keep evidence summaries concise. Do not embed unsupported claims in chart titles or executive callouts.

- [ ] **Step 7: Export the workbook**

Create the output directory, export with `SpreadsheetFile.exportXlsx(workbook)`, and save only the specified filename.

### Task 8: Verify formulas, data integrity, and every sheet visually

**Files:**
- Inspect: `/Users/eason/Documents/New project/outputs/019fcda7-2369-7940-9583-4820c263797d/NeeDo_日本SaaS分层全景对比_2026-08-05.xlsx`
- Create temporarily: `/private/tmp/needo-japan-saas-019fcda7/rendered/*.png`

**Interfaces:**
- Consumes: exported workbook.
- Produces: a workbook with corrected formulas/layout and a compact verification record in terminal output.

- [ ] **Step 1: Inspect key ranges**

Inspect representative ranges from `执行摘要`, `NeeDo功能字典`, `全景总矩阵`, `直接竞品深度对比`, `经济条件`, `差距与机会`, and `来源索引` with values and formulas included.

- [ ] **Step 2: Scan for formula errors**

Search the workbook for `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, and `#N/A`. Expected result: zero formula-error cells.

- [ ] **Step 3: Reconcile counts**

Confirm product counts match across summary, directory, matrices, pricing, and source index; direct-competitor count remains 15–20; each feature appears exactly once in the total matrix and exactly once in its category matrix.

- [ ] **Step 4: Spot-check sourced facts**

Reopen representative official pages for at least five direct competitors and five varied pricing models. Reconcile workbook values and feature judgments with the cited definitions.

- [ ] **Step 5: Render every sheet**

Render at least one representative used range from all 17 sheets. Inspect all images and repair clipped titles, unreadable headers, oversized columns, broken charts, awkward wrapping, or off-screen content.

- [ ] **Step 6: Re-export after fixes and repeat compact checks**

Rerun the builder, repeat the formula-error scan and representative range inspection, and confirm the final `.xlsx` opens successfully.

### Task 9: Final delivery

**Files:**
- Deliver: `/Users/eason/Documents/New project/outputs/019fcda7-2369-7940-9583-4820c263797d/NeeDo_日本SaaS分层全景对比_2026-08-05.xlsx`

**Interfaces:**
- Consumes: verified workbook and validation results.
- Produces: concise user handoff with exactly one workbook citation.

- [ ] **Step 1: Report scope and limitations**

State the final product count, direct-competitor count, number of NeeDo feature columns, official-source coverage, and the treatment of non-public prices. Do not call the market list literally exhaustive; describe it as the publicly identifiable landscape verified on `2026-08-05`.

- [ ] **Step 2: Cite the workbook exactly once**

Use one `:codex-file-citation{path="/Users/eason/Documents/New project/outputs/019fcda7-2369-7940-9583-4820c263797d/NeeDo_日本SaaS分层全景对比_2026-08-05.xlsx" purpose="output"}` citation and do not link temporary support files.

- [ ] **Step 3: Do not stage or commit unrelated worktree changes**

Leave existing calendar changes, DOCX files, output directories, and icon scripts untouched. Do not create a Git commit for the generated workbook unless the user explicitly requests one.
