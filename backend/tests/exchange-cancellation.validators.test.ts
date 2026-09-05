import {
  exchangeCancellationDecisionBodySchema,
  exchangeCancellationOrderIdParamSchema,
  exchangeCancellationRequestBodySchema
} from "../src/validators/exchange-cancellation.validators";

describe("Exchange cancellation strict command validation", () => {
  it("accepts a route order id and a trimmed original reason", () => {
    expect(exchangeCancellationOrderIdParamSchema.parse({ id: "40" })).toEqual({ id: 40 });
    expect(
      exchangeCancellationRequestBodySchema.parse({
        expectedVersion: 0,
        reason: "  時間が合わない  "
      })
    ).toEqual({ expectedVersion: 0, reason: "時間が合わない" });
    expect(exchangeCancellationDecisionBodySchema.parse({ expectedVersion: 1 })).toEqual({
      expectedVersion: 1
    });
  });

  it.each([undefined, null, "", " \n\t ", "x".repeat(501), 12])(
    "rejects invalid reason %j",
    (reason) => {
      expect(
        exchangeCancellationRequestBodySchema.safeParse({ expectedVersion: 0, reason }).success
      ).toBe(false);
    }
  );

  it("accepts exactly 500 characters without changing the user's wording", () => {
    const reason = "あ".repeat(500);
    expect(exchangeCancellationRequestBodySchema.parse({ expectedVersion: 0, reason }).reason).toBe(
      reason
    );
  });

  it.each([-1, 1.5, "1", null, undefined, NaN, Infinity, 2_147_483_647])(
    "rejects invalid version %j",
    (expectedVersion) => {
      expect(
        exchangeCancellationRequestBodySchema.safeParse({
          expectedVersion,
          reason: "time conflict"
        }).success
      ).toBe(false);
      expect(exchangeCancellationDecisionBodySchema.safeParse({ expectedVersion }).success).toBe(
        false
      );
    }
  );

  it("rejects a response to version zero", () => {
    expect(exchangeCancellationDecisionBodySchema.safeParse({ expectedVersion: 0 }).success).toBe(
      false
    );
  });

  it("reserves capacity for a future response when validating a new request", () => {
    expect(
      exchangeCancellationRequestBodySchema.safeParse({
        expectedVersion: 2_147_483_646,
        reason: "time conflict"
      }).success
    ).toBe(false);
    expect(
      exchangeCancellationRequestBodySchema.safeParse({
        expectedVersion: 2_147_483_645,
        reason: "time conflict"
      }).success
    ).toBe(true);
    expect(
      exchangeCancellationDecisionBodySchema.safeParse({ expectedVersion: 2_147_483_646 }).success
    ).toBe(true);
  });

  it.each([
    "actorUserId",
    "identityId",
    "party",
    "approvedBy",
    "status",
    "refundAmount",
    "orderId",
    "idempotencyKey"
  ])("rejects client-supplied %s", (field) => {
    expect(
      exchangeCancellationRequestBodySchema.safeParse({
        expectedVersion: 1,
        reason: "time conflict",
        [field]: 10
      }).success
    ).toBe(false);
    expect(
      exchangeCancellationDecisionBodySchema.safeParse({ expectedVersion: 1, [field]: 10 }).success
    ).toBe(false);
  });

  it.each(["0", "-1", "1.5", "abc", "", "2147483648", "9007199254740993"])(
    "rejects invalid route id %j",
    (id) => {
      expect(exchangeCancellationOrderIdParamSchema.safeParse({ id }).success).toBe(false);
    }
  );

  it("rejects unknown route params", () => {
    expect(
      exchangeCancellationOrderIdParamSchema.safeParse({ id: "40", customerId: "10" }).success
    ).toBe(false);
  });
});
