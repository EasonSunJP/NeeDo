# NeeDo Affiliate Domain Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the formal NeeDo alliance-marketing domain schema, migration, pure state machines, ledger vocabulary, and seeded RBAC permissions without exposing unfinished APIs or UI.

**Architecture:** Add one normalized affiliate domain beside the existing Booking, MerchantAccount, Shop, Service, Wallet, LedgerTransaction, and AuditLog records. Keep state and budget rules in a pure TypeScript service, use Prisma/MySQL as the persistence authority, and seed only permission definitions—never fake tasks, claims, attribution, rewards, or metrics. The existing `/admin/afirieito` capability gate stays in place until later API and UI microsteps pass acceptance.

**Tech Stack:** Node.js 22, Express, TypeScript strict mode, Prisma 7.8, MySQL 8.0/UTF8MB4, Jest 29, existing NeeDo RBAC and NDP ledger primitives.

## Global Constraints

- Execute only affiliate microstep 1: domain state machines, Prisma models, migration, ledger vocabulary, RBAC constants, and documentation.
- Do not create affiliate routes, controllers, repositories, browser state, static-demo handlers, UI, affiliate seed rows, synthetic metrics, or fake APIs.
- Preserve React/TSX/Vite and all existing routes; `/admin/afirieito` remains a production capability gate in this microstep.
- Independent NDA is deprecated; the formal domain is shared by merchant PC, shop app, customer affiliate frontend, and operations admin.
- Only `BookingOrder.status = COMPLETED` can settle a fixed NDP reward; reservation-time attribution may allocate budget but must not credit the claimant wallet.
- Saving a draft does not freeze funds. Submitting for publication freezes the full integer-NDP task budget; customer discounts remain JPY price reductions outside that NDP budget.
- Affiliate reward is fixed NDP per eligible completed order; percentage affiliate reward and reservation reward are prohibited.
- Every new business table has `id`, `createdAt`, `updatedAt`, and `deletedAt`; relations are indexed and deletion is soft.
- Add no direct wallet balance write. Later business services must use immutable `LedgerTransaction` and `WalletLedger` records.
- Keep all dates in UTC, all NDP amounts as non-negative integers, percentage customer discounts as BPS, and database strings in UTF8MB4.
- Do not alter an applied migration. Generate one new migration named `affiliate_domain_foundation` and inspect its SQL before applying it.
- Preserve all unrelated staged and unstaged user changes. Every commit below stages only its listed files.

## Scope Boundary

This specification spans several independently reviewable subsystems. Per `AGENTS.md`, this plan covers only the first foundation slice. Separate plans are required after acceptance for:

1. task draft/submit/review APIs and full budget freeze;
2. task marketplace, claims, promo codes, and signed URLs;
3. Checkout attribution, customer discount snapshot, and per-order budget allocation;
4. completion settlement, cancellation release, refund reversal, and recovery;
5. merchant PC, shop app, affiliate frontend, and operations Afirieito UI.

## File Map

- `backend/src/services/affiliate-state-machine.service.ts`: pure task, attribution, reward, and budget transition rules; no Prisma and no I/O.
- `backend/tests/affiliate-state-machine.service.test.ts`: exhaustive legal/illegal transition and budget invariant tests.
- `backend/prisma/schema.prisma`: affiliate enums, normalized tables, relations, indexes, and ledger enum extensions.
- `backend/prisma/migrations/20260826090000_affiliate_domain_foundation/migration.sql`: generated MySQL migration plus explicit publisher/integer CHECK constraints.
- `backend/tests/affiliate-schema.test.ts`: schema and migration contract tests.
- `backend/src/services/ledger.service.ts`: exposes merchant-account wallets and affiliate ledger values to later Services.
- `backend/src/repositories/ledger.repository.ts`: maps the new TypeScript ledger values to and from Prisma enums.
- `backend/tests/affiliate-ledger-vocabulary.test.ts`: round-trip mapping tests for every new wallet, transaction, and direction value.
- `backend/src/constants/permissions.constants.ts`: affiliate menu/page/button definitions and least-privilege system-role assignments.
- `backend/tests/affiliate-permissions.test.ts`: permission catalog and role-assignment contract tests.
- `README.md`, `docs/database.md`, `docs/ledger.md`: accurately document the foundation-only capability.
- `docs/NEEDO_AFIRIEITO_ADMIN_DEVELOPMENT.md`: mark the former localStorage/NDA document as legacy, pointing to the approved formal design.

---

### Task 1: Pure affiliate state and budget rules

**Files:**

- Create: `backend/src/services/affiliate-state-machine.service.ts`
- Create: `backend/tests/affiliate-state-machine.service.test.ts`

**Interfaces:**

- Produces: `AffiliateTaskStatus`, `AffiliateTaskAction`, `AffiliateAttributionStatus`, `AffiliateAttributionAction`, `AffiliateRewardStatus`, `AffiliateRewardAction`.
- Produces: `calculateAffiliateUnallocatedBudget(snapshot): number`.
- Produces: `transitionAffiliateTask(status, action, context): AffiliateTransitionResult<AffiliateTaskStatus>`.
- Produces: `transitionAffiliateAttribution(status, action): AffiliateTransitionResult<AffiliateAttributionStatus>`.
- Produces: `transitionAffiliateReward(status, action): AffiliateTransitionResult<AffiliateRewardStatus>`.
- Has no dependency on Prisma, Express, Redis, system time, or mutable global state.

- [ ] **Step 1: Write the failing budget and task-transition tests**

```ts
import {
  calculateAffiliateUnallocatedBudget,
  transitionAffiliateTask,
} from "../src/services/affiliate-state-machine.service";

const now = new Date("2026-09-01T00:00:00.000Z");
const activeWindow = {
  now,
  startsAt: new Date("2026-08-31T00:00:00.000Z"),
  endsAt: new Date("2026-09-30T00:00:00.000Z"),
  rewardNdpPerCompletedOrder: 1_000,
  budget: {
    totalFrozenNdp: 2_000_000,
    allocatedNdp: 0,
    capturedNdp: 0,
    releasedNdp: 0,
  },
};

describe("affiliate budget", () => {
  it("calculates budget not allocated, captured, or released", () => {
    expect(
      calculateAffiliateUnallocatedBudget({
        totalFrozenNdp: 2_000_000,
        allocatedNdp: 10_000,
        capturedNdp: 20_000,
        releasedNdp: 30_000,
      }),
    ).toBe(1_940_000);
  });

  it("rejects a negative or over-consumed budget snapshot", () => {
    expect(() =>
      calculateAffiliateUnallocatedBudget({
        totalFrozenNdp: 1_000,
        allocatedNdp: 1_001,
        capturedNdp: 0,
        releasedNdp: 0,
      }),
    ).toThrow("error.affiliate.invalid_budget_snapshot");
  });
});

describe("affiliate task state machine", () => {
  it("submits a draft for review without pretending it is active", () => {
    expect(transitionAffiliateTask("draft", "submit", activeWindow)).toEqual({
      ok: true,
      status: "pending_review",
    });
  });

  it("approves into scheduled before the start and active after the start", () => {
    expect(
      transitionAffiliateTask("pending_review", "approve", {
        ...activeWindow,
        now: new Date("2026-08-30T00:00:00.000Z"),
      }),
    ).toEqual({ ok: true, status: "scheduled" });
    expect(
      transitionAffiliateTask("pending_review", "approve", activeWindow),
    ).toEqual({
      ok: true,
      status: "active",
    });
  });

  it("enters and exits budget exhaustion only from real budget values", () => {
    const exhausted = {
      ...activeWindow,
      budget: { ...activeWindow.budget, allocatedNdp: 2_000_000 },
    };
    expect(
      transitionAffiliateTask("active", "mark_budget_exhausted", exhausted),
    ).toEqual({
      ok: true,
      status: "budget_exhausted",
    });
    expect(
      transitionAffiliateTask(
        "budget_exhausted",
        "restore_budget",
        activeWindow,
      ),
    ).toEqual({
      ok: true,
      status: "active",
    });
  });

  it("rejects illegal transitions with a stable domain reason", () => {
    expect(transitionAffiliateTask("draft", "approve", activeWindow)).toEqual({
      ok: false,
      reason: "invalid_transition",
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/affiliate-state-machine.service.test.ts`

Expected: FAIL because `affiliate-state-machine.service.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure domain service**

```ts
export type AffiliateTaskStatus =
  | "draft"
  | "pending_review"
  | "scheduled"
  | "active"
  | "paused"
  | "budget_exhausted"
  | "ended"
  | "cancelled"
  | "rejected";

export type AffiliateTaskAction =
  | "submit"
  | "approve"
  | "reject"
  | "activate"
  | "pause"
  | "resume"
  | "mark_budget_exhausted"
  | "restore_budget"
  | "end"
  | "cancel"
  | "expire";

export type AffiliateAttributionStatus =
  | "attributed"
  | "qualified"
  | "settled"
  | "invalidated"
  | "reversed";
export type AffiliateAttributionAction =
  | "qualify"
  | "settle"
  | "invalidate"
  | "reverse";

export type AffiliateRewardStatus =
  | "pending"
  | "settled"
  | "reversed"
  | "reversal_pending";
export type AffiliateRewardAction =
  | "settle"
  | "begin_reversal"
  | "complete_reversal";

export interface AffiliateBudgetSnapshot {
  totalFrozenNdp: number;
  allocatedNdp: number;
  capturedNdp: number;
  releasedNdp: number;
}

