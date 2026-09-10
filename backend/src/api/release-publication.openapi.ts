const item = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "deploymentId",
    "environment",
    "version",
    "sourceRevision",
    "previousRevision",
    "publishedAt",
    "kind",
    "changes",
    "origin",
    "lockVersion"
  ],
  properties: {
    id: { type: "integer", minimum: 1 },
    deploymentId: { type: "string", format: "uuid" },
    environment: { type: "string", enum: ["local", "test", "staging", "prod"] },
    version: { type: "string" },
    sourceRevision: { type: "string", pattern: "^[0-9a-f]{40}$", nullable: true },
    previousRevision: { type: "string", nullable: true },
    publishedAt: {
      type: "string",
      format: "date-time",
      description:
        "Actual successful publication timestamp in UTC, never the Git commit or build timestamp."
    },
    kind: { type: "string", enum: ["release", "rollback", "baseline", "redeploy"] },
    changes: { type: "array", items: { type: "string" }, minItems: 1 },
    origin: { type: "string", enum: ["deployment", "manual", "backfill"] },
    lockVersion: { type: "integer", minimum: 1 }
  }
};
const manualBody = {
  type: "object",
  additionalProperties: false,
  required: ["deploymentId", "version", "publishedAt", "changes", "reason"],
  properties: {
    deploymentId: {
      type: "string",
      format: "uuid",
      description: "Client-generated unique request identifier"
    },
    version: { type: "string", minLength: 1, maxLength: 100 },
    sourceRevision: { type: "string", pattern: "^[0-9a-f]{40}$", nullable: true },
    publishedAt: { type: "string", format: "date-time" },
    changes: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: 2000 },
      minItems: 1,
      maxItems: 100
    },
    reason: { type: "string", minLength: 1, maxLength: 500 }
  }
};
const editBody = {
  type: "object",
  additionalProperties: false,
  required: ["version", "changes", "reason", "expectedVersion"],
  properties: {
    version: { type: "string", minLength: 1, maxLength: 100 },
    changes: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: 2000 },
      minItems: 1,
      maxItems: 100
    },
    reason: { type: "string", minLength: 1, maxLength: 500 },
    expectedVersion: { type: "integer", minimum: 1 }
  }
};
export const releasePublicationOpenApiPaths = (apiPrefix: string) => ({
  [`${apiPrefix}/backoffice/releases`]: {
    get: {
      tags: ["Backoffice"],
      operationId: "listReleasePublications",
      summary: "List published versions in the current deployment environment",
      security: [{ bearerAuth: [] }],
      "x-permission": "backoffice:dashboard:read",
      description:
        "Requires a current platform identity. Ordered by publishedAt descending and id descending.",
      parameters: [
        {
          name: "page",
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 100000, default: 1 }
        },
        {
          name: "pageSize",
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 100, default: 10 }
        },
        {
          name: "from",
          in: "query",
          schema: { type: "string", format: "date" },
          description: "Inclusive Tokyo calendar date"
        },
        {
          name: "to",
          in: "query",
          schema: { type: "string", format: "date" },
          description: "Inclusive Tokyo calendar date"
        }
      ],
      responses: {
        "200": {
          description: "Success",
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["code", "message", "data"],
                properties: {
                  code: { type: "integer", enum: [0] },
                  message: { type: "string" },
                  data: {
                    type: "object",
                    required: ["list", "total", "page", "page_size"],
                    properties: {
                      list: { type: "array", items: item },
                      total: { type: "integer", minimum: 0 },
                      page: { type: "integer" },
                      page_size: { type: "integer" }
                    }
                  }
                }
              }
            }
          }
        },
        "400": { description: "Invalid query" },
        "401": { description: "Authentication required" },
        "403": { description: "Platform identity and permission required" },
        "500": { description: "Service unavailable" }
      }
    },
    post: {
      tags: ["Backoffice"],
      operationId: "createManualReleasePublication",
      summary: "Manually record a publication in the current environment",
      security: [{ bearerAuth: [] }],
      "x-permission": "backoffice:releases:write",
      requestBody: { required: true, content: { "application/json": { schema: manualBody } } },
      responses: {
        "201": { description: "Created" },
        "400": { description: "Invalid input" },
        "401": { description: "Authentication required" },
        "403": { description: "Platform identity and permission required" },
        "409": { description: "Idempotency conflict" }
      }
    }
  },
  [`${apiPrefix}/backoffice/releases/{id}`]: {
    patch: {
      tags: ["Backoffice"],
      operationId: "correctManualReleasePublication",
      summary: "Correct a manual or backfilled publication while retaining audit history",
      security: [{ bearerAuth: [] }],
      "x-permission": "backoffice:releases:write",
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
      ],
      requestBody: { required: true, content: { "application/json": { schema: editBody } } },
      responses: {
        "200": { description: "Corrected" },
        "400": { description: "Invalid input" },
        "401": { description: "Authentication required" },
        "403": { description: "Platform identity and permission required" },
        "404": { description: "Publication not found" },
        "409": { description: "Deployment evidence is immutable or version changed" }
      }
    }
  }
});
