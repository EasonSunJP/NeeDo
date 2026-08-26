export type BillingSubjectType = "merchant_group" | "shop";
export type BillingCadence = "monthly" | "annual" | "free";
export type TrialStatus = "not_started" | "active" | "completed" | "interrupted" | "not_applicable";
export type BillingState = "trial" | "paid" | "free" | "overdue";
export type ShopAccountType = "single_shop" | "shop";

export interface InitialTrialResult {
  startsAt: Date;
  endsAt: Date;
  paidFrom: Date;
  automaticBonusDays: number;
}

export interface BillingProfileSnapshot {
  subjectType: BillingSubjectType;
  activeTechnicians?: number;
  billingCadence: BillingCadence;
  trialStatus: TrialStatus;
  trialEndsAt: Date | null;
  paidThrough: Date | null;
}

export interface TrialExtensionInput {
  currentEndsAt: Date;
  extensionCount: number;
  quickMonths?: 1 | 2 | 3;
  paidFrom?: Date;
}

export interface TrialExtensionResult {
  extensionCount: number;
  endsAt: Date;
  paidFrom: Date;
  addedMonths: number;
  addedDays: number;
}

export interface FreePeriodInput {
  startsAt: Date;
  endsAt: Date;
}

export interface ShopTrialTransitionSnapshot {
  activeTechnicians: number;
  trialStatus: TrialStatus;
  trialUsedAt: Date | null;
  trialEndsAt: Date | null;
}

export type ShopTrialTransition =
  | { action: "none" }
  | { action: "start"; trial: InitialTrialResult }
  | { action: "interrupt" | "complete"; at: Date };

export interface BillingCoverage {
  startsAt: Date;
  endsAt: Date;
  amountJpy: number;
}

export interface InitialTrialFreePeriod {
  periodType: "initial_trial" | "late_month_bonus";
  startsAt: Date;
  endsAt: Date;
}

export interface FreeDuration {
  years: number;
  months: number;
  days: number;
  totalDays: number;
}

type CivilDate = {
  year: number;
  month: number;
  day: number;
};

const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const toTokyoCivilDate = (value: Date): CivilDate => {
  const shifted = new Date(value.getTime() + TOKYO_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate()
  };
};

const fromTokyoCivilDate = ({ year, month, day }: CivilDate): Date =>
  new Date(Date.UTC(year, month - 1, day) - TOKYO_OFFSET_MS);

const daysInCivilMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

const normalizeCivilMonth = (year: number, month: number): { year: number; month: number } => {
  const zeroBased = month - 1;
  const normalizedYear = year + Math.floor(zeroBased / 12);
  const normalizedZeroBased = ((zeroBased % 12) + 12) % 12;
  return { year: normalizedYear, month: normalizedZeroBased + 1 };
};

const addCivilMonths = (value: CivilDate, months: number): CivilDate => {
  const normalized = normalizeCivilMonth(value.year, value.month + months);
  return {
    ...normalized,
    day: Math.min(value.day, daysInCivilMonth(normalized.year, normalized.month))
  };
};

const civilEpochDay = (value: CivilDate): number =>
  Math.floor(Date.UTC(value.year, value.month - 1, value.day) / MILLISECONDS_PER_DAY);

const compareCivilDate = (left: CivilDate, right: CivilDate): number =>
  civilEpochDay(left) - civilEpochDay(right);

const calendarDifference = (
  startsAt: CivilDate,
  endsAt: CivilDate
): { months: number; days: number } => {
  let months = (endsAt.year - startsAt.year) * 12 + endsAt.month - startsAt.month;
  let monthBoundary = addCivilMonths(startsAt, months);

  if (compareCivilDate(monthBoundary, endsAt) > 0) {
    months -= 1;
    monthBoundary = addCivilMonths(startsAt, months);
  }

  return {
    months,
    days: civilEpochDay(endsAt) - civilEpochDay(monthBoundary)
  };
};

export class SaasBillingPolicyService {
  public classifyShop(activeTechnicians: number): {
    type: ShopAccountType;
    billable: boolean;
  } {
    if (!Number.isInteger(activeTechnicians) || activeTechnicians < 0) {
      throw new Error("error.saas_billing.invalid_technician_count");
    }

    return activeTechnicians >= 2
      ? { type: "shop", billable: true }
      : { type: "single_shop", billable: false };
  }

  public calculateInitialTrial(startedAt: Date): InitialTrialResult {
    const startedCivil = toTokyoCivilDate(startedAt);
    const startsAt = fromTokyoCivilDate(startedCivil);
    const remainingDays =
      daysInCivilMonth(startedCivil.year, startedCivil.month) - startedCivil.day + 1;
    const automaticBonusDays = remainingDays < 15 ? remainingDays : 0;
    const paidMonthOffset = automaticBonusDays > 0 ? 4 : 3;
    const paidMonth = normalizeCivilMonth(startedCivil.year, startedCivil.month + paidMonthOffset);
    const paidFrom = fromTokyoCivilDate({ ...paidMonth, day: 1 });

    return {
      startsAt,
      endsAt: paidFrom,
      paidFrom,
      automaticBonusDays
    };
  }

