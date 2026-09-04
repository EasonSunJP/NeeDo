import { describe, expect, it } from "vitest";
import type { CoreServiceCard } from "../../features/core-read/api";
import type { TechnicianServicePayload } from "../../features/pricing-mode/api";
import type { ServiceItem, Store, StoreMenuConfig } from "../../types/domain";
import {
  mapCoreServiceCardToUnifiedData,
  mapServiceItemToUnifiedData,
  mapStoreMenuConfigToUnifiedData,
  mapTechnicianServiceToUnifiedData
} from "./mappers";

describe("unified service-card mappers", () => {
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
