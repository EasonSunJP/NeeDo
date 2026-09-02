import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";

const metricKeys = [
  "gross_revenue",
  "travel_fare",
  "discount_amount",
  "consumables_sales",
  "dedicated_technician_commission",
  "part_time_technician_commission",
  "marketing_commission",
  "agent_commission",
  "ndp_income",
  "affiliate_platform_income",
  "consumables_profit",
  "new_users",
  "new_paid_members",
  "technician_onboarding",
  "agent_onboarding",
  "franchisee_onboarding",
  "supplier_onboarding"
] as const;

const requiredMetricFields = [
  "metricKey",
  "currentValue",
  "previousValue",
  "comparisonPercent",
  "comparisonDirection",
  "unit",
  "dataStatus",
  "description",
  "formula",
  "detailRoute"
];

type OpenApiSchema = {
  [key: string]: unknown;
  allOf: OpenApiSchema[];
  const: unknown;
  description: string;
  enum: readonly unknown[];
  example: unknown;
  examples: unknown[];
  items: OpenApiSchema | boolean;
  maxItems: number;
  minItems: number;
  oneOf: OpenApiSchema[];
  prefixItems: OpenApiSchema[];
  properties: Record<string, OpenApiSchema>;
  required: string[];
};

type OpenApiParameter = {
  in: string;
  name: string;
  required?: boolean;
  schema: OpenApiSchema;
};

type OpenApiResponse = {
  content: Record<string, { example?: unknown; schema: OpenApiSchema }>;
  description: string;
};

type OpenApiOperation = {
  [key: string]: unknown;
  description: string;
  parameters: OpenApiParameter[];
  responses: Record<string, OpenApiResponse>;
};

type OpenApiShape = {
  components: { schemas: Record<string, OpenApiSchema> };
  paths: Record<string, { get?: OpenApiOperation }>;
};

const document = createOpenApiDocument(env) as unknown as OpenApiShape;
const schemas = document.components.schemas;
const emptyOperation: OpenApiOperation = { description: "", parameters: [], responses: {} };
const overviewOperation = document.paths["/api/v1/backoffice/dashboard/overview"]?.get ?? emptyOperation;
const detailOperation = document.paths["/api/v1/backoffice/dashboard/metrics/{metricKey}"]?.get ?? emptyOperation;

