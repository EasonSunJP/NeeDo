import { describe, expect, it, jest } from "@jest/globals";
import { AuthRepository } from "../src/repositories/auth.repository";
import { PublicIdentifierRepository } from "../src/repositories/public-identifier.repository";
import { IdentifierAllocator } from "../src/services/public-identifier.service";

const now = new Date("2026-08-28T00:00:00.000Z");
const publicIdentifier = (id: number, publicId: string, kind: "U" | "S", userIdentityId: number) => ({
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
  needoId: "n0000000007",
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
          username: "n0000000008"
        })),
        update: updateUser,
        findUniqueOrThrow: jest.fn(async () => registeredUser)
      },
      customerProfile: {
        create: jest.fn(async () => ({ id: 8 })),
        update: jest.fn(async () => ({ id: 8 }))
      },
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
    const legacyAllocator = {
      withNewId: jest.fn(async (create: (needoId: string) => unknown) =>
        create("n0000000008")
      )
    };
    const repository = new AuthRepository(
      client as never,
      legacyAllocator as never,
      (tx) =>
        new IdentifierAllocator(
          new PublicIdentifierRepository(tx),
          () => "5831047296"
        )
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
    expect(result).toMatchObject({ needoId: "u5831047296" });
    expect(result).not.toHaveProperty("loginIdentityId");
  });
});
