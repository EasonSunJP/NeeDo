import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";
import { ERROR_CODES } from "../src/constants/error-codes";
import type { ExchangeMatchingPayload } from "../src/types/exchange-matching.types";

interface Schema {
  type?: string | string[];
  additionalProperties?: boolean;
  required?: string[];
  properties?: Record<string, Schema>;
  oneOf?: Schema[];
  anyOf?: Schema[];
  allOf?: Schema[];
  items?: Schema;
  enum?: unknown[];
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
    {
      description: string;
      content?: Record<
        string,
        {
          schema: Schema;
          examples?: Record<string, { value: { code: number; message: string; data: unknown } }>;
        }
      >;
    }
  >;
}

interface Document {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Schema> };
}

const document = createOpenApiDocument(env) as unknown as Document;

const matchesDocumentedSchema = (
  schema: Schema,
  value: unknown,
  schemas: Record<string, Schema>
): boolean => {
  if (schema.$ref) {
    const name = schema.$ref.split("/").at(-1);
    return Boolean(name && schemas[name] && matchesDocumentedSchema(schemas[name], value, schemas));
  }
  if (schema.oneOf) {
    return (
      schema.oneOf.filter((candidate) => matchesDocumentedSchema(candidate, value, schemas))
        .length === 1
    );
  }
  if (schema.anyOf)
    return schema.anyOf.some((candidate) => matchesDocumentedSchema(candidate, value, schemas));
  if (schema.allOf)
    return schema.allOf.every((candidate) => matchesDocumentedSchema(candidate, value, schemas));
  if (schema.enum && !schema.enum.some((candidate) => Object.is(candidate, value))) return false;

  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const typeMatches = types.some((type) => {
    if (type === undefined) return true;
    if (type === "null") return value === null;
    if (type === "object")
      return typeof value === "object" && value !== null && !Array.isArray(value);
    if (type === "array") return Array.isArray(value);
    if (type === "integer") return Number.isInteger(value);
    return type === typeof value;
  });
  if (!typeMatches) return false;

  if (Array.isArray(value) && schema.items) {
    return value.every((item) => matchesDocumentedSchema(schema.items!, item, schemas));
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (schema.required?.some((key) => !Object.prototype.hasOwnProperty.call(record, key))) {
      return false;
    }
    if (
      schema.additionalProperties === false &&
      Object.keys(record).some(
        (key) => !Object.prototype.hasOwnProperty.call(schema.properties, key)
      )
    ) {
      return false;
    }
    return Object.entries(schema.properties ?? {}).every(
      ([key, child]) =>
        !Object.prototype.hasOwnProperty.call(record, key) ||
        matchesDocumentedSchema(child, record[key], schemas)
    );
  }
  return true;
};

const matchingProjectionWithNullBooking: ExchangeMatchingPayload = {
  exchangePostId: 42,
  status: "matched",
  version: 8,
  effectiveTargetProviderCount: 1,
  effectiveBudgetMaxJpy: 12_000,
  selectedQuoteTotalJpy: 12_000,
  matchedAt: "2026-09-03T01:02:03.000Z",
  participants: [
    {
      exchangeClaimId: 101,
      provider: { publicId: "u0000000101", displayName: "Provider", avatarUrl: null },
      shop: { id: 11, name: "Shop" },
      technician: { profileId: 21, publicId: "u0000000101", displayName: "Provider" },
      service: { ref: "shop:31", name: "Service", durationMinutes: 60 },
      scheduleSlotId: 41,
      quoteAmountJpy: 12_000,
      currency: "JPY",
      estimatedStartsAt: "2026-09-04T01:00:00.000Z",
      estimatedEndsAt: "2026-09-04T02:00:00.000Z",
      matchedAt: "2026-09-03T01:02:03.000Z",
      booking: null
    }
  ],
  quickBudgetDecision: null,
  viewer: { canSelect: false, canConfirmQuickBudget: false, canCreateBookings: true }
};

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
  });

  it("makes all seven stable errors and their exact data shapes machine-visible", () => {
    const expected = [
      [
        "404",
        "not_found",
        ERROR_CODES.EXCHANGE_MATCH_BOOKING_NOT_FOUND,
        "error.exchange.match_booking_not_found",
        null
      ],
      [
        "403",
        "not_allowed",
        ERROR_CODES.EXCHANGE_MATCH_BOOKING_NOT_ALLOWED,
        "error.exchange.match_booking_not_allowed",
        null
      ],
      [
        "409",
        "invalid_state",
        ERROR_CODES.EXCHANGE_MATCH_BOOKING_INVALID_STATE,
        "error.exchange.match_booking_invalid_state",
        null
      ],
      [
        "409",
        "version_conflict",
        ERROR_CODES.EXCHANGE_MATCH_BOOKING_VERSION_CONFLICT,
        "error.exchange.match_booking_version_conflict",
        { currentVersion: 8 }
      ],
      [
        "409",
        "already_created",
        ERROR_CODES.EXCHANGE_MATCH_BOOKING_ALREADY_CREATED,
        "error.exchange.match_booking_already_created",
        null
      ],
      [
        "409",
        "slot_unavailable",
        ERROR_CODES.EXCHANGE_MATCH_BOOKING_SLOT_UNAVAILABLE,
        "error.exchange.match_booking_slot_unavailable",
        null
      ],
      [
        "409",
        "idempotency_conflict",
        ERROR_CODES.EXCHANGE_MATCH_BOOKING_IDEMPOTENCY_CONFLICT,
        "error.exchange.match_booking_idempotency_conflict",
        null
      ]
    ] as const;

    for (const [status, outcome, code, message, data] of expected) {
      expect(
        operation.responses[status].content?.["application/json"].examples?.[outcome]?.value
      ).toEqual({ code, message, data });
    }
  });

  it("accepts an actual matching projection's null booking under OAS 3.1 schema semantics", () => {
    const bookingSchema = document.components.schemas.ExchangeMatchParticipant.properties?.booking;
    expect(bookingSchema?.oneOf).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "null" })])
    );
    expect(
      matchesDocumentedSchema(
        document.components.schemas.ExchangeMatching,
        matchingProjectionWithNullBooking,
        document.components.schemas
      )
    ).toBe(true);
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
      expect.objectContaining({ oneOf: expect.any(Array) })
    );
    expect(document.components.schemas.ExchangeMatching.properties?.viewer).toEqual(
      expect.objectContaining({
        required: ["canSelect", "canConfirmQuickBudget", "canCreateBookings"],
        properties: {
          canSelect: { type: "boolean" },
          canConfirmQuickBudget: { type: "boolean" },
          canCreateBookings: { type: "boolean" }
        }
      })
    );
    expect(document.components.schemas.ExchangeMatching.properties?.quickBudgetDecision).toEqual(
      expect.objectContaining({ oneOf: expect.any(Array) })
    );
  });
});
