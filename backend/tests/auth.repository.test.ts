import { describe, expect, it, jest } from "@jest/globals";
import { AuthRepository } from "../src/repositories/auth.repository";
import { PublicIdentifierRepository } from "../src/repositories/public-identifier.repository";
import { IdentifierAllocator } from "../src/services/public-identifier.service";

const now = new Date("2026-08-28T00:00:00.000Z");
const publicIdentifier = (
  id: number,
  publicId: string,
  kind: "U" | "S",
  userIdentityId: number
) => ({
  id,
  publicId,
  numberPart: "1234567890",
  kind,
  loginAllowed: true,
  searchable: true,
  status: "ACTIVE",
  userIdentityId,
  shopId: null,
  merchantAccountId: null,
  customerSupportAccountId: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null
});
const repositoryUser = {
  id: 7,
  needoId: "u1234567890",
  accountNo: "1234567890",
  primaryIdentityType: "U",
  email: "user@example.com",
  emailVerifiedAt: now,
  phone: "+819012345678",
  passwordHash: "hash",
  username: "Real User",
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
      scopeId: 7,
      displayName: "Real User",
      isDefault: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      publicIdentifier: publicIdentifier(700, "u1234567890", "U", 70)
    },
    {
      id: 71,
      userId: 7,
      type: "technician",
      activeKey: null,
      scopeType: "technician_profile",
      scopeId: 17,
      displayName: "Real Technician",
      isDefault: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      publicIdentifier: publicIdentifier(701, "s1234567890", "S", 71)
    }
  ],
  identityApplications: [],
  userRoles: []
};

