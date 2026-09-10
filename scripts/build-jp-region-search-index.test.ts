import catalog from "../backend/prisma/reference/jp-administrative-regions-2026.json";
import { describe, expect, it } from "vitest";
import { buildRegionSearchIndex } from "./build-jp-region-search-index.mjs";

describe("buildRegionSearchIndex", () => {
  const index = buildRegionSearchIndex(catalog);

  it("indexes all formal Japanese admin1 and admin2 regions", () => {
    expect(index.countryCode).toBe("JP");
    expect(index.sourceVersion).toBe("N03-20260101");
    expect(index.regions.filter((item) => item.level === "admin1")).toHaveLength(47);
    expect(index.regions.filter((item) => item.level === "admin2")).toHaveLength(1918);
    expect(new Set(index.regions.map((item) => item.code)).size).toBe(1965);
  });

  it("writes complete stable breadcrumbs for Tokyo and Shinjuku", () => {
    expect(index.regions.find((item) => item.code === "13")?.breadcrumbJa)
      .toEqual(["日本", "東京都"]);
    expect(index.regions.find((item) => item.code === "13104")?.breadcrumbJa)
      .toEqual(["日本", "東京都", "新宿区"]);
    expect(index.regions.map((item) => item.code))
      .toEqual([...index.regions.map((item) => item.code)].sort());
  });
});
