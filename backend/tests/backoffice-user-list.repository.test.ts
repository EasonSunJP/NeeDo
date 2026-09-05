import { BackofficeRepository } from "../src/repositories/backoffice.repository";

const now = new Date("2026-09-01T12:00:00.000Z");

const managedUserRow = () => ({
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
  customerProfile: {
    id: 7,
    displayName: "Mia",
    bio: "Formal profile",
    city: "Tokyo",
    gender: "private",
    age: null,
    heightCm: null,
    languages: ["ja"],
    visibility: "limited",
    deletedAt: null
  },
  technicianProfile: null,
  ownedShops: [],
  experienceAccount: { currentLevel: 12, totalExpUnits: 345600n, deletedAt: null },
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
});

describe("BackofficeRepository managed users", () => {
  it("paginates all users with one aggregate user query and one wallet query", async () => {
    const findMany = jest.fn(async () => [managedUserRow()]);
    const count = jest.fn(async () => 1);
    const walletFindMany = jest.fn(async () => [
      { ownerId: 41, currency: "NDP", availableBalance: 900, frozenBalance: 100 }
    ]);
    const repository = new BackofficeRepository({
      user: { findMany, count },
      wallet: { findMany: walletFindMany }
    } as never);

    const page = await repository.listManagedUsers(
      { scope: "platform", page: 1, pageSize: 20 } as never,
      now
    );

    expect(page.list[0]).toMatchObject({
      needoId: "u0000000041",
      identities: [expect.objectContaining({ type: "customer" })],
      membership: expect.objectContaining({ tierCode: "gold" }),
      experience: { currentLevel: 12, totalExpUnits: "345600" },
      phoneBound: true,
      emailBound: true,
      displayName: "Mia",
      city: "Tokyo",
      privacyMode: true,
      privacyScope: "limited",
      ndpBalance: { available: 900, frozen: 100 }
    });
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(walletFindMany).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(page)).not.toMatch(/passwordHash|otp|accessToken|refreshToken/);
  });

  it("filters merchant managed users by authenticated shop before pagination", async () => {
    const findMany = jest.fn(async () => []);
    const count = jest.fn(async () => 0);
    const groupBy = jest.fn(async () => [
      { customerUserId: 41, _count: { _all: 3 } },
      { customerUserId: 42, _count: { _all: 1 } },
      { customerUserId: 43, _count: { _all: 21 } }
    ]);
    const repository = new BackofficeRepository({
      user: { findMany, count },
      bookingOrder: { groupBy },
      wallet: { findMany: jest.fn(async () => []) }
    } as never);

    await repository.listManagedUsers(
      {
        scope: "merchant",
        shopId: 11,
        page: 1,
        pageSize: 20,
        city: "Tokyo",
        emailState: "set",
        privacy: "enabled",
        minBookings: 2,
        maxBookings: 20,
        sortBy: "city",
        sortDirection: "desc"
      } as never,
      now
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { bookingOrders: { some: { shopId: 11, deletedAt: null } } },
            {
              OR: [
                { customerProfile: { is: { city: { contains: "Tokyo" }, deletedAt: null } } },
                { technicianProfile: { is: { city: { contains: "Tokyo" }, deletedAt: null } } }
              ]
            },
            { email: { not: "" } },
            {
              OR: [
                {
                  customerProfile: {
                    is: { visibility: { not: "public" }, deletedAt: null }
                  }
                },
                {
                  technicianProfile: {
                    is: { visibility: { not: "public" }, deletedAt: null }
                  }
                }
              ]
            },
            { id: { in: [41] } }
          ])
        }),
        orderBy: [{ customerProfile: { city: "desc" } }, { id: "desc" }]
      })
    );
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["customerUserId"],
        where: { shopId: 11, deletedAt: null }
      })
    );
  });

  it("scopes detail bookings and received-review credit to the authenticated merchant shop", async () => {
    const findFirst = jest.fn(async () => managedUserRow());
    const bookingCount = jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(2);
    const reviewAggregate = jest.fn(async () => ({
      _avg: { rating: 4.8 },
      _count: { _all: 12 },
      _max: { createdAt: new Date("2026-08-20T00:00:00.000Z") }
    }));
    const repository = new BackofficeRepository({
      user: { findFirst },
      wallet: { findMany: jest.fn(async () => [{ ownerId: 41, availableBalance: 900, frozenBalance: 0 }]) },
      bookingOrder: {
        count: bookingCount,
        aggregate: jest.fn(async () => ({ _sum: { paymentAmountJpy: 18000 } }))
      },
      orderReview: { aggregate: reviewAggregate },
      auditLog: { count: jest.fn(async () => 0), findMany: jest.fn(async () => []) }
    } as never);

    const detail = await repository.getManagedUser(
      { scope: "merchant", shopId: 11, userId: 41 },
      now
    );

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 41,
        bookingOrders: { some: { shopId: 11, deletedAt: null } }
      })
    }));
    expect(bookingCount).toHaveBeenCalledWith({
      where: { customerUserId: 41, shopId: 11, deletedAt: null }
    });
    expect(reviewAggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        customerProfileId: 7,
        bookingOrder: { shopId: 11 }
      })
    }));
    expect(detail).toMatchObject({
      privacyMode: true,
      privacyScope: "limited",
      metrics: {
        ndpAvailable: 900,
        usageCount: 3,
        credit: { ratingAverage: 4.8, reviewCount: 12 }
      }
    });
  });
});
