import {
  shopPresentationLocaleParamSchema,
  shopPresentationLocaleSyncBodySchema,
  shopPresentationLocaleUpdateBodySchema
} from "../src/validators/shop-presentation.validator";

const validBody = {
  expectedLockVersion: 0,
  content: {
    storeName: "麻布十番超级按摩",
    description: "安静私密的护理门店",
    address: "東京都港区麻布十番2丁目",
    area: "東京都港区",
    rankLabel: "推荐店铺",
    businessHours: "11:00-23:00",
    subtitle: "最近可约",
    station: "麻布十番站",
    distance: "步行 3 分钟",
    parking: "附近付费停车场",
    routeGuide: "A9 出口直行",
    paymentMethods: ["Visa"],
    equipment: ["独立更衣"],
    carousel: [
      { mediaAssetPublicId: "a".repeat(64), altText: "店铺头部轮播图" }
    ],
    serviceMenus: [
      {
        serviceId: 1514,
        name: "肩颈舒缓",
        description: "60 分钟基础护理",
        audience: "所有顾客",
        tags: ["肩颈"],
        highlights: ["可预约"],
        coverMediaAssetPublicId: null
      }
    ]
  }
};

describe("shop presentation validators", () => {
  it.each(["ja", "en", "ko", "zh-CN", "zh-TW"])("accepts supported locale %s", (locale) => {
    expect(shopPresentationLocaleParamSchema.parse({ locale })).toEqual({ locale });
  });

  it("rejects unsupported locales and client supplied shop scope", () => {
    expect(() => shopPresentationLocaleParamSchema.parse({ locale: "fr" })).toThrow();
    expect(() => shopPresentationLocaleUpdateBodySchema.parse({ ...validBody, shopId: 99 })).toThrow();
  });

  it("requires one to five unique carousel media references", () => {
    expect(shopPresentationLocaleUpdateBodySchema.parse(validBody)).toEqual(validBody);
    expect(() => shopPresentationLocaleUpdateBodySchema.parse({
      ...validBody,
      content: { ...validBody.content, carousel: [] }
    })).toThrow();
    expect(() => shopPresentationLocaleUpdateBodySchema.parse({
      ...validBody,
      content: {
        ...validBody.content,
        carousel: [
          validBody.content.carousel[0],
          validBody.content.carousel[0]
        ]
      }
    })).toThrow();
  });

  it("requires unique real service references and bounded localized fields", () => {
    expect(() => shopPresentationLocaleUpdateBodySchema.parse({
      ...validBody,
      content: {
        ...validBody.content,
        serviceMenus: [validBody.content.serviceMenus[0], validBody.content.serviceMenus[0]]
      }
    })).toThrow();
    expect(() => shopPresentationLocaleUpdateBodySchema.parse({
      ...validBody,
      content: { ...validBody.content, storeName: "x".repeat(161) }
    })).toThrow();
  });

  it("requires an optimistic lock version for every locale before synchronization", () => {
    const expectedLockVersions = { ja: 1, en: 2, ko: 3, "zh-CN": 4, "zh-TW": 5 };
    expect(shopPresentationLocaleSyncBodySchema.parse({
      expectedLockVersions,
      content: validBody.content
    })).toEqual({ expectedLockVersions, content: validBody.content });
    expect(() => shopPresentationLocaleSyncBodySchema.parse({
      expectedLockVersions: { ja: 1, en: 2, ko: 3, "zh-CN": 4 },
      content: validBody.content
    })).toThrow();
  });
});