  public planShopTrialTransition(
    snapshot: ShopTrialTransitionSnapshot,
    now: Date
  ): ShopTrialTransition {
    const classification = this.classifyShop(snapshot.activeTechnicians);

    if (
      snapshot.trialStatus === "active" &&
      snapshot.trialEndsAt !== null &&
      snapshot.trialEndsAt.getTime() <= now.getTime()
    ) {
      return { action: "complete", at: snapshot.trialEndsAt };
    }
    if (snapshot.trialStatus === "active" && classification.billable === false) {
      return { action: "interrupt", at: now };
    }
    if (
      classification.billable &&
      snapshot.trialStatus === "not_started" &&
      snapshot.trialUsedAt === null
    ) {
      return { action: "start", trial: this.calculateInitialTrial(now) };
    }
    return { action: "none" };
  }

  public buildInitialTrialFreePeriods(trial: InitialTrialResult): InitialTrialFreePeriod[] {
    if (trial.automaticBonusDays === 0) {
      return [{ periodType: "initial_trial", startsAt: trial.startsAt, endsAt: trial.endsAt }];
    }
    const startsCivil = toTokyoCivilDate(trial.startsAt);
    const nextMonth = normalizeCivilMonth(startsCivil.year, startsCivil.month + 1);
    const initialTrialStartsAt = fromTokyoCivilDate({ ...nextMonth, day: 1 });
    return [
      { periodType: "late_month_bonus", startsAt: trial.startsAt, endsAt: initialTrialStartsAt },
      { periodType: "initial_trial", startsAt: initialTrialStartsAt, endsAt: trial.endsAt }
    ];
  }

  public calculateExtension(input: TrialExtensionInput): TrialExtensionResult {
    if (!Number.isInteger(input.extensionCount) || input.extensionCount < 0) {
      throw new Error("error.saas_billing.invalid_trial_extension_count");
    }
    if (input.extensionCount >= 3) {
      throw new Error("error.saas_billing.trial_extension_limit");
    }
    if ((input.quickMonths === undefined) === (input.paidFrom === undefined)) {
      throw new Error("error.saas_billing.invalid_trial_extension");
    }

    const currentCivil = toTokyoCivilDate(input.currentEndsAt);
    let paidCivil: CivilDate;

    if (input.quickMonths !== undefined) {
      if (![1, 2, 3].includes(input.quickMonths)) {
        throw new Error("error.saas_billing.invalid_trial_extension");
      }
      paidCivil = addCivilMonths(currentCivil, input.quickMonths);
    } else {
      paidCivil = toTokyoCivilDate(input.paidFrom!);
      if (compareCivilDate(paidCivil, currentCivil) <= 0) {
        throw new Error("error.saas_billing.invalid_paid_from");
      }
    }

    const paidFrom = fromTokyoCivilDate(paidCivil);
    const difference = calendarDifference(currentCivil, paidCivil);

    return {
      extensionCount: input.extensionCount + 1,
      endsAt: paidFrom,
      paidFrom,
      addedMonths: difference.months,
      addedDays: difference.days
    };
  }

  public calculateAnnualFee(monthlyFeeJpy: number): number {
    if (!Number.isInteger(monthlyFeeJpy) || monthlyFeeJpy < 0) {
      throw new Error("error.saas_billing.invalid_monthly_fee");
    }
    return monthlyFeeJpy * 10;
  }

  public calculateBillingCoverage(
    cadence: Exclude<BillingCadence, "free">,
    startsAt: Date,
    monthlyFeeJpy: number
  ): BillingCoverage {
    if (!Number.isInteger(monthlyFeeJpy) || monthlyFeeJpy < 0) {
      throw new Error("error.saas_billing.invalid_monthly_fee");
    }
    const startCivil = toTokyoCivilDate(startsAt);
    const months = cadence === "annual" ? 12 : 1;
    const endsAt = fromTokyoCivilDate(addCivilMonths(startCivil, months));

    return {
      startsAt: fromTokyoCivilDate(startCivil),
      endsAt,
      amountJpy: cadence === "annual" ? this.calculateAnnualFee(monthlyFeeJpy) : monthlyFeeJpy
    };
  }

  public calculateInvoiceGenerationHorizon(now: Date): Date {
    const current = toTokyoCivilDate(now);
    const nextMonth = normalizeCivilMonth(current.year, current.month + 1);
    return fromTokyoCivilDate({ ...nextMonth, day: 1 });
  }

  public resolveState(profile: BillingProfileSnapshot, now: Date): BillingState {
    if (
      profile.subjectType === "shop" &&
      this.classifyShop(profile.activeTechnicians ?? 0).billable === false
    ) {
      return "free";
    }
    if (profile.billingCadence === "free") {
      return "free";
    }
    if (
      profile.trialStatus === "active" &&
      profile.trialEndsAt !== null &&
      profile.trialEndsAt.getTime() > now.getTime()
    ) {
      return "trial";
    }
    if (profile.paidThrough !== null && profile.paidThrough.getTime() > now.getTime()) {
      return "paid";
    }
    return "overdue";
  }

  public formatFreeDuration(periods: FreePeriodInput[]): FreeDuration {
    let totalMonths = 0;
    let days = 0;
    let totalDays = 0;

    for (const period of periods) {
      const startsAt = toTokyoCivilDate(period.startsAt);
      const endsAt = toTokyoCivilDate(period.endsAt);
      if (compareCivilDate(endsAt, startsAt) < 0) {
        throw new Error("error.saas_billing.invalid_free_period");
      }
      const difference = calendarDifference(startsAt, endsAt);
      totalMonths += difference.months;
      days += difference.days;
      totalDays += civilEpochDay(endsAt) - civilEpochDay(startsAt);
    }

    return {
      years: Math.floor(totalMonths / 12),
      months: totalMonths % 12,
      days,
      totalDays
    };
  }
}
