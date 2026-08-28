import { jest } from "@jest/globals";
import { UserRepository } from "../src/repositories/user.repository";
import { PublicIdentifierRepository } from "../src/repositories/public-identifier.repository";
import { IdentifierAllocator } from "../src/services/public-identifier.service";

describe("UserRepository formal account creation", () => {
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
      )
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
      identities: [
        expect.objectContaining({
          type: "customer",
          publicIdentifier: expect.objectContaining({ publicId: "u5831047296" })
        })
      ]
    });
  });
});
