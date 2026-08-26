import {
  calculateAffiliateUnallocatedBudget,
  transitionAffiliateAttribution,
  transitionAffiliateReward,
  transitionAffiliateTask
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
    releasedNdp: 0
  }
};

describe("affiliate budget", () => {
  it("calculates budget not allocated, captured, or released", () => {
    expect(
      calculateAffiliateUnallocatedBudget({
        totalFrozenNdp: 2_000_000,
        allocatedNdp: 10_000,
        capturedNdp: 20_000,
        releasedNdp: 30_000
      })
    ).toBe(1_940_000);
  });

  it.each([
    {
      totalFrozenNdp: 1_000,
      allocatedNdp: 1_001,
      capturedNdp: 0,
      releasedNdp: 0
    },
    {
      totalFrozenNdp: 1_000,
      allocatedNdp: -1,
      capturedNdp: 0,
      releasedNdp: 0
    },
    {
      totalFrozenNdp: 1_000.5,
      allocatedNdp: 0,
      capturedNdp: 0,
      releasedNdp: 0
    }
  ])("rejects an invalid budget snapshot", (snapshot) => {
    expect(() => calculateAffiliateUnallocatedBudget(snapshot)).toThrow(
      "error.affiliate.invalid_budget_snapshot"
    );
  });
});

describe("affiliate task state machine", () => {
  it("submits a funded draft for review without pretending it is active", () => {
    expect(transitionAffiliateTask("draft", "submit", activeWindow)).toEqual({
      ok: true,
      status: "pending_review"
    });
  });

  it("does not submit a task whose frozen budget cannot fund one reward", () => {
    const insufficient = {
      ...activeWindow,
      budget: { ...activeWindow.budget, totalFrozenNdp: 999 }
    };

    expect(transitionAffiliateTask("draft", "submit", insufficient)).toEqual({
      ok: false,
      reason: "budget_still_exhausted"
    });
  });

  it("approves into scheduled before the start and active after the start", () => {
    expect(
      transitionAffiliateTask("pending_review", "approve", {
        ...activeWindow,
        now: new Date("2026-08-30T00:00:00.000Z")
      })
    ).toEqual({ ok: true, status: "scheduled" });
    expect(transitionAffiliateTask("pending_review", "approve", activeWindow)).toEqual({
      ok: true,
      status: "active"
    });
  });

  it("rejects review and will not approve after the task window", () => {
    expect(transitionAffiliateTask("pending_review", "reject", activeWindow)).toEqual({
      ok: true,
      status: "rejected"
    });
    expect(
      transitionAffiliateTask("pending_review", "approve", {
        ...activeWindow,
        now: activeWindow.endsAt
      })
    ).toEqual({ ok: false, reason: "outside_task_window" });
  });

  it("activates a scheduled task only inside its window", () => {
    expect(transitionAffiliateTask("scheduled", "activate", activeWindow)).toEqual({
      ok: true,
      status: "active"
    });
    expect(
      transitionAffiliateTask("scheduled", "activate", {
        ...activeWindow,
        now: new Date("2026-08-30T00:00:00.000Z")
      })
    ).toEqual({ ok: false, reason: "outside_task_window" });
  });

  it("pauses and resumes to the state implied by the real budget", () => {
    expect(transitionAffiliateTask("active", "pause", activeWindow)).toEqual({
      ok: true,
      status: "paused"
    });
    expect(transitionAffiliateTask("paused", "resume", activeWindow)).toEqual({
      ok: true,
      status: "active"
    });
    expect(
      transitionAffiliateTask("paused", "resume", {
        ...activeWindow,
        budget: { ...activeWindow.budget, allocatedNdp: 2_000_000 }
      })
    ).toEqual({ ok: true, status: "budget_exhausted" });
  });

  it("enters and exits budget exhaustion only from real budget values", () => {
    const exhausted = {
      ...activeWindow,
      budget: { ...activeWindow.budget, allocatedNdp: 2_000_000 }
    };

    expect(transitionAffiliateTask("active", "mark_budget_exhausted", exhausted)).toEqual({
      ok: true,
      status: "budget_exhausted"
    });
    expect(transitionAffiliateTask("active", "mark_budget_exhausted", activeWindow)).toEqual({
      ok: false,
      reason: "budget_not_exhausted"
    });
    expect(transitionAffiliateTask("budget_exhausted", "restore_budget", activeWindow)).toEqual({
      ok: true,
      status: "active"
    });
    expect(transitionAffiliateTask("budget_exhausted", "restore_budget", exhausted)).toEqual({
      ok: false,
      reason: "budget_still_exhausted"
    });
  });

  it.each(["scheduled", "active", "paused", "budget_exhausted"] as const)(
    "ends %s tasks explicitly",
    (status) => {
      expect(transitionAffiliateTask(status, "end", activeWindow)).toEqual({
        ok: true,
        status: "ended"
      });
    }
  );

  it.each([
    "draft",
    "pending_review",
    "scheduled",
    "active",
    "paused",
    "budget_exhausted"
  ] as const)("cancels non-terminal %s tasks", (status) => {
    expect(transitionAffiliateTask(status, "cancel", activeWindow)).toEqual({
      ok: true,
      status: "cancelled"
    });
  });

  it.each(["scheduled", "active", "paused", "budget_exhausted"] as const)(
    "expires %s exactly at taskEndsAt but not one millisecond before",
    (status) => {
      expect(
        transitionAffiliateTask(status, "expire", {
          ...activeWindow,
          now: activeWindow.endsAt
        })
      ).toEqual({ ok: true, status: "ended" });
      expect(
        transitionAffiliateTask(status, "expire", {
          ...activeWindow,
          now: new Date(activeWindow.endsAt.getTime() - 1)
        })
      ).toEqual({ ok: false, reason: "outside_task_window" });
    }
  );

  it.each(["ended", "cancelled", "rejected", "draft", "pending_review"] as const)(
    "keeps terminal or ineligible %s tasks ineligible for expiry",
    (status) => {
      expect(
        transitionAffiliateTask(status, "expire", {
          ...activeWindow,
          now: activeWindow.endsAt
        })
      ).toEqual({ ok: false, reason: "invalid_transition" });
    }
  );

  it("rejects illegal transitions with a stable domain reason", () => {
    expect(transitionAffiliateTask("draft", "approve", activeWindow)).toEqual({
      ok: false,
      reason: "invalid_transition"
    });
  });
});

