import type { PrismaClient } from "@prisma/client";
import { TechnicianShopAffiliationRepository } from "../src/repositories/technician-shop-affiliation.repository";

const startsAt = new Date("2026-08-28T00:00:00.000Z");

const employeeRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 91,
  relationshipType: "PARTNER",
  workStatus: "ACTIVE",
  startsAt,
  endsAt: null,
  technicianProfile: {
    displayName: "斋藤 健太",
    status: "published",
    verifiedAt: new Date("2026-05-25T00:00:00.000Z"),
    user: {
      avatarUrl: "/avatar.png",
      email: "staff@example.com",
      phone: "+81-90-0000-0000",
      identities: [
        {
          publicIdentifier: {
            publicId: "s0000000086",
            kind: "S",
            status: "ACTIVE"
          }
        }
      ]
    }
  },
  shop: {
    id: 16,
    name: "LifeDance Wellness",
    publicIdentifier: {
      publicId: "shop0000000016",
      kind: "SHOP",
      status: "ACTIVE"
    }
  },
  ...overrides
});

const transactionClient = (overrides: Record<string, unknown> = {}) => ({
  userIdentity: {
    findFirst: jest.fn().mockResolvedValue({
      user: { technicianProfile: { id: 47 } }
    })
  },
  shop: { findFirst: jest.fn().mockResolvedValue({ id: 16 }) },
  technicianShopAffiliation: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue(employeeRecord()),
    update: jest.fn().mockResolvedValue(employeeRecord())
  },
  $queryRaw: jest.fn().mockResolvedValue([{ id: 47 }]),
  ...overrides
});

const transactionalClient = (tx: ReturnType<typeof transactionClient>) =>
  ({
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
  }) as unknown as PrismaClient;

describe("TechnicianShopAffiliationRepository", () => {
  it("lists only current employees in the requested shop and maps the canonical S identifier", async () => {
    const findMany = jest.fn().mockResolvedValue([employeeRecord()]);
    const count = jest.fn().mockResolvedValue(1);
    const repository = new TechnicianShopAffiliationRepository({
      technicianShopAffiliation: { findMany, count }
    } as unknown as PrismaClient);

    await expect(
      repository.listCurrentShopEmployees({
        shopId: 16,
        keyword: "斋藤",
        relationshipType: "partner",
        workStatus: "active",
        page: 1,
        pageSize: 20
      })
    ).resolves.toMatchObject({
      total: 1,
      list: [
        {
          needoId: "s0000000086",
          displayName: "斋藤 健太",
          affiliation: {
            relationshipType: "partner",
            workStatus: "active",
            shop: { publicId: "shop0000000016" }
          }
        }
      ]
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shopId: 16,
          activeKey: { not: null },
          deletedAt: null,
          relationshipType: "PARTNER",
          workStatus: "ACTIVE"
        }),
        skip: 0,
        take: 20
      })
    );
  });

  it("finds details only through the technician identity inside the current shop", async () => {
    const findFirst = jest.fn().mockResolvedValue(employeeRecord());
    const repository = new TechnicianShopAffiliationRepository({
      technicianShopAffiliation: { findFirst }
    } as unknown as PrismaClient);

    await expect(repository.findCurrentShopEmployee(16, 86)).resolves.toMatchObject({
      needoId: "s0000000086"
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shopId: 16,
          activeKey: { not: null },
          technicianProfile: expect.objectContaining({
            user: expect.objectContaining({
              identities: { some: expect.objectContaining({ id: 86 }) }
            })
          })
        })
      })
    );
  });

  it("locks the global technician profile and rejects an exclusive relationship when another shop is current", async () => {
    const tx = transactionClient();
    tx.technicianShopAffiliation.findMany.mockResolvedValue([
      { id: 72, shopId: 20, relationshipType: "PARTNER" }
    ]);
    const repository = new TechnicianShopAffiliationRepository(transactionalClient(tx));

    await expect(
      repository.upsertCurrentAffiliation({
        shopId: 16,
        technicianIdentityId: 86,
        actorUserId: 7,
        relationshipType: "exclusive",
        workStatus: "active",
        startsAt,
        endsAt: null
      })
    ).resolves.toBe("exclusive_conflict");

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.technicianShopAffiliation.create).not.toHaveBeenCalled();
    expect(tx.technicianShopAffiliation.update).not.toHaveBeenCalled();
  });

  it("allows the current shop to convert its own exclusive relationship to partner", async () => {
    const tx = transactionClient();
    tx.technicianShopAffiliation.findMany.mockResolvedValue([
      { id: 91, shopId: 16, relationshipType: "EXCLUSIVE" }
    ]);
    tx.technicianShopAffiliation.update.mockResolvedValue(
      employeeRecord({ relationshipType: "PARTNER" })
    );
    const repository = new TechnicianShopAffiliationRepository(transactionalClient(tx));

    await expect(
      repository.upsertCurrentAffiliation({
        shopId: 16,
        technicianIdentityId: 86,
        actorUserId: 7,
        relationshipType: "partner",
        workStatus: "active",
        startsAt,
        endsAt: null
      })
    ).resolves.toMatchObject({
      needoId: "s0000000086",
      affiliation: { relationshipType: "partner" }
    });

    expect(tx.technicianShopAffiliation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 91 },
        data: expect.objectContaining({
          relationshipType: "PARTNER",
          workStatus: "ACTIVE",
          activeKey: "technician:47:shop:16",
          updatedById: 7
        })
      })
    );
  });

  it("does not manufacture an ended history row when no current relationship exists", async () => {
    const tx = transactionClient();
    const repository = new TechnicianShopAffiliationRepository(transactionalClient(tx));

    await expect(
      repository.upsertCurrentAffiliation({
        shopId: 16,
        technicianIdentityId: 86,
        actorUserId: 7,
        relationshipType: "partner",
        workStatus: "ended",
        startsAt,
        endsAt: new Date("2026-08-29T00:00:00.000Z")
      })
    ).resolves.toBe("not_found");
    expect(tx.technicianShopAffiliation.create).not.toHaveBeenCalled();
  });
});
