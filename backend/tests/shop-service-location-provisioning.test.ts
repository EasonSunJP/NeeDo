import {
  verifyShopServiceLocationInTransaction,
  type ShopServiceLocationVerificationDependencies
} from "../src/repositories/shop-service-location.repository";

describe("formal shop service-location provisioning", () => {
  it("persists the current verified hierarchy and audit in the caller transaction", async () => {
    const resolveVerifiedScope = jest.fn(async () => ({
      countryCode: "JP" as const,
      admin1Code: "13",
      admin2Code: "13113",
      admin1RegionId: 1300,
      admin1NameJa: "東京都",
      admin2RegionId: 13113,
      admin2NameJa: "渋谷区",
      datasetVersion: "N03-20260101" as const
    }));
    const shopServiceLocation = { upsert: jest.fn(async () => ({ id: 91 })) };
    const auditLog = { create: jest.fn(async () => ({ id: 92 })) };
    const tx = { shopServiceLocation, auditLog };
    const verifiedAt = new Date("2026-09-10T00:00:00.000Z");

    await expect(
      verifyShopServiceLocationInTransaction(
        tx as never,
        {
          shopId: 11,
          verifiedById: 7,
          serviceLocation: { countryCode: "JP", admin1Code: "13", admin2Code: "13113" },
          verifiedAt,
          auditAction: "simulation.shop.service_location.verify",
          auditMetadata: { source: "lifedance_real_ops_v1" }
        },
        { administrativeRegions: { resolveVerifiedScope } } as ShopServiceLocationVerificationDependencies
      )
    ).resolves.toMatchObject({ admin2RegionId: 13113, datasetVersion: "N03-20260101" });

    expect(resolveVerifiedScope).toHaveBeenCalledWith(
      { countryCode: "JP", admin1Code: "13", admin2Code: "13113" },
      tx
    );
    expect(shopServiceLocation.upsert).toHaveBeenCalledWith({
      where: { shopId: 11 },
      create: {
        shopId: 11,
        countryCode: "JP",
        admin1RegionId: 1300,
        admin2RegionId: 13113,
        datasetVersion: "N03-20260101",
        verifiedAt,
        verifiedById: 7
      },
      update: {
        countryCode: "JP",
        admin1RegionId: 1300,
        admin2RegionId: 13113,
        datasetVersion: "N03-20260101",
        verifiedAt,
        verifiedById: 7,
        deletedAt: null
      }
    });
    expect(auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 7,
        action: "simulation.shop.service_location.verify",
        targetType: "Shop",
        targetId: 11,
        ip: null,
        userAgent: null,
        metadata: {
          source: "lifedance_real_ops_v1",
          countryCode: "JP",
          admin1Code: "13",
          admin1NameJa: "東京都",
          admin2Code: "13113",
          admin2NameJa: "渋谷区",
          datasetVersion: "N03-20260101"
        }
      }
    });
  });

  it("does not write when the official hierarchy cannot be resolved", async () => {
    const invalidHierarchy = new Error("invalid hierarchy");
    const tx = {
      shopServiceLocation: { upsert: jest.fn() },
      auditLog: { create: jest.fn() }
    };

    await expect(
      verifyShopServiceLocationInTransaction(
        tx as never,
        {
          shopId: 16,
          verifiedById: 7,
          serviceLocation: { countryCode: "JP", admin1Code: "13", admin2Code: "13103" },
          auditAction: "seed.lifedance_admin2.service_location.verify"
        },
        {
          administrativeRegions: {
            resolveVerifiedScope: jest.fn(async () => {
              throw invalidHierarchy;
            })
          }
        } as ShopServiceLocationVerificationDependencies
      )
    ).rejects.toBe(invalidHierarchy);

    expect(tx.shopServiceLocation.upsert).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
