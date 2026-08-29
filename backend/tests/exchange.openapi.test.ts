import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";

interface OpenApiSchema {
  enum?: string[];
  oneOf?: Array<{ $ref: string }>;
  properties: Record<string, OpenApiSchema>;
}

interface OpenApiParameter {
  name: string;
  in: string;
  required?: boolean;
  schema: Record<string, unknown>;
}

interface OpenApiOperation {
  security: Array<{ bearerAuth: never[] }>;
  parameters: OpenApiParameter[];
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
  it("documents exactly the nine enabled Exchange routes", () => {
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
      ["/api/v1/exchange/posts/{id}/shares", "post"]
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

  it("publishes lowercase public enums and never exposes internal actor ids", () => {
    const openApi = document();
    const schemas = openApi.components.schemas;
    expect(schemas.ExchangePost.properties.type.enum).toEqual(["demand", "intelligence"]);
    expect(schemas.ExchangePost.properties.status.enum).toEqual([
      "published",
      "withdrawn",
      "expired"
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
  });
});
