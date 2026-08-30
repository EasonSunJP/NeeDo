# Affiliate Platform Fee Operations UI Design

**Date:** 2026-08-30
**Status:** Approved for implementation planning
**Scope:** One Step 12 micro-step on `codex/affiliate-merchant-task-ui`

## 1. Context

NeeDo already has a formal, versioned Affiliate platform-fee backend contract:

- `GET /api/v1/backoffice/affiliate/fee-rules`
- `POST /api/v1/backoffice/affiliate/fee-rules`
- global and shop-scoped rules;
- strict optimistic versions;
- immutable rule history and audit records;
- task-time fee snapshots that preserve the accepted rate for already-funded tasks.

The operations backend currently exposes formal Affiliate task monitoring and notice-carousel management, but it has no usable page for reading or creating platform-fee rule versions. This micro-step adds that UI without redesigning the operations backend or changing the approved settlement model.

## 2. Goals

1. Give authorized operations users a dedicated Affiliate platform-fee rule page.
2. Show the current global rule, a scheduled next rule when one exists, and paginated global/shop history.
3. Create global or shop-scoped rule versions through the formal API.
4. Select a shop through a formal paginated search rather than requiring an operator to type an internal database identifier.
5. Preserve RBAC, optimistic concurrency, immutable history, auditability, five-language UI copy, and existing task fee snapshots.

## 3. Non-goals

- Editing or deleting historical fee-rule versions.
- Repricing or mutating already-funded Affiliate tasks.
- Changing promoter/alliance allocation ratios.
- Adding schema or migrations.
- Rebuilding the existing operations-admin navigation or visual system.
- Creating a test fee-rule version in persistent local business data solely for browser acceptance.
- Implementing merchant task publishing, reward reversal, or reconciliation recovery in this micro-step.

## 4. Navigation and route

Add a dedicated route:

```text
/admin/afirieito/fee-rules
```

Add `平台抽成规则` below `联盟营销任务` in the existing `联盟营销` navigation section. The section keeps its `TEST` badge.

Route access is protected by:

```text
page:backoffice-affiliate-fee-rule
```

The create control is independently protected by:

```text
button:backoffice-affiliate-fee-rule-create
```

A read-only user can inspect summaries and history but cannot see or invoke the create action.

## 5. Page structure

The page reuses `AdminLayout`, `ModuleShell`, `DataTable`, `Drawer`, `Badge`, `Button`, and existing operations-admin tokens.

### 5.1 Header and summary

The header identifies this as formal Affiliate financial configuration and explains that:

- the platform fee is paid separately by the merchant;
- the promoter/alliance reward is not reduced by this fee;
- a new rate applies only to tasks submitted after the rule becomes effective;
- already-funded tasks keep their immutable fee snapshot.

Summary cards show:

- current effective global fee rate;
- next scheduled global rate and effective time, when present;
- latest global version number.

The summary is not inferred from a paginated history page. Multiple future versions can put the currently effective version beyond page 1. Add a read-only summary endpoint:

```text
GET /api/v1/backoffice/affiliate/fee-rules/summary
  ?scopeType=global
```

It uses the same read permission and operations-identity check and returns the current effective rule, the earliest future rule, and the latest version number. The backend evaluates time once per request so all three values share one consistent boundary.

### 5.2 History filters and table

The history view supports:

- all scopes;
- global only;
- shop only;
- selected-shop history after choosing a shop;
- server-side pagination.

Columns:

- scope;
- shop name and shop identifier for shop-scoped rules;
- fee rate;
- version;
- effective interval;
- status: current, scheduled, or historical;
- reason;
- operator NeeDo ID;
- creation time.

Historical rows are read-only. No edit or delete actions are rendered.

The existing fee-rule list/create response is extended with nullable `shopName` and `shopCity` display fields. The repository selects them through the rule's shop relation in the same query, including historical rules for shops that are no longer published, so the table neither performs N+1 calls nor loses its historical label. These display fields do not affect scope resolution or task snapshots.

## 6. Create-version drawer

The form contains:

1. Scope: global or shop.
2. Shop selector for shop scope.
3. Fee percentage, displayed as a percentage and converted exactly to integer basis points.
4. Effective mode: now or scheduled.
5. Future date and time for scheduled mode.
6. Required reason, maximum 500 characters.

The operator never enters `expectedVersion`. The client loads the newest rule for the selected scope and submits its version, or `0` when the scope has no prior rule.

Before submission the drawer shows a confirmation summary containing the scope, selected shop, old rate, new rate, effective time, and reason. While a request is pending, duplicate submission is disabled.

After a successful `201` response, the drawer closes, summaries and history reload, and the newly created version is visible.

