import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";

interface Operation {
  parameters: Array<{ name: string; in: string; required?: boolean; schema: unknown }>;
  responses: Record<string, { description: string }>;
  "x-required-permission": string;
}

interface Document {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Record<string, unknown>> };
}

const document = createOpenApiDocument(env) as unknown as Document;

describe("Exchange selective claim OpenAPI", () => {
  it("documents only the five approved claim endpoints and their permissions", () => {
    const expected = [
      ["/api/v1/exchange/posts/{id}/claim-options", "get", "exchange:claim-options:list"],
      ["/api/v1/exchange/posts/{id}/claims", "post", "exchange:claims:create"],
      [
        "/api/v1/exchange/posts/{id}/claims",
        "get",
        "exchange:claims:list-owned-request"
      ],
      ["/api/v1/exchange/posts/{id}/claims/mine", "get", "exchange:claims:read-own"],
      [
        "/api/v1/exchange/claims/{claimId}/withdraw",
        "post",
        "exchange:claims:withdraw-own"
      ]
    ] as const;
    for (const [path, method, permission] of expected) {
      expect(document.paths[path]?.[method]).toEqual(
        expect.objectContaining({
          security: [{ bearerAuth: [] }],
          "x-required-permission": permission
        })
      );
    }
    for (const deferred of ["matches", "bookings", "orders", "payments"]) {
      expect(document.paths).not.toHaveProperty(`/api/v1/exchange/posts/{id}/${deferred}`);
    }
  });

  it("documents pagination, filters and create idempotency", () => {
    const optionRead = document.paths["/api/v1/exchange/posts/{id}/claim-options"].get;
    expect(optionRead.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "page" }),
        expect.objectContaining({ name: "page_size" }),
        expect.objectContaining({ name: "shop_id" }),
        expect.objectContaining({ name: "technician_profile_id" }),
        expect.objectContaining({ name: "service_ref" })
      ])
    );
    expect(document.paths["/api/v1/exchange/posts/{id}/claims"].post.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Idempotency-Key",
          in: "header",
          required: true,
          schema: { type: "string", minLength: 16, maxLength: 191 }
        })
      ])
    );
    expect(document.paths["/api/v1/exchange/claims/{claimId}/withdraw"].post.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Idempotency-Key",
          in: "header",
          required: true,
          schema: { type: "string", minLength: 16, maxLength: 191 }
        })
      ])
    );
    expect(document.paths["/api/v1/exchange/posts/{id}/claims"].get.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "page_size" })])
    );
  });

  it("documents exact claim payloads and every stable service error", () => {
    expect(document.components.schemas).toEqual(
      expect.objectContaining({
        ExchangeClaim: expect.any(Object),
        ExchangeClaimMine: expect.any(Object),
        ExchangeClaimPage: expect.any(Object),
        ExchangeClaimOption: expect.any(Object),
        ExchangeClaimOptionPage: expect.any(Object),
        ExchangeClaimCreateRequest: expect.any(Object)
      })
    );
    const create = document.paths["/api/v1/exchange/posts/{id}/claims"].post;
    const descriptions = Object.values(create.responses)
      .map((response) => response.description)
      .join(" ");
    for (const key of [
      "error.exchange.claim_not_allowed",
      "error.exchange.claim_option_not_found",
      "error.exchange.claim_selective_only",
      "error.exchange.claim_quote_below_budget",
      "error.exchange.claim_quote_above_budget",
      "error.exchange.claim_schedule_unavailable",
      "error.exchange.claim_time_conflict",
      "error.exchange.claim_duplicate",
      "error.exchange.claim_idempotency_conflict",
      "error.exchange.claim_invalid_state"
    ]) {
      expect(descriptions).toContain(key);
    }
    expect(JSON.stringify(document.components.schemas.ExchangeClaim)).not.toMatch(
      /claimantUserId|claimantIdentityId|activeKey|payloadFingerprint|idempotencyKey/
    );
    expect(document.components.schemas.ExchangeClaimMine).toEqual({
      type: "object",
      additionalProperties: false,
      required: ["claim"],
      properties: {
        claim: {
          oneOf: [{ $ref: "#/components/schemas/ExchangeClaim" }, { type: "null" }]
        }
      }
    });
    const mineResponse = document.paths["/api/v1/exchange/posts/{id}/claims/mine"].get
      .responses["200"] as unknown as {
      content: { "application/json": { schema: { properties: { data: unknown } } } };
    };
    expect(mineResponse.content["application/json"].schema.properties.data).toEqual({
      $ref: "#/components/schemas/ExchangeClaimMine"
    });
  });
});
