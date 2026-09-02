import express from "express";
import request from "supertest";
import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";
import { ERROR_CODES } from "../src/constants/error-codes";
import type { AgentCommissionRuleRepositoryPort } from "../src/repositories/agent-commission-rule.repository";
import { createAgentCommissionRuleRoutes } from "../src/routes/agent-commission-rule.routes";
import { errorMiddleware } from "../src/middlewares/error.middleware";
import { notFoundMiddleware } from "../src/middlewares/not-found.middleware";
import * as authServiceFactory from "../src/routes/auth-service.factory";

const agentPublicId = "11111111-1111-4111-8111-111111111111";
const rule = {
  id: 91,
  publicId: "22222222-2222-4222-8222-222222222222",
  agentProfileId: 41,
  version: 1,
  fixedSuccessRewardJpy: 50_000,
  profitShareRateBps: 1_500,
  paymentMethod: "bank_transfer" as const,
  paymentDetails: { bankReference: "agent-41-bank" },
  effectiveFrom: new Date("2026-10-01T00:00:00.000Z"),
  effectiveTo: null,
  publishedAt: new Date("2026-09-02T00:00:00.000Z"),
  publishedById: 91,
  reason: "2026 contract",
  createdAt: new Date("2026-09-02T00:00:00.000Z")
};

const createFixture = () => {
  const authenticateAccessToken = jest.fn(async (token: string) => {
    const base = {
      userId: 91,
      roles: ["operator"],
      permissions: ["backoffice:agent:read", "backoffice:agent:write"],
      currentIdentityType: "operator",
      currentIdentityScopeType: "global",
      currentIdentityScopeId: null
    };
    if (token === "read-only") return { ...base, permissions: ["backoffice:agent:read"] };
    if (token === "no-permission") return { ...base, permissions: [] };
    if (token === "shop") {
      return { ...base, currentIdentityScopeType: "shop", currentIdentityScopeId: 19 };
    }
    return base;
  });
  jest
    .spyOn(authServiceFactory, "createAuthServiceForRoutes")
    .mockReturnValue({ authenticateAccessToken } as never);

  const repository = {
    getOverview: jest.fn(async (input) => ({
      outcome: "found" as const,
      overview: {
        current: rule,
        latestVersion: 1,
        evaluatedAt: input.at,
        history: { list: [rule], total: 1, page: input.page ?? 1, page_size: input.pageSize ?? 20 }
      }
    })),
    publish: jest.fn(async () => ({ outcome: "published" as const, rule }))
  } as unknown as jest.Mocked<AgentCommissionRuleRepositoryPort>;

  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1",
    createAgentCommissionRuleRoutes(env, { agentCommissionRuleRepository: repository } as never)
  );
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);
  return { app, repository };
};

