import { describe, expect, it } from "vitest";
import {
  formatDashboardChange,
  formatDashboardNumber,
  formatDashboardValue,
  normalizeDashboardNumber
} from "./dashboardFormat";

describe("dashboardFormat", () => {
  it("formats finite numbers with the selected application locale", () => {
    expect(formatDashboardNumber(12345.5, "zh", 1)).toBe("12,345.5");
    expect(formatDashboardNumber(12345.5, "ja", 1)).toBe("12,345.5");
    expect(formatDashboardNumber(12345.5, "de" as never, 1)).toBe("12,345.5");
  });

  it("never renders NaN or Infinity from an invalid aggregate", () => {
    expect(normalizeDashboardNumber(Number.NaN)).toBe(0);
    expect(normalizeDashboardNumber(Number.POSITIVE_INFINITY)).toBe(0);
    expect(formatDashboardNumber(Number.NEGATIVE_INFINITY, "en")).toBe("0");
  });

  it("keeps the numeric value separate from the translated unit", () => {
    expect(formatDashboardValue(1280, "jpy", "en")).toEqual({ number: "1,280", unit: "JPY" });
    expect(formatDashboardValue(16.25, "hours", "zh")).toEqual({ number: "16.25", unit: "小时" });
    expect(formatDashboardValue(52, "ndp", "ja")).toEqual({ number: "52", unit: "NDP" });
  });

  it("describes positive, negative, zero, and missing comparison baselines", () => {
    expect(formatDashboardChange(12.5)).toEqual({ direction: "positive", label: "+12.5%" });
    expect(formatDashboardChange(-4)).toEqual({ direction: "negative", label: "-4%" });
    expect(formatDashboardChange(0)).toEqual({ direction: "zero", label: "0%" });
    expect(formatDashboardChange(null)).toEqual({ direction: "unavailable", label: "—" });
  });
});
