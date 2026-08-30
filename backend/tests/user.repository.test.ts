import { jest } from "@jest/globals";
import { UserRepository } from "../src/repositories/user.repository";
import { PublicIdentifierRepository } from "../src/repositories/public-identifier.repository";
import { IdentifierAllocator } from "../src/services/public-identifier.service";

describe("UserRepository formal account creation", () => {
  it("loads both currency balances for a page with one grouped wallet query", async () => {
    const users = [
      {
        id: 7,
        isTestAccount: true,
        identities: [],
        userRoles: []
      },
      {
        id: 8,
        isTestAccount: false,
        identities: [],
        userRoles: []
      }
    ];
    const client = {
      user: {
        findMany: jest.fn(async () => users),
        count: jest.fn(async () => 2)
      },
      wallet: {
        findMany: jest.fn(async () => [
          {
            ownerId: 7,
            currency: "TEST_NDP",
            availableBalance: 100_000,
            frozenBalance: 1
          },
          {
            ownerId: 8,
            currency: "NDP",
            availableBalance: 999,
            frozenBalance: 2
          }
        ])
      }
    };
    const repository = new UserRepository(client as never);

    const result = await repository.list({
      page: 1,
      pageSize: 20,
      isTestAccount: true
    });

    expect(client.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null, isTestAccount: true } })
    );
    expect(client.wallet.findMany).toHaveBeenCalledTimes(1);
    expect(client.wallet.findMany).toHaveBeenCalledWith({
      where: {
        ownerType: "USER",
        ownerId: { in: [7, 8] },
        currency: { in: ["NDP", "TEST_NDP"] },
        deletedAt: null
      },
      select: {
        ownerId: true,
        currency: true,
        availableBalance: true,
        frozenBalance: true
      }
    });
    expect(result.list).toEqual([
      expect.objectContaining({
        id: 7,
        balances: {
          ndp: { available: 0, frozen: 0 },
          testNdp: { available: 100_000, frozen: 1 }
        }
      }),
      expect.objectContaining({
        id: 8,
        balances: {
          ndp: { available: 999, frozen: 2 },
          testNdp: { available: 0, frozen: 0 }
        }
      })
    ]);
  });

  it("creates an admin-managed user with a U primary identity in one transaction", async () => {
    const now = new Date("2026-08-28T00:00:00.000Z");
    const publicIdentifier = {
      id: 90,
      publicId: "u5831047296",
      numberPart: "5831047296",
      kind: "U" as const,
      loginAllowed: true,
      searchable: true,
      status: "ACTIVE" as const,
      userIdentityId: 70,
      shopId: null,
      merchantAccountId: null,
      customerSupportAccountId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };
    const stored = {
      id: 7,
      needoId: publicIdentifier.publicId,
      accountNo: publicIdentifier.numberPart,
      primaryIdentityType: "U" as const,
      email: "managed@example.com",
      phone: null,
      emailVerifiedAt: now,
      passwordHash: "hash",
      username: "Managed User",
      avatarUrl: null,
      isActive: true,
      isTestAccount: false,
      sessionGeneration: 0,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      identities: [
        {
          id: 70,
          userId: 7,
          type: "customer",
          activeKey: null,
          scopeType: "customer_profile",
          scopeId: 17,
          displayName: "Managed User",
          isDefault: true,
          isActive: true,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          publicIdentifier
        }
      ],
      userRoles: []
    };
    const transaction = {
      role: { findFirst: jest.fn(async () => ({ id: 2 })) },
      user: {
        create: jest.fn(async () => ({ id: 7 })),
        update: jest.fn(async () => ({ id: 7 })),
        findUniqueOrThrow: jest.fn(async () => stored)
      },
      customerProfile: { create: jest.fn(async () => ({ id: 17 })) },
      userIdentity: {
        create: jest.fn(async () => ({ id: 70 })),
        update: jest.fn(async () => ({ id: 70 }))
      },
      publicIdentifier: { create: jest.fn(async () => publicIdentifier) },
      vanityNumberReservation: { findFirst: jest.fn(async () => null) },
      userRole: { create: jest.fn(async () => ({ id: 1 })) }
    };
    const client = {
      $transaction: jest.fn(async (handler: (tx: typeof transaction) => unknown) =>
        handler(transaction)
      ),
      wallet: { findMany: jest.fn(async () => []) }
    };
    const bootstrapKeyAllocator = {
      withNewKey: jest.fn(async (create: (bootstrapKey: string) => unknown) =>
        create("pending:0123456789abcdef01234567")
      )
    };
    const repository = new UserRepository(
      client as never,
      bootstrapKeyAllocator as never,
      (tx) =>
        new IdentifierAllocator(
          new PublicIdentifierRepository(tx),
          () => "5831047296"
        )
    );

    const result = await repository.create({
      email: stored.email,
      passwordHash: stored.passwordHash,
      username: stored.username,
      isActive: true
    });

    expect(transaction.user.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { needoId: "u5831047296" }
    });
    expect(transaction.userRole.create).toHaveBeenCalledWith({
      data: {
        userId: 7,
        roleId: 2,
        scopeType: "customer_profile",
        scopeId: 17
      }
    });
    expect(result).toMatchObject({
      needoId: "u5831047296",
      accountNo: "5831047296",
      primaryIdentityType: "U",
      balances: {
        ndp: { available: 0, frozen: 0 },
        testNdp: { available: 0, frozen: 0 }
      },
      identities: [
        expect.objectContaining({
          type: "customer",
          publicIdentifier: expect.objectContaining({ publicId: "u5831047296" })
        })
      ]
    });
  });
});
