import { SaasBillingPolicyService } from "../src/services/saas-billing-policy.service";

describe("SaasBillingPolicyService", () => {
  const policy = new SaasBillingPolicyService();

  it.each([0, 1])(
    "keeps %i active technicians in the free single-shop type",
    (activeTechnicians) => {
      expect(policy.classifyShop(activeTechnicians)).toEqual({
        type: "single_shop",
        billable: false
      });
    }
  );

  it("makes a shop billable when the second active technician joins", () => {
    expect(policy.classifyShop(2)).toEqual({
      type: "shop",
      billable: true
    });
  });

  it("starts the only trial when a shop first reaches two active technicians", () => {
    expect(
      policy.planShopTrialTransition(
        {
          activeTechnicians: 2,
          trialStatus: "not_started",
          trialUsedAt: null,
          trialEndsAt: null
        },
        new Date("2026-08-20T00:00:00+09:00")
      )
    ).toEqual({
      action: "start",
      trial: {
        startsAt: new Date("2026-08-19T15:00:00.000Z"),
        endsAt: new Date("2026-11-30T15:00:00.000Z"),
        paidFrom: new Date("2026-11-30T15:00:00.000Z"),
        automaticBonusDays: 15
      }
    });
  });

  it("interrupts an active trial when a shop falls back to one technician", () => {
    expect(
      policy.planShopTrialTransition(
        {
          activeTechnicians: 1,
          trialStatus: "active",
          trialUsedAt: new Date("2026-08-01T00:00:00+09:00"),
          trialEndsAt: new Date("2026-11-01T00:00:00+09:00")
        },
        new Date("2026-09-10T12:00:00+09:00")
      )
    ).toEqual({ action: "interrupt", at: new Date("2026-09-10T12:00:00+09:00") });
  });

  it("does not restart a used or interrupted shop trial", () => {
    expect(
      policy.planShopTrialTransition(
        {
          activeTechnicians: 2,
          trialStatus: "interrupted",
          trialUsedAt: new Date("2026-08-01T00:00:00+09:00"),
          trialEndsAt: new Date("2026-09-01T00:00:00+09:00")
        },
        new Date("2026-10-01T00:00:00+09:00")
      )
    ).toEqual({ action: "none" });
  });

  it("completes an elapsed trial before evaluating a technician drop", () => {
    expect(
      policy.planShopTrialTransition(
        {
          activeTechnicians: 1,
          trialStatus: "active",
          trialUsedAt: new Date("2026-08-01T00:00:00+09:00"),
          trialEndsAt: new Date("2026-11-01T00:00:00+09:00")
        },
        new Date("2026-11-01T00:00:00+09:00")
      )
    ).toEqual({ action: "complete", at: new Date("2026-11-01T00:00:00+09:00") });
  });

  it("counts the start month when at least fifteen calendar days remain", () => {
    const result = policy.calculateInitialTrial(new Date("2026-08-10T00:00:00+09:00"));

    expect(result).toEqual({
      startsAt: new Date("2026-08-09T15:00:00.000Z"),
      endsAt: new Date("2026-10-31T15:00:00.000Z"),
      paidFrom: new Date("2026-10-31T15:00:00.000Z"),
      automaticBonusDays: 0
    });
  });

  it("adds a non-counting fifteen-day bonus when fewer than fifteen days remain", () => {
    const result = policy.calculateInitialTrial(new Date("2026-08-20T00:00:00+09:00"));

    expect(result).toEqual({
      startsAt: new Date("2026-08-19T15:00:00.000Z"),
      endsAt: new Date("2026-11-30T15:00:00.000Z"),
      paidFrom: new Date("2026-11-30T15:00:00.000Z"),
      automaticBonusDays: 15
    });
  });

  it("separates the late-month allowance from the initial trial audit period", () => {
    const trial = policy.calculateInitialTrial(new Date("2026-08-20T00:00:00+09:00"));

    expect(policy.buildInitialTrialFreePeriods(trial)).toEqual([
      {
        periodType: "initial_trial",
        startsAt: new Date("2026-08-19T15:00:00.000Z"),
        endsAt: new Date("2026-10-31T15:00:00.000Z")
      },
      {
        periodType: "late_month_bonus",
        startsAt: new Date("2026-10-31T15:00:00.000Z"),
        endsAt: new Date("2026-11-30T15:00:00.000Z")
      }
    ]);
  });

  it("treats exactly fifteen remaining days as the first trial month", () => {
    expect(policy.calculateInitialTrial(new Date("2026-08-17T12:30:00+09:00")).paidFrom).toEqual(
      new Date("2026-10-31T15:00:00.000Z")
    );
  });

  it("never restarts an interrupted trial", () => {
    expect(
      policy.resolveState(
        {
          subjectType: "shop",
          activeTechnicians: 2,
          billingCadence: "monthly",
          trialStatus: "interrupted",
          trialEndsAt: new Date("2026-12-01T00:00:00+09:00"),
          paidThrough: null
        },
        new Date("2026-09-01T00:00:00+09:00")
      )
    ).toBe("overdue");
  });

  it("keeps a one-person shop free regardless of its previous trial state", () => {
    expect(
      policy.resolveState(
        {
          subjectType: "shop",
          activeTechnicians: 1,
          billingCadence: "monthly",
          trialStatus: "interrupted",
          trialEndsAt: null,
          paidThrough: null
        },
        new Date("2026-09-01T00:00:00+09:00")
      )
    ).toBe("free");
  });

  it("keeps an active uninterrupted trial until its paid-from boundary", () => {
    expect(
      policy.resolveState(
        {
          subjectType: "merchant_group",
          billingCadence: "monthly",
          trialStatus: "active",
          trialEndsAt: new Date("2026-12-01T00:00:00+09:00"),
          paidThrough: null
        },
        new Date("2026-11-30T23:59:59+09:00")
      )
    ).toBe("trial");
  });

  it("marks a billable subject overdue at the unpaid boundary", () => {
    expect(
      policy.resolveState(
        {
          subjectType: "merchant_group",
          billingCadence: "monthly",
          trialStatus: "completed",
          trialEndsAt: new Date("2026-12-01T00:00:00+09:00"),
          paidThrough: null
        },
        new Date("2026-12-01T00:00:00+09:00")
      )
    ).toBe("overdue");
  });

  it("recognizes prepaid service through the exclusive paid-through boundary", () => {
    expect(
      policy.resolveState(
        {
          subjectType: "merchant_group",
          billingCadence: "annual",
          trialStatus: "completed",
          trialEndsAt: null,
          paidThrough: new Date("2027-01-01T00:00:00+09:00")
        },
        new Date("2026-12-31T23:59:59+09:00")
      )
    ).toBe("paid");
  });

  it("adds one, two, or three natural months through shortcuts", () => {
    const currentEndsAt = new Date("2026-11-30T15:00:00.000Z");

    expect(
      policy.calculateExtension({ currentEndsAt, extensionCount: 0, quickMonths: 1 })
    ).toMatchObject({
      extensionCount: 1,
      endsAt: new Date("2026-12-31T15:00:00.000Z"),
      addedMonths: 1,
      addedDays: 0
    });
    expect(
      policy.calculateExtension({ currentEndsAt, extensionCount: 1, quickMonths: 3 })
    ).toMatchObject({
      extensionCount: 2,
      endsAt: new Date("2027-02-28T15:00:00.000Z"),
      addedMonths: 3,
      addedDays: 0
    });
  });

  it("calculates a custom paid-from date in natural months and days", () => {
    expect(
      policy.calculateExtension({
        currentEndsAt: new Date("2026-11-30T15:00:00.000Z"),
        extensionCount: 2,
        paidFrom: new Date("2027-02-14T15:00:00.000Z")
      })
    ).toEqual({
      extensionCount: 3,
      endsAt: new Date("2027-02-14T15:00:00.000Z"),
      paidFrom: new Date("2027-02-14T15:00:00.000Z"),
      addedMonths: 2,
      addedDays: 14
    });
  });

  it("rejects a fourth manual extension", () => {
    expect(() =>
      policy.calculateExtension({
        currentEndsAt: new Date("2026-11-30T15:00:00.000Z"),
        extensionCount: 3,
        quickMonths: 1
      })
    ).toThrow("error.saas_billing.trial_extension_limit");
  });

  it("rejects a paid-from date that does not extend the trial", () => {
    expect(() =>
      policy.calculateExtension({
        currentEndsAt: new Date("2026-11-30T15:00:00.000Z"),
        extensionCount: 0,
        paidFrom: new Date("2026-11-30T15:00:00.000Z")
      })
    ).toThrow("error.saas_billing.invalid_paid_from");
  });

  it("charges ten monthly fees for twelve annual months", () => {
    expect(policy.calculateAnnualFee(9800)).toBe(98000);
  });

  it("calculates monthly and annual natural-month coverage", () => {
    const startsAt = new Date("2026-10-31T15:00:00.000Z");

    expect(policy.calculateBillingCoverage("monthly", startsAt, 9800)).toEqual({
      startsAt,
      endsAt: new Date("2026-11-30T15:00:00.000Z"),
      amountJpy: 9800
    });
    expect(policy.calculateBillingCoverage("annual", startsAt, 9800)).toEqual({
      startsAt,
      endsAt: new Date("2027-10-31T15:00:00.000Z"),
      amountJpy: 98000
    });
  });

  it("opens invoice generation through the next Tokyo natural-month boundary", () => {
    expect(policy.calculateInvoiceGenerationHorizon(new Date("2026-08-25T21:30:00+09:00"))).toEqual(
      new Date("2026-08-31T15:00:00.000Z")
    );
  });

  it("formats summed authoritative free periods as years, months, and days", () => {
    expect(
      policy.formatFreeDuration([
        {
          startsAt: new Date("2026-01-01T00:00:00+09:00"),
          endsAt: new Date("2026-04-01T00:00:00+09:00")
        },
        {
          startsAt: new Date("2026-04-01T00:00:00+09:00"),
          endsAt: new Date("2026-04-16T00:00:00+09:00")
        }
      ])
    ).toEqual({ years: 0, months: 3, days: 15, totalDays: 105 });
  });
});
