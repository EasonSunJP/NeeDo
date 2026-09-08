import { describe, expect, it } from "vitest";
import { buildMapHeatScale, mapHeatColor, previousJstDate } from "./mapHeatScale";

describe("mapHeatScale", () => {
  it("uses the previous day's full regional range as fixed green and red endpoints", () => {
    const scale = buildMapHeatScale([{ previousDayOrderCount: 2 }, { previousDayOrderCount: 12 }, { previousDayOrderCount: 7 }]);
    expect(scale).toEqual({ minimum: 2, maximum: 12 });
    expect(mapHeatColor(0, scale)).toBe("#2f9e64");
    expect(mapHeatColor(2, scale)).toBe("#2f9e64");
    expect(mapHeatColor(12, scale)).toBe("#e34d59");
    expect(mapHeatColor(99, scale)).toBe("#e34d59");
  });

  it("moves through yellow and orange at stable intermediate values", () => {
    const scale = { minimum: 0, maximum: 100 };
    expect(mapHeatColor(50, scale)).toBe("#e2b93b");
    expect(mapHeatColor(75, scale)).toBe("#ef8b2c");
    expect(mapHeatColor(50, scale)).toBe(mapHeatColor(50, scale));
  });

  it("keeps an equal previous-day range green until today's count exceeds it", () => {
    const scale = buildMapHeatScale([{ previousDayOrderCount: 4 }, { previousDayOrderCount: 4 }]);
    expect(mapHeatColor(4, scale)).toBe("#2f9e64");
    expect(mapHeatColor(5, scale)).toBe("#e34d59");
  });

  it("derives the previous calendar date in Japan regardless of host timezone", () => {
    expect(previousJstDate("2026-09-07T15:05:00.000Z")).toBe("2026-09-07");
    expect(previousJstDate("2026-09-07T14:59:59.000Z")).toBe("2026-09-06");
  });
});
