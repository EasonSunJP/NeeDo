import { describe, expect, it } from "vitest";
import appSource from "../../App.tsx?raw";
import navSource from "../../components/admin/AdminLayout.tsx?raw";
import { translateText } from "../../i18n/translations";
import source from "./ServiceSearchAnalyticsPage.tsx?raw";
import { buildSearchAnalyticsFilter } from "./ServiceSearchAnalyticsPage";

describe("formal service taxonomy and search analytics console", () => {
  it("uses an exclusive Tokyo natural-day range for every period", () => {
    const now = new Date("2026-09-03T05:00:00.000Z");
    expect(buildSearchAnalyticsFilter("today", { now })).toEqual({
      startAt: "2026-09-02T15:00:00.000Z",
      endAt: "2026-09-03T15:00:00.000Z"
    });
    expect(buildSearchAnalyticsFilter("last7days", { now, city: " 東京都 ", categoryId: 8 })).toEqual({
      startAt: "2026-08-27T15:00:00.000Z",
      endAt: "2026-09-03T15:00:00.000Z",
      city: "東京都",
      categoryId: 8
    });
    expect(buildSearchAnalyticsFilter("custom", {
      now,
      customStart: "2026-08-01",
      customEnd: "2026-08-31"
    })).toEqual({
      startAt: "2026-07-31T15:00:00.000Z",
      endAt: "2026-08-31T15:00:00.000Z"
    });
  });

  it("rejects an invalid custom range before issuing a request", () => {
    expect(() => buildSearchAnalyticsFilter("custom", {
      customStart: "2026-09-03",
      customEnd: "2026-09-02"
    })).toThrow("自定义时间范围无效");
  });

  it("uses only formal APIs and gates mutations by write permission", () => {
    for (const method of [
      "listCategories",
      "listKeywords",
      "listAliases",
      "createCategory",
      "updateCategory",
      "createKeyword",
      "updateKeyword",
      "createAlias",
      "updateAlias",
      "topKeywords",
      "keywordTrend"
    ]) expect(source).toContain(`serviceSearchAnalyticsApi.${method}`);
    expect(source).toContain('hasPermission("backoffice:service-taxonomy:write")');
    expect(source).not.toContain("mock");
    expect(source).not.toContain("localStorage");
  });

  it("keeps raw search counts distinct from the normalized display index", () => {
    expect(source).toContain("原始搜索次数");
    expect(source).toContain("归一化趋势指数（0–100）");
    expect(source).toContain("normalizedIndex");
    expect(source).toContain("rawCount");
    expect(source).toContain("aria-pressed={shown}");
  });

  it("is available through the protected settings route and translated navigation", () => {
    expect(appSource).toContain('path="/admin/settings/service-search"');
    expect(appSource).toContain('"backoffice:service-taxonomy:read"');
    expect(navSource).toContain('to: "/admin/settings/service-search"');
    expect(translateText("运营服务类型设置", "ja")).toBe("運営サービスタイプ設定");
    expect(translateText("原始搜索次数", "en")).toBe("Raw search count");
  });
});
