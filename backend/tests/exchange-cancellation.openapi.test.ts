import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";
import { ERROR_CODES } from "../src/constants/error-codes";

interface Operation {
  tags: string[];
  security: Array<{ bearerAuth: unknown[] }>;
  "x-required-permission": string;
  parameters: Array<{ name: string; in: string; required?: boolean }>;
  requestBody?: { content: { "application/json": { schema: { $ref: string } } } };
  responses: Record<
    string,
    {
      content?: {
        "application/json": {
          schema?: { $ref: string };
          examples?: Record<string, { value: unknown }>;
        };
      };
    }
  >;
}

interface Document {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Record<string, unknown>> };
}

const document = createOpenApiDocument(env) as unknown as Document;
const base = "/api/v1/exchange/orders/{id}/cancellation";

describe("Exchange bilateral cancellation OpenAPI", () => {
  it("uses a cancellation-specific 409 schema permitting null or integer currentVersion data", () => {
    for (const suffix of ["", "/requests", "/accept", "/reject", "/withdraw"]) {
      const operation = document.paths[`${base}${suffix}`][suffix ? "post" : "get"]!;
      expect(operation.responses["409"].content?.["application/json"].schema).toEqual({
        $ref: "#/components/schemas/ExchangeCancellationConflict"
      });
    }
    expect(document.components.schemas.ExchangeCancellationConflict).toEqual({
      type: "object",
      additionalProperties: false,
      required: ["code", "message", "data"],
      properties: {
        code: { type: "integer" },
        message: { type: "string" },
        data: {
          oneOf: [
            { type: "null" },
            {
              type: "object",
              additionalProperties: false,
              required: ["currentVersion"],
              properties: { currentVersion: { type: "integer", minimum: 0 } }
            }
          ]
        }
      }
    });
  });

  it("documents one authenticated read and four idempotent write endpoints", () => {
    const read = document.paths[base]?.get;
    expect(read).toEqual(
      expect.objectContaining({
        tags: ["NeeDo Exchange"],
        security: [{ bearerAuth: [] }],
        "x-required-permission": "exchange:cancellation:read-own"
      })
    );
    expect(read.parameters.map(({ name }) => name)).toEqual(["id"]);

    for (const [suffix, schema] of [
      ["/requests", "ExchangeCancellationRequest"],
      ["/accept", "ExchangeCancellationDecisionRequest"],
      ["/reject", "ExchangeCancellationDecisionRequest"],
      ["/withdraw", "ExchangeCancellationDecisionRequest"]
    ] as const) {
      const operation = document.paths[`${base}${suffix}`]?.post;
      expect(operation).toEqual(
        expect.objectContaining({
          tags: ["NeeDo Exchange"],
          security: [{ bearerAuth: [] }],
          "x-required-permission": "exchange:cancellation:write-own"
        })
      );
      expect(operation.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "id", in: "path", required: true }),
          expect.objectContaining({ name: "Idempotency-Key", in: "header", required: true })
        ])
      );
      expect(operation.requestBody?.content["application/json"].schema.$ref).toBe(
        `#/components/schemas/${schema}`
      );
      expect(Object.keys(operation.responses).sort()).toEqual([
        "200",
        "400",
        "401",
        "403",
        "404",
        "409"
      ]);
    }
  });

  it("publishes strict request, decision, and result schemas", () => {
    expect(document.components.schemas.ExchangeCancellationRequest).toEqual(
      expect.objectContaining({
        type: "object",
        additionalProperties: false,
        required: ["expectedVersion", "reason"]
      })
    );
    expect(document.components.schemas.ExchangeCancellationDecisionRequest).toEqual(
      expect.objectContaining({
        type: "object",
        additionalProperties: false,
        required: ["expectedVersion"]
      })
    );
    expect(document.components.schemas.ExchangeCancellation).toEqual(
      expect.objectContaining({
        type: "object",
        additionalProperties: false,
        required: ["orderId", "orderStatus", "viewerParty", "allowedActions", "cancellation"]
      })
    );
  });

  it("makes every stable cancellation error machine-visible", () => {
    const operation = document.paths[`${base}/accept`].post;
    const examples = operation.responses["409"].content?.["application/json"].examples;
    expect(examples).toEqual(
      expect.objectContaining({
        invalid_state: {
          value: {
            code: ERROR_CODES.EXCHANGE_CANCELLATION_INVALID_STATE,
            message: "error.exchange.cancellation_invalid_state",
            data: null
          }
        },
        version_conflict: {
          value: {
            code: ERROR_CODES.EXCHANGE_CANCELLATION_VERSION_CONFLICT,
            message: "error.exchange.cancellation_version_conflict",
            data: { currentVersion: 1 }
          }
        },
        pending_conflict: {
          value: {
            code: ERROR_CODES.EXCHANGE_CANCELLATION_PENDING_CONFLICT,
            message: "error.exchange.cancellation_pending_conflict",
            data: null
          }
        },
        idempotency_conflict: {
          value: {
            code: ERROR_CODES.EXCHANGE_CANCELLATION_IDEMPOTENCY_CONFLICT,
            message: "error.exchange.cancellation_idempotency_conflict",
            data: null
          }
        },
        slot_conflict: {
          value: {
            code: ERROR_CODES.EXCHANGE_CANCELLATION_SLOT_CONFLICT,
            message: "error.exchange.cancellation_slot_conflict",
            data: null
          }
        }
      })
    );
  });
});