export interface AffiliateTaskTransitionContext {
  now: Date;
  startsAt: Date;
  endsAt: Date;
  rewardNdpPerCompletedOrder: number;
  budget: AffiliateBudgetSnapshot;
}

export type AffiliateTransitionFailureReason =
  | "invalid_transition"
  | "outside_task_window"
  | "budget_not_exhausted"
  | "budget_still_exhausted";

export type AffiliateTransitionResult<T extends string> =
  | { ok: true; status: T }
  | { ok: false; reason: AffiliateTransitionFailureReason };

const invalid = (reason: AffiliateTransitionFailureReason) =>
  ({
    ok: false,
    reason,
  }) as const;

const isNonNegativeInteger = (value: number): boolean =>
  Number.isInteger(value) && value >= 0;

export const calculateAffiliateUnallocatedBudget = (
  snapshot: AffiliateBudgetSnapshot,
): number => {
  const values = [
    snapshot.totalFrozenNdp,
    snapshot.allocatedNdp,
    snapshot.capturedNdp,
    snapshot.releasedNdp,
  ];
  const remaining =
    snapshot.totalFrozenNdp -
    snapshot.allocatedNdp -
    snapshot.capturedNdp -
    snapshot.releasedNdp;
  if (!values.every(isNonNegativeInteger) || remaining < 0) {
    throw new Error("error.affiliate.invalid_budget_snapshot");
  }
  return remaining;
};

const isInsideWindow = (context: AffiliateTaskTransitionContext): boolean =>
  context.now >= context.startsAt && context.now < context.endsAt;

const hasOneRewardSlot = (context: AffiliateTaskTransitionContext): boolean =>
  Number.isInteger(context.rewardNdpPerCompletedOrder) &&
  context.rewardNdpPerCompletedOrder > 0 &&
  calculateAffiliateUnallocatedBudget(context.budget) >=
    context.rewardNdpPerCompletedOrder;

export const transitionAffiliateTask = (
  status: AffiliateTaskStatus,
  action: AffiliateTaskAction,
  context: AffiliateTaskTransitionContext,
): AffiliateTransitionResult<AffiliateTaskStatus> => {
  if (status === "draft" && action === "submit") {
    return hasOneRewardSlot(context)
      ? { ok: true, status: "pending_review" }
      : invalid("budget_still_exhausted");
  }
  if (status === "pending_review" && action === "reject")
    return { ok: true, status: "rejected" };
  if (status === "pending_review" && action === "approve") {
    if (context.now >= context.endsAt) return invalid("outside_task_window");
    return {
      ok: true,
      status: context.now < context.startsAt ? "scheduled" : "active",
    };
  }
  if (status === "scheduled" && action === "activate") {
    return isInsideWindow(context)
      ? { ok: true, status: "active" }
      : invalid("outside_task_window");
  }
  if (status === "active" && action === "pause")
    return { ok: true, status: "paused" };
  if (status === "paused" && action === "resume") {
    if (!isInsideWindow(context)) return invalid("outside_task_window");
    return {
      ok: true,
      status: hasOneRewardSlot(context) ? "active" : "budget_exhausted",
    };
  }
  if (status === "active" && action === "mark_budget_exhausted") {
    return hasOneRewardSlot(context)
      ? invalid("budget_not_exhausted")
      : { ok: true, status: "budget_exhausted" };
  }
  if (status === "budget_exhausted" && action === "restore_budget") {
    if (!isInsideWindow(context)) return invalid("outside_task_window");
    return hasOneRewardSlot(context)
      ? { ok: true, status: "active" }
      : invalid("budget_still_exhausted");
  }
  if (
    ["scheduled", "active", "paused", "budget_exhausted"].includes(status) &&
    action === "end"
  ) {
    return { ok: true, status: "ended" };
  }
  if (
    [
      "draft",
      "pending_review",
      "scheduled",
      "active",
      "paused",
      "budget_exhausted",
    ].includes(status) &&
    action === "cancel"
  ) {
    return { ok: true, status: "cancelled" };
  }
  if (
    ["scheduled", "active", "paused", "budget_exhausted"].includes(status) &&
    action === "expire"
  ) {
    return context.now >= context.endsAt
      ? { ok: true, status: "ended" }
      : invalid("outside_task_window");
  }
  return invalid("invalid_transition");
};

export const transitionAffiliateAttribution = (
  status: AffiliateAttributionStatus,
  action: AffiliateAttributionAction,
): AffiliateTransitionResult<AffiliateAttributionStatus> => {
  if (status === "attributed" && action === "qualify")
    return { ok: true, status: "qualified" };
  if (status === "qualified" && action === "settle")
    return { ok: true, status: "settled" };
  if (["attributed", "qualified"].includes(status) && action === "invalidate")
    return { ok: true, status: "invalidated" };
  if (status === "settled" && action === "reverse")
    return { ok: true, status: "reversed" };
  return invalid("invalid_transition");
};

export const transitionAffiliateReward = (
  status: AffiliateRewardStatus,
  action: AffiliateRewardAction,
): AffiliateTransitionResult<AffiliateRewardStatus> => {
  if (status === "pending" && action === "settle")
    return { ok: true, status: "settled" };
  if (status === "settled" && action === "begin_reversal")
    return { ok: true, status: "reversal_pending" };
  if (status === "reversal_pending" && action === "complete_reversal")
    return { ok: true, status: "reversed" };
  return invalid("invalid_transition");
};
```

- [ ] **Step 4: Add failing tests for attribution, reward, expiration, and cancellation**

```ts
it("does not settle attribution before qualification", () => {
  expect(transitionAffiliateAttribution("attributed", "settle")).toEqual({
    ok: false,
    reason: "invalid_transition",
  });
  expect(transitionAffiliateAttribution("attributed", "qualify")).toEqual({
    ok: true,
    status: "qualified",
  });
  expect(transitionAffiliateAttribution("qualified", "settle")).toEqual({
    ok: true,
    status: "settled",
  });
});

it("requires a pending reversal before a reward is fully reversed", () => {
  expect(transitionAffiliateReward("settled", "begin_reversal")).toEqual({
    ok: true,
    status: "reversal_pending",
  });
  expect(
    transitionAffiliateReward("reversal_pending", "complete_reversal"),
  ).toEqual({ ok: true, status: "reversed" });
});

it("ends expired tasks and preserves terminal states", () => {
  const expired = { ...activeWindow, now: activeWindow.endsAt };
  expect(transitionAffiliateTask("active", "expire", expired)).toEqual({
    ok: true,
    status: "ended",
  });
  expect(transitionAffiliateTask("ended", "cancel", expired)).toEqual({
    ok: false,
    reason: "invalid_transition",
  });
});

