import {
  buildLifeDanceShopServiceLocationRepairPlan,
  parseLifeDanceShopServiceLocationRepairArguments,
  type LifeDanceShopServiceLocationRepairTarget
} from "../scripts/repair-lifedance-shop-service-locations";

const targets: LifeDanceShopServiceLocationRepairTarget[] = [
  {
    shopName: "LifeDance Wellness 渋谷",
    ownerEmail: "admin@lifedance.com",
    serviceLocation: { countryCode: "JP", admin1Code: "13", admin2Code: "13113" }
  },
  {
    shopName: "麻布十番超级按摩",
    ownerEmail: "admina@lifedance.com",
    serviceLocation: { countryCode: "JP", admin1Code: "13", admin2Code: "13103" }
  }
];

describe("LifeDance shop service-location repair", () => {
  it("defaults to preview and requires an explicit apply count or restore run", () => {
    expect(parseLifeDanceShopServiceLocationRepairArguments([])).toEqual({ mode: "preview" });
    expect(
      parseLifeDanceShopServiceLocationRepairArguments(["--apply", "--confirm-count=2"])
    ).toEqual({ mode: "apply", confirmCount: 2 });
    expect(
      parseLifeDanceShopServiceLocationRepairArguments(["--restore-run=20260910T010203Z-a1b2c3"])
    ).toEqual({ mode: "restore", restoreRunId: "20260910T010203Z-a1b2c3" });
    expect(() => parseLifeDanceShopServiceLocationRepairArguments(["--apply"])).toThrow(
      "--confirm-count is required"
    );
  });

  it("plans only missing or invalid assignments after exact shop identity checks", async () => {
    const client = {
      shop: {
        findMany: jest.fn(async () => [
          {
            id: 16,
            name: "LifeDance Wellness 渋谷",
            owner: { email: "admin@lifedance.com" },
            serviceLocation: null
          },
          {
            id: 217,
            name: "麻布十番超级按摩",
            owner: { email: "admina@lifedance.com" },
            serviceLocation: {
              id: 160,
              countryCode: "JP",
              admin1RegionId: 1300,
              admin2RegionId: 13103,
              datasetVersion: "N03-20260101",
              verifiedAt: new Date("2026-09-09T00:00:00.000Z"),
              verifiedById: 7,
              deletedAt: null,
              admin1Region: {
                id: 1300,
                countryCode: "JP",
                officialCode: "13",
                sourceVersion: "N03-20260101",
                level: "ADMIN1",
                parentId: 1,
                deletedAt: null,
                locales: [{ name: "東京都" }]
              },
              admin2Region: {
                id: 13103,
                countryCode: "JP",
                officialCode: "13103",
                sourceVersion: "N03-20260101",
                level: "ADMIN2",
                parentId: 1300,
                deletedAt: null,
                locales: [{ name: "港区" }]
              }
            }
          }
        ])
      }
    };

    await expect(
      buildLifeDanceShopServiceLocationRepairPlan(client as never, targets)
    ).resolves.toMatchObject({
      targetCount: 2,
      repairCount: 1,
      rows: [
        { shopId: 16, status: "missing" },
        { shopId: 217, status: "current" }
      ]
    });
  });

  it("fails closed when an exact shop identity cannot be resolved", async () => {
    const client = {
      shop: {
        findMany: jest.fn(async () => [
          {
            id: 16,
            name: "Unexpected shop",
            owner: { email: "admin@lifedance.com" },
            serviceLocation: null
          },
          {
            id: 217,
            name: "麻布十番超级按摩",
            owner: { email: "admina@lifedance.com" },
            serviceLocation: null
          }
        ])
      }
    };

    await expect(
      buildLifeDanceShopServiceLocationRepairPlan(client as never, targets)
    ).rejects.toThrow("shop identity was not found");
  });
});
