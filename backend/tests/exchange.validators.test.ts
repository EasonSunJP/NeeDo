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
  serviceStartAt: "2026-08-31T09:00:00+09:00",
  serviceEndAt: "2026-08-31T10:00:00+09:00",
  expiresAt: "2026-08-31T08:30:00Z"
};

const validDemand = (overrides: Record<string, unknown> = {}) => ({
  ...common,
  expiresAt: "2026-08-31T08:30:00+09:00",
  type: "demand" as const,
  categoryId: 1,
  businessKeywordIds: [10],
  serviceMode: "store" as const,
  targetProviderCount: 1,
  matchMode: "quick" as const,
  budgetMode: "total" as const,
  budgetMinJpy: null,
  budgetMaxJpy: 12_000,
  addressLine1: "  東京都渋谷区  ",
  addressLine2: "  道玄坂1-2-3  ",
  addressLine3: null,
  addressLine2Public: false,
  addressLine3Public: false,
  publisherIdentityPublic: false,
  ...overrides
});

const validIntelligence = (overrides: Record<string, unknown> = {}) => ({
  ...common,
  type: "intelligence" as const,
  serviceRef: "shop:501",
  areaLabel: "  渋谷区  ",
  serviceMode: "store" as const,
  addressLabel: "  渋谷駅徒歩3分  ",
  serviceAreas: ["渋谷区", "港区"],
  originalPriceJpy: 15_000,
  campaignPriceJpy: 10_000,
  ...overrides
});

