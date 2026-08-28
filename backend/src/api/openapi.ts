import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import type { AppConfig } from "../config/env";

type OpenApiDocument = Record<string, unknown>;

const payrollCsvResponse = (description: string) => ({
  description,
  headers: {
    "Content-Disposition": {
      description: "CSV attachment filename",
      schema: { type: "string", example: 'attachment; filename="merchant-pay-runs-2026-06-04.csv"' }
    }
  },
  content: {
    "text/csv": {
      schema: { type: "string" }
    }
  }
});

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

const authJsonBody = (properties: Record<string, unknown>, required: string[] = []) => ({
  required: true,
  content: {
    "application/json": {
      schema: {
        type: "object",
        additionalProperties: false,
        required,
        properties
      }
    }
  }
});

const authActionErrorResponses = {
  "400": { description: "error.validation — strict request validation failed" },
  "401": {
    description:
      "error.auth.token_invalid, error.auth.verification_code_invalid, or another authentication failure"
  },
  "403": {
    description:
      "error.forbidden, error.auth.account_disabled, or error.auth.account_restricted — permission or account-state denial"
  },
  "409": { description: "error.auth.google_conflict — login-method state conflicts" },
  "429": {
    description:
      "error.rate_limited, error.auth.otp_cooldown, or error.auth.verification_attempts_exhausted"
  },
  "502": { description: "error.auth.otp_delivery_failed — verification email delivery failed" },
  "503": {
    description: "error.dependency.redis_unavailable or error.dependency.google_auth_unavailable"
  }
};

const idPathParameter = (name = "id") => ({
  name,
  in: "path",
  required: true,
  schema: { type: "integer", minimum: 1 }
});

const identityWorkflowOperation = (summary: string, extras: Record<string, unknown> = {}) => ({
  tags: ["Identity Applications"],
  summary,
  security: [{ bearerAuth: [] }],
  ...extras,
  responses: {
    "200": { description: "Success" },
    "400": { description: "Invalid request" },
    "401": { description: "Missing or invalid access token" },
    "403": { description: "Missing permission or scope" },
    "404": { description: "Application or evidence not found" },
    "409": { description: "State or optimistic-lock conflict" }
  }
});

const identityJsonBody = (properties: Record<string, unknown>, required: string[] = []) => ({
  required: true,
  content: {
    "application/json": {
      schema: { type: "object", additionalProperties: false, required, properties }
    }
  }
});

const applicationVersionBody = identityJsonBody(
  { expectedVersion: { type: "integer", minimum: 1 } },
  ["expectedVersion"]
);

const affiliateTaskStatuses = [
  "draft",
  "pending_review",
  "scheduled",
  "active",
  "paused",
  "budget_exhausted",
  "ended",
  "cancelled",
  "rejected"
];

const affiliateEditableTaskProperties = {
  name: { type: "string", minLength: 1, maxLength: 160 },
  description: { type: ["string", "null"], maxLength: 10000 },
  coverMediaAssetId: { type: ["integer", "null"], minimum: 1 },
  rewardNdpPerCompletedOrder: { type: "integer", minimum: 1, maximum: 100000000 },
  totalBudgetNdp: { type: "integer", minimum: 1, maximum: 2000000000 },
  customerDiscountType: {
    type: "string",
    enum: ["none", "fixed_jpy", "percent"]
  },
  fixedDiscountJpy: { type: "integer", minimum: 0, maximum: 100000000 },
  discountRateBps: { type: "integer", minimum: 0, maximum: 10000 },
  discountCapJpy: { type: "integer", minimum: 0, maximum: 100000000 },
  minimumOrderAmountJpy: { type: "integer", minimum: 0, maximum: 100000000 },
  claimStartsAt: { type: "string", format: "date-time" },
  claimEndsAt: { type: "string", format: "date-time" },
  taskStartsAt: { type: "string", format: "date-time" },
  taskEndsAt: { type: "string", format: "date-time" },
  attributionWindowDays: { type: "integer", minimum: 1, maximum: 365 },
  maxCompletedOrdersPerClaim: {
    type: ["integer", "null"],
    minimum: 1,
    maximum: 1000000
  },
  maxCompletedOrdersPerCustomer: {
    type: ["integer", "null"],
    minimum: 1,
    maximum: 1000000
  },
  serviceScopeMode: {
    type: "string",
    enum: ["all_current_services", "selected_services"]
  },
  selectedServiceIds: {
    type: "array",
    maxItems: 10000,
    uniqueItems: true,
    items: { type: "integer", minimum: 1 }
  }
};

const affiliateEditableTaskRequired = Object.keys(affiliateEditableTaskProperties);

const affiliateTaskListParameters = [
  { name: "status", in: "query", schema: { type: "string", enum: affiliateTaskStatuses } },
  {
    name: "publisherType",
    in: "query",
    schema: { type: "string", enum: ["merchant_account", "shop"] }
  },
  { name: "keyword", in: "query", schema: { type: "string", maxLength: 160 } },
  { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
  {
    name: "pageSize",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 100 }
  }
];

const affiliateTaskErrorResponses = {
  "400": { description: "Invalid affiliate task contract" },
  "401": { description: "Missing or invalid access token" },
  "403": { description: "Missing permission or publisher scope" },
  "404": { description: "Affiliate task not found in caller scope" },
  "409": { description: "Task state, optimistic lock, or NDP balance conflict" }
};

const affiliateMarketplaceListParameters = [
  { name: "keyword", in: "query", schema: { type: "string", minLength: 1, maxLength: 160 } },
  { name: "shopId", in: "query", schema: { type: "integer", minimum: 1 } },
  { name: "serviceId", in: "query", schema: { type: "integer", minimum: 1 } },
  {
    name: "customerDiscountType",
    in: "query",
    schema: { type: "string", enum: ["none", "fixed_jpy", "percent"] }
  },
  { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
  {
    name: "pageSize",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 100 }
  }
];

const affiliateMarketplaceErrorResponses = {
  "400": { description: "Invalid affiliate marketplace contract" },
  "401": { description: "Missing or invalid access token" },
  "403": { description: "Missing affiliate marketplace permission" },
  "404": { description: "Affiliate task, claim, or signed link not found" },
  "409": { description: "Task eligibility or claim uniqueness conflict" }
};

const affiliateProfileErrorResponses = {
  "400": { description: "Invalid affiliate profile or channel contract" },
  "401": { description: "Missing or invalid access token" },
  "403": { description: "Missing affiliate profile permission or active affiliate identity" },
  "404": { description: "Affiliate profile or owned channel not found" },
  "409": { description: "Profile version, channel limit, or channel uniqueness conflict" }
};

const customerProfileErrorResponses = {
  "400": { description: "Invalid customer self-profile update payload" },
  "401": { description: "Missing or invalid access token" },
  "403": { description: "Missing customer-profile permission or customer identity scope" },
  "404": { description: "Customer profile not found in authenticated scope" },
  "500": { description: "Unexpected customer profile persistence error" }
};

const merchantEmployeeNeedoIdParameter = {
  name: "needoId",
  in: "path",
  required: true,
  description: "Canonical technician identity NeeDoID",
  schema: { type: "string", pattern: "^s[0-9]{10}$" }
};

const merchantEmployeeErrorResponses = {
  "400": { description: "error.validation — strict employee request validation failed" },
  "401": { description: "error.auth.token_invalid — missing or invalid access token" },
  "403": {
    description:
      "error.identity.forbidden — missing employee-affiliation permission or shop identity scope"
  },
  "404": {
    description:
      "error.technician_affiliation.not_found — employee is absent from the authenticated shop"
  },
  "409": {
    description:
      "error.technician_affiliation.exclusive_conflict — exclusive and multi-shop relationships conflict"
  }
};

const merchantPreviewShopHeaderParameter = {
  name: "X-NeeDo-Merchant-Preview-Shop-Id",
  in: "header",
  required: false,
  description:
    "Operations-admin read-only preview shop scope. Requires backoffice merchant read access; any non-GET request carrying this header is rejected.",
  schema: { type: "integer", minimum: 1 }
};

const billingProfileRequestBody = {
  required: true,
  content: {
    "application/json": {
      schema: {
        type: "object",
        required: ["billingCadence", "monthlyFeeJpy", "cadenceLocked", "amountLocked", "version"],
        properties: {
          billingCadence: { type: "string", enum: ["monthly", "annual", "free"] },
          monthlyFeeJpy: { type: "integer", minimum: 0, maximum: 10000000 },
          cadenceLocked: { type: "boolean" },
          amountLocked: { type: "boolean" },
          paymentProvider: { type: "string", enum: ["manual", "stripe"] },
          version: { type: "integer", minimum: 1 }
        }
      }
    }
  }
};

