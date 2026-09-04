import { BackofficeRepository } from "../src/repositories/backoffice.repository";

const now = new Date("2026-09-01T12:00:00.000Z");

describe("BackofficeRepository managed users", () => {
  it("paginates all users with one aggregate user query and one wallet query", async () => {
    const findMany = jest.fn(async () => [
      {
        id: 41,
        needoId: "u0000000041",
        username: "Mia",
        email: "mia@example.test",
        phone: "+819012345678",
        emailVerifiedAt: now,
        avatarUrl: null,
        avatarBootstrapUrl: null,
        isActive: true,
        isTestAccount: false,
        primaryIdentityType: "CUSTOMER",
        lastLoginAt: now,
        createdAt: now,
        updatedAt: now,
        identities: [
          { type: "customer", displayName: "Mia", scopeType: "customer_profile", scopeId: 7 }
        ],
        userRoles: [],
        customerProfile: { id: 7, displayName: "Mia", city: "Tokyo" },
        technicianProfile: null,
        ownedShops: [],
        experienceAccount: { currentLevel: 12, totalExpUnits: 345600n },
        platformMembershipEntitlements: [
          {
            publicId: "entitlement-41",
            expiresAt: null,
            lockVersion: 2,
            tierVersion: {
              publicId: "tier-gold-v3",
              experienceMultiplier: { toString: () => "5" },
              tier: { code: "GOLD" }
            }
          }
        ],
        backofficeUserGroupMemberships: [],
        ekycVerifications: [{ status: "verified", verifiedAt: now }],
        externalAccounts: [],
        _count: { bookingOrders: 3 }
      }
    ]);
    const count = jest.fn(async () => 1);
    const walletFindMany = jest.fn(async () => [
      { ownerId: 41, currency: "NDP", availableBalance: 900, frozenBalance: 100 }
    ]);
    const repository = new BackofficeRepository({
      user: { findMany, count },
      wallet: { findMany: walletFindMany }
    } as never);

    const page = await repository.listManagedUsers({ page: 1, pageSize: 20 }, now);

    expect(page.list[0]).toMatchObject({
      needoId: "u0000000041",
      identities: [expect.objectContaining({ type: "customer" })],
      membership: expect.objectContaining({ tierCode: "gold" }),
      experience: { currentLevel: 12, totalExpUnits: "345600" },
      phoneBound: true,
      emailBound: true,
      ndpBalance: { available: 900, frozen: 100 }
    });
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(walletFindMany).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(page)).not.toMatch(/passwordHash|otp|accessToken|refreshToken/);
  });
});
