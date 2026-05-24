import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  coreReadApi,
  mapCoreCustomerToCustomer,
  mapCoreServiceToServiceItem,
  mapCoreShopToStore,
  mapCoreTechnicianToTechnician,
  type CoreCustomerProfile,
  type CoreServiceDetail,
  type CoreShopDetail,
  type CoreTechnicianDetail
} from "./api";

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
    name: "Aoyama Care Studio",
    city: "Tokyo",
    address: "3-1 Kita Aoyama, Minato-ku",
    coverUrl: "/images/generated/home-merchant-feature.jpg",
    reviewSummary
  },
  technician: {
    id: 5,
    displayName: "Mika Tanaka",
    city: "Tokyo",
    avatarUrl: "/images/generated/profile-technician-mika.jpg",
    reviewSummary
  },
  city: "Tokyo",
  priceAmount: "8800.00",
  currency: "JPY",
  durationMinutes: 60,
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
    vi.unstubAllGlobals();
  });

  it("calls the Step 08 public search endpoint without auth", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        code: 0,
        message: "success",
        data: { list: [], page: 1, page_size: 20, total: 0 }
      })
    );

    await coreReadApi.search({ keyword: "shiatsu", page: 2, pageSize: 8, sort: "rating_desc" });

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/search?keyword=shiatsu&page=2&pageSize=8&sort=rating_desc",
      expect.objectContaining({
        headers: expect.not.objectContaining({ Authorization: expect.any(String) })
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
      sales: 72,
      cover: "/images/generated/service-shiatsu-recovery.jpg"
    });
    expect(service.packages[0]).toMatchObject({
      durationMinutes: 60,
      price: 8800
    });
  });

  it("maps shop, technician, and customer DTOs for read-only profile pages", () => {
    const shop = mapCoreShopToStore({
      ...coreService.shop,
      description: "Private care studio.",
      phone: "+81300000000",
      latitude: "35.6721000",
      longitude: "139.7239000",
      mediaAssets: [{ id: 1, url: coreService.shop.coverUrl!, mimeType: "image/jpeg", usageType: "cover", width: 1200, height: 800, altText: null, sortOrder: 10 }],
      services: [coreService],
      technicians: [coreService.technician],
      createdAt: coreService.createdAt,
      updatedAt: coreService.updatedAt
    } satisfies CoreShopDetail);
    const technician = mapCoreTechnicianToTechnician({
      ...coreService.technician,
      bio: "Certified body care technician.",
      serviceArea: "Minato, Shibuya",
      yearsExperience: 8,
      mediaAssets: [],
      services: [coreService],
      createdAt: coreService.createdAt,
      updatedAt: coreService.updatedAt
    } satisfies CoreTechnicianDetail);
    const customer = mapCoreCustomerToCustomer({
      id: 9,
      displayName: "Aya Customer",
      city: "Tokyo",
      bio: "Prefers evening appointments.",
      avatarUrl: "/images/generated/profile-customer-aya.jpg",
      membershipLevel: "standard",
      reviewSummary,
      createdAt: coreService.createdAt,
      updatedAt: coreService.updatedAt
    } satisfies CoreCustomerProfile);

    expect(shop).toMatchObject({ id: "3", name: "Aoyama Care Studio", rating: 4.8 });
    expect(technician).toMatchObject({ id: "5", name: "Mika Tanaka", storeId: "3", rating: 4.8 });
    expect(customer).toMatchObject({ id: "9", name: "Aya Customer", memberLevel: "standard" });
  });
});
