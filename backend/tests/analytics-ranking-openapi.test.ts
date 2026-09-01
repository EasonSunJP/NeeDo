import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";
import { ERROR_CODES } from "../src/constants/error-codes";
import { MAX_ANALYTICS_RANKING_PAGE } from "../src/domain/analytics-ranking";

describe("analytics ranking OpenAPI", () => {
  type Parameter = { name: string; in: string; required?: boolean; schema: Record<string, unknown> };
  type Response = { content: Record<string, { example?: unknown; examples?: Record<string, unknown> }> };
  type Operation = { operationId: string; security: unknown; description: string;
    parameters: Parameter[]; responses: Record<string, Response>; "x-permission"?: string };
  type Schema = { additionalProperties?: boolean; required?: string[];
    properties: Record<string, Record<string, unknown>> };
  const document = createOpenApiDocument(env) as {
    paths: Record<string, { get: Operation }>;
    components: { schemas: Record<string, Schema> };
  };
  const path = document.paths[`${env.API_PREFIX}/backoffice/analytics/rankings/{kind}`];

  it("publishes the single protected strict ranking operation", () => {
    expect(path.get.operationId).toBe("listFormalAnalyticsRankings");
    expect(path.get.security).toEqual([{ bearerAuth: [] }]);
    expect(path.get["x-permission"]).toBe("backoffice:analytics-ranking:read");
    const parameters = Object.fromEntries(path.get.parameters.map((parameter) => [parameter.name, parameter]));
    expect(parameters.kind).toMatchObject({ in: "path", required: true,
      schema: { type: "string", enum: ["service", "technician", "customer"] } });
    expect(parameters.metric.schema).toMatchObject({ enum: ["gmv", "completedCount"], default: "gmv" });
    expect(parameters.categoryId.schema).toMatchObject({ type: "integer", minimum: 1, maximum: 2147483647 });
    expect(parameters.city.schema).toMatchObject({ "x-min-utf16-code-units": 1,
      "x-max-utf16-code-units": 100, "x-normalization": "trim" });
    expect(parameters.city.schema).not.toHaveProperty("maxLength");
    expect(parameters.page.schema).toMatchObject({ maximum: MAX_ANALYTICS_RANKING_PAGE, default: 1 });
    expect(parameters.pageSize.schema).toMatchObject({ maximum: 10, default: 10 });
    expect(path.get.description).toContain("custom requires both from and to");
    expect(path.get.description).toContain("non-custom periods reject from and to");
    expect(path.get.description).toContain("to must be on or after from");
    expect(path.get.description).toContain("maximum of 366 inclusive Tokyo calendar days");
  });

  it("documents safe result projections, global rank and both formal aggregation semantics", () => {
    const schemas = document.components.schemas;
    expect(schemas.AnalyticsRankingItem.additionalProperties).toBe(false);
    expect(schemas.AnalyticsRankingItem.required).toEqual([
      "rank", "entityType", "entityPublicId", "entityNumericId", "displayName", "avatarUrl",
      "categoryId", "gmvJpy", "completedCount", "registeredAt"
    ]);
    expect(schemas.AnalyticsRankingItem.properties.entityType.enum)
      .toEqual(["service", "technician_service", "technician", "customer"]);
    expect(schemas.AnalyticsRankingItem.properties).not.toHaveProperty("checkoutId");
    expect(path.get.description).toContain("global one-based rank");
    expect(path.get.description).toContain("base and every accepted add-on occurrence");
    expect(path.get.description).toContain("matching-line GMV");
    expect(path.get.description).toContain("distinct completed orders");
    expect(path.get.description).toContain("current direct category");
  });

  it("publishes examples for all kinds and metrics plus stable errors", () => {
    const examples = path.get.responses["200"].content["application/json"].examples;
    for (const key of ["serviceGmv", "serviceCount", "technicianGmv", "technicianCount", "customerGmv", "customerCount"])
      expect(examples).toHaveProperty(key);
    expect(path.get.responses["400"].content["application/json"].example).toMatchObject({ code: 40001 });
    expect(path.get.responses["401"].content["application/json"].example).toMatchObject({ code: 40105, data: null });
    expect(path.get.responses["403"].content["application/json"].example).toMatchObject({ code: 40301, data: null });
    expect(path.get.responses["404"].content["application/json"].example).toEqual({
      code: ERROR_CODES.ANALYTICS_RANKING_CATEGORY_NOT_FOUND,
      message: "error.analytics_ranking.category_not_found", data: null
    });
    expect(path.get.responses["409"].content["application/json"].example).toEqual({
      code: ERROR_CODES.ANALYTICS_RANKING_INCOMPLETE_EVIDENCE,
      message: "error.analytics_ranking.incomplete_evidence", data: null
    });
  });
});