describe("affiliate attribution state machine", () => {
  it("qualifies before settlement and supports a later reversal", () => {
    expect(transitionAffiliateAttribution("attributed", "settle")).toEqual({
      ok: false,
      reason: "invalid_transition"
    });
    expect(transitionAffiliateAttribution("attributed", "qualify")).toEqual({
      ok: true,
      status: "qualified"
    });
    expect(transitionAffiliateAttribution("qualified", "settle")).toEqual({
      ok: true,
      status: "settled"
    });
    expect(transitionAffiliateAttribution("settled", "reverse")).toEqual({
      ok: true,
      status: "reversed"
    });
  });

  it.each(["attributed", "qualified"] as const)("invalidates %s attribution", (status) => {
    expect(transitionAffiliateAttribution(status, "invalidate")).toEqual({
      ok: true,
      status: "invalidated"
    });
  });

  it("preserves terminal attribution states", () => {
    expect(transitionAffiliateAttribution("invalidated", "qualify")).toEqual({
      ok: false,
      reason: "invalid_transition"
    });
    expect(transitionAffiliateAttribution("reversed", "settle")).toEqual({
      ok: false,
      reason: "invalid_transition"
    });
  });
});

describe("affiliate reward state machine", () => {
  it("settles a pending reward", () => {
    expect(transitionAffiliateReward("pending", "settle")).toEqual({
      ok: true,
      status: "settled"
    });
  });

  it("requires a pending reversal before a reward is fully reversed", () => {
    expect(transitionAffiliateReward("settled", "begin_reversal")).toEqual({
      ok: true,
      status: "reversal_pending"
    });
    expect(transitionAffiliateReward("reversal_pending", "complete_reversal")).toEqual({
      ok: true,
      status: "reversed"
    });
  });

  it("preserves terminal reward states", () => {
    expect(transitionAffiliateReward("reversed", "settle")).toEqual({
      ok: false,
      reason: "invalid_transition"
    });
  });
});
