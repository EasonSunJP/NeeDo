import { jest } from "@jest/globals";
import { BackofficeRepository } from "../src/repositories/backoffice.repository";
import { PublicIdentifierRepository } from "../src/repositories/public-identifier.repository";
import { IdentifierAllocator } from "../src/services/public-identifier.service";

describe("BackofficeRepository shop owner account identifiers", () => {
  it("creates one U primary and one same-number B identity without persisting n IDs", async () => {
    const now = new Date("2026-08-28T00:00:00.000Z");
    let nextIdentityId = 70;
    const createIdentifier = jest.fn(async ({ data }: { data: { kind: string } }) => ({
      id: data.kind === "U" ? 801 : 802,
      ...data,
      status: "ACTIVE",
      shopId: null,
      merchantAccountId: null,
      customerSupportAccountId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    }));
    const transaction = {
      role: {
        findMany: jest.fn(async () => [
          { id: 1, code: "customer" },
          { id: 2, code: "merchant_owner" }
        ])
      },
      user: {
        create: jest.fn(async () => ({ id: 7 })),
        update: jest.fn(async () => ({ id: 7 }))
      },
      customerProfile: { create: jest.fn(async () => ({ id: 17 })) },
      userExperienceAccount: { create: jest.fn(async () => ({ id: 27 })) },
      userIdentity: {
        create: jest.fn(async () => ({ id: nextIdentityId++ })),
        update: jest.fn(async () => ({ id: 70 }))
      },
      userRole: { create: jest.fn(async () => ({ id: 1 })) },
      merchantIdentityProfile: { create: jest.fn(async () => ({ id: 61 })) },
      vanityNumberReservation: { findFirst: jest.fn(async () => null) },
      publicIdentifier: { create: createIdentifier },
      shop: {
        create: jest.fn(async () => ({ id: 27 })),
        findFirst: jest.fn(async () => ({
          id: 27,
          ownerUserId: 7,
          owner: { email: "owner@example.com" },
          name: "Formal Shop",
          description: null,
          city: "Tokyo",
          address: "Tokyo",
          phone: null,
          status: "pending_review",
          isRecommended: false,
          createdAt: now
        }))
      }
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
    const repository = new BackofficeRepository(
      client as never,
      bootstrapKeyAllocator as never,
      (tx) => new IdentifierAllocator(new PublicIdentifierRepository(tx), () => "5831047296")
    );

    await repository.createShop({
      verifiedById: 1,
      ownerEmail: "owner@example.com",
      ownerPasswordHash: "hash",
      ownerUsername: "Owner",
      name: "Formal Shop",
      city: "Tokyo",
      address: "Tokyo"
    });

    expect(transaction.user.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { needoId: "u5831047296" }
    });
    expect(transaction.userExperienceAccount.create).toHaveBeenCalledWith({
      data: { userId: 7, currentLevel: 1, totalExpUnits: 0n }
    });
    expect(createIdentifier).toHaveBeenCalledWith({
      data: expect.objectContaining({
        publicId: "b5831047296",
        numberPart: "5831047296",
        kind: "B",
        userIdentityId: 71
      })
    });
    expect(transaction.userRole.create).toHaveBeenCalledTimes(2);
    expect(transaction.merchantIdentityProfile.create).toHaveBeenCalledWith({
      data: { userId: 7, identityId: 71, displayName: "Owner", languages: [] }
    });
  });
});
