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
    "changes"
  ],
  properties: {
    id: { type: "integer", minimum: 1 },
    deploymentId: { type: "string", format: "uuid" },
    environment: { type: "string", enum: ["local", "test", "staging", "prod"] },
    version: { type: "string" },
    sourceRevision: { type: "string", pattern: "^[0-9a-f]{40}$" },
    previousRevision: { type: "string", nullable: true },
    publishedAt: {
      type: "string",
      format: "date-time",
      description:
        "Actual successful publication timestamp in UTC, never the Git commit or build timestamp."
    },
    kind: { type: "string", enum: ["release", "rollback", "baseline", "redeploy"] },
    changes: { type: "array", items: { type: "string" }, minItems: 1 }
  }
};
export const releasePublicationOpenApiPaths = {
  "/backoffice/releases": {
    get: {
      tags: ["Backoffice"],
      operationId: "listReleasePublications",
      summary: "List published versions in the current deployment environment",
      security: [{ bearerAuth: [] }],
      "x-permission": "backoffice:dashboard:read",
      description:
        "Requires a current platform identity. Read-only, ordered by publishedAt descending and id descending. Deployment CLI writes immutable publications with an audit event; no public write endpoint.",
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
    }
  }
};
