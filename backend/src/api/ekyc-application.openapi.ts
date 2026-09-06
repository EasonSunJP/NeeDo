const int = { type: "integer", minimum: 1, maximum: 2147483647 };
const status = { type: "string", enum: ["submitted", "approved", "rejected", "withdrawn"] };
const nullableText = { type: "string", nullable: true };
const date = { type: "string", format: "date-time" };
const requiredText = (maxLength: number) => ({ type: "string", minLength: 1, maxLength });
const profileProperties = {
  familyName: requiredText(100),
  givenName: requiredText(100),
  familyNameKana: { ...requiredText(100), description: "Full-width katakana; NFKC normalization" },
  givenNameKana: { ...requiredText(100), description: "Full-width katakana; NFKC normalization" },
  birthYear: {
    type: "string",
    pattern: "^\\d{4}$",
    description: "Valid nonfuture calendar date, at most 120 years ago"
  },
  birthMonth: { type: "string", pattern: "^\\d{1,2}$" },
  birthDay: { type: "string", pattern: "^\\d{1,2}$" },
  sex: { type: "string", enum: ["male", "female"] },
  postalCode: {
    type: "string",
    maxLength: 20,
    description: "Seven digits after NFKC and space/hyphen removal"
  },
  city: requiredText(200),
  street: requiredText(500),
  building: { type: "string", maxLength: 200 },
  occupation: {
    type: "string",
    enum: [
      "employee",
      "executive",
      "civil_servant",
      "self_employed",
      "part_time",
      "contract",
      "homemaker",
      "student",
      "retired",
      "other"
    ]
  },
  otherOccupation: {
    type: "string",
    maxLength: 200,
    description: "Required nonblank for other occupation; normalized to empty otherwise"
  }
};
const profile = {
  type: "object",
  additionalProperties: false,
  required: Object.keys(profileProperties),
  properties: profileProperties
};
const summaryProperties = {
  id: int,
  userId: int,
  status,
  version: int,
  createdAt: date,
  updatedAt: date,
  reviewedAt: { ...date, nullable: true },
  reviewNote: nullableText,
  rejectionReason: nullableText
};
const summary = {
  type: "object",
  required: Object.keys(summaryProperties),
  properties: summaryProperties
};
const detail = {
  type: "object",
  required: [...Object.keys(summaryProperties), "profile"],
  properties: { ...summaryProperties, profile }
};
const envelope = (data: unknown) => ({
  type: "object",
  required: ["code", "message", "data"],
  properties: { code: { type: "integer" }, message: { type: "string" }, data }
});
const body = (properties: Record<string, unknown>) => ({
  required: true,
  content: {
    "application/json": {
      schema: {
        type: "object",
        additionalProperties: false,
        required: Object.keys(properties),
        properties
      }
    }
  }
});
const id = { name: "id", in: "path", required: true, schema: int };
const pagination = [
  {
    name: "page",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 100000, default: 1 }
  },
  {
    name: "page_size",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 100, default: 20 }
  },
  { name: "status", in: "query", schema: status }
];
const page = {
  type: "object",
  required: ["list", "total", "page", "page_size"],
  properties: {
    list: { type: "array", items: summary },
    total: { type: "integer" },
    page: int,
    page_size: int
  }
};
const operation = (
  permission: string,
  data: unknown,
  parameters: unknown[] = [],
  requestBody?: unknown,
  created = false
) => ({
  tags: ["Manual eKYC"],
  security: [{ bearerAuth: [] }],
  description: `Requires ${permission}. Owner endpoints isolate the authenticated user. Only explicit operator approval after external identity evidence checks creates a verified record; self-review is prohibited. Terminal snapshots are immutable.`,
  parameters,
  ...(requestBody ? { requestBody } : {}),
  responses: {
    [created ? "201" : "200"]: {
      description: "Success",
      content: { "application/json": { schema: envelope(data) } }
    },
    400: { description: "Invalid fields or missing explicit identity confirmation" },
    401: { description: "Authentication required" },
    403: { description: "Missing permission or self-review" },
    404: { description: "Application not found or not owned" },
    409: { description: "Version/state conflict, active application, or already verified" }
  }
});
export const ekycApplicationOpenApiPaths = (prefix: string): Record<string, unknown> => ({
  [`${prefix}/ekyc-applications/mine`]: {
    get: operation("ekyc-application:own", page, pagination)
  },
  [`${prefix}/ekyc-applications/{id}`]: { get: operation("ekyc-application:own", detail, [id]) },
  [`${prefix}/ekyc-applications`]: {
    post: operation("ekyc-application:own", detail, [], body({ profile }), true)
  },
  [`${prefix}/ekyc-applications/{id}/withdraw`]: {
    post: operation("ekyc-application:own", detail, [id], body({ expectedVersion: int }))
  },
  [`${prefix}/ops/ekyc-applications`]: {
    get: operation("ops:ekyc-application:read", page, pagination)
  },
  [`${prefix}/ops/ekyc-applications/{id}`]: {
    get: operation("ops:ekyc-application:read", detail, [id])
  },
  [`${prefix}/ops/ekyc-applications/{id}/approve`]: {
    post: operation(
      "ops:ekyc-application:review",
      detail,
      [id],
      body({
        expectedVersion: int,
        reviewNote: requiredText(1000),
        identityConfirmed: { type: "boolean", enum: [true] }
      })
    )
  },
  [`${prefix}/ops/ekyc-applications/{id}/reject`]: {
    post: operation(
      "ops:ekyc-application:review",
      detail,
      [id],
      body({ expectedVersion: int, rejectionReason: requiredText(1000) })
    )
  }
});
