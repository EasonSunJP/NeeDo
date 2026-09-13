import { FIELD_JOB_PERMISSIONS } from "../constants/permissions.constants";

const nullableDateTime = { type: ["string", "null"], format: "date-time" };
const statusValues = [
  "pending",
  "confirmed",
  "inService",
  "awaitingCheckout",
  "awaitingPaymentConfirmation",
  "completed",
  "cancelled"
];

export const fieldJobOpenApiSchemas = {
  FieldJobLocation: {
    type: "object",
    additionalProperties: false,
    description: `List rows are always region-only. Exact lines may appear only in detail responses with ${FIELD_JOB_PERMISSIONS.addressRead}.`,
    required: ["disclosure", "regionLabel", "lines"],
    properties: {
      disclosure: { type: "string", enum: ["region_only", "full"] },
      regionLabel: { type: "string" },
      lines: { oneOf: [{ type: "array", items: { type: "string" } }, { type: "null" }] }
    }
  },
  FieldJobTechnician: {
    type: "object",
    additionalProperties: false,
    required: ["assignment", "profileId", "needoId", "name"],
    properties: {
      assignment: { type: "string", enum: ["assigned", "unassigned"] },
      profileId: { type: ["integer", "null"], minimum: 1 },
      needoId: { type: ["string", "null"] },
      name: { type: ["string", "null"] }
    }
  },
  FieldJobCredential: {
    type: "object",
    additionalProperties: false,
    description: "Reports lifecycle state only; secret service-start material is never disclosed.",
    required: ["state", "verifiedAt"],
    properties: {
      state: { type: "string", enum: ["not_issued", "issued", "verified"] },
      verifiedAt: nullableDateTime
    }
  },
  FieldJobEvidence: {
    type: "object",
    additionalProperties: false,
    required: ["startedAt", "expectedEndsAt", "endedAt", "receiptConfirmedAt", "paymentStatus"],
    properties: {
      startedAt: nullableDateTime,
      expectedEndsAt: nullableDateTime,
      endedAt: nullableDateTime,
      receiptConfirmedAt: nullableDateTime,
      paymentStatus: {
        type: "string",
        enum: ["pending", "confirmed", "refundPending", "refunded"]
      }
    }
  },
  FieldJobExceptions: {
    type: "object",
    additionalProperties: false,
    description: "Active SOS count is nullable and is present only with sos:list.",
    required: [
      "activeSosCount",
      "activeRefundCaseCount",
      "openDisputeCount",
      "overdueResolution",
      "hasPerformanceIssue"
    ],
    properties: {
      activeSosCount: { type: ["integer", "null"], minimum: 0 },
      activeRefundCaseCount: { type: "integer", minimum: 0 },
      openDisputeCount: { type: "integer", minimum: 0 },
      overdueResolution: { type: ["string", "null"] },
      hasPerformanceIssue: { type: "boolean" }
    }
  },
  FieldJobTimelineEvent: {
    type: "object",
    additionalProperties: false,
    required: ["id", "fromStatus", "toStatus", "reason", "createdAt"],
    properties: {
      id: { type: "integer", minimum: 1 },
      fromStatus: { oneOf: [{ type: "string", enum: statusValues }, { type: "null" }] },
      toStatus: { type: "string", enum: statusValues },
      reason: { type: ["string", "null"], maxLength: 500 },
      createdAt: { type: "string", format: "date-time" }
    }
  },
  FieldJobSummary: {
    type: "object",
    additionalProperties: false,
    description:
      `Read-only projection from authoritative BookingOrder rows whose fulfillmentMode is home or the formal simulation value home_visit. List rows are always region-only; exact lines are detail-only with ${FIELD_JOB_PERMISSIONS.addressRead}, and SOS disclosure requires sos:list.`,
    required: [
      "id",
      "orderNo",
      "status",
      "serviceName",
      "shop",
      "technician",
      "startsAt",
      "endsAt",
      "location",
      "credential",
      "evidence",
      "exceptions",
      "createdAt",
      "updatedAt"
    ],
    properties: {
      id: { type: "integer", minimum: 1 },
      orderNo: { type: "string" },
      status: { type: "string", enum: statusValues },
      serviceName: { type: "string" },
      shop: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name"],
        properties: { id: { type: "integer", minimum: 1 }, name: { type: "string" } }
      },
      technician: { $ref: "#/components/schemas/FieldJobTechnician" },
      startsAt: { type: "string", format: "date-time" },
      endsAt: { type: "string", format: "date-time" },
      location: { $ref: "#/components/schemas/FieldJobLocation" },
      credential: { $ref: "#/components/schemas/FieldJobCredential" },
      evidence: { $ref: "#/components/schemas/FieldJobEvidence" },
      exceptions: { $ref: "#/components/schemas/FieldJobExceptions" },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" }
    }
  },
  FieldJobDetail: {
    allOf: [
      { $ref: "#/components/schemas/FieldJobSummary" },
      {
        type: "object",
        additionalProperties: false,
        required: ["customerPublicId", "timeline"],
        properties: {
          customerPublicId: { type: "string" },
          timeline: {
            type: "array",
            items: { $ref: "#/components/schemas/FieldJobTimelineEvent" }
          }
        }
      }
    ]
  },
  FieldJobPage: {
    type: "object",
    additionalProperties: false,
    required: ["list", "total", "page", "page_size"],
    properties: {
      list: { type: "array", items: { $ref: "#/components/schemas/FieldJobSummary" } },
      total: { type: "integer", minimum: 0 },
      page: { type: "integer", minimum: 1 },
      page_size: { type: "integer", minimum: 1, maximum: 100 }
    }
  }
};

const success = (schema: Record<string, unknown>) => ({
  description: "success",
  content: {
    "application/json": {
      schema: {
        type: "object",
        required: ["code", "message", "data"],
        properties: {
          code: { type: "integer", enum: [0] },
          message: { type: "string", enum: ["success"] },
          data: schema
        }
      }
    }
  }
});

const errors = {
  "400": { description: "error.validation" },
  "401": { description: "error.auth.unauthorized" },
  "403": { description: "error.forbidden" }
};

export const fieldJobOpenApiPaths = (apiPrefix: string) => ({
  [`${apiPrefix}/backoffice/field-jobs`]: {
    get: {
      tags: ["Field Jobs"],
      summary: "List formal home-service order projections",
      security: [{ bearerAuth: [] }],
      "x-required-permission": FIELD_JOB_PERMISSIONS.read,
      parameters: [
        { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
        {
          name: "pageSize",
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 100, default: 20 }
        },
        { name: "keyword", in: "query", schema: { type: "string", minLength: 1, maxLength: 100 } },
        { name: "status", in: "query", schema: { type: "string", enum: statusValues } },
        {
          name: "assignment",
          in: "query",
          schema: { type: "string", enum: ["assigned", "unassigned"] }
        }
      ],
      responses: { "200": success({ $ref: "#/components/schemas/FieldJobPage" }), ...errors }
    }
  },
  [`${apiPrefix}/backoffice/field-jobs/{id}`]: {
    get: {
      tags: ["Field Jobs"],
      summary: "Read one formal home-service order projection",
      security: [{ bearerAuth: [] }],
      "x-required-permission": FIELD_JOB_PERMISSIONS.read,
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
      ],
      responses: {
        "200": success({ $ref: "#/components/schemas/FieldJobDetail" }),
        ...errors,
        "404": { description: "error.field_job.not_found" }
      }
    }
  }
});
