import { describe, expect, it } from "vitest";
import { applyShopPresentationLocale, buildShopPresentationContent, mergeUploadedCarouselImage } from "./model";
import type { ShopPresentationLocalePayload } from "../../api/backofficeRealData";
import type { Store } from "../../types/domain";

const imageId = "a".repeat(64);
const baseStore: Store = {
  id: "shop16",
  systemId: "shop0000000016",
  merchantId: "merchant7",
  name: "Base shop",
  area: "Tokyo",
  address: "Base address",
  rating: 5,
  reviewCount: 1,
  priceLabel: "¥8,800",
  tags: [],
  openStatus: "open",
  nextSlot: "today",
  cover: "/base.jpg",
  gallery: ["/base.jpg"],
  description: "Base description",
  rankLabel: "",
  businessHours: "",
  mode: "store",
  presentation: {
    subtitle: "Base subtitle",
    favoriteCount: 0,
    distance: "",
    station: "",
    access: "",
    seatLabel: "环境",
    menuLabel: "菜单",
    peopleLabel: "人数",
    paymentMethods: [],
    equipment: [],
    parking: "",
    routeGuide: "",
    seatFilters: [],
    offers: [],
    menuCards: []
  }
};

const locale: ShopPresentationLocalePayload = {
  locale: "ja",
  lockVersion: 2,
  updatedAt: "2026-09-10T00:00:00.000Z",
  content: {
    storeName: "麻布十番マッサージ",
    description: "静かな店舗",
    address: "東京都港区",
    area: "港区",
    rankLabel: "おすすめ",
    businessHours: "11:00-23:00",
    subtitle: "すぐ予約可能",
    station: "麻布十番駅",
    distance: "徒歩3分",
    parking: "近隣駐車場",
    routeGuide: "A9出口",
    paymentMethods: ["Visa"],
    equipment: ["個室"],
    carousel: [{ mediaAssetPublicId: imageId, altText: "店舗" }],
    serviceMenus: [{
      serviceId: 1514,
      name: "首肩ケア",
      description: "基本コース",
      audience: "全員",
      tags: ["肩"],
      highlights: ["予約可"],
      coverMediaAssetPublicId: imageId
    }]
  }
};

it("applies localized presentation while retaining server-authoritative price and duration", () => {
  const localized = applyShopPresentationLocale(
    baseStore,
    locale,
    { [imageId]: { url: "/media/content/a.webp", altText: "店舗" } },
    [{ id: 1514, name: "Base service", description: "", priceAmount: "8800", currency: "JPY", durationMinutes: 60, coverMediaAssetPublicId: imageId }]
  );
  expect(localized.name).toBe("麻布十番マッサージ");
  expect(localized.gallery).toEqual(["/media/content/a.webp"]);
  expect(localized.presentation?.galleryCaptions).toEqual(["店舗"]);
  expect(localized.presentation?.menuCards?.[0]).toMatchObject({ name: "首肩ケア", duration: "60 分钟", priceLabel: "￥8,800" });
});

describe("buildShopPresentationContent", () => {
  it("serializes media references and localized service text", () => {
    const localized = applyShopPresentationLocale(
      baseStore,
      locale,
      { [imageId]: { url: "/media/content/a.webp", altText: "店舗" } },
      [{ id: 1514, name: "Base service", description: "", priceAmount: "8800", currency: "JPY", durationMinutes: 60, coverMediaAssetPublicId: imageId }]
    );
    expect(buildShopPresentationContent(localized, new Map([["/media/content/a.webp", imageId]]))).toMatchObject({
      storeName: "麻布十番マッサージ",
      carousel: [{ mediaAssetPublicId: imageId, altText: "店舗" }],
      serviceMenus: [{ serviceId: 1514, name: "首肩ケア", coverMediaAssetPublicId: imageId }]
    });
  });

  it("rejects browser-only image URLs that were never formally uploaded", () => {
    expect(() => buildShopPresentationContent(baseStore, new Map())).toThrow("error.shop_presentation.media_invalid");
  });

  it("saves edited text without requiring the shop's display-only fallback image", () => {
    const edited = { ...baseStore, name: "Edited shop", description: "Edited description" };
    expect(buildShopPresentationContent(edited, new Map(), new Set(baseStore.gallery))).toMatchObject({
      storeName: "Edited shop",
      description: "Edited description",
      carousel: []
    });
  });

  it("still rejects an unuploaded image when a fallback image is present", () => {
    const edited = { ...baseStore, gallery: [...baseStore.gallery, "blob:unuploaded"] };
    expect(() => buildShopPresentationContent(edited, new Map(), new Set(baseStore.gallery)))
      .toThrow("error.shop_presentation.media_invalid");
  });
});

describe("mergeUploadedCarouselImage", () => {
  it("replaces non-persisted fallback images when adding the first formal upload", () => {
    expect(mergeUploadedCarouselImage({
      images: ["/assets/fallback-shop.jpg"],
      formalMediaUrls: new Set<string>(),
      uploadedUrl: "/media/content/formal-carousel.jpg"
    })).toEqual(["/media/content/formal-carousel.jpg"]);
  });

  it("keeps formal carousel images while dropping fallback images after replacement", () => {
    expect(mergeUploadedCarouselImage({
      images: ["/media/content/first.jpg", "/assets/fallback-shop.jpg"],
      formalMediaUrls: new Set(["/media/content/first.jpg"]),
      uploadedUrl: "/media/content/second.jpg",
      replaceIndex: 1
    })).toEqual(["/media/content/first.jpg", "/media/content/second.jpg"]);
  });
});
