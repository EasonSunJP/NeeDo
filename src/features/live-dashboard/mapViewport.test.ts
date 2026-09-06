import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  IDENTITY_VIEWPORT,
  mapViewportTransform,
  panMapGesture,
  panMapViewport,
  zoomMapViewport,
  type MapViewport
} from "./mapViewport";

const viewBox = [0, 0, 1000, 800] as const;
const center = [500, 400] as const;
type MapAsset = { viewBox: [number, number, number, number]; regions: { code: string; labelPoint: [number, number] }[] };
const readAsset = (file: string): MapAsset => JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/maps/jp/2026", file), "utf8"));
const country = readAsset("country.json");
const tokyo = readAsset("prefectures/13.json");
const okinawa = readAsset("prefectures/47.json");
const screenPoint = (point: readonly [number, number], viewport: MapViewport) =>
  [point[0] * viewport.scale + viewport.x, point[1] * viewport.scale + viewport.y] as const;

function repeatZoom(viewport: MapViewport, direction: "in" | "out", count: number) {
  return Array.from({ length: count }).reduce<MapViewport>(
    (current) => zoomMapViewport(current, direction, center, viewBox),
    viewport
  );
}

describe("mapViewport", () => {
  it.each([["47", country], ["47357", okinawa], ["47358", okinawa]] as const)("crosses empty sea with continuous small deltas to region %s", (code, asset) => {
    const [, , width, height] = asset.viewBox;
    const points = asset.regions.map((region) => region.labelPoint);
    const anchor = asset.regions.find((region) => region.code === code)!.labelPoint;
    let viewport: MapViewport = { scale: 4, x: -width * 1.5, y: -height * 1.5 };
    let intent = viewport;
    const target = panMapViewport(viewport, [width / 2 - screenPoint(anchor, viewport)[0], height / 2 - screenPoint(anchor, viewport)[1]], asset.viewBox);
    const steps = Math.ceil(Math.max(Math.abs(target.x - viewport.x), Math.abs(target.y - viewport.y)) / 10);
    const delta = [(target.x - viewport.x) / steps, (target.y - viewport.y) / steps] as const;
    const transforms = new Set<string>();
    for (let step = 0; step < steps; step++) {
      ({ intent, viewport } = panMapGesture(intent, delta, asset.viewBox, points));
      transforms.add(mapViewportTransform(viewport));
      expect(points.some((point) => {
        const [x, y] = screenPoint(point, viewport);
        return x >= 0 && x <= width && y >= 0 && y <= height;
      })).toBe(true);
    }
    expect(transforms.size).toBeGreaterThan(8);
    const [x, y] = screenPoint(anchor, viewport);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(width);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(height);
  });

  it("zooms around the selected anchor without moving it and clamps at 1x and 4x", () => {
    const zoomed = zoomMapViewport(IDENTITY_VIEWPORT, "in", [320, 180], viewBox);

    expect(zoomed).toEqual({ scale: 1.5, x: -160, y: -90 });
    expect(zoomed.scale * 320 + zoomed.x).toBe(320);
    expect(zoomed.scale * 180 + zoomed.y).toBe(180);
    expect(repeatZoom(IDENTITY_VIEWPORT, "out", 3)).toEqual(IDENTITY_VIEWPORT);
    expect(repeatZoom(IDENTITY_VIEWPORT, "in", 10).scale).toBe(4);
  });

  it("clamps pan in both directions and resets with the exact identity transform", () => {
    const zoomed = { scale: 2, x: 0, y: 0 };

    expect(panMapViewport(zoomed, [100000, -100000], viewBox)).toEqual({ scale: 2, x: 0, y: -800 });
    expect(panMapViewport(zoomed, [-100000, 100000], viewBox)).toEqual({ scale: 2, x: -1000, y: 0 });
    expect(mapViewportTransform(IDENTITY_VIEWPORT)).toBe("translate(0 0) scale(1)");
  });

  it("keeps valid current viewport unchanged for invalid pan delta or zoom inputs", () => {
    const current = { scale: 2, x: -120, y: -80 } as const;

    expect(panMapViewport(current, [Number.NaN, 10], viewBox)).toEqual(current);
    expect(panMapViewport(current, [10, Number.POSITIVE_INFINITY], viewBox)).toEqual(current);
    expect(zoomMapViewport(current, "in", [Number.NaN, 10], viewBox)).toEqual(current);
    expect(zoomMapViewport(current, "in", center, [0, 0, Number.NaN, 800])).toEqual(IDENTITY_VIEWPORT);
  });

  it("does not mutate inputs and remains deterministic", () => {
    const current = { scale: 2, x: -30, y: -40 } as const;
    const delta = [50, 70] as const;
    const anchor = [420, 380] as const;
    const before = { current: { ...current }, delta: [...delta], anchor: [...anchor], viewBox: [...viewBox] };

    const first = zoomMapViewport(panMapViewport(current, delta, viewBox), "in", anchor, viewBox);
    const second = zoomMapViewport(panMapViewport(current, delta, viewBox), "in", anchor, viewBox);

    expect(first).toEqual(second);
    expect({ current, delta, anchor, viewBox }).toEqual(before);
  });

  it("keeps the real Ogasawara anchor in place through every zoom level and back to identity", () => {
    const anchor = tokyo.regions.find((region) => region.code === "13421")!.labelPoint;
    let viewport = IDENTITY_VIEWPORT;
    for (const direction of ["in", "out"] as const) {
      for (let step = 0; step < 6; step++) {
        viewport = zoomMapViewport(viewport, direction, screenPoint(anchor, viewport), tokyo.viewBox);
        expect(screenPoint(anchor, viewport)[0]).toBeCloseTo(anchor[0]);
        expect(screenPoint(anchor, viewport)[1]).toBeCloseTo(anchor[1]);
      }
    }
    expect(viewport).toEqual(IDENTITY_VIEWPORT);
  });

  it("does not translate all 47 country anchors outside the viewport at maximum positive pan", () => {
    let viewport = IDENTITY_VIEWPORT;
    for (let step = 0; step < 6; step++) viewport = zoomMapViewport(viewport, "in", [500, 600], country.viewBox);
    viewport = panMapViewport(viewport, [100000, 100000], country.viewBox, country.regions.map((region) => region.labelPoint));
    const visible = country.regions.filter((region) => {
      const [x, y] = screenPoint(region.labelPoint, viewport);
      return x >= 0 && x <= country.viewBox[2] && y >= 0 && y <= country.viewBox[3];
    });
    expect(visible.length).toBeGreaterThan(0);
  });

  it("keeps the transformed map canvas covering the full viewport for extreme pans and offset origins", () => {
    for (const box of [country.viewBox, tokyo.viewBox, [100, -200, 1000, 800] as const]) {
      const [left, top, width, height] = box;
      for (let scale = 1; scale <= 4; scale += 0.5) {
        const current = { scale, x: (1 - scale) * (left + width / 2), y: (1 - scale) * (top + height / 2) };
        for (const dx of [-100000, -37, 0, 37, 100000]) {
          for (const dy of [-100000, -37, 0, 37, 100000]) {
            const viewport = panMapViewport(current, [dx, dy], box);
            const [x1, y1] = screenPoint([left, top], viewport);
            const [x2, y2] = screenPoint([left + width, top + height], viewport);
            expect(x1).toBeLessThanOrEqual(left);
            expect(y1).toBeLessThanOrEqual(top);
            expect(x2).toBeGreaterThanOrEqual(left + width);
            expect(y2).toBeGreaterThanOrEqual(top + height);
            if (scale === 1) expect(viewport).toEqual(IDENTITY_VIEWPORT);
          }
        }
      }
    }
  });

  it("makes every real country and Tokyo anchor reachable at 4x including all four edges", () => {
    for (const asset of [country, tokyo]) {
      const [, , width, height] = asset.viewBox;
      const zoomed = { scale: 4, x: -width * 1.5, y: -height * 1.5 };
      for (const { labelPoint } of asset.regions) {
        const before = screenPoint(labelPoint, zoomed);
        const viewport = panMapViewport(zoomed, [width / 2 - before[0], height / 2 - before[1]], asset.viewBox, asset.regions.map((region) => region.labelPoint));
        const [x, y] = screenPoint(labelPoint, viewport);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(width);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(height);
      }
    }
  });

  it("keeps real content visible at every pan extreme and zoom level", () => {
    for (const asset of [country, tokyo]) {
      const [left, top, width, height] = asset.viewBox;
      const points = asset.regions.map((region) => region.labelPoint);
      const expectVisible = (viewport: MapViewport) => expect(points.some((point) => {
        const [x, y] = screenPoint(point, viewport);
        return x >= left && x <= left + width && y >= top && y <= top + height;
      })).toBe(true);
      let viewport = IDENTITY_VIEWPORT;
      for (let step = 0; step < 6; step++) {
        viewport = zoomMapViewport(viewport, "in", [left, top], asset.viewBox, points);
        expectVisible(viewport);
        for (const dx of [-100000, 0, 100000]) {
          for (const dy of [-100000, 0, 100000]) {
            expectVisible(panMapViewport(viewport, [dx, dy], asset.viewBox, points));
          }
        }
      }
    }
  });

  it("ignores invalid content points and corrects empty space deterministically without mutating inputs", () => {
    const current = { scale: 4, x: -1500, y: -1800 };
    const delta = [100000, 100000] as const;
    const points = country.regions.map((region) => region.labelPoint);
    const before = JSON.stringify({ current, delta, points });
    const first = panMapViewport(current, delta, country.viewBox, points);
    const invalid = [[Number.NaN, 0], [0, Number.POSITIVE_INFINITY], [-1000, -1000]] as const;
    expect(panMapViewport(current, delta, country.viewBox, [...invalid, ...points])).toEqual(first);
    expect(panMapViewport(current, delta, country.viewBox, points)).toEqual(first);
    expect(panMapViewport(current, delta, country.viewBox, invalid)).toEqual(panMapViewport(current, delta, country.viewBox));
    expect(JSON.stringify({ current, delta, points })).toBe(before);
    expect(first.scale).toBe(4);
  });
});
