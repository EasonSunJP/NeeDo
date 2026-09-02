import express from "express";
import request from "supertest";
import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";
import { ERROR_CODES } from "../src/constants/error-codes";
import { errorMiddleware } from "../src/middlewares/error.middleware";
import { notFoundMiddleware } from "../src/middlewares/not-found.middleware";
import type { AgentSettlementRepositoryPort } from "../src/repositories/agent-settlement.repository";
import { createAgentSettlementRoutes } from "../src/routes/agent-settlement.routes";
import * as authServiceFactory from "../src/routes/auth-service.factory";

const agentPublicId = "11111111-1111-4111-8111-111111111111";
const settlementPublicId = "22222222-2222-4222-8222-222222222222";
const periodStart = new Date("2026-09-01T00:00:00.000Z");
const periodEnd = new Date("2026-09-30T00:00:00.000Z");
const confirmedAt = new Date("2026-10-02T00:00:00.000Z");
const preview = {
  agentPublicId,
  periodStart,
  periodEnd,
  currency: "JPY" as const,
  rule: {
    publicId: "33333333-3333-4333-8333-333333333333",
    version: 1,
    fixedSuccessRewardJpy: 50_000,
    profitShareRateBps: 1_500,
    paymentMethod: "bank_transfer" as const
  },
  totals: {
    orderPlatformFeesJpy: 100_000,
    saasFeesJpy: 20_000,
    userRebatesJpy: 10_000,
    refundsAndReversalsJpy: 5_000,
    channelFeesJpy: 3_000,
    consumptionTaxJpy: 8_000,
    allocatedOperatingCostsJpy: 14_000,
    pureProfitJpy: 80_000,
    fixedSuccessRewardJpy: 50_000,
    profitShareRateBps: 1_500,
    profitShareAmountJpy: 12_000,
    totalAmountJpy: 62_000
  },
  shops: [
    {
      referralPublicId: "44444444-4444-4444-8444-444444444444",
      shopPublicId: "shop0000000008",
      shopName: "Ginza Shop",
      successRewardEligible: true,
      orderPlatformFeesJpy: 100_000,
      saasFeesJpy: 20_000,
      userRebatesJpy: 10_000,
      refundsAndReversalsJpy: 5_000,
      channelFeesJpy: 3_000,
      consumptionTaxJpy: 8_000,
      allocatedOperatingCostsJpy: 14_000,
      pureProfitJpy: 80_000,
      fixedSuccessRewardJpy: 50_000,
      profitShareRateBps: 1_500,
      profitShareAmountJpy: 12_000,
      totalAmountJpy: 62_000,
      externalEvidenceReference: "statement-2026-09-ginza",
      externalEvidenceReason: "September processor and tax statement"
    }
  ],
  generatedAt: confirmedAt
};
const settlement = {
  id: 71,
  publicId: settlementPublicId,
  ...preview,
  ...preview.totals,
  status: "confirmed" as const,
  idempotencyKey: "agent-settlement-2026-09",
  confirmedAt,
  confirmedById: 91,
  paidAt: null,
  paidById: null,
  paymentMethod: null,
  paymentReference: null,
  lines: [
    {
      ...preview.shops[0],
      lineType: "success_reward" as const,
      amountJpy: 50_000
    },
    {
      ...preview.shops[0],
      lineType: "profit_share" as const,
      amountJpy: 12_000
    }
  ],
  createdAt: confirmedAt,
  updatedAt: confirmedAt
};

const createFixture = () => {
  const authenticateAccessToken = jest.fn(async (token: string) => {
    const base = {
      userId: 91,
      roles: ["operator"],
      permissions: [
        "backoffice:agent-settlement:read",
        "backoffice:agent-settlement:write",
        "backoffice:agent-settlement:pay"
      ],
      currentIdentityType: "operator",
      currentIdentityScopeType: "global",
      currentIdentityScopeId: null
    };
    if (token === "read-only") {
      return { ...base, permissions: ["backoffice:agent-settlement:read"] };
    }
    if (token === "writer") {
      return {
        ...base,
        permissions: ["backoffice:agent-settlement:read", "backoffice:agent-settlement:write"]
      };
    }
    if (token === "none") return { ...base, permissions: [] };
    if (token === "shop") {
      return { ...base, currentIdentityScopeType: "shop", currentIdentityScopeId: 19 };
    }
    return base;
  });
  jest
    .spyOn(authServiceFactory, "createAuthServiceForRoutes")
    .mockReturnValue({ authenticateAccessToken } as never);

  const repository = {
    preview: jest.fn(async () => ({ outcome: "ready" as const, preview })),
    confirm: jest.fn(async () => ({ outcome: "confirmed" as const, settlement, applied: true })),
    list: jest.fn(async () => ({ list: [settlement], total: 1, page: 1, page_size: 20 })),
    markPaid: jest.fn(async () => ({
      outcome: "paid" as const,
      settlement: {
        ...settlement,
        status: "paid" as const,
        paidAt: confirmedAt,
        paidById: 91,
        paymentMethod: "bank_transfer" as const,
        paymentReference: "bank-transfer-2026-09-71"
      },
      applied: true
    }))
  } as unknown as jest.Mocked<AgentSettlementRepositoryPort>;
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1",
    createAgentSettlementRoutes(env, { agentSettlementRepository: repository } as never)
  );
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);
  return { app, repository };
};

