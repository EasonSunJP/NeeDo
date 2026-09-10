import {
  shopMembershipCardRedemptionCandidateQuerySchema,
  shopMembershipCardRedemptionCreateBodySchema,
  shopMembershipCardRedemptionListQuerySchema,
  shopMembershipCardRedemptionPublicIdParamSchema
} from "../src/validators/shop-membership-card-redemption.validator";

describe("shop membership card redemption validators", () => {
  it("accepts only a server-scoped completed order reference and idempotency key", () => {
    expect(
      shopMembershipCardRedemptionCreateBodySchema.parse({
        orderNo: " B202609010001 ",
        idempotencyKey: " redemption-validator-001 "
      })
    ).toEqual({
      orderNo: "B202609010001",
      idempotencyKey: "redemption-validator-001"
    });
    expect(() =>
      shopMembershipCardRedemptionCreateBodySchema.parse({
        orderNo: "B202609010001",
        idempotencyKey: "redemption-validator-002",
        shopId: 71,
        amountJpy: 1,
        rewardNdp: 999999
      })
    ).toThrow();
  });

  it("validates public ids and bounded pagination", () => {
    const publicId = "00000000-0000-4000-8000-000000000801";
    expect(shopMembershipCardRedemptionPublicIdParamSchema.parse({ publicId })).toEqual({
      publicId
    });
    expect(
      shopMembershipCardRedemptionCandidateQuerySchema.parse({ page: "2", pageSize: "50" })
    ).toEqual({ page: 2, pageSize: 50 });
    expect(
      shopMembershipCardRedemptionListQuerySchema.parse({ page: "1", cardPublicId: publicId })
    ).toEqual({ page: 1, cardPublicId: publicId });
    expect(() => shopMembershipCardRedemptionListQuerySchema.parse({ pageSize: 101 })).toThrow();
  });
});
