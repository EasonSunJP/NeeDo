import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";

interface Schema {
  type?: string;
  additionalProperties?: boolean;
  required?: string[];
  properties?: Record<string, Schema>;
  oneOf?: Schema[];
  nullable?: boolean;
  $ref?: string;
}

interface Operation {
  tags: string[];
  security: Array<{ bearerAuth: unknown[] }>;
  "x-required-permission": string;
  parameters: Array<{ name: string; in: string; required?: boolean; schema: Schema }>;
  requestBody: unknown;
  responses: Record<
    string,
    { description: string; content?: Record<string, { schema: Schema }> }
  >;
}

interface Document {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Schema> };
}

const document = createOpenApiDocument(env) as unknown as Document;

describe("Exchange matched booking conversion OpenAPI", () => {
  const operation = document.paths["/api/v1/exchange/posts/{id}/matching/bookings"]?.post;

  it("documents the authenticated exact owner permission and idempotent command", () => {
    expect(operation).toEqual(
      expect.objectContaining({
        tags: ["NeeDo Exchange"],
        security: [{ bearerAuth: [] }],
        "x-required-permission": "exchange:matching:book-own"
      })
    );
    expect(operation.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "id",
          in: "path",
          required: true,
          schema: { type: "integer", minimum: 1 }
        }),
        expect.objectContaining({
          name: "Idempotency-Key",
          in: "header",
          required: true,
          schema: { type: "string", minLength: 16, maxLength: 191 }
        })
      ])
    );
    expect(operation.requestBody).toEqual({
      required: true,
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ExchangeBookingConversionRequest" }
        }
      }
    });
  });

  it("documents the stable success payload and every public response class", () => {
    expect(operation.responses["200"].content?.["application/json"].schema).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          data: { $ref: "#/components/schemas/ExchangeBookingConversion" }
        })
      })
    );
    expect(Object.keys(operation.responses).sort()).toEqual([
      "200",
      "400",
      "401",
      "403",
      "404",
      "409"
    ]);
    expect(operation.responses["409"].description).toContain(
      "error.exchange.match_booking_version_conflict"
    );
  });

  it("documents strict request/result schemas and the matching booking projection", () => {
    expect(document.components.schemas.ExchangeBookingConversionRequest).toEqual(
      expect.objectContaining({
        type: "object",
        additionalProperties: false,
        required: ["expectedVersion"],
        properties: { expectedVersion: { type: "integer", minimum: 1 } }
      })
    );
    expect(document.components.schemas.ExchangeBookingConversion).toEqual(
      expect.objectContaining({
        required: ["exchangePostId", "matchingVersion", "bookedAt", "orders"]
      })
    );
    expect(document.components.schemas.ExchangeMatchParticipant.required).toContain("booking");
    expect(document.components.schemas.ExchangeMatchParticipant.properties?.booking).toEqual(
      expect.objectContaining({ nullable: true, oneOf: expect.any(Array) })
    );
    expect(document.components.schemas.ExchangeMatching.properties?.viewer).toEqual(
      expect.objectContaining({
        required: ["canSelect", "canCreateBookings"],
        properties: {
          canSelect: { type: "boolean" },
          canCreateBookings: { type: "boolean" }
        }
      })
    );
  });
});
