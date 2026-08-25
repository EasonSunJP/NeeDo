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

export type AffiliateAttributionAction = "qualify" | "settle" | "invalidate" | "reverse";

export type AffiliateRewardStatus = "pending" | "settled" | "reversed" | "reversal_pending";

export type AffiliateRewardAction = "settle" | "begin_reversal" | "complete_reversal";

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
    reason
  }) as const;

const isNonNegativeInteger = (value: number): boolean => Number.isInteger(value) && value >= 0;

export const calculateAffiliateUnallocatedBudget = (snapshot: AffiliateBudgetSnapshot): number => {
  const values = [
    snapshot.totalFrozenNdp,
    snapshot.allocatedNdp,
    snapshot.capturedNdp,
    snapshot.releasedNdp
  ];
  const remaining =
    snapshot.totalFrozenNdp - snapshot.allocatedNdp - snapshot.capturedNdp - snapshot.releasedNdp;

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
  calculateAffiliateUnallocatedBudget(context.budget) >= context.rewardNdpPerCompletedOrder;

export const transitionAffiliateTask = (
  status: AffiliateTaskStatus,
  action: AffiliateTaskAction,
  context: AffiliateTaskTransitionContext
): AffiliateTransitionResult<AffiliateTaskStatus> => {
  if (status === "draft" && action === "submit") {
    return hasOneRewardSlot(context)
      ? { ok: true, status: "pending_review" }
      : invalid("budget_still_exhausted");
  }

  if (status === "pending_review" && action === "reject") {
    return { ok: true, status: "rejected" };
  }

  if (status === "pending_review" && action === "approve") {
    if (context.now >= context.endsAt) {
      return invalid("outside_task_window");
    }
    return {
      ok: true,
      status: context.now < context.startsAt ? "scheduled" : "active"
    };
  }

  if (status === "scheduled" && action === "activate") {
    return isInsideWindow(context)
      ? { ok: true, status: "active" }
      : invalid("outside_task_window");
  }

  if (status === "active" && action === "pause") {
    return { ok: true, status: "paused" };
  }

  if (status === "paused" && action === "resume") {
    if (!isInsideWindow(context)) {
      return invalid("outside_task_window");
    }
    return {
      ok: true,
      status: hasOneRewardSlot(context) ? "active" : "budget_exhausted"
    };
  }

  if (status === "active" && action === "mark_budget_exhausted") {
    return hasOneRewardSlot(context)
      ? invalid("budget_not_exhausted")
      : { ok: true, status: "budget_exhausted" };
  }

  if (status === "budget_exhausted" && action === "restore_budget") {
    if (!isInsideWindow(context)) {
      return invalid("outside_task_window");
    }
    return hasOneRewardSlot(context)
      ? { ok: true, status: "active" }
      : invalid("budget_still_exhausted");
  }

  if (["scheduled", "active", "paused", "budget_exhausted"].includes(status) && action === "end") {
    return { ok: true, status: "ended" };
  }

  if (
    ["draft", "pending_review", "scheduled", "active", "paused", "budget_exhausted"].includes(
      status
    ) &&
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
  action: AffiliateAttributionAction
): AffiliateTransitionResult<AffiliateAttributionStatus> => {
  if (status === "attributed" && action === "qualify") {
    return { ok: true, status: "qualified" };
  }
  if (status === "qualified" && action === "settle") {
    return { ok: true, status: "settled" };
  }
  if (["attributed", "qualified"].includes(status) && action === "invalidate") {
    return { ok: true, status: "invalidated" };
  }
  if (status === "settled" && action === "reverse") {
    return { ok: true, status: "reversed" };
  }
  return invalid("invalid_transition");
};

export const transitionAffiliateReward = (
  status: AffiliateRewardStatus,
  action: AffiliateRewardAction
): AffiliateTransitionResult<AffiliateRewardStatus> => {
  if (status === "pending" && action === "settle") {
    return { ok: true, status: "settled" };
  }
  if (status === "settled" && action === "begin_reversal") {
    return { ok: true, status: "reversal_pending" };
  }
  if (status === "reversal_pending" && action === "complete_reversal") {
    return { ok: true, status: "reversed" };
  }
  return invalid("invalid_transition");
};
