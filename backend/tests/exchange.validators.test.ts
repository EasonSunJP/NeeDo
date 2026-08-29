import {
  exchangeIdempotencyKeySchema,
  exchangeListQuerySchema,
  exchangePostIdParamSchema,
  publishExchangePostSchema,
  createExchangeCommentSchema
} from "../src/validators/exchange.validators";

const common = {
  title: "  渋谷でヘアセットをお願いしたい  ",
  detail: "  8月31日のイベント前にお願いします。  ",
  contentLocale: "ja" as const,
  areaLabel: "  渋谷区  ",
  serviceStartAt: "2026-08-31T09:00:00+09:00",
  serviceEndAt: "2026-08-31T10:00:00+09:00",
  expiresAt: "2026-08-31T08:30:00Z"
};

describe("formal NeeDo Exchange validators", () => {
  it("normalizes bounded pagination and accepts only the two public tabs", () => {
    expect(exchangeListQuerySchema.parse({ type: "demand" })).toEqual({
      type: "demand",
      page: 1,
      page_size: 20
    });
    expect(
      exchangeListQuerySchema.parse({ type: "intelligence", page: "2", page_size: "100" })
    ).toEqual({ type: "intelligence", page: 2, page_size: 100 });
    expect(exchangeListQuerySchema.safeParse({ type: "all" }).success).toBe(false);
    expect(exchangeListQuerySchema.safeParse({ type: "demand", page: 0 }).success).toBe(false);
    expect(exchangeListQuerySchema.safeParse({ type: "demand", page_size: 101 }).success).toBe(
      false
    );
  });

  it("accepts positive post ids and bounded idempotency keys", () => {
    expect(exchangePostIdParamSchema.parse({ id: "41" })).toEqual({ id: 41 });
    expect(exchangePostIdParamSchema.safeParse({ id: "0" }).success).toBe(false);
    expect(exchangeIdempotencyKeySchema.parse("  1234567890abcdef  ")).toBe("1234567890abcdef");
    expect(exchangeIdempotencyKeySchema.safeParse("too-short").success).toBe(false);
    expect(exchangeIdempotencyKeySchema.safeParse("x".repeat(192)).success).toBe(false);
  });

  it("parses a demand, trims authored text, and preserves the original locale", () => {
    const parsed = publishExchangePostSchema.parse({
      ...common,
      type: "demand",
      budgetMinJpy: 8_000,
      budgetMaxJpy: 12_000
    });

    expect(parsed).toEqual(
      expect.objectContaining({
        type: "demand",
        title: "渋谷でヘアセットをお願いしたい",
        detail: "8月31日のイベント前にお願いします。",
        contentLocale: "ja",
        areaLabel: "渋谷区",
        budgetMinJpy: 8_000,
        budgetMaxJpy: 12_000,
        serviceStartAt: new Date("2026-08-31T00:00:00.000Z"),
        serviceEndAt: new Date("2026-08-31T01:00:00.000Z"),
        expiresAt: new Date("2026-08-31T08:30:00.000Z")
      })
    );
  });

  it("rejects reversed demand budgets and timestamps without an explicit offset", () => {
    expect(
      publishExchangePostSchema.safeParse({
        ...common,
        type: "demand",
        budgetMinJpy: 12_000,
        budgetMaxJpy: 8_000
      }).success
    ).toBe(false);
    expect(
      publishExchangePostSchema.safeParse({
        ...common,
        type: "demand",
        serviceStartAt: "2026-08-31T09:00:00",
        budgetMinJpy: 8_000,
        budgetMaxJpy: 12_000
      }).success
    ).toBe(false);
  });

  it("parses intelligence and rejects invalid price or service windows", () => {
    expect(
      publishExchangePostSchema.parse({
        ...common,
        type: "intelligence",
        serviceMode: "store",
        addressLabel: "  渋谷駅徒歩3分  ",
        serviceAreas: ["渋谷区", "港区"],
        originalPriceJpy: 15_000,
        campaignPriceJpy: 10_000
      })
    ).toEqual(expect.objectContaining({ type: "intelligence", addressLabel: "渋谷駅徒歩3分" }));

    expect(
      publishExchangePostSchema.safeParse({
        ...common,
        type: "intelligence",
        serviceMode: "store",
        serviceAreas: ["渋谷区"],
        originalPriceJpy: 9_000,
        campaignPriceJpy: 10_000
      }).success
    ).toBe(false);
    expect(
      publishExchangePostSchema.safeParse({
        ...common,
        type: "intelligence",
        serviceMode: "onsite",
        serviceAreas: ["渋谷区"],
        serviceEndAt: "2026-08-31T08:00:00+09:00",
        originalPriceJpy: null,
        campaignPriceJpy: 10_000
      }).success
    ).toBe(false);
  });

  it("accepts only one trimmed comment field", () => {
    expect(createExchangeCommentSchema.parse({ content: "  詳細を教えてください  " })).toEqual({
      content: "詳細を教えてください"
    });
    expect(createExchangeCommentSchema.safeParse({ content: " ", actorUserId: 7 }).success).toBe(
      false
    );
  });
});
