import { describe, expect, it } from "vitest";
import type { CoreServiceCard } from "../../features/core-read/api";
import type { TechnicianServicePayload } from "../../features/pricing-mode/api";
import type { ServiceItem, Store, StoreMenuConfig } from "../../types/domain";
import {
  mapCoreServiceCardToUnifiedData,
  mapExchangeIntelligenceServiceToUnifiedData,
  mapServiceItemToUnifiedData,
  mapStoreMenuConfigToUnifiedData,
  mapTechnicianServiceToUnifiedData
} from "./mappers";

describe("unified service-card mappers", () => {
  it("preserves the Intelligence campaign, catalog, mode, public ids, and empty utilization", () => {
    expect(mapExchangeIntelligenceServiceToUnifiedData({
      targetType: "technician_service",
      publicId: "technician-service0000000801",
      name: "深层放松护理",
      description: "肩颈与足部深层护理",
      coverUrl: null,
      imageUrls: ["/services/deep-relaxation.png"],
      tags: ["肩颈", "足部"],
      catalogPriceJpy: 12_250,
      campaignPriceJpy: 9_800,
      currency: "JPY",
      durationMinutes: 90,
      serviceMode: "onsite",
      shopPublicId: "shop0000000061",
      shopAddress: "東京都中央区銀座3-4-12",
      detailPath: "/stores/shop0000000061/technicians/s0000000062/services"
    }, "上门")).toEqual({
      id: "technician-service0000000801",
      coverUrl: "/services/deep-relaxation.png",
      name: "深层放松护理",
      priceAmount: 9_800,
      catalogPriceAmount: 12_250,
      currency: "JPY",
      durationMinutes: 90,
      usageCount: null,
      shopPublicId: "shop0000000061",
      shopAddress: "東京都中央区銀座3-4-12",
      description: "肩颈与足部深层护理",
      tags: ["上门", "肩颈", "足部"],
      serviceModeLabel: "上门"
    });
  });

  it("maps every formal public service fact without replacing it with legacy counters", () => {
    const service = {
      id: 71,
      publicId: "service0000000071",
      name: "两小时家庭日常保洁",
      description: "厨房、浴室、地面一站式整理。",
      category: { name: "家庭保洁", nameJa: "家事代行", nameEn: "Home cleaning" },
      shop: {
        publicId: "shop0000000217",
        name: "LifeDance 银座",
        address: "東京都中央区銀座1-2-3",
        coverUrl: "/shop.jpg"
      },
      city: "東京都",
      priceAmount: "1000",
      currency: "JPY",
      durationMinutes: 60,
      usageCount: 18,
      favoriteCount: 27,
      shareCount: 6,
      isBookable: true,
      distanceKm: 1.24,
      coverUrl: "/service.jpg",
      reviewSummary: { highlights: ["可中文沟通", "女性技师可选"] }
    } as CoreServiceCard;

    expect(mapCoreServiceCardToUnifiedData(service)).toEqual({
      id: "71",
      coverUrl: "/service.jpg",
      name: "两小时家庭日常保洁",
      priceAmount: 1000,
      currency: "JPY",
      durationMinutes: 60,
      usageCount: 18,
      engagementTarget: { targetType: "service", publicId: "service0000000071" },
      favoriteCount: 27,
      shareCount: 6,
      isBookable: true,
      distanceKm: 1.24,
      shopPublicId: "shop0000000217",
      shopAddress: "東京都中央区銀座1-2-3",
      description: "厨房、浴室、地面一站式整理。",
      tags: ["家庭保洁", "東京都", "可中文沟通", "女性技师可选"]
    });
  });

  it("maps technician-managed services with their public shop id", () => {
    const service = {
      id: 9,
      publicId: "service0000000009",
      name: "超级无敌深度服务",
      description: "超级无敌了",
      priceAmount: 1111,
      currency: "JPY",
      durationMinutes: 60,
      usageCount: 2,
      favoriteCount: 9,
      shareCount: 4,
      isBookable: true,
      coverImageUrl: "/service-9.jpg",
      tags: ["深度保洁"],
      shop: {
        publicId: "shop0000000217",
        name: "LifeDance 银座",
        address: "東京都中央区銀座1-2-3"
      }
    } as TechnicianServicePayload;

    expect(mapTechnicianServiceToUnifiedData(service)).toMatchObject({
      id: "9",
      coverUrl: "/service-9.jpg",
      priceAmount: 1111,
      usageCount: 2,
      engagementTarget: {
        targetType: "technician_service",
        publicId: "service0000000009"
      },
      favoriteCount: 9,
      shareCount: 4,
      isBookable: true,
      shopPublicId: "shop0000000217",
      shopAddress: "東京都中央区銀座1-2-3"
    });
  });

  it("marks legacy utilization unavailable instead of reading ServiceItem.sales", () => {
    const service = {
      id: "legacy-1",
      name: "旧服务",
      priceFrom: 8800,
      sales: 9876,
      summary: "旧资料简介",
      tags: ["护理"],
      cover: "",
      serviceAreas: ["东京"],
      packages: [{ durationMinutes: 60 }]
    } as ServiceItem;

    expect(mapServiceItemToUnifiedData(service)).toMatchObject({
      id: "legacy-1",
      coverUrl: null,
      usageCount: null,
      shopPublicId: null,
      durationMinutes: 60
    });
  });

  it("marks legacy duration unavailable when no persisted package duration exists", () => {
    const service = {
      id: "legacy-without-duration",
      name: "旧服务",
      priceFrom: 8800,
      summary: "旧资料简介",
      tags: [],
      cover: "",
      serviceAreas: [],
      packages: []
    } as unknown as ServiceItem;

    expect(mapServiceItemToUnifiedData(service).durationMinutes).toBeNull();
  });

  it("adapts a persisted store menu to the shared card without inventing formal facts", () => {
    const menu = {
      id: "menu-1",
      sourceServiceId: "service-1",
      name: "季节护理套餐",
      subtitle: "适合日常放松",
      duration: "90 分钟",
      priceLabel: "￥9,800 起",
      audience: "1 人",
      tags: ["护理", "可预约"],
      cover: "/menu.jpg",
      highlights: []
    } satisfies StoreMenuConfig;
    const store = {
      id: "217",
      systemId: "217",
      address: "東京都中央区銀座1-2-3"
    } as Store;

    expect(mapStoreMenuConfigToUnifiedData(menu, store)).toEqual({
      id: "service-1",
      coverUrl: "/menu.jpg",
      name: "季节护理套餐",
      priceAmount: 9800,
      currency: "JPY",
      durationMinutes: 90,
      usageCount: null,
      shopPublicId: null,
      shopAddress: "東京都中央区銀座1-2-3",
      description: "适合日常放松",
      tags: ["护理", "可预约"]
    });
  });
});
