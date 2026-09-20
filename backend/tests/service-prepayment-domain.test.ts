import {
  allocatePrepaymentJpy,
  calculateRequiredPrepaymentJpy
} from "../src/domain/service-prepayment";

describe("service prepayment domain", () => {
  it("calculates an integer JPY minimum with upward rounding", () => {
    expect(calculateRequiredPrepaymentJpy(10_000, 30)).toBe(3_000);
    expect(calculateRequiredPrepaymentJpy(10_001, 30)).toBe(3_001);
    expect(calculateRequiredPrepaymentJpy(10_001, 0)).toBe(0);
  });

  it("rejects unsafe bases and invalid percentages", () => {
    for (const baseAmountJpy of [-1, 10.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => calculateRequiredPrepaymentJpy(baseAmountJpy, 30)).toThrow("invalid_base_amount");
    }
    for (const percent of [-1, 1, 9, 10.5, 101]) {
      expect(() => calculateRequiredPrepaymentJpy(10_000, percent)).toThrow("invalid_prepayment_percent");
    }
  });

  it("allocates integer JPY proportionally and preserves the capped total", () => {
    expect(allocatePrepaymentJpy(3_000, [
      { id: 1, quoteAmountJpy: 6_000 },
      { id: 2, quoteAmountJpy: 4_000 }
    ])).toEqual([
      { id: 1, amountJpy: 1_800 },
      { id: 2, amountJpy: 1_200 }
    ]);
    expect(allocatePrepaymentJpy(10, [
      { id: 2, quoteAmountJpy: 1 },
      { id: 1, quoteAmountJpy: 1 },
      { id: 3, quoteAmountJpy: 1 }
    ])).toEqual([
      { id: 2, amountJpy: 1 },
      { id: 1, amountJpy: 1 },
      { id: 3, amountJpy: 1 }
    ]);
  });

  it("rejects duplicate subjects and invalid quote amounts", () => {
    expect(() => allocatePrepaymentJpy(100, [
      { id: 1, quoteAmountJpy: 60 },
      { id: 1, quoteAmountJpy: 40 }
    ])).toThrow("duplicate_allocation_subject");
    expect(() => allocatePrepaymentJpy(100, [{ id: 1, quoteAmountJpy: 0 }]))
      .toThrow("invalid_quote_amount");
  });
});