describe("formal NeeDo Exchange validators", () => {
  it("requires one category and one to ten distinct business keywords", () => {
    expect(publishExchangePostSchema.safeParse(validDemand({ categoryId: undefined })).success).toBe(false);
    expect(publishExchangePostSchema.safeParse(validDemand({ businessKeywordIds: [] })).success).toBe(false);
    expect(publishExchangePostSchema.safeParse(validDemand({ businessKeywordIds: [10, 10] })).success).toBe(false);
    expect(publishExchangePostSchema.safeParse(validDemand({ businessKeywordIds: Array.from({ length: 11 }, (_, i) => i + 1) })).success).toBe(false);
    expect(publishExchangePostSchema.safeParse(validDemand()).success).toBe(true);
  });
  it("defaults old publication clients to private address line 1", () => {
    expect(publishExchangePostSchema.parse(validDemand())).toEqual(expect.objectContaining({ addressLine1Public: false }));
    expect(publishExchangePostSchema.parse(validDemand({ addressLine1Public: true }))).toEqual(expect.objectContaining({ addressLine1Public: true }));
  });
  it("accepts only unrestricted, male, or female technician preferences", () => {
    expect(publishExchangePostSchema.parse(validDemand())).toEqual(expect.objectContaining({ preferredTechnicianGender: "any" }));
    expect(publishExchangePostSchema.parse(validDemand({ preferredTechnicianGender: "female" }))).toEqual(expect.objectContaining({ preferredTechnicianGender: "female" }));
    expect(publishExchangePostSchema.safeParse(validDemand({ preferredTechnicianGender: "private" })).success).toBe(false);
  });
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
    const parsed = publishExchangePostSchema.parse(validDemand());

    expect(parsed).toEqual(
      expect.objectContaining({
        type: "demand",
        title: "渋谷でヘアセットをお願いしたい",
        detail: "8月31日のイベント前にお願いします。",
        contentLocale: "ja",
        targetProviderCount: 1,
        matchMode: "quick",
        budgetMode: "total",
        budgetMinJpy: null,
        budgetMaxJpy: 12_000,
        addressLine1: "東京都渋谷区",
        addressLine2: "道玄坂1-2-3",
        addressLine3: null,
        addressLine2Public: false,
        addressLine3Public: false,
        publisherIdentityPublic: false,
        serviceStartAt: new Date("2026-08-31T00:00:00.000Z"),
        serviceEndAt: new Date("2026-08-31T01:00:00.000Z"),
        expiresAt: new Date("2026-08-30T23:30:00.000Z")
      })
    );
  });

  it("accepts bounded optional language versions for both post types", () => {
    const versions = { en: { title: "  Hair styling  ", detail: "  Before the event.  " } };
    for (const post of [validDemand(), validIntelligence()]) {
      expect(publishExchangePostSchema.parse({ ...post, contentTranslations: versions }).contentTranslations)
        .toEqual({ en: { title: "Hair styling", detail: "Before the event." } });
      expect(publishExchangePostSchema.safeParse({ ...post, contentTranslations: { fr: versions.en } }).success).toBe(false);
      expect(publishExchangePostSchema.safeParse({ ...post, contentTranslations: { en: { title: "", detail: "Text" } } }).success).toBe(false);
      expect(publishExchangePostSchema.safeParse({ ...post, contentTranslations: { en: { title: "x".repeat(121), detail: "Text" } } }).success).toBe(false);
      expect(publishExchangePostSchema.safeParse({ ...post, contentTranslations: { ja: versions.en } }).success).toBe(false);
    }
  });

  it("accepts an absent minimum but rejects a minimum above the maximum", () => {
    expect(publishExchangePostSchema.safeParse(validDemand({ budgetMinJpy: null })).success).toBe(
      true
    );
    expect(
      publishExchangePostSchema.safeParse(
        validDemand({ budgetMinJpy: 20_001, budgetMaxJpy: 20_000 })
      ).success
    ).toBe(false);
  });

  it("rejects timestamps without an explicit offset and invalid disclosure switches", () => {
    expect(
      publishExchangePostSchema.safeParse(validDemand({ serviceStartAt: "2026-08-31T09:00:00" }))
        .success
    ).toBe(false);
    expect(
      publishExchangePostSchema.safeParse(
        validDemand({ addressLine2: null, addressLine2Public: true })
      ).success
    ).toBe(false);
    expect(
      publishExchangePostSchema.safeParse(
        validDemand({ addressLine3: null, addressLine3Public: true })
      ).success
    ).toBe(false);
    expect(
      publishExchangePostSchema.safeParse(
        validDemand({ addressLine2: "道玄坂1-2-3", addressLine2Public: true })
      ).success
    ).toBe(false);
    expect(
      publishExchangePostSchema.safeParse(
        validDemand({ addressLine3: "12F", addressLine3Public: true })
      ).success
    ).toBe(false);
  });

  it("closes demand applications before service starts, while intelligence expires after service ends", () => {
    expect(
      publishExchangePostSchema.safeParse(
        validDemand({
          expiresAt: "2026-08-31T09:00:00+09:00"
        })
      ).success
    ).toBe(false);
    expect(
      publishExchangePostSchema.safeParse(
        validDemand({
          expiresAt: "2026-08-31T09:30:00+09:00"
        })
      ).success
    ).toBe(false);
    expect(publishExchangePostSchema.safeParse(validDemand()).success).toBe(true);
    expect(publishExchangePostSchema.safeParse(validIntelligence()).success).toBe(true);
    expect(publishExchangePostSchema.safeParse(validIntelligence({ expiresAt: "2026-08-31T09:30:00+09:00" })).success).toBe(false);
  });

  it("requires the demand application deadline to be at least thirty minutes before service starts", () => {
    expect(publishExchangePostSchema.safeParse(validDemand({ expiresAt: "2026-08-31T08:30:00+09:00" })).success).toBe(true);
    expect(publishExchangePostSchema.safeParse(validDemand({ expiresAt: "2026-08-31T08:31:00+09:00" })).success).toBe(false);
  });

  it("uses thirty-minute boundaries for every demand time on the server", () => {
    expect(publishExchangePostSchema.safeParse(validDemand({ serviceStartAt: "2026-08-31T09:15:00+09:00" })).success).toBe(false);
    expect(publishExchangePostSchema.safeParse(validDemand({ serviceEndAt: "2026-08-31T10:45:00+09:00" })).success).toBe(false);
    expect(publishExchangePostSchema.safeParse(validDemand({ expiresAt: "2026-08-31T08:15:00+09:00" })).success).toBe(false);
    expect(publishExchangePostSchema.safeParse(validIntelligence({ serviceStartAt: "2026-08-31T09:15:00+09:00" })).success).toBe(true);
  });

  it("rejects legacy demand-only fields and provider counts outside 1 through 20", () => {
    expect(
      publishExchangePostSchema.safeParse({ ...validDemand(), areaLabel: "legacy" }).success
    ).toBe(false);
    expect(
      publishExchangePostSchema.safeParse(validDemand({ targetProviderCount: 0 })).success
    ).toBe(false);
    expect(
      publishExchangePostSchema.safeParse(validDemand({ targetProviderCount: 21 })).success
    ).toBe(false);
  });

  it("requires one formal Intelligence service reference and treats legacy display fields as optional", () => {
    expect(publishExchangePostSchema.parse(validIntelligence())).toEqual(
      expect.objectContaining({
        type: "intelligence",
        serviceRef: "shop:501",
        addressLabel: "渋谷駅徒歩3分"
      })
    );

    expect(
      publishExchangePostSchema.safeParse(
        validIntelligence({ serviceAreas: ["渋谷区"], originalPriceJpy: 9_000 })
      ).success
    ).toBe(true);
    expect(
      publishExchangePostSchema.safeParse(validIntelligence({ serviceRef: undefined })).success
    ).toBe(false);
    expect(
      publishExchangePostSchema.safeParse(validIntelligence({ serviceRef: "legacy:501" })).success
    ).toBe(false);
    expect(
      publishExchangePostSchema.safeParse({
        ...common,
        type: "intelligence",
        serviceRef: "technician:701",
        campaignPriceJpy: 10_000
      }).success
    ).toBe(true);
  });

  it("rejects invalid Intelligence prices or service windows", () => {
    expect(
      publishExchangePostSchema.safeParse(validIntelligence({ campaignPriceJpy: -1 })).success
    ).toBe(false);
    expect(
      publishExchangePostSchema.safeParse(
        validIntelligence({
          serviceMode: "onsite",
          serviceAreas: ["渋谷区"],
          serviceEndAt: "2026-08-31T08:00:00+09:00",
          originalPriceJpy: null
        })
      ).success
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
