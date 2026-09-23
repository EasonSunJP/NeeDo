import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";

interface OpenApiSchema {
  enum?: string[];
  required?: string[];
  oneOf?: Array<{ $ref?: string; type?: string }>;
  properties: Record<string, OpenApiSchema>;
}

interface OpenApiParameter {
  name: string;
  in: string;
  required?: boolean;
  schema: Record<string, unknown>;
}

interface OpenApiOperation {
  description?: string;
  security: Array<{ bearerAuth: never[] }>;
  parameters: OpenApiParameter[];
  responses: Record<string, { description: string }>;
  "x-required-permission"?: string;
  "x-required-permissions"?: string[];
}

interface ExchangeOpenApiDocument {
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: { schemas: Record<string, OpenApiSchema> };
}

const document = (): ExchangeOpenApiDocument =>
  createOpenApiDocument(env) as unknown as ExchangeOpenApiDocument;

describe("formal Exchange OpenAPI contract", () => {
  it("documents pending binary uploads and the immutable demand cover contract", () => {
    const api = document();
    expect(api.paths["/api/v1/exchange/demand-cover"]?.post).toMatchObject({
      "x-required-permission": "exchange:posts:create-demand",
      requestBody: { required: true, content: {
        "image/jpeg": { schema: { type: "string", format: "binary" } },
        "image/png": { schema: { type: "string", format: "binary" } },
        "image/webp": { schema: { type: "string", format: "binary" } }
      } }
    });
    const schemas = api.components.schemas;
    expect(schemas.ExchangeDemandPublishRequest.properties.coverMediaAssetPublicId).toMatchObject({ type: "string", pattern: "^[a-f0-9]{64}$" });
    expect(schemas.ExchangeDemandPublishRequest.required).not.toContain("coverMediaAssetPublicId");
    expect(schemas.ExchangeIntelligencePublishRequest.properties).not.toHaveProperty("coverMediaAssetPublicId");
    expect(schemas.ExchangeDemand.required).toContain("cover");
    expect(schemas.ExchangeDemand.properties.cover).toMatchObject({ type: "object", required: ["url", "isDefault"],
      properties: { url: { type: "string" }, isDefault: { type: "boolean" } } });
    expect(JSON.stringify(schemas.ExchangeDemand.properties.cover)).toContain("/images/exchange-demand-default-cover.svg");
    expect(api.paths["/api/v1/exchange/posts"].post.responses["403"].description).toContain("error.exchange.demand_cover_not_owned");
    for (const [path, methods] of Object.entries(api.paths)) {
      if (path.startsWith("/api/v1/exchange/") && path.includes("cover")) {
        expect(methods).not.toHaveProperty("patch");
        expect(methods).not.toHaveProperty("put");
        expect(methods).not.toHaveProperty("delete");
      }
    }
  });

  it("documents the enabled Exchange publication and fee routes", () => {
    const paths = document().paths;
    const expected = [
      ["/api/v1/exchange/posts", "get"],
      ["/api/v1/exchange/posts", "post"],
      ["/api/v1/exchange/posts/{id}", "get"],
      ["/api/v1/exchange/posts/{id}/withdraw", "post"],
      ["/api/v1/exchange/posts/{id}/comments", "get"],
      ["/api/v1/exchange/posts/{id}/comments", "post"],
      ["/api/v1/exchange/posts/{id}/like", "put"],
      ["/api/v1/exchange/posts/{id}/like", "delete"],
      ["/api/v1/exchange/posts/{id}/shares", "post"],
      ["/api/v1/exchange/request-publication-context", "get"],
      ["/api/v1/exchange/intelligence/service-options", "get"],
      ["/api/v1/backoffice/exchange-request-fee/current", "get"],
      ["/api/v1/backoffice/exchange-request-fee/versions", "get"],
      ["/api/v1/backoffice/exchange-request-fee/versions", "post"]
    ] as const;

    for (const [path, method] of expected) {
      expect(paths[path]?.[method]).toEqual(
        expect.objectContaining({ security: [{ bearerAuth: [] }] })
      );
    }
    for (const deferred of ["offers", "matches", "bookings", "orders", "payments"]) {
      expect(paths).not.toHaveProperty(`/api/v1/exchange/posts/{id}/${deferred}`);
    }
  });

  it("documents the paginated Intelligence service option permission and public projection", () => {
    const openApi = document();
    const operation = openApi.paths["/api/v1/exchange/intelligence/service-options"].get;

    expect(operation).toEqual(
      expect.objectContaining({
        security: [{ bearerAuth: [] }],
        "x-required-permission": "exchange:intelligence:service-options:list"
      })
    );
    expect(operation.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "page" }),
        expect.objectContaining({ name: "page_size" })
      ])
    );
    expect(openApi.components.schemas).toHaveProperty("ExchangeIntelligenceServiceOption");
    expect(JSON.stringify(openApi.components.schemas.ExchangeIntelligenceServiceOption)).not.toMatch(
      /userId|identityId|technicianProfileId/
    );
  });

  it("documents the Request publication context and paginated fee administration permissions", () => {
    const paths = document().paths;
    expect(paths["/api/v1/exchange/request-publication-context"].get).toEqual(
      expect.objectContaining({
        security: [{ bearerAuth: [] }],
        "x-required-permission": "exchange:posts:create-demand"
      })
    );
    expect(paths["/api/v1/backoffice/exchange-request-fee/versions"].get).toEqual(
      expect.objectContaining({ "x-required-permission": "backoffice:exchange-request-fee:read" })
    );
    expect(paths["/api/v1/backoffice/exchange-request-fee/versions"].post).toEqual(
      expect.objectContaining({ "x-required-permission": "backoffice:exchange-request-fee:write" })
    );
    expect(paths["/api/v1/backoffice/exchange-request-fee/versions"].get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "page" }),
        expect.objectContaining({ name: "page_size" })
      ])
    );
  });

  it("documents permissions, bounded pagination, and required idempotency keys", () => {
    const paths = document().paths;
    expect(paths["/api/v1/exchange/posts"].get["x-required-permission"]).toBe(
      "exchange:posts:list"
    );
    expect(paths["/api/v1/exchange/posts"].post["x-required-permissions"]).toEqual([
      "exchange:posts:create-demand",
      "exchange:posts:create-intelligence"
    ]);
    expect(paths["/api/v1/exchange/posts"].get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "type",
          required: true,
          schema: { type: "string", enum: ["demand", "intelligence"] }
        }),
        expect.objectContaining({
          name: "page_size",
          schema: expect.objectContaining({ maximum: 100 })
        })
      ])
    );

    const mutations = [
      paths["/api/v1/exchange/posts"].post,
      paths["/api/v1/exchange/posts/{id}/withdraw"].post,
      paths["/api/v1/exchange/posts/{id}/comments"].post,
      paths["/api/v1/exchange/posts/{id}/like"].put,
      paths["/api/v1/exchange/posts/{id}/like"].delete,
      paths["/api/v1/exchange/posts/{id}/shares"].post
    ];
    for (const operation of mutations) {
      expect(operation.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "Idempotency-Key",
            in: "header",
            required: true,
            schema: { type: "string", minLength: 16, maxLength: 191 }
          })
        ])
      );
    }
  });

  it("documents customer demand privacy on list and detail routes", () => {
    const paths = document().paths;
    expect(paths["/api/v1/exchange/posts"].get.description).toContain(
      "customers receive only demand posts authored by their active account"
    );
    expect(paths["/api/v1/exchange/posts/{id}"].get.description).toContain(
      "other customers receive 404"
    );
  });

  it("documents the Request terminal financial conflict on withdrawal", () => {
    const description =
      document().paths["/api/v1/exchange/posts/{id}/withdraw"].post.responses["409"].description;

    expect(description).toContain("error.exchange.request_financial_state_conflict");
    for (const existing of [
      "error.exchange.post_unavailable",
      "error.exchange.idempotency_conflict",
      "error.exchange.request_target_limit",
      "error.wallet.insufficient_available"
    ]) {
      expect(description).toContain(existing);
    }
  });

  it("publishes lowercase public enums and never exposes internal actor ids", () => {
    const openApi = document();
    const schemas = openApi.components.schemas;
    expect(schemas.ExchangePost.properties.type.enum).toEqual(["demand", "intelligence"]);
    expect(schemas.ExchangePost.properties.status.enum).toEqual([
      "published",
      "withdrawn",
      "expired"
    ]);
    expect(schemas.ExchangePost.properties.priority).toEqual({
      $ref: "#/components/schemas/ExchangePriority"
    });
    expect(schemas.ExchangePriority.properties.tierCode.enum).toEqual([
      "free",
      "silver",
      "gold",
      "black_diamond"
    ]);
    expect(schemas.ExchangePublishRequest.oneOf).toEqual([
      { $ref: "#/components/schemas/ExchangeDemandPublishRequest" },
      { $ref: "#/components/schemas/ExchangeIntelligencePublishRequest" }
    ]);
    const exchangePaths = Object.fromEntries(
      Object.entries(openApi.paths).filter(([path]) => path.startsWith("/api/v1/exchange/"))
    );
    const exchangeSchemas = Object.fromEntries(
      Object.entries(schemas).filter(([name]) => name.startsWith("Exchange"))
    );
    expect(JSON.stringify({ paths: exchangePaths, schemas: exchangeSchemas })).not.toMatch(
      /authorUserId|authorIdentityId|actorUserId|actorIdentityId/
    );
    expect(openApi.paths["/api/v1/exchange/posts"].get.description).toContain(
      "current priority_request benefit"
    );
  });

  it("documents the complete formal Request publication and response contract", () => {
    const schemas = document().components.schemas;
    const publish = schemas.ExchangeDemandPublishRequest;
    expect(publish.required).toEqual(
      expect.arrayContaining([
        "serviceMode",
        "targetProviderCount",
        "matchMode",
        "budgetMode",
        "budgetMaxJpy",
        "addressLine1"
      ])
    );
    expect(publish.required).not.toContain("budgetMinJpy");
    expect(publish.properties).not.toHaveProperty("areaLabel");
    expect(publish.properties.serviceMode.enum).toEqual(["home", "store"]);
    expect(document().paths["/api/v1/exchange/posts"].post.responses["403"].description).toContain(
      "error.user_policy.ekyc_required"
    );
    expect(publish.properties.matchMode.enum).toEqual(["quick", "selective"]);
    expect(publish.properties.budgetMode.enum).toEqual(["total", "per_provider"]);
    expect(publish.properties).toEqual(
      expect.objectContaining({
        addressLine1: expect.objectContaining({ minLength: 1, maxLength: 255 }),
        addressLine2: expect.objectContaining({ type: ["string", "null"] }),
        addressLine3: expect.objectContaining({ type: ["string", "null"] }),
        addressLine2Public: { type: "boolean", const: false, default: false },
        addressLine3Public: { type: "boolean", const: false, default: false },
        publisherIdentityPublic: { type: "boolean", default: false }
      })
    );

    const demand = schemas.ExchangeDemand;
    expect(demand.required).toEqual(
      expect.arrayContaining([
        "serviceMode",
        "targetProviderCount",
        "targetProviderLimitSnapshot",
        "publisherCapacitySource",
        "membershipLevelSnapshot",
        "matchMode",
        "budgetMode",
        "budgetMinJpy",
        "budgetMaxJpy",
        "address"
      ])
    );
    expect(demand.properties.address).toEqual({
      $ref: "#/components/schemas/ExchangeRequestAddress"
    });
    expect(schemas.ExchangeRequestAddress.properties.line1).toEqual(
      expect.objectContaining({ type: ["string", "null"] })
    );
    expect(schemas.ExchangeRequestAddress.properties.disclosure.enum).toEqual([
      "owner",
      "matched_participant",
      "general"
    ]);
    expect(schemas.ExchangePost.properties.publisher.oneOf).toEqual([
      { $ref: "#/components/schemas/ExchangeActor" },
      { type: "null" }
    ]);
    expect(schemas.ExchangeViewerState.required).toEqual([
      "liked",
      "canWithdraw",
      "canClaim",
      "canViewClaims",
      "claimUnavailableReason"
    ]);
    expect(schemas.ExchangeViewerState.properties).toEqual(
      expect.objectContaining({
        canClaim: { type: "boolean" },
        canViewClaims: { type: "boolean" },
        claimUnavailableReason: {
          type: ["string", "null"],
          enum: ["self_published", null]
        }
      })
    );
  });

  it("documents server-authoritative Intelligence service binding and stable publication errors", () => {
    const openApi = document();
    const publish = openApi.components.schemas.ExchangeIntelligencePublishRequest;

    expect(publish.required).toEqual(
      expect.arrayContaining([
        "type",
        "title",
        "detail",
        "contentLocale",
        "serviceStartAt",
        "serviceEndAt",
        "expiresAt",
        "serviceRef",
        "campaignPriceJpy"
      ])
    );
    for (const derivedField of [
      "areaLabel",
      "serviceMode",
      "addressLabel",
      "serviceAreas",
      "originalPriceJpy"
    ]) {
      expect(publish.required).not.toContain(derivedField);
    }
    expect(publish.properties.serviceRef).toEqual({
      type: "string",
      pattern: "^(?:shop|technician):[1-9][0-9]*$"
    });

    const responses = openApi.paths["/api/v1/exchange/posts"].post.responses;
    expect(responses["403"].description).toContain(
      "error.exchange.intelligence_service_forbidden"
    );
    expect(responses["404"].description).toContain(
      "error.exchange.intelligence_service_not_found"
    );
    expect(responses["409"].description).toContain(
      "error.exchange.intelligence_service_unavailable"
    );
    expect(responses["422"].description).toContain(
      "error.exchange.intelligence_service_required"
    );
    expect(responses["422"].description).toContain(
      "error.exchange.intelligence_campaign_price_invalid"
    );
  });

  it("documents the complete public Intelligence booking and card projection", () => {
    const schemas = document().components.schemas;
    expect(schemas.ExchangeIntelligenceShopPublisherCard.required).toEqual(
      expect.arrayContaining(["completedOrderCount", "favoriteCount", "shareCount"])
    );
    expect(schemas.ExchangeIntelligence.required).toEqual(
      expect.arrayContaining(["booking", "publisherCard", "serviceCard"])
    );
    expect(schemas.ExchangeIntelligence.properties).toEqual(
      expect.objectContaining({
        booking: { $ref: "#/components/schemas/ExchangeIntelligenceBooking" },
        publisherCard: {
          oneOf: [
            { $ref: "#/components/schemas/ExchangeIntelligenceShopPublisherCard" },
            { $ref: "#/components/schemas/ExchangeIntelligenceTechnicianPublisherCard" },
            { type: "null" }
          ]
        },
        serviceCard: {
          oneOf: [
            { $ref: "#/components/schemas/ExchangeIntelligenceServiceCard" },
            { type: "null" }
          ]
        }
      })
    );
    expect(schemas.ExchangeIntelligenceBooking.required).toEqual([
      "available",
      "unavailableReason",
      "target",
      "catalogPriceJpy",
      "campaignPriceJpy",
      "serviceName",
      "durationMinutes",
      "serviceMode",
      "serviceWindow"
    ]);
    expect(schemas.ExchangeIntelligenceBooking.properties.unavailableReason.enum).toEqual([
      "legacy_unbound",
      "post_unavailable",
      "publisher_unavailable",
      "service_unavailable",
      null
    ]);
    expect(schemas.ExchangeIntelligenceBookingTarget.properties.type.enum).toEqual([
      "shop_service",
      "technician_service"
    ]);
    expect(schemas.ExchangeIntelligenceTechnicianPublisherCard.properties.publicId).toEqual({
      type: "string",
      pattern: "^s[0-9]{10}$"
    });

    const serialized = JSON.stringify(
      Object.fromEntries(
        Object.entries(schemas).filter(([name]) => name.startsWith("ExchangeIntelligence"))
      )
    );
    expect(serialized).not.toMatch(
      /authorUserId|authorIdentityId|actorUserId|actorIdentityId|technicianProfileId|phone|email|homeAddress|kyc/iu
    );
  });
});
