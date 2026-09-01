import {
  calculateTechnicianPerformance,
  type TechnicianPerformanceCounts,
} from "../src/services/order-performance-calculator";

const calculate = (overrides: Partial<TechnicianPerformanceCounts> = {}) =>
  calculateTechnicianPerformance({
    completedOrderCount: 0,
    accountableCancellationCount: 0,
    accountableUncompletedCount: 0,
    specialExcludedCount: 0,
    ...overrides,
  });

describe("order performance calculator", () => {
  it.each([
    {
      name: "returns 100 percent when there are no countable outcomes",
      counts: {},
      acceptanceRateBps: 10_000,
    },
    {
      name: "counts completed orders over completed and accountable adverse outcomes",
      counts: {
        completedOrderCount: 8,
        accountableCancellationCount: 1,
        accountableUncompletedCount: 1,
      },
      acceptanceRateBps: 8_000,
    },
    {
      name: "rounds the result to the nearest integer basis point",
      counts: {
        completedOrderCount: 2,
        accountableCancellationCount: 1,
      },
      acceptanceRateBps: 6_667,
    },
  ])("$name", ({ counts, acceptanceRateBps }) => {
    expect(calculate(counts)).toMatchObject({ acceptanceRateBps });
  });

  it("reports special exclusions without putting them in the denominator", () => {
    expect(
      calculate({
        completedOrderCount: 8,
        accountableCancellationCount: 1,
        accountableUncompletedCount: 1,
        specialExcludedCount: 7,
      })
    ).toEqual({
      completedOrderCount: 8,
      accountableCancellationCount: 1,
      accountableUncompletedCount: 1,
      specialExcludedCount: 7,
      acceptanceRateBps: 8_000,
    });
  });

  it.each([
    ["completedOrderCount", -1],
    ["accountableCancellationCount", 1.5],
    ["accountableUncompletedCount", Number.NaN],
    ["specialExcludedCount", Number.POSITIVE_INFINITY],
  ] as const)("rejects invalid %s values", (field, value) => {
    expect(() => calculate({ [field]: value })).toThrow(
      "Technician performance counts must be non-negative safe integers"
    );
  });
});
