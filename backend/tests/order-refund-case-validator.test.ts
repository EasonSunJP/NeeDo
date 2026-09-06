import {
  orderRefundCaseApproveBodySchema,
  orderRefundCaseComplaintBodySchema,
  orderRefundCaseDisputeParamSchema,
  orderRefundCaseDisputeResolutionBodySchema,
  orderRefundCaseEvidenceBodySchema,
  orderRefundCaseIdParamSchema,
  orderRefundCaseListQuerySchema,
  orderRefundCaseOrderIdParamSchema,
  orderRefundCaseReceiptConfirmationBodySchema,
  orderRefundCaseRejectBodySchema,
  orderRefundCaseRequestBodySchema
} from "../src/validators/order-refund-case.validator";

const idempotencyKey = "refund-case-command-0001";
const uuid = "d7b4c4c8-ef16-45fb-8e40-4be1b30f2a2d";

describe("completed-order refund case validators", () => {
  it("requires expectedVersion exactly zero for the initial request and trims the reason/key", () => {
    expect(
      orderRefundCaseRequestBodySchema.parse({
        idempotencyKey: `  ${idempotencyKey}  `,
        expectedVersion: 0,
        reason: "  damaged service  "
      })
    ).toEqual({ idempotencyKey, expectedVersion: 0, reason: "damaged service" });

    for (const expectedVersion of [-1, 1, 0.5, "0"]) {
      expect(() =>
        orderRefundCaseRequestBodySchema.parse({
          idempotencyKey,
          expectedVersion,
          reason: "reason"
        })
      ).toThrow();
    }
  });

  it.each([
    [orderRefundCaseComplaintBodySchema, { reason: "  complaint  " }, { reason: "complaint" }],
    [orderRefundCaseApproveBodySchema, { note: "  approved  " }, { note: "approved" }],
    [orderRefundCaseRejectBodySchema, { note: "  rejected  " }, { note: "rejected" }]
  ])("validates later reason/note mutations with a positive version", (schema, field, expected) => {
    expect(schema.parse({ ...field, ...expected, idempotencyKey, expectedVersion: 1 })).toEqual({
      ...expected,
      idempotencyKey,
      expectedVersion: 1
    });
    expect(() => schema.parse({ ...field, idempotencyKey, expectedVersion: 0 })).toThrow();
  });

  it("validates evidence references and receipt confirmation envelopes", () => {
    expect(
      orderRefundCaseEvidenceBodySchema.parse({
        idempotencyKey,
        expectedVersion: 2,
        reference: "  payment-ref-123  "
      })
    ).toEqual({ idempotencyKey, expectedVersion: 2, reference: "payment-ref-123" });
    expect(
      orderRefundCaseReceiptConfirmationBodySchema.parse({ idempotencyKey, expectedVersion: 3 })
    ).toEqual({ idempotencyKey, expectedVersion: 3 });
    expect(() =>
      orderRefundCaseEvidenceBodySchema.parse({
        idempotencyKey,
        expectedVersion: 2,
        reference: "x".repeat(121)
      })
    ).toThrow();
  });

  it("validates dispute resolution and preserves omitted versus nullable internal notes", () => {
    expect(
      orderRefundCaseDisputeResolutionBodySchema.parse({
        idempotencyKey,
        expectedVersion: 4,
        resolution: "refund",
        publicReason: "  refund responsibility confirmed  "
      })
    ).toEqual({
      idempotencyKey,
      expectedVersion: 4,
      resolution: "refund",
      publicReason: "refund responsibility confirmed"
    });
    expect(
      orderRefundCaseDisputeResolutionBodySchema.parse({
        idempotencyKey,
        expectedVersion: 4,
        resolution: "reject",
        publicReason: "insufficient evidence",
        internalNote: null
      }).internalNote
    ).toBeNull();
    expect(() =>
      orderRefundCaseDisputeResolutionBodySchema.parse({
        idempotencyKey,
        expectedVersion: 4,
        resolution: "other",
        publicReason: "valid reason"
      })
    ).toThrow();
  });

  it("enforces strict positive order, UUID case/dispute, and unknown-field boundaries", () => {
    expect(orderRefundCaseOrderIdParamSchema.parse({ orderId: "12" })).toEqual({ orderId: 12 });
    expect(orderRefundCaseIdParamSchema.parse({ caseId: `  ${uuid} ` })).toEqual({ caseId: uuid });
    expect(orderRefundCaseDisputeParamSchema.parse({ disputeId: uuid })).toEqual({
      disputeId: uuid
    });
    for (const value of [0, -1, 1.2, "not-a-number"]) {
      expect(() => orderRefundCaseOrderIdParamSchema.parse({ orderId: value })).toThrow();
    }
    expect(() => orderRefundCaseIdParamSchema.parse({ caseId: "123" })).toThrow();
    expect(() =>
      orderRefundCaseRequestBodySchema.parse({
        idempotencyKey,
        expectedVersion: 0,
        reason: "x",
        extra: true
      })
    ).toThrow();
  });

  it("defaults bounded pagination and accepts only open/resolved status plus trimmed search", () => {
    expect(orderRefundCaseListQuerySchema.parse({})).toEqual({ page: 1, page_size: 20 });
    expect(
      orderRefundCaseListQuerySchema.parse({
        page: "2",
        page_size: "100",
        status: "open",
        search: "  order  "
      })
    ).toEqual({ page: 2, page_size: 100, status: "open", search: "order" });
    expect(orderRefundCaseListQuerySchema.parse({ status: "resolved" }).status).toBe("resolved");
    for (const input of [
      { page: 0 },
      { page_size: 101 },
      { status: "pending" },
      { search: "x".repeat(101) },
      { unknown: true }
    ]) {
      expect(() => orderRefundCaseListQuerySchema.parse(input)).toThrow();
    }
  });
});
