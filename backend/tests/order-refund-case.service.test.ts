import { createHash } from "node:crypto";
import { ERROR_CODES } from "../src/constants/error-codes";
import type { AuthenticatedAccessContext, AuthRequestContext } from "../src/services/auth.service";
import {
  OrderRefundCaseService,
  type OrderRefundCaseRepositoryPort,
  type OrderRefundCaseView
} from "../src/services/order-refund-case.service";
import { AppError } from "../src/utils/app-error";

const context: AuthRequestContext = { ip: "127.0.0.1", userAgent: "refund-case-test" };
const casePublicId = "d7b4c4c8-ef16-45fb-8e40-4be1b30f2a2d";
const disputePublicId = "e0a2d0ac-7445-426a-9f29-1f4820463955";

const customer: AuthenticatedAccessContext = {
  userId: 7,
  email: "customer@example.com",
  accessTokenJti: "customer-token",
  accessTokenExpiresAt: 1,
  currentIdentityId: 70,
  currentIdentityType: "customer",
  currentIdentityScopeType: "global",
  currentIdentityScopeId: null,
  roles: ["customer"],
  permissions: []
};

const merchant: AuthenticatedAccessContext = {
  userId: 8,
  email: "merchant@example.com",
  accessTokenJti: "merchant-token",
  accessTokenExpiresAt: 1,
  currentIdentityId: 80,
  currentIdentityType: "merchant_owner",
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: 55,
  roles: ["merchant_owner"],
  permissions: []
};

const operator: AuthenticatedAccessContext = {
  userId: 9,
  email: "operator@example.com",
  accessTokenJti: "operator-token",
  accessTokenExpiresAt: 1,
  currentIdentityId: 90,
  currentIdentityType: "platform",
  currentIdentityScopeType: "global",
  currentIdentityScopeId: null,
  roles: ["operator"],
  permissions: []
};

const view = (overrides: Partial<OrderRefundCaseView> = {}): OrderRefundCaseView => ({
  publicId: casePublicId,
  orderNo: "ND-20260907-0001",
  shop: { shopNo: "S-55", name: "NeeDo Shop" },
  customer: { needoId: "n0000000007", displayName: "Customer" },
  status: "merchant_review_pending",
  responsibility: "shop",
  refundAmountJpy: 5000,
  currency: "JPY",
  version: 1,
  requestReason: "damaged service",
  merchantDecisionNote: null,
  refundReference: null,
  requestedAt: "2026-09-07T00:00:00.000Z",
  merchantDecisionAt: null,
  refundSubmittedAt: null,
  customerConfirmedAt: null,
  dispute: null,
  affiliateReward: null,
  createdAt: "2026-09-07T00:00:00.000Z",
  updatedAt: "2026-09-07T00:00:00.000Z",
  ...overrides
});

const repository = (kind: "created" | "updated" | "replayed" = "created") =>
  ({
    request: jest.fn(async () => ({ kind, value: view() })),
    merchantDecision: jest.fn(async () => ({ kind: "updated", value: view({ version: 2 }) })),
    submitEvidence: jest.fn(async () => ({ kind: "updated", value: view({ version: 3 }) })),
    confirmCustomerReceipt: jest.fn(async () => ({ kind: "updated", value: view({ version: 4 }) })),
    openComplaint: jest.fn(async () => ({ kind: "updated", value: view({ status: "disputed", version: 3 }) })),
    resolveDispute: jest.fn(async () => ({ kind: "updated", value: view({ version: 4 }) })),
    listDisputes: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 20 }))
  }) as unknown as jest.Mocked<OrderRefundCaseRepositoryPort>;

const audit = {
  createInput: jest.fn((input) => ({
    actorId: input.actor.userId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    ip: input.context.ip,
    userAgent: input.context.userAgent,
    metadata: input.metadata
  }))
};

const serviceFor = (repo = repository()) => ({
  repo,
  service: new OrderRefundCaseService(repo, audit)
});

const expectAppError = (error: unknown, statusCode: number, code: number, message: string) => {
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ statusCode, code, message });
};

