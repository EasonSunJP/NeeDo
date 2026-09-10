import request from "supertest";
import { createApp } from "../src/app";

describe("agent settlement and operating-cost OpenAPI contract", () => {
  it("documents every formal partner finance route and its dedicated permission", async () => {
    const document = (await request(createApp()).get("/api/v1/openapi.json").expect(200)).body;
    const paths = document.paths;

    expect(paths["/api/v1/backoffice/agents"].get["x-permission"]).toBe("backoffice:agent:read");
    expect(
      paths["/api/v1/backoffice/agents/{agentPublicId}/commission-rules"].post["x-permission"]
    ).toBe("backoffice:agent:write");
    expect(
      paths["/api/v1/backoffice/agents/{agentPublicId}/settlements/preview"].post["x-permission"]
    ).toBe("backoffice:agent-settlement:write");
    expect(paths["/api/v1/backoffice/agents/{agentPublicId}/settlements"].get["x-permission"]).toBe(
      "backoffice:agent-settlement:read"
    );
    expect(
      paths["/api/v1/backoffice/agents/{agentPublicId}/settlements"].post["x-permission"]
    ).toBe("backoffice:agent-settlement:write");
    expect(
      paths["/api/v1/backoffice/agents/{agentPublicId}/settlements/{settlementPublicId}/payment"]
        .post["x-permission"]
    ).toBe("backoffice:agent-settlement:pay");
    expect(paths["/api/v1/backoffice/operating-costs"].get["x-permission"]).toBe(
      "backoffice:operating-cost:read"
    );
    expect(paths["/api/v1/backoffice/operating-costs"].post["x-permission"]).toBe(
      "backoffice:operating-cost:write"
    );
  });

  it("publishes exact monetary, BPS, effective-date, reason, and idempotency bounds", async () => {
    const document = (await request(createApp()).get("/api/v1/openapi.json").expect(200)).body;
    const schemas = document.components.schemas;
    const rule = schemas.AgentCommissionRulePublish;
    const cost = schemas.OperatingCostConfiguration;
    const confirm =
      document.paths["/api/v1/backoffice/agents/{agentPublicId}/settlements"].post.requestBody
        .content["application/json"].schema;

    expect(rule.required).toEqual(
      expect.arrayContaining([
        "fixedSuccessRewardJpy",
        "profitShareRateBps",
        "effectiveFrom",
        "reason"
      ])
    );
    expect(rule.properties.fixedSuccessRewardJpy).toMatchObject({
      type: "integer",
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER
    });
    expect(rule.properties.profitShareRateBps).toMatchObject({ minimum: 0, maximum: 10_000 });
    expect(rule.properties.effectiveFrom.format).toBe("date-time");
    expect(rule.properties.reason).toMatchObject({ minLength: 1, maxLength: 500 });

    expect(cost.properties.amountJpy.maximum).toBe(Number.MAX_SAFE_INTEGER);
    expect(cost.properties.effectiveAt.format).toBe("date-time");
    expect(cost.properties.reason).toMatchObject({ minLength: 1, maxLength: 500 });
    expect(confirm.required).toContain("idempotencyKey");
    expect(confirm.properties.idempotencyKey).toMatchObject({ minLength: 8, maxLength: 160 });
  });

  it("discriminates all allocation modes and marks confirmed settlement evidence immutable", async () => {
    const document = (await request(createApp()).get("/api/v1/openapi.json").expect(200)).body;
    const schemas = document.components.schemas;

    expect(schemas.OperatingCostConfiguration.discriminator).toEqual({
      propertyName: "allocationMode"
    });
    expect(schemas.OperatingCostConfiguration.oneOf).toEqual([
      expect.objectContaining({
        properties: { allocationMode: { const: "equal_active_shops" } }
      }),
      expect.objectContaining({
        properties: { allocationMode: { const: "platform_income_proportional" } }
      }),
      expect.objectContaining({
        required: ["directAssignments"],
        properties: { allocationMode: { const: "direct_shops" } }
      })
    ]);
    expect(schemas.OperatingCostDirectAssignment.oneOf).toHaveLength(2);
    expect(schemas.AgentSettlement["x-immutable-after-confirmation"]).toBe(true);
    expect(schemas.AgentSettlement["x-calculation-snapshot-fields"]).toEqual(
      expect.arrayContaining([
        "rule",
        "lines",
        "orderPlatformFeesJpy",
        "saasFeesJpy",
        "userRebatesJpy",
        "allocatedOperatingCostsJpy"
      ])
    );
  });
});
