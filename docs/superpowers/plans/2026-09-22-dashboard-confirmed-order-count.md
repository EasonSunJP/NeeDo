# Dashboard Confirmed Order Count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Count only accepted, currently uncancelled bookings in platform and merchant dashboard order trends.

**Architecture:** Keep the existing shared `DashboardRepository.queryOrderSeries` query and payload. Replace its unconditional order row count with a conditional sum over the five post-acceptance lifecycle statuses; leave GMV, scope, bucket, API, and frontend behavior unchanged.

**Tech Stack:** Node.js 22, TypeScript, Prisma SQL, MySQL, Jest.

## Global Constraints

- Count `CONFIRMED`, `IN_SERVICE`, `AWAITING_CHECKOUT`, `AWAITING_PAYMENT_CONFIRMATION`, and `COMPLETED`.
- Exclude `PENDING`, `CANCELLED`, and soft-deleted orders.
- Keep `serviceGmvJpy` unchanged: completed orders excluding refund-pending and refunded payments.
- Apply one shared backend definition to platform and merchant dashboards.
- Do not add a schema change, migration, API field, frontend implementation, or data backfill.
- Work locally on `codex/dashboard-confirmed-order-count`; do not push or deploy.

---

### Task 1: Enforce the accepted-order trend contract

**Files:**
- Modify: `backend/tests/dashboard-activity.repository.test.ts`
- Modify: `backend/src/repositories/dashboard.repository.ts`

**Interfaces:**
- Consumes: `DashboardRepository.getActivityFacts(input: DashboardAggregateInput)` and the existing `dashboard_order_series` Prisma SQL query.
- Produces: the existing `DashboardBucketPayload.orderCount: number` with a narrower accepted-order definition; no signature changes.

- [ ] **Step 1: Write the failing repository query-contract test**

Add this test inside `describe("DashboardRepository activity and supply aggregates", ...)`:

```ts
it("counts only accepted and currently uncancelled orders in trend buckets", async () => {
  const fixture = createClient();
  const repository = new DashboardRepository(fixture.client);

  await repository.getActivityFacts({
    scope: { kind: "platform" },
    city: null,
    window
  });

  const query = fixture.queryRaw.mock.calls.find(([candidate]) =>
    queryText(candidate as SqlQuery).includes("dashboard_order_series")
  )?.[0] as SqlQuery;
  const sql = queryText(query);

  expect(sql).not.toContain("COUNT(booking.id) AS orderCount");
  expect(sql).toContain("WHEN booking.status IN");
  expect(query.values).toEqual(
    expect.arrayContaining([
      "confirmed",
      "in_service",
      "awaiting_checkout",
      "awaiting_payment_confirmation",
      "completed"
    ])
  );
  expect(query.values).not.toEqual(expect.arrayContaining(["pending", "cancelled"]));
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm --prefix backend test -- --runTestsByPath tests/dashboard-activity.repository.test.ts --runInBand
```

Expected: the new test fails because the SQL still contains `COUNT(booking.id) AS orderCount` and has no conditional accepted-status count.

- [ ] **Step 3: Implement the minimum shared SQL change**

Replace the unconditional count in `DashboardRepository.queryOrderSeries` with:

```ts
COALESCE(SUM(
  CASE
    WHEN booking.status IN (
      ${"confirmed"},
      ${"in_service"},
      ${"awaiting_checkout"},
      ${"awaiting_payment_confirmation"},
      ${"completed"}
    ) THEN 1
    ELSE 0
  END
), 0) AS orderCount,
```

Do not change the following `serviceGmvJpy` expression or any filters.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same command from Step 2.

Expected: the complete test file passes with zero failures.

- [ ] **Step 5: Run related dashboard regressions**

Run:

```bash
npm --prefix backend test -- --runTestsByPath \
  tests/dashboard-activity.repository.test.ts \
  tests/dashboard-service.test.ts \
  tests/backoffice-dashboard-counts.test.ts \
  tests/backoffice-api.test.ts \
  tests/merchant-selected-shop-scope.test.ts \
  --runInBand
```

Expected: all selected suites pass; platform and merchant payload shapes remain unchanged.

- [ ] **Step 6: Run backend quality gates**

Run:

```bash
npm --prefix backend run lint
npm --prefix backend run build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit the implementation**

```bash
git add backend/src/repositories/dashboard.repository.ts \
  backend/tests/dashboard-activity.repository.test.ts
git commit -m "fix: count accepted dashboard orders"
```

### Task 2: Integrate and verify local main

**Files:**
- No additional source files planned.

**Interfaces:**
- Consumes: the committed `codex/dashboard-confirmed-order-count` branch.
- Produces: local `main` containing the design, plan, and implementation commits.

- [ ] **Step 1: Verify merge safety**

Check the feature worktree and main worktree status, branch ancestry, and the PID/cwd of listeners on 5180. Do not stop or restart 5180 before the merge.

- [ ] **Step 2: Fast-forward local main**

From the clean main worktree, merge with:

```bash
git merge --ff-only codex/dashboard-confirmed-order-count
```

Do not fetch, pull, push, create a PR, or deploy.

- [ ] **Step 3: Re-run final main verification**

On local main, run the related dashboard test command from Task 1, then:

```bash
npm --prefix backend run lint
npm --prefix backend run build
```

Expected: every command exits 0.

- [ ] **Step 4: Verify through the existing 5180 main runtime**

Confirm the 5180 listener still belongs to the local main worktree and that the operations or merchant dashboard API/page loads. Inspect the displayed trend or its API payload with a locally authenticated identity if available. If local database or authentication authority is unavailable, report the exact blocked browser/API evidence without substituting staging or remote access.

- [ ] **Step 5: Clean up safely**

Only remove branches or worktrees that are fully merged, clean, and owned by this conversation. The Codex-hosted worktree is harness-owned, so preserve it unless an explicit supported cleanup mechanism is available. Report local-main, 5180, push, deployment, and remote state separately.
