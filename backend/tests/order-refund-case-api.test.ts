import express from "express";
import request from "supertest";
import { ERROR_CODES } from "../src/constants/error-codes";
import type {
  OrderRefundCaseRepositoryPort,
  OrderRefundCaseView
} from "../src/services/order-refund-case.service";
import { createOrderRefundCaseRoutes } from "../src/routes/order-refund-case.routes";
import { env } from "../src/config/env";
import { errorMiddleware } from "../src/middlewares/error.middleware";
import { notFoundMiddleware } from "../src/middlewares/not-found.middleware";
import * as authServiceFactory from "../src/routes/auth-service.factory";

const casePublicId = "11111111-1111-4111-8111-111111111111";
const disputePublicId = "22222222-2222-4222-8222-222222222222";

const refundCase = (overrides: Partial<OrderRefundCaseView> = {}): OrderRefundCaseView => ({
  publicId: casePublicId,
  orderNo: "ND202609070001",
  shop: { shopNo: "shop0000000001", name: "LifeDance 银座店" },
  customer: { needoId: "u0000000001", displayName: "Customer" },
  status: "merchant_review_pending",
  responsibility: "shop",
  refundAmountJpy: 8_800,
  currency: "JPY",
  version: 1,
  requestReason: "服务没有按约定完成",
  merchantDecisionNote: null,
  refundReference: null,
  requestedAt: "2026-09-07T00:00:00.000Z",
  merchantDecisionAt: null,
  refundSubmittedAt: null,
  customerConfirmedAt: null,
  dispute: null,
  affiliateReward: { status: "settled", rewardNdp: 300 },
  createdAt: "2026-09-07T00:00:00.000Z",
  updatedAt: "2026-09-07T00:00:00.000Z",
  ...overrides
});

const requestBody = {
  idempotencyKey: "refund-request-api-0001",
  expectedVersion: 0,
  reason: "服务没有按约定完成"
};
const updateBody = {
  idempotencyKey: "refund-update-api-0001",
  expectedVersion: 1
};

const createFixture = () => {
  const authenticateAccessToken = jest.fn(async (token: string) => {
    const customer = {
      userId: 101,
      currentIdentityId: 1001,
      currentIdentityType: "customer",
      currentIdentityScopeType: "customer_profile",
      currentIdentityScopeId: 501,
      roles: ["customer"],
      permissions: ["user:order-refund:write"]
    };
    if (token === "customer") return customer;
    if (token === "merchant") {
      return {
        userId: 201,
        currentIdentityId: 2001,
        currentIdentityType: "merchant",
        currentIdentityScopeType: "shop",
        currentIdentityScopeId: 21,
        roles: ["merchant"],
        permissions: ["merchant-admin:order-refund:write"]
      };
    }
    if (token === "ops") {
      return {
        userId: 301,
        currentIdentityId: 3001,
        currentIdentityType: "platform",
        currentIdentityScopeType: "global",
        currentIdentityScopeId: null,
        roles: ["platform_operator"],
        permissions: [
          "backoffice:order-refund-dispute:read",
          "backoffice:order-refund-dispute:resolve"
        ]
      };
    }
    if (token === "merchant-preview") {
      return {
        userId: 401,
        currentIdentityId: 4001,
        currentIdentityType: "merchant",
        currentIdentityScopeType: "shop",
        currentIdentityScopeId: 21,
        roles: ["merchant"],
        permissions: [
          "merchant-admin:order-refund:write",
          "backoffice:merchant-accounts:read"
        ]
      };
    }
    return { ...customer, permissions: [] };
  });
  jest
    .spyOn(authServiceFactory, "createAuthServiceForRoutes")
    .mockReturnValue({ authenticateAccessToken } as never);

  const repository = {
    request: jest.fn(async () => ({ kind: "created", value: refundCase() })),
    merchantDecision: jest.fn(async () => ({ kind: "updated", value: refundCase({ version: 2 }) })),
    submitEvidence: jest.fn(async () => ({
      kind: "updated",
      value: refundCase({ status: "customer_confirmation_pending", version: 3 })
    })),
    confirmCustomerReceipt: jest.fn(async () => ({
      kind: "updated",
      value: refundCase({ status: "refunded", version: 4 })
    })),
    openComplaint: jest.fn(async () => ({
      kind: "updated",
      value: refundCase({ status: "disputed", version: 3 })
    })),
    resolveDispute: jest.fn(async () => ({
      kind: "updated",
      value: refundCase({ status: "refund_pending", version: 4 })
    })),
    listDisputes: jest.fn(async () => ({ list: [refundCase()], total: 1, page: 1, page_size: 20 }))
  } as unknown as jest.Mocked<OrderRefundCaseRepositoryPort>;
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1",
    createOrderRefundCaseRoutes(env, {
      orderRefundCaseRepository: repository,
      auditLogRepository: { create: jest.fn(async () => undefined) }
    } as never)
  );
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);
  return { app, repository };
};

