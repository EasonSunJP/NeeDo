import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadRegionSearchIndex,
  scopeForRegion,
  searchRegions,
  type RegionSearchIndex
} from "./regionSearch";

const index = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/maps/jp/2026/search-index.json"), "utf8")) as RegionSearchIndex;
const tokyo = index.regions.find((entry) => entry.code === "13")!;
const shinjuku = index.regions.find((entry) => entry.code === "13104")!;

describe("regionSearch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("normalizes names and codes and returns stable nationwide paths", () => {
    expect(searchRegions(index, " 新宿 ").map((item) => item.code)).toEqual(["13104"]);
    expect(searchRegions(index, "１３１０４")[0]?.breadcrumbJa).toEqual(["日本", "東京都", "新宿区"]);
    expect(searchRegions(index, "13104")[0]?.breadcrumbJa).toEqual(["日本", "東京都", "新宿区"]);
  });

  it("maps admin1 and admin2 results while retaining the selected period", () => {
    expect(scopeForRegion(tokyo, "last30days")).toEqual({ country: "JP", admin1: "13", period: "last30days" });
    expect(scopeForRegion(shinjuku, "last7days")).toEqual({ country: "JP", admin1: "13", admin2: "13104", period: "last7days" });
  });

  it("returns no results for blanks or unknown queries and applies a stable limit", () => {
    expect(searchRegions(index, "   ")).toEqual([]);
    expect(searchRegions(index, "不存在")).toEqual([]);
    expect(searchRegions(index, "市", 3)).toHaveLength(3);
    expect(searchRegions(index, "市", 3).map((entry) => entry.code)).toEqual(searchRegions(index, "市", 3).map((entry) => entry.code));
  });

  it("orders exact matches, prefixes, contains matches, levels, and codes deterministically", () => {
    const controlledIndex: RegionSearchIndex = {
      countryCode: "JP",
      sourceVersion: "N03-20260101",
      regions: [
        { code: "19999", level: "admin2", parentCode: "19", nameJa: "x", breadcrumbJa: ["日本", "十九県", "x"] },
        { code: "20000", level: "admin2", parentCode: "20", nameJa: "x-prefecture-child", breadcrumbJa: ["日本", "二十県", "x-prefecture-child"] },
        { code: "13", level: "admin1", parentCode: "JP", nameJa: "x-prefecture", breadcrumbJa: ["日本", "x-prefecture"] },
        { code: "19998", level: "admin2", parentCode: "19", nameJa: "before-x-after", breadcrumbJa: ["日本", "十九県", "before-x-after"] },
        { code: "12", level: "admin1", parentCode: "JP", nameJa: "also-x", breadcrumbJa: ["日本", "also-x"] }
      ]
    };

    expect(searchRegions(controlledIndex, "x").map((entry) => entry.code))
      .toEqual(["19999", "13", "20000", "12", "19998"]);
  });

  it("rejects extra fields, duplicate codes, invalid parents, counts, and non-N03 versions", async () => {
    const invalidIndexes = [
      { ...index, sourceVersion: "wrong" },
      { ...index, unexpected: true },
      { ...index, regions: [...index.regions, index.regions[0]] },
      { ...index, regions: index.regions.map((entry) => entry.code === "13104" ? { ...entry, parentCode: "14" } : entry) },
      { ...index, regions: index.regions.slice(1) }
    ];

    for (const invalidIndex of invalidIndexes) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => invalidIndex }));
      await expect(loadRegionSearchIndex(new AbortController().signal)).rejects.toThrow("invalid_region_index");
      vi.unstubAllGlobals();
    }
  });

  it("uses only the local index URL and propagates abort signals", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockRejectedValue(controller.signal.reason);
    vi.stubGlobal("fetch", fetchMock);
    controller.abort(new DOMException("cancelled", "AbortError"));
    await expect(loadRegionSearchIndex(controller.signal)).rejects.toThrow("cancelled");
    expect(fetchMock).toHaveBeenCalledWith("/maps/jp/2026/search-index.json", { signal: controller.signal });
  });
});
