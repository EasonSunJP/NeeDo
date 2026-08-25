import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { FormalStoreContent } from "./FormalStoreDetailPage";
import source from "./FormalStoreDetailPage.tsx?raw";
import type { CoreShopDetail } from "../../features/core-read/api";

describe("FormalStoreDetailPage real-data boundary", () => {
  it("loads the numeric shop through the core-read API", () => {
    expect(source).toContain("coreReadApi.getShopDetail(shopId)");
    expect(source).toContain("shop.services.map");
    expect(source).toContain("shop.technicians.map");
    expect(source).toContain("shop.reviewSummary");
    expect(source).toContain("const firstService = shop.services[0] ?? null;");
    expect(source).toContain('to={`/checkout/${firstService.id}`}');
  });

  it("does not depend on legacy or browser-local records", () => {
    expect(source).not.toContain("data/mock");
    expect(source).not.toContain("entityStore");
    expect(source).not.toContain("userOrderStore");
    expect(source).not.toContain("features/social");
  });

  it("does not render unsupported virtual store metrics or review rows", () => {
    ["acceptRate", "cancelRate", "favoriteCount", "shareCount", "shareContent", "Best", "newcomer", "review.author", "review.body"].forEach((token) => {
      expect(source).not.toContain(token);
    });
    expect(source).toContain("noPublicReviewDetails");
  });

  it("renders API records and only the first real service as the booking action", () => {
    const shop = {
      id: 1,
      name: "API Store",
      city: "Tokyo",
      address: "1-1",
      coverUrl: null,
      description: "Persisted description",
      phone: null,
      latitude: null,
      longitude: null,
      mediaAssets: [],
      createdAt: "2026-08-25T00:00:00.000Z",
      updatedAt: "2026-08-25T00:00:00.000Z",
      reviewSummary: { ratingAverage: "4.8", reviewCount: 2, latestReviewAt: null, highlights: ["Clean"] },
      services: [
        {
          id: 11, name: "Real Service One", description: null, city: "Tokyo", priceAmount: "6800", currency: "JPY", durationMinutes: 120, coverUrl: null,
          category: { id: 1, code: "care", name: "Care", nameJa: null, nameEn: null, parentId: null, iconUrl: null, sortOrder: 1, isActive: true, createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z" },
          shop: { id: 1, name: "API Store", city: "Tokyo", address: "1-1", coverUrl: null, reviewSummary: { ratingAverage: "4.8", reviewCount: 2, latestReviewAt: null, highlights: [] } },
          technician: null, reviewSummary: { ratingAverage: "4.8", reviewCount: 2, latestReviewAt: null, highlights: [] }
        },
        {
          id: 12, name: "Real Service Two", description: null, city: "Tokyo", priceAmount: "7800", currency: "JPY", durationMinutes: 90, coverUrl: null,
          category: { id: 1, code: "care", name: "Care", nameJa: null, nameEn: null, parentId: null, iconUrl: null, sortOrder: 1, isActive: true, createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z" },
          shop: { id: 1, name: "API Store", city: "Tokyo", address: "1-1", coverUrl: null, reviewSummary: { ratingAverage: "4.8", reviewCount: 2, latestReviewAt: null, highlights: [] } },
          technician: null, reviewSummary: { ratingAverage: "4.8", reviewCount: 2, latestReviewAt: null, highlights: [] }
        }
      ],
      technicians: [{ id: 21, displayName: "Real Technician", city: "Tokyo", avatarUrl: null, reviewSummary: { ratingAverage: "invalid", reviewCount: 1, latestReviewAt: null, highlights: [] } }]
    } satisfies CoreShopDetail;
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(FormalStoreContent, { language: "en", scope: "user", shop }))
    );

    expect(html).toContain("API Store");
    expect(html).toContain("Real Service One");
    expect(html).toContain("Real Technician");
    expect(html).toContain('href="/checkout/11"');
    expect(html).not.toContain('href="/checkout/12"');
    expect(html).not.toContain("NaN");

    const merchantHtml = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(FormalStoreContent, { language: "en", scope: "merchant", shop }))
    );

    expect(merchantHtml).not.toContain('href="/services/11"');
    expect(merchantHtml).not.toContain('href="/checkout/11"');
    expect(merchantHtml).toContain('href="/merchant/profiles/technician/21"');
  });

  it("uses multilingual fixed copy and neutral missing-image states", () => {
    expect(source).toContain("type FormalStoreDetailCopy");
    expect(source).toContain('zh: {');
    expect(source).toContain('"zh-Hant": {');
    expect(source).toContain('ja: {');
    expect(source).toContain('en: {');
    expect(source).toContain('ko: {');
    expect(source).toContain("InitialPlaceholder");
  });
});
