import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import { ExchangeService } from "../src/services/exchange.service";

const now = new Date("2026-09-01T10:00:00.000Z");
const access: AuthenticatedAccessContext = {
  userId: 41,
  email: "customer@example.com",
  accessTokenJti: "access-41",
  accessTokenExpiresAt: 1_800_000_000,
  currentIdentityId: 410,
  currentIdentityType: "customer",
  currentIdentityScopeType: "customer_profile",
  currentIdentityScopeId: 91,
  currentPublicId: "u0000000041",
  roles: ["customer"],
  permissions: ["exchange:posts:create-demand"]
};

const legacyBlackActor = {
  userId: 41,
  identityId: 410,
  identityType: "customer",
  scopeType: "customer_profile",
  scopeId: 91,
  publicId: "u0000000041",
  displayName: "Customer",
  avatarUrl: null,
  isTestAccount: false,
  customerMembership: {
    profileId: 91,
    membershipLevel: "black",
    membershipGrantMode: "permanent",
    membershipStartsAt: null,
    membershipExpiresAt: null
  },
  shopScope: null
};

describe("Exchange current platform membership capacity", () => {
  it("falls back to free capacity immediately after the formal paid entitlement expires", async () => {
    const repository = { resolveActor: jest.fn(async () => legacyBlackActor) };
    const fee = {
      resolveCurrent: jest.fn(async () => ({ amountNdp: 1_000, ruleSetVersion: 3 }))
    };
    const membership = {
      resolveMembershipAt: jest.fn(async () => ({ tierCode: "free" as const }))
    };
    const service = new ExchangeService(
      repository as never,
      () => now,
      undefined,
      fee as never,
      undefined,
      undefined,
      membership as never
    );

    await expect(service.getRequestPublicationContext(access)).resolves.toEqual({
      canPublish: true,
      capacitySource: "customer_membership",
      membershipLevel: "standard",
      maxTargetProviderCount: 1,
      publicationFee: { amountNdp: 1_000, currency: "NDP", ruleSetVersion: 3 }
    });
    expect(membership.resolveMembershipAt).toHaveBeenCalledWith(41, now);
  });

  it.each([
    ["free", "standard", 1],
    ["silver", "silver", 2],
    ["gold", "gold", 3],
    ["black_diamond", "black", 20]
  ] as const)("maps current %s membership to Request capacity", async (tierCode, level, limit) => {
    const repository = { resolveActor: jest.fn(async () => legacyBlackActor) };
    const fee = { resolveCurrent: jest.fn(async () => ({ amountNdp: 1_000, ruleSetVersion: 3 })) };
    const membership = { resolveMembershipAt: jest.fn(async () => ({ tierCode })) };
    const service = new ExchangeService(
      repository as never,
      () => now,
      undefined,
      fee as never,
      undefined,
      undefined,
      membership as never
    );

    await expect(service.getRequestPublicationContext(access)).resolves.toEqual(
      expect.objectContaining({ membershipLevel: level, maxTargetProviderCount: limit })
    );
  });
});
