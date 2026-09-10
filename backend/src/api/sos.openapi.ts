import { PRISMA_INT_MAX } from "../constants/database";
const integer = { type: "integer", minimum: 1, maximum: PRISMA_INT_MAX };
const nullableDate = { type: "string", format: "date-time", nullable: true };
const alert = {
  type: "object",
  required: [
    "id",
    "orderId",
    "orderNo",
    "shopId",
    "shopName",
    "serviceName",
    "senderName",
    "senderType",
    "status",
    "createdAt",
    "resolvedAt",
    "resolvedByName"
  ],
  properties: {
    id: integer,
    orderId: integer,
    orderNo: { type: "string" },
    shopId: integer,
    shopName: { type: "string" },
    serviceName: { type: "string" },
    senderName: { type: "string" },
    senderType: { type: "string", enum: ["customer", "technician"] },
    status: { type: "string", enum: ["pending", "resolved"] },
    createdAt: { type: "string", format: "date-time" },
    resolvedAt: nullableDate,
    resolvedByName: { type: "string", nullable: true }
  }
};
const response = (data: unknown) => ({
  description: "Success",
  content: {
    "application/json": {
      schema: {
        type: "object",
        required: ["code", "message", "data"],
        properties: {
          code: { type: "integer", enum: [0] },
          message: { type: "string", enum: ["success"] },
          data
        }
      }
    }
  }
});
const command = {
  type: "object",
  required: ["alert", "replayed"],
  properties: { alert, replayed: { type: "boolean" } }
};
const param = (name: string) => ({ in: "path", name, required: true, schema: integer });
const operation = (permission: string, data: unknown, extra = {}) => ({
  tags: ["SOS"],
  security: [{ bearerAuth: [] }],
  "x-permission": permission,
  responses: {
    200: response(data),
    400: { description: "Invalid parameters" },
    401: { description: "Authentication required" },
    403: { description: "Current identity, permission or scope denied" },
    404: { description: "Scoped booking or alert not found" },
    409: { description: "Idempotency key reused for another booking" }
  },
  ...extra
});
export const sosOpenApiPaths = {
  "/bookings/{orderId}/sos-availability": {
    get: operation(
      "sos:create",
      {
        type: "object",
        required: ["canSend", "serverNow", "expiresAt", "activeAlertId"],
        properties: {
          canSend: { type: "boolean" },
          serverNow: { type: "string", format: "date-time" },
          expiresAt: nullableDate,
          activeAlertId: { ...integer, nullable: true }
        }
      },
      {
        parameters: [param("orderId")],
        description:
          "Own customer or assigned technician current identity. SOS is available regardless of booking status or actual service times. canSend is true and expiresAt is null after authorization. Reads never write."
      }
    )
  },
  "/bookings/{orderId}/sos": {
    post: operation("sos:create", command, {
      parameters: [param("orderId")],
      description:
        "Atomically persist pending SOS, permanent identity/key binding and audit. Same active booking/identity merges; retries keep referencing the original alert after resolution. SSE sos.created is a best-effort identity-scoped invalidation.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["idempotencyKey"],
              properties: {
                idempotencyKey: {
                  type: "string",
                  minLength: 8,
                  maxLength: 128,
                  pattern: "^[A-Za-z0-9:_-]+$"
                }
              }
            }
          }
        }
      }
    })
  },
  "/sos-alerts": {
    get: operation(
      "sos:list",
      {
        type: "object",
        required: ["list", "total", "page", "page_size"],
        properties: {
          list: { type: "array", items: alert },
          total: { type: "integer" },
          page: integer,
          page_size: integer
        }
      },
      {
        parameters: [
          {
            in: "query",
            name: "status",
            schema: { type: "string", enum: ["pending", "resolved"] }
          },
          { in: "query", name: "page", schema: { ...integer, default: 1, maximum: 100000 } },
          { in: "query", name: "page_size", schema: { ...integer, default: 20, maximum: 100 } }
        ],
        description:
          "Current merchant selected shop or operations identity scope, newest first. Opening does not resolve."
      }
    )
  },
  "/sos-alerts/count": {
    get: operation("sos:list", {
      type: "object",
      required: ["pending"],
      properties: { pending: { type: "integer", minimum: 0 } }
    })
  },
  "/sos-alerts/{alertId}/resolve": {
    post: operation("sos:resolve", command, {
      parameters: [param("alertId")],
      description:
        "Explicit idempotent shared resolution with actor identity and audit in one transaction. SSE sos.resolved invalidates scoped clients.",
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object", additionalProperties: false } } }
      }
    })
  }
};
