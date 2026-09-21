const nullableDate = { type: "string", format: "date-time", nullable: true };
const status = {
  type: "string",
  enum: ["unsynced", "on_duty", "traveling", "in_service", "resting", "off_duty"]
};
const event = {
  type: "object",
  required: [
    "id",
    "at",
    "kind",
    "basis",
    "actorName",
    "actorAvatarUrl",
    "fromStatus",
    "toStatus",
    "plannedAt",
    "actualAt",
    "delaySeconds",
    "reason",
    "order"
  ],
  properties: {
    affectedOrders: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          orderNo: { type: "string" },
          serviceName: { type: "string", nullable: true },
          startsAt: { type: "string", format: "date-time" },
          endsAt: { type: "string", format: "date-time" }
        }
      }
    },
    id: { type: "string" },
    at: { type: "string", format: "date-time" },
    kind: { type: "string", enum: ["status", "late", "early_leave", "comment", "service", "shop_switch"] },
    basis: { type: "string", enum: ["shift", "booking"], nullable: true },
    actorName: { type: "string" },
    actorAvatarUrl: { type: "string", nullable: true },
    fromStatus: { ...status, nullable: true },
    toStatus: { ...status, nullable: true },
    plannedAt: nullableDate,
    actualAt: nullableDate,
    delaySeconds: { type: "number", nullable: true },
    reason: { type: "string", nullable: true },
    order: {
      type: "object",
      nullable: true,
      properties: {
        id: { type: "integer" },
        orderNo: { type: "string" },
        serviceName: { type: "string" },
        customerName: { type: "string", nullable: true }
      }
    }
  }
};
const snapshot = {
  type: "object",
  required: ["technicianProfileId", "status", "version", "syncedAt", "currentShop", "month"],
  properties: {
    activeOrderId: { type: "integer", nullable: true },
    technicianProfileId: { type: "integer" },
    status,
    version: { type: "integer" },
    syncedAt: nullableDate,
    currentShop: {
      type: "object",
      nullable: true,
      required: ["id", "publicId", "name"],
      properties: {
        id: { type: "integer" },
        publicId: { type: "string", nullable: true },
        name: { type: "string" }
      }
    },
    month: {
      type: "object",
      properties: {
        lateCount: { type: "integer" },
        earlyLeaveCount: { type: "integer" },
        from: { type: "string", format: "date-time" },
        to: { type: "string", format: "date-time" }
      }
    }
  }
};
const response = (data: unknown) => ({
  description: "Success",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: { code: { type: "integer", enum: [0] }, message: { type: "string" }, data }
      }
    }
  }
});
const operation = (summary: string, data: unknown, extra: Record<string, unknown> = {}) => ({
  summary,
  tags: ["Technician work status"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: response(data),
    400: { description: "Invalid request" },
    401: { description: "Authentication required" },
    403: { description: "Permission or identity scope forbidden" },
    404: { description: "Technician outside authorized scope" },
    409: {
      description:
        "Stale version, active service, idempotency conflict, or data.reason=early_leave_confirmation_required; no writes"
    }
  },
  ...extra
});
const requestBody = (schema: unknown) => ({
  required: true,
  content: { "application/json": { schema } }
});
export const workStatusOpenApiPaths: Record<string, unknown> = {};
for (const base of [
  "/technician-work-status/me",
  "/backoffice/technicians/{id}/work-status",
  "/merchant-admin/technicians/{id}/work-status"
]) {
  const parameters = base.includes("{id}")
    ? [{ name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }]
    : [];
  workStatusOpenApiPaths[base] = {
    parameters,
    get: operation("Read current work state and JST calendar-month incident counts", snapshot),
    ...(base.includes("/me")
      ? {
          patch: operation(
            "Persist technician state with server time and compare-and-swap",
            snapshot,
            {
              requestBody: requestBody({
                type: "object",
                additionalProperties: false,
                required: ["status", "expectedVersion", "idempotencyKey"],
                properties: {
                  status: { type: "string", enum: ["on_duty", "traveling", "resting", "off_duty"] },
                  expectedVersion: { type: "integer", minimum: 0 },
                  idempotencyKey: { type: "string", minLength: 1, maxLength: 100 },
                  reason: { type: "string", minLength: 1, maxLength: 1000 },
                  confirmEarlyLeave: { type: "boolean" },
                  orderId: { type: "integer", minimum: 1 },
                  shopId: { type: "integer", minimum: 1 }
                }
              })
            }
          )
        }
      : {})
  };
  workStatusOpenApiPaths[`${base}/events`] = {
    parameters,
    get: operation(
      "Read scoped newest-first timeline or attendance incidents; [from,to)",
      {
        type: "object",
        properties: {
          list: { type: "array", items: event },
          total: { type: "integer" },
          page: { type: "integer" },
          page_size: { type: "integer" }
        }
      },
      {
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          {
            name: "page_size",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 }
          },
          ...["from", "to"].map((name) => ({
            name,
            in: "query",
            schema: { type: "string", format: "date-time" }
          })),
          { name: "kind", in: "query", schema: { type: "string", enum: ["late", "early_leave"] } },
          { name: "incidentsOnly", in: "query", schema: { type: "boolean" } }
        ]
      }
    )
  };
  if (base.includes("/me")) {
    workStatusOpenApiPaths[`${base}/current-shop`] = {
      patch: operation(
        "Switch the technician's current operating shop without changing any shop status",
        snapshot,
        {
          requestBody: requestBody({
            type: "object",
            additionalProperties: false,
            required: ["shopId", "idempotencyKey"],
            properties: {
              shopId: { type: "integer", minimum: 1 },
              idempotencyKey: { type: "string", minLength: 1, maxLength: 100 }
            }
          })
        }
      )
    };
  }
  workStatusOpenApiPaths[`${base}/comments`] = {
    parameters,
    post: operation("Append audited scoped work record", event, {
      requestBody: requestBody({
        type: "object",
        additionalProperties: false,
        required: ["message", "idempotencyKey"],
        properties: {
          message: { type: "string", minLength: 1, maxLength: 1000 },
          idempotencyKey: { type: "string", minLength: 1, maxLength: 100 }
        }
      })
    })
  };
}
