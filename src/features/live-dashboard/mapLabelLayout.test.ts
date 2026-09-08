import { describe, expect, it } from "vitest";
import { boxesOverlap, labelLimitForZoom, layoutMapLabels, PRIMARY_ADMIN1_LABEL_CODES, type MapLabelPlacement, type MapLabelRegion } from "./mapLabelLayout";

const region = (code: string, point: [number, number], nameJa = `地区${code}`): MapLabelRegion => ({ code, nameJa, labelPoint: point });
const viewBox = [0, 0, 800, 400] as const;
const noOverlaps = (items: MapLabelPlacement[]) => items.every((item, index) => items.slice(index + 1).every((other) => !boxesOverlap(item, other, 4)));

describe("Google-style map label disclosure", () => {
  it("keeps only collision-free internal labels and never creates external callouts", () => {
    const placements = layoutMapLabels({
      regions: [region("13", [200, 200], "東京都"), region("27", [203, 201], "大阪府"), region("01", [500, 100], "北海道")],
      viewBox,
      viewport: { scale: 1, x: 0, y: 0 },
      priorityCodes: PRIMARY_ADMIN1_LABEL_CODES,
      maximumLabels: 10,
      fontSize: 11,
      capacity: "partial"
    });
    expect(placements.map((item) => item.code)).toEqual(["13", "01"]);
    expect(placements.every((item) => !item.external && item.leader.length === 0)).toBe(true);
    expect(noOverlaps(placements)).toBe(true);
  });

  it("prioritizes selected and hovered regions before major places", () => {
    const placements = layoutMapLabels({
      regions: [region("13", [100, 100]), region("47", [102, 101]), region("09", [104, 102])],
      viewBox,
      viewport: { scale: 1, x: 0, y: 0 },
      priorityCodes: PRIMARY_ADMIN1_LABEL_CODES,
      selectedCode: "09",
      maximumLabels: 1,
      fontSize: 11,
      capacity: "partial"
    });
    expect(placements.map((item) => item.code)).toEqual(["09"]);
  });

  it("reveals progressively more labels as zoom increases", () => {
    expect(labelLimitForZoom("admin1", 1, 47)).toBe(12);
    expect(labelLimitForZoom("admin1", 2, 47)).toBeGreaterThan(12);
    expect(labelLimitForZoom("admin1", 4, 47)).toBeGreaterThan(labelLimitForZoom("admin1", 2, 47));
    expect(labelLimitForZoom("admin1", 8, 47)).toBe(47);
    expect(labelLimitForZoom("admin2", 8, 1918)).toBeLessThanOrEqual(120);
  });

  it("omits anchors outside the visible map viewport", () => {
    const placements = layoutMapLabels({
      regions: [region("13", [100, 100]), region("27", [900, 900])],
      viewBox,
      viewport: { scale: 1, x: 0, y: 0 },
      maximumLabels: 10,
      fontSize: 11,
      capacity: "partial"
    });
    expect(placements.map((item) => item.code)).toEqual(["13"]);
  });
});
