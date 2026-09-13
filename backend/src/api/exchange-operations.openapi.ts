const jsonDataResponse = (description: string, dataSchema: Record<string, unknown>) => ({
  description,
  content: {
    "application/json": {
      schema: {
        type: "object",
        required: ["code", "message", "data"],
        properties: {
          code: { type: "integer", enum: [0] },
          message: { type: "string", enum: ["success"] },
          data: dataSchema
        }
      }
    }
  }
});

const errorResponse = (description: string) => ({ description });
const dateTime = { type: "string", format: "date-time" };
const nullableDateTime = { oneOf: [dateTime, { type: "null" }] };
const nullableInteger = { oneOf: [{ type: "integer" }, { type: "null" }] };
const nullableString = { oneOf: [{ type: "string" }, { type: "null" }] };
const postStatuses = ["published", "matched", "expired", "withdrawn", "closed"];

export const exchangeOperationsOpenApiSchemas = {
  ExchangeOperationsPublisher: {
    type: "object",
    additionalProperties: false,
    required: ["publicIdMasked", "displayNameMasked", "identityType"],
    properties: {
      publicIdMasked: { type: "string" },
      displayNameMasked: { type: "string" },
      identityType: { type: "string" }
    }
  },
  ExchangeOperationsFinancial: {
    type: "object",
    additionalProperties: false,
    required: [
      "state",
      "amountNdp",
      "currency",
      "heldAmountNdp",
      "capturedAmountNdp",
      "releasedAmountNdp",
      "ruleSetVersion",
      "createdAt",
      "capturedAt",
      "releasedAt"
    ],
    properties: {
      state: { type: "string", enum: ["held", "captured", "released"] },
      amountNdp: { type: "integer", minimum: 0 },
      currency: { type: "string", enum: ["NDP", "TEST_NDP"] },
      heldAmountNdp: { type: "integer", minimum: 0 },
      capturedAmountNdp: { type: "integer", minimum: 0 },
      releasedAmountNdp: { type: "integer", minimum: 0 },
      ruleSetVersion: { type: "integer", minimum: 1 },
      createdAt: dateTime,
      capturedAt: nullableDateTime,
      releasedAt: nullableDateTime
    }
  },
  ExchangeOperationsPost: {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "type",
      "status",
      "title",
      "publisher",
      "serviceMode",
      "areaLabel",
      "serviceStartAt",
      "serviceEndAt",
      "expiresAt",
      "publishedAt",
      "budgetMinJpy",
      "budgetMaxJpy",
      "matchMode",
      "claimCount",
      "activeClaimCount",
      "matchedCount",
      "financial"
    ],
    properties: {
      id: { type: "integer", minimum: 1 },
      type: { type: "string", enum: ["demand", "intelligence"] },
      status: { type: "string", enum: postStatuses },
      title: { type: "string" },
      publisher: { $ref: "#/components/schemas/ExchangeOperationsPublisher" },
      serviceMode: { type: "string", enum: ["home", "store", "onsite", "flexible"] },
      areaLabel: { type: "string" },
      serviceStartAt: dateTime,
      serviceEndAt: dateTime,
      expiresAt: dateTime,
      publishedAt: dateTime,
      budgetMinJpy: nullableInteger,
      budgetMaxJpy: nullableInteger,
      matchMode: { oneOf: [{ type: "string", enum: ["quick", "selective"] }, { type: "null" }] },
      claimCount: { type: "integer", minimum: 0 },
      activeClaimCount: { type: "integer", minimum: 0 },
      matchedCount: { type: "integer", minimum: 0 },
      financial: {
        oneOf: [
          { $ref: "#/components/schemas/ExchangeOperationsFinancial" },
          { type: "null" }
        ]
      }
    }
  },
  ExchangeOperationsPage: {
    type: "object",
    additionalProperties: false,
    required: ["list", "total", "page", "page_size"],
    properties: {
      list: { type: "array", items: { $ref: "#/components/schemas/ExchangeOperationsPost" } },
      total: { type: "integer", minimum: 0 },
      page: { type: "integer", minimum: 1 },
      page_size: { type: "integer", minimum: 1, maximum: 100 }
    }
  },
  ExchangeOperationsDemand: {
    type: "object",
    additionalProperties: false,
    required: ["targetProviderCount", "targetProviderLimitSnapshot", "publisherCapacitySource", "membershipLevelSnapshot", "matchMode", "budgetMode", "budgetMinJpy", "budgetMaxJpy", "serviceMode", "addressLine1"],
    properties: {
      targetProviderCount: { type: "integer", minimum: 1 },
      targetProviderLimitSnapshot: { type: "integer", minimum: 1 },
      publisherCapacitySource: { type: "string", enum: ["customer_membership", "shop_merchant"] },
      membershipLevelSnapshot: nullableString,
      matchMode: { type: "string", enum: ["quick", "selective"] },
      budgetMode: { type: "string", enum: ["total", "per_provider"] },
      budgetMinJpy: nullableInteger,
      budgetMaxJpy: { type: "integer", minimum: 0 },
      serviceMode: { type: "string", enum: ["home", "store"] },
      addressLine1: { type: "string" }
    }
  },
  ExchangeOperationsIntelligence: {
    type: "object",
    additionalProperties: false,
    required: ["serviceMode", "addressLabel", "serviceAreas", "originalPriceJpy", "campaignPriceJpy", "serviceName", "serviceDurationMinutes"],
    properties: {
      serviceMode: { type: "string", enum: ["store", "onsite", "flexible"] },
      addressLabel: nullableString,
      serviceAreas: { type: "array", items: { type: "string" } },
      originalPriceJpy: nullableInteger,
      campaignPriceJpy: { type: "integer", minimum: 0 },
      serviceName: nullableString,
      serviceDurationMinutes: nullableInteger
    }
  },
  ExchangeOperationsClaim: {
    type: "object",
    additionalProperties: false,
    required: ["id", "status", "providerPublicIdMasked", "providerDisplayNameMasked", "shopName", "technicianDisplayNameMasked", "serviceName", "durationMinutes", "quoteAmountJpy", "currency", "message", "startsAt", "endsAt", "createdAt", "withdrawnAt", "terminalAt"],
    properties: {
      id: { type: "integer", minimum: 1 },
      status: { type: "string", enum: ["active", "withdrawn", "request_withdrawn", "request_expired", "matched", "not_selected", "matching_closed"] },
      providerPublicIdMasked: { type: "string" },
      providerDisplayNameMasked: { type: "string" },
      shopName: { type: "string" },
      technicianDisplayNameMasked: { type: "string" },
      serviceName: { type: "string" },
      durationMinutes: { type: "integer", minimum: 1 },
      quoteAmountJpy: { type: "integer", minimum: 0 },
      currency: { type: "string", enum: ["JPY"] },
      message: nullableString,
      startsAt: dateTime,
      endsAt: dateTime,
      createdAt: dateTime,
      withdrawnAt: nullableDateTime,
      terminalAt: nullableDateTime
    }
  },
  ExchangeOperationsMatchParticipant: {
    type: "object",
    additionalProperties: false,
    required: ["exchangeClaimId", "providerPublicIdMasked", "providerDisplayNameMasked", "shopName", "technicianDisplayNameMasked", "serviceName", "durationMinutes", "quoteAmountJpy", "currency", "startsAt", "endsAt", "matchedAt", "bookingOrderNo", "bookingStatus"],
    properties: {
      exchangeClaimId: { type: "integer", minimum: 1 },
      providerPublicIdMasked: { type: "string" },
      providerDisplayNameMasked: { type: "string" },
      shopName: { type: "string" },
      technicianDisplayNameMasked: { type: "string" },
      serviceName: { type: "string" },
      durationMinutes: { type: "integer", minimum: 1 },
      quoteAmountJpy: { type: "integer", minimum: 0 },
      currency: { type: "string", enum: ["JPY"] },
      startsAt: dateTime,
      endsAt: dateTime,
      matchedAt: dateTime,
      bookingOrderNo: nullableString,
      bookingStatus: nullableString
    }
  },
  ExchangeOperationsMatching: {
    type: "object",
    additionalProperties: false,
    required: ["status", "version", "effectiveTargetProviderCount", "effectiveBudgetMaxJpy", "selectedQuoteTotalJpy", "matchedAt", "participants"],
    properties: {
      status: { type: "string", enum: ["open", "matched", "closed"] },
      version: { type: "integer", minimum: 1 },
      effectiveTargetProviderCount: { type: "integer", minimum: 1 },
      effectiveBudgetMaxJpy: { type: "integer", minimum: 0 },
      selectedQuoteTotalJpy: { type: "integer", minimum: 0 },
      matchedAt: nullableDateTime,
      participants: { type: "array", items: { $ref: "#/components/schemas/ExchangeOperationsMatchParticipant" } }
    }
  },
  ExchangeOperationsTimelineEvent: {
    type: "object",
    additionalProperties: false,
    required: ["id", "source", "event", "status", "actorDisplayNameMasked", "amount", "currency", "createdAt"],
    properties: {
      id: { type: "string" },
      source: { type: "string", enum: ["post", "claim", "matching", "financial", "audit"] },
      event: { type: "string" },
      status: nullableString,
      actorDisplayNameMasked: nullableString,
      amount: nullableInteger,
      currency: { oneOf: [{ type: "string", enum: ["NDP", "TEST_NDP"] }, { type: "null" }] },
      createdAt: dateTime
    }
  },
  ExchangeOperationsDetail: {
    allOf: [
      { $ref: "#/components/schemas/ExchangeOperationsPost" },
      {
        type: "object",
        required: ["detail", "contentLocale", "demand", "intelligence", "claims", "matching", "timeline"],
        properties: {
          detail: { type: "string" },
          contentLocale: { type: "string" },
          demand: { oneOf: [{ $ref: "#/components/schemas/ExchangeOperationsDemand" }, { type: "null" }] },
          intelligence: { oneOf: [{ $ref: "#/components/schemas/ExchangeOperationsIntelligence" }, { type: "null" }] },
          claims: { type: "array", items: { $ref: "#/components/schemas/ExchangeOperationsClaim" } },
          matching: { oneOf: [{ $ref: "#/components/schemas/ExchangeOperationsMatching" }, { type: "null" }] },
          timeline: { type: "array", items: { $ref: "#/components/schemas/ExchangeOperationsTimelineEvent" } }
        }
      }
    ]
  }
} as const;

