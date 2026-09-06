export const operationsMemberOpenApiPaths = (prefix: string) => ({
  [`${prefix}/users/operations-members`]: {
    post: {
      operationId: "createOperationsMember", tags: ["Users"], summary: "Create an official needo operations account",
      description: "Requires user:create AND user:assign-role in a global platform identity. The server allocates a NEEDO identifier and assigns only operator. Account, identity, role and audit are committed atomically.",
      security: [{ bearerAuth: [] }], "x-required-permissions": ["user:create", "user:assign-role"],
      requestBody: { required: true, content: { "application/json": { schema: {
        type: "object", additionalProperties: false, required: ["username", "email", "password", "reason"], properties: {
          username: { type: "string", minLength: 1, maxLength: 100 }, email: { type: "string", format: "email", maxLength: 255 },
          password: { type: "string", format: "password", writeOnly: true, minLength: 8, maxLength: 128, pattern: "^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])[A-Za-z0-9!@#$%^&*]+$" },
          reason: { type: "string", minLength: 1, maxLength: 500 }
        }
      } } } },
      responses: {
        "201": { description: "Official operations account created", content: { "application/json": { schema: {
          type: "object", required: ["code", "message", "data"], properties: {
            code: { type: "integer", enum: [0] }, message: { type: "string" }, data: {
              type: "object", required: ["needoId", "username", "email", "avatarUrl"], properties: {
                needoId: { type: "string", pattern: "^needo[0-9]{10}$" }, username: { type: "string" }, email: { type: "string", format: "email" }, avatarUrl: { type: ["string", "null"] }
              }
            }
          }
        } } } },
        "400": { description: "Invalid fields" }, "401": { description: "Authentication required" }, "403": { description: "Insufficient permissions or identity scope" }, "404": { description: "Operator role unavailable" }, "409": { description: "Email already used" }, "503": { description: "Identifier allocation busy" }
      }
    }
  }
});
