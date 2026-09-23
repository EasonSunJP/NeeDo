import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { httpClient } from "../../api/httpClient";
import {
  coreReadApi,
  coreReadIdFromRoute,
  mapCoreServiceToServiceItem,
  type CoreServiceDetail,
  type CoreTechnicianCard
} from "../../features/core-read/api";
import type { BookingScheduleSlot } from "../../features/booking/api";
import {
  buildServiceTagLabels,
  resolveBookableServiceTechnicians,
  ServiceReviewCard
} from "./ServiceDetailPage";
import serviceDetailSource from "./ServiceDetailPage.tsx?raw";
import bookingActionBarSource from "../../components/mobile/ServiceBookingActionBar.tsx?raw";
import detailHeaderFadeSource from "../../components/mobile/ServiceDetailHeaderFade.tsx?raw";

const clientStyles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

vi.mock("../../api/httpClient", () => ({
  httpClient: { request: vi.fn() }
}));

describe("ServiceDetailPage formal service routes", () => {
  beforeEach(() => {
    vi.mocked(httpClient.request).mockReset().mockResolvedValue({});
  });

  it("keeps legacy positive numeric service IDs on the typed core-read API", async () => {
    const id = coreReadIdFromRoute("17", { allowUuid: true });

    expect(id).toBe(17);
    await coreReadApi.getServiceDetail(id!);
    expect(httpClient.request).toHaveBeenCalledWith("/services/17");
  });

  it("preserves a valid service UUID instead of coercing it to NaN", async () => {
    const uuid = "46969a0f-2c2c-4b7b-b986-88e406393255";
    const id = coreReadIdFromRoute(uuid, { allowUuid: true });

    expect(id).toBe(uuid);
    await coreReadApi.getServiceDetail(id!);
    expect(httpClient.request).toHaveBeenCalledWith(`/services/${uuid}`);
    expect(httpClient.request).not.toHaveBeenCalledWith("/services/NaN", expect.anything());
  });

  it("keeps UUID support scoped to services and rejects other invalid legacy IDs", () => {
    expect(coreReadIdFromRoute("46969a0f-2c2c-4b7b-b986-88e406393255")).toBeNull();
    expect(serviceDetailSource).not.toContain("data/mock");
    expect(serviceDetailSource).toContain('coreReadIdFromRoute(id, { allowUuid: true })');
    expect(serviceDetailSource).toContain("if (!apiId)");
    expect(serviceDetailSource).toContain("serviceQuery.data ? mapCoreServiceToServiceItem(serviceQuery.data) : null");
    expect(serviceDetailSource).toContain("服务链接不可用");
  });

  it("renders a formal home_visit service through the home-service badge path", () => {
    const service = mapCoreServiceToServiceItem({
      id: 80,
      publicId: "service0000000080",
      name: "訪問リラクゼーション 90分",
      description: "利用者の住所へ訪問する正式サービス",
      category: {
        id: 2,
        code: "massage_home_visit",
        name: "上门按摩",
        nameJa: "訪問マッサージ",
        nameEn: "Home-visit Massage",
        parentId: null,
        iconUrl: null,
        sortOrder: 1,
        isActive: true,
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z"
      },
      shop: {
        id: 16,
        publicId: "shop0000000016",
        name: "LifeDance",
        city: "東京都",
        address: "東京都中央区銀座1-2-3",
        coverUrl: null,
        reviewSummary: { ratingAverage: "5.00", reviewCount: 1, latestReviewAt: null, highlights: [] },
        completedOrderCount: 1,
        favoriteCount: 0,
        shareCount: 0,
        serviceCategories: [],
        businessKeywords: []
      },
      technician: null,
      city: "東京都",
      priceAmount: "12000.00",
      currency: "JPY",
      durationMinutes: 90,
      usageCount: 1,
      coverUrl: null,
      reviewSummary: { ratingAverage: "5.00", reviewCount: 1, latestReviewAt: null, highlights: [] },
      serviceMode: "home_visit",
      mediaAssets: [],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z"
    } satisfies CoreServiceDetail);

    expect(service.mode).toBe("home");
    expect(serviceDetailSource).toContain('service.mode === "home" ? "上门服务" : "到店服务"');
  });

  it("opens a formal technician through the canonical public profile path", () => {
    expect(serviceDetailSource).toContain("getTechnicianDynamicPath(technician)");
    expect(serviceDetailSource).not.toContain('to={`/profiles/technician/${technician.id}`}');
  });

  it("reserves the shared two-row booking footer height below the final content card", () => {
    expect(serviceDetailSource).toContain("pb-[calc(env(safe-area-inset-bottom)+11rem)]");
    expect(serviceDetailSource).not.toContain("pb-[calc(env(safe-area-inset-bottom)+6rem)]");
  });

  it("derives selectable technicians from the same formal availability used by checkout", () => {
    expect(serviceDetailSource).toContain("loadAvailabilityWindow");
    expect(serviceDetailSource).toContain("resolveBookableServiceTechnicians");
    expect(serviceDetailSource).toContain("shopId: formalService.shop.id");
    expect(serviceDetailSource).not.toContain("serviceQuery.data?.technician ?");
  });

  it("deduplicates current same-service same-shop technician slots against public shop cards", () => {
    const technician = (id: number): CoreTechnicianCard => ({
      id,
      publicId: `S${id}`,
      displayName: `技师 ${id}`,
      city: "東京都",
      avatarUrl: null,
      reviewSummary: { ratingAverage: "5.00", reviewCount: 1, latestReviewAt: null, highlights: [] },
      age: null,
      favoriteCount: 0,
      shareCount: 0,
      completedOrderCount: 1,
      acceptanceRatePercent: 100,
      primaryService: null
    });
    const slot = (
      id: number,
      serviceId: number,
      shopId: number,
      technicianProfileId: number | null,
      technicianServiceId: number | null = null
    ): BookingScheduleSlot => ({
      id,
      serviceId,
      technicianServiceId,
      shopId,
      technicianProfileId,
      startsAt: "2026-09-13T12:00:00.000Z",
      endsAt: "2026-09-13T13:00:00.000Z",
      capacity: 1,
      bookedCount: 0,
      status: "available",
      serviceName: "ボディケア 60分",
      shopName: "LifeDance",
      technicianName: technicianProfileId ? `技师 ${technicianProfileId}` : null,
      priceAmount: "6000.00",
      currency: "JPY",
      durationMinutes: 60
    });

    expect(
      resolveBookableServiceTechnicians(
        79,
        16,
        [
          slot(1, 79, 16, 7),
          slot(2, 79, 16, 7),
          slot(3, 80, 16, 8),
          slot(4, 79, 17, 9),
          slot(5, 79, 16, 10, 1928)
        ],
        [technician(7), technician(8), technician(9), technician(10)]
      ).map((item) => item.id)
    ).toEqual(["7"]);
  });

  it("deduplicates overlapping service areas and tags before rendering keyed chips", () => {
    expect(buildServiceTagLabels(["Tokyo", "Minato"], ["Tokyo", "cleaning"])).toEqual([
      "Tokyo",
      "Minato",
      "cleaning"
    ]);
  });

  it("uses the shared glass header with only favorite, forward, and close actions", () => {
    const content = serviceDetailSource.slice(
      serviceDetailSource.indexOf("function ServiceDetailContent"),
      serviceDetailSource.indexOf("export function ServiceDetailPage")
    );

    expect(serviceDetailSource).toMatch(/import \{[^}]*MobileFullscreenHeader[^}]*\} from "\.\.\/\.\.\/components\/mobile\/MobileFullscreenHeader"/);
    expect(content).toContain("<MobileFullscreenHeader");
    expect(content).toContain('title="服务详情"');
    expect(content).toContain("onBack={() => navigate(-1)}");
    expect(content).toContain("onClose={() => navigate(-1)}");
    expect(content.indexOf('label="收藏"')).toBeLessThan(content.indexOf('label="转发"'));
    expect(content.indexOf('label="转发"')).toBeLessThan(content.indexOf('closeLabel="关闭服务详情"'));
    expect(serviceDetailSource).toContain('favorite: "heart"');
    expect(serviceDetailSource).toContain('forward: "share"');
    expect(serviceDetailSource).not.toContain('like: "heart"');
    expect(serviceDetailSource).not.toContain('favorite: "star"');
    expect(serviceDetailSource).not.toContain('translate: "globe"');
    expect(content).not.toContain("safe-header-top");
  });

  it("renders persisted service reviews instead of presenting usage count and tags as reviews", () => {
    expect(serviceDetailSource).toContain("coreReadApi.listServiceReviews");
    expect(serviceDetailSource).toContain("serviceReviewsQuery.data?.total");
    expect(serviceDetailSource).toContain("review.reviewer.displayName");
    expect(serviceDetailSource).toContain("review.createdAt");
    expect(serviceDetailSource).toContain("review.title || \"服务评价\"");
    expect(serviceDetailSource).toContain("review.comment");
    expect(serviceDetailSource).toContain("review.mediaAssets.map");
    expect(serviceDetailSource).toContain("review.rating.toFixed(1)");
    expect(serviceDetailSource).not.toContain("<Badge tone=\"green\">{service.sales} 条</Badge>");
    expect(serviceDetailSource).not.toContain("service.tags.join(\" / \")");
  });

  it("keeps reviewer identity above a titled bubble with media and the score at its lower left", () => {
    const markup = renderToStaticMarkup(
      createElement(ServiceReviewCard, {
        review: {
          id: 901,
          title: "非常专业",
          comment: "手法细致，沟通也很清楚。",
          rating: 5,
          createdAt: "2026-09-01T10:00:00.000Z",
          reviewer: { displayName: "小林", avatarUrl: "/media/reviewer.jpg" },
          mediaAssets: [
            {
              id: 801,
              url: "/media/reviews/901.jpg",
              mimeType: "image/jpeg",
              usageType: "review",
              width: 960,
              height: 720,
              altText: "服务完成后的照片",
              sortOrder: 0
            }
          ]
        }
      })
    );

    expect(markup).toContain("小林");
    expect(markup).toContain("2026年9月1日");
    expect(markup).toContain("非常专业");
    expect(markup).toContain("手法细致，沟通也很清楚。");
    expect(markup).toContain('alt="服务完成后的照片"');
    expect(markup).toContain("5.0 / 5");
    expect(markup.indexOf("小林")).toBeLessThan(markup.indexOf("非常专业"));
    expect(markup.indexOf("非常专业")).toBeLessThan(markup.indexOf("手法细致"));
    expect(markup.indexOf("手法细致")).toBeLessThan(markup.indexOf("5.0 / 5"));
  });

  it("shows the system avatar when a reviewer has none", () => {
    const markup = renderToStaticMarkup(createElement(ServiceReviewCard, {
      review: {
        id: 902,
        title: "",
        comment: "很好",
        rating: 5,
        createdAt: "2026-09-01T10:00:00.000Z",
        reviewer: { displayName: "小林", avatarUrl: null },
        mediaAssets: []
      }
    }));
    expect(markup).toContain('/images/generated/profiles/dodo-default-avatar.webp');
  });

  it("keeps the shared glass header and fades its lower edge into the page background", () => {
    expect(serviceDetailSource).toContain('className="service-detail-header"');
    expect(serviceDetailSource).toContain("<ServiceDetailHeaderFade />");
    expect(detailHeaderFadeSource).toContain("service-detail-header-fade");
    expect(clientStyles).not.toMatch(/\.service-detail-header\.client-floating-header-glass-frame\s*\{/s);
    expect(clientStyles).toMatch(/\.service-detail-header-fade\s*\{[^}]*linear-gradient/s);
  });

  it("uses the shared booking footer with amount, configured payment types, contact, and confirmation", () => {
    expect(serviceDetailSource).toContain("ServiceBookingActionBar");
    expect(serviceDetailSource).toContain("amountJpy={selectedPackage?.price ?? service.priceFrom}");
    expect(serviceDetailSource).toContain('contactTo="/messages"');
    expect(serviceDetailSource).toContain("confirmTo={checkoutHref}");
    for (const copy of ["应付金额", "支付方式", "联系", "确定预约"]) {
      expect(bookingActionBarSource).toContain(copy);
    }
    expect(bookingActionBarSource).toContain("usePlatformSettings");
    expect(bookingActionBarSource).toContain("MobileBottomActionBar");
    expect(bookingActionBarSource).not.toContain("PayPay");
  });
});
