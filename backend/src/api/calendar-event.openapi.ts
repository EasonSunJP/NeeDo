const error = (description: string) => ({ description });
const eventSchema = {
  type: "object",
  required: ["id", "title", "startsAt", "endsAt", "allDay", "repeatRule", "visibility", "version"],
  properties: {
    id: { type: "integer", minimum: 1 },
    title: { type: "string", minLength: 1, maxLength: 200 },
    startsAt: { type: "string", format: "date-time" },
    endsAt: { type: "string", format: "date-time" },
    allDay: { type: "boolean" },
    reminderMinutes: { type: ["integer", "null"], minimum: 0 },
    repeatRule: { type: "string", enum: ["none", "daily", "weekly", "monthly", "yearly"] },
    location: { type: "string" },
    url: { type: "string" },
    note: { type: "string" },
    visibility: { type: "string", enum: ["private", "participants"] },
    participantIdentityIds: { type: "array", items: { type: "integer", minimum: 1 } },
    imageUrls: { type: "array", items: { type: "string", format: "uri" } },
    version: { type: "integer", minimum: 1 },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};
const response = (data: unknown, description = "Success") => ({
  description,
  content: { "application/json": { schema: { type: "object", properties: { code: { type: "integer", enum: [0] }, message: { type: "string" }, data } } } },
});
const security = [{ bearerAuth: [] }];
const eventBody = {
  type: "object",
  additionalProperties: false,
  required: ["title", "startsAt", "endsAt", "allDay", "reminderMinutes", "repeatRule", "location", "url", "note", "visibility", "participantIdentityIds", "imageUrls"],
  properties: eventSchema.properties,
};

const participantBusyRangeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["participantIdentityId", "startsAt", "endsAt", "status"],
  properties: {
    participantIdentityId: { type: "integer", minimum: 1 },
    startsAt: { type: "string", format: "date-time" },
    endsAt: { type: "string", format: "date-time" },
    status: { type: "string", enum: ["locked"] },
  },
};

export const calendarEventOpenApiPaths = (prefix: string): Record<string, unknown> => ({
  [`${prefix}/calendar-events`]: {
    get: {
      tags: ["Calendar"], summary: "List the active identity's formal calendar events", security,
      "x-permission": "calendar-events:read",
      parameters: [
        ...["from", "to"].map((name) => ({ name, in: "query", required: true, schema: { type: "string", format: "date-time" } })),
        { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
        { name: "page_size", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
      ],
      responses: { 200: response({ type: "object", properties: { list: { type: "array", items: eventSchema }, total: { type: "integer" }, page: { type: "integer" }, page_size: { type: "integer" } } }), 401: error("Authentication required"), 403: error("Identity forbidden") },
    },
    post: {
      tags: ["Calendar"], summary: "Create a formal calendar event", security,
      "x-permission": "calendar-events:write",
      parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 1, maxLength: 191 } }],
      requestBody: { required: true, content: { "application/json": { schema: eventBody } } },
      responses: { 201: response(eventSchema, "Created"), 400: error("Invalid request"), 401: error("Authentication required"), 403: error("Identity forbidden"), 409: error("Idempotency conflict") },
    },
  },
  [`${prefix}/calendar-events/participant-busy`]: {
    get: {
      tags: ["Calendar"],
      summary: "List privacy-safe busy ranges for selected contacts",
      description: "Every requested identity must be an active contact of the current personal identity. The query window is limited to 24 hours. The response contains time-only locked ranges from calendar events and hard-lock bookings, and never exposes private event content or source identifiers.",
      security,
      "x-permission": "calendar-events:read",
      parameters: [
        ...["from", "to"].map((name) => ({ name, in: "query", required: true, schema: { type: "string", format: "date-time" } })),
        { name: "participant_identity_ids", in: "query", required: true, schema: { type: "string", pattern: "^[1-9]\\d*(?:,[1-9]\\d*){0,19}$" } },
        { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
        { name: "page_size", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
      ],
      responses: {
        200: response({
          type: "object",
          required: ["list", "total", "page", "page_size"],
          properties: {
            list: { type: "array", items: participantBusyRangeSchema },
            total: { type: "integer", minimum: 0 },
            page: { type: "integer", minimum: 1 },
            page_size: { type: "integer", minimum: 1 },
          },
        }),
        400: error("Invalid request"),
        401: error("Authentication required"),
        403: error("One or more identities are not active contacts"),
      },
    },
  },
  [`${prefix}/calendar-events/{id}`]: {
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
    patch: {
      tags: ["Calendar"], summary: "Update an owned formal calendar event", security,
      "x-permission": "calendar-events:write",
      requestBody: { required: true, content: { "application/json": { schema: { ...eventBody, required: ["expectedVersion"], properties: { expectedVersion: { type: "integer", minimum: 1 }, ...eventBody.properties } } } } },
      responses: { 200: response(eventSchema), 400: error("Invalid request"), 401: error("Authentication required"), 403: error("Identity forbidden"), 404: error("Event not found"), 409: error("Version conflict") },
    },
    delete: {
      tags: ["Calendar"], summary: "Soft-delete an owned formal calendar event", security,
      "x-permission": "calendar-events:write",
      parameters: [{ name: "expected_version", in: "query", required: true, schema: { type: "integer", minimum: 1 } }],
      responses: { 200: response(eventSchema), 401: error("Authentication required"), 403: error("Identity forbidden"), 404: error("Event not found"), 409: error("Version conflict") },
    },
  },
});
