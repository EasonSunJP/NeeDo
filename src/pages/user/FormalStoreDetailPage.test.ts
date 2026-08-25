import { describe, expect, it } from "vitest";
import source from "./FormalStoreDetailPage.tsx?raw";

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
    ["acceptRate", "cancelRate", "favorite", "share", "Best", "newcomer", "review.author", "review.body"].forEach((token) => {
      expect(source).not.toContain(token);
    });
    expect(source).toContain("noPublicReviewDetails");
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