const evidence = [
  {
    shopPublicId: "shop0000000008",
    channelFeesJpy: 3_000,
    consumptionTaxJpy: 8_000,
    evidenceReference: "statement-2026-09-ginza",
    reason: "September processor and tax statement"
  }
];
const previewBody = {
  periodStart: "2026-09-01",
  periodEnd: "2026-09-30",
  externalDeductions: evidence
};

describe("agent settlement HTTP API", () => {
  afterEach(() => jest.restoreAllMocks());

  it("previews every pure-profit component without persisting a settlement", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .post(`/api/v1/backoffice/agents/${agentPublicId}/settlements/preview`)
      .set("Authorization", "Bearer writer")
      .send(previewBody)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          totals: { pureProfitJpy: 80_000, totalAmountJpy: 62_000 },
          shops: [{ successRewardEligible: true, profitShareAmountJpy: 12_000 }]
        });
      });
    expect(fixture.repository.preview).toHaveBeenCalledWith(
      expect.objectContaining({
        agentPublicId,
        periodStart,
        periodEnd,
        externalDeductions: evidence
      })
    );
    expect(fixture.repository.confirm).not.toHaveBeenCalled();
  });

  it("confirms idempotently, lists immutable settlements and never exposes internal ids", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .post(`/api/v1/backoffice/agents/${agentPublicId}/settlements`)
      .set("Authorization", "Bearer writer")
      .send({ ...previewBody, idempotencyKey: "agent-settlement-2026-09" })
      .expect(201)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          publicId: settlementPublicId,
          status: "confirmed",
          totalAmountJpy: 62_000
        });
        expect(JSON.stringify(response.body.data)).not.toContain('"id":71');
      });

    fixture.repository.confirm.mockResolvedValueOnce({
      outcome: "confirmed",
      settlement,
      applied: false
    });
    await request(fixture.app)
      .post(`/api/v1/backoffice/agents/${agentPublicId}/settlements`)
      .set("Authorization", "Bearer writer")
      .send({ ...previewBody, idempotencyKey: "agent-settlement-2026-09" })
      .expect(200);

    await request(fixture.app)
      .get(`/api/v1/backoffice/agents/${agentPublicId}/settlements?page=1&pageSize=20`)
      .set("Authorization", "Bearer read-only")
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          total: 1,
          list: [{ publicId: settlementPublicId }]
        });
      });
  });

  it("marks a confirmed settlement paid without recalculating immutable lines", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .post(`/api/v1/backoffice/agents/${agentPublicId}/settlements/${settlementPublicId}/payment`)
      .set("Authorization", "Bearer operator")
      .send({
        paymentMethod: "bank_transfer",
        paymentReference: "bank-transfer-2026-09-71",
        reason: "bank statement reconciled"
      })
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          status: "paid",
          paymentMethod: "bank_transfer",
          paymentReference: "bank-transfer-2026-09-71",
          lines: settlement.lines
        });
      });
    expect(fixture.repository.markPaid).toHaveBeenCalledWith(
      expect.objectContaining({
        agentPublicId,
        settlementPublicId,
        actorUserId: 91,
        paymentMethod: "bank_transfer"
      })
    );
  });

  it("requires strict evidence, exact permissions and a platform identity", async () => {
    const fixture = createFixture();
    const base = `/api/v1/backoffice/agents/${agentPublicId}/settlements`;
    await request(fixture.app).get(base).expect(401);
    await request(fixture.app).get(base).set("Authorization", "Bearer none").expect(403);
    await request(fixture.app)
      .post(base)
      .set("Authorization", "Bearer read-only")
      .send({ ...previewBody, idempotencyKey: "agent-settlement-2026-09" })
      .expect(403);
    await request(fixture.app)
      .post(`${base}/${settlementPublicId}/payment`)
      .set("Authorization", "Bearer writer")
      .send({})
      .expect(403);
    await request(fixture.app).get(base).set("Authorization", "Bearer shop").expect(403).expect({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden",
      data: null
    });
    await request(fixture.app)
      .post(`${base}/preview`)
      .set("Authorization", "Bearer writer")
      .send({ ...previewBody, externalDeductions: [{ ...evidence[0], evidenceReference: "" }] })
      .expect(400);
  });

  it("publishes authenticated preview, confirmation, list and payment OpenAPI contracts", () => {
    const document = createOpenApiDocument(env) as unknown as {
      paths: Record<string, Record<string, Record<string, unknown>>>;
      components: { schemas: Record<string, unknown> };
    };
    const collection = document.paths["/api/v1/backoffice/agents/{agentPublicId}/settlements"];
    const previewPath =
      document.paths["/api/v1/backoffice/agents/{agentPublicId}/settlements/preview"];
    const paymentPath =
      document.paths[
        "/api/v1/backoffice/agents/{agentPublicId}/settlements/{settlementPublicId}/payment"
      ];
    expect(collection.get).toMatchObject({
      "x-permission": "backoffice:agent-settlement:read",
      security: [{ bearerAuth: [] }]
    });
    expect(collection.post).toMatchObject({
      "x-permission": "backoffice:agent-settlement:write"
    });
    expect(previewPath.post).toMatchObject({
      "x-permission": "backoffice:agent-settlement:write"
    });
    expect(paymentPath.post).toMatchObject({
      "x-permission": "backoffice:agent-settlement:pay"
    });
    expect(document.components.schemas.AgentSettlement).toBeDefined();
  });
});
