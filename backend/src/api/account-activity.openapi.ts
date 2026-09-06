const idParameter = { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } };
const logParameters = [
  { name: "audit_page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
  { name: "audit_page_size", in: "query", schema: { type: "integer", enum: [10, 50], default: 10 } },
  { name: "audit_from", in: "query", description: "Inclusive UTC start; requires audit_to", schema: { type: "string", format: "date-time" } },
  { name: "audit_to", in: "query", description: "Exclusive UTC end after audit_from", schema: { type: "string", format: "date-time" } }
];
const envelope = (data: unknown) => ({ type: "object", required: ["code", "message", "data"], properties: { code: { type: "integer", enum: [0] }, message: { type: "string" }, data } });
const responses = (data: unknown) => ({
  "200": { description: "Scoped account activity", content: { "application/json": { schema: envelope(data) } } },
  "400": { description: "Invalid range or pagination" }, "401": { description: "Authentication required" },
  "403": { description: "Required backoffice permission missing or invalid identity scope" }, "404": { description: "Account outside the permitted scope or absent" }
});
export function accountActivityOpenApiPaths(prefix: string): Record<string, unknown> {
  const paths: Record<string, unknown> = {};
  for (const merchant of [false, true]) {
    const portal = merchant ? "merchant-admin" : "backoffice";
    const technicianPermission = `${portal}:technicians:list`;
    paths[`${prefix}/${portal}/technicians/{id}/user-log`] = { get: {
      operationId: `${merchant ? "merchant" : "backoffice"}TechnicianUserLog`, tags: ["Backoffice"], summary: "Read technician account LOG",
      description: "Resolves the technician profile and linked user; merchants require the profile to belong to their current shop and receive only shop-scoped audit records. The persisted User.createdAt is projected as the first event when within the date interval; it is included in total and pagination. Other events are newest first.",
      security: [{ bearerAuth: [] }], "x-required-permission": technicianPermission,
      parameters: [idParameter, ...logParameters], responses: responses({ type: "object", required: ["id", "displayName", "avatarUrl", "createdAt", "audit"], properties: {
        id: { type: "integer" }, displayName: { type: "string" }, avatarUrl: { type: ["string", "null"] }, createdAt: { type: "string", format: "date-time" }, audit: { $ref: "#/components/schemas/BackofficeAuditTimelinePage" }
      } })
    } };
    for (const subject of ["users", "technicians"]) {
      paths[`${prefix}/${portal}/${subject}/{id}/posts`] = { get: {
        operationId: `${merchant ? "merchant" : "backoffice"}${subject}Posts`, tags: ["Backoffice"], summary: "Read account's visible published posts",
        description: "Requires the corresponding directory read permission. Target author is resolved server-side; merchant users require customer bookings in the current shop, merchant technicians require shop membership. Reuses formal Social public/own/followed visibility. No posting or social interaction rights are granted. Only page and pageSize query parameters are accepted.",
        security: [{ bearerAuth: [] }], "x-required-permission": subject === "technicians" ? technicianPermission : merchant ? "merchant-admin:customers:list" : "backoffice:users:read",
        parameters: [idParameter, { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } }, { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 10 } }],
        responses: responses({ type: "object", required: ["list", "total", "page", "page_size"], properties: { list: { type: "array", items: { $ref: "#/components/schemas/SocialPost" } }, total: { type: "integer" }, page: { type: "integer" }, page_size: { type: "integer" } } })
      } };
    }
  }
  return paths;
}
