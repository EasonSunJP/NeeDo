import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  coreReadApi,
  mapCoreCategoryToServiceCategory,
  mapCoreCustomerToCustomer,
  mapCoreServiceToServiceItem,
  mapCoreShopToStore,
  mapCoreTechnicianToTechnician,
  type CoreCustomerProfile,
  type CoreShopCard,
  type CoreServiceDetail,
  type CoreShopDetail,
  type CoreTechnicianCard,
  type CoreTechnicianDetail
} from "./api";
import { mapCoreShopToUnifiedData } from "../../shared/shop-card/mappers";
import { mapStoreToUnifiedEntityData } from "../../shared/profile-card/unifiedEntityMappers";
import { clearAuthTokens, setAuthTokens } from "../../api/httpClient";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200
  });
}

const reviewSummary = {
  ratingAverage: "4.80",
  reviewCount: 72,
  latestReviewAt: "2026-05-20T00:00:00.000Z",
  highlights: ["recovery", "private"]
};

const coreService = {
  id: 7,
  publicId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Shiatsu Recovery",
  description: "60 minute recovery session for shoulders, back, and legs.",
  category: {
    id: 2,
    code: "wellness",
    name: "Wellness",
    nameJa: "ウェルネス",
    nameEn: "Wellness",
    parentId: null,
    iconUrl: null,
    sortOrder: 10,
    isActive: true,
    createdAt: "2026-05-20T00:00:00.000Z",
    updatedAt: "2026-05-20T00:00:00.000Z"
  },
  shop: {
    id: 3,
    publicId: "shop5831047296",
    name: "Aoyama Care Studio",
    city: "Tokyo",
    address: "3-1 Kita Aoyama, Minato-ku",
    coverUrl: "/images/generated/home-merchant-feature.jpg",
    reviewSummary,
    completedOrderCount: 1999,
    favoriteCount: 1540,
    shareCount: 29,
    serviceCategories: [{ id: 2, code: "wellness", label: "リラクゼーション" }],
    businessKeywords: [
      { id: 21, code: "wellness_spa", categoryId: 2, label: "スパケア" }
    ]
  },
  technician: {
    id: 5,
    publicId: "s5831047296",
    displayName: "Mika Tanaka",
    city: "Tokyo",
    avatarUrl: "/images/generated/profile-technician-mika.jpg",
    reviewSummary,
    age: 25,
    favoriteCount: 154,
    shareCount: 8,
    completedOrderCount: 1280,
    acceptanceRatePercent: 98,
    primaryService: {
      id: 71,
      name: "肩颈调理",
      priceAmount: "8800",
      currency: "JPY",
      durationMinutes: 60
    }
  },
  city: "Tokyo",
  priceAmount: "8800.00",
  currency: "JPY",
  durationMinutes: 60,
  usageCount: 18,
  coverUrl: "/images/generated/service-shiatsu-recovery.jpg",
  reviewSummary,
  serviceMode: "store",
  mediaAssets: [],
  createdAt: "2026-05-20T00:00:00.000Z",
  updatedAt: "2026-05-20T00:00:00.000Z"
} satisfies CoreServiceDetail;

