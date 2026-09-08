import { describe, expect, it } from "vitest";
import {
  adjustTechnicianSettlementShare,
  resolveSettlementSplit,
} from "./settlementSplit";

describe("pricing-mode settlement split", () => {
  it("derives a shop and technician split whose total is exactly 100 percent", () => {
    expect(resolveSettlementSplit(30)).toEqual({
      shopSharePercent: 70,
      technicianSharePercent: 30,
    });
  });

  it("keeps ten-point adjustments inside the supported settlement range", () => {
    expect(adjustTechnicianSettlementShare(90, 10)).toBe(100);
    expect(adjustTechnicianSettlementShare(100, 10)).toBe(100);
    expect(adjustTechnicianSettlementShare(10, -10)).toBe(10);
    expect(adjustTechnicianSettlementShare(55, 10)).toBe(65);
  });

  it("normalizes stale legacy multipliers without allowing a total above 100", () => {
    expect(resolveSettlementSplit(200)).toEqual({
      shopSharePercent: 0,
      technicianSharePercent: 100,
    });
  });
});