export const exchangeOperationsOpenApiPaths = (apiPrefix: string): Record<string, unknown> => ({
  [`${apiPrefix}/backoffice/exchange/posts`]: {
    get: {
      operationId: "listExchangeOperationsPosts",
      tags: ["Exchange Operations"],
      summary: "List persisted Exchange posts for operations verification",
      description:
        "Read-only operations projection. Publisher/provider identifiers and names are masked; email, phone and private address lines are never returned.",
      security: [{ bearerAuth: [] }],
      "x-required-permission": "backoffice:exchange:read",
      parameters: [
        { name: "type", in: "query", schema: { type: "string", enum: ["demand", "intelligence"] } },
        { name: "status", in: "query", schema: { type: "string", enum: postStatuses } },
        { name: "match_mode", in: "query", schema: { type: "string", enum: ["quick", "selective"] } },
        { name: "publisher_identity_type", in: "query", schema: { type: "string", maxLength: 50 } },
        { name: "keyword", in: "query", schema: { type: "string", maxLength: 120 } },
        { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
        { name: "page_size", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } }
      ],
      responses: {
        "200": jsonDataResponse("Paginated Exchange operations posts", {
          $ref: "#/components/schemas/ExchangeOperationsPage"
        }),
        "400": errorResponse("error.validation"),
        "401": errorResponse("error.auth.unauthorized"),
        "403": errorResponse("error.forbidden")
      }
    }
  },
  [`${apiPrefix}/backoffice/exchange/posts/{id}`]: {
    get: {
      operationId: "getExchangeOperationsPost",
      tags: ["Exchange Operations"],
      summary: "Read one persisted Exchange verification detail",
      security: [{ bearerAuth: [] }],
      "x-required-permission": "backoffice:exchange:read",
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
      ],
      responses: {
        "200": jsonDataResponse("Exchange operations detail", {
          $ref: "#/components/schemas/ExchangeOperationsDetail"
        }),
        "400": errorResponse("error.validation"),
        "401": errorResponse("error.auth.unauthorized"),
        "403": errorResponse("error.forbidden"),
        "404": errorResponse("error.exchange.post_not_found")
      }
    }
  }
});