export const createOpenApiDocument = (config: AppConfig): OpenApiDocument => ({
  openapi: "3.1.0",
  info: {
    title: "NeeDo Backend API",
    version: "0.1.0"
  },
  servers: [
    {
      url: config.API_PREFIX
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    },
    schemas: {
      SaasFreeDuration: {
        type: ["object", "null"],
        required: ["years", "months", "days", "totalDays"],
        properties: {
          years: { type: "integer", minimum: 0 },
          months: { type: "integer", minimum: 0, maximum: 11 },
          days: { type: "integer", minimum: 0 },
          totalDays: { type: "integer", minimum: 0 }
        }
      },
      SaasBillingCard: {
        type: "object",
        required: [
          "subjectType",
          "subjectId",
          "cadence",
          "monthlyFeeJpy",
          "annualFeeJpy",
          "cadenceLocked",
          "amountLocked",
          "state",
          "trialStatus",
          "paymentProvider",
          "extensionCount",
          "version"
        ],
        properties: {
          subjectType: { type: "string", enum: ["merchant_account", "shop"] },
          subjectId: { type: "integer", minimum: 1 },
          cadence: { type: "string", enum: ["monthly", "annual", "free"] },
          monthlyFeeJpy: { type: "integer", minimum: 0 },
          annualFeeJpy: { type: "integer", minimum: 0 },
          cadenceLocked: { type: "boolean" },
          amountLocked: { type: "boolean" },
          state: { type: "string", enum: ["trial", "paid", "free", "overdue"] },
          trialStatus: {
            type: "string",
            enum: ["not_started", "active", "completed", "interrupted", "not_applicable"]
          },
          trialStartedAt: { type: ["string", "null"], format: "date-time" },
          trialEndsAt: { type: ["string", "null"], format: "date-time" },
          paidThrough: { type: ["string", "null"], format: "date-time" },
          paymentProvider: { type: "string", enum: ["manual", "stripe"] },
          freeDuration: { $ref: "#/components/schemas/SaasFreeDuration" },
          extensionCount: { type: "integer", minimum: 0, maximum: 3 },
          version: { type: "integer", minimum: 0 }
        }
      },
      ShopBillingCard: {
        type: "object",
        required: [
          "id",
          "type",
          "name",
          "city",
          "address",
          "status",
          "technicianCount",
          "billing",
          "createdAt"
        ],
        properties: {
          id: { type: "integer" },
          type: { type: "string", enum: ["single_shop", "shop"] },
          name: { type: "string" },
          city: { type: "string" },
          address: { type: "string" },
          phone: { type: ["string", "null"] },
          status: { type: "string" },
          ownerEmail: { type: ["string", "null"], format: "email" },
          coverUrl: { type: ["string", "null"] },
          ratingAverage: { type: "number" },
          reviewCount: { type: "integer" },
          technicianCount: { type: "integer", minimum: 0 },
          billing: { $ref: "#/components/schemas/SaasBillingCard" },
          suspension: { type: ["object", "null"] },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      MerchantAccountCard: {
        type: "object",
        required: [
          "id",
          "type",
          "code",
          "name",
          "status",
          "paymentResponsibility",
          "billing",
          "consolidatedMonthlyTotalJpy",
          "shops",
          "createdAt"
        ],
        properties: {
          id: { type: "integer" },
          type: { type: "string", enum: ["merchant_group"] },
          code: { type: "string" },
          name: { type: "string" },
          status: { type: "string" },
          paymentResponsibility: {
            type: "string",
            enum: ["group_consolidated", "shops_individual"]
          },
          billing: { $ref: "#/components/schemas/SaasBillingCard" },
          suspension: { type: ["object", "null"] },
          consolidatedMonthlyTotalJpy: { type: "integer", minimum: 0 },
          shops: { type: "array", items: { $ref: "#/components/schemas/ShopBillingCard" } },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      SaasInvoice: {
        type: "object",
        required: [
          "id",
          "invoiceNo",
          "payerType",
          "payerId",
          "billingCadence",
          "periodStartsAt",
          "periodEndsAt",
          "dueAt",
          "amountJpy",
          "status",
          "paymentProvider",
          "lines",
          "payments"
        ],
        properties: {
          id: { type: "integer" },
          invoiceNo: { type: "string" },
          payerType: { type: "string", enum: ["merchant_account", "shop"] },
          payerId: { type: "integer" },
          billingCadence: { type: "string", enum: ["monthly", "annual", "free"] },
          periodStartsAt: { type: "string", format: "date-time" },
          periodEndsAt: { type: "string", format: "date-time" },
          dueAt: { type: "string", format: "date-time" },
          amountJpy: { type: "integer", minimum: 0 },
          status: { type: "string" },
          paymentProvider: { type: "string", enum: ["manual", "stripe"] },
          lines: { type: "array", items: { type: "object" } },
          payments: { type: "array", items: { type: "object" } }
        }
      },
      EntitySuspensionResult: {
        type: "object",
        required: [
          "id",
          "subjectType",
          "subjectId",
          "scope",
          "reasonCodes",
          "note",
          "startsAt",
          "affectedShopIds",
          "detachedShopIds",
          "promotedAdminUserIds"
        ],
        properties: {
          id: { type: "integer" },
          subjectType: { type: "string", enum: ["merchant_account", "shop"] },
          subjectId: { type: "integer" },
          scope: {
            type: "string",
            enum: ["subject_only", "merchant_and_shops", "merchant_detach_shops"]
          },
          reasonCodes: { type: "array", items: { type: "string" } },
          note: { type: "string" },
          startsAt: { type: "string", format: "date-time" },
          affectedShopIds: { type: "array", items: { type: "integer" } },
          detachedShopIds: { type: "array", items: { type: "integer" } },
          promotedAdminUserIds: { type: "array", items: { type: "integer" } }
        }
      },
      ApiError: {
        type: "object",
        required: ["code", "message", "data"],
        properties: {
          code: { type: "integer" },
          message: { type: "string" },
          data: { type: "null" }
        }
      },
      RealtimeParticipant: {
        type: "object",
        required: ["userId", "needoId", "username", "avatarUrl"],
        properties: {
          userId: { type: "integer" },
          needoId: {
            type: "string",
            pattern: "^(?:u|s|b|o|needo)[0-9]{10}$"
          },
          username: { type: "string" },
          avatarUrl: { type: ["string", "null"] }
        }
      },
      RealtimeMessage: {
        type: "object",
        required: [
          "id",
          "conversationId",
          "senderUserId",
          "type",
          "content",
          "metadata",
          "reactions",
          "recallDeadlineAt",
          "recalledAt",
          "recallMode",
          "contentPurgedAt",
          "lifecycleVersion",
          "availableRecallModes",
          "createdAt"
        ],
        properties: {
          id: { type: "integer" },
          conversationId: { type: "integer" },
          senderUserId: { type: ["integer", "null"] },
          type: { type: "string", enum: ["text", "system", "orderStatus"] },
          content: { type: ["string", "null"] },
          metadata: {},
          reactions: {
            type: "array",
            items: { $ref: "#/components/schemas/RealtimeMessageReaction" }
          },
          recallDeadlineAt: { type: ["string", "null"], format: "date-time" },
          recalledAt: { type: ["string", "null"], format: "date-time" },
          recallMode: {
            type: ["string", "null"],
            enum: ["standard", "traceless", null]
          },
          contentPurgedAt: { type: ["string", "null"], format: "date-time" },
          lifecycleVersion: { type: "integer", minimum: 0 },
          availableRecallModes: {
            type: "array",
            items: { type: "string", enum: ["standard"] }
          },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      RealtimeMessageReaction: {
        type: "object",
        required: ["emoji", "people", "reactedByMe"],
        properties: {
          emoji: { type: "string", minLength: 1, maxLength: 32 },
          people: {
            type: "array",
            items: { $ref: "#/components/schemas/RealtimeParticipant" }
          },
          reactedByMe: { type: "boolean" }
        }
      },
      RealtimeConversation: {
        type: "object",
        required: [
          "id",
          "type",
          "title",
          "participants",
          "lastMessage",
          "unreadCount",
          "createdAt",
          "updatedAt"
        ],
        properties: {
          id: { type: "integer" },
          type: { type: "string", enum: ["direct", "group"] },
          title: { type: ["string", "null"] },
          participants: {
            type: "array",
            items: { $ref: "#/components/schemas/RealtimeParticipant" }
          },
          lastMessage: {
            anyOf: [{ $ref: "#/components/schemas/RealtimeMessage" }, { type: "null" }]
          },
          unreadCount: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      RealtimeContact: {
        type: "object",
        required: [
          "id",
          "ownerUserId",
          "contactUserId",
          "contactUser",
          "nickname",
          "source",
          "isBlocked",
          "createdAt"
        ],
        properties: {
          id: { type: "integer" },
          ownerUserId: { type: "integer" },
          contactUserId: { type: "integer" },
          contactUser: { $ref: "#/components/schemas/RealtimeParticipant" },
          nickname: { type: ["string", "null"] },
          source: { type: "string" },
          isBlocked: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      FriendRequest: {
        type: "object",
        required: [
          "id",
          "requesterUserId",
          "targetUserId",
          "status",
          "message",
          "respondedAt",
          "createdAt"
        ],
        properties: {
          id: { type: "integer" },
          requesterUserId: { type: "integer" },
          targetUserId: { type: "integer" },
          status: { type: "string", enum: ["pending", "accepted", "rejected"] },
          message: { type: ["string", "null"] },
          respondedAt: { type: ["string", "null"], format: "date-time" },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      SocialPost: {
        type: "object",
        required: ["id", "authorUserId", "content", "media", "visibility", "createdAt", "author"],
        properties: {
          id: { type: "integer" },
          authorUserId: { type: "integer" },
          content: { type: "string" },
          media: {},
          visibility: { type: "string", enum: ["public", "followers"] },
          createdAt: { type: "string", format: "date-time" },
          author: { $ref: "#/components/schemas/SocialProfileSummary" }
        }
      },
      SocialProfileSummary: {
        type: "object",
        additionalProperties: false,
        required: ["userId", "username", "displayName", "avatarUrl", "entityType", "joinedAt"],
        properties: {
          userId: { type: "integer" },
          username: { type: "string" },
          displayName: { type: "string" },
          avatarUrl: { type: ["string", "null"] },
          entityType: { type: "string", enum: ["user", "technician", "shop"] },
          joinedAt: { type: "string", format: "date-time" }
        }
      },
      SocialActivityStatus: {
        type: "object",
        additionalProperties: false,
        required: ["status", "profile", "latestVisiblePostAt"],
        properties: {
          status: { type: "string", enum: ["recent_posts", "no_recent_posts"] },
          profile: { $ref: "#/components/schemas/SocialProfileSummary" },
          latestVisiblePostAt: { type: ["string", "null"], format: "date-time" }
        }
      },
      Follow: {
        type: "object",
        required: ["id", "followerUserId", "followingUserId", "createdAt"],
        properties: {
          id: { type: "integer" },
          followerUserId: { type: "integer" },
          followingUserId: { type: "integer" },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      Notification: {
        type: "object",
        required: [
          "id",
          "recipientUserId",
          "actorUserId",
          "type",
          "title",
          "body",
          "payload",
          "readAt",
          "createdAt"
        ],
        properties: {
          id: { type: "integer" },
          recipientUserId: { type: "integer" },
          actorUserId: { type: ["integer", "null"] },
          type: { type: "string", enum: ["orderStatus", "friendRequest", "system", "social"] },
          title: { type: "string" },
          body: { type: "string" },
          payload: {},
          readAt: { type: ["string", "null"], format: "date-time" },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      RealtimeUnreadCounts: {
        type: "object",
        required: ["conversations", "notifications", "friendRequests", "total"],
        properties: {
          conversations: { type: "integer" },
          notifications: { type: "integer" },
          friendRequests: { type: "integer" },
          total: { type: "integer" }
        }
      },
      TokenPair: {
        type: "object",
        required: ["accessToken", "refreshToken", "expiresIn"],
        properties: {
          accessToken: { type: "string" },
          refreshToken: { type: "string" },
          expiresIn: { type: "integer", enum: [config.AUTH_ACCESS_TOKEN_TTL_SECONDS] }
        }
      },
      TokenPairWithNeedoId: {
        type: "object",
        additionalProperties: false,
        required: ["accessToken", "refreshToken", "expiresIn"],
        properties: {
          accessToken: { type: "string" },
          refreshToken: { type: "string" },
          expiresIn: { type: "integer", enum: [config.AUTH_ACCESS_TOKEN_TTL_SECONDS] },
          needoId: { type: "string", pattern: "^u[0-9]{10}$" }
        }
      },
      AuthChallengeMetadata: {
        type: "object",
        additionalProperties: false,
        required: ["challengeId", "maskedEmail", "expiresIn", "cooldownSeconds"],
        properties: {
          challengeId: { type: "string", format: "uuid", maxLength: 64 },
          maskedEmail: { type: "string", minLength: 1, maxLength: 255 },
          expiresIn: { type: "integer", minimum: 1, maximum: 600 },
          cooldownSeconds: { type: "integer", minimum: 0 }
        }
      },
      GoogleAuthInitialization: {
        type: "object",
        additionalProperties: false,
        required: ["clientId", "nonce", "nonceChallengeId", "expiresIn"],
        properties: {
          clientId: { type: "string", minLength: 1, maxLength: 255 },
          nonce: { type: "string", minLength: 1, maxLength: 1024 },
          nonceChallengeId: { type: "string", format: "uuid", maxLength: 64 },
          expiresIn: { type: "integer", minimum: 1, maximum: 600 }
        }
      },
      GoogleCredentialResult: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["status", "accessToken", "refreshToken", "expiresIn"],
            properties: {
              status: { type: "string", const: "authenticated" },
              accessToken: { type: "string" },
              refreshToken: { type: "string" },
              expiresIn: { type: "integer", enum: [config.AUTH_ACCESS_TOKEN_TTL_SECONDS] }
            }
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["status", "challengeId", "maskedEmail", "expiresIn", "cooldownSeconds"],
            properties: {
              status: { type: "string", const: "verification_required" },
              challengeId: { type: "string", format: "uuid", maxLength: 64 },
              maskedEmail: { type: "string", minLength: 1, maxLength: 255 },
              expiresIn: { type: "integer", minimum: 1, maximum: 600 },
              cooldownSeconds: { type: "integer", minimum: 0 }
            }
          }
        ]
      },
      GoogleLinkStatus: {
        type: "object",
        additionalProperties: false,
        required: ["linked", "maskedEmail", "hasPassword", "canUnlink"],
        properties: {
          linked: { type: "boolean" },
          maskedEmail: { type: ["string", "null"], maxLength: 255 },
          hasPassword: { type: "boolean" },
          canUnlink: { type: "boolean" }
        }
      },
      RegisteredAccount: {
        type: "object",
        required: ["id", "email", "username", "accountType", "approvalStatus", "isActive"],
        properties: {
          id: { type: "integer" },
          email: { type: "string", format: "email" },
          username: { type: "string" },
          accountType: { type: "string", enum: ["customer", "technician"] },
          approvalStatus: { type: "string", enum: ["approved", "pending_review"] },
          isActive: { type: "boolean" }
        }
      },
      BackofficeTechnicianRankingRow: {
        type: "object",
        required: [
          "rank",
          "technicianProfileId",
          "userId",
          "displayName",
          "email",
          "avatarUrl",
          "shopId",
          "shopName",
          "city",
          "serviceArea",
          "status",
          "verifiedAt",
          "completedServiceAmountJpy",
          "completedOrderCount",
          "workingDayCount"
        ],
        properties: {
          rank: { type: "integer", minimum: 1 },
          technicianProfileId: { type: "integer", minimum: 1 },
          userId: { type: "integer", minimum: 1 },
          displayName: { type: "string" },
          email: { type: "string", format: "email" },
          avatarUrl: { type: ["string", "null"] },
          shopId: { type: ["integer", "null"] },
          shopName: { type: ["string", "null"] },
          city: { type: "string" },
          serviceArea: { type: ["string", "null"] },
          status: { type: "string" },
          verifiedAt: { type: ["string", "null"], format: "date-time" },
          completedServiceAmountJpy: {
            type: "integer",
            minimum: 0,
            description:
              "Final service amount for completed orders from OrderFinancial, including recorded extension amounts."
          },
          completedOrderCount: {
            type: "integer",
            minimum: 0,
            description: "Distinct completed booking orders; extensions do not create extra orders."
          },
          workingDayCount: {
            type: "integer",
            minimum: 0,
            description: "Distinct Asia/Tokyo calendar days with at least one completed order."
          }
        }
      },
      BackofficeTechnicianRanking: {
        type: "object",
        required: ["list", "summary", "period", "total", "page", "page_size"],
        properties: {
          list: {
            type: "array",
            items: { $ref: "#/components/schemas/BackofficeTechnicianRankingRow" }
          },
          summary: {
            type: "object",
            required: [
              "technicianCount",
              "completedServiceAmountJpy",
              "completedOrderCount",
              "workingDayCount"
            ],
            properties: {
              technicianCount: { type: "integer", minimum: 0 },
              completedServiceAmountJpy: { type: "integer", minimum: 0 },
              completedOrderCount: { type: "integer", minimum: 0 },
              workingDayCount: { type: "integer", minimum: 0 }
            }
          },
          period: {
            type: "object",
            required: ["key", "timeZone", "from", "to"],
            properties: {
              key: {
                type: "string",
                enum: ["today", "last7days", "last30days", "month", "custom", "all"]
              },
              timeZone: { type: "string", enum: ["Asia/Tokyo"] },
              from: { type: ["string", "null"], format: "date" },
              to: { type: ["string", "null"], format: "date" }
            }
          },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          page_size: { type: "integer", minimum: 1, maximum: 100 }
        }
      },
      BackofficeCustomer: {
        type: "object",
        required: [
          "id",
          "userId",
          "displayName",
          "email",
          "membershipLevel",
          "isPublic",
          "bookingCount",
          "createdAt"
        ],
        properties: {
          id: { type: "integer" },
          userId: { type: "integer" },
          displayName: { type: "string" },
          email: { type: "string", format: "email" },
          city: { type: ["string", "null"] },
          membershipLevel: { type: "string" },
          isPublic: { type: "boolean" },
          bookingCount: { type: "integer" },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      BackofficeRole: {
        type: "object",
        required: ["name", "code", "scopeType", "scopeId"],
        properties: {
          name: { type: "string" },
          code: { type: "string" },
          scopeType: { type: ["string", "null"] },
          scopeId: { type: ["integer", "null"] }
        }
      },
      BackofficeIdentity: {
        type: "object",
        required: ["type", "scopeType", "scopeId", "displayName"],
        properties: {
          type: { type: "string" },
          scopeType: { type: ["string", "null"] },
          scopeId: { type: ["integer", "null"] },
          displayName: { type: ["string", "null"] }
        }
      },
      BackofficeAccount: {
        type: "object",
        required: [
          "username",
          "email",
          "phone",
          "avatarUrl",
          "isActive",
          "lastLoginAt",
          "roles",
          "identities"
        ],
        properties: {
          username: { type: "string" },
          email: { type: "string", format: "email" },
          phone: { type: ["string", "null"] },
          avatarUrl: { type: ["string", "null"] },
          isActive: { type: "boolean" },
          lastLoginAt: { type: ["string", "null"], format: "date-time" },
          roles: {
            type: "array",
            items: { $ref: "#/components/schemas/BackofficeRole" }
          },
          identities: {
            type: "array",
            items: { $ref: "#/components/schemas/BackofficeIdentity" }
          }
        }
      },
      BackofficeAuditEvent: {
        type: "object",
        required: ["id", "action", "actorName", "actorAvatarUrl", "createdAt", "metadata"],
        properties: {
          id: { type: "string" },
          action: { type: "string" },
          actorName: { type: "string" },
          actorAvatarUrl: { type: ["string", "null"] },
          createdAt: { type: "string", format: "date-time" },
          metadata: { type: ["object", "null"], additionalProperties: true }
        }
      },
      BackofficeReviewSummary: {
        type: "object",
        required: ["ratingAverage", "reviewCount", "latestReviewAt", "highlights"],
        properties: {
          ratingAverage: { type: "number" },
          reviewCount: { type: "integer" },
          latestReviewAt: { type: ["string", "null"], format: "date-time" },
          highlights: { type: "array", items: { type: "string" } }
        }
      },
      BackofficeTechnicianServiceDetail: {
        type: "object",
        required: [
          "id",
          "source",
          "sourceShopServiceId",
          "name",
          "description",
          "categoryId",
          "priceAmount",
          "currency",
          "durationMinutes",
          "isRecommended"
        ],
        properties: {
          id: { type: "integer" },
          source: { type: "string", enum: ["technician_service", "service"] },
          sourceShopServiceId: { type: ["integer", "null"] },
          name: { type: "string" },
          description: { type: ["string", "null"] },
          categoryId: { type: "integer" },
          priceAmount: { type: "number" },
          currency: { type: "string" },
          durationMinutes: { type: "integer" },
          isRecommended: { type: "boolean" }
        }
      },
      BackofficeScheduleSummary: {
        type: "object",
        required: [
          "id",
          "serviceId",
          "serviceName",
          "shopId",
          "shopName",
          "technicianProfileId",
          "technicianName",
          "startsAt",
          "endsAt",
          "capacity",
          "bookedCount",
          "status"
        ],
        properties: {
          id: { type: "integer" },
          serviceId: { type: ["integer", "null"] },
          serviceName: { type: "string" },
          shopId: { type: "integer" },
          shopName: { type: "string" },
          technicianProfileId: { type: ["integer", "null"] },
          technicianName: { type: ["string", "null"] },
          startsAt: { type: "string", format: "date-time" },
          endsAt: { type: "string", format: "date-time" },
          capacity: { type: "integer" },
          bookedCount: { type: "integer" },
          status: { type: "string" }
        }
      },
      BackofficeCompensation: {
        type: "object",
        required: [
          "id",
          "shopId",
          "technicianProfileId",
          "name",
          "status",
          "version",
          "wageMode",
          "baseSalaryJpy",
          "hourlyRateJpy",
          "dailyRateJpy",
          "fixedOrderPayJpy",
          "commissionRatePercent",
          "guaranteedMinimumJpy",
          "ndpFeeBearer",
          "technicianNdpSharePercent",
          "effectiveFrom",
          "effectiveTo",
          "updatedAt"
        ],
        properties: {
          id: { type: "integer" },
          shopId: { type: "integer" },
          technicianProfileId: { type: "integer" },
          name: { type: "string" },
          status: { type: "string" },
          version: { type: "integer" },
          wageMode: { type: "string" },
          baseSalaryJpy: { type: "integer" },
          hourlyRateJpy: { type: "integer" },
          dailyRateJpy: { type: "integer" },
          fixedOrderPayJpy: { type: "integer" },
          commissionRatePercent: { type: "number" },
          guaranteedMinimumJpy: { type: "integer" },
          ndpFeeBearer: { type: "string" },
          technicianNdpSharePercent: { type: "number" },
          effectiveFrom: { type: ["string", "null"], format: "date-time" },
          effectiveTo: { type: ["string", "null"], format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      BackofficeBookingSummary: {
        type: "object",
        required: [
          "id",
          "orderNo",
          "status",
          "paymentStatus",
          "customerUserId",
          "customerName",
          "serviceId",
          "serviceName",
          "shopId",
          "shopName",
          "technicianProfileId",
          "technicianName",
          "fulfillmentMode",
          "priceAmount",
          "currency",
          "startsAt",
          "endsAt",
          "note",
          "cancelReason",
          "createdAt",
          "updatedAt"
        ],
        properties: {
          id: { type: "integer" },
          orderNo: { type: "string" },
          status: { type: "string" },
          paymentStatus: {
            type: "string",
            enum: ["pending", "confirmed", "refundPending", "refunded"]
          },
          customerUserId: { type: "integer" },
          customerName: { type: "string" },
          serviceId: { type: ["integer", "null"] },
          serviceName: { type: "string" },
          shopId: { type: "integer" },
          shopName: { type: "string" },
          technicianProfileId: { type: ["integer", "null"] },
          technicianName: { type: ["string", "null"] },
          fulfillmentMode: { type: "string" },
          priceAmount: { type: "number" },
          currency: { type: "string" },
          startsAt: { type: "string", format: "date-time" },
          endsAt: { type: "string", format: "date-time" },
          note: { type: ["string", "null"] },
          cancelReason: { type: ["string", "null"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      BackofficeTechnicianDetail: {
        type: "object",
        required: [
          "id",
          "userId",
          "displayName",
          "email",
          "avatarUrl",
          "shopId",
          "shopName",
          "city",
          "serviceArea",
          "employmentType",
          "employmentStartedAt",
          "status",
          "verifiedAt",
          "createdAt",
          "bio",
          "yearsExperience",
          "isRecommended",
          "updatedAt",
          "account",
          "statistics",
          "reviewSummary",
          "services",
          "servicesLimit",
          "servicesTruncated",
          "upcomingSchedule",
          "compensationProfile",
          "timeline",
          "unavailableMetrics"
        ],
        properties: {
          id: { type: "integer" },
          userId: { type: "integer" },
          displayName: { type: "string" },
          email: { type: "string", format: "email" },
          avatarUrl: { type: ["string", "null"] },
          shopId: { type: ["integer", "null"] },
          shopName: { type: ["string", "null"] },
          city: { type: "string" },
          serviceArea: { type: ["string", "null"] },
          employmentType: {
            type: "string",
            enum: ["independent", "full_time", "temporary"]
          },
          employmentStartedAt: { type: ["string", "null"], format: "date-time" },
          status: { type: "string" },
          verifiedAt: { type: ["string", "null"], format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          bio: { type: ["string", "null"] },
          yearsExperience: { type: "integer" },
          isRecommended: { type: "boolean" },
          updatedAt: { type: "string", format: "date-time" },
          account: { $ref: "#/components/schemas/BackofficeAccount" },
          statistics: {
            type: "object",
            required: [
              "bookingCount",
              "completedCount",
              "cancelledCount",
              "completedRevenueJpy",
              "todayScheduleMinutes",
              "weekScheduleMinutes",
              "monthScheduleMinutes"
            ],
            properties: {
              bookingCount: { type: "integer" },
              completedCount: { type: "integer" },
              cancelledCount: { type: "integer" },
              completedRevenueJpy: { type: "number" },
              todayScheduleMinutes: { type: "integer" },
              weekScheduleMinutes: { type: "integer" },
              monthScheduleMinutes: { type: "integer" }
            }
          },
          reviewSummary: {
            anyOf: [{ $ref: "#/components/schemas/BackofficeReviewSummary" }, { type: "null" }]
          },
          services: {
            type: "array",
            items: { $ref: "#/components/schemas/BackofficeTechnicianServiceDetail" }
          },
          servicesLimit: { type: "integer", minimum: 1 },
          servicesTruncated: { type: "boolean" },
          upcomingSchedule: {
            type: "array",
            items: { $ref: "#/components/schemas/BackofficeScheduleSummary" }
          },
          compensationProfile: {
            anyOf: [{ $ref: "#/components/schemas/BackofficeCompensation" }, { type: "null" }]
          },
          timeline: {
            type: "array",
            items: { $ref: "#/components/schemas/BackofficeAuditEvent" }
          },
          unavailableMetrics: {
            type: "array",
            items: {
              type: "string",
              enum: ["acceptanceRate", "lateness", "shiftPreferences"]
            }
          }
        }
      },
      BackofficeCustomerDetail: {
        allOf: [
          { $ref: "#/components/schemas/BackofficeCustomer" },
          {
            type: "object",
            required: [
              "bio",
              "updatedAt",
              "account",
              "bookingStatusTotals",
              "completedSpendJpy",
              "nextBooking",
              "recentBookings",
              "reviewSummary",
              "timeline"
            ],
            properties: {
              bio: { type: ["string", "null"] },
              updatedAt: { type: "string", format: "date-time" },
              account: { $ref: "#/components/schemas/BackofficeAccount" },
              bookingStatusTotals: {
                type: "object",
                additionalProperties: { type: "integer" }
              },
              completedSpendJpy: { type: "number" },
              nextBooking: {
                anyOf: [{ $ref: "#/components/schemas/BackofficeBookingSummary" }, { type: "null" }]
              },
              recentBookings: {
                type: "array",
                items: { $ref: "#/components/schemas/BackofficeBookingSummary" }
              },
              reviewSummary: {
                anyOf: [{ $ref: "#/components/schemas/BackofficeReviewSummary" }, { type: "null" }]
              },
              timeline: {
                type: "array",
                items: { $ref: "#/components/schemas/BackofficeAuditEvent" }
              }
            }
          }
        ]
      },
      BackofficeService: {
        type: "object",
        required: [
          "id",
          "categoryId",
          "categoryName",
          "shopId",
          "name",
          "city",
          "serviceMode",
          "priceAmount",
          "currency",
          "durationMinutes",
          "status",
          "isRecommended",
          "sortOrder",
          "createdAt",
          "updatedAt"
        ],
        properties: {
          id: { type: "integer" },
          categoryId: { type: "integer" },
          categoryName: { type: "string" },
          shopId: { type: "integer" },
          technicianProfileId: { type: ["integer", "null"] },
          name: { type: "string" },
          description: { type: ["string", "null"] },
          city: { type: "string" },
          serviceMode: { type: "string", enum: ["store", "home"] },
          priceAmount: { type: "number", minimum: 0 },
          currency: { type: "string", enum: ["JPY"] },
          durationMinutes: { type: "integer", minimum: 1 },
          status: { type: "string" },
          isRecommended: { type: "boolean" },
          sortOrder: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      BackofficeShopUpdateInput: {
        type: "object",
        minProperties: 1,
        properties: {
          name: { type: "string", minLength: 1, maxLength: 160 },
          description: { type: ["string", "null"], maxLength: 5000 },
          city: { type: "string", minLength: 1, maxLength: 100 },
          address: { type: "string", minLength: 1, maxLength: 255 },
          phone: { type: ["string", "null"], maxLength: 50 },
          isRecommended: { type: "boolean" }
        }
      },
      MerchantShopUpdateInput: {
        type: "object",
        additionalProperties: false,
        minProperties: 1,
        properties: {
          name: { type: "string", minLength: 1, maxLength: 160 },
          description: { type: ["string", "null"], maxLength: 5000 },
          city: { type: "string", minLength: 1, maxLength: 100 },
          address: { type: "string", minLength: 1, maxLength: 255 },
          phone: { type: ["string", "null"], minLength: 5, maxLength: 32 }
        }
      },
      BackofficeTechnicianUpdateInput: {
        type: "object",
        minProperties: 1,
        properties: {
          displayName: { type: "string", minLength: 1, maxLength: 120 },
          city: { type: "string", minLength: 1, maxLength: 100 },
          serviceArea: { type: ["string", "null"], maxLength: 255 },
          shopId: { type: ["integer", "null"], minimum: 1 },
          employmentType: {
            type: "string",
            enum: ["independent", "full_time", "temporary"]
          },
          employmentStartedAt: { type: ["string", "null"], format: "date-time" },
          isRecommended: { type: "boolean" }
        }
      },
      BackofficeCustomerUpdateInput: {
        type: "object",
        minProperties: 1,
        properties: {
          displayName: { type: "string", minLength: 1, maxLength: 120 },
          bio: { type: ["string", "null"], maxLength: 5000 },
          city: { type: ["string", "null"], maxLength: 100 },
          membershipLevel: { type: "string", minLength: 1, maxLength: 50 },
          isPublic: { type: "boolean" }
        }
      },
      BackofficeServiceInputFields: {
        type: "object",
        properties: {
          categoryId: { type: "integer", minimum: 1 },
          technicianProfileId: { type: ["integer", "null"], minimum: 1 },
          name: { type: "string", minLength: 1, maxLength: 160 },
          description: { type: ["string", "null"], maxLength: 5000 },
          city: { type: "string", minLength: 1, maxLength: 100 },
          serviceMode: { type: "string", enum: ["store", "home"] },
          priceAmount: { type: "number", minimum: 0, maximum: 99999999 },
          durationMinutes: { type: "integer", minimum: 1, maximum: 1440 },
          status: { type: "string", enum: ["draft", "published", "paused"] },
          isRecommended: { type: "boolean" },
          sortOrder: { type: "integer", minimum: 0, maximum: 1000000 }
        }
      },
      BackofficeServiceCreateInput: {
        allOf: [{ $ref: "#/components/schemas/BackofficeServiceInputFields" }],
        required: ["categoryId", "name", "city", "serviceMode", "priceAmount", "durationMinutes"]
      },
      BackofficeServiceUpdateInput: {
        allOf: [{ $ref: "#/components/schemas/BackofficeServiceInputFields" }],
        minProperties: 1
      },
      SwitchIdentityResponse: {
        type: "object",
        required: ["accessToken", "refreshToken", "expiresIn", "me"],
        properties: {
          accessToken: { type: "string" },
          refreshToken: { type: "string" },
          expiresIn: { type: "integer", enum: [config.AUTH_ACCESS_TOKEN_TTL_SECONDS] },
          me: { $ref: "#/components/schemas/AuthMe" }
        }
      },
      RefreshTokenResponse: {
        type: "object",
        required: ["accessToken", "expiresIn"],
        properties: {
          accessToken: { type: "string" },
          expiresIn: { type: "integer", enum: [config.AUTH_ACCESS_TOKEN_TTL_SECONDS] }
        }
      },
      AuthIdentityAvailability: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "state", "identityId", "applicationId", "rejectionReason"],
        properties: {
          kind: {
            type: "string",
            enum: ["customer", "technician", "merchant", "affiliate"]
          },
          state: {
            type: "string",
            enum: ["active", "available_to_apply", "draft", "pending", "rejected"]
          },
          identityId: { type: ["integer", "null"] },
          applicationId: { type: ["integer", "null"] },
          rejectionReason: { type: ["string", "null"] }
        }
      },
      AuthMe: {
        type: "object",
        required: [
          "id",
          "needoId",
          "primaryPublicId",
          "activeIdentityId",
          "activePublicId",
          "email",
          "emailVerifiedAt",
          "hasPassword",
          "username",
          "avatarUrl",
          "isActive",
          "currentIdentity",
          "identities",
          "identityAvailability",
          "roles",
          "permissions",
          "menus"
        ],
        properties: {
          id: { type: "integer" },
          needoId: { type: "string", pattern: "^(?:u|needo)[0-9]{10}$" },
          primaryPublicId: {
            type: "string",
            pattern: "^(?:u|needo)[0-9]{10}$"
          },
          activeIdentityId: { type: "integer", minimum: 1 },
          activePublicId: {
            type: ["string", "null"],
            pattern: "^(?:u|s|b|o|needo)[0-9]{10}$"
          },
          email: { type: "string", format: "email" },
          emailVerifiedAt: { type: ["string", "null"], format: "date-time" },
          hasPassword: { type: "boolean" },
          username: { type: "string" },
          avatarUrl: { type: ["string", "null"] },
          isActive: { type: "boolean" },
          currentIdentity: { $ref: "#/components/schemas/AuthIdentity" },
          identities: {
            type: "array",
            items: { $ref: "#/components/schemas/AuthIdentity" }
          },
          identityAvailability: {
            type: "array",
            items: { $ref: "#/components/schemas/AuthIdentityAvailability" }
          },
          roles: { type: "array", items: { type: "string" } },
          permissions: { type: "array", items: { type: "string" } },
          menus: { type: "array", items: { type: "string" } }
        }
      },
      AuthIdentity: {
        type: "object",
        required: ["id", "publicId", "type", "scopeType", "scopeId"],
        properties: {
          id: { type: "integer" },
          publicId: {
            type: ["string", "null"],
            pattern: "^(?:u|s|b|o|needo)[0-9]{10}$"
          },
          type: { type: "string" },
          scopeType: { type: ["string", "null"] },
          scopeId: { type: ["integer", "null"] }
        }
      },
      Permission: {
        type: "object",
        required: [
          "id",
          "name",
          "code",
          "type",
          "module",
          "description",
          "isSystem",
          "createdAt",
          "updatedAt",
          "deletedAt"
        ],
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          code: { type: "string" },
          type: { type: "string", enum: ["api", "menu", "page", "button"] },
          module: { type: "string" },
          description: { type: ["string", "null"] },
          isSystem: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          deletedAt: { type: ["string", "null"], format: "date-time" }
        }
      },
      Role: {
        type: "object",
        required: [
          "id",
          "name",
          "code",
          "description",
          "isSystem",
          "createdAt",
          "updatedAt",
          "deletedAt",
          "permissions"
        ],
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          code: { type: "string" },
          description: { type: ["string", "null"] },
          isSystem: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          deletedAt: { type: ["string", "null"], format: "date-time" },
          permissions: {
            type: "array",
            items: { $ref: "#/components/schemas/Permission" }
          }
        }
      },
      User: {
        type: "object",
        required: [
          "id",
          "email",
          "phone",
          "username",
          "avatarUrl",
          "isActive",
          "lastLoginAt",
          "createdAt",
          "updatedAt",
          "deletedAt",
          "identities",
          "roleAssignments",
          "roles"
        ],
        properties: {
          id: { type: "integer" },
          email: { type: "string", format: "email" },
          phone: { type: ["string", "null"] },
          username: { type: "string" },
          avatarUrl: { type: ["string", "null"] },
          isActive: { type: "boolean" },
          lastLoginAt: { type: ["string", "null"], format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          deletedAt: { type: ["string", "null"], format: "date-time" },
          identities: {
            type: "array",
            items: { $ref: "#/components/schemas/AuthIdentity" }
          },
          roleAssignments: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "roleId", "code", "name", "scopeType", "scopeId"],
              properties: {
                id: { type: "integer" },
                roleId: { type: "integer" },
                code: { type: "string" },
                name: { type: "string" },
                scopeType: { type: ["string", "null"] },
                scopeId: { type: ["integer", "null"] }
              }
            }
          },
          roles: { type: "array", items: { type: "string" } }
        }
      },
      PermissionTree: {
        type: "object",
        required: ["modules"],
        properties: {
          modules: {
            type: "array",
            items: {
              type: "object",
              required: ["module", "children"],
              properties: {
                module: { type: "string" },
                children: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["type", "permissions"],
                    properties: {
                      type: { type: "string" },
                      permissions: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Permission" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      ReviewSummary: {
        type: "object",
        required: ["ratingAverage", "reviewCount", "latestReviewAt", "highlights"],
        properties: {
          ratingAverage: { type: "string", example: "4.80" },
          reviewCount: { type: "integer" },
          latestReviewAt: { type: ["string", "null"], format: "date-time" },
          highlights: { type: "array", items: { type: "string" } }
        }
      },
      MediaAsset: {
        type: "object",
        required: ["id", "url", "mimeType", "usageType", "width", "height", "altText", "sortOrder"],
        properties: {
          id: { type: "integer" },
          url: { type: "string" },
          mimeType: { type: "string" },
          usageType: { type: "string" },
          width: { type: ["integer", "null"] },
          height: { type: ["integer", "null"] },
          altText: { type: ["string", "null"] },
          sortOrder: { type: "integer" }
        }
      },
      Category: {
        type: "object",
        required: [
          "id",
          "code",
          "name",
          "nameJa",
          "nameEn",
          "parentId",
          "iconUrl",
          "sortOrder",
          "isActive",
          "createdAt",
          "updatedAt"
        ],
        properties: {
          id: { type: "integer" },
          code: { type: "string" },
          name: { type: "string" },
          nameJa: { type: ["string", "null"] },
          nameEn: { type: ["string", "null"] },
          parentId: { type: ["integer", "null"] },
          iconUrl: { type: ["string", "null"] },
          sortOrder: { type: "integer" },
          isActive: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      ShopCard: {
        type: "object",
        required: ["id", "publicId", "name", "city", "address", "coverUrl", "reviewSummary"],
        properties: {
          id: { type: "integer" },
          publicId: { type: "string", pattern: "^shop[0-9]{10}$" },
          name: { type: "string" },
          city: { type: "string" },
          address: { type: "string" },
          coverUrl: { type: ["string", "null"] },
          reviewSummary: { $ref: "#/components/schemas/ReviewSummary" }
        }
      },
      TechnicianCard: {
        type: "object",
        required: ["id", "publicId", "displayName", "city", "avatarUrl", "reviewSummary"],
        properties: {
          id: { type: "integer" },
          publicId: { type: "string", pattern: "^s[0-9]{10}$" },
          displayName: { type: "string" },
          city: { type: "string" },
          avatarUrl: { type: ["string", "null"] },
          reviewSummary: { $ref: "#/components/schemas/ReviewSummary" }
        }
      },
      ServiceCard: {
        type: "object",
        required: [
          "id",
          "name",
          "description",
          "category",
          "shop",
          "technician",
          "city",
          "priceAmount",
          "currency",
          "durationMinutes",
          "coverUrl",
          "reviewSummary"
        ],
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          description: { type: ["string", "null"] },
          category: { $ref: "#/components/schemas/Category" },
          shop: { $ref: "#/components/schemas/ShopCard" },
          technician: {
            anyOf: [{ $ref: "#/components/schemas/TechnicianCard" }, { type: "null" }]
          },
          city: { type: "string" },
          priceAmount: { type: "string", example: "8800.00" },
          currency: { type: "string", example: "JPY" },
          durationMinutes: { type: "integer" },
          coverUrl: { type: ["string", "null"] },
          reviewSummary: { $ref: "#/components/schemas/ReviewSummary" }
        }
      },
      ServiceDetail: {
        allOf: [
          { $ref: "#/components/schemas/ServiceCard" },
          {
            type: "object",
            required: ["serviceMode", "mediaAssets", "createdAt", "updatedAt"],
            properties: {
              serviceMode: { type: "string" },
              mediaAssets: { type: "array", items: { $ref: "#/components/schemas/MediaAsset" } },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" }
            }
          }
        ]
      },
      ShopDetail: {
        allOf: [
          { $ref: "#/components/schemas/ShopCard" },
          {
            type: "object",
            required: [
              "description",
              "phone",
              "latitude",
              "longitude",
              "mediaAssets",
              "services",
              "technicians",
              "createdAt",
              "updatedAt"
            ],
            properties: {
              description: { type: ["string", "null"] },
              phone: { type: ["string", "null"] },
              latitude: { type: ["string", "null"] },
              longitude: { type: ["string", "null"] },
              mediaAssets: { type: "array", items: { $ref: "#/components/schemas/MediaAsset" } },
              services: { type: "array", items: { $ref: "#/components/schemas/ServiceCard" } },
              technicians: {
                type: "array",
                items: { $ref: "#/components/schemas/TechnicianCard" }
              },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" }
            }
          }
        ]
      },
      TechnicianDetail: {
        allOf: [
          { $ref: "#/components/schemas/TechnicianCard" },
          {
            type: "object",
            required: [
              "shop",
              "bio",
              "serviceArea",
              "yearsExperience",
              "mediaAssets",
              "services",
              "createdAt",
              "updatedAt"
            ],
            properties: {
              shop: {
                anyOf: [{ $ref: "#/components/schemas/ShopCard" }, { type: "null" }]
              },
              bio: { type: ["string", "null"] },
              serviceArea: { type: ["string", "null"] },
              yearsExperience: { type: "integer" },
              mediaAssets: { type: "array", items: { $ref: "#/components/schemas/MediaAsset" } },
              services: { type: "array", items: { $ref: "#/components/schemas/ServiceCard" } },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" }
            }
          }
        ]
      },
      CustomerProfile: {
        type: "object",
        required: [
          "id",
          "publicId",
          "displayName",
          "city",
          "bio",
          "avatarUrl",
          "membershipLevel",
          "reviewSummary",
          "createdAt",
          "updatedAt"
        ],
        properties: {
          id: { type: "integer" },
          publicId: { type: "string", pattern: "^(?:u|needo)[0-9]{10}$" },
          displayName: { type: "string" },
          city: { type: ["string", "null"] },
          bio: { type: ["string", "null"] },
          avatarUrl: { type: ["string", "null"] },
          membershipLevel: { type: "string" },
          reviewSummary: { $ref: "#/components/schemas/ReviewSummary" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      CustomerSelfProfile: {
        type: "object",
        required: [
          "id",
          "publicId",
          "userId",
          "displayName",
          "city",
          "membershipLevel",
          "avatarUrl",
          "gender",
          "age",
          "heightCm",
          "languages",
          "bio",
          "visibility",
          "isPublic",
          "createdAt",
          "updatedAt"
        ],
        properties: {
          id: { type: "integer", minimum: 1 },
          publicId: { type: "string", pattern: "^(?:u|needo)[0-9]{10}$" },
          userId: { type: "integer", minimum: 1 },
          displayName: { type: "string", minLength: 1, maxLength: 120 },
          city: { type: ["string", "null"] },
          membershipLevel: { type: "string" },
          avatarUrl: { type: ["string", "null"], format: "uri" },
          gender: { type: "string", enum: ["female", "male", "private"] },
          age: { type: ["integer", "null"], minimum: 0, maximum: 150 },
          heightCm: { type: ["number", "null"], minimum: 30, maximum: 250 },
          languages: {
            type: "array",
            minItems: 1,
            maxItems: 10,
            items: { type: "string", minLength: 1, maxLength: 40 }
          },
          bio: { type: ["string", "null"], maxLength: 2000 },
          visibility: { type: "string", enum: ["public", "privateAll", "limited", "network"] },
          isPublic: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      CustomerSelfProfileUpdate: {
        type: "object",
        minProperties: 1,
        additionalProperties: false,
        properties: {
          displayName: { type: "string", minLength: 1, maxLength: 120 },
          avatarDataUrl: {
            type: "string",
            maxLength: 900000,
            pattern: "^data:image/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$"
          },
          gender: { type: "string", enum: ["female", "male", "private"] },
          age: { type: ["integer", "null"], minimum: 0, maximum: 150 },
          heightCm: { type: ["number", "null"], minimum: 30, maximum: 250 },
          languages: {
            type: "array",
            minItems: 1,
            maxItems: 10,
            items: { type: "string", minLength: 1, maxLength: 40 }
          },
          bio: { type: ["string", "null"], maxLength: 2000 },
          visibility: { type: "string", enum: ["public", "privateAll", "limited", "network"] }
        }
      },
      HomeRecommendations: {
        type: "object",
        required: ["categories", "services", "shops", "technicians"],
        properties: {
          categories: { type: "array", items: { $ref: "#/components/schemas/Category" } },
          services: { type: "array", items: { $ref: "#/components/schemas/ServiceCard" } },
          shops: { type: "array", items: { $ref: "#/components/schemas/ShopCard" } },
          technicians: { type: "array", items: { $ref: "#/components/schemas/TechnicianCard" } }
        }
      },
      ScheduleSlot: {
        type: "object",
        required: [
          "id",
          "serviceId",
          "shopId",
          "technicianProfileId",
          "startsAt",
          "endsAt",
          "capacity",
          "bookedCount",
          "status",
          "serviceName",
          "shopName",
          "technicianName",
          "priceAmount",
          "currency",
          "durationMinutes"
        ],
        properties: {
          id: { type: "integer" },
          serviceId: { type: "integer" },
          shopId: { type: "integer" },
          technicianProfileId: { type: ["integer", "null"] },
          startsAt: { type: "string", format: "date-time" },
          endsAt: { type: "string", format: "date-time" },
          capacity: { type: "integer" },
          bookedCount: { type: "integer" },
          status: { type: "string", enum: ["available", "booked", "blocked"] },
          serviceName: { type: "string" },
          shopName: { type: "string" },
          technicianName: { type: ["string", "null"] },
          priceAmount: { type: "string", example: "8800.00" },
          currency: { type: "string", example: "JPY" },
          durationMinutes: { type: "integer" }
        }
      },
      ScheduleSlotCreateInput: {
        type: "object",
        required: ["startsAt", "endsAt"],
        oneOf: [{ required: ["serviceId"] }, { required: ["technicianServiceId"] }],
        properties: {
          serviceId: { type: "integer", minimum: 1 },
          technicianServiceId: { type: "integer", minimum: 1 },
          technicianProfileId: { type: ["integer", "null"], minimum: 1 },
          startsAt: {
            type: "string",
            format: "date-time",
            description: "ISO 8601 timestamp with UTC or explicit offset"
          },
          endsAt: {
            type: "string",
            format: "date-time",
            description: "ISO 8601 timestamp with UTC or explicit offset"
          },
          capacity: { type: "integer", minimum: 1, maximum: 100, default: 1 }
        }
      },
      ScheduleSlotUpdateInput: {
        type: "object",
        minProperties: 1,
        properties: {
          startsAt: { type: "string", format: "date-time" },
          endsAt: { type: "string", format: "date-time" },
          capacity: { type: "integer", minimum: 1, maximum: 100 },
          status: { type: "string", enum: ["available", "blocked"] }
        }
      },
      OrderStatusHistory: {
        type: "object",
        required: ["id", "orderId", "fromStatus", "toStatus", "actorUserId", "reason", "createdAt"],
        properties: {
          id: { type: "integer" },
          orderId: { type: "integer" },
          fromStatus: {
            type: ["string", "null"],
            enum: ["pending", "confirmed", "inService", "completed", "cancelled", null]
          },
          toStatus: {
            type: "string",
            enum: ["pending", "confirmed", "inService", "completed", "cancelled"]
          },
          actorUserId: { type: ["integer", "null"] },
          reason: { type: ["string", "null"] },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      BookingOrder: {
        type: "object",
        required: [
          "id",
          "orderNo",
          "orderType",
          "status",
          "paymentMethod",
          "paymentStatus",
          "paymentAmountJpy",
          "paymentConfirmedById",
          "paymentConfirmedAt",
          "paymentReference",
          "paymentNote",
          "paymentRefundedById",
          "paymentRefundedAt",
          "paymentRefundReference",
          "paymentRefundReason",
          "customerUserId",
          "serviceId",
          "shopId",
          "technicianProfileId",
          "scheduleSlotId",
          "fulfillmentMode",
          "serviceName",
          "shopName",
          "technicianName",
          "priceAmount",
          "currency",
          "startsAt",
          "endsAt",
          "note",
          "cancelReason",
          "affiliate",
          "createdAt",
          "updatedAt",
          "statusHistory"
        ],
        properties: {
          id: { type: "integer" },
          orderNo: { type: "string" },
          orderType: { type: "string", enum: ["booking", "request"] },
          status: {
            type: "string",
            enum: ["pending", "confirmed", "inService", "completed", "cancelled"]
          },
          paymentMethod: { type: "string", enum: ["onsite", "bank_transfer"] },
          paymentStatus: {
            type: "string",
            enum: ["pending", "confirmed", "refundPending", "refunded"]
          },
          paymentAmountJpy: { type: "integer", minimum: 0 },
          paymentConfirmedById: { type: ["integer", "null"] },
          paymentConfirmedAt: { type: ["string", "null"], format: "date-time" },
          paymentReference: { type: ["string", "null"], maxLength: 120 },
          paymentNote: { type: ["string", "null"], maxLength: 500 },
          paymentRefundedById: { type: ["integer", "null"] },
          paymentRefundedAt: { type: ["string", "null"], format: "date-time" },
          paymentRefundReference: { type: ["string", "null"], maxLength: 120 },
          paymentRefundReason: { type: ["string", "null"], maxLength: 500 },
          customerUserId: { type: "integer" },
          serviceId: { type: "integer" },
          shopId: { type: "integer" },
          technicianProfileId: { type: ["integer", "null"] },
          scheduleSlotId: { type: "integer" },
          fulfillmentMode: { type: "string", enum: ["home", "store"] },
          serviceName: { type: "string" },
          shopName: { type: "string" },
          technicianName: { type: ["string", "null"] },
          priceAmount: { type: "string", example: "8800.00" },
          currency: { type: "string", example: "JPY" },
          startsAt: { type: "string", format: "date-time" },
          endsAt: { type: "string", format: "date-time" },
          note: { type: ["string", "null"] },
          cancelReason: { type: ["string", "null"] },
          affiliate: {
            anyOf: [{ $ref: "#/components/schemas/AffiliateCheckoutSummary" }, { type: "null" }]
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          statusHistory: {
            type: "array",
            items: { $ref: "#/components/schemas/OrderStatusHistory" }
          }
        }
      },
      Wallet: {
        type: "object",
        required: [
          "id",
          "ownerType",
          "ownerId",
          "currency",
          "availableBalance",
          "frozenBalance",
          "createdAt",
          "updatedAt"
        ],
        properties: {
          id: { type: "integer" },
          ownerType: { type: "string", enum: ["user", "shop", "platform"] },
          ownerId: { type: "integer" },
          currency: { type: "string", enum: ["NDP"] },
          availableBalance: { type: "integer" },
          frozenBalance: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      WalletAdjustmentRequest: {
        type: "object",
        required: [
          "id",
          "type",
          "status",
          "ownerType",
          "ownerId",
          "walletId",
          "amountNdp",
          "idempotencyKey",
          "bankReference",
          "note",
          "requestedById",
          "reviewedById",
          "reviewedAt",
          "reviewNote",
          "ledgerTransactionId",
          "createdAt",
          "updatedAt"
        ],
        properties: {
          id: { type: "integer" },
          type: { type: "string", enum: ["topup", "withdrawal"] },
          status: { type: "string", enum: ["pending", "approved", "rejected"] },
          ownerType: { type: "string", enum: ["user", "shop", "platform"] },
          ownerId: { type: "integer" },
          walletId: { type: "integer" },
          amountNdp: { type: "integer", minimum: 1 },
          idempotencyKey: { type: "string", maxLength: 160 },
          bankReference: { type: ["string", "null"], maxLength: 120 },
          note: { type: ["string", "null"], maxLength: 500 },
          requestedById: { type: "integer" },
          reviewedById: { type: ["integer", "null"] },
          reviewedAt: { type: ["string", "null"], format: "date-time" },
          reviewNote: { type: ["string", "null"], maxLength: 500 },
          ledgerTransactionId: { type: ["integer", "null"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      WalletLedger: {
        type: "object",
        required: [
          "id",
          "transactionId",
          "walletId",
          "direction",
          "amount",
          "availableDelta",
          "frozenDelta",
          "availableBalanceAfter",
          "frozenBalanceAfter",
          "reason",
          "createdAt"
        ],
        properties: {
          id: { type: "integer" },
          transactionId: { type: "integer" },
          walletId: { type: "integer" },
          direction: {
            type: "string",
            enum: ["available_credit", "available_debit", "freeze", "unfreeze", "frozen_debit"]
          },
          amount: { type: "integer" },
          availableDelta: { type: "integer" },
          frozenDelta: { type: "integer" },
          availableBalanceAfter: { type: "integer" },
          frozenBalanceAfter: { type: "integer" },
          reason: { type: "string" },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      LedgerTransaction: {
        type: "object",
        required: [
          "id",
          "transactionNo",
          "idempotencyKey",
          "type",
          "status",
          "referenceType",
          "referenceId",
          "actorUserId",
          "amount",
          "currency",
          "metadata",
          "createdAt",
          "updatedAt",
          "entries"
        ],
        properties: {
          id: { type: "integer" },
          transactionNo: { type: "string" },
          idempotencyKey: { type: "string" },
          type: {
            type: "string",
            enum: [
              "booking_accept_freeze",
              "booking_cancel_unfreeze",
              "booking_complete_settlement",
              "booking_merchant_cancel_compensation",
              "manual_topup_approved",
              "manual_withdrawal_approved",
              "seed_credit",
              "affiliate_task_budget_freeze",
              "affiliate_task_budget_release",
              "affiliate_reward_settlement"
            ]
          },
          status: { type: "string", enum: ["applied"] },
          referenceType: { type: "string" },
          referenceId: { type: "integer" },
          actorUserId: { type: ["integer", "null"] },
          amount: { type: "integer" },
          currency: { type: "string", enum: ["NDP"] },
          metadata: {},
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          entries: { type: "array", items: { $ref: "#/components/schemas/WalletLedger" } }
        }
      },
      FinanceReconciliation: {
        type: "object",
        required: [
          "id",
          "transactionId",
          "transactionNo",
          "referenceType",
          "referenceId",
          "status",
          "currency",
          "expectedAmount",
          "actualAmount",
          "differenceAmount",
          "exportedAt",
          "createdAt",
          "updatedAt"
        ],
        properties: {
          id: { type: "integer" },
          transactionId: { type: "integer" },
          transactionNo: { type: "string" },
          referenceType: { type: "string" },
          referenceId: { type: "integer" },
          status: { type: "string", enum: ["pending", "exported"] },
          currency: { type: "string", enum: ["NDP"] },
          expectedAmount: { type: "integer" },
          actualAmount: { type: "integer" },
          differenceAmount: { type: "integer" },
          exportedAt: { type: ["string", "null"], format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      FinanceReconciliationExport: {
        type: "object",
        required: ["filename", "contentType", "csv"],
        properties: {
          filename: { type: "string" },
          contentType: { type: "string", enum: ["text/csv"] },
          csv: { type: "string" }
        }
      },
      PayrollCsvExport: {
        type: "object",
        required: ["filename", "contentType", "csv"],
        properties: {
          filename: { type: "string" },
          contentType: { type: "string", enum: ["text/csv; charset=utf-8"] },
          csv: { type: "string" }
        }
      },
      FeeCalculationResult: {
        type: "object",
        required: [
          "orderType",
          "stage",
          "feeType",
          "payerType",
          "baseFeeNdp",
          "finalFeeNdp",
          "holdAmountNdp",
          "appliedRuleIds",
          "explanation"
        ],
        properties: {
          bookingOrderId: { type: ["integer", "null"] },
          orderType: { type: "string", enum: ["booking", "request"] },
          stage: { type: "string", enum: ["preview", "hold", "capture", "release", "reversal"] },
          feeType: {
            type: "string",
            enum: ["b_platform_fee", "c_request_dispatch_fee", "user_reward", "penalty"]
          },
          payerType: { type: "string", enum: ["shop", "cast", "user", "platform", "split"] },
          payerId: { type: ["integer", "null"] },
          baseFeeNdp: { type: "integer" },
          tierAdjustmentNdp: { type: "integer" },
          timeAdjustmentNdp: { type: "integer" },
          campaignDiscountNdp: { type: "integer" },
          finalFeeNdp: { type: "integer" },
          holdAmountNdp: { type: "integer" },
          completedOrderOrdinalInPeriod: { type: ["integer", "null"] },
          appliedRuleIds: { type: "array", items: { type: "string" } },
          explanation: { type: "array", items: { type: "string" } },
          calculationLogId: { type: ["integer", "null"] }
        }
      },
      ShopFinanceAdjustmentRule: {
        type: "object",
        required: ["id", "name", "triggerType", "threshold", "amountJpy", "active"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          triggerType: {
            type: "string",
            enum: [
              "monthly_order_count",
              "monthly_service_gmv",
              "rating_average",
              "late_cancellation_count",
              "rating_average_below"
            ]
          },
          threshold: { type: "number" },
          amountJpy: { type: "integer" },
          active: { type: "boolean" }
        }
      },
      ShopFinanceRuleSet: {
        type: "object",
        required: [
          "id",
          "shopId",
          "name",
          "status",
          "wageMode",
          "baseSalaryJpy",
          "hourlyRateJpy",
          "dailyRateJpy",
          "fixedOrderPayJpy",
          "commissionRatePercent",
          "guaranteedMinimumJpy",
          "ndpFeeBearer",
          "technicianNdpSharePercent",
          "bonusRules",
          "deductionRules",
          "createdAt",
          "updatedAt"
        ],
        properties: {
          id: { type: "integer" },
          shopId: { type: "integer" },
          name: { type: "string" },
          status: { type: "string", enum: ["active", "archived"] },
          wageMode: {
            type: "string",
            enum: ["fixed_per_order", "commission", "base_plus_commission", "hourly"]
          },
          baseSalaryJpy: { type: "integer" },
          hourlyRateJpy: { type: "integer" },
          dailyRateJpy: { type: "integer" },
          fixedOrderPayJpy: { type: "integer" },
          commissionRatePercent: { type: "number" },
          guaranteedMinimumJpy: { type: "integer" },
          ndpFeeBearer: { type: "string", enum: ["shop", "technician", "split"] },
          technicianNdpSharePercent: { type: "number" },
          bonusRules: {
            type: "array",
            items: { $ref: "#/components/schemas/ShopFinanceAdjustmentRule" }
          },
          deductionRules: {
            type: "array",
            items: { $ref: "#/components/schemas/ShopFinanceAdjustmentRule" }
          },
          effectiveFrom: { type: ["string", "null"], format: "date-time" },
          effectiveTo: { type: ["string", "null"], format: "date-time" },
          createdById: { type: ["integer", "null"] },
          updatedById: { type: ["integer", "null"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      ShopFinanceRulePreview: {
        type: "object",
        required: [
          "serviceAmountJpy",
          "platformFeeNdp",
          "basePayJpy",
          "commissionPayJpy",
          "minimumGuaranteeAdjustmentJpy",
          "bonusPayJpy",
          "deductionJpy",
          "technicianGrossIncomeJpy",
          "technicianNdpShareNdp",
          "shopNdpShareNdp",
          "technicianNetIncomeJpy",
          "shopGrossMarginJpy",
          "appliedBonusRules",
          "appliedDeductionRules",
          "explanation"
        ],
        properties: {
          serviceAmountJpy: { type: "integer" },
          platformFeeNdp: { type: "integer" },
          basePayJpy: { type: "integer" },
          commissionPayJpy: { type: "integer" },
          minimumGuaranteeAdjustmentJpy: { type: "integer" },
          bonusPayJpy: { type: "integer" },
          deductionJpy: { type: "integer" },
          technicianGrossIncomeJpy: { type: "integer" },
          technicianNdpShareNdp: { type: "integer" },
          shopNdpShareNdp: { type: "integer" },
          technicianNetIncomeJpy: { type: "integer" },
          shopGrossMarginJpy: { type: "integer" },
          appliedBonusRules: {
            type: "array",
            items: { $ref: "#/components/schemas/ShopFinanceAdjustmentRule" }
          },
          appliedDeductionRules: {
            type: "array",
            items: { $ref: "#/components/schemas/ShopFinanceAdjustmentRule" }
          },
          explanation: { type: "array", items: { type: "string" } }
        }
      },
      ShopFinanceRulePreviewResult: {
        type: "object",
        required: ["shopId", "ruleSet", "preview"],
        properties: {
          shopId: { type: "integer" },
          ruleSet: { $ref: "#/components/schemas/ShopFinanceRuleSet" },
          preview: { $ref: "#/components/schemas/ShopFinanceRulePreview" }
        }
      },
      MoneyTimelineEvent: {
        type: "object",
        required: ["type", "label", "actorType", "occurredAt", "status"],
        properties: {
          type: { type: "string" },
          label: { type: "string" },
          amountJpy: { type: "integer" },
          amountNdp: { type: "integer" },
          actorType: {
            type: "string",
            enum: ["system", "merchant", "backoffice", "customer", "technician"]
          },
          occurredAt: { type: "string", format: "date-time" },
          status: { type: "string" },
          metadata: { type: "object", additionalProperties: true }
        }
      },
      CompensationPreview: {
        type: "object",
        required: [
          "serviceAmountJpy",
          "platformFeeNdp",
          "basePayJpy",
          "commissionPayJpy",
          "minimumGuaranteeAdjustmentJpy",
          "bonusPayJpy",
          "deductionJpy",
          "technicianGrossIncomeJpy",
          "technicianNdpShareNdp",
          "shopNdpShareNdp",
          "technicianNetIncomeJpy",
          "shopEstimatedGrossProfitJpy",
          "appliedBonusRules",
          "appliedDeductionRules",
          "explanation"
        ],
        properties: {
          serviceAmountJpy: { type: "integer" },
          platformFeeNdp: { type: "integer" },
          basePayJpy: { type: "integer" },
          commissionPayJpy: { type: "integer" },
          minimumGuaranteeAdjustmentJpy: { type: "integer" },
          bonusPayJpy: { type: "integer" },
          deductionJpy: { type: "integer" },
          technicianGrossIncomeJpy: { type: "integer" },
          technicianNdpShareNdp: { type: "integer" },
          shopNdpShareNdp: { type: "integer" },
          technicianNetIncomeJpy: { type: "integer" },
          shopEstimatedGrossProfitJpy: { type: "integer" },
          appliedBonusRules: {
            type: "array",
            items: { $ref: "#/components/schemas/ShopFinanceAdjustmentRule" }
          },
          appliedDeductionRules: {
            type: "array",
            items: { $ref: "#/components/schemas/ShopFinanceAdjustmentRule" }
          },
          explanation: { type: "array", items: { type: "string" } }
        }
      },
      TechnicianCompensationProfile: {
        type: "object",
        required: [
          "id",
          "sourceType",
          "shopId",
          "technicianProfileId",
          "name",
          "status",
          "version",
          "wageMode",
          "commissionRatePercent",
          "ndpFeeBearer",
          "bonusRules",
          "deductionRules",
          "createdAt",
          "updatedAt"
        ],
        properties: {
          id: { type: "integer" },
          sourceType: { type: "string", enum: ["shop_default", "technician_override"] },
          shopId: { type: "integer" },
          technicianProfileId: { type: ["integer", "null"] },
          name: { type: "string" },
          status: { type: "string", enum: ["active", "archived"] },
          version: { type: "integer" },
          wageMode: {
            type: "string",
            enum: ["fixed_per_order", "commission", "base_plus_commission", "hourly"]
          },
          baseSalaryJpy: { type: "integer" },
          hourlyRateJpy: { type: "integer" },
          dailyRateJpy: { type: "integer" },
          fixedOrderPayJpy: { type: "integer" },
          commissionRatePercent: { type: "number" },
          guaranteedMinimumJpy: { type: "integer" },
          ndpFeeBearer: { type: "string", enum: ["shop", "technician", "split"] },
          technicianNdpSharePercent: { type: "number" },
          bonusRules: {
            type: "array",
            items: { $ref: "#/components/schemas/ShopFinanceAdjustmentRule" }
          },
          deductionRules: {
            type: "array",
            items: { $ref: "#/components/schemas/ShopFinanceAdjustmentRule" }
          },
          effectiveFrom: { type: ["string", "null"], format: "date-time" },
          effectiveTo: { type: ["string", "null"], format: "date-time" },
          createdById: { type: ["integer", "null"] },
          updatedById: { type: ["integer", "null"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      CompensationProfilePreviewResult: {
        type: "object",
        required: ["shopId", "technicianProfileId", "profile", "preview"],
        properties: {
          shopId: { type: "integer" },
          technicianProfileId: { type: "integer" },
          profile: { $ref: "#/components/schemas/TechnicianCompensationProfile" },
          preview: { $ref: "#/components/schemas/CompensationPreview" }
        }
      },
      OrderFinanceDetail: {
        type: "object",
        required: [
          "bookingOrderId",
          "orderType",
          "orderNo",
          "shopId",
          "estimatedServiceGmvJpy",
          "serviceIncomeStatus",
          "paymentChannel",
          "moneyTimeline",
          "moneyTimelineStatus"
        ],
        properties: {
          bookingOrderId: { type: "integer" },
          orderType: { type: "string", enum: ["booking", "request"] },
          orderNo: { type: "string" },
          orderStatus: { type: "string" },
          shopId: { type: "integer" },
          shopName: { type: "string" },
          technicianProfileId: { type: ["integer", "null"] },
          technicianName: { type: ["string", "null"] },
          serviceName: { type: "string" },
          estimatedServiceGmvJpy: { type: "integer" },
          platformCollectedServiceAmountJpy: { type: "integer" },
          offlineReportedServiceAmountJpy: { type: "integer" },
          unknownOrUnreportedServiceAmountJpy: { type: "integer" },
          paymentChannel: { type: "string" },
          serviceIncomeStatus: { type: "string", enum: ["unreported", "reported", "confirmed"] },
          platformNdpRevenue: { type: "integer" },
          cRequestFeeHoldNdp: { type: "integer" },
          cRequestFeeActualNdp: { type: "integer" },
          requestFeeNdpRevenue: { type: "integer" },
          userRewardNdpCost: { type: "integer" },
          pendingHoldNdp: { type: "integer" },
          campaignDiscountNdp: { type: "integer" },
          releasedNdp: { type: "integer" },
          penaltyNdp: { type: "integer" },
          compensationToUserNdp: { type: "integer" },
          appliedFeeRuleIds: { type: "array", items: { type: "string" } },
          moneyTimeline: {
            type: "array",
            items: { $ref: "#/components/schemas/MoneyTimelineEvent" }
          },
          moneyTimelineStatus: { type: "string" },
          technicianIncomePreview: {
            oneOf: [{ $ref: "#/components/schemas/CompensationPreview" }, { type: "null" }]
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      PayslipLine: {
        type: "object",
        required: ["id", "lineType", "title", "amountJpy", "sourceType"],
        properties: {
          id: { type: "integer" },
          payslipId: { type: "integer" },
          lineType: {
            type: "string",
            enum: [
              "base_salary",
              "commission",
              "bonus",
              "allowance",
              "deduction",
              "adjustment",
              "guarantee_topup",
              "platform_fee_share_deduction"
            ]
          },
          title: { type: "string" },
          amountJpy: { type: "integer" },
          quantity: { type: "number" },
          unitAmountJpy: { type: "integer" },
          formulaText: { type: ["string", "null"] },
          sourceType: {
            type: "string",
            enum: ["order", "attendance", "rule", "manual", "payout", "adjustment"]
          },
          sourceId: { type: ["integer", "null"] },
          ruleId: { type: ["string", "null"] },
          orderId: { type: ["integer", "null"] },
          explanation: { type: ["string", "null"] },
          createdById: { type: ["integer", "null"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      PayoutRecord: {
        type: "object",
        required: ["id", "payslipId", "amountJpy", "payoutMethod", "payoutDate", "status"],
        properties: {
          id: { type: "integer" },
          payslipId: { type: "integer" },
          shopId: { type: "integer" },
          technicianProfileId: { type: "integer" },
          amountJpy: { type: "integer" },
          payoutMethod: {
            type: "string",
            enum: ["bank_transfer", "cash", "ndp", "external", "mixed", "other"]
          },
          payoutDate: { type: "string", format: "date-time" },
          referenceNo: { type: ["string", "null"] },
          proofUrl: { type: ["string", "null"] },
          note: { type: ["string", "null"] },
          status: { type: "string", enum: ["pending", "completed", "failed", "cancelled"] },
          confirmedByTechnician: { type: "boolean" },
          technicianConfirmedAt: { type: ["string", "null"], format: "date-time" },
          createdById: { type: ["integer", "null"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      Payslip: {
        type: "object",
        required: [
          "id",
          "payRunId",
          "shopId",
          "technicianProfileId",
          "status",
          "netPayJpy",
          "lines",
          "payoutRecords"
        ],
        properties: {
          id: { type: "integer" },
          payRunId: { type: "integer" },
          shopId: { type: "integer" },
          shopName: { type: "string" },
          technicianProfileId: { type: "integer" },
          technicianName: { type: "string" },
          technicianUserId: { type: ["integer", "null"] },
          compensationProfileId: { type: ["integer", "null"] },
          periodStart: { type: "string", format: "date-time" },
          periodEnd: { type: "string", format: "date-time" },
          status: {
            type: "string",
            enum: [
              "draft",
              "reviewing",
              "published",
              "confirmed",
              "disputed",
              "approved",
              "scheduled",
              "paid",
              "locked"
            ]
          },
          disputeStatus: { type: "string", enum: ["none", "confirmed", "disputed", "resolved"] },
          disputeReason: { type: ["string", "null"] },
          baseSalaryJpy: { type: "integer" },
          annualSalaryProratedJpy: { type: "integer" },
          dailyWageJpy: { type: "integer" },
          hourlyWageJpy: { type: "integer" },
          commissionJpy: { type: "integer" },
          guaranteeTopupJpy: { type: "integer" },
          bonusJpy: { type: "integer" },
          allowanceJpy: { type: "integer" },
          deductionJpy: { type: "integer" },
          platformFeeShareDeductionJpy: { type: "integer" },
          netPayJpy: { type: "integer" },
          paidAmountJpy: { type: "integer" },
          unpaidAmountJpy: { type: "integer" },
          confirmedAt: { type: ["string", "null"], format: "date-time" },
          disputedAt: { type: ["string", "null"], format: "date-time" },
          disputeResolvedAt: { type: ["string", "null"], format: "date-time" },
          disputeResolvedById: { type: ["integer", "null"] },
          disputeResolutionNote: { type: ["string", "null"], maxLength: 500 },
          lines: { type: "array", items: { $ref: "#/components/schemas/PayslipLine" } },
          payoutRecords: { type: "array", items: { $ref: "#/components/schemas/PayoutRecord" } }
        }
      },
      PayRun: {
        type: "object",
        required: [
          "id",
          "shopId",
          "periodStart",
          "periodEnd",
          "status",
          "totalNetPayJpy",
          "payslips"
        ],
        properties: {
          id: { type: "integer" },
          shopId: { type: "integer" },
          shopName: { type: "string" },
          periodStart: { type: "string", format: "date-time" },
          periodEnd: { type: "string", format: "date-time" },
          status: { type: "string" },
          totalBaseSalaryJpy: { type: "integer" },
          totalCommissionJpy: { type: "integer" },
          totalBonusJpy: { type: "integer" },
          totalAllowanceJpy: { type: "integer" },
          totalDeductionJpy: { type: "integer" },
          totalNetPayJpy: { type: "integer" },
          paidAmountJpy: { type: "integer" },
          unpaidAmountJpy: { type: "integer" },
          generatedById: { type: ["integer", "null"] },
          approvedById: { type: ["integer", "null"] },
          lockedAt: { type: ["string", "null"], format: "date-time" },
          payslips: { type: "array", items: { $ref: "#/components/schemas/Payslip" } }
        }
      },
      PayrollAdjustmentRequest: {
        type: "object",
        required: [
          "id",
          "shopId",
          "technicianProfileId",
          "periodStart",
          "periodEnd",
          "adjustmentType",
          "title",
          "amountJpy",
          "reason",
          "status"
        ],
        properties: {
          id: { type: "integer" },
          shopId: { type: "integer" },
          shopName: { type: "string" },
          technicianProfileId: { type: "integer" },
          technicianName: { type: "string" },
          technicianUserId: { type: ["integer", "null"] },
          periodStart: { type: "string", format: "date-time" },
          periodEnd: { type: "string", format: "date-time" },
          adjustmentType: {
            type: "string",
            enum: ["bonus", "allowance", "deduction", "adjustment"]
          },
          title: { type: "string" },
          amountJpy: { type: "integer" },
          reason: { type: "string" },
          proofUrl: { type: ["string", "null"] },
          status: {
            type: "string",
            enum: ["draft", "submitted", "approved", "rejected", "applied"]
          },
          requestedById: { type: "integer" },
          submittedAt: { type: ["string", "null"], format: "date-time" },
          approvedById: { type: ["integer", "null"] },
          approvedAt: { type: ["string", "null"], format: "date-time" },
          rejectedById: { type: ["integer", "null"] },
          rejectedAt: { type: ["string", "null"], format: "date-time" },
          rejectionReason: { type: ["string", "null"] },
          appliedPayRunId: { type: ["integer", "null"] },
          appliedPayslipLineId: { type: ["integer", "null"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      AffiliateProfileChannel: {
        type: "object",
        additionalProperties: false,
        required: [
          "channelId",
          "platform",
          "customLabel",
          "homepageUrl",
          "sortOrder",
          "createdAt",
          "updatedAt"
        ],
        properties: {
          channelId: { type: "integer", minimum: 1 },
          platform: {
            type: "string",
            enum: ["x", "instagram", "youtube", "tiktok", "custom"]
          },
          customLabel: { type: ["string", "null"], minLength: 1, maxLength: 60 },
          homepageUrl: { type: "string", format: "uri", maxLength: 500 },
          sortOrder: { type: "integer", minimum: 0, maximum: 1000 },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      AffiliateProfile: {
        type: "object",
        additionalProperties: false,
        required: [
          "profileId",
          "needoId",
          "displayName",
          "avatarUrl",
          "affiliateStatus",
          "cooperationStatus",
          "version",
          "bio",
          "strengths",
          "serviceAreas",
          "channels",
          "updatedAt"
        ],
        properties: {
          profileId: { type: "integer", minimum: 1 },
          needoId: { type: "string", pattern: "^(?:u|needo)[0-9]{10}$" },
          displayName: { type: "string", minLength: 1 },
          avatarUrl: { type: ["string", "null"], format: "uri" },
          affiliateStatus: { type: "string", enum: ["active", "suspended", "closed"] },
          cooperationStatus: {
            type: "string",
            enum: ["available", "selective", "unavailable"]
          },
          version: { type: "integer", minimum: 1 },
          bio: { type: ["string", "null"], maxLength: 1000 },
          strengths: {
            type: "array",
            maxItems: 10,
            items: { type: "string", minLength: 1, maxLength: 40 }
          },
          serviceAreas: {
            type: "array",
            maxItems: 10,
            items: { type: "string", minLength: 1, maxLength: 80 }
          },
          channels: {
            type: "array",
            maxItems: 10,
            items: { $ref: "#/components/schemas/AffiliateProfileChannel" }
          },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      AffiliateProfileUpdate: {
        type: "object",
        additionalProperties: false,
        minProperties: 2,
        required: ["expectedVersion"],
        properties: {
          expectedVersion: { type: "integer", minimum: 1 },
          bio: { type: ["string", "null"], maxLength: 1000 },
          strengths: {
            type: "array",
            maxItems: 10,
            items: { type: "string", minLength: 1, maxLength: 40 }
          },
          serviceAreas: {
            type: "array",
            maxItems: 10,
            items: { type: "string", minLength: 1, maxLength: 80 }
          },
          cooperationStatus: {
            type: "string",
            enum: ["available", "selective", "unavailable"]
          }
        }
      },
      AffiliateChannelCreate: {
        type: "object",
        additionalProperties: false,
        required: ["expectedProfileVersion", "platform", "homepageUrl"],
        properties: {
          expectedProfileVersion: { type: "integer", minimum: 1 },
          platform: {
            type: "string",
            enum: ["x", "instagram", "youtube", "tiktok", "custom"]
          },
          customLabel: { type: ["string", "null"], minLength: 1, maxLength: 60 },
          homepageUrl: { type: "string", format: "uri", maxLength: 500 },
          sortOrder: { type: "integer", minimum: 0, maximum: 1000, default: 0 }
        }
      },
      AffiliateChannelUpdate: {
        type: "object",
        additionalProperties: false,
        minProperties: 2,
        required: ["expectedProfileVersion"],
        properties: {
          expectedProfileVersion: { type: "integer", minimum: 1 },
          platform: {
            type: "string",
            enum: ["x", "instagram", "youtube", "tiktok", "custom"]
          },
          customLabel: { type: ["string", "null"], minLength: 1, maxLength: 60 },
          homepageUrl: { type: "string", format: "uri", maxLength: 500 },
          sortOrder: { type: "integer", minimum: 0, maximum: 1000 }
        }
      },
      AffiliateIdentityActivation: {
        type: "object",
        additionalProperties: false,
        required: ["contractAcceptance", "affiliate"],
        properties: {
          contractAcceptance: {
            type: "object",
            additionalProperties: false,
            required: [
              "id",
              "contractType",
              "contractVersion",
              "contentHash",
              "acceptedAt",
              "receiptId"
            ],
            properties: {
              id: { type: "integer", minimum: 1 },
              contractType: { type: "string", enum: ["affiliate"] },
              contractVersion: { type: "string", minLength: 1, maxLength: 80 },
              contentHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
              acceptedAt: { type: "string", format: "date-time" },
              receiptId: { type: "string", minLength: 1, maxLength: 191 }
            }
          },
          affiliate: {
            type: "object",
            additionalProperties: false,
            required: ["affiliateStatus", "needoId", "profileId"],
            properties: {
              affiliateStatus: { type: "string", enum: ["active", "suspended", "closed"] },
              needoId: { type: "string", pattern: "^(?:u|needo)[0-9]{10}$" },
              profileId: { type: "integer", minimum: 1 }
            }
          }
        }
      },
      AffiliateTaskShopSnapshot: {
        type: "object",
        required: ["id", "shopId", "shopNameSnapshot"],
        properties: {
          id: { type: "integer", minimum: 1 },
          shopId: { type: "integer", minimum: 1 },
          shopNameSnapshot: { type: "string", maxLength: 160 }
        }
      },
      AffiliateTaskServiceSnapshot: {
        type: "object",
        required: ["id", "shopId", "serviceId", "serviceNameSnapshot", "servicePriceJpySnapshot"],
        properties: {
          id: { type: "integer", minimum: 1 },
          shopId: { type: "integer", minimum: 1 },
          serviceId: { type: "integer", minimum: 1 },
          serviceNameSnapshot: { type: "string", maxLength: 160 },
          servicePriceJpySnapshot: { type: "integer", minimum: 0 }
        }
      },
      AffiliateBudgetReservation: {
        type: ["object", "null"],
        required: [
          "id",
          "taskId",
          "walletId",
          "totalFrozenNdp",
          "allocatedNdp",
          "capturedNdp",
          "releasedNdp",
          "status",
          "idempotencyKey",
          "frozenAt",
          "releasedAt"
        ],
        properties: {
          id: { type: "integer", minimum: 1 },
          taskId: { type: "integer", minimum: 1 },
          walletId: { type: "integer", minimum: 1 },
          totalFrozenNdp: { type: "integer", minimum: 0 },
          allocatedNdp: { type: "integer", minimum: 0 },
          capturedNdp: { type: "integer", minimum: 0 },
          releasedNdp: { type: "integer", minimum: 0 },
          status: { type: "string", enum: ["active", "released", "exhausted"] },
          idempotencyKey: { type: "string", maxLength: 180 },
          frozenAt: { type: "string", format: "date-time" },
          releasedAt: { type: ["string", "null"], format: "date-time" }
        }
      },
      AffiliateTask: {
        type: "object",
        required: [
          "id",
          "taskCode",
          "lineageKey",
          "version",
          "lockVersion",
          "publisherType",
          "name",
          "rewardNdpPerCompletedOrder",
          "totalBudgetNdp",
          "reservedBudgetNdp",
          "allocatedBudgetNdp",
          "settledBudgetNdp",
          "releasedBudgetNdp",
          "customerDiscountType",
          "claimStartsAt",
          "claimEndsAt",
          "taskStartsAt",
          "taskEndsAt",
          "serviceScopeMode",
          "status",
          "shops",
          "services",
          "budgetReservation",
          "createdAt",
          "updatedAt"
        ],
        properties: {
          id: { type: "integer", minimum: 1 },
          taskCode: { type: "string", maxLength: 80 },
          lineageKey: { type: "string", maxLength: 80 },
          version: { type: "integer", minimum: 1 },
          lockVersion: { type: "integer", minimum: 1 },
          publisherType: { type: "string", enum: ["merchant_account", "shop"] },
          publisherMerchantAccountId: { type: ["integer", "null"], minimum: 1 },
          publisherShopId: { type: ["integer", "null"], minimum: 1 },
          name: affiliateEditableTaskProperties.name,
          description: affiliateEditableTaskProperties.description,
          coverMediaAssetId: affiliateEditableTaskProperties.coverMediaAssetId,
          rewardNdpPerCompletedOrder: affiliateEditableTaskProperties.rewardNdpPerCompletedOrder,
          totalBudgetNdp: affiliateEditableTaskProperties.totalBudgetNdp,
          customerDiscountType: affiliateEditableTaskProperties.customerDiscountType,
          fixedDiscountJpy: affiliateEditableTaskProperties.fixedDiscountJpy,
          discountRateBps: affiliateEditableTaskProperties.discountRateBps,
          discountCapJpy: affiliateEditableTaskProperties.discountCapJpy,
          minimumOrderAmountJpy: affiliateEditableTaskProperties.minimumOrderAmountJpy,
          claimStartsAt: affiliateEditableTaskProperties.claimStartsAt,
          claimEndsAt: affiliateEditableTaskProperties.claimEndsAt,
          taskStartsAt: affiliateEditableTaskProperties.taskStartsAt,
          taskEndsAt: affiliateEditableTaskProperties.taskEndsAt,
          attributionWindowDays: affiliateEditableTaskProperties.attributionWindowDays,
          maxCompletedOrdersPerClaim: affiliateEditableTaskProperties.maxCompletedOrdersPerClaim,
          maxCompletedOrdersPerCustomer:
            affiliateEditableTaskProperties.maxCompletedOrdersPerCustomer,
          serviceScopeMode: affiliateEditableTaskProperties.serviceScopeMode,
          reservedBudgetNdp: { type: "integer", minimum: 0 },
          allocatedBudgetNdp: { type: "integer", minimum: 0 },
          settledBudgetNdp: { type: "integer", minimum: 0 },
          releasedBudgetNdp: { type: "integer", minimum: 0 },
          status: { type: "string", enum: affiliateTaskStatuses },
          reviewedById: { type: ["integer", "null"], minimum: 1 },
          reviewedAt: { type: ["string", "null"], format: "date-time" },
          rejectionReason: { type: ["string", "null"], maxLength: 500 },
          submittedAt: { type: ["string", "null"], format: "date-time" },
          activatedAt: { type: ["string", "null"], format: "date-time" },
          shops: {
            type: "array",
            items: { $ref: "#/components/schemas/AffiliateTaskShopSnapshot" }
          },
          services: {
            type: "array",
            items: { $ref: "#/components/schemas/AffiliateTaskServiceSnapshot" }
          },
          budgetReservation: { $ref: "#/components/schemas/AffiliateBudgetReservation" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      AffiliateTaskCreate: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["publisherType", ...affiliateEditableTaskRequired],
            properties: {
              publisherType: { type: "string", const: "shop" },
              ...affiliateEditableTaskProperties
            }
          },
          {
            type: "object",
            additionalProperties: false,
            required: [
              "publisherType",
              "merchantAccountId",
              "shopIds",
              ...affiliateEditableTaskRequired
            ],
            properties: {
              publisherType: { type: "string", const: "merchant_account" },
              merchantAccountId: { type: "integer", minimum: 1 },
              shopIds: {
                type: "array",
                minItems: 1,
                maxItems: 1000,
                uniqueItems: true,
                items: { type: "integer", minimum: 1 }
              },
              ...affiliateEditableTaskProperties
            }
          }
        ],
        discriminator: { propertyName: "publisherType" }
      },
      AffiliateTaskUpdate: {
        type: "object",
        additionalProperties: false,
        required: ["lockVersion", ...affiliateEditableTaskRequired],
        properties: {
          lockVersion: { type: "integer", minimum: 1 },
          shopIds: {
            type: "array",
            minItems: 1,
            maxItems: 1000,
            uniqueItems: true,
            items: { type: "integer", minimum: 1 }
          },
          ...affiliateEditableTaskProperties
        }
      },
      AffiliateTaskPage: {
        type: "object",
        required: ["list", "total", "page", "page_size"],
        properties: {
          list: {
            type: "array",
            items: { $ref: "#/components/schemas/AffiliateTask" }
          },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          page_size: { type: "integer", minimum: 1, maximum: 100 }
        }
      },
      AffiliateMarketplaceTask: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "taskCode",
          "name",
          "description",
          "coverMediaAssetId",
          "rewardNdpPerCompletedOrder",
          "customerDiscountType",
          "fixedDiscountJpy",
          "discountRateBps",
          "discountCapJpy",
          "minimumOrderAmountJpy",
          "claimStartsAt",
          "claimEndsAt",
          "taskStartsAt",
          "taskEndsAt",
          "attributionWindowDays",
          "maxCompletedOrdersPerClaim",
          "maxCompletedOrdersPerCustomer",
          "status",
          "claimable",
          "shops",
          "services",
          "createdAt",
          "updatedAt"
        ],
        properties: {
          id: { type: "integer", minimum: 1 },
          taskCode: { type: "string", maxLength: 80 },
          name: affiliateEditableTaskProperties.name,
          description: affiliateEditableTaskProperties.description,
          coverMediaAssetId: affiliateEditableTaskProperties.coverMediaAssetId,
          rewardNdpPerCompletedOrder: affiliateEditableTaskProperties.rewardNdpPerCompletedOrder,
          customerDiscountType: affiliateEditableTaskProperties.customerDiscountType,
          fixedDiscountJpy: affiliateEditableTaskProperties.fixedDiscountJpy,
          discountRateBps: affiliateEditableTaskProperties.discountRateBps,
          discountCapJpy: affiliateEditableTaskProperties.discountCapJpy,
          minimumOrderAmountJpy: affiliateEditableTaskProperties.minimumOrderAmountJpy,
          claimStartsAt: affiliateEditableTaskProperties.claimStartsAt,
          claimEndsAt: affiliateEditableTaskProperties.claimEndsAt,
          taskStartsAt: affiliateEditableTaskProperties.taskStartsAt,
          taskEndsAt: affiliateEditableTaskProperties.taskEndsAt,
          attributionWindowDays: affiliateEditableTaskProperties.attributionWindowDays,
          maxCompletedOrdersPerClaim: affiliateEditableTaskProperties.maxCompletedOrdersPerClaim,
          maxCompletedOrdersPerCustomer:
            affiliateEditableTaskProperties.maxCompletedOrdersPerCustomer,
          status: { type: "string", enum: affiliateTaskStatuses },
          claimable: { type: "boolean" },
          shops: {
            type: "array",
            minItems: 1,
            items: { $ref: "#/components/schemas/AffiliateTaskShopSnapshot" }
          },
          services: {
            type: "array",
            minItems: 1,
            items: { $ref: "#/components/schemas/AffiliateTaskServiceSnapshot" }
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      AffiliateClaim: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "taskId",
          "publicCode",
          "promotionUrl",
          "status",
          "claimedAt",
          "expiresAt",
          "clickCount",
          "codeUseCount",
          "attributedOrderCount",
          "completedOrderCount",
          "settledRewardNdp",
          "task"
        ],
        properties: {
          id: { type: "integer", minimum: 1 },
          taskId: { type: "integer", minimum: 1 },
          publicCode: { type: "string", minLength: 1, maxLength: 80 },
          promotionUrl: { type: "string", format: "uri" },
          status: { type: "string", enum: ["active", "expired", "revoked"] },
          claimedAt: { type: "string", format: "date-time" },
          expiresAt: { type: "string", format: "date-time" },
          clickCount: { type: "integer", minimum: 0 },
          codeUseCount: { type: "integer", minimum: 0 },
          attributedOrderCount: { type: "integer", minimum: 0 },
          completedOrderCount: { type: "integer", minimum: 0 },
          settledRewardNdp: { type: "integer", minimum: 0 },
          task: { $ref: "#/components/schemas/AffiliateMarketplaceTask" }
        }
      },
      AffiliateResolvedLink: {
        type: "object",
        additionalProperties: false,
        required: ["claimId", "publicCode", "expiresAt", "task"],
        properties: {
          claimId: { type: "integer", minimum: 1 },
          publicCode: { type: "string", minLength: 1, maxLength: 80 },
          expiresAt: { type: "string", format: "date-time" },
          task: { $ref: "#/components/schemas/AffiliateMarketplaceTask" }
        }
      },
      AffiliateCheckoutSummary: {
        type: "object",
        additionalProperties: false,
        required: [
          "taskId",
          "publicCode",
          "source",
          "originalPriceJpy",
          "customerDiscountJpy",
          "finalPriceJpy",
          "rewardAllocatedNdp",
          "attributionStatus"
        ],
        properties: {
          taskId: { type: "integer", minimum: 1 },
          publicCode: { type: "string", minLength: 1, maxLength: 40 },
          source: { type: "string", enum: ["code", "url"] },
          originalPriceJpy: { type: "integer", minimum: 0 },
          customerDiscountJpy: { type: "integer", minimum: 0 },
          finalPriceJpy: { type: "integer", minimum: 0 },
          rewardAllocatedNdp: { type: "integer", minimum: 1 },
          attributionStatus: {
            type: "string",
            enum: ["attributed", "qualified", "settled", "invalidated", "reversed"]
          }
        }
      },
      AffiliateCodeValidation: {
        type: "object",
        additionalProperties: false,
        required: [
          "taskId",
          "publicCode",
          "source",
          "originalPriceJpy",
          "customerDiscountJpy",
          "finalPriceJpy",
          "rewardAllocatedNdp",
          "taskStartsAt",
          "taskEndsAt"
        ],
        properties: {
          taskId: { type: "integer", minimum: 1 },
          publicCode: { type: "string", minLength: 1, maxLength: 40 },
          source: { type: "string", enum: ["code"] },
          originalPriceJpy: { type: "integer", minimum: 0 },
          customerDiscountJpy: { type: "integer", minimum: 0 },
          finalPriceJpy: { type: "integer", minimum: 0 },
          rewardAllocatedNdp: { type: "integer", minimum: 1 },
          taskStartsAt: { type: "string", format: "date-time" },
          taskEndsAt: { type: "string", format: "date-time" }
        }
      },
      AffiliateMarketplaceTaskPage: {
        type: "object",
        required: ["list", "total", "page", "page_size"],
        properties: {
          list: {
            type: "array",
            items: { $ref: "#/components/schemas/AffiliateMarketplaceTask" }
          },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          page_size: { type: "integer", minimum: 1, maximum: 100 }
        }
      },
      MerchantEmployeeShop: {
        type: "object",
        additionalProperties: false,
        required: ["id", "publicId", "name"],
        properties: {
          id: { type: "integer", minimum: 1, readOnly: true },
          publicId: { type: "string", pattern: "^shop[0-9]{10}$" },
          name: { type: "string" }
        }
      },
      MerchantEmployeeAffiliation: {
        type: "object",
        additionalProperties: false,
        required: ["id", "relationshipType", "workStatus", "startsAt", "endsAt", "shop"],
        properties: {
          id: { type: "integer", minimum: 1, readOnly: true },
          relationshipType: { type: "string", enum: ["exclusive", "partner"] },
          workStatus: {
            type: "string",
            enum: ["active", "on_leave", "suspended", "ended"]
          },
          startsAt: { type: "string", format: "date-time" },
          endsAt: { type: ["string", "null"], format: "date-time" },
          shop: { $ref: "#/components/schemas/MerchantEmployeeShop" }
        }
      },
      MerchantEmployee: {
        type: "object",
        additionalProperties: false,
        required: [
          "needoId",
          "displayName",
          "avatarUrl",
          "email",
          "phone",
          "profileStatus",
          "verifiedAt",
          "affiliation"
        ],
        properties: {
          needoId: { type: "string", pattern: "^s[0-9]{10}$" },
          displayName: { type: "string" },
          avatarUrl: { type: ["string", "null"], format: "uri-reference" },
          email: { type: "string", format: "email" },
          phone: { type: ["string", "null"] },
          profileStatus: { type: "string" },
          verifiedAt: { type: ["string", "null"], format: "date-time" },
          affiliation: { $ref: "#/components/schemas/MerchantEmployeeAffiliation" }
        }
      },
      MerchantEmployeePage: {
        type: "object",
        additionalProperties: false,
        required: ["list", "total", "page", "page_size"],
        properties: {
          list: {
            type: "array",
            items: { $ref: "#/components/schemas/MerchantEmployee" }
          },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          page_size: { type: "integer", minimum: 1, maximum: 100 }
        }
      },
      MerchantEmployeeAffiliationInput: {
        type: "object",
        additionalProperties: false,
        required: ["relationshipType", "workStatus", "startsAt", "endsAt"],
        properties: {
          relationshipType: { type: "string", enum: ["exclusive", "partner"] },
          workStatus: {
            type: "string",
            enum: ["active", "on_leave", "suspended", "ended"]
          },
          startsAt: { type: "string", format: "date-time" },
          endsAt: {
            type: ["string", "null"],
            format: "date-time",
            description:
              "Required for ended relationships and null for active, on_leave, or suspended relationships"
          }
        }
      },
      AffiliateClaimPage: {
        type: "object",
        required: ["list", "total", "page", "page_size"],
        properties: {
          list: {
            type: "array",
            items: { $ref: "#/components/schemas/AffiliateClaim" }
          },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          page_size: { type: "integer", minimum: 1, maximum: 100 }
        }
      }
    }
  },
  paths: {
    [`${config.API_PREFIX}/merchant-admin/employees`]: {
      get: {
        tags: ["Merchant Employees"],
        summary: "List employees affiliated with the authenticated shop",
        description:
          "The shop scope is taken only from the authenticated identity. shopId is not accepted as a request parameter.",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          {
            name: "pageSize",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100 }
          },
          {
            name: "keyword",
            in: "query",
            schema: { type: "string", maxLength: 100 }
          },
          {
            name: "relationshipType",
            in: "query",
            schema: { type: "string", enum: ["exclusive", "partner"] }
          },
          {
            name: "workStatus",
            in: "query",
            schema: { type: "string", enum: ["active", "on_leave", "suspended"] }
          }
        ],
        responses: {
          "200": jsonDataResponse("Paginated current-shop employee affiliations", {
            $ref: "#/components/schemas/MerchantEmployeePage"
          }),
          ...merchantEmployeeErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/employees/{needoId}`]: {
      get: {
        tags: ["Merchant Employees"],
        summary: "Read one employee affiliated with the authenticated shop",
        description:
          "The path accepts only the canonical technician S NeeDoID. Other-shop employees receive the same safe not-found response.",
        security: [{ bearerAuth: [] }],
        parameters: [merchantEmployeeNeedoIdParameter],
        responses: {
          "200": jsonDataResponse("Current-shop employee affiliation", {
            $ref: "#/components/schemas/MerchantEmployee"
          }),
          ...merchantEmployeeErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/employees/{needoId}/affiliation`]: {
      put: {
        tags: ["Merchant Employees"],
        summary: "Create, update, or end the authenticated shop affiliation",
        description:
          "The shop scope is derived from the authenticated identity. No automatic payroll payment or transfer is performed.",
        security: [{ bearerAuth: [] }],
        parameters: [merchantEmployeeNeedoIdParameter],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MerchantEmployeeAffiliationInput" }
            }
          }
        },
        responses: {
          "200": jsonDataResponse("Updated current-shop employee affiliation", {
            $ref: "#/components/schemas/MerchantEmployee"
          }),
          ...merchantEmployeeErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/affiliate/profile`]: {
      get: {
        tags: ["Affiliate Profile"],
        summary: "Get the authenticated affiliate's public profile",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": jsonDataResponse("Authenticated affiliate profile", {
            $ref: "#/components/schemas/AffiliateProfile"
          }),
          ...affiliateProfileErrorResponses
        }
      },
      patch: {
        tags: ["Affiliate Profile"],
        summary: "Update the authenticated affiliate's public profile using optimistic lock",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AffiliateProfileUpdate" }
            }
          }
        },
        responses: {
          "200": jsonDataResponse("Updated affiliate profile", {
            $ref: "#/components/schemas/AffiliateProfile"
          }),
          ...affiliateProfileErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/affiliate/profile/channels`]: {
      post: {
        tags: ["Affiliate Profile"],
        summary: "Add a validated external social homepage to the authenticated affiliate profile",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AffiliateChannelCreate" }
            }
          }
        },
        responses: {
          "200": jsonDataResponse("Affiliate profile with the created channel", {
            $ref: "#/components/schemas/AffiliateProfile"
          }),
          ...affiliateProfileErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/affiliate/profile/channels/{channelId}`]: {
      patch: {
        tags: ["Affiliate Profile"],
        summary: "Update an owned external social homepage using optimistic lock",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParameter("channelId")],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AffiliateChannelUpdate" }
            }
          }
        },
        responses: {
          "200": jsonDataResponse("Affiliate profile with the updated channel", {
            $ref: "#/components/schemas/AffiliateProfile"
          }),
          ...affiliateProfileErrorResponses
        }
      },
      delete: {
        tags: ["Affiliate Profile"],
        summary: "Soft-delete an owned external social homepage using optimistic lock",
        security: [{ bearerAuth: [] }],
        parameters: [
          idPathParameter("channelId"),
          {
            name: "expected_profile_version",
            in: "query",
            required: true,
            schema: { type: "integer", minimum: 1 }
          }
        ],
        responses: {
          "200": jsonDataResponse("Affiliate profile without the deleted channel", {
            $ref: "#/components/schemas/AffiliateProfile"
          }),
          ...affiliateProfileErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/affiliate/tasks`]: {
      get: {
        tags: ["Affiliate Task Publishing"],
        summary: "List affiliate tasks visible to the current shop or merchant account",
        security: [{ bearerAuth: [] }],
        parameters: affiliateTaskListParameters,
        responses: {
          "200": jsonDataResponse("Paginated publisher affiliate tasks", {
            $ref: "#/components/schemas/AffiliateTaskPage"
          }),
          ...affiliateTaskErrorResponses
        }
      },
      post: {
        tags: ["Affiliate Task Publishing"],
        summary: "Create an unfunded affiliate task draft",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AffiliateTaskCreate" }
            }
          }
        },
        responses: {
          "201": jsonDataResponse("Created affiliate task draft", {
            $ref: "#/components/schemas/AffiliateTask"
          }),
          ...affiliateTaskErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/affiliate/tasks/{taskId}`]: {
      get: {
        tags: ["Affiliate Task Publishing"],
        summary: "Get one affiliate task in publisher scope",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParameter("taskId")],
        responses: {
          "200": jsonDataResponse("Publisher affiliate task", {
            $ref: "#/components/schemas/AffiliateTask"
          }),
          ...affiliateTaskErrorResponses
        }
      },
      patch: {
        tags: ["Affiliate Task Publishing"],
        summary: "Replace editable fields on an unfunded draft using optimistic lock",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParameter("taskId")],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AffiliateTaskUpdate" }
            }
          }
        },
        responses: {
          "200": jsonDataResponse("Updated affiliate task draft", {
            $ref: "#/components/schemas/AffiliateTask"
          }),
          ...affiliateTaskErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/affiliate/tasks/{taskId}/submit`]: {
      post: {
        tags: ["Affiliate Task Publishing"],
        summary: "Freeze the full NDP budget and submit the task for operations review",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParameter("taskId")],
        responses: {
          "200": jsonDataResponse("Submitted affiliate task", {
            $ref: "#/components/schemas/AffiliateTask"
          }),
          ...affiliateTaskErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/affiliate/tasks`]: {
      get: {
        tags: ["Affiliate Marketplace"],
        summary: "List currently claimable affiliate tasks",
        security: [{ bearerAuth: [] }],
        parameters: affiliateMarketplaceListParameters,
        responses: {
          "200": jsonDataResponse("Paginated claimable affiliate tasks", {
            $ref: "#/components/schemas/AffiliateMarketplaceTaskPage"
          }),
          ...affiliateMarketplaceErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/affiliate/tasks/{taskId}`]: {
      get: {
        tags: ["Affiliate Marketplace"],
        summary: "Get one currently claimable affiliate task",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParameter("taskId")],
        responses: {
          "200": jsonDataResponse("Claimable affiliate task", {
            $ref: "#/components/schemas/AffiliateMarketplaceTask"
          }),
          ...affiliateMarketplaceErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/affiliate/tasks/{taskId}/claims`]: {
      post: {
        tags: ["Affiliate Marketplace"],
        summary: "Idempotently claim an affiliate task and issue a promotion code and URL",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParameter("taskId")],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                maxProperties: 0
              }
            }
          }
        },
        responses: {
          "200": jsonDataResponse("Existing idempotent affiliate claim", {
            $ref: "#/components/schemas/AffiliateClaim"
          }),
          "201": jsonDataResponse("Created affiliate claim", {
            $ref: "#/components/schemas/AffiliateClaim"
          }),
          ...affiliateMarketplaceErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/affiliate/claims`]: {
      get: {
        tags: ["Affiliate Marketplace"],
        summary: "List the current user's affiliate claims",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "status",
            in: "query",
            schema: { type: "string", enum: ["active", "expired", "revoked"] }
          },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          {
            name: "pageSize",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100 }
          }
        ],
        responses: {
          "200": jsonDataResponse("Paginated current-user affiliate claims", {
            $ref: "#/components/schemas/AffiliateClaimPage"
          }),
          ...affiliateMarketplaceErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/affiliate/claims/{claimId}`]: {
      get: {
        tags: ["Affiliate Marketplace"],
        summary: "Get one affiliate claim owned by the current user",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParameter("claimId")],
        responses: {
          "200": jsonDataResponse("Current-user affiliate claim", {
            $ref: "#/components/schemas/AffiliateClaim"
          }),
          ...affiliateMarketplaceErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/affiliate/resolve/{publicToken}`]: {
      get: {
        tags: ["Affiliate Marketplace"],
        summary: "Validate a signed affiliate promotion link without recording attribution",
        parameters: [
          {
            name: "publicToken",
            in: "path",
            required: true,
            schema: {
              type: "string",
              pattern: "^[A-Za-z0-9_-]{24}\\.[A-Za-z0-9_-]{43}$"
            }
          }
        ],
        responses: {
          "200": jsonDataResponse("Resolved public affiliate link", {
            $ref: "#/components/schemas/AffiliateResolvedLink"
          }),
          "400": { description: "Malformed public affiliate token" },
          "404": { description: "Invalid, expired, revoked, or unusable affiliate link" }
        }
      }
    },
    [`${config.API_PREFIX}/affiliate/codes/validate`]: {
      post: {
        tags: ["Affiliate Marketplace"],
        summary: "Advisory validation of an affiliate code for a schedule slot",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["publicCode", "scheduleSlotId"],
                properties: {
                  publicCode: { type: "string", minLength: 1, maxLength: 40 },
                  scheduleSlotId: { type: "integer", minimum: 1 }
                }
              }
            }
          }
        },
        responses: {
          "200": jsonDataResponse("Validated affiliate code and price preview", {
            $ref: "#/components/schemas/AffiliateCodeValidation"
          }),
          "400": { description: "Invalid request contract" },
          "401": { description: "Authentication required" },
          "403": { description: "Missing booking permission" },
          "404": { description: "Invalid, expired, or revoked affiliate code" },
          "409": {
            description: "Slot, task, scope, self-attribution, minimum amount, or budget conflict"
          }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/affiliate/tasks`]: {
      get: {
        tags: ["Affiliate Operations"],
        summary: "List affiliate tasks across publishers for operations review",
        security: [{ bearerAuth: [] }],
        parameters: [
          ...affiliateTaskListParameters,
          {
            name: "merchantAccountId",
            in: "query",
            schema: { type: "integer", minimum: 1 }
          },
          { name: "shopId", in: "query", schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": jsonDataResponse("Paginated backoffice affiliate tasks", {
            $ref: "#/components/schemas/AffiliateTaskPage"
          }),
          ...affiliateTaskErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/affiliate/tasks/{taskId}`]: {
      get: {
        tags: ["Affiliate Operations"],
        summary: "Get one affiliate task for operations review",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParameter("taskId")],
        responses: {
          "200": jsonDataResponse("Backoffice affiliate task", {
            $ref: "#/components/schemas/AffiliateTask"
          }),
          ...affiliateTaskErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/affiliate/tasks/{taskId}/approve`]: {
      post: {
        tags: ["Affiliate Operations"],
        summary: "Approve a fully funded task into scheduled or active state",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParameter("taskId")],
        responses: {
          "200": jsonDataResponse("Approved affiliate task", {
            $ref: "#/components/schemas/AffiliateTask"
          }),
          ...affiliateTaskErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/affiliate/tasks/{taskId}/reject`]: {
      post: {
        tags: ["Affiliate Operations"],
        summary: "Reject a task and atomically unfreeze its complete unused NDP budget",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParameter("taskId")],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["reason"],
                properties: {
                  reason: { type: "string", minLength: 1, maxLength: 500 }
                }
              }
            }
          }
        },
        responses: {
          "200": jsonDataResponse("Rejected affiliate task with released budget", {
            $ref: "#/components/schemas/AffiliateTask"
          }),
          ...affiliateTaskErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/merchant-accounts`]: {
      get: {
        tags: ["Merchant SaaS Billing"],
        summary: "Paginated merchant groups and standalone shop billing cards",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "status", in: "query", schema: { type: "string", maxLength: 40 } },
          { name: "query", in: "query", schema: { type: "string", maxLength: 160 } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          {
            name: "pageSize",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100 }
          }
        ],
        responses: {
          "200": jsonDataResponse("Paginated account cards", {
            type: "object",
            required: ["list", "total", "page", "page_size"],
            properties: {
              list: {
                type: "array",
                items: {
                  oneOf: [
                    { $ref: "#/components/schemas/MerchantAccountCard" },
                    { $ref: "#/components/schemas/ShopBillingCard" }
                  ]
                }
              },
              total: { type: "integer" },
              page: { type: "integer" },
              page_size: { type: "integer" }
            }
          }),
          "403": { description: "Missing merchant account list permission" }
        }
      },
      post: {
        tags: ["Merchant SaaS Billing"],
        summary: "Create an explicit merchant group account and its only initial trial",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["code", "name"],
                properties: {
                  code: { type: "string", pattern: "^[a-z0-9][a-z0-9-]*$", maxLength: 100 },
                  name: { type: "string", minLength: 1, maxLength: 160 },
                  ownerUserId: { type: ["integer", "null"], minimum: 1 },
                  paymentResponsibility: {
                    type: "string",
                    enum: ["group_consolidated", "shops_individual"],
                    default: "group_consolidated"
                  }
                }
              }
            }
          }
        },
        responses: {
          "201": jsonDataResponse("Created merchant account", {
            $ref: "#/components/schemas/MerchantAccountCard"
          }),
          "403": { description: "Missing merchant account management permission" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/merchant-accounts/{id}`]: {
      get: {
        tags: ["Merchant SaaS Billing"],
        summary: "Merchant group billing detail with nested shops",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParameter()],
        responses: {
          "200": jsonDataResponse("Merchant account detail", {
            $ref: "#/components/schemas/MerchantAccountCard"
          }),
          "404": { description: "Merchant account not found" }
        }
      },
      delete: {
        tags: ["Merchant SaaS Billing"],
        summary: "Soft-delete a merchant group with an explicit child-shop strategy",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParameter()],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["strategy"],
                properties: {
                  strategy: {
                    type: "string",
                    enum: ["detach_shops", "delete_eligible_shops"]
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": jsonDataResponse("Merchant group soft-deleted", {
            type: "object",
            required: ["deleted"],
            properties: { deleted: { type: "boolean", enum: [true] } }
          }),
          "409": { description: "A child shop has active orders or no promotable admin" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/merchant-accounts/{id}/billing-profile`]: {
      patch: {
        tags: ["Merchant SaaS Billing"],
        summary: "Update and optionally lock merchant cadence and fee",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParameter()],
        requestBody: billingProfileRequestBody,
        responses: {
          "200": jsonDataResponse("Updated billing profile", {
            $ref: "#/components/schemas/SaasBillingCard"
          }),
          "409": { description: "Optimistic billing version conflict" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/merchant-accounts/{id}/payment-responsibility`]: {
      patch: {
        tags: ["Merchant SaaS Billing"],
        summary: "Set consolidated or per-shop responsibility for the next unpaid cycle",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParameter()],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["paymentResponsibility"],
                properties: {
                  paymentResponsibility: {
                    type: "string",
                    enum: ["group_consolidated", "shops_individual"]
                  },
                  effectiveFrom: { type: "string", format: "date-time" }
                }
              }
            }
          }
        },
        responses: {
          "200": jsonDataResponse("Updated merchant account", {
            $ref: "#/components/schemas/MerchantAccountCard"
          })
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/merchant-accounts/{id}/shops`]: {
      post: {
        tags: ["Merchant SaaS Billing"],
        summary: "Link an existing standalone shop to a merchant group",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParameter()],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["shopId"],
                properties: {
                  shopId: { type: "integer", minimum: 1 },
                  startsAt: { type: "string", format: "date-time" }
                }
              }
            }
          }
        },
        responses: {
          "200": jsonDataResponse("Merchant account with linked shop", {
            $ref: "#/components/schemas/MerchantAccountCard"
          }),
          "409": { description: "Shop is already linked or entity is missing" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/merchant-accounts/{id}/shops/{shopId}`]: {
      delete: {
        tags: ["Merchant SaaS Billing"],
        summary: "End a merchant-shop membership without deleting the shop",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParameter(), idPathParameter("shopId")],
        responses: {
          "200": jsonDataResponse("Merchant account after unlink", {
            $ref: "#/components/schemas/MerchantAccountCard"
          }),
          "404": { description: "Active membership not found" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/shops/{id}/billing-profile`]: {
      patch: {
        tags: ["Merchant SaaS Billing"],
        summary: "Update and optionally lock a shop cadence and fee",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParameter()],
        requestBody: billingProfileRequestBody,
        responses: {
          "200": jsonDataResponse("Updated shop billing profile", {
            $ref: "#/components/schemas/SaasBillingCard"
          }),
          "409": { description: "Optimistic billing version conflict" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/billing-subjects/{subjectType}/{subjectId}/trial/extensions`]:
      {
        post: {
          tags: ["Merchant SaaS Billing"],
          summary: "Add one of at most three administrator trial extensions",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "subjectType",
              in: "path",
              required: true,
              schema: { type: "string", enum: ["merchant_account", "shop"] }
            },
            idPathParameter("subjectId")
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["reason", "version"],
                  properties: {
                    quickMonths: { type: "integer", enum: [1, 2, 3] },
                    days: { type: "integer", minimum: 1, maximum: 1095 },
                    paidFrom: { type: "string", format: "date-time" },
                    reason: { type: "string", minLength: 1, maxLength: 500 },
                    version: { type: "integer", minimum: 1 }
                  },
                  anyOf: [
                    { required: ["quickMonths"] },
                    { required: ["days"] },
                    { required: ["paidFrom"] }
                  ]
                }
              }
            }
          },
          responses: {
            "200": jsonDataResponse("Extended trial profile", {
              $ref: "#/components/schemas/SaasBillingCard"
            }),
            "409": { description: "Trial inactive, extension limit, or version conflict" }
          }
        }
      },
    [`${config.API_PREFIX}/backoffice/billing-subjects/{subjectType}/{subjectId}/trial/interrupt`]:
      {
        post: {
          tags: ["Merchant SaaS Billing"],
          summary: "Permanently interrupt the only trial",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "subjectType",
              in: "path",
              required: true,
              schema: { type: "string", enum: ["merchant_account", "shop"] }
            },
            idPathParameter("subjectId")
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["reason", "version"],
                  properties: {
                    reason: { type: "string", minLength: 1, maxLength: 500 },
                    version: { type: "integer", minimum: 1 }
                  }
                }
              }
            }
          },
          responses: {
            "200": jsonDataResponse("Interrupted trial profile", {
              $ref: "#/components/schemas/SaasBillingCard"
            }),
            "409": { description: "Trial inactive or version conflict" }
          }
        }
      },
    [`${config.API_PREFIX}/backoffice/billing-subjects/{subjectType}/{subjectId}/free-periods`]: {
      get: {
        tags: ["Merchant SaaS Billing"],
        summary: "Paginated authoritative free-period history",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "subjectType",
            in: "path",
            required: true,
            schema: { type: "string", enum: ["merchant_account", "shop"] }
          },
          idPathParameter("subjectId"),
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          {
            name: "pageSize",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100 }
          }
        ],
        responses: { "200": { description: "Paginated free-period history" } }
      }
    },
    [`${config.API_PREFIX}/backoffice/saas-invoices`]: {
      get: {
        tags: ["Merchant SaaS Billing"],
        summary: "Paginated SaaS invoices and line items",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "status", in: "query", schema: { type: "string", maxLength: 40 } },
          {
            name: "payerType",
            in: "query",
            schema: { type: "string", enum: ["merchant_account", "shop"] }
          },
          { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          {
            name: "pageSize",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100 }
          }
        ],
        responses: { "200": { description: "Paginated SaaS invoices" } }
      }
    },
    [`${config.API_PREFIX}/backoffice/saas-invoices/{id}`]: {
      get: {
        tags: ["Merchant SaaS Billing"],
        summary: "SaaS invoice with line items and payment history",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParameter()],
        responses: {
          "200": jsonDataResponse("SaaS invoice detail", {
            $ref: "#/components/schemas/SaasInvoice"
          }),
          "404": { description: "Invoice not found" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/saas-invoices/{id}/manual-payments`]: {
      post: {
        tags: ["Merchant SaaS Billing"],
        summary: "Review an idempotent manual payment through the provider adapter",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParameter()],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["amountJpy", "receivedAt", "reference", "idempotencyKey"],
                properties: {
                  amountJpy: { type: "integer", minimum: 1, maximum: 100000000 },
                  receivedAt: { type: "string", format: "date-time" },
                  reference: { type: "string", minLength: 1, maxLength: 191 },
                  idempotencyKey: { type: "string", minLength: 8, maxLength: 191 },
                  coverageStartsAt: { type: "string", format: "date-time" },
                  coverageEndsAt: { type: "string", format: "date-time" }
                }
              }
            }
          }
        },
        responses: {
          "200": jsonDataResponse("Paid invoice", { $ref: "#/components/schemas/SaasInvoice" }),
          "409": { description: "Payment amount, state, reference, or idempotency conflict" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/entities/{subjectType}/{subjectId}/suspensions`]: {
      post: {
        tags: ["Merchant SaaS Billing"],
        summary: "Manually suspend a shop or merchant group without disabling login",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "subjectType",
            in: "path",
            required: true,
            schema: { type: "string", enum: ["merchant_account", "shop"] }
          },
          idPathParameter("subjectId")
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["reasonCodes", "note", "scope"],
                properties: {
                  reasonCodes: {
                    type: "array",
                    minItems: 1,
                    uniqueItems: true,
                    items: {
                      type: "string",
                      enum: [
                        "overdue_payment",
                        "qualification_or_fraud",
                        "serious_service_violation",
                        "customer_complaints",
                        "safety_risk",
                        "account_abuse",
                        "merchant_requested_closure",
                        "other"
                      ]
                    }
                  },
                  note: { type: "string", minLength: 1, maxLength: 1000 },
                  scope: {
                    type: "string",
                    enum: ["subject_only", "merchant_and_shops", "merchant_detach_shops"]
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": jsonDataResponse("Manual suspension result", {
            $ref: "#/components/schemas/EntitySuspensionResult"
          }),
          "409": { description: "Entity already suspended or group detach cannot promote admin" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/entities/{subjectType}/{subjectId}/suspensions/{suspensionId}/release`]:
      {
        post: {
          tags: ["Merchant SaaS Billing"],
          summary: "Release a manual suspension without restoring previously blocked slots",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "subjectType",
              in: "path",
              required: true,
              schema: { type: "string", enum: ["merchant_account", "shop"] }
            },
            idPathParameter("subjectId"),
            idPathParameter("suspensionId")
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["reason"],
                  properties: { reason: { type: "string", minLength: 1, maxLength: 500 } }
                }
              }
            }
          },
          responses: {
            "200": { description: "Suspension released; blocked availability stays blocked" },
            "404": { description: "Active suspension not found" }
          }
        }
      },
    [`${config.API_PREFIX}/health`]: {
      get: {
        tags: ["System"],
        summary: "Backend health check",
        responses: {
          "200": {
            description: "Backend is ready to accept requests",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: {
                      type: "object",
                      required: ["status", "service", "timestamp", "dependencies"],
                      properties: {
                        status: { type: "string", enum: ["ok", "degraded"] },
                        service: { type: "string" },
                        timestamp: { type: "string", format: "date-time" },
                        dependencies: {
                          type: "object",
                          required: ["redis"],
                          properties: {
                            redis: {
                              type: "object",
                              required: ["status"],
                              properties: {
                                status: { type: "string", enum: ["ok", "error"] },
                                latencyMs: { type: "number" },
                                message: { type: "string" }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    [`${config.API_PREFIX}/ready`]: {
      get: {
        tags: ["System"],
        summary: "Backend readiness check for load balancers and orchestrators",
        responses: {
          "200": {
            description: "Backend dependencies are ready",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: {
                      type: "object",
                      required: ["status", "service", "timestamp", "dependencies"],
                      properties: {
                        status: { type: "string", enum: ["ready", "not_ready"] },
                        service: { type: "string" },
                        timestamp: { type: "string", format: "date-time" },
                        dependencies: {
                          type: "object",
                          required: ["database", "redis"],
                          properties: {
                            database: {
                              type: "object",
                              required: ["status"],
                              properties: {
                                status: { type: "string", enum: ["ok", "error"] },
                                latencyMs: { type: "number" },
                                poolSize: { type: "number" },
                                message: { type: "string" }
                              }
                            },
                            redis: {
                              type: "object",
                              required: ["status"],
                              properties: {
                                status: { type: "string", enum: ["ok", "error"] },
                                latencyMs: { type: "number" },
                                poolSize: { type: "number" },
                                healthyClients: { type: "number" },
                                message: { type: "string" }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "503": {
            description: "One or more required dependencies are not ready"
          }
        }
      }
    },
    [`${config.API_PREFIX}/metrics`]: {
      get: {
        tags: ["System"],
        summary: "Prometheus metrics endpoint",
        responses: {
          "200": {
            description: "Prometheus text exposition format",
            content: {
              "text/plain": {
                schema: {
                  type: "string"
                }
              }
            }
          }
        }
      }
    },
    [`${config.API_PREFIX}/login`]: {
      post: {
        tags: ["Auth"],
        summary: "Username/email and password login short URI",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["password"],
                properties: {
                  email: { type: "string", format: "email" },
                  username: { type: "string", minLength: 1, maxLength: 255 },
                  type: {
                    type: "string",
                    enum: ["username", "mobile", "email", "wechat", "qq", "weibo"]
                  },
                  numcode: { type: "string", maxLength: 32 },
                  password: { type: "string", minLength: 1, maxLength: 128 }
                },
                anyOf: [{ required: ["email"] }, { required: ["username"] }]
              }
            }
          }
        },
        responses: {
          "200": {
            description: "JWT token pair",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/TokenPair" }
                  }
                }
              }
            }
          },
          "401": { description: "Invalid credentials" },
          "429": { description: "Account locked" },
          "503": { description: "Redis auth session dependency is unavailable" }
        }
      }
    },
    [`${config.API_PREFIX}/auth/login`]: {
      post: {
        tags: ["Auth"],
        summary: "Email or immutable NeeDo ID and password login",
        requestBody: authJsonBody(
          {
            loginIdentifier: { type: "string", minLength: 1, maxLength: 255 },
            password: { type: "string", minLength: 1, maxLength: 128 }
          },
          ["loginIdentifier", "password"]
        ),
        responses: {
          "200": jsonDataResponse("JWT token pair", {
            $ref: "#/components/schemas/TokenPair"
          }),
          ...authActionErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/auth/register`]: {
      post: {
        tags: ["Auth"],
        summary: "Start verified email registration",
        requestBody: authJsonBody(
          {
            email: { type: "string", format: "email", maxLength: 255 },
            password: {
              type: "string",
              minLength: 8,
              maxLength: 128,
              pattern: "^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).+$"
            }
          },
          ["email", "password"]
        ),
        responses: {
          "200": jsonDataResponse("Action-bound email verification challenge", {
            $ref: "#/components/schemas/AuthChallengeMetadata"
          }),
          ...authActionErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/auth/register/verify`]: {
      post: {
        tags: ["Auth"],
        summary: "Verify email registration and create the baseline customer",
        requestBody: authJsonBody(
          {
            challengeId: { type: "string", format: "uuid", maxLength: 64 },
            otp: { type: "string", pattern: "^\\d{6}$" }
          },
          ["challengeId", "otp"]
        ),
        responses: {
          "200": jsonDataResponse("Created account token pair and generated NeeDo ID", {
            $ref: "#/components/schemas/TokenPairWithNeedoId"
          }),
          ...authActionErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/auth/google/init`]: {
      post: {
        tags: ["Auth"],
        summary: "Create a one-time nonce for Google Identity Services",
        requestBody: authJsonBody({}),
        responses: {
          "200": jsonDataResponse("Google authentication initialization", {
            $ref: "#/components/schemas/GoogleAuthInitialization"
          }),
          ...authActionErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/auth/google`]: {
      post: {
        tags: ["Auth"],
        summary: "Submit a Google ID credential against its one-time nonce",
        requestBody: authJsonBody(
          {
            credential: { type: "string", minLength: 1, maxLength: 8192 },
            nonceChallengeId: { type: "string", format: "uuid", maxLength: 64 }
          },
          ["credential", "nonceChallengeId"]
        ),
        responses: {
          "200": jsonDataResponse(
            "Direct authenticated result or action-bound email verification challenge",
            { $ref: "#/components/schemas/GoogleCredentialResult" }
          ),
          ...authActionErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/auth/google/verify`]: {
      post: {
        tags: ["Auth"],
        summary: "Verify first-use Google registration or account link",
        requestBody: authJsonBody(
          {
            challengeId: { type: "string", format: "uuid", maxLength: 64 },
            otp: { type: "string", pattern: "^\\d{6}$" }
          },
          ["challengeId", "otp"]
        ),
        responses: {
          "200": jsonDataResponse("Authenticated Google token pair", {
            $ref: "#/components/schemas/TokenPairWithNeedoId"
          }),
          ...authActionErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/auth/refresh`]: {
      post: {
        tags: ["Auth"],
        summary: "Refresh access token",
        requestBody: authJsonBody(
          { refreshToken: { type: "string", minLength: 1, maxLength: 8192 } },
          ["refreshToken"]
        ),
        responses: {
          "200": {
            description: "New access token",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/RefreshTokenResponse" }
                  }
                }
              }
            }
          },
          "401": { description: "Refresh token invalid or expired" }
        }
      }
    },
    [`${config.API_PREFIX}/auth/switch-identity`]: {
      post: {
        tags: ["Auth"],
        summary: "Switch current user identity and rotate the token pair",
        security: [{ bearerAuth: [] }],
        requestBody: authJsonBody(
          {
            refreshToken: { type: "string", minLength: 1, maxLength: 8192 },
            identityId: { type: "integer", minimum: 1 }
          },
          ["refreshToken", "identityId"]
        ),
        responses: {
          "200": {
            description: "New token pair scoped to the requested identity",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/SwitchIdentityResponse" }
                  }
                }
              }
            }
          },
          "401": { description: "Access or refresh token invalid, expired, or blacklisted" },
          "403": { description: "Missing auth me permission" },
          "404": { description: "Requested identity does not belong to the current user" }
        }
      }
    },
    [`${config.API_PREFIX}/auth/logout`]: {
      post: {
        tags: ["Auth"],
        summary: "Logout and revoke current session",
        security: [{ bearerAuth: [] }],
        requestBody: authJsonBody(
          { refreshToken: { type: "string", minLength: 1, maxLength: 8192 } },
          ["refreshToken"]
        ),
        responses: {
          "200": {
            description: "Session revoked",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { type: "object" }
                  }
                }
              }
            }
          },
          "401": { description: "Token invalid, expired, or blacklisted" },
          "403": { description: "Missing auth logout permission" }
        }
      }
    },
    [`${config.API_PREFIX}/auth/me`]: {
      get: {
        tags: ["Auth"],
        summary: "Current authenticated user",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Current user, identity, roles, permissions, and menus",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/AuthMe" }
                  }
                }
              }
            }
          },
          "401": { description: "Access token invalid, expired, or blacklisted" },
          "403": { description: "Missing auth me permission" }
        }
      }
    },
    [`${config.API_PREFIX}/auth/google/link`]: {
      get: {
        tags: ["Auth"],
        summary: "Read the current account Google link status",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": jsonDataResponse("Current Google link status", {
            $ref: "#/components/schemas/GoogleLinkStatus"
          }),
          ...authActionErrorResponses
        }
      },
      post: {
        tags: ["Auth"],
        summary: "Submit a Google credential for the current account",
        security: [{ bearerAuth: [] }],
        requestBody: authJsonBody(
          {
            credential: { type: "string", minLength: 1, maxLength: 8192 },
            nonceChallengeId: { type: "string", format: "uuid", maxLength: 64 }
          },
          ["credential", "nonceChallengeId"]
        ),
        responses: {
          "200": jsonDataResponse("Action-bound Google link verification challenge", {
            $ref: "#/components/schemas/AuthChallengeMetadata"
          }),
          ...authActionErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/auth/google/link/init`]: {
      post: {
        tags: ["Auth"],
        summary: "Create a Google nonce bound to the current account",
        security: [{ bearerAuth: [] }],
        requestBody: authJsonBody({}),
        responses: {
          "200": jsonDataResponse("Google link initialization", {
            $ref: "#/components/schemas/GoogleAuthInitialization"
          }),
          ...authActionErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/auth/google/link/verify`]: {
      post: {
        tags: ["Auth"],
        summary: "Verify and bind Google to the current account",
        security: [{ bearerAuth: [] }],
        requestBody: authJsonBody(
          {
            challengeId: { type: "string", format: "uuid", maxLength: 64 },
            otp: { type: "string", pattern: "^\\d{6}$" }
          },
          ["challengeId", "otp"]
        ),
        responses: {
          "200": jsonDataResponse("Google account linked", {
            type: "object",
            additionalProperties: false,
            required: ["linked"],
            properties: { linked: { type: "boolean", const: true } }
          }),
          ...authActionErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/auth/google/unlink`]: {
      post: {
        tags: ["Auth"],
        summary: "Start action-bound Google unlink verification",
        security: [{ bearerAuth: [] }],
        requestBody: authJsonBody({}),
        responses: {
          "200": jsonDataResponse("Google unlink verification challenge", {
            $ref: "#/components/schemas/AuthChallengeMetadata"
          }),
          ...authActionErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/auth/google/unlink/verify`]: {
      post: {
        tags: ["Auth"],
        summary: "Verify Google unlink and revoke all account sessions",
        description:
          "A stale access token can recover only this same completed unlink challenge; recovery never creates an authenticated request context.",
        security: [{ bearerAuth: [] }],
        requestBody: authJsonBody(
          {
            challengeId: { type: "string", format: "uuid", maxLength: 64 },
            otp: { type: "string", pattern: "^\\d{6}$" }
          },
          ["challengeId", "otp"]
        ),
        responses: {
          "200": jsonDataResponse("Google account unlinked and session signed out", {
            type: "object",
            additionalProperties: false,
            required: ["signedOut"],
            properties: { signedOut: { type: "boolean", const: true } }
          }),
          ...authActionErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/auth/password/setup`]: {
      post: {
        tags: ["Auth"],
        summary: "Start password setup for a Google-only account",
        security: [{ bearerAuth: [] }],
        requestBody: authJsonBody(
          {
            password: {
              type: "string",
              minLength: 8,
              maxLength: 128,
              pattern: "^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).+$"
            }
          },
          ["password"]
        ),
        responses: {
          "200": jsonDataResponse("Password setup verification challenge", {
            $ref: "#/components/schemas/AuthChallengeMetadata"
          }),
          ...authActionErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/auth/password/setup/verify`]: {
      post: {
        tags: ["Auth"],
        summary: "Verify and persist the current account password",
        security: [{ bearerAuth: [] }],
        requestBody: authJsonBody(
          {
            challengeId: { type: "string", format: "uuid", maxLength: 64 },
            otp: { type: "string", pattern: "^\\d{6}$" }
          },
          ["challengeId", "otp"]
        ),
        responses: {
          "200": jsonDataResponse("Password login enabled", {
            type: "object",
            additionalProperties: false,
            required: ["hasPassword"],
            properties: { hasPassword: { type: "boolean", const: true } }
          }),
          ...authActionErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/permissions`]: {
      get: {
        tags: ["RBAC"],
        summary: "Paginated permission list",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Paginated permissions",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: {
                      type: "object",
                      required: ["list", "total", "page", "page_size"],
                      properties: {
                        list: {
                          type: "array",
                          items: { $ref: "#/components/schemas/Permission" }
                        },
                        total: { type: "integer" },
                        page: { type: "integer" },
                        page_size: { type: "integer" }
                      }
                    }
                  }
                }
              }
            }
          },
          "403": { description: "Missing permission:list permission" }
        }
      },
      post: {
        tags: ["RBAC"],
        summary: "Create permission",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "code", "type", "module"],
                properties: {
                  name: { type: "string" },
                  code: { type: "string" },
                  type: { type: "string", enum: ["api", "menu", "page", "button"] },
                  module: { type: "string" },
                  description: { type: ["string", "null"] }
                }
              }
            }
          }
        },
        responses: {
          "201": {
            description: "Permission created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/Permission" }
                  }
                }
              }
            }
          },
          "409": { description: "Permission code exists" }
        }
      }
    },
    [`${config.API_PREFIX}/permissions/tree`]: {
      get: {
        tags: ["RBAC"],
        summary: "Permission tree grouped by module and type",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Permission tree",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/PermissionTree" }
                  }
                }
              }
            }
          }
        }
      }
    },
    [`${config.API_PREFIX}/permissions/{id}`]: {
      get: {
        tags: ["RBAC"],
        summary: "Permission detail",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Permission detail",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/Permission" }
                  }
                }
              }
            }
          },
          "404": { description: "Permission not found" }
        }
      },
      patch: {
        tags: ["RBAC"],
        summary: "Update permission",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Permission updated" },
          "403": { description: "System permission protected" },
          "404": { description: "Permission not found" }
        }
      },
      delete: {
        tags: ["RBAC"],
        summary: "Soft delete permission",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Permission soft deleted" },
          "403": { description: "System permission protected" },
          "404": { description: "Permission not found" }
        }
      }
    },
    [`${config.API_PREFIX}/roles`]: {
      get: {
        tags: ["RBAC"],
        summary: "Paginated role list",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Paginated roles",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: {
                      type: "object",
                      required: ["list", "total", "page", "page_size"],
                      properties: {
                        list: { type: "array", items: { $ref: "#/components/schemas/Role" } },
                        total: { type: "integer" },
                        page: { type: "integer" },
                        page_size: { type: "integer" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      post: {
        tags: ["RBAC"],
        summary: "Create role",
        security: [{ bearerAuth: [] }],
        responses: {
          "201": { description: "Role created" },
          "409": { description: "Role code exists" }
        }
      }
    },
    [`${config.API_PREFIX}/roles/{id}`]: {
      get: {
        tags: ["RBAC"],
        summary: "Role detail",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Role detail" },
          "404": { description: "Role not found" }
        }
      },
      patch: {
        tags: ["RBAC"],
        summary: "Update role",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Role updated" },
          "403": { description: "System role protected" },
          "404": { description: "Role not found" }
        }
      },
      delete: {
        tags: ["RBAC"],
        summary: "Soft delete role",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Role soft deleted" },
          "403": { description: "System role protected" },
          "404": { description: "Role not found" }
        }
      }
    },
    [`${config.API_PREFIX}/roles/{id}/permissions`]: {
      put: {
        tags: ["RBAC"],
        summary: "Assign role permissions",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["permissionIds"],
                properties: {
                  permissionIds: { type: "array", items: { type: "integer" } }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Role permissions assigned" },
          "404": { description: "Role or permission not found" }
        }
      }
    },
    [`${config.API_PREFIX}/users`]: {
      get: {
        tags: ["User Management"],
        summary: "Paginated user list",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Paginated users",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: {
                      type: "object",
                      required: ["list", "total", "page", "page_size"],
                      properties: {
                        list: { type: "array", items: { $ref: "#/components/schemas/User" } },
                        total: { type: "integer" },
                        page: { type: "integer" },
                        page_size: { type: "integer" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      post: {
        tags: ["User Management"],
        summary: "Create user",
        security: [{ bearerAuth: [] }],
        responses: {
          "201": { description: "User created" },
          "409": { description: "Email or phone already exists" }
        }
      }
    },
    [`${config.API_PREFIX}/users/{id}`]: {
      get: {
        tags: ["User Management"],
        summary: "User detail",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "User detail without password hash" },
          "404": { description: "User not found" }
        }
      },
      patch: {
        tags: ["User Management"],
        summary: "Update user",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "User updated" },
          "409": { description: "Email or phone already exists" }
        }
      },
      delete: {
        tags: ["User Management"],
        summary: "Soft delete user",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "User soft deleted" },
          "403": { description: "Self or super admin deletion blocked" }
        }
      }
    },
    [`${config.API_PREFIX}/users/{id}/enable`]: {
      post: {
        tags: ["User Management"],
        summary: "Enable user",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "User enabled" },
          "404": { description: "User not found" }
        }
      }
    },
    [`${config.API_PREFIX}/users/{id}/disable`]: {
      post: {
        tags: ["User Management"],
        summary: "Disable user",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "User disabled" },
          "403": { description: "Self disable blocked" },
          "404": { description: "User not found" }
        }
      }
    },
    [`${config.API_PREFIX}/users/{id}/roles`]: {
      put: {
        tags: ["User Management"],
        summary: "Assign user roles",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["roles"],
                properties: {
                  roles: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["roleId"],
                      properties: {
                        roleId: { type: "integer" },
                        scopeType: { type: ["string", "null"] },
                        scopeId: { type: ["integer", "null"] }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "User roles assigned" },
          "403": { description: "Current admin final admin role removal blocked" },
          "404": { description: "User or role not found" }
        }
      }
    },
    [`${config.API_PREFIX}/categories`]: {
      get: {
        tags: ["Core Read"],
        summary: "Paginated public category list",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "parentId", in: "query", schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": {
            description: "Paginated categories",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: {
                      type: "object",
                      required: ["list", "total", "page", "page_size"],
                      properties: {
                        list: { type: "array", items: { $ref: "#/components/schemas/Category" } },
                        total: { type: "integer" },
                        page: { type: "integer" },
                        page_size: { type: "integer" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    [`${config.API_PREFIX}/services`]: {
      get: {
        tags: ["Core Read"],
        summary: "Paginated public service list",
        parameters: [
          { name: "keyword", in: "query", schema: { type: "string", maxLength: 100 } },
          { name: "categoryId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "shopId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "technicianId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "city", in: "query", schema: { type: "string", maxLength: 100 } },
          { name: "minPrice", in: "query", schema: { type: "number", minimum: 0 } },
          { name: "maxPrice", in: "query", schema: { type: "number", minimum: 0 } },
          {
            name: "sort",
            in: "query",
            schema: {
              type: "string",
              enum: ["recommended", "rating_desc", "price_asc", "price_desc", "newest"]
            }
          },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "page_size", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: {
          "200": {
            description: "Paginated services",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: {
                      type: "object",
                      required: ["list", "total", "page", "page_size"],
                      properties: {
                        list: {
                          type: "array",
                          items: { $ref: "#/components/schemas/ServiceCard" }
                        },
                        total: { type: "integer" },
                        page: { type: "integer" },
                        page_size: { type: "integer" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    [`${config.API_PREFIX}/services/{id}`]: {
      get: {
        tags: ["Core Read"],
        summary: "Public service detail",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Service detail" },
          "404": { description: "Service not found" }
        }
      }
    },
    [`${config.API_PREFIX}/home/recommendations`]: {
      get: {
        tags: ["Core Read"],
        summary: "Home recommendation rows",
        parameters: [
          { name: "city", in: "query", schema: { type: "string", maxLength: 100 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 20 } }
        ],
        responses: {
          "200": {
            description: "Recommended categories, services, shops, and technicians",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/HomeRecommendations" }
                  }
                }
              }
            }
          }
        }
      }
    },
    [`${config.API_PREFIX}/search`]: {
      get: {
        tags: ["Core Read"],
        summary: "Public service search",
        responses: {
          "200": { description: "Paginated service search results" }
        }
      }
    },
    [`${config.API_PREFIX}/shops/{id}`]: {
      get: {
        tags: ["Core Read"],
        summary: "Public shop detail",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Shop detail" },
          "404": { description: "Shop not found" }
        }
      }
    },
    [`${config.API_PREFIX}/shops/{shopId}/pricing-mode`]: {
      get: {
        tags: ["Pricing Mode"],
        summary: "Read merchant shop pricing mode",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "shopId", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Shop pricing mode" },
          "403": { description: "Actor is outside the shop scope" }
        }
      },
      put: {
        tags: ["Pricing Mode"],
        summary: "Switch merchant shop pricing mode",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "shopId", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["pricingMode"],
                properties: {
                  pricingMode: { type: "string", enum: ["merchant", "technician"] },
                  technicianPricingRatePercent: {
                    type: "integer",
                    minimum: 10,
                    maximum: 200,
                    description: "Shop-facing price rate applied to technician service prices."
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Updated shop pricing mode" },
          "403": { description: "Actor is outside the shop scope" }
        }
      }
    },
    [`${config.API_PREFIX}/shops/{shopId}/booking-navigation`]: {
      get: {
        tags: ["Pricing Mode"],
        summary: "Resolve shop booking entry by pricing mode",
        parameters: [
          { name: "shopId", in: "path", required: true, schema: { type: "integer" } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: {
          "200": { description: "Booking entry with services or technicians" }
        }
      }
    },
    [`${config.API_PREFIX}/shops/{shopId}/technicians/{technicianId}/services`]: {
      get: {
        tags: ["Pricing Mode"],
        summary: "Public technician service list for a shop",
        parameters: [
          { name: "shopId", in: "path", required: true, schema: { type: "integer" } },
          { name: "technicianId", in: "path", required: true, schema: { type: "integer" } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: {
          "200": { description: "Paginated active technician services" }
        }
      }
    },
    [`${config.API_PREFIX}/technicians/me/shops/{shopId}/services`]: {
      get: {
        tags: ["Pricing Mode"],
        summary: "Technician owned service list",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "shopId", in: "path", required: true, schema: { type: "integer" } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: {
          "200": { description: "Paginated technician services" }
        }
      },
      post: {
        tags: ["Pricing Mode"],
        summary: "Create technician owned service",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "shopId", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "201": { description: "Technician service created" }
        }
      }
    },
    [`${config.API_PREFIX}/technicians/me/shops/{shopId}/services/{serviceId}`]: {
      put: {
        tags: ["Pricing Mode"],
        summary: "Update technician owned service",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "shopId", in: "path", required: true, schema: { type: "integer" } },
          { name: "serviceId", in: "path", required: true, schema: { type: "integer" } }
        ],
        responses: {
          "200": { description: "Technician service updated" }
        }
      },
      delete: {
        tags: ["Pricing Mode"],
        summary: "Soft delete technician owned service",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "shopId", in: "path", required: true, schema: { type: "integer" } },
          { name: "serviceId", in: "path", required: true, schema: { type: "integer" } }
        ],
        responses: {
          "200": { description: "Technician service soft deleted" }
        }
      }
    },
    [`${config.API_PREFIX}/technicians/{id}`]: {
      get: {
        tags: ["Core Read"],
        summary: "Public technician detail",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Technician detail" },
          "404": { description: "Technician not found" }
        }
      }
    },
    [`${config.API_PREFIX}/profiles/customers/{id}`]: {
      get: {
        tags: ["Core Read"],
        summary: "Public customer profile",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Customer profile without account credentials" },
          "404": { description: "Customer profile not found" }
        }
      }
    },
    [`${config.API_PREFIX}/customer-profile/me`]: {
      get: {
        tags: ["Customer Profile"],
        summary: "Get the profile belonging to the authenticated customer identity",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": jsonDataResponse("Current customer self-profile", {
            $ref: "#/components/schemas/CustomerSelfProfile"
          }),
          ...customerProfileErrorResponses
        }
      },
      patch: {
        tags: ["Customer Profile"],
        summary: "Update editable fields on the authenticated customer profile",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CustomerSelfProfileUpdate" }
            }
          }
        },
        responses: {
          "200": jsonDataResponse("Updated current customer self-profile", {
            $ref: "#/components/schemas/CustomerSelfProfile"
          }),
          ...customerProfileErrorResponses
        }
      }
    },
    "/media/customer-avatars/{filename}": {
      get: {
        tags: ["Customer Profile"],
        summary: "Read a content-addressed customer avatar image",
        servers: [{ url: "/" }],
        parameters: [
          {
            name: "filename",
            in: "path",
            required: true,
            schema: { type: "string", pattern: "^[a-f0-9]{64}\\.(?:jpg|png|webp)$" }
          }
        ],
        responses: {
          "200": {
            description: "Immutable JPEG, PNG, or WebP avatar bytes",
            headers: {
              "Cache-Control": {
                schema: { type: "string", example: "public, max-age=31536000, immutable" }
              }
            },
            content: {
              "image/jpeg": { schema: { type: "string", format: "binary" } },
              "image/png": { schema: { type: "string", format: "binary" } },
              "image/webp": { schema: { type: "string", format: "binary" } }
            }
          },
          "404": { description: "Avatar filename is not a hash or no matching file exists" }
        }
      }
    },
    [`${config.API_PREFIX}/schedule/availability`]: {
      get: {
        tags: ["Booking"],
        summary: "Paginated available schedule slots",
        description: "Provide serviceId or technicianServiceId, but not both. technicianId can be used without a service filter, or can further narrow a service query. The from/to window must not exceed 93 days. Results are limited to published, unsuspended shops and available slots with remaining capacity.",
        parameters: [
          {
            name: "serviceId",
            in: "query",
            schema: { type: "integer", minimum: 1 }
          },
          { name: "technicianServiceId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "shopId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "technicianId", in: "query", schema: { type: "integer", minimum: 1 } },
          {
            name: "from",
            in: "query",
            required: true,
            schema: { type: "string", format: "date-time" }
          },
          {
            name: "to",
            in: "query",
            required: true,
            schema: { type: "string", format: "date-time" }
          },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: {
          "200": {
            description: "Available slots",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: {
                      type: "object",
                      required: ["list", "total", "page", "page_size"],
                      properties: {
                        list: {
                          type: "array",
                          items: { $ref: "#/components/schemas/ScheduleSlot" }
                        },
                        total: { type: "integer" },
                        page: { type: "integer" },
                        page_size: { type: "integer" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    [`${config.API_PREFIX}/bookings`]: {
      post: {
        tags: ["Booking"],
        summary: "Create a free Booking order from an available schedule slot",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["scheduleSlotId", "fulfillmentMode"],
                properties: {
                  serviceId: { type: "integer", minimum: 1 },
                  technicianServiceId: { type: "integer", minimum: 1 },
                  scheduleSlotId: { type: "integer", minimum: 1 },
                  orderType: { type: "string", enum: ["booking", "request"] },
                  fulfillmentMode: { type: "string", enum: ["home", "store"] },
                  paymentMethod: {
                    type: "string",
                    enum: ["onsite", "bank_transfer"],
                    default: "onsite"
                  },
                  note: { type: "string", maxLength: 500 },
                  affiliateCode: { type: "string", minLength: 1, maxLength: 40 },
                  affiliatePublicToken: {
                    type: "string",
                    minLength: 1,
                    maxLength: 512
                  }
                }
              }
            }
          }
        },
        responses: {
          "201": {
            description: "Booking order created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/BookingOrder" }
                  }
                }
              }
            }
          },
          "409": { description: "Slot unavailable or already booked" }
        }
      }
    },
    [`${config.API_PREFIX}/orders`]: {
      get: {
        tags: ["Booking"],
        summary: "Paginated Booking order list",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
          {
            name: "from",
            in: "query",
            description: "Inclusive ISO 8601 booking start timestamp; requires to",
            schema: { type: "string", format: "date-time" }
          },
          {
            name: "to",
            in: "query",
            description: "Exclusive ISO 8601 booking start timestamp; requires from; maximum window is 93 days",
            schema: { type: "string", format: "date-time" }
          },
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: ["pending", "confirmed", "inService", "completed", "cancelled"]
            }
          }
        ],
        responses: {
          "200": {
            description: "Paginated orders",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: {
                      type: "object",
                      required: ["list", "total", "page", "page_size"],
                      properties: {
                        list: {
                          type: "array",
                          items: { $ref: "#/components/schemas/BookingOrder" }
                        },
                        total: { type: "integer" },
                        page: { type: "integer" },
                        page_size: { type: "integer" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    [`${config.API_PREFIX}/orders/{id}`]: {
      get: {
        tags: ["Booking"],
        summary: "Booking order detail with status history",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Booking order detail" },
          "404": { description: "Order not found" }
        }
      }
    },
    [`${config.API_PREFIX}/orders/{id}/confirm`]: {
      post: {
        tags: ["Booking"],
        summary: "Confirm a pending Booking order",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Order confirmed" },
          "409": { description: "Invalid state transition" }
        }
      }
    },
    [`${config.API_PREFIX}/orders/{id}/cancel`]: {
      post: {
        tags: ["Booking"],
        summary: "Cancel a pending or confirmed Booking order",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  reason: { type: "string", maxLength: 500 }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Order cancelled" },
          "409": { description: "Invalid state transition" }
        }
      }
    },
    [`${config.API_PREFIX}/orders/{id}/start`]: {
      post: {
        tags: ["Booking"],
        summary: "Start service for a confirmed Booking order",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Order moved to inService" },
          "409": { description: "Invalid state transition" }
        }
      }
    },
    [`${config.API_PREFIX}/orders/{id}/complete`]: {
      post: {
        tags: ["Booking"],
        summary: "Complete an inService Booking order",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Order completed" },
          "409": { description: "Invalid state transition" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/orders/{id}/payment/confirm`]: {
      post: {
        tags: ["Booking Payments"],
        summary: "Confirm an onsite or bank-transfer payment in the authenticated shop",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["method", "amountJpy"],
                properties: {
                  method: { type: "string", enum: ["onsite", "bank_transfer"] },
                  amountJpy: { type: "integer", minimum: 1, maximum: 100000000 },
                  reference: { type: ["string", "null"], maxLength: 120 },
                  note: { type: ["string", "null"], maxLength: 500 }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Payment confirmed or identical retry returned" },
          "403": { description: "Order is outside the authenticated shop scope" },
          "409": { description: "Payment state, amount, or retry conflict" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/orders/{id}/payment/refund`]: {
      post: {
        tags: ["Booking Payments"],
        summary: "Mark an authenticated-shop manual payment refunded",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["reason"],
                properties: {
                  reason: { type: "string", minLength: 1, maxLength: 500 },
                  reference: { type: ["string", "null"], maxLength: 120 }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Payment marked refunded or identical retry returned" },
          "409": { description: "Payment is not refundable from its current state" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/orders/{id}/payment/confirm`]: {
      post: {
        tags: ["Booking Payments"],
        summary: "Confirm an onsite or bank-transfer payment as platform operations",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["method", "amountJpy"],
                properties: {
                  method: { type: "string", enum: ["onsite", "bank_transfer"] },
                  amountJpy: { type: "integer", minimum: 1, maximum: 100000000 },
                  reference: { type: ["string", "null"], maxLength: 120 },
                  note: { type: ["string", "null"], maxLength: 500 }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Payment confirmed or identical retry returned" },
          "409": { description: "Payment state, amount, or retry conflict" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/orders/{id}/payment/refund`]: {
      post: {
        tags: ["Booking Payments"],
        summary: "Mark a manual payment refunded as platform operations",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["reason"],
                properties: {
                  reason: { type: "string", minLength: 1, maxLength: 500 },
                  reference: { type: ["string", "null"], maxLength: 120 }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Payment marked refunded or identical retry returned" },
          "409": { description: "Payment is not refundable from its current state" }
        }
      }
    },
    [`${config.API_PREFIX}/wallets/me`]: {
      get: {
        tags: ["Ledger"],
        summary: "Current user's NDP wallet",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Wallet balance",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/Wallet" }
                  }
                }
              }
            }
          }
        }
      }
    },
    [`${config.API_PREFIX}/wallets/{id}/ledger`]: {
      get: {
        tags: ["Ledger"],
        summary: "Paginated wallet ledger entries",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: {
          "200": { description: "Paginated wallet ledger entries" }
        }
      }
    },
    [`${config.API_PREFIX}/wallet-adjustments`]: {
      post: {
        tags: ["Ledger"],
        summary: "Submit an NDP top-up or withdrawal request for the active identity wallet",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["type", "amountNdp", "idempotencyKey"],
                properties: {
                  type: { type: "string", enum: ["topup", "withdrawal"] },
                  amountNdp: { type: "integer", minimum: 1, maximum: 100000000 },
                  idempotencyKey: { type: "string", minLength: 8, maxLength: 160 },
                  bankReference: { type: ["string", "null"], maxLength: 120 },
                  note: { type: ["string", "null"], maxLength: 500 }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Pending wallet adjustment request created" },
          "409": { description: "Idempotency key reused with different input" }
        }
      }
    },
    [`${config.API_PREFIX}/wallet-adjustments/me`]: {
      get: {
        tags: ["Ledger"],
        summary: "List wallet adjustment requests for the active identity wallet",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: { "200": { description: "Paginated wallet adjustment requests" } }
      }
    },
    [`${config.API_PREFIX}/backoffice/wallet-adjustments`]: {
      get: {
        tags: ["Finance"],
        summary: "List wallet adjustment requests for operations review",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "ownerType",
            in: "query",
            schema: { type: "string", enum: ["user", "shop", "platform"] }
          },
          { name: "ownerId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "type", in: "query", schema: { type: "string", enum: ["topup", "withdrawal"] } },
          {
            name: "status",
            in: "query",
            schema: { type: "string", enum: ["pending", "approved", "rejected"] }
          },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: { "200": { description: "Paginated platform wallet adjustment requests" } }
      }
    },
    [`${config.API_PREFIX}/backoffice/wallet-adjustments/{id}/review`]: {
      post: {
        tags: ["Finance"],
        summary: "Approve or reject a pending wallet adjustment request",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["action", "note"],
                properties: {
                  action: { type: "string", enum: ["approve", "reject"] },
                  note: { type: "string", minLength: 1, maxLength: 500 }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Request reviewed; approval atomically mutates the wallet and ledger"
          },
          "404": { description: "Wallet adjustment request not found" },
          "409": { description: "Invalid request state or insufficient available balance" }
        }
      }
    },
    [`${config.API_PREFIX}/finance/ledger/transactions`]: {
      get: {
        tags: ["Finance"],
        summary: "Paginated NDP ledger transactions",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "type", in: "query", schema: { type: "string" } },
          { name: "referenceType", in: "query", schema: { type: "string", maxLength: 80 } },
          { name: "referenceId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: {
          "200": { description: "Paginated ledger transactions" }
        }
      }
    },
    [`${config.API_PREFIX}/finance/fee-rule-sets`]: {
      get: {
        tags: ["Finance Rules"],
        summary: "Paginated NDP dynamic fee rule sets",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "status",
            in: "query",
            schema: { type: "string", enum: ["draft", "active", "paused", "archived"] }
          },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: {
          "200": { description: "Paginated fee rule sets" }
        }
      },
      post: {
        tags: ["Finance Rules"],
        summary: "Create an NDP dynamic fee rule set",
        security: [{ bearerAuth: [] }],
        responses: {
          "201": { description: "Created fee rule set" },
          "403": { description: "Missing finance fee-rule write permission" }
        }
      }
    },
    [`${config.API_PREFIX}/finance/fee-rule-sets/{id}`]: {
      put: {
        tags: ["Finance Rules"],
        summary: "Update an NDP dynamic fee rule set",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Updated fee rule set" },
          "404": { description: "Fee rule set not found" }
        }
      }
    },
    [`${config.API_PREFIX}/finance/fee-rule-sets/{id}/activate`]: {
      post: {
        tags: ["Finance Rules"],
        summary: "Activate an NDP dynamic fee rule set",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Activated fee rule set" }
        }
      }
    },
    [`${config.API_PREFIX}/finance/fee-rule-sets/{id}/pause`]: {
      post: {
        tags: ["Finance Rules"],
        summary: "Pause an NDP dynamic fee rule set",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Paused fee rule set" }
        }
      }
    },
    [`${config.API_PREFIX}/finance/fee-rules/preview`]: {
      post: {
        tags: ["Finance Rules"],
        summary: "Preview a dynamic NDP fee calculation",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Fee calculation preview",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/FeeCalculationResult" }
                  }
                }
              }
            }
          }
        }
      }
    },
    [`${config.API_PREFIX}/finance/fee-calculation-logs`]: {
      get: {
        tags: ["Finance Rules"],
        summary: "Paginated dynamic fee calculation logs",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "bookingOrderId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "feeType", in: "query", schema: { type: "string" } },
          { name: "stage", in: "query", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: {
          "200": { description: "Paginated fee calculation logs" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/dashboard`]: {
      get: {
        tags: ["Step 12 Backoffice"],
        summary: "Operations dashboard from real database aggregates",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Operations dashboard payload" },
          "403": { description: "Missing backoffice dashboard permission" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/orders`]: {
      get: {
        tags: ["Step 12 Backoffice"],
        summary: "Paginated real booking orders for operations admin",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: {
          "200": { description: "Paginated backoffice orders" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/schedule`]: {
      get: {
        tags: ["Step 12 Backoffice"],
        summary: "Paginated real schedule slots for operations admin",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Paginated backoffice schedule slots" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/finance/settlements`]: {
      get: {
        tags: ["Step 12 Backoffice"],
        summary: "Paginated real finance reconciliation rows for operations admin",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Paginated backoffice finance settlements" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/finance/settlements/export`]: {
      get: {
        tags: ["Step 12 Backoffice"],
        summary: "Export operations finance settlements as CSV content",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "CSV export payload" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/technicians`]: {
      get: {
        tags: ["Step 12 Backoffice"],
        summary: "Paginated real technician profiles for operations admin",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Paginated backoffice technicians" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/technician-rankings`]: {
      get: {
        tags: ["Step 12 Backoffice"],
        summary: "Rank technicians by completed-order performance",
        description:
          "Uses Asia/Tokyo calendar boundaries. Revenue is the final completed-order service amount, completed orders are distinct booking orders, and one or more completed orders on a calendar day count as one working day.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "period",
            in: "query",
            schema: {
              type: "string",
              enum: ["today", "last7days", "last30days", "month", "custom", "all"],
              default: "month"
            }
          },
          {
            name: "from",
            in: "query",
            description: "Required with to when period=custom; inclusive Tokyo calendar date.",
            schema: { type: "string", format: "date" }
          },
          {
            name: "to",
            in: "query",
            description: "Required with from when period=custom; inclusive Tokyo calendar date.",
            schema: { type: "string", format: "date" }
          },
          { name: "keyword", in: "query", schema: { type: "string", maxLength: 100 } },
          { name: "shopId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "city", in: "query", schema: { type: "string", maxLength: 100 } },
          {
            name: "sortBy",
            in: "query",
            schema: {
              type: "string",
              enum: ["revenue", "completedOrders", "workingDays"],
              default: "revenue"
            }
          },
          {
            name: "sortOrder",
            in: "query",
            schema: { type: "string", enum: ["asc", "desc"], default: "desc" }
          },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          {
            name: "pageSize",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100 }
          }
        ],
        responses: {
          "200": jsonDataResponse("Paginated technician ranking", {
            $ref: "#/components/schemas/BackofficeTechnicianRanking"
          })
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/technician-rankings/export`]: {
      get: {
        tags: ["Step 12 Backoffice"],
        summary: "Export the filtered technician ranking as CSV content",
        description:
          "Uses the same Asia/Tokyo period and sort order as the ranking list. The response contains at most 5,000 rows of UTF-8 CSV content with a BOM for spreadsheet compatibility.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "period",
            in: "query",
            schema: {
              type: "string",
              enum: ["today", "last7days", "last30days", "month", "custom", "all"],
              default: "month"
            }
          },
          { name: "from", in: "query", schema: { type: "string", format: "date" } },
          { name: "to", in: "query", schema: { type: "string", format: "date" } },
          { name: "keyword", in: "query", schema: { type: "string", maxLength: 100 } },
          { name: "shopId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "city", in: "query", schema: { type: "string", maxLength: 100 } },
          {
            name: "sortBy",
            in: "query",
            schema: {
              type: "string",
              enum: ["revenue", "completedOrders", "workingDays"],
              default: "revenue"
            }
          },
          {
            name: "sortOrder",
            in: "query",
            schema: { type: "string", enum: ["asc", "desc"], default: "desc" }
          }
        ],
        responses: {
          "200": jsonDataResponse("CSV export payload", {
            type: "object",
            required: ["filename", "contentType", "content"],
            properties: {
              filename: { type: "string" },
              contentType: { type: "string", enum: ["text/csv; charset=utf-8"] },
              content: { type: "string" }
            }
          })
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/shops`]: {
      get: {
        tags: ["Step 12 Backoffice"],
        summary: "Paginated real shops for operations admin",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Paginated backoffice shops" }
        }
      },
      post: {
        tags: ["Master Data"],
        summary: "Create a pending shop and merchant owner account",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: [
                  "ownerEmail",
                  "ownerUsername",
                  "ownerPassword",
                  "name",
                  "city",
                  "address"
                ],
                properties: {
                  ownerEmail: { type: "string", format: "email" },
                  ownerUsername: { type: "string" },
                  ownerPassword: { type: "string", minLength: 8 },
                  name: { type: "string", maxLength: 160 },
                  description: { type: ["string", "null"] },
                  city: { type: "string" },
                  address: { type: "string" },
                  phone: { type: ["string", "null"] },
                  isRecommended: { type: "boolean" }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Pending shop created" },
          "409": { description: "Owner email already exists" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/shops/{id}`]: {
      patch: {
        tags: ["Master Data"],
        summary: "Update a shop",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BackofficeShopUpdateInput" }
            }
          }
        },
        responses: {
          "200": { description: "Shop updated" },
          "404": { description: "Shop not found" }
        }
      },
      delete: {
        tags: ["Master Data"],
        summary: "Soft-delete a shop",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Shop soft-deleted" },
          "404": { description: "Shop not found" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/shops/{id}/approve`]: {
      post: {
        tags: ["Master Data"],
        summary: "Approve a shop and activate its owner identity",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Shop approved" },
          "404": { description: "Shop not found" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/technicians/{id}`]: {
      get: {
        tags: ["Master Data"],
        summary: "Technician profile detail",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParameter()],
        responses: {
          "200": jsonDataResponse("Technician detail", {
            $ref: "#/components/schemas/BackofficeTechnicianDetail"
          }),
          "404": { description: "Technician not found" }
        }
      },
      patch: {
        tags: ["Master Data"],
        summary: "Update or assign a technician",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BackofficeTechnicianUpdateInput" }
            }
          }
        },
        responses: {
          "200": { description: "Technician updated" },
          "404": { description: "Technician not found" }
        }
      },
      delete: {
        tags: ["Master Data"],
        summary: "Soft-delete a technician",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Technician soft-deleted" },
          "404": { description: "Technician not found" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/technicians/{id}/approve`]: {
      post: {
        tags: ["Master Data"],
        summary: "Approve and optionally assign a technician",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", properties: { shopId: { type: "integer", minimum: 1 } } }
            }
          }
        },
        responses: {
          "200": { description: "Technician approved" },
          "404": { description: "Technician or shop not found" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/customers`]: {
      get: {
        tags: ["Master Data"],
        summary: "Paginated customer profiles",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Paginated customers" } }
      }
    },
    [`${config.API_PREFIX}/backoffice/customers/{id}`]: {
      get: {
        tags: ["Master Data"],
        summary: "Customer profile detail",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": jsonDataResponse("Customer detail", {
            $ref: "#/components/schemas/BackofficeCustomerDetail"
          }),
          "404": { description: "Customer not found" }
        }
      },
      patch: {
        tags: ["Master Data"],
        summary: "Update a customer profile",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BackofficeCustomerUpdateInput" }
            }
          }
        },
        responses: { "200": { description: "Customer updated" } }
      },
      delete: {
        tags: ["Master Data"],
        summary: "Soft-delete a customer profile",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: { "200": { description: "Customer soft-deleted" } }
      }
    },
    [`${config.API_PREFIX}/backoffice/services`]: {
      get: {
        tags: ["Master Data"],
        summary: "Paginated shop services",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Paginated services" } }
      }
    },
    [`${config.API_PREFIX}/backoffice/shops/{shopId}/services`]: {
      post: {
        tags: ["Master Data"],
        summary: "Create a service for a shop",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "shopId", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BackofficeServiceCreateInput" }
            }
          }
        },
        responses: {
          "201": { description: "Service created" },
          "404": { description: "Shop, category, or technician not found" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/services/{id}`]: {
      patch: {
        tags: ["Master Data"],
        summary: "Update a shop service",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BackofficeServiceUpdateInput" }
            }
          }
        },
        responses: { "200": { description: "Service updated" } }
      },
      delete: {
        tags: ["Master Data"],
        summary: "Soft-delete a shop service",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: { "200": { description: "Service soft-deleted" } }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/dashboard`]: {
      get: {
        tags: ["Step 12 Merchant Admin"],
        summary: "Merchant dashboard scoped to the authenticated shop",
        security: [{ bearerAuth: [] }],
        parameters: [merchantPreviewShopHeaderParameter],
        responses: {
          "200": { description: "Merchant dashboard payload" },
          "403": { description: "Missing merchant scope or permission" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/orders`]: {
      get: {
        tags: ["Step 12 Merchant Admin"],
        summary: "Paginated real booking orders scoped to the authenticated shop",
        security: [{ bearerAuth: [] }],
        parameters: [merchantPreviewShopHeaderParameter],
        responses: {
          "200": { description: "Paginated merchant orders" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/schedule`]: {
      get: {
        tags: ["Step 12 Merchant Admin"],
        summary: "Paginated real schedule slots scoped to the authenticated shop",
        security: [{ bearerAuth: [] }],
        parameters: [merchantPreviewShopHeaderParameter],
        responses: {
          "200": { description: "Paginated merchant schedule slots" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/shops/{shopId}/finance/rules`]: {
      get: {
        tags: ["Merchant Finance Rules"],
        summary: "Current active finance rule set for the authenticated merchant shop",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "shopId", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": {
            description: "Active merchant finance rule set",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/ShopFinanceRuleSet" }
                  }
                }
              }
            }
          },
          "403": { description: "Missing merchant finance rule permission or shop scope" }
        }
      },
      put: {
        tags: ["Merchant Finance Rules"],
        summary: "Create a new active finance rule version for the authenticated merchant shop",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "shopId", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "wageMode"],
                properties: {
                  name: { type: "string", maxLength: 160 },
                  wageMode: {
                    type: "string",
                    enum: ["fixed_per_order", "commission", "base_plus_commission", "hourly"]
                  },
                  baseSalaryJpy: { type: "integer", minimum: 0, default: 0 },
                  hourlyRateJpy: { type: "integer", minimum: 0, default: 0 },
                  dailyRateJpy: { type: "integer", minimum: 0, default: 0 },
                  fixedOrderPayJpy: { type: "integer", minimum: 0, default: 0 },
                  commissionRatePercent: { type: "number", minimum: 0, maximum: 100, default: 60 },
                  guaranteedMinimumJpy: { type: "integer", minimum: 0, default: 0 },
                  ndpFeeBearer: {
                    type: "string",
                    enum: ["shop", "technician", "split"],
                    default: "shop"
                  },
                  technicianNdpSharePercent: {
                    type: "number",
                    minimum: 0,
                    maximum: 100,
                    default: 0
                  },
                  bonusRules: {
                    type: "array",
                    items: { $ref: "#/components/schemas/ShopFinanceAdjustmentRule" }
                  },
                  deductionRules: {
                    type: "array",
                    items: { $ref: "#/components/schemas/ShopFinanceAdjustmentRule" }
                  },
                  effectiveFrom: { type: ["string", "null"], format: "date-time" },
                  effectiveTo: { type: ["string", "null"], format: "date-time" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "New active merchant finance rule set" },
          "403": { description: "Missing merchant finance rule permission or shop scope" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/shops/{shopId}/finance/rules/preview`]: {
      post: {
        tags: ["Merchant Finance Rules"],
        summary: "Preview wage, commission, bonus, and NDP allocation for one order",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "shopId", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["serviceAmountJpy"],
                properties: {
                  serviceAmountJpy: { type: "integer", minimum: 0 },
                  platformFeeNdp: { type: "integer", minimum: 0, default: 500 },
                  workedMinutes: { type: "integer", minimum: 0, default: 60 },
                  monthlyCompletedOrders: { type: "integer", minimum: 0, default: 0 },
                  monthlyServiceGmvJpy: { type: "integer", minimum: 0, default: 0 },
                  ratingAverage: { type: "number", minimum: 0, maximum: 5, default: 0 },
                  lateCancellationCount: { type: "integer", minimum: 0, default: 0 }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Merchant finance rule preview",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/ShopFinanceRulePreviewResult" }
                  }
                }
              }
            }
          },
          "403": { description: "Missing merchant finance rule permission or shop scope" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/finance/orders/{bookingOrderId}`]: {
      get: {
        tags: ["Finance Center"],
        summary: "Get one merchant order money timeline and service income status",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "bookingOrderId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 }
          }
        ],
        responses: {
          "200": {
            description: "Order finance detail",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/OrderFinanceDetail" }
                  }
                }
              }
            }
          },
          "403": { description: "Missing merchant order finance permission or shop scope" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/finance/orders/{bookingOrderId}/service-income-report`]: {
      put: {
        tags: ["Finance Center"],
        summary: "Report and optionally confirm service income for one merchant order",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "bookingOrderId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["serviceAmountJpy"],
                properties: {
                  serviceAmountJpy: { type: "integer", minimum: 0 },
                  platformCollectedServiceAmountJpy: { type: "integer", minimum: 0, default: 0 },
                  offlineReportedServiceAmountJpy: { type: "integer", minimum: 0, default: 0 },
                  paymentChannel: {
                    type: "string",
                    enum: [
                      "unknown",
                      "platform_online",
                      "offline_cash",
                      "offline_card",
                      "bank_transfer",
                      "other"
                    ],
                    default: "unknown"
                  },
                  confirmNow: { type: "boolean", default: false },
                  note: { type: ["string", "null"], maxLength: 500 },
                  proofUrl: { type: ["string", "null"], format: "uri", maxLength: 500 }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Updated order finance detail",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/OrderFinanceDetail" }
                  }
                }
              }
            }
          },
          "403": { description: "Missing income report permission or shop scope" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/finance/orders/{bookingOrderId}`]: {
      get: {
        tags: ["Finance Center"],
        summary: "Get one platform backoffice order money timeline",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "bookingOrderId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 }
          }
        ],
        responses: {
          "200": {
            description: "Order finance detail",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/OrderFinanceDetail" }
                  }
                }
              }
            }
          },
          "403": { description: "Missing backoffice finance order permission" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/shops/{shopId}/technicians/{technicianProfileId}/compensation-profile`]:
      {
        get: {
          tags: ["Finance Center"],
          summary: "Get active technician compensation profile or shop-rule fallback",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "shopId", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
            {
              name: "technicianProfileId",
              in: "path",
              required: true,
              schema: { type: "integer", minimum: 1 }
            }
          ],
          responses: {
            "200": {
              description: "Technician compensation profile",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["code", "message", "data"],
                    properties: {
                      code: { type: "integer", enum: [0] },
                      message: { type: "string", enum: ["success"] },
                      data: { $ref: "#/components/schemas/TechnicianCompensationProfile" }
                    }
                  }
                }
              }
            }
          }
        },
        put: {
          tags: ["Finance Center"],
          summary: "Create a new active technician compensation profile version",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "shopId", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
            {
              name: "technicianProfileId",
              in: "path",
              required: true,
              schema: { type: "integer", minimum: 1 }
            }
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "wageMode"],
                  properties: {
                    name: { type: "string", maxLength: 160 },
                    wageMode: {
                      type: "string",
                      enum: ["fixed_per_order", "commission", "base_plus_commission", "hourly"]
                    },
                    baseSalaryJpy: { type: "integer", minimum: 0, default: 0 },
                    hourlyRateJpy: { type: "integer", minimum: 0, default: 0 },
                    dailyRateJpy: { type: "integer", minimum: 0, default: 0 },
                    fixedOrderPayJpy: { type: "integer", minimum: 0, default: 0 },
                    commissionRatePercent: {
                      type: "number",
                      minimum: 0,
                      maximum: 100,
                      default: 60
                    },
                    guaranteedMinimumJpy: { type: "integer", minimum: 0, default: 0 },
                    ndpFeeBearer: {
                      type: "string",
                      enum: ["shop", "technician", "split"],
                      default: "shop"
                    },
                    technicianNdpSharePercent: {
                      type: "number",
                      minimum: 0,
                      maximum: 100,
                      default: 0
                    },
                    bonusRules: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ShopFinanceAdjustmentRule" }
                    },
                    deductionRules: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ShopFinanceAdjustmentRule" }
                    },
                    effectiveFrom: { type: ["string", "null"], format: "date-time" },
                    effectiveTo: { type: ["string", "null"], format: "date-time" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "New active technician compensation profile" }
          }
        }
      },
    [`${config.API_PREFIX}/merchant-admin/shops/{shopId}/technicians/{technicianProfileId}/compensation-profile/preview`]:
      {
        post: {
          tags: ["Finance Center"],
          summary: "Preview technician compensation profile for one order",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "shopId", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
            {
              name: "technicianProfileId",
              in: "path",
              required: true,
              schema: { type: "integer", minimum: 1 }
            }
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["serviceAmountJpy"],
                  properties: {
                    serviceAmountJpy: { type: "integer", minimum: 0 },
                    platformFeeNdp: { type: "integer", minimum: 0, default: 500 },
                    workedMinutes: { type: "integer", minimum: 0, default: 60 },
                    monthlyCompletedOrders: { type: "integer", minimum: 0, default: 0 },
                    monthlyServiceGmvJpy: { type: "integer", minimum: 0, default: 0 },
                    ratingAverage: { type: "number", minimum: 0, maximum: 5, default: 0 },
                    lateCancellationCount: { type: "integer", minimum: 0, default: 0 }
                  }
                }
              }
            }
          },
          responses: {
            "200": {
              description: "Technician compensation preview",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["code", "message", "data"],
                    properties: {
                      code: { type: "integer", enum: [0] },
                      message: { type: "string", enum: ["success"] },
                      data: { $ref: "#/components/schemas/CompensationProfilePreviewResult" }
                    }
                  }
                }
              }
            }
          }
        }
      },
    [`${config.API_PREFIX}/merchant-admin/pay-runs`]: {
      get: {
        tags: ["Payroll Center"],
        summary: "Paginated merchant pay runs",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Paginated merchant pay runs" },
          "403": { description: "Missing merchant payroll read permission" }
        }
      },
      post: {
        tags: ["Payroll Center"],
        summary: "Generate a merchant pay run draft from completed Booking finance",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["shopId", "periodStart", "periodEnd"],
                properties: {
                  shopId: { type: "integer", minimum: 1 },
                  periodStart: { type: "string", format: "date-time" },
                  periodEnd: { type: "string", format: "date-time" },
                  manualLines: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["technicianProfileId", "lineType", "title", "amountJpy"],
                      properties: {
                        technicianProfileId: { type: "integer", minimum: 1 },
                        lineType: {
                          type: "string",
                          enum: [
                            "base_salary",
                            "bonus",
                            "allowance",
                            "deduction",
                            "adjustment",
                            "guarantee_topup"
                          ]
                        },
                        title: { type: "string", maxLength: 180 },
                        amountJpy: { type: "integer" },
                        explanation: { type: ["string", "null"], maxLength: 500 }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Generated pay run draft",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/PayRun" }
                  }
                }
              }
            }
          },
          "403": { description: "Missing merchant payroll write permission or shop scope" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/pay-runs/export`]: {
      get: {
        tags: ["Payroll Center"],
        summary: "Export merchant pay runs as CSV content",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": payrollCsvResponse("Pay run CSV download"),
          "403": { description: "Missing merchant payroll read permission" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/pay-runs/{id}`]: {
      get: {
        tags: ["Payroll Center"],
        summary: "Get merchant pay run detail",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Pay run detail" },
          "403": { description: "Missing merchant payroll read permission or shop scope" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/pay-runs/{id}/recalculate`]: {
      post: {
        tags: ["Payroll Center"],
        summary: "Recalculate a draft merchant pay run",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Recalculated pay run draft" },
          "409": { description: "Pay run is already published or locked" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/pay-runs/{id}/publish`]: {
      post: {
        tags: ["Payroll Center"],
        summary: "Publish a merchant pay run to technicians",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: { "200": { description: "Published pay run" } }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/pay-runs/{id}/approve`]: {
      post: {
        tags: ["Payroll Center"],
        summary: "Approve a merchant pay run after technician review",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: { "200": { description: "Approved pay run" } }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/pay-runs/{id}/lock`]: {
      post: {
        tags: ["Payroll Center"],
        summary: "Lock and archive a merchant pay run",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: { "200": { description: "Locked pay run" } }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/payslips/{id}/payout-records`]: {
      post: {
        tags: ["Payroll Center"],
        summary: "Record a merchant payslip payout",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["amountJpy", "payoutMethod", "payoutDate"],
                properties: {
                  amountJpy: { type: "integer", minimum: 1 },
                  payoutMethod: {
                    type: "string",
                    enum: ["bank_transfer", "cash", "ndp", "external", "mixed", "other"]
                  },
                  payoutDate: { type: "string", format: "date-time" },
                  referenceNo: { type: ["string", "null"], maxLength: 120 },
                  proofUrl: { type: ["string", "null"], format: "uri", maxLength: 500 },
                  note: { type: ["string", "null"], maxLength: 500 }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Updated payslip with payout record",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/Payslip" }
                  }
                }
              }
            }
          }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/payslips/{id}/resolve-dispute`]: {
      post: {
        tags: ["Payroll Center"],
        summary: "Resolve a disputed merchant payslip and reopen technician confirmation",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["resolutionNote"],
                properties: {
                  resolutionNote: { type: "string", minLength: 1, maxLength: 500 }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Resolved payslip dispute",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/Payslip" }
                  }
                }
              }
            }
          },
          "403": { description: "Missing merchant payroll dispute resolve permission" },
          "409": { description: "Payslip is not currently disputed" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/payroll-adjustments`]: {
      get: {
        tags: ["Payroll Center"],
        summary: "Paginated merchant payroll adjustment requests",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Paginated payroll adjustment requests" },
          "403": { description: "Missing merchant payroll adjustment read permission" }
        }
      },
      post: {
        tags: ["Payroll Center"],
        summary: "Create a merchant payroll bonus, allowance, deduction, or adjustment request",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: [
                  "shopId",
                  "technicianProfileId",
                  "periodStart",
                  "periodEnd",
                  "adjustmentType",
                  "title",
                  "amountJpy",
                  "reason"
                ],
                properties: {
                  shopId: { type: "integer", minimum: 1 },
                  technicianProfileId: { type: "integer", minimum: 1 },
                  periodStart: { type: "string", format: "date-time" },
                  periodEnd: { type: "string", format: "date-time" },
                  adjustmentType: {
                    type: "string",
                    enum: ["bonus", "allowance", "deduction", "adjustment"]
                  },
                  title: { type: "string", maxLength: 180 },
                  amountJpy: { type: "integer" },
                  reason: { type: "string", minLength: 1, maxLength: 500 },
                  proofUrl: { type: ["string", "null"], format: "uri", maxLength: 500 }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Created payroll adjustment request",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/PayrollAdjustmentRequest" }
                  }
                }
              }
            }
          },
          "403": {
            description: "Missing merchant payroll adjustment write permission or shop scope"
          }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/payroll-adjustments/{id}/submit`]: {
      post: {
        tags: ["Payroll Center"],
        summary: "Submit a draft merchant payroll adjustment request",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: { "200": { description: "Submitted payroll adjustment request" } }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/payroll-adjustments/{id}/approve`]: {
      post: {
        tags: ["Payroll Center"],
        summary: "Approve a submitted merchant payroll adjustment request",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: { "200": { description: "Approved payroll adjustment request" } }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/payroll-adjustments/{id}/reject`]: {
      post: {
        tags: ["Payroll Center"],
        summary: "Reject a submitted merchant payroll adjustment request",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["reason"],
                properties: { reason: { type: "string", minLength: 1, maxLength: 500 } }
              }
            }
          }
        },
        responses: { "200": { description: "Rejected payroll adjustment request" } }
      }
    },
    [`${config.API_PREFIX}/technician/payslips`]: {
      get: {
        tags: ["Payroll Center"],
        summary: "Paginated current technician payslips",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Paginated technician payslips" },
          "403": { description: "Missing technician payslip read permission" }
        }
      }
    },
    [`${config.API_PREFIX}/technician/payslips/export`]: {
      get: {
        tags: ["Payroll Center"],
        summary: "Export current technician payslips as CSV content",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": payrollCsvResponse("Payslip CSV download"),
          "403": { description: "Missing technician payslip read permission" }
        }
      }
    },
    [`${config.API_PREFIX}/technician/payslips/{id}`]: {
      get: {
        tags: ["Payroll Center"],
        summary: "Get current technician payslip detail",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: { "200": { description: "Technician payslip detail" } }
      }
    },
    [`${config.API_PREFIX}/technician/payslips/{id}/confirm`]: {
      post: {
        tags: ["Payroll Center"],
        summary: "Confirm current technician payslip",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: { "200": { description: "Confirmed payslip" } }
      }
    },
    [`${config.API_PREFIX}/technician/payslips/{id}/dispute`]: {
      post: {
        tags: ["Payroll Center"],
        summary: "Dispute current technician payslip",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["reason"],
                properties: { reason: { type: "string", minLength: 1, maxLength: 500 } }
              }
            }
          }
        },
        responses: { "200": { description: "Disputed payslip" } }
      }
    },
    [`${config.API_PREFIX}/technician/payslips/{payslipId}/payout-records/{payoutRecordId}/confirm`]:
      {
        post: {
          tags: ["Payroll Center"],
          summary: "Confirm current technician payout record receipt",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "payslipId",
              in: "path",
              required: true,
              schema: { type: "integer", minimum: 1 }
            },
            {
              name: "payoutRecordId",
              in: "path",
              required: true,
              schema: { type: "integer", minimum: 1 }
            }
          ],
          responses: {
            "200": {
              description: "Updated payslip with technician-confirmed payout record",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["code", "message", "data"],
                    properties: {
                      code: { type: "integer", enum: [0] },
                      message: { type: "string", enum: ["success"] },
                      data: { $ref: "#/components/schemas/Payslip" }
                    }
                  }
                }
              }
            },
            "403": { description: "Missing technician payout record confirm permission" },
            "404": { description: "Payout record not found for this payslip" }
          }
        }
      },
    [`${config.API_PREFIX}/backoffice/pay-runs`]: {
      get: {
        tags: ["Payroll Center"],
        summary: "Paginated platform pay runs for backoffice read-only finance review",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Paginated backoffice pay runs" },
          "403": { description: "Missing backoffice payroll read permission" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/pay-runs/export`]: {
      get: {
        tags: ["Payroll Center"],
        summary: "Export platform pay runs as CSV content",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": payrollCsvResponse("Pay run CSV download"),
          "403": { description: "Missing backoffice payroll read permission" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/finance/settlements`]: {
      get: {
        tags: ["Step 12 Merchant Admin"],
        summary: "Paginated real finance reconciliation rows scoped to the authenticated shop",
        security: [{ bearerAuth: [] }],
        parameters: [merchantPreviewShopHeaderParameter],
        responses: {
          "200": { description: "Paginated merchant finance settlements" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/finance/settlements/export`]: {
      get: {
        tags: ["Step 12 Merchant Admin"],
        summary: "Export merchant finance settlements as CSV content",
        security: [{ bearerAuth: [] }],
        parameters: [merchantPreviewShopHeaderParameter],
        responses: {
          "200": { description: "CSV export payload" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/technicians`]: {
      get: {
        tags: ["Step 12 Merchant Admin"],
        summary: "Paginated real technician profiles scoped to the authenticated shop",
        security: [{ bearerAuth: [] }],
        parameters: [merchantPreviewShopHeaderParameter],
        responses: {
          "200": { description: "Paginated merchant technicians" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/shop`]: {
      get: {
        tags: ["Step 12 Merchant Admin"],
        summary: "Current authenticated shop profile",
        security: [{ bearerAuth: [] }],
        parameters: [merchantPreviewShopHeaderParameter],
        responses: {
          "200": { description: "Current merchant shop payload" }
        }
      },
      patch: {
        tags: ["Step 12 Merchant Admin"],
        summary: "Update the current authenticated shop profile",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MerchantShopUpdateInput" }
            }
          }
        },
        responses: {
          "200": { description: "Current merchant shop updated" },
          "404": { description: "Current merchant shop not found" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/technicians/{id}`]: {
      get: {
        tags: ["Master Data"],
        summary: "Technician profile detail scoped to the authenticated shop",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParameter()],
        responses: {
          "200": jsonDataResponse("Scoped technician detail", {
            $ref: "#/components/schemas/BackofficeTechnicianDetail"
          }),
          "404": { description: "Technician not in current shop" }
        }
      },
      patch: {
        tags: ["Master Data"],
        summary: "Update a technician scoped to the authenticated shop",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BackofficeTechnicianUpdateInput" }
            }
          }
        },
        responses: {
          "200": { description: "Technician updated" },
          "404": { description: "Technician not in current shop" }
        }
      },
      delete: {
        tags: ["Master Data"],
        summary: "Soft-delete a technician scoped to the authenticated shop",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Technician soft-deleted" },
          "404": { description: "Technician not in current shop" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/technicians/{id}/approve`]: {
      post: {
        tags: ["Master Data"],
        summary: "Approve an already assigned technician in the authenticated shop",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Technician approved" },
          "404": { description: "Technician not in current shop" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/customers`]: {
      get: {
        tags: ["Master Data"],
        summary: "Paginated customers with bookings in the authenticated shop",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Paginated scoped customers" } }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/customers/{id}`]: {
      get: {
        tags: ["Master Data"],
        summary: "Customer detail scoped by bookings in the authenticated shop",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": jsonDataResponse("Scoped customer detail", {
            $ref: "#/components/schemas/BackofficeCustomerDetail"
          }),
          "404": { description: "Customer not visible to current shop" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/services`]: {
      get: {
        tags: ["Master Data"],
        summary: "Paginated services in the authenticated shop",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Paginated scoped services" } }
      },
      post: {
        tags: ["Master Data"],
        summary: "Create a service in the authenticated shop",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BackofficeServiceCreateInput" }
            }
          }
        },
        responses: {
          "201": { description: "Service created" },
          "404": { description: "Category or technician not found in current shop" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/services/{id}`]: {
      patch: {
        tags: ["Master Data"],
        summary: "Update a service in the authenticated shop",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BackofficeServiceUpdateInput" }
            }
          }
        },
        responses: {
          "200": { description: "Service updated" },
          "404": { description: "Service not in current shop" }
        }
      },
      delete: {
        tags: ["Master Data"],
        summary: "Soft-delete a service in the authenticated shop",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Service soft-deleted" },
          "404": { description: "Service not in current shop" }
        }
      }
    },
    [`${config.API_PREFIX}/identity-applications/mine`]: {
      get: identityWorkflowOperation("List the authenticated user's identity applications", {
        parameters: [
          {
            name: "type",
            in: "query",
            schema: { type: "string", enum: ["technician", "merchant"] }
          },
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: ["draft", "submitted", "under_review", "approved", "rejected", "withdrawn"]
            }
          },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "page_size", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ]
      })
    },
    [`${config.API_PREFIX}/merchants/search`]: {
      get: identityWorkflowOperation("Search eligible shops by address, merchant ID, or name", {
        parameters: [
          {
            name: "query",
            in: "query",
            required: true,
            schema: { type: "string", minLength: 1, maxLength: 160 }
          },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "page_size", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ]
      })
    },
    [`${config.API_PREFIX}/identity-applications/technician`]: {
      post: identityWorkflowOperation("Create a technician application draft", {
        requestBody: identityJsonBody(
          {
            targetShopId: { type: "integer", minimum: 1 },
            applicantName: { type: "string", minLength: 1, maxLength: 120 }
          },
          ["targetShopId", "applicantName"]
        )
      })
    },
    [`${config.API_PREFIX}/identity-applications/{id}/technician-profile`]: {
      patch: identityWorkflowOperation("Update technician application profile", {
        parameters: [idPathParameter()],
        requestBody: identityJsonBody(
          {
            expectedVersion: { type: "integer", minimum: 1 },
            targetShopId: { type: "integer", minimum: 1 },
            applicantName: { type: "string", minLength: 1, maxLength: 120 },
            phone: { type: ["string", "null"], maxLength: 32 },
            city: { type: ["string", "null"], maxLength: 100 },
            serviceAreas: {
              type: "array",
              maxItems: 30,
              items: { type: "string", maxLength: 100 }
            },
            skills: { type: "array", maxItems: 50, items: { type: "string", maxLength: 100 } },
            yearsExperience: { type: ["integer", "null"], minimum: 0, maximum: 80 },
            bio: { type: ["string", "null"], maxLength: 2000 },
            gender: { type: ["string", "null"], maxLength: 32 },
            birthDate: { type: ["string", "null"], format: "date" }
          },
          [
            "expectedVersion",
            "targetShopId",
            "applicantName",
            "phone",
            "city",
            "serviceAreas",
            "skills",
            "yearsExperience",
            "bio",
            "gender",
            "birthDate"
          ]
        )
      })
    },
    [`${config.API_PREFIX}/identity-applications/merchant`]: {
      post: identityWorkflowOperation("Create a merchant application draft", {
        requestBody: identityJsonBody(
          {
            applicantKind: { type: "string", enum: ["corporate", "individual"] },
            corporateLegalName: { type: ["string", "null"], maxLength: 191 },
            corporateLegalNameKana: { type: ["string", "null"], maxLength: 191 },
            representativeName: { type: "string", minLength: 1, maxLength: 120 },
            representativeNameKana: { type: "string", minLength: 1, maxLength: 191 },
            shopName: { type: "string", minLength: 1, maxLength: 160 },
            businessAddress: { type: "string", minLength: 1, maxLength: 255 },
            contactPhone: { type: "string", minLength: 1, maxLength: 32 },
            responsiblePersonName: { type: "string", minLength: 1, maxLength: 120 },
            showcaseDraft: { type: "object", additionalProperties: true }
          },
          [
            "applicantKind",
            "corporateLegalName",
            "corporateLegalNameKana",
            "representativeName",
            "representativeNameKana",
            "shopName",
            "businessAddress",
            "contactPhone",
            "responsiblePersonName",
            "showcaseDraft"
          ]
        )
      })
    },
    [`${config.API_PREFIX}/identity-applications/{id}/merchant-showcase`]: {
      patch: identityWorkflowOperation("Update the merchant service-showcase draft", {
        parameters: [idPathParameter()],
        requestBody: identityJsonBody(
          {
            expectedVersion: { type: "integer", minimum: 1 },
            applicantKind: { type: "string", enum: ["corporate", "individual"] },
            corporateLegalName: { type: ["string", "null"], maxLength: 191 },
            corporateLegalNameKana: { type: ["string", "null"], maxLength: 191 },
            representativeName: { type: "string", minLength: 1, maxLength: 120 },
            representativeNameKana: { type: "string", minLength: 1, maxLength: 191 },
            shopName: { type: "string", minLength: 1, maxLength: 160 },
            businessAddress: { type: "string", minLength: 1, maxLength: 255 },
            contactPhone: { type: "string", minLength: 1, maxLength: 32 },
            responsiblePersonName: { type: "string", minLength: 1, maxLength: 120 },
            showcaseDraft: { type: "object", additionalProperties: true }
          },
          [
            "expectedVersion",
            "applicantKind",
            "corporateLegalName",
            "corporateLegalNameKana",
            "representativeName",
            "representativeNameKana",
            "shopName",
            "businessAddress",
            "contactPhone",
            "responsiblePersonName",
            "showcaseDraft"
          ]
        )
      })
    },
    [`${config.API_PREFIX}/identity-applications/{id}/merchant-bank-account`]: {
      patch: identityWorkflowOperation("Bind a verified settlement account to a merchant draft", {
        parameters: [idPathParameter()],
        requestBody: identityJsonBody(
          {
            expectedVersion: { type: "integer", minimum: 1 },
            bankCode: { type: "string", pattern: "^\\d{4}$" },
            bankName: { type: "string", minLength: 1, maxLength: 120 },
            branchCode: { type: "string", pattern: "^\\d{3}$" },
            branchName: { type: "string", minLength: 1, maxLength: 120 },
            accountType: { type: "string", enum: ["ordinary", "current"] },
            accountNumber: { type: "string", pattern: "^\\d{4,12}$" },
            accountHolderName: { type: "string", minLength: 1, maxLength: 191 }
          },
          [
            "expectedVersion",
            "bankCode",
            "bankName",
            "branchCode",
            "branchName",
            "accountType",
            "accountNumber",
            "accountHolderName"
          ]
        )
      })
    },
    [`${config.API_PREFIX}/identity-applications/{id}/merchant-contract-acceptance`]: {
      post: identityWorkflowOperation("Accept and bind the current merchant contract", {
        parameters: [idPathParameter()],
        requestBody: identityJsonBody(
          {
            expectedVersion: { type: "integer", minimum: 1 },
            contractVersion: { type: "string", minLength: 1, maxLength: 80 },
            contentHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
            language: { type: "string", enum: ["zh-CN", "ja", "en"] },
            hasRead: { type: "boolean", enum: [true] },
            hasAgreed: { type: "boolean", enum: [true] }
          },
          ["expectedVersion", "contractVersion", "contentHash", "language", "hasRead", "hasAgreed"]
        )
      })
    },
    [`${config.API_PREFIX}/identity-applications/{id}/media`]: {
      post: identityWorkflowOperation("Upload protected application JPEG or PNG media", {
        parameters: [
          idPathParameter(),
          {
            name: "purpose",
            in: "query",
            required: true,
            schema: { type: "string", maxLength: 50 }
          },
          {
            name: "expected_version",
            in: "query",
            required: true,
            schema: { type: "integer", minimum: 1 }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "image/jpeg": { schema: { type: "string", format: "binary", maxLength: 8388608 } },
            "image/png": { schema: { type: "string", format: "binary", maxLength: 8388608 } }
          }
        }
      })
    },
    [`${config.API_PREFIX}/identity-applications/{id}/media/{mediaId}`]: {
      get: identityWorkflowOperation("Read protected application media in authorized scope", {
        parameters: [idPathParameter(), idPathParameter("mediaId")]
      })
    },
    [`${config.API_PREFIX}/identity-applications/{id}/submit`]: {
      post: identityWorkflowOperation("Submit and lock an identity application snapshot", {
        parameters: [idPathParameter()],
        requestBody: applicationVersionBody
      })
    },
    [`${config.API_PREFIX}/identity-applications/{id}/withdraw`]: {
      post: identityWorkflowOperation(
        "Withdraw an identity application and start 30-day retention",
        {
          parameters: [idPathParameter()],
          requestBody: applicationVersionBody
        }
      )
    },
    [`${config.API_PREFIX}/contracts/affiliate/current`]: {
      get: identityWorkflowOperation("Get the current affiliate rules and binding NeeDo contract", {
        parameters: [
          {
            name: "language",
            in: "query",
            schema: { type: "string", enum: ["zh-CN", "ja", "en"], default: "zh-CN" }
          }
        ]
      })
    },
    [`${config.API_PREFIX}/contracts/merchant/current`]: {
      get: identityWorkflowOperation("Get the current merchant rules and binding NeeDo contract", {
        parameters: [
          {
            name: "language",
            in: "query",
            schema: { type: "string", enum: ["zh-CN", "ja", "en"], default: "zh-CN" }
          }
        ]
      })
    },
    [`${config.API_PREFIX}/contracts/acceptances/{receiptId}/receipt`]: {
      get: identityWorkflowOperation("Get the authenticated user's immutable contract receipt", {
        parameters: [
          {
            name: "receiptId",
            in: "path",
            required: true,
            schema: { type: "string", minLength: 1, maxLength: 191 }
          }
        ]
      })
    },
    [`${config.API_PREFIX}/identity-activations/affiliate`]: {
      post: {
        ...identityWorkflowOperation(
          "Accept the affiliate contract and activate the affiliate identity",
          {
            requestBody: identityJsonBody(
              {
                contractVersion: { type: "string", minLength: 1, maxLength: 80 },
                contentHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
                language: { type: "string", enum: ["zh-CN", "ja", "en"] },
                hasRead: { type: "boolean", enum: [true] },
                hasAgreed: { type: "boolean", enum: [true] }
              },
              ["contractVersion", "contentHash", "language", "hasRead", "hasAgreed"]
            )
          }
        ),
        responses: {
          "200": jsonDataResponse("Activated affiliate identity and profile", {
            $ref: "#/components/schemas/AffiliateIdentityActivation"
          }),
          "400": { description: "Invalid contract acknowledgements" },
          "401": { description: "Missing or invalid access token" },
          "403": { description: "Missing contract acceptance permission" },
          "404": { description: "Current affiliate contract not found" },
          "409": { description: "Contract version or activation state conflict" }
        }
      }
    },
    [`${config.API_PREFIX}/bank-accounts/affiliate-withdrawal`]: {
      put: identityWorkflowOperation("Bind an eKYC-matched affiliate withdrawal bank account", {
        requestBody: identityJsonBody(
          {
            bankCode: { type: "string", pattern: "^\\d{4}$" },
            bankName: { type: "string", minLength: 1, maxLength: 120 },
            branchCode: { type: "string", pattern: "^\\d{3}$" },
            branchName: { type: "string", minLength: 1, maxLength: 120 },
            accountType: { type: "string", enum: ["ordinary", "current"] },
            accountNumber: { type: "string", pattern: "^\\d{4,12}$" },
            accountHolderName: { type: "string", minLength: 1, maxLength: 191 }
          },
          [
            "bankCode",
            "bankName",
            "branchCode",
            "branchName",
            "accountType",
            "accountNumber",
            "accountHolderName"
          ]
        )
      })
    },
    [`${config.API_PREFIX}/merchant/technician-applications`]: {
      get: identityWorkflowOperation("List technician applications for the authenticated shop", {
        parameters: [
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: ["submitted", "under_review", "approved", "rejected", "withdrawn"]
            }
          },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "page_size", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ]
      })
    },
    [`${config.API_PREFIX}/merchant/technician-applications/{id}`]: {
      get: identityWorkflowOperation("Get a technician application in the authenticated shop", {
        parameters: [idPathParameter()]
      })
    },
    [`${config.API_PREFIX}/merchant/technician-applications/{id}/approve`]: {
      post: identityWorkflowOperation("Approve technician onboarding", {
        parameters: [idPathParameter()],
        requestBody: applicationVersionBody
      })
    },
    [`${config.API_PREFIX}/merchant/technician-applications/{id}/reject`]: {
      post: identityWorkflowOperation("Reject technician onboarding with a reason", {
        parameters: [idPathParameter()],
        requestBody: identityJsonBody(
          {
            expectedVersion: { type: "integer", minimum: 1 },
            rejectionReason: { type: "string", minLength: 1, maxLength: 1000 }
          },
          ["expectedVersion", "rejectionReason"]
        )
      })
    },
    [`${config.API_PREFIX}/merchant/technician-applications/{id}/contact`]: {
      post: identityWorkflowOperation("Create mutual contacts and open technician applicant chat", {
        parameters: [idPathParameter()],
        requestBody: identityJsonBody({}, [])
      })
    },
    [`${config.API_PREFIX}/merchant/technician-applications/{id}/resume.xlsx`]: {
      get: identityWorkflowOperation(
        "Download the application as an XLSX resume with embedded photos",
        {
          parameters: [idPathParameter()]
        }
      )
    },
    [`${config.API_PREFIX}/ops/merchant-applications`]: {
      get: identityWorkflowOperation("List merchant applications for operations review", {
        parameters: [
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: ["submitted", "under_review", "approved", "rejected", "withdrawn"]
            }
          },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "page_size", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ]
      })
    },
    [`${config.API_PREFIX}/ops/merchant-applications/{id}`]: {
      get: identityWorkflowOperation(
        "Get merchant application, masked bank data, and authorized documents",
        {
          parameters: [idPathParameter()]
        }
      )
    },
    [`${config.API_PREFIX}/ops/merchant-applications/{id}/approve`]: {
      post: identityWorkflowOperation(
        "Approve merchant identity, shop, billing, and trial atomically",
        {
          parameters: [idPathParameter()],
          requestBody: applicationVersionBody
        }
      )
    },
    [`${config.API_PREFIX}/ops/merchant-applications/{id}/reject`]: {
      post: identityWorkflowOperation("Reject merchant application with a reason", {
        parameters: [idPathParameter()],
        requestBody: identityJsonBody(
          {
            expectedVersion: { type: "integer", minimum: 1 },
            rejectionReason: { type: "string", minLength: 1, maxLength: 1000 }
          },
          ["expectedVersion", "rejectionReason"]
        )
      })
    },
    [`${config.API_PREFIX}/merchant-admin/schedule/slots`]: {
      get: {
        tags: ["Schedule"],
        summary: "Paginated schedule slots scoped to the authenticated shop",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "from",
            in: "query",
            required: true,
            schema: { type: "string", format: "date-time" }
          },
          {
            name: "to",
            in: "query",
            required: true,
            schema: { type: "string", format: "date-time" }
          },
          { name: "serviceId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "technicianProfileId", in: "query", schema: { type: "integer", minimum: 1 } },
          {
            name: "status",
            in: "query",
            schema: { type: "string", enum: ["available", "booked", "blocked"] }
          },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: { "200": { description: "Paginated shop schedule slots" } }
      },
      post: {
        tags: ["Schedule"],
        summary: "Create a bookable slot in the authenticated shop",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ScheduleSlotCreateInput" } }
          }
        },
        responses: {
          "201": { description: "Schedule slot created" },
          "404": { description: "Service or technician not found in the current shop" },
          "409": { description: "Overlapping slot or duration mismatch" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/schedule/slots/{id}`]: {
      patch: {
        tags: ["Schedule"],
        summary: "Update a schedule slot in the authenticated shop",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ScheduleSlotUpdateInput" } }
          }
        },
        responses: {
          "200": { description: "Schedule slot updated" },
          "404": { description: "Slot not found in current shop" },
          "409": { description: "Overlap or slot already in use" }
        }
      },
      delete: {
        tags: ["Schedule"],
        summary: "Soft-delete an unused schedule slot in the authenticated shop",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Schedule slot soft-deleted" },
          "404": { description: "Slot not found in current shop" },
          "409": { description: "Slot has an active booking" }
        }
      }
    },
    [`${config.API_PREFIX}/technician/schedule/slots`]: {
      get: {
        tags: ["Schedule"],
        summary: "Paginated schedule slots scoped to the authenticated technician",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "from",
            in: "query",
            required: true,
            schema: { type: "string", format: "date-time" }
          },
          {
            name: "to",
            in: "query",
            required: true,
            schema: { type: "string", format: "date-time" }
          },
          { name: "serviceId", in: "query", schema: { type: "integer", minimum: 1 } },
          {
            name: "status",
            in: "query",
            schema: { type: "string", enum: ["available", "booked", "blocked"] }
          },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: { "200": { description: "Paginated technician schedule slots" } }
      },
      post: {
        tags: ["Schedule"],
        summary: "Create a bookable slot for the authenticated technician",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ScheduleSlotCreateInput" } }
          }
        },
        responses: {
          "201": { description: "Schedule slot created" },
          "404": { description: "Technician or shop service not found" },
          "409": { description: "Overlapping slot or duration mismatch" }
        }
      }
    },
    [`${config.API_PREFIX}/technician/schedule/slots/{id}`]: {
      get: {
        tags: ["Schedule"],
        summary: "Read a schedule slot owned by the authenticated technician",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": jsonDataResponse("Technician-owned schedule slot", {
            $ref: "#/components/schemas/ScheduleSlot"
          }),
          "400": { description: "Invalid schedule slot identifier" },
          "401": { description: "Authentication required" },
          "403": { description: "Technician schedule read permission required" },
          "404": { description: "Slot not found for current technician" }
        }
      },
      patch: {
        tags: ["Schedule"],
        summary: "Update a schedule slot owned by the authenticated technician",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ScheduleSlotUpdateInput" } }
          }
        },
        responses: {
          "200": { description: "Schedule slot updated" },
          "404": { description: "Slot not found for current technician" },
          "409": { description: "Overlap or slot already in use" }
        }
      },
      delete: {
        tags: ["Schedule"],
        summary: "Soft-delete an unused slot owned by the authenticated technician",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Schedule slot soft-deleted" },
          "404": { description: "Slot not found for current technician" },
          "409": { description: "Slot has an active booking" }
        }
      }
    },
    [`${config.API_PREFIX}/im/conversations`]: {
      get: {
        tags: ["Step 13 Realtime"],
        summary: "Paginated IM conversations with unread counts",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: {
          "200": { description: "Paginated conversations" }
        }
      },
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Create a direct or group conversation",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["participantUserIds"],
                properties: {
                  type: { type: "string", enum: ["direct", "group"], default: "direct" },
                  title: { type: "string", maxLength: 120 },
                  participantUserIds: {
                    type: "array",
                    minItems: 1,
                    maxItems: 50,
                    items: { type: "integer", minimum: 1 }
                  }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Created conversation" }
        }
      }
    },
    [`${config.API_PREFIX}/im/conversations/{conversationId}`]: {
      delete: {
        tags: ["Step 13 Realtime"],
        summary:
          "Hide a conversation from the current participant without deleting shared messages",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "conversationId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 }
          }
        ],
        responses: {
          "200": { description: "Conversation hidden for the current participant" },
          "404": { description: "Conversation not found for current participant" }
        }
      }
    },
    [`${config.API_PREFIX}/im/conversations/{conversationId}/preferences`]: {
      patch: {
        tags: ["Step 13 Realtime"],
        summary: "Update the current participant's pin or mute preferences",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "conversationId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  isPinned: { type: "boolean" },
                  isMuted: { type: "boolean" }
                },
                minProperties: 1
              }
            }
          }
        },
        responses: {
          "200": { description: "Updated participant preferences" },
          "404": { description: "Conversation not found for current participant" }
        }
      }
    },
    [`${config.API_PREFIX}/im/conversations/{conversationId}/messages`]: {
      get: {
        tags: ["Step 13 Realtime"],
        summary: "Cursor-paginated IM message history",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "conversationId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 }
          },
          { name: "beforeId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: {
          "200": { description: "Message history page with nextCursor" }
        }
      },
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Send an IM message",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "conversationId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["content"],
                properties: {
                  type: {
                    type: "string",
                    enum: ["text", "system", "orderStatus"],
                    default: "text"
                  },
                  content: { type: "string", minLength: 1, maxLength: 4000 },
                  metadata: { type: "object", additionalProperties: true }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Created message" }
        }
      }
    },
    [`${config.API_PREFIX}/im/conversations/{conversationId}/messages/{messageId}/recall`]: {
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Recall the current user's IM message within the authoritative window",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "conversationId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 }
          },
          {
            name: "messageId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["mode"],
                additionalProperties: false,
                properties: {
                  mode: { type: "string", enum: ["standard"] }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Content-free standard recall tombstone",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: {
                      type: "object",
                      required: ["action", "conversationId", "messageId", "message"],
                      properties: {
                        action: { type: "string", enum: ["standard_recall"] },
                        conversationId: { type: "integer" },
                        messageId: { type: "integer" },
                        message: { $ref: "#/components/schemas/RealtimeMessage" }
                      }
                    }
                  }
                }
              }
            }
          },
          "400": { description: "Recall window expired or request mode invalid" },
          "403": { description: "Missing message:recall permission" },
          "404": { description: "Conversation or owned message not found" }
        }
      }
    },
    [`${config.API_PREFIX}/im/conversations/{conversationId}/messages/{messageId}/reactions`]: {
      put: {
        tags: ["Step 13 Realtime"],
        summary: "Add the current user's reaction to an IM message",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "conversationId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 }
          },
          {
            name: "messageId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["emoji"],
                properties: { emoji: { type: "string", minLength: 1, maxLength: 32 } }
              }
            }
          }
        },
        responses: {
          "200": { description: "Updated message with persisted reactions" },
          "404": { description: "Conversation or message not found" }
        }
      },
      delete: {
        tags: ["Step 13 Realtime"],
        summary: "Remove the current user's reaction from an IM message",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "conversationId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 }
          },
          {
            name: "messageId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["emoji"],
                properties: { emoji: { type: "string", minLength: 1, maxLength: 32 } }
              }
            }
          }
        },
        responses: {
          "200": { description: "Updated message after reaction removal" },
          "404": { description: "Conversation or message not found" }
        }
      }
    },
    [`${config.API_PREFIX}/im/conversations/{conversationId}/read`]: {
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Mark a conversation as read for the current user",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "conversationId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 }
          }
        ],
        responses: {
          "200": { description: "Conversation read state" }
        }
      }
    },
    [`${config.API_PREFIX}/im/conversations/{conversationId}/unread`]: {
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Mark a conversation as unread for the current user",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "conversationId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 }
          }
        ],
        responses: {
          "200": { description: "Conversation unread state" },
          "404": { description: "Conversation not found for current participant" }
        }
      }
    },
    [`${config.API_PREFIX}/im/contacts`]: {
      get: {
        tags: ["Step 13 Realtime"],
        summary: "Paginated contacts",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Paginated contacts" }
        }
      }
    },
    [`${config.API_PREFIX}/im/contacts/{contactId}/block`]: {
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Block one contact owned by the current user",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "contactId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 }
          }
        ],
        responses: {
          "200": { description: "Blocked contact" },
          "403": { description: "Missing contact:block permission" },
          "404": { description: "Contact not found for current user" }
        }
      },
      delete: {
        tags: ["Step 13 Realtime"],
        summary: "Unblock one contact owned by the current user",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "contactId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 }
          }
        ],
        responses: {
          "200": { description: "Unblocked contact" },
          "403": { description: "Missing contact:block permission" },
          "404": { description: "Contact not found for current user" }
        }
      }
    },
    [`${config.API_PREFIX}/im/friend-requests`]: {
      get: {
        tags: ["Step 13 Realtime"],
        summary: "Paginated friend requests",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "status",
            in: "query",
            schema: { type: "string", enum: ["pending", "accepted", "rejected"] }
          },
          {
            name: "direction",
            in: "query",
            schema: { type: "string", enum: ["incoming", "outgoing", "all"] }
          }
        ],
        responses: {
          "200": { description: "Paginated friend requests" }
        }
      },
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Create a friend request",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["targetUserId"],
                properties: {
                  targetUserId: { type: "integer", minimum: 1 },
                  message: { type: "string", maxLength: 300 }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Created friend request" }
        }
      }
    },
    [`${config.API_PREFIX}/im/friend-requests/{id}/accept`]: {
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Accept a friend request and create reciprocal contacts",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Accepted friend request" }
        }
      }
    },
    [`${config.API_PREFIX}/im/friend-requests/{id}/reject`]: {
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Reject a friend request",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Rejected friend request" }
        }
      }
    },
    [`${config.API_PREFIX}/social/users/{userId}/activity-status`]: {
      get: {
        tags: ["Step 13 Realtime"],
        summary: "Check whether one user has a viewer-visible post in the rolling last 30 days",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "userId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 }
          }
        ],
        responses: {
          "200": {
            description: "Text-only friend activity status and non-sensitive profile summary",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/SocialActivityStatus" }
                  }
                }
              }
            }
          },
          "400": { description: "Invalid userId" },
          "401": { description: "Missing or invalid access token" },
          "403": { description: "Missing social-post:list permission" },
          "404": { description: "Target Social profile is unavailable" }
        }
      }
    },
    [`${config.API_PREFIX}/social/posts`]: {
      get: {
        tags: ["Step 13 Realtime"],
        summary: "Paginated social posts",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "authorUserId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: {
          "200": { description: "Paginated social posts" }
        }
      },
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Create a basic social post",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["content"],
                properties: {
                  content: { type: "string", minLength: 1, maxLength: 5000 },
                  media: { type: "array", maxItems: 12, items: { type: "object" } },
                  visibility: { type: "string", enum: ["public", "followers"], default: "public" }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Created social post" }
        }
      }
    },
    [`${config.API_PREFIX}/social/posts/{id}`]: {
      get: {
        tags: ["Step 13 Realtime"],
        summary: "Get one visible social post",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Visible social post" },
          "404": { description: "Post is missing or not visible to the current user" }
        }
      }
    },
    [`${config.API_PREFIX}/social/follows`]: {
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Follow a user",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["targetUserId"],
                properties: {
                  targetUserId: { type: "integer", minimum: 1 }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Created follow" }
        }
      }
    },
    [`${config.API_PREFIX}/social/follows/{targetUserId}`]: {
      delete: {
        tags: ["Step 13 Realtime"],
        summary: "Unfollow a user",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "targetUserId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 }
          }
        ],
        responses: {
          "200": { description: "Follow deletion result" }
        }
      }
    },
    [`${config.API_PREFIX}/notifications`]: {
      get: {
        tags: ["Step 13 Realtime"],
        summary: "Paginated notifications",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "unreadOnly", in: "query", schema: { type: "boolean" } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: {
          "200": { description: "Paginated notifications" }
        }
      }
    },
    [`${config.API_PREFIX}/notifications/{id}/read`]: {
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Mark one notification as read",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Read notification" }
        }
      }
    },
    [`${config.API_PREFIX}/notifications/read-all`]: {
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Mark all current-user notifications as read",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Read count" }
        }
      }
    },
    [`${config.API_PREFIX}/realtime/unread-counts`]: {
      get: {
        tags: ["Step 13 Realtime"],
        summary: "Unread counts for IM, friend requests, and notifications",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Unread counts" }
        }
      }
    },
    [`${config.API_PREFIX}/realtime/events`]: {
      get: {
        tags: ["Step 13 Realtime"],
        summary: "SSE realtime event stream",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "text/event-stream with retry hints and heartbeat comments" }
        }
      }
    },
    [`${config.API_PREFIX}/finance/reconciliation`]: {
      get: {
        tags: ["Finance"],
        summary: "Paginated NDP finance reconciliation rows",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "status",
            in: "query",
            schema: { type: "string", enum: ["pending", "exported"] }
          },
          { name: "referenceType", in: "query", schema: { type: "string", maxLength: 80 } },
          { name: "referenceId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: {
          "200": { description: "Paginated finance reconciliation rows" }
        }
      }
    },
    [`${config.API_PREFIX}/finance/reconciliation/export`]: {
      get: {
        tags: ["Finance"],
        summary: "Export NDP finance reconciliation CSV content",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "CSV export payload",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/FinanceReconciliationExport" }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
});

export const createOpenApiRoutes = (config: AppConfig): Router => {
  const router = Router();
  const document = createOpenApiDocument(config);

  router.get("/openapi.json", (_request, response) => {
    response.status(200).json(document);
  });
  router.use("/docs", swaggerUi.serve, swaggerUi.setup(document));

  return router;
};