## 7. Formal shop search

The existing `/backoffice/shops` endpoint requires general shop-management permission. Affiliate finance users have fee-rule write permission but are not guaranteed to have that broader permission. The UI therefore must not depend on or expand general shop-management access.

Add a minimal endpoint under the Affiliate fee-rule capability:

```text
GET /api/v1/backoffice/affiliate/fee-rule-shops
  ?keyword=...
  &page=1
  &pageSize=10
```

Requirements:

- authentication plus `page:backoffice-affiliate-fee-rule`;
- global or platform operations identity;
- strict Zod query validation;
- server-side pagination;
- search by shop name or exact/numeric shop identifier using the repository's safe Prisma query path;
- only `published` shops with `deletedAt IS NULL`;
- return only `id`, `name`, and `city`;
- no owner, contact, bank, billing, or other shop-management data;
- OpenAPI documentation and integration coverage.

The client debounces keyword requests, ignores stale responses, and requires selection from returned options. It never accepts free-form `shopId` submission.

## 8. API client and state flow

Add a dedicated frontend Affiliate platform-fee API module with typed models for:

- fee-rule record;
- fee-rule summary;
- paginated fee-rule page;
- shop option page;
- create-version input.

Initial page flow:

1. Load the server-evaluated global summary.
2. Load the selected paginated history filter.
3. Keep summary and table error states independent so one can retry without discarding the other.

Create flow:

1. Select scope.
2. For shop scope, search and choose a formal published shop.
3. Load page 1, size 1 of that exact scope to resolve the latest version.
4. Validate and show confirmation.
5. Submit the new version.
6. Reload summary and current table while preserving the active filter.

Requests use the existing authenticated `httpClient`; no browser-local rule store or fallback data is introduced.

## 9. Error and concurrency handling

- `400`: show field-level validation guidance without clearing the draft.
- `401`: show the existing session-expired message.
- `403`: deny page access or hide the write action according to the failed capability.
- `404`: report that the selected shop is no longer available and require a new selection.
- `409` version conflict: preserve the draft, refresh the target scope's latest rule, show the changed old/new comparison, and require explicit reconfirmation.
- policy conflict: preserve the draft and show an operations-facing conflict message rather than retrying automatically.
- network/server failure: preserve filters and form input and offer an explicit retry.
- stale shop-search and rule-detail responses are ignored by request identity.

Immediate activation uses the current client timestamp at final confirmation. Scheduled activation must be in the future in the UI; the backend remains authoritative.

## 10. Internationalization

All new user-visible copy is available independently in this order:

1. Japanese
2. English
3. Korean
4. Traditional Chinese
5. Simplified Chinese

The design uses the existing frontend language model (`ja`, `en`, `ko`, `zh-Hant`, `zh`). Percentages, numbers, dates, and times use locale-aware formatters. Backend error keys remain stable and are mapped to localized operations copy.

## 11. Testing strategy

### 11.1 Backend

- validator tests for keyword and pagination boundaries;
- service/repository tests proving only active published shops are returned;
- API tests for authentication, fee-rule read permission, operations identity, pagination, search, and response minimization;
- OpenAPI route and schema tests;
- regression coverage for existing fee-rule list/create behavior.

### 11.2 Frontend

- API adapter path, query, response, and basis-point serialization tests;
- route and navigation permission tests;
- loading, empty, retry, pagination, and filter tests;
- current/scheduled/historical classification tests;
- shop-search debounce, stale-response, selection-only, and removed-shop tests;
- create drawer validation and confirmation tests;
- read-only capability tests;
- successful create and automatic reload tests;
- `409` refresh, draft preservation, and reconfirmation tests;
- five-language coverage and required language order tests.

### 11.3 Verification

- focused frontend and backend tests first;
- frontend and backend lint;
- backend build;
- frontend production verification build;
- broader relevant suites;
- authenticated browser acceptance for route visibility, responsive layout, filters, pagination, drawer validation, shop search, console errors, and permission-hidden controls.

Browser acceptance does not submit an immutable fee version into persistent local business data without separate authorization. The transactional API behavior is proven in isolated backend tests.

## 12. Acceptance criteria

- Authorized users can open the dedicated page from the Affiliate navigation.
- The page reads real version history and shows the current/scheduled global status correctly.
- Read-only users cannot create rules.
- Writers can create a global or selected-shop version through the formal API.
- Shop selection uses the minimal formal search endpoint and cannot submit arbitrary free-form IDs.
- Concurrent modifications do not overwrite a newer version.
- Existing funded tasks are not recalculated.
- All new copy works in the five required languages and order.
- No mock data, schema change, migration, historical deletion, or unrelated `main` change is introduced.
