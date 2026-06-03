import type { PrismaClient } from "@prisma/client";
import { PricingModeRepository } from "../src/repositories/pricing-mode.repository";

const missingRateColumnError = {
  code: "P2022",
  message: "The column `technician_pricing_rate_percent` does not exist in the current database.",
  meta: { column: "Shop.technician_pricing_rate_percent" }
};

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
});
