import { resolveEffectiveCustomerMembershipLevel } from "../src/services/customer-membership.service";

const now = new Date("2026-08-29T00:00:00.000Z");

describe("customer membership entitlement", () => {
  it("keeps self-service membership unchanged", () => {
    expect(
      resolveEffectiveCustomerMembershipLevel(
        {
          membershipLevel: "gold",
          membershipGrantMode: "SELF_SERVICE",
          membershipStartsAt: null,
          membershipExpiresAt: null
        },
        now
      )
    ).toBe("gold");
  });

  it("only exposes an operations grant inside its active period", () => {
    const grant = {
      membershipLevel: "gold",
      membershipGrantMode: "OPERATOR_COMPLIMENTARY",
      membershipStartsAt: new Date("2026-08-01T00:00:00.000Z"),
      membershipExpiresAt: new Date("2026-09-01T00:00:00.000Z")
    };
    expect(resolveEffectiveCustomerMembershipLevel(grant, now)).toBe("gold");
    expect(
      resolveEffectiveCustomerMembershipLevel(
        { ...grant, membershipStartsAt: new Date("2026-09-01T00:00:00.000Z") },
        now
      )
    ).toBe("standard");
    expect(
      resolveEffectiveCustomerMembershipLevel({ ...grant, membershipExpiresAt: now }, now)
    ).toBe("standard");
  });
});
