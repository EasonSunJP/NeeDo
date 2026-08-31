import {
  shopMembershipCardTopUpCreateBodySchema,
  shopMembershipCardTopUpListQuerySchema,
  shopMembershipCardTopUpPublicIdParamSchema
} from "../src/validators/shop-membership-card-topup.validator";

describe("shop membership card top-up validators", () => {
  it("accepts a confirmed offline top-up with reviewable evidence", () => {
    expect(shopMembershipCardTopUpCreateBodySchema.parse({
      amountJpy: 5_000,
      paymentMethod: "cash",
      paymentReference: " POS-20260901-001 ",
      note: null,
      idempotencyKey: " topup-validator-001 "
    })).toEqual({
      amountJpy: 5_000,
      paymentMethod: "cash",
      paymentReference: "POS-20260901-001",
      note: null,
      idempotencyKey: "topup-validator-001"
    });
  });

  it.each([0, -1, 10_000_001, 1.5, Number.NaN])("rejects invalid amount %s", (amountJpy) => {
    expect(() => shopMembershipCardTopUpCreateBodySchema.parse({
      amountJpy,
      paymentMethod: "cash",
      paymentReference: "POS-1",
      note: null,
      idempotencyKey: "topup-validator-002"
    })).toThrow();
  });

  it("requires a reference or note and rejects unsupported fields", () => {
    expect(() => shopMembershipCardTopUpCreateBodySchema.parse({
      amountJpy: 1000,
      paymentMethod: "card",
      paymentReference: null,
      note: "   ",
      idempotencyKey: "topup-validator-003"
    })).toThrow();
    expect(() => shopMembershipCardTopUpCreateBodySchema.parse({
      amountJpy: 1000,
      paymentMethod: "crypto",
      paymentReference: "external",
      note: null,
      idempotencyKey: "topup-validator-004",
      shopId: 71
    })).toThrow();
  });

  it("validates public ids and paginated history filters", () => {
    const publicId = "00000000-0000-4000-8000-000000000701";
    expect(shopMembershipCardTopUpPublicIdParamSchema.parse({ publicId })).toEqual({ publicId });
    expect(shopMembershipCardTopUpListQuerySchema.parse({ page: "2", pageSize: "50", cardPublicId: publicId })).toEqual({
      page: 2,
      pageSize: 50,
      cardPublicId: publicId
    });
    expect(() => shopMembershipCardTopUpListQuerySchema.parse({ pageSize: 101 })).toThrow();
  });
});
