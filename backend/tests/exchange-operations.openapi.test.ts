import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";

interface OpenApiOperation {
  security: Array<Record<string, string[]>>;
  "x-required-permission": string;
  parameters: Array<Record<string, unknown>>;
}

interface OpenApiSchema {
  properties: Record<string, OpenApiSchema>;
  enum?: string[];
}

interface ExchangeOperationsOpenApiDocument {
  paths: Record<string, { get: OpenApiOperation }>;
  components: { schemas: Record<string, OpenApiSchema> };
}

const document = (): ExchangeOperationsOpenApiDocument =>
  createOpenApiDocument(env) as unknown as ExchangeOperationsOpenApiDocument;

describe("Exchange operations OpenAPI", () => {
  it("documents protected paginated list and detail routes", () => {
    const value = document();
    const list = value.paths["/api/v1/backoffice/exchange/posts"].get;
    const detail = value.paths["/api/v1/backoffice/exchange/posts/{id}"].get;

    expect(list).toMatchObject({
      security: [{ bearerAuth: [] }],
      "x-required-permission": "backoffice:exchange:read"
    });
    expect(detail).toMatchObject({
      security: [{ bearerAuth: [] }],
      "x-required-permission": "backoffice:exchange:read"
    });
    expect(list.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "page" }),
        expect.objectContaining({
          name: "page_size",
          schema: expect.objectContaining({ maximum: 100 })
        }),
        expect.objectContaining({ name: "status" }),
        expect.objectContaining({ name: "match_mode" })
      ])
    );
  });

  it("publishes a redacted schema with existing persisted states only", () => {
    const schemas = document().components.schemas;
    const serialized = JSON.stringify({
      list: schemas.ExchangeOperationsPost,
      detail: schemas.ExchangeOperationsDetail
    });

    expect(schemas.ExchangeOperationsPost.properties.status.enum).toEqual([
      "published",
      "matched",
      "expired",
      "withdrawn",
      "closed"
    ]);
    expect(serialized).not.toMatch(
      /authorUserId|authorIdentityId|claimantUserId|claimantIdentityId|email|phone|addressLine2|addressLine3/
    );
    for (const schema of [
      "ExchangeOperationsDemand",
      "ExchangeOperationsIntelligence",
      "ExchangeOperationsClaim",
      "ExchangeOperationsMatching",
      "ExchangeOperationsTimelineEvent"
    ]) {
      expect(schemas[schema]).toBeDefined();
    }
    expect(schemas.ExchangeOperationsDetail.properties).not.toBeDefined();
  });
});
