import { describe, expect, it } from "vitest";
import {
  IDENTITY_VIEWPORT,
  mapViewportTransform,
  panMapViewport,
  zoomMapViewport,
  type MapViewport
} from "./mapViewport";

const viewBox = [0, 0, 1000, 800] as const;
const center = [500, 400] as const;

function repeatZoom(viewport: MapViewport, direction: "in" | "out", count: number) {
  return Array.from({ length: count }).reduce<MapViewport>(
    (current) => zoomMapViewport(current, direction, center, viewBox),
    viewport
  );
}

describe("mapViewport", () => {
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

    expect(panMapViewport(zoomed, [100000, -100000], viewBox)).toEqual({ scale: 2, x: 500, y: -400 });
    expect(panMapViewport(zoomed, [-100000, 100000], viewBox)).toEqual({ scale: 2, x: -500, y: 400 });
    expect(mapViewportTransform(IDENTITY_VIEWPORT)).toBe("translate(0 0) scale(1)");
  });

  it("keeps valid current viewport unchanged for invalid pan delta or zoom inputs", () => {
    const current = { scale: 2, x: 120, y: -80 } as const;

    expect(panMapViewport(current, [Number.NaN, 10], viewBox)).toEqual(current);
    expect(panMapViewport(current, [10, Number.POSITIVE_INFINITY], viewBox)).toEqual(current);
    expect(zoomMapViewport(current, "in", [Number.NaN, 10], viewBox)).toEqual(current);
    expect(zoomMapViewport(current, "in", center, [0, 0, Number.NaN, 800])).toEqual(IDENTITY_VIEWPORT);
  });

  it("does not mutate inputs and remains deterministic", () => {
    const current = { scale: 2, x: 30, y: -40 } as const;
    const delta = [50, 70] as const;
    const anchor = [420, 380] as const;
    const before = { current: { ...current }, delta: [...delta], anchor: [...anchor], viewBox: [...viewBox] };

    const first = zoomMapViewport(panMapViewport(current, delta, viewBox), "in", anchor, viewBox);
    const second = zoomMapViewport(panMapViewport(current, delta, viewBox), "in", anchor, viewBox);

    expect(first).toEqual(second);
    expect({ current, delta, anchor, viewBox }).toEqual(before);
  });
});