const expectRejected = async (
  operation: Promise<unknown>,
  statusCode: number,
  code: number,
  message: string
): Promise<void> => {
  try {
    await operation;
    throw new Error("expected operation to reject");
  } catch (error) {
    expectAppError(error, statusCode, code, message);
  }
};

describe("OrderRefundCaseService", () => {
  it("requests a refund only in the booking customer's identity and records the request audit", async () => {
    const { service, repo } = serviceFor();

    await expect(
      service.request(customer, context, {
        orderId: 12,
        idempotencyKey: "refund-request-0001",
        expectedVersion: 0,
        reason: "  damaged service  "
      })
    ).resolves.toEqual({ kind: "created", value: view() });

    const command = repo.request.mock.calls[0][0];
    expect(command).toMatchObject({
      orderId: 12,
      actorUserId: customer.userId,
      actorIdentityId: customer.currentIdentityId,
      actorScope: { type: "global", id: null },
      shopId: null,
      expectedVersion: 0,
      idempotencyKey: "refund-request-0001",
      payload: { reason: "damaged service" },
      audit: expect.objectContaining({ action: "order_refund.requested" })
    });
    expect(command.fingerprint).toMatch(/^[a-f0-9]{64}$/u);

    await expectRejected(
      service.request(merchant, context, {
        orderId: 12,
        idempotencyKey: "refund-request-0002",
        expectedVersion: 0,
        reason: "damaged service"
      }),
      403,
      ERROR_CODES.IDENTITY_FORBIDDEN,
      "error.identity.forbidden"
    );
    expect(repo.request).toHaveBeenCalledTimes(1);
  });

  it("uses the authenticated merchant shop scope for merchant decisions and evidence", async () => {
    const { service, repo } = serviceFor();

    await service.merchantApprove(merchant, context, 12, casePublicId, {
      idempotencyKey: "refund-approve-0001",
      expectedVersion: 1,
      note: "  refund approved  "
    });
    await service.submitEvidence(merchant, context, 12, casePublicId, {
      idempotencyKey: "refund-evidence-0001",
      expectedVersion: 2,
      reference: "  bank-transfer-123  "
    });

    expect(repo.merchantDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        casePublicId,
        orderId: 12,
        decision: "approve",
        shopId: 55,
        actorUserId: merchant.userId,
        actorIdentityId: merchant.currentIdentityId,
        payload: { note: "refund approved" },
        audit: expect.objectContaining({ action: "order_refund.merchant_approved" })
      })
    );
    expect(repo.submitEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        casePublicId,
        orderId: 12,
        shopId: 55,
        payload: { reference: "bank-transfer-123" },
        audit: expect.objectContaining({ action: "order_refund.evidence_submitted" })
      })
    );
  });

  it("opens a customer complaint only after merchant rejection and confirms receipt with its nested order", async () => {
    const { service, repo } = serviceFor();
    repo.openComplaint.mockResolvedValueOnce({
      kind: "invalid_state",
      current: view({ status: "merchant_review_pending" })
    });

    await expectRejected(
      service.openComplaint(customer, context, 12, casePublicId, {
        idempotencyKey: "refund-complaint-0001",
        expectedVersion: 1,
        reason: "merchant denied the refund"
      }),
      409,
      ERROR_CODES.ORDER_REFUND_CASE_INVALID_STATE,
      "error.order_refund_case.invalid_state"
    );
    expect(repo.openComplaint).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 12,
        shopId: null,
        audit: expect.objectContaining({ action: "order_refund.complaint_opened" })
      })
    );
    await expect(
      service.openComplaint(customer, context, 12, casePublicId, {
        idempotencyKey: "refund-complaint-0002",
        expectedVersion: 1,
        reason: "merchant denied the refund"
      })
    ).resolves.toEqual(view({ status: "disputed", version: 3 }));

    await service.confirmCustomerReceipt(customer, context, 12, casePublicId, {
      idempotencyKey: "refund-receipt-0001",
      expectedVersion: 3
    });
    expect(repo.confirmCustomerReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: customer.userId,
        actorIdentityId: customer.currentIdentityId,
        orderId: 12,
        audit: expect.objectContaining({ action: "order_refund.customer_receipt_confirmed" })
      })
    );
  });

  it("opens a merchant complaint with the authenticated shop scope and hides cross-shop cases", async () => {
    const { service, repo } = serviceFor();
    const otherShopMerchant: AuthenticatedAccessContext = {
      ...merchant,
      currentIdentityScopeId: 56
    };
    const previewMerchant: AuthenticatedAccessContext = {
      ...merchant,
      isReadOnlyMerchantPreview: true,
      merchantPreviewShopId: 55
    };

    await expect(
      service.openComplaint(merchant, context, 12, casePublicId, {
        idempotencyKey: "merchant-complaint-0001",
        expectedVersion: 2,
        reason: "refund evidence was rejected"
      })
    ).resolves.toEqual(view({ status: "disputed", version: 3 }));
    expect(repo.openComplaint).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 12,
        shopId: 55,
        actorUserId: merchant.userId,
        actorIdentityId: merchant.currentIdentityId,
        actorScope: { type: "shop", id: 55 },
        audit: expect.objectContaining({
          action: "order_refund.complaint_opened",
          metadata: expect.objectContaining({ ids: { orderId: 12, casePublicId } })
        })
      })
    );

    repo.openComplaint.mockResolvedValueOnce({ kind: "scope_mismatch" });
    await expectRejected(
      service.openComplaint(otherShopMerchant, context, 12, casePublicId, {
        idempotencyKey: "merchant-complaint-0002",
        expectedVersion: 2,
        reason: "refund evidence was rejected"
      }),
      404,
      ERROR_CODES.ORDER_REFUND_CASE_NOT_FOUND,
      "error.order_refund_case.not_found"
    );
    await expectRejected(
      service.openComplaint(previewMerchant, context, 12, casePublicId, {
        idempotencyKey: "merchant-complaint-0003",
        expectedVersion: 2,
        reason: "refund evidence was rejected"
      }),
      403,
      ERROR_CODES.IDENTITY_FORBIDDEN,
      "error.identity.forbidden"
    );
    expect(repo.openComplaint).toHaveBeenCalledTimes(2);
  });

  it("allows dispute resolution only from a global platform identity and records both resolution actions", async () => {
    const { service, repo } = serviceFor();

    await expectRejected(
      service.resolveDispute(merchant, context, disputePublicId, {
        idempotencyKey: "refund-resolution-0001",
        expectedVersion: 3,
        resolution: "refund",
        publicReason: "refund responsibility confirmed"
      }),
      403,
      ERROR_CODES.IDENTITY_FORBIDDEN,
      "error.identity.forbidden"
    );

    await service.resolveDispute(operator, context, disputePublicId, {
      idempotencyKey: "refund-resolution-0002",
      expectedVersion: 3,
      resolution: "refund",
      publicReason: "  refund responsibility confirmed  ",
      internalNote: "internal evidence reviewed"
    });
    await service.resolveDispute(operator, context, disputePublicId, {
      idempotencyKey: "refund-resolution-0003",
      expectedVersion: 4,
      resolution: "reject",
      publicReason: "insufficient evidence"
    });

    expect(repo.resolveDispute).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        disputePublicId,
        resolution: "refund",
        actorScope: { type: "global", id: null },
        payload: {
          publicReason: "refund responsibility confirmed",
          internalNote: "internal evidence reviewed"
        },
        audit: expect.objectContaining({ action: "order_refund.dispute_resolved_refund" })
      })
    );
    expect(repo.resolveDispute.mock.calls[0][0].audit.targetType).toBe("OrderRefundDispute");
    expect(repo.resolveDispute).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        resolution: "reject",
        audit: expect.objectContaining({ action: "order_refund.dispute_resolved_reject" })
      })
    );
  });

  it("returns an exact replay and fingerprints the normalized actor-scoped command rather than the idempotency key alone", async () => {
    const { service, repo } = serviceFor(repository("replayed"));

    await expect(
      service.request(customer, context, {
        orderId: 12,
        idempotencyKey: "refund-replay-0001",
        expectedVersion: 0,
        reason: "  damaged service  "
      })
    ).resolves.toEqual({ kind: "replayed", value: view() });
    const replayFingerprint = repo.request.mock.calls[0][0].fingerprint;

    await service.request(customer, context, {
      orderId: 12,
      idempotencyKey: "refund-replay-0001",
      expectedVersion: 0,
      reason: "another service failure"
    });
    expect(repo.request.mock.calls[1][0].fingerprint).not.toBe(replayFingerprint);
    expect(replayFingerprint).toBe(
      createHash("sha256")
        .update(
          JSON.stringify({
            action: "order_refund.requested",
            ids: { orderId: 12 },
            actor: { userId: 7, identityId: 70 },
            scope: { type: "global", id: null, shopId: null },
            payload: { reason: "damaged service" },
            expectedVersion: 0
          })
        )
        .digest("hex")
    );
  });

  it("includes the server-validated nested order in every case command and its fingerprint", async () => {
    const { service, repo } = serviceFor();
    const input = {
      idempotencyKey: "refund-order-bound-0001",
      expectedVersion: 1,
      note: "refund approved"
    };

    await service.merchantApprove(merchant, context, 12, casePublicId, input);
    await service.merchantApprove(merchant, context, 13, casePublicId, input);

    const [first, second] = repo.merchantDecision.mock.calls.map(([command]) => command);
    expect(first).toMatchObject({ orderId: 12, audit: expect.objectContaining({ metadata: expect.objectContaining({ ids: { orderId: 12, casePublicId } }) }) });
    expect(second).toMatchObject({ orderId: 13, audit: expect.objectContaining({ metadata: expect.objectContaining({ ids: { orderId: 13, casePublicId } }) }) });
    expect(first.fingerprint).not.toBe(second.fingerprint);
  });

  it("maps hidden scope/not-found, ordinary conflicts, and forbidden Affiliate invariants to stable errors", async () => {
    const { service, repo } = serviceFor();
    repo.merchantDecision.mockResolvedValueOnce({ kind: "scope_mismatch" });
    await expectRejected(
      service.merchantReject(merchant, context, 12, casePublicId, {
        idempotencyKey: "refund-hidden-0001",
        expectedVersion: 1,
        note: "refund denied"
      }),
      404,
      ERROR_CODES.ORDER_REFUND_CASE_NOT_FOUND,
      "error.order_refund_case.not_found"
    );
    expect(repo.merchantDecision.mock.calls[0][0].audit.action).toBe(
      "order_refund.merchant_rejected"
    );

    repo.merchantDecision.mockResolvedValueOnce({ kind: "idempotency_conflict" });
    await expectRejected(
      service.merchantReject(merchant, context, 12, casePublicId, {
        idempotencyKey: "refund-conflict-0001",
        expectedVersion: 1,
        note: "refund denied"
      }),
      409,
      ERROR_CODES.ORDER_REFUND_CASE_IDEMPOTENCY_CONFLICT,
      "error.order_refund_case.idempotency_conflict"
    );

    repo.merchantDecision.mockResolvedValueOnce({ kind: "affiliate_invariant_failed" });
    await expectRejected(
      service.merchantReject(merchant, context, 12, casePublicId, {
        idempotencyKey: "refund-affiliate-0001",
        expectedVersion: 1,
        note: "refund denied"
      }),
      500,
      ERROR_CODES.ORDER_REFUND_AFFILIATE_INVARIANT_FAILED,
      "error.order_refund_case.affiliate_invariant_failed"
    );
  });

  it("rejects public responsibility or Affiliate mutation fields before repository execution", async () => {
    const { service, repo } = serviceFor();
    await expectRejected(
      service.request(customer, context, {
        orderId: 12,
        idempotencyKey: "refund-public-input-0001",
        expectedVersion: 0,
        reason: "damaged service",
        responsibility: "customer"
      } as never),
      400,
      ERROR_CODES.VALIDATION,
      "error.order_refund_case.public_input_invalid"
    );
    await expectRejected(
      service.request(customer, context, {
        orderId: 12,
        idempotencyKey: "refund-public-input-0002",
        expectedVersion: 0,
        reason: "damaged service",
        affiliateReward: { status: "settled", rewardNdp: 100 }
      } as never),
      400,
      ERROR_CODES.VALIDATION,
      "error.order_refund_case.public_input_invalid"
    );
    expect(repo.request).not.toHaveBeenCalled();
  });
});
