import { evaluateTechnicianAutomationRules } from "../src/domain/technician-automation-rules";
import { defaultTechnicianAutomationRules } from "../src/validators/technician-automation.validator";

const context = () => ({
  now: new Date("2026-09-09T00:00:00.000Z"),
  startsAt: new Date("2026-09-09T03:00:00.000Z"),
  endsAt: new Date("2026-09-09T04:00:00.000Z"),
  actualScheduleAvailable: true,
  hasBufferedConflict: false,
  hardBlockReasons: [] as string[],
  areaCode: "JP-13/minato",
  distanceKm: 3,
  grossAmountJpy: 12_000,
  netAmountJpy: 9_000,
  prepaidServiceAmountJpy: 0,
  prepaymentBaseAmountJpy: 12_000,
  prepaymentConfirmed: false,
  customerRating: 4.8,
  customerCompletedOrders: 8,
  customerHistoricalOrders: 10,
  customerCancellationRatePercent: 10,
  customerEkycVerified: true,
  customerIsContact: true,
  referralContactIdentityId: 44 as number | null,
  completedOrdersWithTechnician: 2,
  partyType: "single" as const,
  serviceMode: "home" as const,
  paymentMethod: "card" as const,
  serviceId: 101,
  technicianOnline: true,
  tagsMatch: true
});

describe("evaluateTechnicianAutomationRules", () => {
  it("matches only when every enabled condition and platform hard rule passes", () => {
    const rules = {
      ...defaultTechnicianAutomationRules("booking"),
      timeWindows: [{ weekday: 3, startMinute: 600, endMinute: 900 }],
      areaCodes: ["JP-13/minato"],
      minOrderAmountJpy: 10_000,
      minCustomerRating: 4.5,
      minCompletedOrders: 5 as const,
      requireEkyc: true,
      maxCancellationRatePercent: 20,
      source: { mode: "existing_contacts" as const, contactIdentityIds: [] },
      customerType: "returning" as const,
      paymentMethods: ["card" as const],
      serviceIds: [101]
    };
    expect(evaluateTechnicianAutomationRules("booking", rules, context())).toMatchObject({ matched: true, failedReasons: [] });
    expect(evaluateTechnicianAutomationRules("booking", rules, { ...context(), hardBlockReasons: ["risk_blocked"] })).toMatchObject({
      matched: false,
      failedReasons: ["platform:risk_blocked"]
    });
  });

  it("fails safe when distance or tag evidence needed by an enabled rule is unavailable", () => {
    const requestRules = defaultTechnicianAutomationRules("request");
    expect(evaluateTechnicianAutomationRules("request", requestRules, {
      ...context(),
      distanceKm: null,
      tagsMatch: null
    }).failedReasons).toEqual(expect.arrayContaining(["distance:unavailable", "tags:unavailable"]));
  });

  it("keeps a non-matching Booking eligible for manual handling rather than returning a reject action", () => {
    const result = evaluateTechnicianAutomationRules("booking", {
      ...defaultTechnicianAutomationRules("booking"),
      acceptNewCustomers: false
    }, {
      ...context(),
      customerCompletedOrders: 0,
      completedOrdersWithTechnician: 0
    });
    expect(result).toMatchObject({ matched: false, action: "manual" });
    expect(result.failedReasons).toContain("customer:new_not_allowed");
  });

  it("never auto-accepts Booking or auto-applies Request while the technician is off duty", () => {
    expect(evaluateTechnicianAutomationRules("booking", defaultTechnicianAutomationRules("booking"), {
      ...context(),
      technicianOnline: false
    }).failedReasons).toContain("online:offline");
    expect(evaluateTechnicianAutomationRules("request", {
      ...defaultTechnicianAutomationRules("request"),
      onlyOnline: false
    }, {
      ...context(),
      technicianOnline: false
    }).failedReasons).toContain("online:offline");
  });

  it("applies Request online/start-window and specific-referrer rules without treating apply as a deal", () => {
    const rules = {
      ...defaultTechnicianAutomationRules("request"),
      source: { mode: "specific_contact_referrals" as const, contactIdentityIds: [44] }
    };
    expect(evaluateTechnicianAutomationRules("request", rules, context())).toMatchObject({ matched: true, action: "apply" });
    expect(evaluateTechnicianAutomationRules("request", rules, { ...context(), technicianOnline: false }).failedReasons)
      .toContain("online:offline");
    expect(evaluateTechnicianAutomationRules("request", rules, { ...context(), referralContactIdentityId: 99 }).failedReasons)
      .toContain("source:specific_referral_required");
  });

  it("requires confirmed service prepayment at or above the integer threshold", () => {
    const rules = {
      ...defaultTechnicianAutomationRules("booking"),
      minimumPrepaymentPercent: 30
    };
    expect(evaluateTechnicianAutomationRules("booking", rules, {
      ...context(),
      prepaymentBaseAmountJpy: 10_001,
      prepaidServiceAmountJpy: 3_001,
      prepaymentConfirmed: true
    })).toMatchObject({
      matched: true,
      matchedConditions: expect.arrayContaining(["payment:prepayment_minimum"])
    });
    expect(evaluateTechnicianAutomationRules("booking", rules, {
      ...context(),
      prepaymentBaseAmountJpy: 10_001,
      prepaidServiceAmountJpy: 3_000,
      prepaymentConfirmed: true
    }).failedReasons).toContain("payment:prepayment_too_low");
    expect(evaluateTechnicianAutomationRules("booking", rules, {
      ...context(),
      prepaymentBaseAmountJpy: 10_001,
      prepaidServiceAmountJpy: 3_001,
      prepaymentConfirmed: false
    }).failedReasons).toContain("payment:prepayment_unconfirmed");
  });

  it("treats a zero threshold as disabled", () => {
    const result = evaluateTechnicianAutomationRules(
      "booking",
      defaultTechnicianAutomationRules("booking"),
      context()
    );
    expect(result.failedReasons).not.toEqual(expect.arrayContaining([
      "payment:prepayment_unconfirmed",
      "payment:prepayment_too_low"
    ]));
  });
});
