import {
  planPlatformMembershipEntitlementChange,
  type PlatformMembershipEntitlementPlanningCurrent,
  type PlatformMembershipEntitlementPlanningTier
} from "../src/domain/platform-membership-entitlement";

const now = new Date("2026-09-01T12:00:00.000Z");
const tier = (
  tierCode: PlatformMembershipEntitlementPlanningTier["tierCode"],
  monthlyValueNdp: number
): PlatformMembershipEntitlementPlanningTier => ({
  tierCode,
  tierVersionId: monthlyValueNdp,
  tierVersionPublicId: `tier-${tierCode}`,
  monthlyValueNdp,
  annualBillingMonths: 10,
  durationDays: tierCode === "free" ? null : 30
});
const current = (
  tierCode: PlatformMembershipEntitlementPlanningCurrent["tierCode"],
  monthlyValueNdp: number,
  expiresAt = new Date("2026-10-01T12:00:00.000Z")
): PlatformMembershipEntitlementPlanningCurrent => ({
  entitlementId: 71,
  entitlementPublicId: "entitlement-current",
  tierCode,
  monthlyValueNdp,
  startsAt: new Date("2026-09-01T12:00:00.000Z"),
  expiresAt,
  lockVersion: 3
});

describe("platform membership entitlement transition planning", () => {
  it("values an annual black-diamond grant at ten monthly fees and lasts twelve months", () => {
    expect(planPlatformMembershipEntitlementChange({
      occurredAt: now,
      current: null,
      target: tier("black_diamond", 4_999),
      command: { kind: "grant", billingCycle: "annual", expectedCurrentLockVersion: null }
    })).toMatchObject({
      experienceValueNdp: 49_990,
      billingMonths: 12,
      create: {
        startsAt: now,
        expiresAt: new Date("2027-09-01T12:00:00.000Z")
      }
    });
  });

  it("schedules renewal after the current period instead of overlapping it", () => {
    expect(planPlatformMembershipEntitlementChange({
      occurredAt: now,
      current: current("silver", 300),
      target: tier("silver", 300),
      command: { kind: "renew", billingCycle: "monthly", expectedCurrentLockVersion: 3 }
    })).toMatchObject({
      experienceValueNdp: 300,
      currentUpdate: { expectedLockVersion: 3, supersededAt: null },
      create: {
        startsAt: new Date("2026-10-01T12:00:00.000Z"),
        expiresAt: new Date("2026-10-31T12:00:00.000Z")
      }
    });
  });

  it("values an immediate gold-to-black upgrade only at the monthly difference", () => {
    expect(planPlatformMembershipEntitlementChange({
      occurredAt: now,
      current: current("gold", 1_999),
      target: tier("black_diamond", 4_999),
      command: { kind: "upgrade", billingCycle: "monthly", expectedCurrentLockVersion: 3 }
    })).toMatchObject({
      experienceValueNdp: 3_000,
      currentUpdate: { supersededAt: now },
      create: {
        startsAt: now,
        expiresAt: new Date("2026-10-01T12:00:00.000Z")
      }
    });
  });

  it("schedules a paid downgrade at the current expiry with no membership-value EXP", () => {
    expect(planPlatformMembershipEntitlementChange({
      occurredAt: now,
      current: current("black_diamond", 4_999),
      target: tier("gold", 1_999),
      command: { kind: "schedule_downgrade", billingCycle: "monthly", expectedCurrentLockVersion: 3 }
    })).toMatchObject({
      experienceValueNdp: 0,
      create: { startsAt: new Date("2026-10-01T12:00:00.000Z") }
    });
  });

  it("expires paid membership into the free fallback without creating a free entitlement", () => {
    expect(planPlatformMembershipEntitlementChange({
      occurredAt: now,
      current: current("gold", 1_999),
      target: tier("free", 0),
      command: { kind: "expire", expectedCurrentLockVersion: 3 }
    })).toMatchObject({
      experienceValueNdp: 0,
      currentUpdate: { supersededAt: now, expiresAt: now },
      create: null
    });
  });
});
