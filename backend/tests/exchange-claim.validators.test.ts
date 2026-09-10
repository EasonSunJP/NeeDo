import {
  createExchangeClaimSchema,
  exchangeClaimIdParamSchema,
  exchangeClaimListQuerySchema,
  exchangeClaimOptionListQuerySchema,
  exchangeClaimPostIdParamSchema
} from "../src/validators/exchange-claim.validators";
import { ERROR_CODES } from "../src/constants/error-codes";

describe("Exchange selective claim validators", () => {
  it("reserves stable errors for every formal claim rejection", () => {
    expect(ERROR_CODES).toMatchObject({
      EXCHANGE_CLAIM_NOT_ALLOWED: 40311,
      EXCHANGE_CLAIM_OPTION_NOT_FOUND: 40419,
      EXCHANGE_CLAIM_NOT_FOUND: 40420,
      EXCHANGE_CLAIM_SELECTIVE_ONLY: 40972,
      EXCHANGE_CLAIM_QUOTE_BELOW_BUDGET: 40973,
      EXCHANGE_CLAIM_QUOTE_ABOVE_BUDGET: 40974,
      EXCHANGE_CLAIM_SCHEDULE_UNAVAILABLE: 40975,
      EXCHANGE_CLAIM_TIME_CONFLICT: 40976,
      EXCHANGE_CLAIM_DUPLICATE: 40977,
      EXCHANGE_CLAIM_IDEMPOTENCY_CONFLICT: 40978,
      EXCHANGE_CLAIM_INVALID_STATE: 40979
    });
  });

  it("accepts one schedule option and a positive bounded quote", () => {
    expect(
      createExchangeClaimSchema.parse({ scheduleSlotId: "91", quoteAmountJpy: "15000" })
    ).toEqual({
      scheduleSlotId: 91,
      quoteAmountJpy: 15_000,
      message: null
    });
  });

  it("trims an optional original-language message without adding fields", () => {
    expect(
      createExchangeClaimSchema.parse({
        scheduleSlotId: 91,
        quoteAmountJpy: 15_000,
        message: "  当日は日本語と中文で対応できます。  "
      })
    ).toEqual({
      scheduleSlotId: 91,
      quoteAmountJpy: 15_000,
      message: "当日は日本語と中文で対応できます。"
    });
    expect(
      createExchangeClaimSchema.safeParse({
        scheduleSlotId: 91,
        quoteAmountJpy: 15_000,
        message: null,
        matchSucceeded: true
      }).success
    ).toBe(false);
  });

  it("rejects invalid ids, zero quotes and oversized input", () => {
    expect(
      createExchangeClaimSchema.safeParse({ scheduleSlotId: 0, quoteAmountJpy: 15_000 }).success
    ).toBe(false);
    expect(
      createExchangeClaimSchema.safeParse({ scheduleSlotId: 91, quoteAmountJpy: 0 }).success
    ).toBe(false);
    expect(
      createExchangeClaimSchema.safeParse({
        scheduleSlotId: 91,
        quoteAmountJpy: 1_000_000_001
      }).success
    ).toBe(false);
    expect(
      createExchangeClaimSchema.safeParse({
        scheduleSlotId: 91,
        quoteAmountJpy: 15_000,
        message: "x".repeat(1_001)
      }).success
    ).toBe(false);
  });

  it("normalizes paginated received-claim queries", () => {
    expect(exchangeClaimListQuerySchema.parse({})).toEqual({ page: 1, page_size: 20 });
    expect(exchangeClaimListQuerySchema.parse({ page: "2", page_size: "100" })).toEqual({
      page: 2,
      page_size: 100
    });
    expect(exchangeClaimListQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(exchangeClaimListQuerySchema.safeParse({ page_size: 101 }).success).toBe(false);
  });

  it("accepts only bounded formal option filters", () => {
    expect(
      exchangeClaimOptionListQuerySchema.parse({
        page: "2",
        shop_id: "11",
        technician_profile_id: "81",
        service_ref: "technician:501"
      })
    ).toEqual({
      page: 2,
      page_size: 20,
      shop_id: 11,
      technician_profile_id: 81,
      service_ref: "technician:501"
    });
    expect(
      exchangeClaimOptionListQuerySchema.safeParse({ service_ref: "legacy:501" }).success
    ).toBe(false);
    expect(exchangeClaimOptionListQuerySchema.safeParse({ shop_id: 0 }).success).toBe(false);
  });

  it("parses positive post and claim ids", () => {
    expect(exchangeClaimPostIdParamSchema.parse({ id: "41" })).toEqual({ id: 41 });
    expect(exchangeClaimIdParamSchema.parse({ claimId: "301" })).toEqual({ claimId: 301 });
    expect(exchangeClaimPostIdParamSchema.safeParse({ id: 0 }).success).toBe(false);
    expect(exchangeClaimIdParamSchema.safeParse({ claimId: 0 }).success).toBe(false);
  });
});
