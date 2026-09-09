import { ERROR_CODES } from "../src/constants/error-codes";
import {
  ShopPresentationService,
  type ShopPresentationRepositoryPort
} from "../src/services/shop-presentation.service";

const actor = {
  userId: 7,
  currentIdentityId: 70,
  currentIdentityType: "merchant_owner",
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: 16
};
const context = { ip: "127.0.0.1", userAgent: "jest" };
const content = {
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
  carousel: [{ mediaAssetPublicId: "a".repeat(64), altText: "店铺头部轮播图" }],
  serviceMenus: [{
    serviceId: 1514,
    name: "肩颈舒缓",
    description: "60 分钟基础护理",
    audience: "所有顾客",
    tags: ["肩颈"],
    highlights: ["可预约"],
    coverMediaAssetPublicId: null
  }]
};

const workspace = {
  shopId: 16,
  locales: {
    ja: { locale: "ja", lockVersion: 0, content, updatedAt: null },
    en: { locale: "en", lockVersion: 0, content, updatedAt: null },
    ko: { locale: "ko", lockVersion: 0, content, updatedAt: null },
    "zh-CN": { locale: "zh-CN", lockVersion: 0, content, updatedAt: null },
    "zh-TW": { locale: "zh-TW", lockVersion: 0, content, updatedAt: null }
  }
} as const;

describe("ShopPresentationService", () => {
  it("derives shop scope and returns all five locale projections", async () => {
    const repository = {
      getWorkspace: jest.fn(async () => workspace),
      updateLocale: jest.fn()
    } as unknown as jest.Mocked<ShopPresentationRepositoryPort>;
    const audit = { record: jest.fn(async () => undefined) };
    const service = new ShopPresentationService(repository, audit as never);

    await expect(service.getWorkspace(actor as never, context)).resolves.toEqual(workspace);
    expect(repository.getWorkspace).toHaveBeenCalledWith(16);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: "merchant_admin.shop_presentation.read",
      targetType: "Shop",
      targetId: 16
    }));
  });

  it("updates only the requested locale with optimistic version and audit context", async () => {
    const updated = { ...workspace.locales.ja, lockVersion: 4, updatedAt: "2026-09-10T00:00:00.000Z" };
    const repository = {
      getWorkspace: jest.fn(),
      updateLocale: jest.fn(async () => updated)
    } as unknown as jest.Mocked<ShopPresentationRepositoryPort>;
    const service = new ShopPresentationService(repository, { record: jest.fn() } as never);

    await expect(service.updateLocale(actor as never, context, "ja", {
      expectedLockVersion: 3,
      content
    })).resolves.toEqual(updated);
    expect(repository.updateLocale).toHaveBeenCalledWith({
      shopId: 16,
      locale: "ja",
      expectedLockVersion: 3,
      content,
      actorUserId: 7,
      actorIdentityId: 70,
      context,
      updatedAt: expect.any(Date)
    });
  });

  it("rejects preview and non-shop identities before repository access", async () => {
    const repository = { getWorkspace: jest.fn(), updateLocale: jest.fn() };
    const service = new ShopPresentationService(repository as never, { record: jest.fn() } as never);

    await expect(service.getWorkspace({ ...actor, isReadOnlyMerchantPreview: true, merchantPreviewShopId: 16 } as never, context))
      .rejects.toMatchObject({ code: ERROR_CODES.IDENTITY_FORBIDDEN, statusCode: 403 });
    await expect(service.updateLocale({ ...actor, currentIdentityScopeType: "global", currentIdentityScopeId: null } as never, context, "ja", { expectedLockVersion: 0, content }))
      .rejects.toMatchObject({ code: ERROR_CODES.IDENTITY_FORBIDDEN, statusCode: 403 });
    expect(repository.getWorkspace).not.toHaveBeenCalled();
    expect(repository.updateLocale).not.toHaveBeenCalled();
  });
});
