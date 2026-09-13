import { backofficeFinanceListQuerySchema } from "../src/validators/backoffice.validator";

describe("backoffice finance list query", () => {
  it("accepts formal status, Tokyo period, city, keyword and pagination filters", () => {
    expect(backofficeFinanceListQuerySchema.parse({
      page: "2",
      pageSize: "20",
      keyword: " ND202609101341243926 ",
      status: "ready_for_payroll",
      period: "month",
      city: "東京都"
    })).toEqual({
      page: 2,
      pageSize: 20,
      keyword: "ND202609101341243926",
      status: "ready_for_payroll",
      period: "month",
      city: "東京都"
    });
  });

  it("rejects a display-only settlement status or unsupported period", () => {
    expect(backofficeFinanceListQuerySchema.safeParse({ status: "paid" }).success).toBe(false);
    expect(backofficeFinanceListQuerySchema.safeParse({ period: "quarter" }).success).toBe(false);
  });
});