describe("completed-order refund case HTTP API", () => {
  afterEach(() => jest.restoreAllMocks());

  it("requires authentication and the exact route permissions", async () => {
    const fixture = createFixture();
    await request(fixture.app).post("/api/v1/orders/77/refund-requests").send(requestBody).expect(401);
    await request(fixture.app)
      .post("/api/v1/orders/77/refund-requests")
      .set("Authorization", "Bearer none")
      .send(requestBody)
      .expect(403)
      .expect({ code: ERROR_CODES.FORBIDDEN, message: "error.forbidden", data: null });
    await request(fixture.app)
      .get("/api/v1/backoffice/refund-disputes")
      .set("Authorization", "Bearer customer")
      .expect(403);
    expect(fixture.repository.request).not.toHaveBeenCalled();
  });

  it("rejects strict invalid body and path input before the service", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .post("/api/v1/orders/nope/refund-requests")
      .set("Authorization", "Bearer customer")
      .send(requestBody)
      .expect(400);
    await request(fixture.app)
      .post("/api/v1/orders/77/refund-requests")
      .set("Authorization", "Bearer customer")
      .send({ ...requestBody, responsibility: "customer" })
      .expect(400)
      .expect({ code: ERROR_CODES.VALIDATION, message: "error.validation", data: null });
    expect(fixture.repository.request).not.toHaveBeenCalled();
  });

  it("creates the customer request with the standard public envelope", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .post("/api/v1/orders/77/refund-requests")
      .set("Authorization", "Bearer customer")
      .send(requestBody)
      .expect(201)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 0,
          message: "success",
          data: { publicId: casePublicId, responsibility: "shop", affiliateReward: { status: "settled" } }
        });
        expect(JSON.stringify(response.body.data)).not.toMatch(/"(?:id|fingerprint|internalNote)"/i);
      });
    expect(fixture.repository.request).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 77, actorUserId: 101, expectedVersion: 0 })
    );
  });

  it("returns 200 for an exact idempotent request replay", async () => {
    const fixture = createFixture();
    fixture.repository.request.mockResolvedValueOnce({ kind: "replayed", value: refundCase() });
    await request(fixture.app)
      .post("/api/v1/orders/77/refund-requests")
      .set("Authorization", "Bearer customer")
      .send(requestBody)
      .expect(200);
  });

  it.each([128, 129, 160])(
    "accepts a %i-character idempotency key through the service boundary",
    async (length) => {
      const fixture = createFixture();
      const idempotencyKey = "k".repeat(length);
      await request(fixture.app)
        .post("/api/v1/orders/77/refund-requests")
        .set("Authorization", "Bearer customer")
        .send({ ...requestBody, idempotencyKey })
        .expect(201);
      expect(fixture.repository.request).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey })
      );
    }
  );

  it("rejects a 161-character idempotency key before the repository", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .post("/api/v1/orders/77/refund-requests")
      .set("Authorization", "Bearer customer")
      .send({ ...requestBody, idempotencyKey: "k".repeat(161) })
      .expect(400);
    expect(fixture.repository.request).not.toHaveBeenCalled();
  });

  it("maps hidden scope and command conflicts to stable public statuses", async () => {
    const fixture = createFixture();
    fixture.repository.merchantDecision.mockResolvedValueOnce({ kind: "scope_mismatch" });
    await request(fixture.app)
      .post(`/api/v1/merchant-admin/orders/77/refund-requests/${casePublicId}/approve`)
      .set("Authorization", "Bearer merchant")
      .send({ ...updateBody, note: "店铺已核对退款申请" })
      .expect(404)
      .expect({ code: ERROR_CODES.ORDER_REFUND_CASE_NOT_FOUND, message: "error.order_refund_case.not_found", data: null });

    fixture.repository.resolveDispute.mockResolvedValueOnce({ kind: "dispute_required" });
    await request(fixture.app)
      .post(`/api/v1/backoffice/refund-disputes/${disputePublicId}/resolve`)
      .set("Authorization", "Bearer ops")
      .send({ ...updateBody, resolution: "refund", publicReason: "没有正式投诉，不能裁定" })
      .expect(409)
      .expect({ code: ERROR_CODES.ORDER_REFUND_DISPUTE_REQUIRED, message: "error.order_refund.dispute_required", data: null });
  });

  it("maps Affiliate snapshot mismatches to the stable refund invariant 500", async () => {
    const fixture = createFixture();
    fixture.repository.confirmCustomerReceipt.mockResolvedValueOnce({
      kind: "affiliate_invariant_failed"
    });
    await request(fixture.app)
      .post(`/api/v1/orders/77/refund-requests/${casePublicId}/confirm-receipt`)
      .set("Authorization", "Bearer customer")
      .send(updateBody)
      .expect(500)
      .expect({
        code: ERROR_CODES.ORDER_REFUND_AFFILIATE_INVARIANT_FAILED,
        message: "error.order_refund_case.affiliate_invariant_failed",
        data: null
      });
  });

  it("wires every role-scoped command and paginated dispute list", async () => {
    const fixture = createFixture();
    const customer = { Authorization: "Bearer customer" };
    const merchant = { Authorization: "Bearer merchant" };
    const ops = { Authorization: "Bearer ops" };

    await request(fixture.app)
      .post(`/api/v1/orders/77/refund-requests/${casePublicId}/confirm-receipt`)
      .set(customer)
      .send(updateBody)
      .expect(200);
    await request(fixture.app)
      .post(`/api/v1/orders/77/refund-requests/${casePublicId}/complaints`)
      .set(customer)
      .send({ ...updateBody, reason: "商户拒绝后需要平台协助" })
      .expect(200);
    await request(fixture.app)
      .post(`/api/v1/merchant-admin/orders/77/refund-requests/${casePublicId}/approve`)
      .set(merchant)
      .send({ ...updateBody, note: "同意退款" })
      .expect(200);
    await request(fixture.app)
      .post(`/api/v1/merchant-admin/orders/77/refund-requests/${casePublicId}/reject`)
      .set(merchant)
      .send({ ...updateBody, note: "需要补充订单证据" })
      .expect(200);
    await request(fixture.app)
      .post(`/api/v1/merchant-admin/orders/77/refund-requests/${casePublicId}/refund-evidence`)
      .set(merchant)
      .send({ ...updateBody, reference: "bank-ref-20260907" })
      .expect(200);
    await request(fixture.app)
      .post(`/api/v1/merchant-admin/orders/77/refund-requests/${casePublicId}/complaints`)
      .set(merchant)
      .send({ ...updateBody, reason: "需要平台审阅该争议" })
      .expect(200);
    await request(fixture.app)
      .get("/api/v1/backoffice/refund-disputes?page=1&page_size=20&status=open")
      .set(ops)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({ total: 1, page: 1, page_size: 20, list: [{ publicId: casePublicId }] });
      });
    await request(fixture.app)
      .post(`/api/v1/backoffice/refund-disputes/${disputePublicId}/resolve`)
      .set(ops)
      .send({ ...updateBody, resolution: "refund", publicReason: "平台支持退款" })
      .expect(200);

    expect(fixture.repository.confirmCustomerReceipt).toHaveBeenCalledWith(expect.objectContaining({ orderId: 77 }));
    expect(fixture.repository.merchantDecision).toHaveBeenCalledTimes(2);
    expect(fixture.repository.openComplaint).toHaveBeenCalledTimes(2);
    expect(fixture.repository.listDisputes).toHaveBeenCalledWith(expect.objectContaining({ page: 1, page_size: 20, status: "open" }));
  });

  it("rejects read-only merchant preview writes before the refund service", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .post(`/api/v1/merchant-admin/orders/77/refund-requests/${casePublicId}/approve`)
      .set("Authorization", "Bearer merchant-preview")
      .set("x-needo-merchant-preview-shop-id", "21")
      .send({ ...updateBody, note: "不能用预览身份写入" })
      .expect(403)
      .expect({ code: ERROR_CODES.FORBIDDEN, message: "error.merchant_preview.read_only", data: null });
    expect(fixture.repository.merchantDecision).not.toHaveBeenCalled();
  });
});
