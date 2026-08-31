import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import { BackofficeService } from "../src/services/backoffice.service";

const now = new Date("2026-09-01T12:00:00.000Z");
const actor: AuthenticatedAccessContext = {
  userId: 9,
  email: "admin@example.com",
  accessTokenJti: "jti",
  accessTokenExpiresAt: Math.floor(now.getTime() / 1_000) + 900,
  currentIdentityType: "operations",
  currentIdentityScopeType: "global",
  currentIdentityScopeId: null,
  roles: ["operations_admin"],
  permissions: ["backoffice:customers:write"]
};

describe("BackofficeService formal customer membership bridge", () => {
  it("uses the formal entitlement service instead of mutating CustomerProfile membership fields", async () => {
    const repository = {
      findCustomerMembershipGrantContext: jest.fn(async () => ({
        customerUserId: 42,
        membershipGrantedBy: {
          needoId: "o0000000001",
          username: "NeeDo Admin"
        }
      }))
    };
    const platformMembershipService = {
      changeEntitlement: jest.fn(async () => ({
        kind: "grant" as const,
        tierCode: "gold" as const,
        tierVersionPublicId: "tier-gold-v1",
        entitlementPublicId: "entitlement-gold-1",
        startsAt: now,
        expiresAt: new Date("2026-10-01T12:00:00.000Z"),
        experienceValueNdp: 1_999,
        idempotent: false
      }))
    };
    const service = new BackofficeService(
      repository as never,
      {} as never,
      {} as never,
      () => now,
      undefined,
      platformMembershipService
    );

    await expect(service.assignPlatformCustomerMembership(
      44,
      {
        membershipLevel: "gold",
        grantMode: "operator_complimentary",
        durationUnit: "month",
        durationValue: 1,
        startsAt: now.toISOString()
      },
      actor,
      { ip: "127.0.0.1" }
    )).resolves.toEqual({
      membershipLevel: "gold",
      membershipGrantMode: "operator_complimentary",
      membershipDurationUnit: "month",
      membershipDurationValue: 1,
      membershipStartsAt: now.toISOString(),
      membershipExpiresAt: "2026-10-01T12:00:00.000Z",
      membershipGrantedBy: {
        needoId: "o0000000001",
        username: "NeeDo Admin"
      }
    });
    expect(platformMembershipService.changeEntitlement).toHaveBeenCalledWith(
      actor,
      { ip: "127.0.0.1" },
      42,
      {
        kind: "grant",
        targetTierCode: "gold",
        billingCycle: "monthly",
        source: "operations",
        sourceReference: "backoffice:customer:44:membership:gold:2026-09-01T12:00:00.000Z",
        expectedCurrentLockVersion: null
      }
    );
  });

  it("maps a twelve-month legacy request to annual coverage valued by the tier version", async () => {
    const repository = {
      findCustomerMembershipGrantContext: jest.fn(async () => ({
        customerUserId: 42,
        membershipGrantedBy: { needoId: "o0000000001", username: "NeeDo Admin" }
      }))
    };
    const platformMembershipService = {
      changeEntitlement: jest.fn(async () => ({
        kind: "grant" as const,
        tierCode: "black_diamond" as const,
        tierVersionPublicId: "tier-black-v1",
        entitlementPublicId: "entitlement-black-1",
        startsAt: now,
        expiresAt: new Date("2027-09-01T12:00:00.000Z"),
        experienceValueNdp: 49_990,
        idempotent: false
      }))
    };
    const service = new BackofficeService(
      repository as never,
      {} as never,
      {} as never,
      () => now,
      undefined,
      platformMembershipService
    );

    await service.assignPlatformCustomerMembership(
      44,
      {
        membershipLevel: "black_diamond",
        grantMode: "operator_complimentary",
        durationUnit: "month",
        durationValue: 12,
        startsAt: now.toISOString()
      },
      actor,
      { ip: "127.0.0.1" }
    );

    expect(platformMembershipService.changeEntitlement).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      42,
      expect.objectContaining({ billingCycle: "annual" })
    );
  });
});