describe("dashboard analytics OpenAPI contract", () => {
  it("publishes only the two formal operations with exact IDs, bearer security and RBAC", () => {
    expect(overviewOperation).toMatchObject({
      operationId: "getBackofficeDashboardOverview",
      security: [{ bearerAuth: [] }],
      "x-required-permission": "backoffice:dashboard:read"
    });
    expect(detailOperation).toMatchObject({
      operationId: "getBackofficeDashboardMetricDetail",
      security: [{ bearerAuth: [] }],
      "x-required-permission": "backoffice:dashboard-detail:read"
    });
    expect(document.paths).not.toHaveProperty("/api/v1/merchant-admin/dashboard/overview");
    expect(document.paths).not.toHaveProperty("/api/v1/merchant-admin/dashboard/metrics/{metricKey}");
  });

  it("documents the strict query and exact ordered 17-key path contract", () => {
    expect(schemas.DashboardAnalyticsMetricKey).toEqual({
      type: "string",
      enum: metricKeys
    });
    expect(schemas.DashboardPeriod).toMatchObject({
      enum: ["today", "last7days", "last30days", "week", "month", "year", "custom"],
      default: "last7days"
    });

    const metricParameter = detailOperation.parameters.find((item) => item.name === "metricKey");
    expect(metricParameter).toEqual({
      name: "metricKey",
      in: "path",
      required: true,
      schema: { $ref: "#/components/schemas/DashboardAnalyticsMetricKey" }
    });

    for (const operation of [overviewOperation, detailOperation]) {
      const queryParameters = operation.parameters.filter((item) => item.in === "query");
      expect(queryParameters.map((item) => item.name)).toEqual(["period", "from", "to", "city"]);
      expect(operation.description).toContain("custom requires both from and to");
      expect(operation.description).toContain("other periods reject from and to");
      expect(operation.description).toContain("from must be on or before to");
      expect(operation.description).toContain("at most 366 inclusive calendar days");
      expect(operation.description).toContain("Unknown query properties are rejected");

      const city = queryParameters.find((item) => item.name === "city")?.schema;
      expect(city).toMatchObject({
        type: "string",
        "x-min-utf16-code-units": 1,
        "x-max-utf16-code-units": 100,
        "x-normalization": "trim"
      });
      expect(city).not.toHaveProperty("minLength");
      expect(city).not.toHaveProperty("maxLength");
    }
  });

  it("defines a strict analytics filter without the legacy city catalog", () => {
    expect(schemas.DashboardAnalyticsFilter).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: [
        "period", "from", "to", "previousFrom", "previousTo", "timeZone", "granularity", "city"
      ],
      properties: {
        period: { $ref: "#/components/schemas/DashboardPeriod" },
        timeZone: { type: "string", const: "Asia/Tokyo" },
        granularity: { type: "string", enum: ["hour", "day", "month"] },
        city: { type: ["string", "null"] }
      }
    });
    for (const field of ["from", "to", "previousFrom", "previousTo"]) {
      expect(schemas.DashboardAnalyticsFilter.properties[field]).toMatchObject({
        type: "string",
        format: "date",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$"
      });
    }
    expect(schemas.DashboardAnalyticsFilter.properties).not.toHaveProperty("availableCities");
    expect(schemas.DashboardAnalyticsFilter.description).toContain("immediately preceding");
    expect(schemas.DashboardAnalyticsFilter.description).toContain("equal inclusive length");
  });

  it("models strict ten-field metric state and detail-route coherence", () => {
    const metric = schemas.AnalyticsMetricPayload;
    expect(metric).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: requiredMetricFields,
      properties: {
        metricKey: { $ref: "#/components/schemas/DashboardAnalyticsMetricKey" },
        unit: { type: "string", enum: ["jpy", "ndp", "people", "count"] }
      }
    });
    expect(metric.required).toHaveLength(10);
    expect(metric.allOf[0].oneOf.map((branch) => branch.properties.dataStatus.const)).toEqual([
      "ready", "not_connected", "not_available"
    ]);
    expect(metric.allOf[0].oneOf[0]).toMatchObject({
      properties: {
        currentValue: {
          type: "integer",
          minimum: Number.MIN_SAFE_INTEGER,
          maximum: Number.MAX_SAFE_INTEGER
        },
        previousValue: {
          type: "integer",
          minimum: Number.MIN_SAFE_INTEGER,
          maximum: Number.MAX_SAFE_INTEGER
        },
        comparisonPercent: { type: "number" },
        comparisonDirection: { type: "string", enum: ["up", "down", "flat"] },
        dataStatus: { type: "string", const: "ready" }
      }
    });
    for (const branch of metric.allOf[0].oneOf.slice(1)) {
      expect(branch.properties).toMatchObject({
        currentValue: { type: "null" },
        previousValue: { type: "null" },
        comparisonPercent: { type: "null" },
        comparisonDirection: { type: "string", const: "unavailable" }
      });
    }
    expect(metric.allOf[1].oneOf).toHaveLength(16);
    for (const [index, metricKey] of metricKeys.slice(0, 15).entries()) {
      expect(metric.allOf[1].oneOf[index].properties).toEqual({
        metricKey: { type: "string", const: metricKey },
        detailRoute: {
          type: "string",
          const: metricKey === "new_paid_members"
            ? "/admin/analytics/members"
            : `/admin/analytics/metrics/${metricKey}`
        }
      });
    }
    expect(metric.allOf[1].oneOf[15].properties).toMatchObject({
      metricKey: { type: "string", enum: metricKeys.slice(15) },
      detailRoute: { type: "null" }
    });
  });

  it("locks overview group lengths and exact metric order", () => {
    const overview = schemas.DashboardAnalyticsOverview;
    expect(overview).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["filter", "operationsFinance", "commissionMetrics", "growthMetrics"],
      properties: { filter: { $ref: "#/components/schemas/DashboardAnalyticsFilter" } }
    });
    const groups = [
      ["operationsFinance", metricKeys.slice(0, 4)],
      ["commissionMetrics", metricKeys.slice(4, 11)],
      ["growthMetrics", metricKeys.slice(11)]
    ] as const;
    for (const [name, expectedKeys] of groups) {
      const group = overview.properties[name];
      expect(group.minItems).toBe(expectedKeys.length);
      expect(group.maxItems).toBe(expectedKeys.length);
      expect(group.items).toBe(false);
      expect(group.prefixItems.map((item) => item.allOf[1].properties.metricKey.const))
        .toEqual(expectedKeys);
    }
  });

  it("locks detail to one series with ordered previous/current points", () => {
    expect(schemas.DashboardAnalyticsMetricDetail).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["filter", "metric", "series"],
      properties: {
        filter: { $ref: "#/components/schemas/DashboardAnalyticsFilter" },
        metric: { $ref: "#/components/schemas/AnalyticsMetricPayload" },
        series: { type: "array", minItems: 1, maxItems: 1, items: false }
      }
    });
    expect(schemas.DashboardAnalyticsMetricDetail.properties.series.prefixItems)
      .toEqual([{ $ref: "#/components/schemas/AnalyticsMetricSeries" }]);
    expect(schemas.AnalyticsMetricSeries).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["seriesKey", "label", "unit", "points"],
      properties: {
        seriesKey: { $ref: "#/components/schemas/DashboardAnalyticsMetricKey" },
        points: { type: "array", minItems: 2, maxItems: 2, items: false }
      }
    });
    expect(schemas.AnalyticsMetricSeries.properties.points.prefixItems
      .map((item) => item.allOf[1].properties.key.const)).toEqual(["previous", "current"]);
    expect(schemas.AnalyticsMetricSeriesPoint).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["key", "label", "value"],
      properties: {
        key: { type: "string", enum: ["previous", "current"] },
        value: {
          oneOf: [
            { type: "integer", minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER },
            { type: "null" }
          ]
        }
      }
    });
  });

  it("references the formal schemas from success envelopes and canonical ApiError envelopes", () => {
    expect(overviewOperation.responses["200"].content["application/json"].schema.properties.data)
      .toEqual({ $ref: "#/components/schemas/DashboardAnalyticsOverview" });
    expect(detailOperation.responses["200"].content["application/json"].schema.properties.data)
      .toEqual({ $ref: "#/components/schemas/DashboardAnalyticsMetricDetail" });

    for (const operation of [overviewOperation, detailOperation]) {
      for (const [status, message] of [
        ["400", "error.validation"],
        ["401", "error.auth.token_invalid"],
        ["403", "error.forbidden"]
      ]) {
        const response = operation.responses[status];
        expect(response.description).toContain(message);
        expect(response.content["application/json"].schema)
          .toEqual({ $ref: "#/components/schemas/ApiError" });
        expect(response.content["application/json"].example).toEqual({
          code: status === "400" ? 40001 : status === "401" ? 40105 : 40301,
          message,
          data: null
        });
      }
    }
    expect(overviewOperation.responses["200"].description).toContain("HTTP 200 data states");
    expect(detailOperation.responses["200"].description).toContain("HTTP 200 data states");
  });

  it("includes the required comparison, availability, route and chronology examples", () => {
    expect(schemas.AnalyticsMetricPayload.examples).toEqual(expect.arrayContaining([
      expect.objectContaining({
        metricKey: "gross_revenue",
        currentValue: 1200,
        previousValue: 0,
        comparisonPercent: 100,
        comparisonDirection: "up",
        dataStatus: "ready"
      }),
      expect.objectContaining({
        metricKey: "discount_amount",
        currentValue: 100,
        previousValue: 100,
        comparisonPercent: 0,
        comparisonDirection: "flat",
        dataStatus: "ready"
      }),
      expect.objectContaining({
        metricKey: "travel_fare",
        currentValue: null,
        dataStatus: "not_connected",
        comparisonDirection: "unavailable"
      }),
      expect.objectContaining({
        metricKey: "supplier_onboarding",
        currentValue: null,
        dataStatus: "not_available",
        detailRoute: null
      })
    ]));

    expect(schemas.DashboardAnalyticsMetricDetail.example).toMatchObject({
      metric: { metricKey: "new_users" },
      series: [{
        seriesKey: "new_users",
        points: [
          { key: "previous", label: "2026-08-19 - 2026-08-25" },
          { key: "current", label: "2026-08-26 - 2026-09-01" }
        ]
      }]
    });
  });
});
