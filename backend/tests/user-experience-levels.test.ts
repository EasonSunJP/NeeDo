import {
  USER_EXPERIENCE_THRESHOLDS,
  USER_EXPERIENCE_UNITS_PER_EXP,
  formatExperienceUnits,
  resolveLevel
} from "../src/domain/user-experience-levels";

describe("customer experience level curve", () => {
  it.each([
    [0n, "0", 1], [1n, "0.0001", 1], [40_000n, "4", 1],
    [49_999n, "4.9999", 1], [50_000n, "5", 2], [550_000n, "55", 4],
    [200_000_000n, "20000", 100]
  ])("keeps exact EXP and level boundaries consistent for %s units", (units, exp, level) => {
    expect(formatExperienceUnits(units)).toBe(exp);
    expect(resolveLevel(units)).toBe(level);
  });
  it("formats fractional reversals and large balances without floating-point loss", () => {
    expect(formatExperienceUnits(-12_345n)).toBe("-1.2345");
    expect(formatExperienceUnits(9_007_199_254_740_993n)).toBe("900719925474.0993");
  });
  it("checks in the approved nonlinear Lv.1-Lv.100 thresholds", () => {
    expect(USER_EXPERIENCE_THRESHOLDS).toHaveLength(100);
    expect(USER_EXPERIENCE_THRESHOLDS[0]).toBe(0);
    expect(USER_EXPERIENCE_THRESHOLDS[9]).toBe(267);
    expect(USER_EXPERIENCE_THRESHOLDS[29]).toBe(2194);
    expect(USER_EXPERIENCE_THRESHOLDS[49]).toBe(5639);
    expect(USER_EXPERIENCE_THRESHOLDS[98]).toBe(19638);
    expect(USER_EXPERIENCE_THRESHOLDS[99]).toBe(20000);
  });

  it("resolves levels from fixed integer units and caps display at Lv.100", () => {
    expect(USER_EXPERIENCE_UNITS_PER_EXP).toBe(10_000n);
    expect(resolveLevel(0n)).toBe(1);
    expect(resolveLevel(266n * USER_EXPERIENCE_UNITS_PER_EXP)).toBe(9);
    expect(resolveLevel(267n * USER_EXPERIENCE_UNITS_PER_EXP)).toBe(10);
    expect(resolveLevel(200_000_000n)).toBe(100);
    expect(resolveLevel(250_000_000)).toBe(100);
  });

  it("rejects negative or unsafe totals", () => {
    expect(() => resolveLevel(-1n)).toThrow(RangeError);
    expect(() => resolveLevel(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });
});