it("does not submit a task whose frozen budget cannot fund one reward", () => {
  const insufficient = {
    ...activeWindow,
    budget: { ...activeWindow.budget, totalFrozenNdp: 999 },
  };
  expect(transitionAffiliateTask("draft", "submit", insufficient)).toEqual({
    ok: false,
    reason: "budget_still_exhausted",
  });
});
```

- [ ] **Step 5: Run Task 1 tests and verify GREEN**

Run: `npm --prefix backend test -- --runTestsByPath tests/affiliate-state-machine.service.test.ts`

Expected: PASS; the suite covers every action at least once and rejects terminal-state mutation.

- [ ] **Step 6: Commit Task 1 only**

```bash
git add backend/src/services/affiliate-state-machine.service.ts backend/tests/affiliate-state-machine.service.test.ts
git commit -m "feat: add affiliate domain state machines"
```

### Task 2: Prisma affiliate schema and migration

**Files:**

- Modify: `backend/prisma/schema.prisma:73`
- Modify: `backend/prisma/schema.prisma:170`
- Modify: `backend/prisma/schema.prisma:264`
- Modify: `backend/prisma/schema.prisma:456`
- Modify: `backend/prisma/schema.prisma:543`
- Modify: `backend/prisma/schema.prisma:670`
- Modify: `backend/prisma/schema.prisma:1108`
- Modify: `backend/prisma/schema.prisma:1129`
- Modify: `backend/prisma/schema.prisma:1715`
- Modify: `backend/src/services/ledger.service.ts:13-35`
- Modify: `backend/src/repositories/ledger.repository.ts:850-960`
- Create: `backend/prisma/migrations/20260826090000_affiliate_domain_foundation/migration.sql`
- Create: `backend/tests/affiliate-schema.test.ts`
- Create: `backend/tests/affiliate-ledger-vocabulary.test.ts`

**Interfaces:**

- Consumes: exact status vocabulary from Task 1.
- Produces Prisma models: `AffiliateTask`, `AffiliateTaskShop`, `AffiliateTaskService`, `AffiliateClaim`, `AffiliateTouch`, `AffiliateAttribution`, `AffiliateReward`, `AffiliateRewardTransaction`, `AffiliateBudgetReservation`, `AffiliateBudgetTransaction`, `AffiliateRiskEvent`.
- Extends `WalletOwnerType` with `MERCHANT_ACCOUNT`, `LedgerTransactionType` with five affiliate transaction kinds, and `WalletLedgerDirection` with `FROZEN_CREDIT`.
- Extends the existing TypeScript ledger unions and both Prisma mapping directions with the same exact values.
- Does not produce an affiliate repository, Service with I/O, API, seed task, or UI data; only the existing ledger repository's enum adapters change.

- [ ] **Step 1: Write the failing schema contract test**

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("affiliate schema foundation", () => {
  const schema = readFileSync(
    join(process.cwd(), "prisma/schema.prisma"),
    "utf8",
  );
  const modelBlock = (name: string): string => {
    const match = schema.match(
      new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`),
    );
    if (!match) throw new Error(`missing model ${name}`);
    return match[1];
  };

  const models = [
    "AffiliateTask",
    "AffiliateTaskShop",
    "AffiliateTaskService",
    "AffiliateClaim",
    "AffiliateTouch",
    "AffiliateAttribution",
    "AffiliateReward",
    "AffiliateRewardTransaction",
    "AffiliateBudgetReservation",
    "AffiliateBudgetTransaction",
    "AffiliateRiskEvent",
  ];

  it.each(models)("defines %s with the shared soft-delete columns", (name) => {
    const block = modelBlock(name);
    expect(block).toMatch(/id\s+Int\s+@id/);
    expect(block).toContain("createdAt");
    expect(block).toContain("updatedAt");
    expect(block).toContain("deletedAt");
  });

  it("extends the existing wallet and ledger enums without changing their mapped values", () => {
    expect(schema).toMatch(
      /enum WalletOwnerType[\\s\\S]*MERCHANT_ACCOUNT\s+@map\("merchant_account"\)/,
    );
    expect(schema).toMatch(
      /enum WalletLedgerDirection[\\s\\S]*FROZEN_CREDIT\s+@map\("frozen_credit"\)/,
    );
    expect(schema).toContain("AFFILIATE_TASK_BUDGET_FREEZE");
    expect(schema).toContain("AFFILIATE_TASK_BUDGET_RELEASE");
    expect(schema).toContain("AFFILIATE_REWARD_SETTLEMENT");
    expect(schema).toContain("AFFILIATE_REWARD_REVERSAL");
    expect(schema).toContain("AFFILIATE_REWARD_RECOVERY");
  });

  it("uses active-key uniqueness for soft-deletable claim and attribution exclusivity", () => {
    expect(modelBlock("AffiliateClaim")).toMatch(
      /activeKey\s+String\?\s+@unique/,
    );
    expect(modelBlock("AffiliateAttribution")).toMatch(
      /activeKey\s+String\?\s+@unique/,
    );
  });

  it("links one task budget reservation and enforces one active order attribution", () => {
    expect(modelBlock("AffiliateBudgetReservation")).toMatch(
      /taskId\s+Int\s+@unique/,
    );
    expect(modelBlock("AffiliateAttribution")).toMatch(/bookingOrderId\s+Int/);
    expect(modelBlock("AffiliateAttribution")).toMatch(
      /@@index\(\[bookingOrderId/,
    );
  });

  it("ships the new migration", () => {
    expect(
      existsSync(
        join(
          process.cwd(),
          "prisma/migrations/20260826090000_affiliate_domain_foundation/migration.sql",
        ),
      ),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run the schema contract and verify RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/affiliate-schema.test.ts`

Expected: FAIL with `missing model AffiliateTask`.

- [ ] **Step 3: Add the exact enum vocabulary to `schema.prisma`**

```prisma
enum WalletOwnerType {
  USER             @map("user")
  SHOP             @map("shop")
  PLATFORM         @map("platform")
  MERCHANT_ACCOUNT @map("merchant_account")

  @@map("wallet_owner_type")
}

enum LedgerTransactionType {
  BOOKING_ACCEPT_FREEZE                @map("booking_accept_freeze")
  BOOKING_CANCEL_UNFREEZE              @map("booking_cancel_unfreeze")
  BOOKING_COMPLETE_SETTLEMENT          @map("booking_complete_settlement")
  BOOKING_MERCHANT_CANCEL_COMPENSATION @map("booking_merchant_cancel_compensation")
  MANUAL_TOPUP_APPROVED                @map("manual_topup_approved")
  MANUAL_WITHDRAWAL_APPROVED           @map("manual_withdrawal_approved")
  SEED_CREDIT                          @map("seed_credit")
  AFFILIATE_TASK_BUDGET_FREEZE         @map("affiliate_task_budget_freeze")
  AFFILIATE_TASK_BUDGET_RELEASE        @map("affiliate_task_budget_release")
  AFFILIATE_REWARD_SETTLEMENT          @map("affiliate_reward_settlement")
  AFFILIATE_REWARD_REVERSAL            @map("affiliate_reward_reversal")
  AFFILIATE_REWARD_RECOVERY            @map("affiliate_reward_recovery")

  @@map("ledger_transaction_type")
}

enum WalletLedgerDirection {
  AVAILABLE_CREDIT @map("available_credit")
  AVAILABLE_DEBIT  @map("available_debit")
  FREEZE           @map("freeze")
  UNFREEZE         @map("unfreeze")
  FROZEN_DEBIT     @map("frozen_debit")
  FROZEN_CREDIT    @map("frozen_credit")

  @@map("wallet_ledger_direction")
}

enum AffiliatePublisherType {
  MERCHANT_ACCOUNT @map("merchant_account")
  SHOP             @map("shop")

  @@map("affiliate_publisher_type")
}

enum AffiliateServiceScopeMode {
  ALL_CURRENT_SERVICES @map("all_current_services")
  SELECTED_SERVICES    @map("selected_services")

  @@map("affiliate_service_scope_mode")
}

enum AffiliateDiscountType {
  NONE      @map("none")
  FIXED_JPY @map("fixed_jpy")
  PERCENT   @map("percent")

  @@map("affiliate_discount_type")
}

enum AffiliateTaskStatus {
  DRAFT            @map("draft")
  PENDING_REVIEW   @map("pending_review")
  SCHEDULED        @map("scheduled")
  ACTIVE           @map("active")
  PAUSED           @map("paused")
  BUDGET_EXHAUSTED @map("budget_exhausted")
  ENDED            @map("ended")
  CANCELLED        @map("cancelled")
  REJECTED         @map("rejected")

  @@map("affiliate_task_status")
}

enum AffiliateClaimStatus {
  ACTIVE  @map("active")
  EXPIRED @map("expired")
  REVOKED @map("revoked")

  @@map("affiliate_claim_status")
}

enum AffiliateTouchSource {
  URL  @map("url")
  CODE @map("code")

  @@map("affiliate_touch_source")
}

enum AffiliateAttributionStatus {
  ATTRIBUTED  @map("attributed")
  QUALIFIED   @map("qualified")
  SETTLED     @map("settled")
  INVALIDATED @map("invalidated")
  REVERSED    @map("reversed")

  @@map("affiliate_attribution_status")
}

enum AffiliateRewardStatus {
  PENDING          @map("pending")
  SETTLED          @map("settled")
  REVERSED         @map("reversed")
  REVERSAL_PENDING @map("reversal_pending")

  @@map("affiliate_reward_status")
}

enum AffiliateBudgetStatus {
  ACTIVE    @map("active")
  EXHAUSTED @map("exhausted")
  RELEASED  @map("released")

  @@map("affiliate_budget_status")
}

enum AffiliateTransactionKind {
  FREEZE     @map("freeze")
  RELEASE    @map("release")
  SETTLEMENT @map("settlement")
  REVERSAL   @map("reversal")
  RECOVERY   @map("recovery")

  @@map("affiliate_transaction_kind")
}

enum AffiliateRiskSeverity {
  LOW      @map("low")
  MEDIUM   @map("medium")
  HIGH     @map("high")
  CRITICAL @map("critical")

  @@map("affiliate_risk_severity")
}

enum AffiliateRiskStatus {
  OPEN      @map("open")
  REVIEWING @map("reviewing")
  RELEASED  @map("released")
  REJECTED  @map("rejected")

  @@map("affiliate_risk_status")
}
```

Format multiline enums with the repository's normal Prisma style before committing; do not change any existing mapped value.

- [ ] **Step 4: Add the normalized affiliate models**

Add these exact fields and constraints; use the named relations shown so Prisma reverse relations are unambiguous:

```prisma
model AffiliateTask {
  id                         Int                       @id @default(autoincrement())
  taskCode                   String                    @unique @map("task_code") @db.VarChar(80)
  lineageKey                 String                    @map("lineage_key") @db.VarChar(80)
  parentTaskId               Int?                      @map("parent_task_id")
  version                    Int                       @default(1)
  lockVersion                Int                       @default(1) @map("lock_version")
  publisherType              AffiliatePublisherType   @map("publisher_type")
  publisherMerchantAccountId Int?                      @map("publisher_merchant_account_id")
  publisherShopId            Int?                      @map("publisher_shop_id")
  name                       String                    @db.VarChar(160)
  description                String?                   @db.Text
  coverMediaAssetId          Int?                      @map("cover_media_asset_id")
  rewardNdpPerCompletedOrder Int                       @map("reward_ndp_per_completed_order")
  totalBudgetNdp             Int                       @map("total_budget_ndp")
  reservedBudgetNdp          Int                       @default(0) @map("reserved_budget_ndp")
  allocatedBudgetNdp         Int                       @default(0) @map("allocated_budget_ndp")
  settledBudgetNdp           Int                       @default(0) @map("settled_budget_ndp")
  releasedBudgetNdp          Int                       @default(0) @map("released_budget_ndp")
  customerDiscountType       AffiliateDiscountType     @default(NONE) @map("customer_discount_type")
  fixedDiscountJpy           Int                       @default(0) @map("fixed_discount_jpy")
  discountRateBps            Int                       @default(0) @map("discount_rate_bps")
  discountCapJpy             Int                       @default(0) @map("discount_cap_jpy")
  minimumOrderAmountJpy      Int                       @default(0) @map("minimum_order_amount_jpy")
  claimStartsAt              DateTime                  @map("claim_starts_at")
  claimEndsAt                DateTime                  @map("claim_ends_at")
  taskStartsAt               DateTime                  @map("task_starts_at")
  taskEndsAt                 DateTime                  @map("task_ends_at")
  attributionWindowDays      Int                       @map("attribution_window_days")
  maxCompletedOrdersPerClaim Int?                      @map("max_completed_orders_per_claim")
  maxCompletedOrdersPerCustomer Int?                   @map("max_completed_orders_per_customer")
  serviceScopeMode           AffiliateServiceScopeMode @map("service_scope_mode")
  status                     AffiliateTaskStatus       @default(DRAFT)
  reviewedById               Int?                      @map("reviewed_by_id")
  reviewedAt                 DateTime?                 @map("reviewed_at")
  rejectionReason            String?                   @map("rejection_reason") @db.VarChar(500)
  submittedAt                DateTime?                 @map("submitted_at")
  activatedAt                DateTime?                 @map("activated_at")
  pausedAt                   DateTime?                 @map("paused_at")
  endedAt                    DateTime?                 @map("ended_at")
  createdAt                  DateTime                  @default(now()) @map("created_at")
  updatedAt                  DateTime                  @updatedAt @map("updated_at")
  deletedAt                  DateTime?                 @map("deleted_at")

  parentTask               AffiliateTask?              @relation("AffiliateTaskVersions", fields: [parentTaskId], references: [id], onDelete: Restrict)
  childVersions            AffiliateTask[]             @relation("AffiliateTaskVersions")
  publisherMerchantAccount MerchantAccount?            @relation("AffiliateMerchantPublisher", fields: [publisherMerchantAccountId], references: [id], onDelete: Restrict)
  publisherShop            Shop?                       @relation("AffiliateShopPublisher", fields: [publisherShopId], references: [id], onDelete: Restrict)
  coverMediaAsset          MediaAsset?                 @relation("AffiliateTaskCover", fields: [coverMediaAssetId], references: [id], onDelete: SetNull)
  reviewedBy               User?                       @relation("AffiliateTaskReviewer", fields: [reviewedById], references: [id], onDelete: SetNull)
  shops                    AffiliateTaskShop[]
  services                 AffiliateTaskService[]
  claims                   AffiliateClaim[]
  touches                  AffiliateTouch[]
  attributions             AffiliateAttribution[]
  rewards                  AffiliateReward[]
  budgetReservation        AffiliateBudgetReservation?
  riskEvents               AffiliateRiskEvent[]

  @@unique([lineageKey, version])
  @@index([parentTaskId])
  @@index([publisherType, publisherMerchantAccountId, publisherShopId])
  @@index([coverMediaAssetId])
  @@index([status, taskStartsAt, taskEndsAt])
  @@index([reviewedById])
  @@index([deletedAt])
  @@map("affiliate_tasks")
}

model AffiliateTaskShop {
  id               Int       @id @default(autoincrement())
  taskId           Int       @map("task_id")
  shopId           Int       @map("shop_id")
  shopNameSnapshot String    @map("shop_name_snapshot") @db.VarChar(160)
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")
  deletedAt        DateTime? @map("deleted_at")
  task             AffiliateTask @relation(fields: [taskId], references: [id], onDelete: Restrict)
  shop             Shop          @relation(fields: [shopId], references: [id], onDelete: Restrict)
  @@unique([taskId, shopId])
  @@index([shopId])
  @@index([deletedAt])
  @@map("affiliate_task_shops")
}

model AffiliateTaskService {
  id                      Int       @id @default(autoincrement())
  taskId                  Int       @map("task_id")
  shopId                  Int       @map("shop_id")
  serviceId               Int       @map("service_id")
  serviceNameSnapshot     String    @map("service_name_snapshot") @db.VarChar(160)
  servicePriceJpySnapshot Int       @map("service_price_jpy_snapshot")
  createdAt               DateTime  @default(now()) @map("created_at")
  updatedAt               DateTime  @updatedAt @map("updated_at")
  deletedAt               DateTime? @map("deleted_at")
  task                    AffiliateTask @relation(fields: [taskId], references: [id], onDelete: Restrict)
  shop                    Shop          @relation(fields: [shopId], references: [id], onDelete: Restrict)
  service                 Service       @relation(fields: [serviceId], references: [id], onDelete: Restrict)
  @@unique([taskId, serviceId])
  @@index([shopId])
  @@index([serviceId])
  @@index([deletedAt])
  @@map("affiliate_task_services")
}

model AffiliateClaim {
  id                       Int                  @id @default(autoincrement())
  taskId                   Int                  @map("task_id")
  userId                   Int                  @map("user_id")
  activeKey                String?              @unique @map("active_key") @db.VarChar(160)
  publicCode               String               @unique @map("public_code") @db.VarChar(40)
  publicTokenId            String               @unique @map("public_token_id") @db.VarChar(80)
  tokenHash                String               @map("token_hash") @db.VarChar(128)
  status                   AffiliateClaimStatus @default(ACTIVE)
  claimedAt                DateTime             @default(now()) @map("claimed_at")
  expiresAt                DateTime             @map("expires_at")
  clickCount               Int                  @default(0) @map("click_count")
  codeUseCount             Int                  @default(0) @map("code_use_count")
  attributedOrderCount     Int                  @default(0) @map("attributed_order_count")
  completedOrderCount      Int                  @default(0) @map("completed_order_count")
  settledRewardNdp         Int                  @default(0) @map("settled_reward_ndp")
  createdAt                DateTime             @default(now()) @map("created_at")
  updatedAt                DateTime             @updatedAt @map("updated_at")
  deletedAt                DateTime?            @map("deleted_at")
  task                     AffiliateTask        @relation(fields: [taskId], references: [id], onDelete: Restrict)
  user                     User                 @relation("AffiliateClaimUser", fields: [userId], references: [id], onDelete: Restrict)
  touches                  AffiliateTouch[]
  attributions             AffiliateAttribution[]
  rewards                  AffiliateReward[]
  riskEvents               AffiliateRiskEvent[]
  @@index([taskId, status])
  @@index([userId, status])
  @@index([expiresAt])
  @@index([deletedAt])
  @@map("affiliate_claims")
}

model AffiliateTouch {
  id                     Int                  @id @default(autoincrement())
  taskId                 Int                  @map("task_id")
  claimId                Int                  @map("claim_id")
  claimantUserId         Int                  @map("claimant_user_id")
  customerUserId         Int?                 @map("customer_user_id")
  anonymousVisitorHash   String?              @map("anonymous_visitor_hash") @db.VarChar(128)
  source                 AffiliateTouchSource
  shopId                 Int?                 @map("shop_id")
  serviceId              Int?                 @map("service_id")
  requestFingerprintHash String?              @map("request_fingerprint_hash") @db.VarChar(128)
  occurredAt             DateTime             @default(now()) @map("occurred_at")
  expiresAt              DateTime             @map("expires_at")
  createdAt              DateTime             @default(now()) @map("created_at")
  updatedAt              DateTime             @updatedAt @map("updated_at")
  deletedAt              DateTime?            @map("deleted_at")
  task                   AffiliateTask        @relation(fields: [taskId], references: [id], onDelete: Restrict)
  claim                  AffiliateClaim       @relation(fields: [claimId], references: [id], onDelete: Restrict)
  claimant               User                 @relation("AffiliateTouchClaimant", fields: [claimantUserId], references: [id], onDelete: Restrict)
  customer               User?                @relation("AffiliateTouchCustomer", fields: [customerUserId], references: [id], onDelete: SetNull)
  shop                   Shop?                @relation(fields: [shopId], references: [id], onDelete: SetNull)
  service                Service?             @relation(fields: [serviceId], references: [id], onDelete: SetNull)
  attributions           AffiliateAttribution[]
  @@index([taskId, occurredAt])
  @@index([claimId, occurredAt])
  @@index([claimantUserId])
  @@index([customerUserId])
  @@index([shopId])
  @@index([serviceId])
  @@index([expiresAt])
  @@index([deletedAt])
  @@map("affiliate_touches")
}

model AffiliateAttribution {
  id                  Int                        @id @default(autoincrement())
  taskId              Int                        @map("task_id")
  claimId             Int                        @map("claim_id")
  touchId             Int?                       @map("touch_id")
  bookingOrderId      Int                        @map("booking_order_id")
  activeKey           String?                    @unique @map("active_key") @db.VarChar(120)
  claimantUserId      Int                        @map("claimant_user_id")
  customerUserId      Int                        @map("customer_user_id")
  shopId              Int                        @map("shop_id")
  serviceId           Int                        @map("service_id")
  source              AffiliateTouchSource
  originalPriceJpy    Int                        @map("original_price_jpy")
  customerDiscountJpy Int                        @default(0) @map("customer_discount_jpy")
  finalPriceJpy       Int                        @map("final_price_jpy")
  rewardAllocatedNdp  Int                        @map("reward_allocated_ndp")
  status              AffiliateAttributionStatus @default(ATTRIBUTED)
  attributedAt        DateTime                   @default(now()) @map("attributed_at")
  expiresAt           DateTime                   @map("expires_at")
  qualifiedAt         DateTime?                  @map("qualified_at")
  settledAt           DateTime?                  @map("settled_at")
  invalidatedAt       DateTime?                  @map("invalidated_at")
  invalidationReason  String?                    @map("invalidation_reason") @db.VarChar(500)
  reversedAt          DateTime?                  @map("reversed_at")
  createdAt           DateTime                   @default(now()) @map("created_at")
  updatedAt           DateTime                   @updatedAt @map("updated_at")
  deletedAt           DateTime?                  @map("deleted_at")
  task                AffiliateTask              @relation(fields: [taskId], references: [id], onDelete: Restrict)
  claim               AffiliateClaim             @relation(fields: [claimId], references: [id], onDelete: Restrict)
  touch               AffiliateTouch?            @relation(fields: [touchId], references: [id], onDelete: SetNull)
  bookingOrder        BookingOrder               @relation(fields: [bookingOrderId], references: [id], onDelete: Restrict)
  claimant            User                       @relation("AffiliateAttributionClaimant", fields: [claimantUserId], references: [id], onDelete: Restrict)
  customer            User                       @relation("AffiliateAttributionCustomer", fields: [customerUserId], references: [id], onDelete: Restrict)
  shop                Shop                       @relation(fields: [shopId], references: [id], onDelete: Restrict)
  service             Service                    @relation(fields: [serviceId], references: [id], onDelete: Restrict)
  reward              AffiliateReward?
  riskEvents          AffiliateRiskEvent[]
  @@index([taskId, status])
  @@index([claimId, status])
  @@index([bookingOrderId, status])
  @@index([touchId])
  @@index([claimantUserId])
  @@index([customerUserId])
  @@index([shopId, serviceId])
  @@index([expiresAt])
  @@index([deletedAt])
  @@map("affiliate_attributions")
}

model AffiliateReward {
  id                     Int                   @id @default(autoincrement())
  attributionId          Int                   @unique @map("attribution_id")
  taskId                 Int                   @map("task_id")
  claimId                Int                   @map("claim_id")
  bookingOrderId         Int                   @map("booking_order_id")
  publisherWalletId      Int                   @map("publisher_wallet_id")
  claimantWalletId       Int                   @map("claimant_wallet_id")
  rewardNdp              Int                   @map("reward_ndp")
  reversalRequiredNdp    Int                   @default(0) @map("reversal_required_ndp")
  reversedNdp            Int                   @default(0) @map("reversed_ndp")
  outstandingRecoveryNdp Int                   @default(0) @map("outstanding_recovery_ndp")
  status                 AffiliateRewardStatus @default(PENDING)
  settledAt              DateTime?             @map("settled_at")
  reversedAt             DateTime?             @map("reversed_at")
  reversalReason         String?               @map("reversal_reason") @db.VarChar(500)
  createdAt              DateTime              @default(now()) @map("created_at")
  updatedAt              DateTime              @updatedAt @map("updated_at")
  deletedAt              DateTime?             @map("deleted_at")
  attribution            AffiliateAttribution  @relation(fields: [attributionId], references: [id], onDelete: Restrict)
  task                   AffiliateTask         @relation(fields: [taskId], references: [id], onDelete: Restrict)
  claim                  AffiliateClaim        @relation(fields: [claimId], references: [id], onDelete: Restrict)
  bookingOrder           BookingOrder          @relation(fields: [bookingOrderId], references: [id], onDelete: Restrict)
  publisherWallet        Wallet                @relation("AffiliateRewardPublisherWallet", fields: [publisherWalletId], references: [id], onDelete: Restrict)
  claimantWallet         Wallet                @relation("AffiliateRewardClaimantWallet", fields: [claimantWalletId], references: [id], onDelete: Restrict)
  transactions           AffiliateRewardTransaction[]
  riskEvents             AffiliateRiskEvent[]
  @@index([taskId, status])
  @@index([claimId, status])
  @@index([bookingOrderId])
  @@index([publisherWalletId])
  @@index([claimantWalletId])
  @@index([deletedAt])
  @@map("affiliate_rewards")
}

model AffiliateRewardTransaction {
  id                  Int                      @id @default(autoincrement())
  rewardId            Int                      @map("reward_id")
  ledgerTransactionId Int                      @unique @map("ledger_transaction_id")
  kind                AffiliateTransactionKind
  amountNdp           Int                      @map("amount_ndp")
  createdAt           DateTime                 @default(now()) @map("created_at")
  updatedAt           DateTime                 @updatedAt @map("updated_at")
  deletedAt           DateTime?                @map("deleted_at")
  reward              AffiliateReward          @relation(fields: [rewardId], references: [id], onDelete: Restrict)
  transaction         LedgerTransaction        @relation("AffiliateRewardLedgerTransaction", fields: [ledgerTransactionId], references: [id], onDelete: Restrict)
  @@index([rewardId, kind])
  @@index([deletedAt])
  @@map("affiliate_reward_transactions")
}

model AffiliateBudgetReservation {
  id                 Int                   @id @default(autoincrement())
  taskId             Int                   @unique @map("task_id")
  walletId           Int                   @map("wallet_id")
  totalFrozenNdp     Int                   @map("total_frozen_ndp")
  allocatedNdp       Int                   @default(0) @map("allocated_ndp")
  capturedNdp        Int                   @default(0) @map("captured_ndp")
  releasedNdp        Int                   @default(0) @map("released_ndp")
  status             AffiliateBudgetStatus @default(ACTIVE)
  idempotencyKey     String                @unique @map("idempotency_key") @db.VarChar(180)
  frozenAt           DateTime              @default(now()) @map("frozen_at")
  releasedAt         DateTime?             @map("released_at")
  createdAt          DateTime              @default(now()) @map("created_at")
  updatedAt          DateTime              @updatedAt @map("updated_at")
  deletedAt          DateTime?             @map("deleted_at")
  task               AffiliateTask         @relation(fields: [taskId], references: [id], onDelete: Restrict)
  wallet             Wallet                @relation(fields: [walletId], references: [id], onDelete: Restrict)
  transactions       AffiliateBudgetTransaction[]
  @@index([walletId, status])
  @@index([deletedAt])
  @@map("affiliate_budget_reservations")
}

model AffiliateBudgetTransaction {
  id                  Int                        @id @default(autoincrement())
  budgetReservationId Int                        @map("budget_reservation_id")
  ledgerTransactionId Int                        @unique @map("ledger_transaction_id")
  kind                AffiliateTransactionKind
  amountNdp           Int                        @map("amount_ndp")
  createdAt           DateTime                   @default(now()) @map("created_at")
  updatedAt           DateTime                   @updatedAt @map("updated_at")
  deletedAt           DateTime?                  @map("deleted_at")
  budgetReservation   AffiliateBudgetReservation @relation(fields: [budgetReservationId], references: [id], onDelete: Restrict)
  transaction         LedgerTransaction          @relation("AffiliateBudgetLedgerTransaction", fields: [ledgerTransactionId], references: [id], onDelete: Restrict)
  @@index([budgetReservationId, kind])
  @@index([deletedAt])
  @@map("affiliate_budget_transactions")
}

model AffiliateRiskEvent {
  id             Int                   @id @default(autoincrement())
  taskId         Int?                  @map("task_id")
  claimId        Int?                  @map("claim_id")
  attributionId  Int?                  @map("attribution_id")
  rewardId       Int?                  @map("reward_id")
  ruleCode       String                @map("rule_code") @db.VarChar(100)
  subjectType    String                @map("subject_type") @db.VarChar(60)
  subjectId      Int                   @map("subject_id")
  severity       AffiliateRiskSeverity
  status         AffiliateRiskStatus   @default(OPEN)
  evidence       Json?
  frozenNdp      Int                   @default(0) @map("frozen_ndp")
  reviewedById   Int?                  @map("reviewed_by_id")
  reviewedAt     DateTime?             @map("reviewed_at")
  resolutionReason String?             @map("resolution_reason") @db.VarChar(500)
  createdAt      DateTime              @default(now()) @map("created_at")
  updatedAt      DateTime              @updatedAt @map("updated_at")
  deletedAt      DateTime?             @map("deleted_at")
  task           AffiliateTask?        @relation(fields: [taskId], references: [id], onDelete: SetNull)
  claim          AffiliateClaim?       @relation(fields: [claimId], references: [id], onDelete: SetNull)
  attribution    AffiliateAttribution? @relation(fields: [attributionId], references: [id], onDelete: SetNull)
  reward         AffiliateReward?      @relation(fields: [rewardId], references: [id], onDelete: SetNull)
  reviewedBy     User?                 @relation("AffiliateRiskReviewer", fields: [reviewedById], references: [id], onDelete: SetNull)
  @@index([taskId])
  @@index([claimId])
  @@index([attributionId])
  @@index([rewardId])
  @@index([ruleCode, status])
  @@index([subjectType, subjectId])
  @@index([severity, status])
  @@index([reviewedById])
  @@index([deletedAt])
  @@map("affiliate_risk_events")
}
```

- [ ] **Step 5: Add exact reverse relations to existing models**

```prisma
// User
reviewedAffiliateTasks      AffiliateTask[]        @relation("AffiliateTaskReviewer")
affiliateClaims             AffiliateClaim[]       @relation("AffiliateClaimUser")
affiliateTouchesAsClaimant  AffiliateTouch[]       @relation("AffiliateTouchClaimant")
affiliateTouchesAsCustomer  AffiliateTouch[]       @relation("AffiliateTouchCustomer")
affiliateAttributionsClaimed AffiliateAttribution[] @relation("AffiliateAttributionClaimant")
affiliateAttributionsAsCustomer AffiliateAttribution[] @relation("AffiliateAttributionCustomer")
reviewedAffiliateRisks      AffiliateRiskEvent[]    @relation("AffiliateRiskReviewer")

// MerchantAccount
publishedAffiliateTasks AffiliateTask[] @relation("AffiliateMerchantPublisher")

// Shop
publishedAffiliateTasks AffiliateTask[]        @relation("AffiliateShopPublisher")
affiliateTaskScopes     AffiliateTaskShop[]
affiliateServiceScopes  AffiliateTaskService[]
affiliateTouches        AffiliateTouch[]
affiliateAttributions   AffiliateAttribution[]

// Service
affiliateTaskScopes   AffiliateTaskService[]
affiliateTouches      AffiliateTouch[]
affiliateAttributions AffiliateAttribution[]

// MediaAsset
affiliateTaskCovers AffiliateTask[] @relation("AffiliateTaskCover")

// BookingOrder
affiliateAttributions AffiliateAttribution[]
affiliateRewards      AffiliateReward[]

// Wallet
affiliateBudgetReservations AffiliateBudgetReservation[]
affiliateRewardsAsPublisher AffiliateReward[] @relation("AffiliateRewardPublisherWallet")
affiliateRewardsAsClaimant  AffiliateReward[] @relation("AffiliateRewardClaimantWallet")

// LedgerTransaction
affiliateRewardTransactions AffiliateRewardTransaction[] @relation("AffiliateRewardLedgerTransaction")
affiliateBudgetTransactions AffiliateBudgetTransaction[] @relation("AffiliateBudgetLedgerTransaction")
```

Run `npx prisma format` immediately after insertion so relation or syntax mistakes are surfaced before migration generation.

- [ ] **Step 6: Write failing round-trip tests for the ledger vocabulary**

```ts
import { LedgerRepository } from "../src/repositories/ledger.repository";

interface LedgerVocabularyAdapter {
  ownerTypeToDb(value: string): string;
  ownerTypeFromDb(value: string): string;
  transactionTypeToDb(value: string): string;
  transactionTypeFromDb(value: string): string;
  directionToDb(value: string): string;
  directionFromDb(value: string): string;
}

describe("affiliate ledger vocabulary", () => {
  const adapter = new LedgerRepository(
    {} as never,
  ) as unknown as LedgerVocabularyAdapter;

  it("round-trips merchant-account wallet ownership", () => {
    expect(adapter.ownerTypeToDb("merchant_account")).toBe("MERCHANT_ACCOUNT");
    expect(adapter.ownerTypeFromDb("MERCHANT_ACCOUNT")).toBe(
      "merchant_account",
    );
  });

  it.each([
    ["affiliate_task_budget_freeze", "AFFILIATE_TASK_BUDGET_FREEZE"],
    ["affiliate_task_budget_release", "AFFILIATE_TASK_BUDGET_RELEASE"],
    ["affiliate_reward_settlement", "AFFILIATE_REWARD_SETTLEMENT"],
    ["affiliate_reward_reversal", "AFFILIATE_REWARD_REVERSAL"],
    ["affiliate_reward_recovery", "AFFILIATE_REWARD_RECOVERY"],
  ])("round-trips %s", (serviceValue, dbValue) => {
    expect(adapter.transactionTypeToDb(serviceValue)).toBe(dbValue);
    expect(adapter.transactionTypeFromDb(dbValue)).toBe(serviceValue);
  });

  it("round-trips a frozen-balance credit", () => {
    expect(adapter.directionToDb("frozen_credit")).toBe("FROZEN_CREDIT");
    expect(adapter.directionFromDb("FROZEN_CREDIT")).toBe("frozen_credit");
  });
});
```

Run: `npm --prefix backend test -- --runTestsByPath tests/affiliate-ledger-vocabulary.test.ts`

Expected: FAIL because the current fallback mappings return `USER`, `BOOKING_ACCEPT_FREEZE`, and `freeze`.

- [ ] **Step 7: Extend ledger service types and repository mappings**

In `ledger.service.ts`, use these exact unions:

```ts
export type WalletOwnerType = "user" | "shop" | "platform" | "merchant_account";
export type WalletLedgerDirection =
  | "available_credit"
  | "available_debit"
  | "freeze"
  | "unfreeze"
  | "frozen_debit"
  | "frozen_credit";
export type LedgerTransactionType =
  | "booking_accept_freeze"
  | "booking_cancel_unfreeze"
  | "booking_complete_settlement"
  | "booking_merchant_cancel_compensation"
  | "manual_topup_approved"
  | "manual_withdrawal_approved"
  | "seed_credit"
  | "affiliate_task_budget_freeze"
  | "affiliate_task_budget_release"
  | "affiliate_reward_settlement"
  | "affiliate_reward_reversal"
  | "affiliate_reward_recovery";
```

In `ledger.repository.ts`, add explicit branches in both directions before every existing fallback:

```ts
if (ownerType === "merchant_account") return "MERCHANT_ACCOUNT" as const;
if (ownerType === "MERCHANT_ACCOUNT") return "merchant_account";

if (type === "affiliate_task_budget_freeze")
  return "AFFILIATE_TASK_BUDGET_FREEZE" as const;
if (type === "affiliate_task_budget_release")
  return "AFFILIATE_TASK_BUDGET_RELEASE" as const;
if (type === "affiliate_reward_settlement")
  return "AFFILIATE_REWARD_SETTLEMENT" as const;
if (type === "affiliate_reward_reversal")
  return "AFFILIATE_REWARD_REVERSAL" as const;
if (type === "affiliate_reward_recovery")
  return "AFFILIATE_REWARD_RECOVERY" as const;

if (type === "AFFILIATE_TASK_BUDGET_FREEZE")
  return "affiliate_task_budget_freeze";
if (type === "AFFILIATE_TASK_BUDGET_RELEASE")
  return "affiliate_task_budget_release";
if (type === "AFFILIATE_REWARD_SETTLEMENT")
  return "affiliate_reward_settlement";
if (type === "AFFILIATE_REWARD_REVERSAL") return "affiliate_reward_reversal";
if (type === "AFFILIATE_REWARD_RECOVERY") return "affiliate_reward_recovery";

if (direction === "frozen_credit") return "FROZEN_CREDIT" as const;
if (direction === "FROZEN_CREDIT") return "frozen_credit";
```

Run the focused vocabulary test again. Expected: PASS.

- [ ] **Step 8: Generate the migration without applying it, normalize its path, and add invariant checks**

Run from `backend/` with a verified local `.env.dev`:

```bash
ENV_FILE=.env.dev npx prisma migrate dev --create-only --name affiliate_domain_foundation
```

Expected: Prisma creates exactly one new migration directory ending in `_affiliate_domain_foundation` and does not report drift.

Normalize the generated directory to the plan's fixed path with this guarded command from `backend/`:

```bash
node -e 'const fs=require("node:fs"); const root="prisma/migrations"; const target="20260826090000_affiliate_domain_foundation"; const matches=fs.readdirSync(root).filter((name)=>name.endsWith("_affiliate_domain_foundation")); if(matches.length!==1) throw new Error(`expected one generated migration, found ${matches.length}`); if(matches[0]!==target) fs.renameSync(`${root}/${matches[0]}`,`${root}/${target}`);'
```

Then append these checks to the generated SQL using `apply_patch`:

```sql
ALTER TABLE `affiliate_tasks`
  ADD CONSTRAINT `affiliate_tasks_publisher_check`
  CHECK (
    (`publisher_type` = 'merchant_account' AND `publisher_merchant_account_id` IS NOT NULL AND `publisher_shop_id` IS NULL)
    OR
    (`publisher_type` = 'shop' AND `publisher_shop_id` IS NOT NULL AND `publisher_merchant_account_id` IS NULL)
  ),
  ADD CONSTRAINT `affiliate_tasks_budget_check`
  CHECK (
    `reward_ndp_per_completed_order` > 0
    AND `total_budget_ndp` > 0
    AND `total_budget_ndp` >= `reward_ndp_per_completed_order`
    AND `reserved_budget_ndp` >= 0
    AND `allocated_budget_ndp` >= 0
    AND `settled_budget_ndp` >= 0
    AND `released_budget_ndp` >= 0
    AND `allocated_budget_ndp` + `settled_budget_ndp` + `released_budget_ndp` <= `reserved_budget_ndp`
    AND `reserved_budget_ndp` <= `total_budget_ndp`
  ),
  ADD CONSTRAINT `affiliate_tasks_time_check`
  CHECK (`claim_starts_at` < `claim_ends_at` AND `task_starts_at` < `task_ends_at`),
  ADD CONSTRAINT `affiliate_tasks_discount_check`
  CHECK (
    `fixed_discount_jpy` >= 0
    AND `discount_rate_bps` BETWEEN 0 AND 10000
    AND `discount_cap_jpy` >= 0
    AND `minimum_order_amount_jpy` >= 0
  );

ALTER TABLE `affiliate_budget_reservations`
  ADD CONSTRAINT `affiliate_budget_reservation_amount_check`
  CHECK (
    `total_frozen_ndp` > 0
    AND `allocated_ndp` >= 0
    AND `captured_ndp` >= 0
    AND `released_ndp` >= 0
    AND `allocated_ndp` + `captured_ndp` + `released_ndp` <= `total_frozen_ndp`
  );

ALTER TABLE `affiliate_rewards`
  ADD CONSTRAINT `affiliate_rewards_amount_check`
  CHECK (
    `reward_ndp` > 0
    AND `reversal_required_ndp` >= 0
    AND `reversed_ndp` >= 0
    AND `outstanding_recovery_ndp` >= 0
    AND `reversed_ndp` + `outstanding_recovery_ndp` <= `reversal_required_ndp`
  );
```

- [ ] **Step 9: Format, validate, generate Prisma Client, and verify GREEN**

Run: `npm --prefix backend exec -- prisma format`

Expected: `schema.prisma` formats successfully.

Run: `npm --prefix backend exec -- prisma validate`

Expected: `The schema at prisma/schema.prisma is valid`.

Run: `npm --prefix backend run prisma:generate`

Expected: Prisma Client generation succeeds.

Run: `npm --prefix backend test -- --runTestsByPath tests/affiliate-schema.test.ts`

Expected: PASS.

Run: `npm --prefix backend test -- --runTestsByPath tests/affiliate-ledger-vocabulary.test.ts tests/ledger-service.test.ts tests/ledger-api.test.ts`

Expected: PASS; existing Booking, manual adjustment, and ledger mappings remain unchanged.

- [ ] **Step 10: Apply and inspect the migration only against local MySQL**

Workdir: `backend/`

Run: `ENV_FILE=.env.dev npx prisma migrate dev`

Expected: `20260826090000_affiliate_domain_foundation` applies successfully with no reset prompt.

Run: `ENV_FILE=.env.dev npx prisma migrate status`

Expected: `Database schema is up to date!`

- [ ] **Step 11: Commit Task 2 only**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260826090000_affiliate_domain_foundation/migration.sql backend/src/services/ledger.service.ts backend/src/repositories/ledger.repository.ts backend/tests/affiliate-schema.test.ts backend/tests/affiliate-ledger-vocabulary.test.ts
git commit -m "feat: add affiliate domain schema"
```

### Task 3: Seeded RBAC catalog and role boundaries

**Files:**

- Modify: `backend/src/constants/permissions.constants.ts:76-1030`
- Create: `backend/tests/affiliate-permissions.test.ts`

**Interfaces:**

- Consumes: existing `SYSTEM_PERMISSIONS`, `SystemPermissionCode`, and `buildRolePermissionAssignments()`.
- Produces exact menu/page/button permission codes approved in the design.
- Gives marketplace/claim access to every system role, merchant publish controls only to merchant roles, operations controls to operator, reversal to finance, full access to admin, and read-only operations visibility to viewer.
- Relies on the existing idempotent `prisma/seed.ts`; adds no affiliate task or metric seed rows.

- [ ] **Step 1: Write the failing permission contract test**

```ts
import {
  SYSTEM_PERMISSION_CODES,
  buildRolePermissionAssignments,
} from "../src/constants/permissions.constants";

const marketplace = [
  "menu:affiliate",
  "page:affiliate-marketplace",
  "button:affiliate-claim",
];
const merchantPublisher = [
  "menu:merchant-affiliate",
  "page:merchant-affiliate-task",
  "button:merchant-affiliate-task-create",
  "button:merchant-affiliate-task-submit",
  "button:merchant-affiliate-task-pause",
];
const backofficeRead = [
  "menu:backoffice-affiliate",
  "page:backoffice-affiliate",
];

describe("affiliate RBAC seed contract", () => {
  const assignments = buildRolePermissionAssignments();

  it("registers every approved affiliate permission", () => {
    expect(SYSTEM_PERMISSION_CODES).toEqual(
      expect.arrayContaining([
        ...marketplace,
        ...merchantPublisher,
        ...backofficeRead,
        "button:backoffice-affiliate-review",
        "button:backoffice-affiliate-suspend",
        "button:backoffice-affiliate-reversal",
        "button:backoffice-affiliate-export",
      ]),
    );
  });

  it.each([
    "operator",
    "finance",
    "support",
    "merchant_owner",
    "merchant_staff",
    "technician",
    "customer",
    "broker",
    "scout",
    "viewer",
  ] as const)("grants marketplace claiming to %s", (role) =>
    expect(assignments[role]).toEqual(expect.arrayContaining(marketplace)),
  );

  it.each(["merchant_owner", "merchant_staff"] as const)(
    "grants publishing controls to %s",
    (role) => {
      expect(assignments[role]).toEqual(
        expect.arrayContaining(merchantPublisher),
      );
    },
  );

  it("keeps merchant publishing controls away from ordinary customers", () => {
    expect(assignments.customer).not.toEqual(
      expect.arrayContaining(merchantPublisher),
    );
  });

  it("splits operations and finance actions by least privilege", () => {
    expect(assignments.operator).toEqual(
      expect.arrayContaining([
        ...backofficeRead,
        "button:backoffice-affiliate-review",
        "button:backoffice-affiliate-suspend",
        "button:backoffice-affiliate-export",
      ]),
    );
    expect(assignments.operator).not.toContain(
      "button:backoffice-affiliate-reversal",
    );
    expect(assignments.finance).toEqual(
      expect.arrayContaining([
        ...backofficeRead,
        "button:backoffice-affiliate-reversal",
        "button:backoffice-affiliate-export",
      ]),
    );
    expect(assignments.viewer).toEqual(expect.arrayContaining(backofficeRead));
    expect(assignments.viewer).not.toContain(
      "button:backoffice-affiliate-export",
    );
  });

  it("continues to grant every system permission to admin", () => {
    expect(assignments.admin).toEqual(SYSTEM_PERMISSION_CODES);
  });
});
```

- [ ] **Step 2: Run the permission contract and verify RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/affiliate-permissions.test.ts`

Expected: FAIL because `menu:affiliate` is absent.

- [ ] **Step 3: Add the exact permission definitions**

Append before the closing `SYSTEM_PERMISSIONS` bracket:

```ts
(createPermission(
  "menu:affiliate",
  "联盟营销",
  "menu",
  "affiliate",
  "显示用户联盟营销入口",
),
  createPermission(
    "page:affiliate-marketplace",
    "联盟任务大厅",
    "page",
    "affiliate",
    "访问联盟任务大厅和本人推广数据",
  ),
  createPermission(
    "button:affiliate-claim",
    "领取联盟任务",
    "button",
    "affiliate",
    "显示领取有效联盟任务的操作",
  ),
  createPermission(
    "menu:merchant-affiliate",
    "商户联盟营销",
    "menu",
    "merchant-affiliate",
    "显示商户或店铺联盟营销入口",
  ),
  createPermission(
    "page:merchant-affiliate-task",
    "商户联盟任务",
    "page",
    "merchant-affiliate",
    "访问当前商户或店铺范围的联盟任务",
  ),
  createPermission(
    "button:merchant-affiliate-task-create",
    "创建联盟任务",
    "button",
    "merchant-affiliate",
    "显示创建联盟任务操作",
  ),
  createPermission(
    "button:merchant-affiliate-task-submit",
    "提交联盟任务",
    "button",
    "merchant-affiliate",
    "显示提交发布并冻结预算操作",
  ),
  createPermission(
    "button:merchant-affiliate-task-pause",
    "暂停联盟任务",
    "button",
    "merchant-affiliate",
    "显示暂停或恢复联盟任务操作",
  ),
  createPermission(
    "menu:backoffice-affiliate",
    "运营联盟营销",
    "menu",
    "backoffice-affiliate",
    "显示运营后台联盟营销入口",
  ),
  createPermission(
    "page:backoffice-affiliate",
    "运营联盟营销页面",
    "page",
    "backoffice-affiliate",
    "访问全平台联盟营销数据",
  ),
  createPermission(
    "button:backoffice-affiliate-review",
    "审核联盟任务",
    "button",
    "backoffice-affiliate",
    "显示联盟任务审核操作",
  ),
  createPermission(
    "button:backoffice-affiliate-suspend",
    "暂停联盟任务",
    "button",
    "backoffice-affiliate",
    "显示运营暂停联盟任务操作",
  ),
  createPermission(
    "button:backoffice-affiliate-reversal",
    "冲正联盟返点",
    "button",
    "backoffice-affiliate",
    "显示受审计的联盟返点冲正操作",
  ),
  createPermission(
    "button:backoffice-affiliate-export",
    "导出联盟数据",
    "button",
    "backoffice-affiliate",
    "显示联盟营销服务端导出操作",
  ));
```

- [ ] **Step 4: Add typed permission groups and spread them into role assignments**

```ts
const AFFILIATE_MARKETPLACE_PERMISSION_CODES = [
  "menu:affiliate",
  "page:affiliate-marketplace",
  "button:affiliate-claim",
] as const satisfies readonly SystemPermissionCode[];

const MERCHANT_AFFILIATE_PERMISSION_CODES = [
  "menu:merchant-affiliate",
  "page:merchant-affiliate-task",
  "button:merchant-affiliate-task-create",
  "button:merchant-affiliate-task-submit",
  "button:merchant-affiliate-task-pause",
] as const satisfies readonly SystemPermissionCode[];

const BACKOFFICE_AFFILIATE_READ_PERMISSION_CODES = [
  "menu:backoffice-affiliate",
  "page:backoffice-affiliate",
] as const satisfies readonly SystemPermissionCode[];

const BACKOFFICE_AFFILIATE_OPERATOR_PERMISSION_CODES = [
  ...BACKOFFICE_AFFILIATE_READ_PERMISSION_CODES,
  "button:backoffice-affiliate-review",
  "button:backoffice-affiliate-suspend",
  "button:backoffice-affiliate-export",
] as const satisfies readonly SystemPermissionCode[];

const BACKOFFICE_AFFILIATE_FINANCE_PERMISSION_CODES = [
  ...BACKOFFICE_AFFILIATE_READ_PERMISSION_CODES,
  "button:backoffice-affiliate-reversal",
  "button:backoffice-affiliate-export",
] as const satisfies readonly SystemPermissionCode[];
```

Replace the assignment object with this complete version:

```ts
export const buildRolePermissionAssignments = (): Record<
  SystemRoleCode,
  SystemPermissionCode[]
> => ({
  admin: [...SYSTEM_PERMISSION_CODES],
  operator: [
    ...READ_ONLY_BACKOFFICE_PERMISSION_CODES,
    ...BACKOFFICE_REAL_DATA_PERMISSION_CODES,
    ...AFFILIATE_MARKETPLACE_PERMISSION_CODES,
    ...BACKOFFICE_AFFILIATE_OPERATOR_PERMISSION_CODES,
    "finance:fee-rule:list",
    "finance:fee-rule:preview",
    "finance:calculation-log:list",
    "user:create",
    "user:update",
    "user:status:update",
    "user:assign-role",
    "button:user:create",
    "button:user:update",
    "button:user:disable",
    "button:user:assign-role",
    "menu:admin-settings",
    "page:admin-settings",
  ],
  finance: [
    ...FINANCE_PERMISSION_CODES,
    ...AFFILIATE_MARKETPLACE_PERMISSION_CODES,
    ...BACKOFFICE_AFFILIATE_FINANCE_PERMISSION_CODES,
    "backoffice:finance:list",
    "backoffice:finance:export",
    "backoffice:finance-order:read",
    "backoffice:order-payment:write",
    "backoffice:payroll:read",
    "menu:admin-settings",
    "page:admin-settings",
  ],
  support: [
    ...AUTH_AND_DASHBOARD_PERMISSION_CODES,
    ...AFFILIATE_MARKETPLACE_PERMISSION_CODES,
    "menu:user-management",
    "page:user-management",
    "user:list",
    "user:update",
    "user:identity:list",
    "button:user:update",
  ],
  merchant_owner: [
    ...SERVICE_PROVIDER_ORDER_PERMISSION_CODES,
    ...REALTIME_USER_PERMISSION_CODES,
    ...MERCHANT_ADMIN_REAL_DATA_PERMISSION_CODES,
    ...AFFILIATE_MARKETPLACE_PERMISSION_CODES,
    ...MERCHANT_AFFILIATE_PERMISSION_CODES,
  ],
  merchant_staff: [
    ...SERVICE_PROVIDER_ORDER_PERMISSION_CODES,
    ...REALTIME_USER_PERMISSION_CODES,
    ...MERCHANT_ADMIN_REAL_DATA_PERMISSION_CODES,
    ...AFFILIATE_MARKETPLACE_PERMISSION_CODES,
    ...MERCHANT_AFFILIATE_PERMISSION_CODES,
  ],
  technician: [
    "menu:technician-app",
    "menu:technician-schedule",
    ...SERVICE_PROVIDER_ORDER_PERMISSION_CODES,
    ...REALTIME_USER_PERMISSION_CODES,
    ...AFFILIATE_MARKETPLACE_PERMISSION_CODES,
    "technician:services:list",
    "technician:services:write",
    "technician:payslip:read",
    "technician:payslip:confirm",
    "technician:payslip:dispute",
    "technician:payout-record:confirm",
  ],
  customer: [
    ...CUSTOMER_BOOKING_PERMISSION_CODES,
    ...REALTIME_USER_PERMISSION_CODES,
    ...AFFILIATE_MARKETPLACE_PERMISSION_CODES,
  ],
  broker: [
    ...AUTH_AND_DASHBOARD_PERMISSION_CODES,
    ...AFFILIATE_MARKETPLACE_PERMISSION_CODES,
  ],
  scout: [
    ...AUTH_AND_DASHBOARD_PERMISSION_CODES,
    ...AFFILIATE_MARKETPLACE_PERMISSION_CODES,
  ],
  viewer: [
    ...READ_ONLY_BACKOFFICE_PERMISSION_CODES,
    ...AFFILIATE_MARKETPLACE_PERMISSION_CODES,
    ...BACKOFFICE_AFFILIATE_READ_PERMISSION_CODES,
  ],
});
```

- [ ] **Step 5: Run permission and existing seed contracts**

Run: `npm --prefix backend test -- --runTestsByPath tests/affiliate-permissions.test.ts tests/user-management-seed.test.ts`

Expected: PASS; the existing role order, portal permissions, and admin-all-permissions contract remain unchanged.

- [ ] **Step 6: Commit Task 3 only**

```bash
git add backend/src/constants/permissions.constants.ts backend/tests/affiliate-permissions.test.ts
git commit -m "feat: seed affiliate RBAC permissions"
```

### Task 4: Foundation documentation and full verification gate

**Files:**

- Modify: `README.md:170-235`
- Modify: `docs/database.md:105-201`
- Modify: `docs/ledger.md:1-112`
- Modify: `docs/NEEDO_AFIRIEITO_ADMIN_DEVELOPMENT.md:1-15`

**Interfaces:**

- Consumes all artifacts from Tasks 1-3.
- Produces an accurate operator/developer statement that the schema and permissions exist but no affiliate route is activated yet.
- Declares the former NDA/localStorage document legacy and non-authoritative.

- [ ] **Step 1: Add the formal foundation status to README**

Insert after the existing operations Afirieito capability-gate paragraph:

```markdown
### Formal Affiliate Domain Foundation

The formal alliance-marketing foundation persists tasks, explicit shop/service scope snapshots, claims, hashed signed-link tokens, touches, one-attribution-per-order records, fixed-NDP rewards, task budget reservations, ledger links, and risk events. It extends wallets to support merchant-account ownership and seeds role-specific affiliate menu/page/button permissions.

This foundation does not activate `/admin/afirieito`, merchant publishing, task claiming, Checkout attribution, or reward settlement by itself. Those surfaces remain capability-gated until their own repository, Service, Zod/OpenAPI API, transaction, integration-test, and UI acceptance microsteps are complete. No formal affiliate task or metric is seeded into production data.
```

- [ ] **Step 2: Document tables and ledger vocabulary**

Append to `docs/database.md`:

```markdown
## Affiliate Domain Foundation

Migration `20260826090000_affiliate_domain_foundation` adds `affiliate_tasks`, explicit task shop/service snapshots, claims, privacy-minimized touches, order attributions, rewards and their ledger links, task budget reservations and their ledger links, and risk events. Claim and attribution exclusivity use nullable `active_key` uniqueness so soft deletion remains compatible with MySQL. Publisher identity is constrained to exactly one MerchantAccount or Shop.

No affiliate rows are part of the formal seed. `prisma/seed.ts` only upserts the approved RBAC catalog in this slice.
```

Append to `docs/ledger.md`:

```markdown
## Affiliate Foundation Vocabulary

`WalletOwnerType` now includes `merchant_account`; the ledger enum reserves task-budget freeze/release and reward settlement/reversal/recovery transaction types. `frozen_credit` supports an audited reversal returning recovered NDP to an active task's frozen budget. This migration only establishes vocabulary and relations—no affiliate Service may mutate a wallet until the later transaction microstep adds focused unit/integration tests and reuses `LedgerService`.
```

- [ ] **Step 3: Mark the legacy NDA document as superseded**

Insert at the top of `docs/NEEDO_AFIRIEITO_ADMIN_DEVELOPMENT.md`, below its title:

```markdown
> **Legacy reference only (superseded 2026-08-26).** The independent NDA/localStorage architecture in this document must not be expanded or used as the formal implementation contract. The authoritative direction is `docs/superpowers/specs/2026-08-26-needo-affiliate-service-completion-rewards-design.md`: one NeeDo affiliate domain, merchant/shop publishing, all active users eligible to claim, and fixed NDP settlement only after service completion.
```

- [ ] **Step 4: Run placeholder, mock-expansion, and formatting scans**

Run: `rg -n "TODO|FIXME|not implemented|placeholder|fake API" backend/src/services/affiliate-state-machine.service.ts backend/tests/affiliate-*.test.ts docs/superpowers/specs/2026-08-26-needo-affiliate-service-completion-rewards-design.md`

Expected: no matches.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 5: Run focused foundation verification**

Run: `npm --prefix backend test -- --runTestsByPath tests/affiliate-state-machine.service.test.ts tests/affiliate-schema.test.ts tests/affiliate-permissions.test.ts tests/user-management-seed.test.ts`

Expected: PASS.

Run: `npm --prefix backend run lint`

Expected: PASS.

Run: `npm --prefix backend run build`

Expected: PASS.

- [ ] **Step 6: Run full repository regression checks**

Run: `npm --prefix backend test`

Expected: all backend Jest suites pass.

Run: `npm test`

Expected: all frontend Vitest suites pass even though no affiliate UI changed.

Run: `npm run lint`

Expected: frontend TypeScript check passes.

Run: `npm run build`

Expected: Vite production build passes.

- [ ] **Step 7: Verify migration and route boundary**

Workdir: `backend/`

Run: `ENV_FILE=.env.dev npx prisma migrate status`

Expected: database schema is up to date.

Run: `rg -n "AffiliateAdminPage|/admin/afirieito" src/App.tsx src/pages/admin`

Expected: the existing formal capability gate remains mounted; this task does not switch the route to the legacy CPS workspace.

- [ ] **Step 8: Commit Task 4 only**

```bash
git add README.md docs/database.md docs/ledger.md docs/NEEDO_AFIRIEITO_ADMIN_DEVELOPMENT.md
git commit -m "docs: record affiliate foundation boundary"
```

## Completion Gate

Microstep 1 is complete only when:

- every new table and relation exists in the generated Prisma Client and the local MySQL migration is applied without reset;
- state-machine, schema, permission, existing seed, full backend, and full frontend tests pass;
- backend and frontend lint/build pass;
- no affiliate task/claim/reward data is seeded;
- no API or UI route is activated;
- `git diff --check` is clean and each task commit contains only its declared files.

After this gate passes, stop and request acceptance before writing or executing the task-publication/budget-freeze API plan.