describe("AuthRepository formal login identifiers", () => {
  it("resolves a prefixed personnel ID through an active login-enabled public identifier", async () => {
    const findFirst = jest.fn(async (input: unknown) => {
      void input;
      return repositoryUser;
    });
    const repository = new AuthRepository({ user: { findFirst } } as never);

    const result = await repository.findUserByLoginIdentifier("s1234567890");
    const query = findFirst.mock.calls[0]?.[0];

    expect(JSON.stringify(query)).toContain("publicIdentifier");
    expect(JSON.stringify(query)).toContain("loginAllowed");
    expect(result).toMatchObject({
      needoId: "u1234567890",
      loginIdentityId: 71
    });
  });

  it("resolves a bare ten-digit account number before falling back to phone", async () => {
    const findFirst = jest.fn(async (input: { where?: { accountNo?: string } }) =>
      input.where?.accountNo ? repositoryUser : null
    );
    const repository = new AuthRepository({ user: { findFirst } } as never);

    const result = await repository.findUserByLoginIdentifier("1234567890");

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountNo: "1234567890", deletedAt: null } })
    );
    expect(result).toMatchObject({ loginIdentityId: 70 });
  });

  it("does not query the retired legacy needoId column", async () => {
    const findFirst = jest.fn(async () => null);
    const repository = new AuthRepository({ user: { findFirst } } as never);

    await repository.findUserByLoginIdentifier("n0000000001");

    expect(JSON.stringify(findFirst.mock.calls)).not.toContain("needoId");
  });

  it("creates a verified customer with one formal U identifier in the registration transaction", async () => {
    const createPublicIdentifier = jest.fn(async () =>
      publicIdentifier(702, "u5831047296", "U", 72)
    );
    const updateIdentity = jest.fn(async () => ({ id: 72 }));
    const updateUser = jest.fn(async () => ({ id: 8 }));
    const registeredUser = {
      ...repositoryUser,
      id: 8,
      needoId: "u5831047296",
      username: "u5831047296",
      identities: [
        {
          ...repositoryUser.identities[0],
          id: 72,
          userId: 8,
          scopeId: 8,
          displayName: "u5831047296",
          publicIdentifier: publicIdentifier(702, "u5831047296", "U", 72)
        }
      ]
    };
    const transaction = {
      role: { findFirst: jest.fn(async () => ({ id: 1 })) },
      user: {
        create: jest.fn(async () => ({
          id: 8,
          email: "new@example.com",
          username: "pending:89abcdef0123456701234567"
        })),
        update: updateUser,
        findUniqueOrThrow: jest.fn(async () => registeredUser)
      },
      customerProfile: {
        create: jest.fn(async () => ({ id: 8 })),
        update: jest.fn(async () => ({ id: 8 }))
      },
      userExperienceAccount: { create: jest.fn(async () => ({ id: 18 })) },
      userIdentity: {
        create: jest.fn(async () => ({ id: 72 })),
        update: updateIdentity
      },
      vanityNumberReservation: { findFirst: jest.fn(async () => null) },
      publicIdentifier: { create: createPublicIdentifier },
      userRole: { create: jest.fn(async () => ({ id: 1 })) },
      auditLog: { create: jest.fn(async () => ({ id: 1 })) }
    };
    const client = {
      $transaction: jest.fn(async (handler: (tx: typeof transaction) => unknown) =>
        handler(transaction)
      )
    };
    const bootstrapKeyAllocator = {
      withNewKey: jest.fn(async (create: (bootstrapKey: string) => unknown) =>
        create("pending:89abcdef0123456701234567")
      )
    };
    const repository = new AuthRepository(
      client as never,
      bootstrapKeyAllocator as never,
      (tx) => new IdentifierAllocator(new PublicIdentifierRepository(tx), () => "5831047296")
    );

    const result = await repository.createVerifiedBaselineCustomer({
      email: "new@example.com",
      emailVerifiedAt: now,
      passwordHash: "hash",
      context: { ip: "127.0.0.1" }
    });

    expect(createPublicIdentifier).toHaveBeenCalledWith({
      data: {
        publicId: "u5831047296",
        numberPart: "5831047296",
        kind: "U",
        userIdentityId: 72,
        loginAllowed: true,
        searchable: true
      }
    });
    expect(updateIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 72 },
        data: expect.objectContaining({
          user: {
            update: { accountNo: "5831047296", primaryIdentityType: "U" }
          }
        })
      })
    );
    expect(updateUser).toHaveBeenCalledWith({
      where: { id: 8 },
      data: { needoId: "u5831047296", username: "u5831047296" }
    });
    expect(transaction.userExperienceAccount.create).toHaveBeenCalledWith({
      data: { userId: 8, currentLevel: 1, totalExpUnits: 0n }
    });
    expect(result).toMatchObject({ needoId: "u5831047296" });
    expect(result).not.toHaveProperty("loginIdentityId");
  });

  it("returns the durable audit id and completes that same merchant switch attempt idempotently", async () => {
    const create = jest.fn(async () => ({ id: 91 }));
    const findFirst = jest
      .fn<
        () => Promise<{ id: number; updatedAt: Date; metadata: Record<string, unknown> } | null>
      >()
      .mockResolvedValueOnce({
        id: 91,
        updatedAt: now,
        metadata: { phase: "authorized_attempt", operationId: "operation-91", shopId: 11 }
      })
      .mockResolvedValueOnce({
        id: 91,
        updatedAt: new Date(now.getTime() + 1),
        metadata: { phase: "completed", operationId: "operation-91", shopId: 11 }
      });
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const repository = new AuthRepository({ auditLog: { create, findFirst, updateMany } } as never);

    await expect(
      repository.createAuditLog({
        actorId: 7,
        action: "auth.merchant_shop.switch",
        targetType: "Shop",
        metadata: { phase: "authorized_attempt", operationId: "operation-91", shopId: 11 }
      })
    ).resolves.toEqual({ id: 91 });
    await expect(
      repository.completeMerchantShopSwitchAudit({
        auditId: 91,
        operationId: "operation-91"
      })
    ).resolves.toBe(true);
    await expect(
      repository.completeMerchantShopSwitchAudit({
        auditId: 91,
        operationId: "operation-91"
      })
    ).resolves.toBe(true);

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 91,
        action: "auth.merchant_shop.switch",
        deletedAt: null
      },
      select: { id: true, updatedAt: true, metadata: true }
    });
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 91,
        action: "auth.merchant_shop.switch",
        deletedAt: null,
        updatedAt: now,
        metadata: { path: "$.operationId", equals: "operation-91" }
      },
      data: {
        metadata: {
          phase: "completed",
          operationId: "operation-91",
          shopId: 11
        }
      }
    });
  });

  it("does not complete a merchant switch audit for a mismatched operation", async () => {
    const updateMany = jest.fn();
    const repository = new AuthRepository({
      auditLog: {
        findFirst: jest.fn(async () => ({
          id: 91,
          updatedAt: now,
          metadata: { phase: "authorized_attempt", operationId: "another-operation" }
        })),
        updateMany
      }
    } as never);

    await expect(
      repository.completeMerchantShopSwitchAudit({
        auditId: 91,
        operationId: "operation-91"
      })
    ).resolves.toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("re-reads after an AuditLog CAS loss and never overwrites concurrent metadata", async () => {
    const findFirst = jest
      .fn<
        () => Promise<{ id: number; updatedAt: Date; metadata: Record<string, unknown> } | null>
      >()
      .mockResolvedValueOnce({
        id: 91,
        updatedAt: now,
        metadata: { phase: "authorized_attempt", operationId: "operation-91", shopId: 11 }
      })
      .mockResolvedValueOnce({
        id: 91,
        updatedAt: new Date(now.getTime() + 1),
        metadata: { phase: "completed", operationId: "other-operation", shopId: 12 }
      });
    const updateMany = jest.fn(async () => ({ count: 0 }));
    const repository = new AuthRepository({ auditLog: { findFirst, updateMany } } as never);

    await expect(
      repository.completeMerchantShopSwitchAudit({ auditId: 91, operationId: "operation-91" })
    ).resolves.toBe(false);

    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
});
