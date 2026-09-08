import { exchangeIntelligenceServiceOptionListQuerySchema } from "../src/validators/exchange-intelligence-service.validators";

describe("Exchange Intelligence service option validators", () => {
  it("normalizes bounded pagination and rejects unknown filters", () => {
    expect(exchangeIntelligenceServiceOptionListQuerySchema.parse({})).toEqual({
      page: 1,
      page_size: 20
    });
    expect(
      exchangeIntelligenceServiceOptionListQuerySchema.parse({ page: "2", page_size: "100" })
    ).toEqual({ page: 2, page_size: 100 });
    expect(exchangeIntelligenceServiceOptionListQuerySchema.safeParse({ page: 0 }).success).toBe(
      false
    );
    expect(
      exchangeIntelligenceServiceOptionListQuerySchema.safeParse({ page_size: 101 }).success
    ).toBe(false);
    expect(
      exchangeIntelligenceServiceOptionListQuerySchema.safeParse({ shop_id: 11 }).success
    ).toBe(false);
  });
});
