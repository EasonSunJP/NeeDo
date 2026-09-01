import type { PrismaClient } from "@prisma/client";
import { PricingModeRepository } from "../src/repositories/pricing-mode.repository";

const missingRateColumnError = {
  code: "P2022",
  message: "The column `technician_pricing_rate_percent` does not exist in the current database.",
  meta: { column: "Shop.technician_pricing_rate_percent" }
};

const serviceRecord = (id: number, shopId: number, deletedAt: Date | null = null) => ({
  id,
  shopId,
  technicianId: 3,
  sourceShopServiceId: null,
  name: `Service ${id}`,
  description: null,
  categoryId: 2,
  priceAmount: 8_800,
  currency: "JPY",
  durationMinutes: 60,
  coverImageUrl: null,
  imagesJson: [],
  tagsJson: [],
  isActive: deletedAt === null,
  isBookable: deletedAt === null,
  isRecommended: false,
  sortOrder: id,
  reviewStatus: "APPROVED",
  rejectionReason: null,
  createdBy: 8,
  updatedBy: 8,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
  deletedAt
});

const createInput = (shopId: number) => ({
  shopId,
  technicianId: 3,
  createdBy: 8,
  name: `Shop ${shopId} service`,
  categoryId: 2,
  priceAmount: 8_800,
  currency: "JPY",
  durationMinutes: 60,
  auditLog: {
    actorId: 8,
    action: "technician.services.create",
    targetType: "technician_service",
    metadata: { technicianId: 3, shopId }
  }
});

describe("PricingModeRepository", () => {
  it("keeps pricing-mode reads and updates usable when the rate column has not been migrated yet", async () => {
    const updatedAt = new Date("2026-06-02T12:00:00.000Z");
    const shop = {
      findFirst: jest.fn().mockRejectedValueOnce(missingRateColumnError).mockResolvedValueOnce({
        id: 1,
        pricingMode: "MERCHANT",
        pricingModeUpdatedAt: null,
        pricingModeUpdatedBy: null
      }),
      update: jest.fn().mockRejectedValueOnce(missingRateColumnError).mockResolvedValueOnce({
        id: 1,
        pricingMode: "TECHNICIAN",
        pricingModeUpdatedAt: updatedAt,
        pricingModeUpdatedBy: 7
      })
    };
    const repository = new PricingModeRepository({ shop } as unknown as PrismaClient);

    await expect(repository.findShopPricingMode(1)).resolves.toMatchObject({
      shopId: 1,
      pricingMode: "merchant",
      technicianPricingRatePercent: 100
    });
    expect(shop.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        select: expect.not.objectContaining({ technicianPricingRatePercent: true })
      })
    );

    await expect(repository.updateShopPricingMode(1, "technician", 200, 7)).resolves.toMatchObject({
      shopId: 1,
      pricingMode: "technician",
      technicianPricingRatePercent: 200,
      updatedBy: 7
    });
    expect(shop.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.not.objectContaining({ technicianPricingRatePercent: 200 }),
        select: expect.not.objectContaining({ technicianPricingRatePercent: true })
      })
    );

    shop.findFirst.mockRejectedValueOnce(missingRateColumnError).mockResolvedValueOnce({
      id: 1,
      pricingMode: "TECHNICIAN",
      pricingModeUpdatedAt: updatedAt,
      pricingModeUpdatedBy: 7
    });
    await expect(repository.findShopPricingMode(1)).resolves.toMatchObject({
      shopId: 1,
      pricingMode: "technician",
      technicianPricingRatePercent: 200
    });
  });

  it("serializes profile-wide quota checks and writes the service with its audit atomically", async () => {
    const rows = [
      serviceRecord(1, 1),
      serviceRecord(2, 1),
      serviceRecord(3, 2),
      serviceRecord(4, 2)
    ];
    const transactionClient = {
      $queryRaw: jest.fn(async () => [{ id: 3 }]),
      technicianService: {
        count: jest.fn(async () => rows.filter((row) => row.deletedAt === null).length),
        create: jest.fn(async ({ data }: { data: { shopId: number } }) => {
          const created = serviceRecord(rows.length + 1, data.shopId);
          rows.push(created);
          return created;
        })
      },
      auditLog: { create: jest.fn(async () => ({})) }
    };
    let serialization = Promise.resolve();
    const client = {
      $transaction: jest.fn(<T>(callback: (transaction: typeof transactionClient) => Promise<T>) => {
        const result = serialization.then(() => callback(transactionClient));
        serialization = result.then(
          () => undefined,
          () => undefined
        );
        return result;
      })
    };
    const repository = new PricingModeRepository(client as unknown as PrismaClient);

    const results = await Promise.allSettled([
      repository.createTechnicianService(createInput(1)),
      repository.createTechnicianService(createInput(2))
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toEqual([
      expect.objectContaining({
        reason: expect.objectContaining({ message: "error.technician_service.limit_reached" })
      })
    ]);
    expect(transactionClient.$queryRaw).toHaveBeenCalledTimes(2);
    expect(transactionClient.technicianService.count).toHaveBeenCalledWith({
      where: { technicianId: 3, deletedAt: null }
    });
    expect(transactionClient.technicianService.create).toHaveBeenCalledTimes(1);
    expect(transactionClient.auditLog.create).toHaveBeenCalledTimes(1);
    expect(transactionClient.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "technician.services.create",
        targetType: "technician_service",
        targetId: 5
      })
    });
  });

  it("ignores soft-deleted services for quota and resolves the eligible primary service", async () => {
    const created = serviceRecord(6, 2);
    const transactionClient = {
      $queryRaw: jest.fn(async () => [{ id: 3 }]),
      technicianService: {
        count: jest.fn(async () => 4),
        create: jest.fn(async () => created)
      },
      auditLog: { create: jest.fn(async () => ({})) }
    };
    const technicianService = {
      findFirst: jest.fn(async () => serviceRecord(2, 2))
    };
    const client = {
      $transaction: jest.fn(async (callback: (transaction: typeof transactionClient) => unknown) =>
        callback(transactionClient)
      ),
      technicianService
    };
    const repository = new PricingModeRepository(client as unknown as PrismaClient);

    await expect(repository.createTechnicianService(createInput(2))).resolves.toMatchObject({
      id: 6,
      taxIncluded: true
    });
    await expect(repository.findPrimaryTechnicianService(3)).resolves.toMatchObject({
      id: 2,
      taxIncluded: true
    });
    expect(technicianService.findFirst).toHaveBeenCalledWith({
      where: {
        technicianId: 3,
        deletedAt: null,
        isActive: true,
        reviewStatus: "APPROVED"
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
    });
  });
});
