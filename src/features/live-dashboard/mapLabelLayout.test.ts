import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { boxesOverlap, layoutMapLabels, type MapLabelPlacement, type MapLabelRegion } from "./mapLabelLayout";

const identityViewport = { scale: 1, x: 0, y: 0 };
const viewBox: [number, number, number, number] = [0, 0, 1000, 800];
const region = (code: string, labelPoint: [number, number], nameJa = "新宿区"): MapLabelRegion => ({ code, labelPoint, nameJa });
const overlappingPairs = (placements: MapLabelPlacement[]) => placements.flatMap((a, index) =>
  placements.slice(index + 1).filter((b) => boxesOverlap(a, b)).map((b) => [a.code, b.code]));

function expectContained(placements: MapLabelPlacement[], bounds: typeof viewBox) {
  for (const item of placements) {
    expect(item.label[0] - item.width / 2).toBeGreaterThanOrEqual(bounds[0]);
    expect(item.label[0] + item.width / 2).toBeLessThanOrEqual(bounds[0] + bounds[2]);
    expect(item.label[1] - item.height / 2).toBeGreaterThanOrEqual(bounds[1]);
    expect(item.label[1] + item.height / 2).toBeLessThanOrEqual(bounds[1] + bounds[3]);
  }
}

describe("layoutMapLabels", () => {
  it.each([[880, 220], [640, 390], [600, 250]])("keeps all Japan, Tokyo and Okinawa labels readable at %ix%i", (width, height) => {
    for (const name of ["country", "prefectures/13", "prefectures/47"]) {
      const asset = JSON.parse(fs.readFileSync(path.join(process.cwd(), `public/maps/jp/2026/${name}.json`), "utf8"));
      const scale = Math.min(width / asset.viewBox[2], height / asset.viewBox[3]);
      const bounds = [0, 0, width, height] as typeof viewBox;
      const placements = layoutMapLabels({ regions: asset.regions, viewBox: bounds, fontSize: 11, viewport: { scale, x: (width - asset.viewBox[2] * scale) / 2, y: (height - asset.viewBox[3] * scale) / 2 } });
      expect(placements).toHaveLength(asset.regions.length);
      expect(overlappingPairs(placements)).toEqual([]);
      expectContained(placements, bounds);
      placements.forEach((item) => {
        expect(item.height).toBe(17);
        if (item.external) expect(item.leader).toHaveLength(2);
      });
    }
  });
  it("explicitly permits deterministic partial disclosure at physical pixel capacity", () => {
    const regions = Array.from({ length: 80 }, (_, index) => region(String(index), [150, 100]));
    const input = { regions, viewBox: [0, 0, 300, 200] as typeof viewBox, viewport: identityViewport, selectedCode: "79", fontSize: 11, capacity: "partial" as const };
    const placements = layoutMapLabels(input);
    expect(placements.length).toBeGreaterThan(0);
    expect(placements.length).toBeLessThan(regions.length);
    expect(placements[0].code).toBe("79");
    expect(placements[0].height).toBe(17);
    expect(overlappingPairs(placements)).toEqual([]);
    expectContained(placements, input.viewBox);
    expect(layoutMapLabels(input)).toEqual(placements);
  });
  it("retains separated internal labels and estimates boxes in viewBox units", () => {
    const placements = layoutMapLabels({ regions: [region("01", [200, 200]), region("02", [500, 500], "村")], viewBox, viewport: identityViewport });
    expect(placements.find((item) => item.code === "01")).toMatchObject({ label: [200, 200], width: 61, height: 28, external: false, leader: [] });
    expect(placements.find((item) => item.code === "02")?.width).toBe(48);
    expect(overlappingPairs(placements)).toEqual([]);
  });

  it.each(["country.json", "prefectures/13.json", "prefectures/01.json"])("lays out every real region in %s without overlap", (file) => {
    const asset = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/maps/jp/2026", file), "utf8")) as { regions: MapLabelRegion[]; viewBox: typeof viewBox };
    const input = { ...asset, viewport: identityViewport, selectedCode: "13104", orderCountByCode: { "13104": 12, "13101": 8 } };
    const placements = layoutMapLabels(input);
    expect(placements).toHaveLength(asset.regions.length);
    expect(overlappingPairs(placements)).toEqual([]);
    expectContained(placements, asset.viewBox);
    expect(layoutMapLabels(input)).toEqual(placements);
    expect(layoutMapLabels({ ...input, regions: [...asset.regions].reverse() })).toEqual(placements);
    expect(placements.some((item) => item.external)).toBe(true);
    if (file.includes("13")) expect(placements.find((item) => item.code === "13104")).toBeDefined();
    for (const item of placements.filter((placement) => placement.external)) {
      expect(item.leader.length).toBeGreaterThanOrEqual(2);
      expect(item.leader.length).toBeLessThanOrEqual(3);
      expect(item.leader[0]).toEqual(item.anchor);
      const end = item.leader.at(-1)!;
      expect(Math.abs(end[0] - item.label[0]) > item.width / 2 || Math.abs(end[1] - item.label[1]) > item.height / 2).toBe(true);
    }
  });

  it("keeps dense island callouts inside offset bounds with selected priority", () => {
    const bounds: typeof viewBox = [100, 200, 1000, 800];
    const regions = Array.from({ length: 80 }, (_, index) => region(String(13000 + index), [600 + index % 3, 600 + index % 4]));
    const placements = layoutMapLabels({ regions, viewBox: bounds, viewport: identityViewport, selectedCode: "13079" });
    expect(placements).toHaveLength(80);
    expect(placements[0]).toMatchObject({ code: "13079", external: false });
    expect(overlappingPairs(placements)).toEqual([]);
    expectContained(placements, bounds);
  });

  it("prioritizes selection, positive order counts, smaller boxes, and administrative code", () => {
    const regions = [region("04", [500, 400]), region("03", [500, 400]), region("02", [500, 400], "村"), region("01", [500, 400]), region("05", [500, 400])];
    const placements = layoutMapLabels({ regions, viewBox, viewport: identityViewport, selectedCode: "05", orderCountByCode: { "04": 1 } });
    expect(placements.map((item) => item.code)).toEqual(["05", "04", "02", "01", "03"]);
    expect(placements[0].external).toBe(false);
  });

  it("transforms anchors at 2x zoom while keeping label size constant", () => {
    const placements = layoutMapLabels({ regions: [region("01", [200, 180]), region("02", [900, 790])], viewBox, viewport: { scale: 2, x: -50, y: 30 } });
    expect(placements[0]).toMatchObject({ anchor: [350, 390], label: [350, 390], width: 61, height: 28, external: false });
    expect(placements[1]).toMatchObject({ anchor: [1750, 1610], external: true });
    expectContained(placements, viewBox);
  });

  it("uses the nearest perimeter slot for an edge anchor", () => {
    const [placement] = layoutMapLabels({ regions: [region("01", [2, 400])], viewBox, viewport: identityViewport });
    expect(placement.external).toBe(true);
    expect(placement.label[0]).toBeLessThan(100);
    expect(placement.label[1]).toBe(400);
    expectContained([placement], viewBox);
  });

  it("omits null anchors, accepts empty input, and does not mutate frozen input", () => {
    const regions = Object.freeze([Object.freeze({ code: "01", nameJa: "村", labelPoint: null })]);
    expect(layoutMapLabels(Object.freeze({ regions, viewBox, viewport: Object.freeze(identityViewport) }))).toEqual([]);
    expect(layoutMapLabels({ regions: [], viewBox, viewport: identityViewport })).toEqual([]);
  });

  it("treats touching boxes as non-overlapping and detects containment", () => {
    const a = { label: [20, 20] as [number, number], width: 20, height: 20 };
    expect(boxesOverlap(a, { ...a, label: [40, 20] })).toBe(false);
    expect(boxesOverlap(a, { ...a, label: [39, 20] })).toBe(true);
    expect(boxesOverlap(a, { ...a, width: 10, height: 10 })).toBe(true);
  });

  it("throws the explicit capacity RangeError when a label is oversized", () => {
    const layout = () => layoutMapLabels({ regions: [region("01", [40, 40], "非常に長い行政区域の名前")], viewBox: [0, 0, 80, 80], viewport: identityViewport });
    expect(layout).toThrow(RangeError);
    expect(layout).toThrow("map_label_layout_capacity_exceeded");
  });

  it("throws the explicit capacity RangeError when available slots are exhausted", () => {
    const layout = () => layoutMapLabels({ regions: [region("01", [40, 25]), region("02", [40, 25])], viewBox: [0, 0, 80, 50], viewport: identityViewport });
    expect(layout).toThrow(RangeError);
    expect(layout).toThrow("map_label_layout_capacity_exceeded");
  });

  it("preserves ordinary non-null region anchors, input order, viewport and order counts", () => {
    const input = {
      regions: [region("03", [505, 401]), region("01", [500, 400]), region("02", [503, 402])],
      viewBox,
      viewport: { scale: 2, x: -500, y: -400 },
      selectedCode: "02",
      orderCountByCode: { "03": 4 }
    };
    const before = structuredClone(input);
    for (const item of input.regions) {
      Object.freeze(item.labelPoint);
      Object.freeze(item);
    }
    Object.freeze(input.regions);
    Object.freeze(input.viewport);
    Object.freeze(input.orderCountByCode);
    Object.freeze(input);
    expect(layoutMapLabels(input)).toHaveLength(3);
    expect(input).toEqual(before);
  });

  it("extends exhausted perimeter rails in aligned edge rows outside the anchor cluster", () => {
    const bounds: typeof viewBox = [100, 200, 1000, 800];
    const regions = Array.from({ length: 100 }, (_, index) => region(String(13000 + index), [600 + index % 3, 600 + index % 4]));
    const placements = layoutMapLabels({ regions, viewBox: bounds, viewport: identityViewport });
    const external = placements.filter((item) => item.external);
    const insets = (item: MapLabelPlacement) => [
      item.label[0] - item.width / 2 - bounds[0],
      bounds[0] + bounds[2] - item.label[0] - item.width / 2,
      item.label[1] - item.height / 2 - bounds[1],
      bounds[1] + bounds[3] - item.label[1] - item.height / 2
    ];
    const inner = external.filter((item) => insets(item).every((inset) => inset > 8));
    expect(placements).toHaveLength(regions.length);
    expect(inner.length).toBeGreaterThan(0);
    expect(overlappingPairs(placements)).toEqual([]);
    expectContained(placements, bounds);
    for (const item of inner) {
      // Each additional row advances by one full box and the existing four-unit gap.
      expect(insets(item).some((inset, side) => {
        const size = side < 2 ? item.width : item.height;
        const dimension = side < 2 ? bounds[2] : bounds[3];
        return (inset - 8) % (size + 4) === 0 && inset + size <= dimension / 3;
      })).toBe(true);
      expect(boxesOverlap(item, { label: [601, 601], width: 220, height: 180 })).toBe(false);
      expect(item.external).toBe(true);
      expect(item.leader).toHaveLength(2);
      expect(item.leader[0]).toEqual(item.anchor);
    }
    expect(layoutMapLabels({ regions: [...regions].reverse(), viewBox: bounds, viewport: identityViewport })).toEqual(placements);
  });

  it("retains every Hokkaido label at the reported 2x downward pan boundary", () => {
    const asset = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/maps/jp/2026/prefectures/01.json"), "utf8")) as { regions: MapLabelRegion[] };
    const placements = layoutMapLabels({ ...asset, viewBox, viewport: { scale: 2, x: 0, y: -400 } });
    expect(placements).toHaveLength(195);
    expect(overlappingPairs(placements)).toEqual([]);
    expectContained(placements, viewBox);
  });

  it.each(["country.json", ...fs.readdirSync(path.join(process.cwd(), "public/maps/jp/2026/prefectures")).map((file) => `prefectures/${file}`)])(
    "retains every %s label across the complete supported zoom and pan boundary matrix", (file) => {
      const asset = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/maps/jp/2026", file), "utf8")) as { regions: MapLabelRegion[]; viewBox: typeof viewBox };
      for (const scale of [1, 1.5, 2, 2.5, 3, 3.5, 4]) {
        for (const xFraction of scale === 1 ? [0] : [-1, 0, 1]) {
          for (const yFraction of scale === 1 ? [0] : [-1, 0, 1]) {
            const viewport = { scale, x: (scale - 1) * asset.viewBox[2] / 2 * xFraction, y: (scale - 1) * asset.viewBox[3] / 2 * yFraction };
            let placements: MapLabelPlacement[] = [];
            expect(() => { placements = layoutMapLabels({ ...asset, viewport }); }, JSON.stringify(viewport)).not.toThrow();
            expect(placements).toHaveLength(asset.regions.filter((item) => item.labelPoint !== null).length);
            expect(overlappingPairs(placements)).toEqual([]);
            expectContained(placements, asset.viewBox);
          }
        }
      }
    }
  );
});
