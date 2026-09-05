import { describe, expect, it } from "vitest";
import { createDashboardAxis } from "./dashboardChartScale";

describe("createDashboardAxis", () => {
  it.each([
    [0, 4],
    [12_000, 24_000],
    [-3, 7],
    [0.25, 1.75]
  ])("creates finite bounded coordinates for %s to %s", (first, second) => {
    const axis = createDashboardAxis([first, second]);

    expect(axis.minimum).toBeLessThanOrEqual(0);
    expect(axis.maximum).toBeGreaterThanOrEqual(Math.max(first, second));
    expect(axis.ticks).toContain(0);
    expect(new Set(axis.ticks).size).toBe(axis.ticks.length);
    for (const value of [first, second]) {
      expect(axis.y(value, 20, 200)).toBeGreaterThanOrEqual(20);
      expect(axis.y(value, 20, 200)).toBeLessThanOrEqual(220);
      expect(Number.isFinite(axis.y(value, 20, 200))).toBe(true);
    }
  });

  it("renders a single zero tick while retaining a nonzero internal range", () => {
    const axis = createDashboardAxis([0, 0]);
    expect(axis.ticks).toEqual([0]);
    expect(axis.maximum).toBeGreaterThan(axis.minimum);
    expect(Number.isFinite(axis.y(0, 20, 200))).toBe(true);
  });
});