describe("core read API adapter", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    clearAuthTokens();
    vi.unstubAllGlobals();
  });

  it("keeps formal shop and technician card metrics typed separately", () => {
    const shop = {
      ...coreService.shop,
    } satisfies CoreShopCard;
    const technician = {
      ...coreService.technician,
    } satisfies CoreTechnicianCard;

    expect(shop.businessKeywords[0]?.label).toBe("スパケア");
    expect(technician.primaryService?.name).toBe("肩颈调理");
  });

  it("propagates formal shop completed totals and omits absent legacy totals", () => {
    const formalShop = {
      ...coreService.shop,
      completedOrderCount: 1999
    } as CoreShopCard;
    const store = mapCoreShopToStore(formalShop);

    expect(store).toMatchObject({ completedOrderCount: 1999 });
    expect(mapCoreShopToUnifiedData(formalShop)).toMatchObject({
      completedOrderCount: 1999
    });
    expect(mapStoreToUnifiedEntityData(store)).toMatchObject({
      completedOrderCount: 1999
    });

    const { completedOrderCount: _completedOrderCount, ...legacyStore } = store as typeof store & {
      completedOrderCount?: number;
    };
    expect(mapStoreToUnifiedEntityData(legacyStore)).not.toHaveProperty(
      "completedOrderCount"
    );
  });

  it("calls the Step 08 public search endpoint without auth", async () => {
    const sessionValues = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => sessionValues.get(key) ?? null,
        setItem: (key: string, value: string) => sessionValues.set(key, value)
      }
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        code: 0,
        message: "success",
        data: { list: [], page: 1, page_size: 20, total: 0 }
      })
    );

    await coreReadApi.search({ keyword: "shiatsu", page: 2, pageSize: 8, sort: "rating_desc" });

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/search?keyword=shiatsu&page=2&pageSize=8&sort=rating_desc&entityType=service",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Search-Session": expect.stringMatching(/^[a-f0-9]{32}$/)
        })
      })
    );
  });

  it("loads paginated public reviews for a service without auth", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        code: 0,
        message: "success",
        data: { list: [], page: 1, page_size: 20, total: 0 }
      })
    );

    await expect(coreReadApi.listServiceReviews(coreService.publicId, { page: 1, pageSize: 20 }))
      .resolves.toEqual({ list: [], page: 1, page_size: 20, total: 0 });
    expect(fetch).toHaveBeenCalledWith(
      `/api/v1/services/${coreService.publicId}/reviews?page=1&pageSize=20`,
      expect.objectContaining({ headers: expect.objectContaining({ Accept: "application/json" }) })
    );
  });

  it("calls typed multi-entity search endpoints with repeated OR values", async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      jsonResponse({
        code: 0,
        message: "success",
        data: { list: [], page: 1, page_size: 20, total: 0 }
      })
    );
    const query = {
      keywords: ["LifeDance", "家政"],
      categoryIds: [3, 9],
      page: 1
    };

    await coreReadApi.searchShops(query);
    await coreReadApi.searchTechnicians(query);
    await coreReadApi.searchServices(query);

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/search?keywords=LifeDance&keywords=%E5%AE%B6%E6%94%BF&categoryIds=3&categoryIds=9&page=1&entityType=shop",
      expect.any(Object)
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("entityType=technician"),
      expect.any(Object)
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("entityType=service"),
      expect.any(Object)
    );
  });

  it("loads a Shop detail by its public identifier", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ code: 0, message: "success", data: {} })
    );

    await coreReadApi.getShopDetail("shop5831047296");

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/shops/shop5831047296",
      expect.objectContaining({
        headers: expect.not.objectContaining({ Authorization: expect.any(String) })
      })
    );
  });

  it("sends the current viewer credential for visibility-scoped customer profiles", async () => {
    setAuthTokens({ accessToken: "viewer-access-token" });
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ code: 0, message: "success", data: {} })
    );

    await coreReadApi.getCustomerProfile(248);

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/profiles/customers/248",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer viewer-access-token" })
      })
    );
  });

  it("maps service DTOs into the legacy service card shape without mock IDs", () => {
    const service = mapCoreServiceToServiceItem(coreService);

    expect(service).toMatchObject({
      id: "7",
      categoryId: "massage",
      mode: "store",
      name: "Shiatsu Recovery",
      priceFrom: 8800,
      rating: 4.8,
      sales: 18,
      formal: {
        publicId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        usageCount: 18,
        currency: "JPY",
        durationMinutes: 60,
        shopPublicId: "shop5831047296",
        shopAddress: "3-1 Kita Aoyama, Minato-ku"
      },
      cover: "/images/generated/service-shiatsu-recovery.jpg"
    });
    expect(service.packages[0]).toMatchObject({
      durationMinutes: 60,
      price: 8800
    });
  });

  it("maps the formal home_visit service mode to home fulfillment", () => {
    const service = mapCoreServiceToServiceItem({
      ...coreService,
      serviceMode: "home_visit"
    });

    expect(service.mode).toBe("home");
  });

  it("maps a flexible service to the requested home fulfillment context", () => {
    const service = mapCoreServiceToServiceItem(
      { ...coreService, serviceMode: "flexible" },
      "home",
    );

    expect(service.mode).toBe("home");
  });

  it("maps an older shop response without additive taxonomy fields instead of crashing", () => {
    const {
      businessKeywords: _businessKeywords,
      favoriteCount: _favoriteCount,
      serviceCategories: _serviceCategories,
      shareCount: _shareCount,
      ...olderShop
    } = coreService.shop;

    expect(mapCoreShopToStore(olderShop as CoreShopCard)).toMatchObject({
      id: "3",
      name: "Aoyama Care Studio",
      tags: []
    });
  });

  it("preserves supported formal category codes for selected-tag search", () => {
    expect(mapCoreCategoryToServiceCategory({
      ...coreService.category,
      id: 19,
      code: "moving",
      name: "Moving",
      nameJa: "引っ越し"
    })).toMatchObject({ id: "moving" });
  });

  it("maps shop, technician, and customer DTOs for read-only profile pages", () => {
    const shop = mapCoreShopToStore({
      ...coreService.shop,
      description: "Private care studio.",
      phone: "+81300000000",
      latitude: "35.6721000",
      longitude: "139.7239000",
      mediaAssets: [{ id: 1, url: coreService.shop.coverUrl!, mimeType: "image/jpeg", usageType: "cover", width: 1200, height: 800, altText: null, sortOrder: 10 }],
      services: [],
      technicians: [coreService.technician],
      createdAt: coreService.createdAt,
      updatedAt: coreService.updatedAt
    } satisfies CoreShopDetail);
    const technician = mapCoreTechnicianToTechnician({
      ...coreService.technician,
      shop: coreService.shop,
      bio: "Certified body care technician.",
      serviceArea: "Minato, Shibuya",
      gender: "female",
      heightCm: 164,
      languages: ["日本語", "English"],
      yearsExperience: 8,
      reviewTagSummary: {
        special: [
          { code: "appeal_max", label: "魅力max", count: 0 },
          { code: "service_max", label: "服务max", count: 0 },
          { code: "emotion_max", label: "情绪max", count: 0 },
          { code: "energy_max", label: "元气max", count: 0 }
        ],
        custom: []
      },
      mediaAssets: [],
      services: [],
      createdAt: coreService.createdAt,
      updatedAt: coreService.updatedAt
    } satisfies CoreTechnicianDetail);
    const customer = mapCoreCustomerToCustomer({
      id: 9,
      publicId: "u3141592653",
      displayName: "Aya Customer",
      city: "Tokyo",
      bio: "Prefers evening appointments.",
      avatarUrl: "/images/generated/profile-customer-aya.jpg",
      membershipLevel: "standard",
      reviewSummary,
      createdAt: coreService.createdAt,
      updatedAt: coreService.updatedAt
    } satisfies CoreCustomerProfile);

    expect(shop).toMatchObject({
      id: "3",
      systemId: "shop5831047296",
      name: "Aoyama Care Studio",
      rating: 4.8,
      tags: ["スパケア"]
    });
    expect(technician).toMatchObject({
      id: "5",
      systemId: "s5831047296",
      name: "Mika Tanaka",
      storeId: "3",
      rating: 4.8,
      primaryService: {
        name: "肩颈调理",
        priceAmount: "8800",
        currency: "JPY",
        durationMinutes: 60
      }
    });
    expect(customer).toMatchObject({ id: "9", systemId: "u3141592653", name: "Aya Customer", memberLevel: "standard" });
  });

  it("preserves an explicitly empty formal customer language list", () => {
    const customer = mapCoreCustomerToCustomer({
      id: 9,
      publicId: "u3141592653",
      displayName: "Aya Customer",
      city: "Tokyo",
      bio: null,
      avatarUrl: null,
      languages: [],
      membershipLevel: "standard",
      reviewSummary,
      createdAt: coreService.createdAt,
      updatedAt: coreService.updatedAt
    } satisfies CoreCustomerProfile);

    expect(customer.languages).toEqual([]);
    expect(customer.bio).toBeUndefined();
  });
});