describe("agent commission rule HTTP API", () => {
  afterEach(() => jest.restoreAllMocks());

  it("lists current and immutable historical rule versions", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .get(
        `/api/v1/backoffice/agents/${agentPublicId}/commission-rules?page=1&pageSize=20&at=2026-10-15T00:00:00.000Z`
      )
      .set("Authorization", "Bearer read-only")
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          current: { version: 1, fixedSuccessRewardJpy: 50_000, profitShareRateBps: 1_500 },
          latestVersion: 1,
          history: { total: 1, page: 1, page_size: 20 }
        });
        expect(JSON.stringify(response.body.data)).not.toContain("agentProfileId");
      });
  });

  it("publishes a validated version without an edit endpoint", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .post(`/api/v1/backoffice/agents/${agentPublicId}/commission-rules`)
      .set("Authorization", "Bearer operator")
      .send({
        fixedSuccessRewardJpy: 50_000,
        profitShareRateBps: 1_500,
        paymentMethod: "bank_transfer",
        paymentDetails: { bankReference: "agent-41-bank" },
        effectiveFrom: "2026-10-01T00:00:00.000Z",
        reason: "2026 contract"
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          version: 1,
          fixedSuccessRewardJpy: 50_000,
          profitShareRateBps: 1_500,
          paymentMethod: "bank_transfer"
        });
      });
    expect(fixture.repository.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        agentPublicId,
        actorUserId: 91,
        fixedSuccessRewardJpy: 50_000,
        profitShareRateBps: 1_500,
        effectiveFrom: new Date("2026-10-01T00:00:00.000Z")
      })
    );

    await request(fixture.app)
      .patch(`/api/v1/backoffice/agents/${agentPublicId}/commission-rules/${rule.publicId}`)
      .set("Authorization", "Bearer operator")
      .send({ profitShareRateBps: 999 })
      .expect(404);
  });

  it.each([
    [{ fixedSuccessRewardJpy: -1 }, "negative success reward"],
    [{ fixedSuccessRewardJpy: Number.MAX_SAFE_INTEGER + 1 }, "unsafe success reward"],
    [{ profitShareRateBps: -1 }, "negative bps"],
    [{ profitShareRateBps: 10_001 }, "bps above 100 percent"],
    [{ profitShareRateBps: 1.5 }, "fractional bps"],
    [{ paymentMethod: "cash" }, "unsupported payment method"],
    [{ reason: "   " }, "blank reason"],
    [{ unknown: true }, "unknown field"]
  ])("rejects %s (%s)", async (override, label) => {
    expect(label).toEqual(expect.any(String));
    const fixture = createFixture();
    await request(fixture.app)
      .post(`/api/v1/backoffice/agents/${agentPublicId}/commission-rules`)
      .set("Authorization", "Bearer operator")
      .send({
        fixedSuccessRewardJpy: 50_000,
        profitShareRateBps: 1_500,
        paymentMethod: "bank_transfer",
        paymentDetails: null,
        effectiveFrom: "2026-10-01T00:00:00.000Z",
        reason: "valid reason",
        ...override
      })
      .expect(400)
      .expect({ code: ERROR_CODES.VALIDATION, message: "error.validation", data: null });
    expect(fixture.repository.publish).not.toHaveBeenCalled();
  });

  it("requires authentication, exact permissions and a platform identity", async () => {
    const fixture = createFixture();
    const path = `/api/v1/backoffice/agents/${agentPublicId}/commission-rules`;
    await request(fixture.app).get(path).expect(401);
    await request(fixture.app)
      .get(path)
      .set("Authorization", "Bearer no-permission")
      .expect(403);
    await request(fixture.app)
      .post(path)
      .set("Authorization", "Bearer read-only")
      .send({})
      .expect(403);
    await request(fixture.app)
      .get(path)
      .set("Authorization", "Bearer shop")
      .expect(403)
      .expect({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.identity.forbidden",
        data: null
      });
    expect(fixture.repository.getOverview).not.toHaveBeenCalled();
  });

  it("maps agent and chronology conflicts to stable public errors", async () => {
    const missing = createFixture();
    missing.repository.getOverview.mockResolvedValueOnce({ outcome: "agent_not_found" });
    await request(missing.app)
      .get(`/api/v1/backoffice/agents/${agentPublicId}/commission-rules`)
      .set("Authorization", "Bearer operator")
      .expect(404);

    const conflict = createFixture();
    conflict.repository.publish.mockResolvedValueOnce({ outcome: "conflict" });
    await request(conflict.app)
      .post(`/api/v1/backoffice/agents/${agentPublicId}/commission-rules`)
      .set("Authorization", "Bearer operator")
      .send({
        fixedSuccessRewardJpy: 50_000,
        profitShareRateBps: 1_500,
        paymentMethod: "ndp",
        paymentDetails: null,
        effectiveFrom: "2026-10-01T00:00:00.000Z",
        reason: "conflicting version"
      })
      .expect(409)
      .expect({
        code: ERROR_CODES.AGENT_COMMISSION_RULE_CONFLICT,
        message: "error.agent_commission_rule.conflict",
        data: null
      });
  });

  it("publishes authenticated OpenAPI contracts for GET and POST only", () => {
    const document = createOpenApiDocument(env) as unknown as {
      paths: Record<string, Record<string, Record<string, unknown>>>;
      components: { schemas: Record<string, unknown> };
    };
    const path = document.paths[
      "/api/v1/backoffice/agents/{agentPublicId}/commission-rules"
    ];
    expect(path.get).toMatchObject({
      "x-permission": "backoffice:agent:read",
      security: [{ bearerAuth: [] }]
    });
    expect(path.post).toMatchObject({
      "x-permission": "backoffice:agent:write",
      security: [{ bearerAuth: [] }]
    });
    expect(path).not.toHaveProperty("patch");
    expect(path).not.toHaveProperty("put");
    expect(document.components.schemas.AgentCommissionRule).toBeDefined();
  });
});
