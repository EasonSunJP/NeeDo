import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import type { AppConfig } from "../config/env";
import { IM_PRIVACY_TTL_MAX_SECONDS, IM_PRIVACY_TTL_MIN_SECONDS } from "../constants/im-privacy";
import { MESSAGE_JUDGEMENT_REACTIONS } from "../constants/message-reaction.constants";
import { PRISMA_INT_MAX } from "../constants/database";

type OpenApiDocument = Record<string, unknown>;
const safeIntegerMaximum = PRISMA_INT_MAX;

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

const jsonErrorResponse = (description: string) => ({
  description,
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/ApiError" }
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

const socialRichTextOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  required: ["version", "parts"],
  properties: {
    version: { type: "integer", enum: [1] },
    parts: {
      type: "array",
      minItems: 1,
      maxItems: 100,
      items: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "value"],
            properties: {
              type: { type: "string", enum: ["text"] },
              value: { type: "string", minLength: 1, maxLength: 5000 }
            }
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "value"],
            properties: {
              type: { type: "string", enum: ["judgement"] },
              value: { type: "string", enum: MESSAGE_JUDGEMENT_REACTIONS }
            }
          }
        ]
      }
    }
  }
};

const socialPostWriteRequestBody = {
  required: true,
  content: {
    "application/json": {
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["content"],
        anyOf: [
          {
            required: ["content"],
            properties: { content: { type: "string", minLength: 1 } }
          },
          {
            required: ["media"],
            properties: {
              media: {
                type: "object",
                required: ["items"],
                properties: { items: { type: "array", minItems: 1 } }
              }
            }
          }
        ],
        properties: {
          content: {
            type: "string",
            maxLength: 5000,
            description: "Trimmed content; may be empty only when at least one image is attached"
          },
          media: {
            type: "object",
            additionalProperties: false,
            required: ["items"],
            properties: {
              items: {
                type: "array",
                maxItems: 9,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["id", "type", "mediaAssetPublicId"],
                  properties: {
                    id: { type: "string", minLength: 1, maxLength: 120 },
                    type: { type: "string", enum: ["image"] },
                    mediaAssetPublicId: { type: "string", pattern: "^[a-f0-9]{64}$" },
                    alt: { type: "string", maxLength: 255 }
                  }
                }
              },
              quotePostId: { type: "integer", minimum: 1 },
              replyToPostId: { type: "integer", minimum: 1 },
              repostPostId: { type: "integer", minimum: 1 },
              postType: {
                type: "string",
                enum: ["post", "reply", "quote", "repost", "announcement", "technician-daily"]
              },
              locationLabel: { type: "string", maxLength: 160 },
              richText: socialRichTextOpenApiSchema
            }
          },
          mentionUserIds: {
            type: "array",
            maxItems: 50,
            uniqueItems: true,
            items: { type: "integer", minimum: 1 },
            default: []
          },
          visibility: { type: "string", enum: ["public", "followers"], default: "public" }
        }
      }
    }
  }
};

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

const platformFeePolicyErrorResponses = {
  "400": { description: "error.validation — strict request validation failed" },
  "401": { description: "error.auth.token_invalid — missing or invalid access token" },
  "403": {
    description: "error.forbidden or error.identity.forbidden — denied permission or scope"
  },
  "404": { description: "error.shop.not_found — shop does not exist" },
  "409": {
    description:
      "error.platform_fee_policy.version_conflict or error.platform_fee_policy.config_conflict"
  }
};

const orderAcceptancePauseErrorResponses = {
  "400": { description: "error.validation — strict request validation failed" },
  "401": { description: "error.auth.token_invalid — missing or invalid access token" },
  "403": {
    description: "error.forbidden or error.identity.forbidden — denied permission or scope"
  },
  "404": {
    description: "error.order_acceptance_pause.not_found — pause or subject does not exist"
  },
  "409": {
    description: "error.order_acceptance_pause.conflict — concurrent or state conflict"
  }
};

const orderAcceptancePauseListParameters = [
  { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
  {
    name: "pageSize",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 100 }
  },
  { name: "status", in: "query", schema: { type: "string", enum: ["active", "released"] } },
  {
    name: "subjectType",
    in: "query",
    schema: { type: "string", enum: ["merchant_account", "shop"] }
  },
  { name: "subjectId", in: "query", schema: { type: "integer", minimum: 1 } }
];

const shopMembershipErrorResponses = {
  "400": { description: "error.validation — strict shop membership request validation failed" },
  "401": { description: "error.auth.token_invalid — missing or invalid access token" },
  "403": { description: "error.forbidden or error.identity.forbidden — denied permission or identity scope" },
  "404": { description: "error.shop_membership.not_found — membership, shop, or eligible customer does not exist in the active scope" },
  "409": { description: "error.shop_membership.already_active — the customer already has an active membership in this shop" }
};

const shopMembershipCardPlanErrorResponses = {
  "400": { description: "error.validation — strict membership card plan request validation failed" },
  "401": { description: "error.auth.token_invalid — missing or invalid access token" },
  "403": { description: "error.forbidden or error.identity.forbidden — denied permission or identity scope" },
  "404": { description: "error.shop_membership_card_plan.not_found or error.shop_membership_card_plan.rule_reference_not_found" },
  "409": { description: "error.shop_membership_card_plan.version_conflict, invalid_state, or membership reward fee policy conflict" }
};

const shopMembershipCardAdjustmentErrorResponses = {
  "400": { description: "error.validation or error.shop_membership_card_adjustment.invalid_value" },
  "401": { description: "error.auth.token_invalid — missing or invalid access token" },
  "403": { description: "error.forbidden or error.identity.forbidden — denied permission or identity scope" },
  "404": { description: "error.shop_membership_card_adjustment.not_found — request or card is outside the active scope" },
  "409": { description: "pending, expired, terminal, idempotency, or card snapshot conflict" }
};

const membershipRewardScopeOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    servicePublicIds: { type: "array", maxItems: 100, uniqueItems: true, items: { type: "string", format: "uuid" } },
    categoryCodes: { type: "array", maxItems: 100, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 100 } },
    excludedServicePublicIds: { type: "array", maxItems: 100, uniqueItems: true, items: { type: "string", format: "uuid" } },
    excludedCategoryCodes: { type: "array", maxItems: 100, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 100 } },
    activeFrom: { type: ["string", "null"], format: "date-time" },
    activeTo: { type: ["string", "null"], format: "date-time" }
  }
};

const membershipRewardRuleObject = (
  kind: string,
  properties: Record<string, unknown>,
  required: string[]
) => ({
  type: "object",
  additionalProperties: false,
  required: ["kind", ...required],
  properties: {
    kind: { type: "string", enum: [kind] },
    ...properties,
    scope: membershipRewardScopeOpenApiSchema
  }
});

const membershipRewardRuleOpenApiSchemas = {
  MembershipRewardScope: membershipRewardScopeOpenApiSchema,
  MembershipRewardRuleFixedPerCompletion: membershipRewardRuleObject("fixed_per_completion", { rewardNdp: { type: "integer", minimum: 0 } }, ["rewardNdp"]),
  MembershipRewardRulePercentOfEligibleAmount: membershipRewardRuleObject("percent_of_eligible_amount", { rewardRateBps: { type: "integer", minimum: 0, maximum: 10_000 } }, ["rewardRateBps"]),
  MembershipRewardRuleSpendBlock: membershipRewardRuleObject("spend_block", { blockAmountJpy: { type: "integer", minimum: 1 }, rewardNdpPerBlock: { type: "integer", minimum: 0 } }, ["blockAmountJpy", "rewardNdpPerBlock"]),
  MembershipRewardRuleFirstCardUseBonus: membershipRewardRuleObject("first_card_use_bonus", { rewardNdp: { type: "integer", minimum: 0 } }, ["rewardNdp"]),
  MembershipRewardRuleServiceScopeBonus: membershipRewardRuleObject("service_scope_bonus", { rewardNdp: { type: ["integer", "null"], minimum: 0 }, rewardRateBps: { type: ["integer", "null"], minimum: 0, maximum: 10_000 } }, []),
  MembershipRewardRuleCompletionMilestoneBonus: membershipRewardRuleObject("completion_milestone_bonus", { everyCompletions: { type: "integer", minimum: 1 }, rewardNdp: { type: "integer", minimum: 0 }, repeat: { type: "boolean" } }, ["everyCompletions", "rewardNdp", "repeat"]),
  MembershipRewardRuleSpendMilestoneBonus: membershipRewardRuleObject("spend_milestone_bonus", { thresholdJpy: { type: "integer", minimum: 1 }, rewardNdp: { type: "integer", minimum: 0 }, repeat: { type: "boolean" } }, ["thresholdJpy", "rewardNdp", "repeat"]),
  MembershipRewardRuleBirthdayMonthBonus: membershipRewardRuleObject("birthday_month_bonus", { rewardNdp: { type: "integer", minimum: 0 }, annualLimit: { type: "integer", minimum: 1, maximum: 12 } }, ["rewardNdp", "annualLimit"]),
  MembershipRewardRuleScheduleWindowBonus: membershipRewardRuleObject("schedule_window_bonus", { rewardNdp: { type: "integer", minimum: 0 }, timezone: { type: "string", enum: ["Asia/Tokyo"] }, daysOfWeek: { type: "array", minItems: 1, maxItems: 7, uniqueItems: true, items: { type: "integer", minimum: 0, maximum: 6 } }, startTime: { type: "string", pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" }, endTime: { type: "string", pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" } }, ["rewardNdp", "timezone", "daysOfWeek", "startTime", "endTime"]),
  MembershipRewardRuleConsecutiveMonthBonus: membershipRewardRuleObject("consecutive_month_bonus", { consecutiveMonths: { type: "integer", minimum: 2, maximum: 60 }, rewardNdp: { type: "integer", minimum: 0 } }, ["consecutiveMonths", "rewardNdp"]),
  MembershipRewardRule: {
    oneOf: [
      { $ref: "#/components/schemas/MembershipRewardRuleFixedPerCompletion" },
      { $ref: "#/components/schemas/MembershipRewardRulePercentOfEligibleAmount" },
      { $ref: "#/components/schemas/MembershipRewardRuleSpendBlock" },
      { $ref: "#/components/schemas/MembershipRewardRuleFirstCardUseBonus" },
      { $ref: "#/components/schemas/MembershipRewardRuleServiceScopeBonus" },
      { $ref: "#/components/schemas/MembershipRewardRuleCompletionMilestoneBonus" },
      { $ref: "#/components/schemas/MembershipRewardRuleSpendMilestoneBonus" },
      { $ref: "#/components/schemas/MembershipRewardRuleBirthdayMonthBonus" },
      { $ref: "#/components/schemas/MembershipRewardRuleScheduleWindowBonus" },
      { $ref: "#/components/schemas/MembershipRewardRuleConsecutiveMonthBonus" }
    ],
    discriminator: { propertyName: "kind" }
  }
};

const nullableNonNegativeInteger = { type: ["integer", "null"], minimum: 0 };
const shopMembershipCardPlanOpenApiSchemas = {
  ...membershipRewardRuleOpenApiSchemas,
  MembershipRewardCaps: {
    type: "object", additionalProperties: false,
    required: ["perOrderNdp", "perDayNdp", "perMonthNdp", "lifetimeNdp"],
    properties: { perOrderNdp: nullableNonNegativeInteger, perDayNdp: nullableNonNegativeInteger, perMonthNdp: nullableNonNegativeInteger, lifetimeNdp: nullableNonNegativeInteger }
  },
  ShopMembershipCardPlanValidity: {
    oneOf: [
      { type: "object", additionalProperties: false, required: ["mode"], properties: { mode: { type: "string", enum: ["never"] } } },
      { type: "object", additionalProperties: false, required: ["mode", "days"], properties: { mode: { type: "string", enum: ["fixed_days"] }, days: { type: "integer", minimum: 1, maximum: 3650 } } },
      { type: "object", additionalProperties: false, required: ["mode", "expiresAt"], properties: { mode: { type: "string", enum: ["fixed_date"] }, expiresAt: { type: "string", format: "date-time" } } }
    ], discriminator: { propertyName: "mode" }
  },
  ShopMembershipCardPlanIssuance: {
    type: "object", additionalProperties: false,
    required: ["minInitialPrincipalJpy", "maxInitialPrincipalJpy", "minInitialUses", "maxInitialUses"],
    properties: { minInitialPrincipalJpy: nullableNonNegativeInteger, maxInitialPrincipalJpy: nullableNonNegativeInteger, minInitialUses: nullableNonNegativeInteger, maxInitialUses: nullableNonNegativeInteger }
  },
  ShopMembershipCardIssuanceRequest: {
    type: "object", additionalProperties: false,
    required: ["planPublicId", "initialPrincipalJpy", "initialUses", "issuanceSource", "issuanceReference", "issuanceNote", "idempotencyKey"],
    properties: {
      planPublicId: { type: "string", format: "uuid" },
      initialPrincipalJpy: nullableNonNegativeInteger,
      initialUses: nullableNonNegativeInteger,
      issuanceSource: { type: "string", enum: ["offline_paid", "historical_replacement", "manual_grant"] },
      issuanceReference: { type: ["string", "null"], maxLength: 160 },
      issuanceNote: { type: ["string", "null"], maxLength: 500 },
      idempotencyKey: { type: "string", minLength: 8, maxLength: 160 }
    }
  },
  ShopMembershipCardIssuanceResult: {
    type: "object", additionalProperties: false,
    required: ["publicId", "cardNoMasked", "name", "type", "status", "principalBalanceJpy", "bonusBalanceJpy", "remainingUses", "totalUses", "initialPrincipalJpy", "initialUses", "issuanceSource", "issuanceReference", "issuanceNote", "issuedAt", "expiresAt", "frozenAt", "platformFeeRateBpsSnapshot", "planPublicId", "planVersionPublicId", "planVersion", "customerNeedoId", "customerDisplayName", "replayed"],
    properties: {
      publicId: { type: "string", format: "uuid" },
      cardNoMasked: { type: "string" },
      name: { type: "string", minLength: 1, maxLength: 120 },
      type: { type: "string", enum: ["stored_value", "count", "benefit"] },
      status: { type: "string", enum: ["active", "frozen", "expired", "void"] },
      principalBalanceJpy: nullableNonNegativeInteger,
      bonusBalanceJpy: nullableNonNegativeInteger,
      remainingUses: nullableNonNegativeInteger,
      totalUses: nullableNonNegativeInteger,
      initialPrincipalJpy: nullableNonNegativeInteger,
      initialUses: nullableNonNegativeInteger,
      issuanceSource: { type: "string", enum: ["offline_paid", "historical_replacement", "manual_grant"] },
      issuanceReference: { type: ["string", "null"], maxLength: 160 },
      issuanceNote: { type: ["string", "null"], maxLength: 500 },
      issuedAt: { type: "string", format: "date-time" },
      expiresAt: { type: ["string", "null"], format: "date-time" },
      frozenAt: { type: ["string", "null"], format: "date-time" },
      platformFeeRateBpsSnapshot: { type: "integer", minimum: 0, maximum: 10_000 },
      planPublicId: { type: "string", format: "uuid" },
      planVersionPublicId: { type: "string", format: "uuid" },
      planVersion: { type: "integer", minimum: 1 },
      customerNeedoId: { type: "string", pattern: "^u[0-9]{10}$" },
      customerDisplayName: { type: "string", minLength: 1 },
      replayed: { type: "boolean" }
    }
  },
  ShopMembershipCardPlanDraftRequest: {
    type: "object", additionalProperties: false,
    required: ["expectedLockVersion", "name", "description", "cardType", "validity", "issuance", "caps", "rules"],
    properties: {
      expectedLockVersion: { type: "integer", minimum: 0 },
      name: { type: "string", minLength: 1, maxLength: 120 },
      description: { type: ["string", "null"], maxLength: 500 },
      cardType: { type: "string", enum: ["stored_value", "count", "benefit"] },
      validity: { $ref: "#/components/schemas/ShopMembershipCardPlanValidity" },
      issuance: { $ref: "#/components/schemas/ShopMembershipCardPlanIssuance" },
      caps: { $ref: "#/components/schemas/MembershipRewardCaps" },
      rules: { type: "array", minItems: 1, maxItems: 21, items: { $ref: "#/components/schemas/MembershipRewardRule" } }
    }
  },
  ShopMembershipCardPlanPreviewRequest: {
    type: "object", additionalProperties: false,
    required: ["eligibleAmountJpy", "servicePublicId", "categoryCode", "scheduledAt", "completedCountBefore", "lifetimeEligibleSpendJpyBefore", "isFirstCardUse", "customerBirthMonth", "birthdayRewardsThisYear", "consecutiveEligibleMonths", "rewardedConsecutiveMonthMilestones", "alreadyRewardedTodayNdp", "alreadyRewardedMonthNdp", "alreadyRewardedLifetimeNdp"],
    properties: {
      eligibleAmountJpy: { type: "integer", minimum: 0 }, servicePublicId: { type: "string", format: "uuid" }, categoryCode: { type: "string", minLength: 1, maxLength: 100 }, scheduledAt: { type: "string", format: "date-time" }, completedCountBefore: { type: "integer", minimum: 0 }, lifetimeEligibleSpendJpyBefore: { type: "integer", minimum: 0 }, isFirstCardUse: { type: "boolean" }, customerBirthMonth: { type: ["integer", "null"], minimum: 1, maximum: 12 }, birthdayRewardsThisYear: { type: "integer", minimum: 0 }, consecutiveEligibleMonths: { type: "integer", minimum: 0 }, rewardedConsecutiveMonthMilestones: { type: "array", maxItems: 100, items: { type: "integer", minimum: 1 } }, alreadyRewardedTodayNdp: { type: "integer", minimum: 0 }, alreadyRewardedMonthNdp: { type: "integer", minimum: 0 }, alreadyRewardedLifetimeNdp: { type: "integer", minimum: 0 }
    }
  },
  ShopMembershipCardPlanPublishRequest: { type: "object", additionalProperties: false, required: ["expectedLockVersion"], properties: { expectedLockVersion: { type: "integer", minimum: 0 } } },
  ShopMembershipCardPlan: {
    type: "object", additionalProperties: false,
    required: ["publicId", "status", "currentVersion", "draftVersion", "createdAt", "updatedAt"],
    properties: { publicId: { type: "string", format: "uuid" }, status: { type: "string", enum: ["draft", "active", "retired"] }, currentVersion: { type: ["object", "null"] }, draftVersion: { type: ["object", "null"] }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" } }
  },
  ShopMembershipRewardPreview: {
    type: "object", additionalProperties: false,
    required: ["hits", "rawCustomerRewardNdp", "customerRewardNdp", "platformFeeRateBps", "platformFeeNdp", "totalShopDebitNdp", "capped"],
    properties: { hits: { type: "array", items: { type: "object" } }, rawCustomerRewardNdp: { type: "integer", minimum: 0 }, customerRewardNdp: { type: "integer", minimum: 0 }, platformFeeRateBps: { type: "integer", minimum: 0, maximum: 10_000 }, platformFeeNdp: { type: "integer", minimum: 0 }, totalShopDebitNdp: { type: "integer", minimum: 0 }, capped: { type: "boolean" } }
  },
  MembershipRewardFeeVersionCreateRequest: {
    type: "object", additionalProperties: false,
    required: ["feeRateBps", "expectedVersion", "effectiveFrom", "reason"],
    properties: { feeRateBps: { type: "integer", minimum: 0, maximum: 10_000 }, expectedVersion: { type: "integer", minimum: 0 }, effectiveFrom: { type: "string", format: "date-time" }, reason: { type: "string", minLength: 1, maxLength: 500 } }
  },
  MembershipRewardFeePolicyOverview: { type: "object", additionalProperties: false, required: ["summary", "history"], properties: { summary: { type: "object" }, history: { type: "object" } } }
};

const membershipCardPlanRequestBody = (schemaName: string) => ({
  required: true,
  content: { "application/json": { schema: { $ref: `#/components/schemas/${schemaName}` } } }
});

const membershipCardPlanPublicIdParameter = {
  name: "publicId", in: "path", required: true,
  schema: { type: "string", format: "uuid" }
};

const createShopMembershipCardPlanOpenApiPaths = (config: AppConfig): Record<string, unknown> => ({
  [`${config.API_PREFIX}/merchant-admin/shop-memberships/{publicId}/cards`]: {
    post: {
      tags: ["Shop Membership"],
      summary: "Issue a membership card from the current published plan version",
      description: "Creates the card, audit record, and customer notification atomically. Initial issuance does not reward NDP or mutate wallets or ledgers.",
      security: [{ bearerAuth: [] }],
      parameters: [membershipCardPlanPublicIdParameter],
      requestBody: membershipCardPlanRequestBody("ShopMembershipCardIssuanceRequest"),
      responses: {
        "200": jsonDataResponse("Idempotent replay of the existing issued card", { $ref: "#/components/schemas/ShopMembershipCardIssuanceResult" }),
        "201": jsonDataResponse("Created membership card", { $ref: "#/components/schemas/ShopMembershipCardIssuanceResult" }),
        ...shopMembershipCardPlanErrorResponses
      }
    }
  },
  [`${config.API_PREFIX}/merchant-admin/shop-membership-card-plans`]: {
    get: {
      tags: ["Shop Membership Card Plan"], summary: "List membership card plans in the current shop", security: [{ bearerAuth: [] }],
      parameters: [{ name: "page", in: "query", schema: { type: "integer", minimum: 1 } }, { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }],
      responses: { "200": jsonDataResponse("Paginated card plans", { type: "object" }), ...shopMembershipCardPlanErrorResponses }
    },
    post: {
      tags: ["Shop Membership Card Plan"], summary: "Create a shop-scoped card plan draft", description: "The authenticated shop scope is authoritative. Client shop ids and fee rates are rejected.", security: [{ bearerAuth: [] }],
      requestBody: membershipCardPlanRequestBody("ShopMembershipCardPlanDraftRequest"),
      responses: { "201": jsonDataResponse("Created card plan draft", { $ref: "#/components/schemas/ShopMembershipCardPlan" }), ...shopMembershipCardPlanErrorResponses }
    }
  },
  [`${config.API_PREFIX}/merchant-admin/shop-membership-card-plans/{publicId}`]: {
    get: {
      tags: ["Shop Membership Card Plan"], summary: "Read one card plan in the current shop", security: [{ bearerAuth: [] }], parameters: [membershipCardPlanPublicIdParameter],
      responses: { "200": jsonDataResponse("Card plan", { $ref: "#/components/schemas/ShopMembershipCardPlan" }), ...shopMembershipCardPlanErrorResponses }
    }
  },
  [`${config.API_PREFIX}/merchant-admin/shop-membership-card-plans/{publicId}/draft`]: {
    patch: {
      tags: ["Shop Membership Card Plan"], summary: "Save a version-locked card plan draft", security: [{ bearerAuth: [] }], parameters: [membershipCardPlanPublicIdParameter], requestBody: membershipCardPlanRequestBody("ShopMembershipCardPlanDraftRequest"),
      responses: { "200": jsonDataResponse("Updated card plan draft", { $ref: "#/components/schemas/ShopMembershipCardPlan" }), ...shopMembershipCardPlanErrorResponses }
    }
  },
  [`${config.API_PREFIX}/merchant-admin/shop-membership-card-plans/{publicId}/preview`]: {
    post: {
      tags: ["Shop Membership Card Plan"], summary: "Preview NDP reward and shop cost without wallet mutation", security: [{ bearerAuth: [] }], parameters: [membershipCardPlanPublicIdParameter], requestBody: membershipCardPlanRequestBody("ShopMembershipCardPlanPreviewRequest"),
      responses: { "200": jsonDataResponse("Server-authoritative reward preview", { $ref: "#/components/schemas/ShopMembershipRewardPreview" }), ...shopMembershipCardPlanErrorResponses }
    }
  },
  [`${config.API_PREFIX}/merchant-admin/shop-membership-card-plans/{publicId}/publish`]: {
    post: {
      tags: ["Shop Membership Card Plan"], summary: "Publish an immutable card plan version with the effective fee snapshot", security: [{ bearerAuth: [] }], parameters: [membershipCardPlanPublicIdParameter], requestBody: membershipCardPlanRequestBody("ShopMembershipCardPlanPublishRequest"),
      responses: { "201": jsonDataResponse("Published card plan", { $ref: "#/components/schemas/ShopMembershipCardPlan" }), ...shopMembershipCardPlanErrorResponses }
    }
  },
  [`${config.API_PREFIX}/merchant-admin/shop-membership-card-plans/{publicId}/retire`]: {
    post: {
      tags: ["Shop Membership Card Plan"], summary: "Retire a card plan from future use", security: [{ bearerAuth: [] }], parameters: [membershipCardPlanPublicIdParameter],
      responses: { "200": jsonDataResponse("Retired card plan", { $ref: "#/components/schemas/ShopMembershipCardPlan" }), ...shopMembershipCardPlanErrorResponses }
    }
  },
  [`${config.API_PREFIX}/backoffice/membership-reward-fee-policy`]: {
    get: {
      tags: ["Membership Reward Fee"], summary: "Read current, scheduled, and immutable membership reward fee history", security: [{ bearerAuth: [] }],
      parameters: [{ name: "page", in: "query", schema: { type: "integer", minimum: 1 } }, { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }],
      responses: { "200": jsonDataResponse("Fee policy overview", { $ref: "#/components/schemas/MembershipRewardFeePolicyOverview" }), ...shopMembershipCardPlanErrorResponses }
    }
  },
  [`${config.API_PREFIX}/backoffice/membership-reward-fee-policy/versions`]: {
    post: {
      tags: ["Membership Reward Fee"], summary: "Create an immutable membership reward fee version", description: "The fee is added on top of customer NDP and is snapshotted only when a card plan version is published.", security: [{ bearerAuth: [] }], requestBody: membershipCardPlanRequestBody("MembershipRewardFeeVersionCreateRequest"),
      responses: { "201": jsonDataResponse("Created fee policy version", { type: "object" }), ...shopMembershipCardPlanErrorResponses }
    }
  }
});

const shopMembershipPageParameters = [
  { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
  { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
];

const shopMembershipPublicIdParameter = {
  name: "publicId",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" }
};

const shopMembershipPageSchema = (itemSchema: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: ["list", "total", "page", "page_size"],
  properties: {
    list: { type: "array", items: itemSchema },
    total: { type: "integer", minimum: 0 },
    page: { type: "integer", minimum: 1 },
    page_size: { type: "integer", minimum: 1, maximum: 100 }
  }
});

const shopMembershipCardRequired = ["publicId", "cardNoMasked", "name", "type", "status", "principalBalanceJpy", "bonusBalanceJpy", "remainingUses", "totalUses", "initialPrincipalJpy", "initialUses", "issuanceSource", "platformFeeRateBpsSnapshot", "planPublicId", "planVersionPublicId", "planVersion", "issuedAt", "expiresAt", "frozenAt"];
const shopMembershipCardProperties = {
  publicId: { type: "string", format: "uuid" },
  cardNoMasked: { type: "string" },
  name: { type: "string", minLength: 1, maxLength: 120 },
  type: { type: "string", enum: ["stored_value", "count", "benefit"] },
  status: { type: "string", enum: ["active", "frozen", "expired", "void"] },
  principalBalanceJpy: { type: ["integer", "null"], minimum: 0 },
  bonusBalanceJpy: { type: ["integer", "null"], minimum: 0 },
  remainingUses: { type: ["integer", "null"], minimum: 0 },
  totalUses: { type: ["integer", "null"], minimum: 0 },
  initialPrincipalJpy: { type: ["integer", "null"], minimum: 0 },
  initialUses: { type: ["integer", "null"], minimum: 0 },
  issuanceSource: { type: ["string", "null"], enum: ["offline_paid", "historical_replacement", "manual_grant", null] },
  platformFeeRateBpsSnapshot: { type: ["integer", "null"], minimum: 0, maximum: 10_000 },
  planPublicId: { type: ["string", "null"], format: "uuid" },
  planVersionPublicId: { type: ["string", "null"], format: "uuid" },
  planVersion: { type: ["integer", "null"], minimum: 1 },
  issuedAt: { type: "string", format: "date-time" },
  expiresAt: { type: ["string", "null"], format: "date-time" },
  frozenAt: { type: ["string", "null"], format: "date-time" }
};

const affiliatePlatformFeeErrorResponses = {
  "400": { description: "error.validation — strict request validation failed" },
  "401": { description: "error.auth.token_invalid — missing or invalid access token" },
  "403": {
    description: "error.forbidden or error.identity_forbidden — denied permission or scope"
  },
  "404": {
    description: "error.affiliate.platform_fee_shop_not_found — shop does not exist"
  },
  "409": {
    description:
      "error.affiliate.platform_fee_version_conflict, error.affiliate.platform_fee_policy_conflict, or error.affiliate.platform_fee_rate_mismatch"
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
const affiliateContentLocales = ["zh-CN", "zh-TW", "en", "ja", "ko"];

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

const affiliateAllianceErrorResponses = {
  "400": { description: "Invalid strict affiliate alliance or invitation contract" },
  "401": { description: "Missing or invalid access token" },
  "403": {
    description:
      "Missing alliance permission, owner scope, reciprocal contact, Affiliate identity, or active Affiliate profile"
  },
  "404": { description: "Invitation not found in the authenticated invitee scope" },
  "409": {
    description:
      "Active membership, duplicate invitation, parent, expiry, or invitation-state conflict"
  }
};

const affiliateAllianceListParameters = [
  { name: "q", in: "query", schema: { type: "string", maxLength: 80 } },
  { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
  {
    name: "pageSize",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 100, default: 20 }
  }
];

const affiliateAllianceInvitationListParameters = [
  {
    name: "status",
    in: "query",
    schema: { type: "string", enum: ["pending", "accepted", "rejected", "expired"] }
  },
  { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
  {
    name: "pageSize",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 100, default: 20 }
  }
];

const customerProfileErrorResponses = {
  "400": { description: "Invalid customer self-profile update payload" },
  "401": { description: "Missing or invalid access token" },
  "403": { description: "Missing customer-profile permission or customer identity scope" },
  "404": { description: "Customer profile not found in authenticated scope" },
  "500": { description: "Unexpected customer profile persistence error" }
};

const technicianProfileErrorResponses = {
  "400": { description: "Invalid technician self-profile update payload" },
  "401": { description: "Missing or invalid access token" },
  "403": { description: "Missing technician-profile permission or technician identity scope" },
  "404": { description: "Technician profile not found in authenticated scope" },
  "500": { description: "Unexpected technician profile persistence error" }
};

const contentAnnouncementErrorResponses = {
  "400": {
    description:
      "error.validation — malformed UUID, positive release ID, pagination, or strict request body; error.content.locale_invalid — unsupported locale"
  },
  "401": { description: "error.auth.token_invalid — missing or invalid access token" },
  "403": { description: "error.forbidden — missing exact content publication permission" },
  "404": {
    description:
      "error.content.not_found or error.content.release_not_found — announcement or release is unavailable"
  },
  "409": {
    description:
      "error.content.draft_exists, error.content.lock_conflict, error.content.incomplete_translations, error.content.schedule_conflict, error.content.target_unavailable, error.content.invalid_state_transition, or error.idempotency_key_reused"
  }
};

const announcementPublicIdParameter = {
  name: "publicId",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" }
};

const announcementReleaseIdParameter = {
  name: "releaseId",
  in: "path",
  required: true,
  schema: { type: "integer", minimum: 1 }
};

const contentHistoryParameters = [
  { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
  {
    name: "pageSize",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 100, default: 20 }
  }
];

const announcementOperation = (
  summary: string,
  permission: string,
  extras: Record<string, unknown> = {}
) => ({
  tags: ["Affiliate Content Publication"],
  summary,
  security: [{ bearerAuth: [] }],
  "x-permission": permission,
  ...extras,
  responses: {
    ...contentAnnouncementErrorResponses,
    ...((extras.responses as Record<string, unknown> | undefined) ?? {})
  }
});

const carouselErrorResponses = {
  "400": {
    description:
      "error.validation, error.content.locale_invalid, error.content.media_invalid, or error.carousel.target_invalid"
  },
  "401": { description: "error.auth.token_invalid — missing or invalid access token" },
  "403": { description: "error.forbidden — missing the exact fixed-scene permission" },
  "404": { description: "error.content.release_not_found — carousel release is unavailable" },
  "409": {
    description:
      "error.content.draft_exists, error.content.lock_conflict, error.content.incomplete_translations, error.content.schedule_conflict, error.content.target_unavailable, error.content.invalid_state_transition, error.carousel.sort_invalid, error.carousel.no_visible_slide, or error.idempotency_key_reused"
  }
};

const carouselOperation = (
  summary: string,
  permission: string | null,
  extras: Record<string, unknown> = {}
) => ({
  tags: ["Carousel Content Publication"],
  summary,
  security: [{ bearerAuth: [] }],
  ...(permission ? { "x-permission": permission } : {}),
  ...extras,
  responses: {
    ...carouselErrorResponses,
    ...((extras.responses as Record<string, unknown> | undefined) ?? {})
  }
});

const carouselReleaseIdParameter = {
  name: "releaseId",
  in: "path",
  required: true,
  schema: { type: "integer", minimum: 1 }
};
const carouselSlidePublicIdParameter = {
  name: "slidePublicId",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" }
};
const carouselLocaleParameter = {
  name: "locale",
  in: "path",
  required: true,
  schema: { type: "string", enum: ["zh-CN", "zh-TW", "en", "ja", "ko"] }
};
const carouselPublicLocaleParameter = {
  name: "locale",
  in: "query",
  required: true,
  schema: { type: "string", enum: ["zh-CN", "zh-TW", "en", "ja", "ko"] }
};

const carouselSlideInputSchema = (targetSchema: string, replace: boolean) => ({
  type: "object",
  additionalProperties: false,
  required: [
    "defaultMediaAssetPublicId",
    "sortOrder",
    "isEnabled",
    "visibleFrom",
    "visibleUntil",
    "target",
    "translations"
  ],
  properties: {
    publicId: { type: "string", format: "uuid" },
    defaultMediaAssetPublicId: { type: "string", pattern: "^[a-f0-9]{64}$" },
    sortOrder: { type: "integer", minimum: 0 },
    isEnabled: { type: "boolean" },
    visibleFrom: { type: ["string", "null"], format: "date-time" },
    visibleUntil: { type: ["string", "null"], format: "date-time" },
    target: { $ref: `#/components/schemas/${targetSchema}` },
    translations: replace
      ? { $ref: "#/components/schemas/CarouselFiveTranslations" }
      : {
          type: "array",
          minItems: 1,
          maxItems: 1,
          description: "Exactly the translation matching the draft sourceLocale",
          items: { $ref: "#/components/schemas/CarouselTranslationInput" }
        }
  }
});

const carouselDraftInputSchema = (slideSchema: string, create: boolean) => ({
  type: "object",
  additionalProperties: false,
  required: [create ? "idempotencyKey" : "expectedLockVersion", "sourceLocale", "slides"],
  properties: {
    ...(create
      ? { idempotencyKey: { type: "string", format: "uuid" } }
      : { expectedLockVersion: { type: "integer", minimum: 1 } }),
    sourceLocale: { type: "string", enum: ["zh-CN", "zh-TW", "en", "ja", "ko"] },
    slides: {
      type: "array",
      minItems: 1,
      maxItems: 50,
      items: { $ref: `#/components/schemas/${slideSchema}` }
    }
  }
});

const createCarouselOpenApiPaths = (config: AppConfig): Record<string, unknown> => {
  const paths: Record<string, unknown> = {};
  const scenes = [
    {
      slug: "user-home",
      read: "page:backoffice-user-home-carousel",
      edit: "button:backoffice-user-home-carousel-edit",
      publish: "button:backoffice-user-home-carousel-publish",
      schemaPrefix: "CarouselUserHome",
      targetTypes: ["shop", "technician", "service"]
    },
    {
      slug: "affiliate-home-notice",
      read: "page:backoffice-affiliate-notice-carousel",
      edit: "button:backoffice-affiliate-notice-carousel-edit",
      publish: "button:backoffice-affiliate-notice-carousel-publish",
      schemaPrefix: "CarouselAffiliateNotice",
      targetTypes: ["announcement", "affiliate_task"]
    }
  ] as const;
  const jsonBody = (schema: string) => ({
    required: true,
    content: { "application/json": { schema: { $ref: `#/components/schemas/${schema}` } } }
  });
  const protectedResponse = (description: string) => ({
    "200": jsonDataResponse(description, { $ref: "#/components/schemas/CarouselProtectedPayload" })
  });
  for (const scene of scenes) {
    const base = `${config.API_PREFIX}/backoffice/content/carousels/${scene.slug}`;
    const release = `${base}/releases/{releaseId}`;
    paths[base] = {
      get: carouselOperation("Read fixed-scene carousel publication slots", scene.read, {
        responses: {
          "200": jsonDataResponse("Current fixed-scene slots", {
            $ref: "#/components/schemas/CarouselSceneState"
          })
        }
      })
    };
    paths[`${base}/releases`] = {
      post: carouselOperation("Create one current fixed-scene carousel draft", scene.edit, {
        requestBody: jsonBody(`${scene.schemaPrefix}DraftCreate`),
        responses: {
          "201": jsonDataResponse("Carousel draft created", {
            $ref: "#/components/schemas/CarouselProtectedPayload"
          })
        }
      })
    };
    paths[`${base}/history`] = {
      get: carouselOperation("List immutable fixed-scene carousel history", scene.read, {
        parameters: contentHistoryParameters,
        responses: {
          "200": jsonDataResponse("Paginated carousel history", {
            $ref: "#/components/schemas/CarouselProtectedPage"
          })
        }
      })
    };
    paths[`${base}/targets`] = {
      get: carouselOperation("Search live targets inside the authenticated scope", scene.read, {
        parameters: [
          { name: "type", in: "query", schema: { type: "string", enum: scene.targetTypes } },
          { name: "q", in: "query", schema: { type: "string", minLength: 1, maxLength: 160 } },
          ...contentHistoryParameters
        ],
        responses: {
          "200": jsonDataResponse("Public-safe paginated target picker", {
            $ref: "#/components/schemas/CarouselTargetSearchPage"
          })
        }
      })
    };
    paths[release] = {
      get: carouselOperation("Read one protected carousel release", scene.read, {
        parameters: [carouselReleaseIdParameter],
        responses: protectedResponse("Protected carousel release")
      }),
      patch: carouselOperation("Atomically replace one draft slide set", scene.edit, {
        parameters: [carouselReleaseIdParameter],
        requestBody: jsonBody(`${scene.schemaPrefix}DraftReplace`),
        responses: protectedResponse("Carousel draft replaced")
      })
    };
    paths[`${release}/slides/{slidePublicId}/locales/{locale}`] = {
      patch: carouselOperation("Update exactly one slide locale", scene.edit, {
        parameters: [
          carouselReleaseIdParameter,
          carouselSlidePublicIdParameter,
          carouselLocaleParameter
        ],
        requestBody: jsonBody("CarouselLocaleMutation"),
        responses: protectedResponse("Carousel locale updated")
      })
    };
    paths[`${release}/slides/{slidePublicId}/copy-to-all`] = {
      post: carouselOperation("Copy one explicit source locale to all five locales", scene.edit, {
        parameters: [carouselReleaseIdParameter, carouselSlidePublicIdParameter],
        requestBody: jsonBody("CarouselCopyAll"),
        responses: protectedResponse("Carousel locale copied to all")
      })
    };
    paths[`${release}/preview`] = {
      get: carouselOperation("Preview the protected five-locale draft", scene.read, {
        parameters: [carouselReleaseIdParameter],
        responses: protectedResponse("Protected carousel preview")
      })
    };
    for (const [action, schema, summary] of [
      ["publish", "ContentPublishCommand", "Publish a complete carousel draft immediately"],
      ["schedule", "ContentScheduleCommand", "Schedule a complete carousel draft"],
      ["disable", "ContentDisableCommand", "Disable a published or scheduled carousel release"],
      ["rollback", "ContentRollbackCommand", "Clone immutable history into a new rollback draft"]
    ] as const) {
      paths[`${release}/${action}`] = {
        post: carouselOperation(summary, scene.publish, {
          parameters: [carouselReleaseIdParameter],
          requestBody: jsonBody(schema),
          responses: protectedResponse(`Carousel ${action} command completed`)
        })
      };
    }
  }
  paths[`${config.API_PREFIX}/content/carousels/user-home`] = {
    get: carouselOperation("Read the actual current user-home PUBLISHED slot", null, {
      parameters: [carouselPublicLocaleParameter],
      responses: {
        "200": jsonDataResponse("One-locale user-home carousel", {
          $ref: "#/components/schemas/PublishedCarouselPayload"
        })
      }
    })
  };
  paths[`${config.API_PREFIX}/affiliate/content/carousel`] = {
    get: carouselOperation(
      "Read the actual current Affiliate notice PUBLISHED slot",
      "page:affiliate-marketplace",
      {
        parameters: [carouselPublicLocaleParameter],
        responses: {
          "200": jsonDataResponse("One-locale Affiliate notice carousel", {
            $ref: "#/components/schemas/PublishedCarouselPayload"
          })
        }
      }
    )
  };
  return paths;
};

const exchangeErrorResponses = {
  "400": { description: "error.validation — strict request validation failed" },
  "401": { description: "error.auth.token_invalid — missing or invalid access token" },
  "403": {
    description: "error.forbidden or error.identity.forbidden — denied permission or identity"
  },
  "404": { description: "error.exchange.post_not_found — post does not exist" },
  "409": {
    description:
      "error.exchange.post_unavailable, error.exchange.idempotency_conflict, error.exchange.request_target_limit, or error.wallet.insufficient_available"
  }
};

const exchangeRequestFeeErrorResponses = {
  "400": { description: "error.validation — strict request validation failed" },
  "401": { description: "error.auth.token_invalid — missing or invalid access token" },
  "403": {
    description: "error.forbidden or error.identity.forbidden — denied permission or identity"
  },
  "404": {
    description: "error.exchange.post_not_found — referenced Exchange resource is unavailable"
  },
  "409": {
    description: "error.exchange.request_fee_version_conflict — the expected fee version is stale"
  },
  "503": {
    description:
      "error.exchange.request_fee_unavailable — no valid Request publication fee is effective"
  }
};

const exchangeIdempotencyKeyParameter = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
  schema: { type: "string", minLength: 16, maxLength: 191 }
};

const exchangeOperation = (
  summary: string,
  permission: string | readonly string[],
  extras: Record<string, unknown>
) => ({
  tags: ["NeeDo Exchange"],
  summary,
  security: [{ bearerAuth: [] }],
  ...(typeof permission === "string"
    ? { "x-required-permission": permission }
    : { "x-required-permissions": permission }),
  ...extras
});

const createExchangeOpenApiPaths = (config: AppConfig): Record<string, unknown> => {
  const base = `${config.API_PREFIX}/exchange/posts`;
  const contextBase = `${config.API_PREFIX}/exchange/request-publication-context`;
  const feeBase = `${config.API_PREFIX}/backoffice/exchange-request-fee`;
  const postId = idPathParameter("id");
  const pageParameters = [
    { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
    {
      name: "page_size",
      in: "query",
      schema: { type: "integer", minimum: 1, maximum: 100, default: 20 }
    }
  ];
  const body = (schema: string) => ({
    required: true,
    content: { "application/json": { schema: { $ref: `#/components/schemas/${schema}` } } }
  });
  const mutationParameters = (includeId = true) => [
    ...(includeId ? [postId] : []),
    exchangeIdempotencyKeyParameter
  ];

  return {
    [base]: {
      get: exchangeOperation("List live demand or intelligence posts", "exchange:posts:list", {
        description:
          "For type=demand, customers receive only demand posts authored by their active account; merchant and technician identities receive the live demand marketplace. Intelligence posts follow the normal live feed scope.",
        parameters: [
          {
            name: "type",
            in: "query",
            required: true,
            schema: { type: "string", enum: ["demand", "intelligence"] }
          },
          ...pageParameters
        ],
        responses: {
          "200": jsonDataResponse("Paginated live Exchange posts", {
            $ref: "#/components/schemas/ExchangePostPage"
          }),
          ...exchangeErrorResponses
        }
      }),
      post: exchangeOperation(
        "Publish a demand or intelligence post for the active identity",
        ["exchange:posts:create-demand", "exchange:posts:create-intelligence"],
        {
          parameters: mutationParameters(false),
          requestBody: body("ExchangePublishRequest"),
          responses: {
            "201": jsonDataResponse("Persisted Exchange post", {
              $ref: "#/components/schemas/ExchangePost"
            }),
            ...exchangeErrorResponses,
            "503": {
              description:
                "error.exchange.request_fee_unavailable — no valid Request publication fee is effective"
            }
          }
        }
      )
    },
    [`${base}/{id}`]: {
      get: exchangeOperation("Read one persisted Exchange post", "exchange:posts:detail", {
        description:
          "Demand posts are readable by their customer owner and by merchant or technician identities; other customers receive 404. Intelligence posts follow the normal live feed scope.",
        parameters: [postId],
        responses: {
          "200": jsonDataResponse("Exchange post", {
            $ref: "#/components/schemas/ExchangePost"
          }),
          ...exchangeErrorResponses
        }
      })
    },
    [`${base}/{id}/withdraw`]: {
      post: exchangeOperation(
        "Withdraw the active identity's own post",
        "exchange:posts:withdraw-own",
        {
          parameters: mutationParameters(),
          responses: {
            "200": jsonDataResponse("Withdrawn Exchange post", {
              $ref: "#/components/schemas/ExchangePost"
            }),
            ...exchangeErrorResponses,
            "409": {
              description: `${exchangeErrorResponses["409"].description}; error.exchange.request_financial_state_conflict — Request publication fee is no longer held`
            }
          }
        }
      )
    },
    [`${base}/{id}/comments`]: {
      get: exchangeOperation("List persisted comments", "exchange:comments:list", {
        parameters: [postId, ...pageParameters],
        responses: {
          "200": jsonDataResponse("Paginated Exchange comments", {
            $ref: "#/components/schemas/ExchangeCommentPage"
          }),
          ...exchangeErrorResponses
        }
      }),
      post: exchangeOperation("Create a persisted comment", "exchange:comments:create", {
        parameters: mutationParameters(),
        requestBody: body("ExchangeCommentCreateRequest"),
        responses: {
          "201": jsonDataResponse("Persisted Exchange comment", {
            $ref: "#/components/schemas/ExchangeComment"
          }),
          ...exchangeErrorResponses
        }
      })
    },
    [`${base}/{id}/like`]: {
      put: exchangeOperation("Like one Exchange post", "exchange:likes:write", {
        parameters: mutationParameters(),
        responses: {
          "200": jsonDataResponse("Server-authoritative interaction counts", {
            $ref: "#/components/schemas/ExchangeInteractionCounts"
          }),
          ...exchangeErrorResponses
        }
      }),
      delete: exchangeOperation("Unlike one Exchange post", "exchange:likes:write", {
        parameters: mutationParameters(),
        responses: {
          "200": jsonDataResponse("Server-authoritative interaction counts", {
            $ref: "#/components/schemas/ExchangeInteractionCounts"
          }),
          ...exchangeErrorResponses
        }
      })
    },
    [`${base}/{id}/shares`]: {
      post: exchangeOperation("Record one successful share", "exchange:shares:create", {
        parameters: mutationParameters(),
        responses: {
          "200": jsonDataResponse("Server-authoritative interaction counts", {
            $ref: "#/components/schemas/ExchangeInteractionCounts"
          }),
          ...exchangeErrorResponses
        }
      })
    },
    [contextBase]: {
      get: exchangeOperation(
        "Read the active identity's Request publication capacity and fee",
        "exchange:posts:create-demand",
        {
          responses: {
            "200": jsonDataResponse("Publication capacity, membership and current Request fee", {
              $ref: "#/components/schemas/ExchangeRequestPublicationContext"
            }),
            ...exchangeRequestFeeErrorResponses
          }
        }
      )
    },
    [`${feeBase}/current`]: {
      get: exchangeOperation(
        "Read the current Request publication fee",
        "backoffice:exchange-request-fee:read",
        {
          responses: {
            "200": jsonDataResponse("Current Request publication fee", {
              $ref: "#/components/schemas/ExchangeRequestFeeVersion"
            }),
            ...exchangeRequestFeeErrorResponses
          }
        }
      )
    },
    [`${feeBase}/versions`]: {
      get: exchangeOperation(
        "List Request publication fee versions",
        "backoffice:exchange-request-fee:read",
        {
          parameters: pageParameters,
          responses: {
            "200": jsonDataResponse("Paginated Request publication fee versions", {
              $ref: "#/components/schemas/ExchangeRequestFeeVersionPage"
            }),
            ...exchangeRequestFeeErrorResponses
          }
        }
      ),
      post: exchangeOperation(
        "Create a Request publication fee version",
        "backoffice:exchange-request-fee:write",
        {
          requestBody: body("ExchangeRequestFeeVersionCreateRequest"),
          responses: {
            "201": jsonDataResponse("Created Request publication fee version", {
              $ref: "#/components/schemas/ExchangeRequestFeeVersion"
            }),
            ...exchangeRequestFeeErrorResponses
          }
        }
      )
    }
  };
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

const dashboardPeriodQueryParameter = {
  name: "period",
  in: "query",
  required: false,
  schema: { $ref: "#/components/schemas/DashboardPeriod" }
};

const dashboardFromQueryParameter = {
  name: "from",
  in: "query",
  required: false,
  description: "Inclusive Tokyo calendar date; allowed only when period=custom",
  schema: { type: "string", format: "date" }
};

const dashboardToQueryParameter = {
  name: "to",
  in: "query",
  required: false,
  description: "Inclusive Tokyo calendar date; allowed only when period=custom",
  schema: { type: "string", format: "date" }
};

const dashboardQueryParameters = [
  dashboardPeriodQueryParameter,
  dashboardFromQueryParameter,
  dashboardToQueryParameter
];

const dashboardErrorResponses = {
  "400": { description: "error.validation — strict dashboard query validation failed" },
  "401": { description: "error.auth.token_invalid — missing or invalid access token" }
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
      url: "/"
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
      ...shopMembershipCardPlanOpenApiSchemas,
      DashboardPeriod: {
        type: "string",
        enum: ["today", "last7days", "last30days", "week", "month", "year", "custom"],
        default: "last7days"
      },
      DashboardMetricComparison: {
        type: "object",
        additionalProperties: false,
        required: ["current", "previous", "changeRatePercent"],
        properties: {
          current: { type: "number" },
          previous: { type: "number" },
          changeRatePercent: { type: ["number", "null"] }
        }
      },
      DashboardNdpPair: {
        type: "object",
        additionalProperties: false,
        required: ["ndp", "testNdp"],
        properties: {
          ndp: { type: "integer" },
          testNdp: { type: "integer" }
        }
      },
      DashboardPlatformGlobalNdpPair: {
        type: "object",
        additionalProperties: false,
        required: ["ndp", "testNdp", "cityFilterApplied", "scopeLabel"],
        properties: {
          ndp: { type: "integer" },
          testNdp: { type: "integer" },
          cityFilterApplied: { type: "boolean", const: false },
          scopeLabel: { type: "string", const: "platform_global" }
        }
      },
      DashboardBucket: {
        type: "object",
        additionalProperties: false,
        required: [
          "key",
          "label",
          "orderCount",
          "serviceGmvJpy",
          "platformNetRevenueNdp",
          "frozenNdp",
          "shopCount",
          "registeredTechnicianCount",
          "shopEstimatedGrossProfitJpy",
          "scheduleTotalHours",
          "scheduleAvailableHours",
          "scheduleBookedHours"
        ],
        properties: {
          key: { type: "string", minLength: 1 },
          label: { type: "string", minLength: 1 },
          orderCount: { type: "integer", minimum: 0 },
          serviceGmvJpy: { type: "integer", minimum: 0 },
          platformNetRevenueNdp: { type: "integer" },
          frozenNdp: { type: "integer", minimum: 0 },
          shopCount: { type: "integer", minimum: 0 },
          registeredTechnicianCount: { type: "integer", minimum: 0 },
          shopEstimatedGrossProfitJpy: { type: "integer" },
          scheduleTotalHours: { type: "number", minimum: 0 },
          scheduleAvailableHours: { type: "number", minimum: 0 },
          scheduleBookedHours: { type: "number", minimum: 0 }
        }
      },
      DashboardShopSnapshot: {
        type: "object",
        additionalProperties: false,
        required: ["publicId", "name", "city", "address", "status", "billing", "wallet"],
        properties: {
          publicId: { type: "string", pattern: "^shop[0-9]{10}$" },
          name: { type: "string" },
          city: { type: "string" },
          address: { type: "string" },
          status: { type: "string" },
          billing: {
            oneOf: [
              {
                type: "object",
                additionalProperties: false,
                required: ["cadence", "state", "trialEndsAt", "paidThrough"],
                properties: {
                  cadence: { type: "string", enum: ["monthly", "annual", "free"] },
                  state: { type: "string", enum: ["trial", "paid", "free", "overdue"] },
                  trialEndsAt: { type: ["string", "null"], format: "date-time" },
                  paidThrough: { type: ["string", "null"], format: "date-time" }
                }
              },
              { type: "null" }
            ]
          },
          wallet: {
            type: "object",
            additionalProperties: false,
            required: ["status", "currency", "availableBalance", "frozenBalance"],
            properties: {
              status: { type: "string", enum: ["available", "not_opened"] },
              currency: { type: "string", const: "NDP" },
              availableBalance: { type: ["integer", "null"] },
              frozenBalance: { type: ["integer", "null"] }
            }
          }
        }
      },
      DashboardMembership: {
        type: "object",
        additionalProperties: false,
        required: ["memberCount", "memberDataStatus", "completedCustomerCount"],
        properties: {
          memberCount: { type: "null" },
          memberDataStatus: { type: "string", const: "not_available" },
          completedCustomerCount: { type: "integer", minimum: 0 }
        }
      },
      ManageableMerchantShop: {
        type: "object",
        additionalProperties: false,
        required: ["publicId", "name", "city", "status", "selected"],
        properties: {
          publicId: { type: "string", pattern: "^shop[0-9]{10}$" },
          name: { type: "string", minLength: 1 },
          city: { type: "string", minLength: 1 },
          status: { type: "string", minLength: 1 },
          selected: { type: "boolean" }
        }
      },
      ManageableMerchantShopPage: {
        type: "object",
        additionalProperties: false,
        required: ["list", "total", "page", "page_size"],
        properties: {
          list: {
            type: "array",
            items: { $ref: "#/components/schemas/ManageableMerchantShop" }
          },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          page_size: { type: "integer", minimum: 1, maximum: 100 }
        }
      },
      Dashboard: {
        type: "object",
        additionalProperties: false,
        required: ["filter", "summary", "series", "finance", "shop", "membership", "scope"],
        properties: {
          filter: {
            type: "object",
            additionalProperties: false,
            required: [
              "period",
              "from",
              "to",
              "previousFrom",
              "previousTo",
              "timeZone",
              "granularity",
              "city",
              "availableCities"
            ],
            properties: {
              period: { $ref: "#/components/schemas/DashboardPeriod" },
              from: { type: "string", format: "date" },
              to: { type: "string", format: "date" },
              previousFrom: { type: "string", format: "date" },
              previousTo: { type: "string", format: "date" },
              timeZone: { type: "string", const: "Asia/Tokyo" },
              granularity: { type: "string", enum: ["hour", "day", "month"] },
              city: { type: ["string", "null"] },
              availableCities: { type: "array", items: { type: "string" } }
            }
          },
          summary: {
            type: "object",
            additionalProperties: false,
            required: [
              "availableScheduleSlots",
              "activeTechnicians",
              "registeredTechnicians",
              "shopCount",
              "newCustomers",
              "pendingOrders",
              "serviceGmvJpy"
            ],
            properties: {
              availableScheduleSlots: { $ref: "#/components/schemas/DashboardMetricComparison" },
              activeTechnicians: { $ref: "#/components/schemas/DashboardMetricComparison" },
              registeredTechnicians: { $ref: "#/components/schemas/DashboardMetricComparison" },
              shopCount: {
                oneOf: [
                  { $ref: "#/components/schemas/DashboardMetricComparison" },
                  { type: "null" }
                ]
              },
              newCustomers: {
                oneOf: [
                  { $ref: "#/components/schemas/DashboardMetricComparison" },
                  { type: "null" }
                ]
              },
              pendingOrders: { type: "integer", minimum: 0 },
              serviceGmvJpy: { type: "integer", minimum: 0 }
            }
          },
          series: {
            type: "object",
            additionalProperties: false,
            required: ["buckets"],
            properties: {
              buckets: {
                type: "array",
                items: { $ref: "#/components/schemas/DashboardBucket" }
              }
            }
          },
          finance: {
            type: "object",
            additionalProperties: false,
            required: [
              "platformNetRevenue",
              "frozen",
              "userReward",
              "walletStock",
              "withdrawn",
              "shopNdpCost"
            ],
            properties: {
              platformNetRevenue: { $ref: "#/components/schemas/DashboardNdpPair" },
              frozen: { $ref: "#/components/schemas/DashboardNdpPair" },
              userReward: { $ref: "#/components/schemas/DashboardNdpPair" },
              walletStock: {
                oneOf: [
                  { $ref: "#/components/schemas/DashboardPlatformGlobalNdpPair" },
                  { type: "null" }
                ]
              },
              withdrawn: {
                oneOf: [
                  { $ref: "#/components/schemas/DashboardPlatformGlobalNdpPair" },
                  { type: "null" }
                ]
              },
              shopNdpCost: {
                oneOf: [
                  {
                    type: "object",
                    additionalProperties: false,
                    required: ["totalNdp", "platformNdp", "userRewardNdp"],
                    properties: {
                      totalNdp: { type: "integer" },
                      platformNdp: { type: "integer" },
                      userRewardNdp: { type: "integer" }
                    }
                  },
                  { type: "null" }
                ]
              }
            }
          },
          shop: {
            oneOf: [{ $ref: "#/components/schemas/DashboardShopSnapshot" }, { type: "null" }]
          },
          membership: {
            oneOf: [{ $ref: "#/components/schemas/DashboardMembership" }, { type: "null" }]
          },
          scope: {
            oneOf: [
              {
                type: "object",
                additionalProperties: false,
                required: ["kind", "shopPublicId"],
                properties: {
                  kind: { type: "string", const: "platform" },
                  shopPublicId: { type: "null" }
                }
              },
              {
                type: "object",
                additionalProperties: false,
                required: ["kind", "shopPublicId"],
                properties: {
                  kind: { type: "string", const: "shop" },
                  shopPublicId: { type: "string", pattern: "^shop[0-9]{10}$" }
                }
              }
            ]
          }
        }
      },
      ExchangeActor: {
        type: "object",
        additionalProperties: false,
        required: ["publicId", "identityType", "displayName", "avatarUrl"],
        properties: {
          publicId: { type: "string", minLength: 1, maxLength: 32 },
          identityType: { type: "string", minLength: 1, maxLength: 50 },
          displayName: { type: "string", minLength: 1, maxLength: 100 },
          avatarUrl: { type: ["string", "null"], format: "uri" }
        }
      },
      ExchangeInteractionCounts: {
        type: "object",
        additionalProperties: false,
        required: ["comments", "likes", "shares"],
        properties: {
          comments: { type: "integer", minimum: 0 },
          likes: { type: "integer", minimum: 0 },
          shares: { type: "integer", minimum: 0 }
        }
      },
      ExchangeViewerState: {
        type: "object",
        additionalProperties: false,
        required: ["liked", "canWithdraw"],
        properties: {
          liked: { type: "boolean" },
          canWithdraw: { type: "boolean" }
        }
      },
      ExchangeDemand: {
        type: "object",
        additionalProperties: false,
        required: [
          "targetProviderCount",
          "targetProviderLimitSnapshot",
          "publisherCapacitySource",
          "membershipLevelSnapshot",
          "matchMode",
          "budgetMode",
          "budgetMinJpy",
          "budgetMaxJpy",
          "address"
        ],
        properties: {
          targetProviderCount: { type: "integer", minimum: 1, maximum: 20 },
          targetProviderLimitSnapshot: { type: "integer", minimum: 1, maximum: 20 },
          publisherCapacitySource: {
            type: "string",
            enum: ["customer_membership", "shop_merchant"]
          },
          membershipLevelSnapshot: {
            type: ["string", "null"],
            enum: ["standard", "silver", "gold", "black", null]
          },
          matchMode: { type: "string", enum: ["quick", "selective"] },
          budgetMode: { type: "string", enum: ["total", "per_provider"] },
          budgetMinJpy: {
            type: ["integer", "null"],
            minimum: 0,
            maximum: 1000000000
          },
          budgetMaxJpy: { type: "integer", minimum: 0, maximum: 1000000000 },
          address: { $ref: "#/components/schemas/ExchangeRequestAddress" }
        }
      },
      ExchangeRequestAddress: {
        type: "object",
        additionalProperties: false,
        required: [
          "line1",
          "line2",
          "line3",
          "line2GenerallyVisible",
          "line3GenerallyVisible",
          "disclosure"
        ],
        properties: {
          line1: { type: "string", minLength: 1, maxLength: 255 },
          line2: { type: ["string", "null"], minLength: 1, maxLength: 255 },
          line3: { type: ["string", "null"], minLength: 1, maxLength: 255 },
          line2GenerallyVisible: { type: "boolean" },
          line3GenerallyVisible: { type: "boolean" },
          disclosure: { type: "string", enum: ["owner", "general"] }
        }
      },
      ExchangeRequestDemand: {
        allOf: [{ $ref: "#/components/schemas/ExchangeDemand" }]
      },
      ExchangeRequestPublicationFee: {
        type: "object",
        additionalProperties: false,
        required: ["amountNdp", "currency", "ruleSetVersion"],
        properties: {
          amountNdp: { type: "integer", minimum: 0, maximum: 1000000000 },
          currency: { type: "string", enum: ["NDP", "TEST_NDP"] },
          ruleSetVersion: { type: "integer", minimum: 1 }
        }
      },
      ExchangeRequestPublicationContext: {
        type: "object",
        additionalProperties: false,
        required: [
          "canPublish",
          "capacitySource",
          "membershipLevel",
          "maxTargetProviderCount",
          "publicationFee"
        ],
        properties: {
          canPublish: { type: "boolean" },
          capacitySource: { type: "string", enum: ["customer_membership", "shop_merchant"] },
          membershipLevel: {
            type: ["string", "null"],
            enum: ["standard", "silver", "gold", "black", null]
          },
          maxTargetProviderCount: { type: "integer", minimum: 1, maximum: 20 },
          publicationFee: { $ref: "#/components/schemas/ExchangeRequestPublicationFee" }
        }
      },
      ExchangeRequestFeeVersion: {
        type: "object",
        additionalProperties: false,
        required: ["amountNdp", "ruleSetVersion", "effectiveFrom", "effectiveTo"],
        properties: {
          amountNdp: { type: "integer", minimum: 0, maximum: 1000000000 },
          ruleSetVersion: { type: "integer", minimum: 1 },
          effectiveFrom: { type: ["string", "null"], format: "date-time" },
          effectiveTo: { type: ["string", "null"], format: "date-time" }
        }
      },
      ExchangeRequestFeeVersionPage: {
        type: "object",
        additionalProperties: false,
        required: ["list", "total", "page", "page_size"],
        properties: {
          list: {
            type: "array",
            items: { $ref: "#/components/schemas/ExchangeRequestFeeVersion" }
          },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          page_size: { type: "integer", minimum: 1, maximum: 100 }
        }
      },
      ExchangeRequestFeeVersionCreateRequest: {
        type: "object",
        additionalProperties: false,
        required: ["amountNdp", "effectiveFrom", "expectedCurrentVersion"],
        properties: {
          amountNdp: { type: "integer", minimum: 0, maximum: 1000000000 },
          effectiveFrom: { type: "string", format: "date-time" },
          expectedCurrentVersion: { type: "integer", minimum: 1 }
        }
      },
      ExchangeIntelligence: {
        type: "object",
        additionalProperties: false,
        required: [
          "serviceMode",
          "addressLabel",
          "serviceAreas",
          "originalPriceJpy",
          "campaignPriceJpy"
        ],
        properties: {
          serviceMode: { type: "string", enum: ["store", "onsite", "flexible"] },
          addressLabel: { type: ["string", "null"], maxLength: 255 },
          serviceAreas: {
            type: "array",
            minItems: 1,
            maxItems: 30,
            uniqueItems: true,
            items: { type: "string", minLength: 1, maxLength: 120 }
          },
          originalPriceJpy: {
            type: ["integer", "null"],
            minimum: 0,
            maximum: 1000000000
          },
          campaignPriceJpy: { type: "integer", minimum: 0, maximum: 1000000000 }
        }
      },
      ExchangePost: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "type",
          "status",
          "title",
          "detail",
          "contentLocale",
          "areaLabel",
          "serviceStartAt",
          "serviceEndAt",
          "expiresAt",
          "publishedAt",
          "publisher",
          "counts",
          "viewer",
          "demand",
          "intelligence"
        ],
        properties: {
          id: { type: "integer", minimum: 1 },
          type: { type: "string", enum: ["demand", "intelligence"] },
          status: { type: "string", enum: ["published", "withdrawn", "expired"] },
          title: { type: "string", minLength: 1, maxLength: 120 },
          detail: { type: "string", minLength: 1, maxLength: 10000 },
          contentLocale: { type: "string", enum: ["zh-CN", "zh-TW", "en", "ja", "ko"] },
          areaLabel: { type: "string", minLength: 1, maxLength: 120 },
          serviceStartAt: { type: "string", format: "date-time" },
          serviceEndAt: { type: "string", format: "date-time" },
          expiresAt: { type: "string", format: "date-time" },
          publishedAt: { type: "string", format: "date-time" },
          publisher: {
            oneOf: [{ $ref: "#/components/schemas/ExchangeActor" }, { type: "null" }]
          },
          counts: { $ref: "#/components/schemas/ExchangeInteractionCounts" },
          viewer: { $ref: "#/components/schemas/ExchangeViewerState" },
          demand: {
            oneOf: [{ $ref: "#/components/schemas/ExchangeDemand" }, { type: "null" }]
          },
          intelligence: {
            oneOf: [{ $ref: "#/components/schemas/ExchangeIntelligence" }, { type: "null" }]
          }
        }
      },
      ExchangePostPage: {
        type: "object",
        additionalProperties: false,
        required: ["list", "total", "page", "page_size"],
        properties: {
          list: { type: "array", items: { $ref: "#/components/schemas/ExchangePost" } },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          page_size: { type: "integer", minimum: 1, maximum: 100 }
        }
      },
      ExchangeComment: {
        type: "object",
        additionalProperties: false,
        required: ["id", "postId", "author", "content", "createdAt"],
        properties: {
          id: { type: "integer", minimum: 1 },
          postId: { type: "integer", minimum: 1 },
          author: { $ref: "#/components/schemas/ExchangeActor" },
          content: { type: "string", minLength: 1, maxLength: 1000 },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      ExchangeCommentPage: {
        type: "object",
        additionalProperties: false,
        required: ["list", "total", "page", "page_size"],
        properties: {
          list: { type: "array", items: { $ref: "#/components/schemas/ExchangeComment" } },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          page_size: { type: "integer", minimum: 1, maximum: 100 }
        }
      },
      ExchangeDemandPublishRequest: {
        type: "object",
        additionalProperties: false,
        required: [
          "type",
          "title",
          "detail",
          "contentLocale",
          "serviceStartAt",
          "serviceEndAt",
          "expiresAt",
          "targetProviderCount",
          "matchMode",
          "budgetMode",
          "budgetMaxJpy",
          "addressLine1"
        ],
        properties: {
          type: { type: "string", enum: ["demand"] },
          title: {
            type: "string",
            minLength: 1,
            maxLength: 120,
            example: "中目黒でイベント用ヘアセットをお願いしたい"
          },
          detail: {
            type: "string",
            minLength: 1,
            maxLength: 10000,
            example: "午後のイベント前に、自然なアップスタイルを希望します。"
          },
          contentLocale: { type: "string", enum: ["zh-CN", "zh-TW", "en", "ja", "ko"] },
          serviceStartAt: { type: "string", format: "date-time" },
          serviceEndAt: { type: "string", format: "date-time" },
          expiresAt: { type: "string", format: "date-time" },
          targetProviderCount: { type: "integer", minimum: 1, maximum: 20 },
          matchMode: { type: "string", enum: ["quick", "selective"] },
          budgetMode: { type: "string", enum: ["total", "per_provider"] },
          budgetMinJpy: {
            type: ["integer", "null"],
            minimum: 0,
            maximum: 1000000000,
            default: null
          },
          budgetMaxJpy: { type: "integer", minimum: 0, maximum: 1000000000 },
          addressLine1: { type: "string", minLength: 1, maxLength: 255 },
          addressLine2: {
            type: ["string", "null"],
            minLength: 1,
            maxLength: 255,
            default: null
          },
          addressLine3: {
            type: ["string", "null"],
            minLength: 1,
            maxLength: 255,
            default: null
          },
          addressLine2Public: { type: "boolean", default: false },
          addressLine3Public: { type: "boolean", default: false },
          publisherIdentityPublic: { type: "boolean", default: false }
        }
      },
      ExchangeIntelligencePublishRequest: {
        type: "object",
        additionalProperties: false,
        required: [
          "type",
          "title",
          "detail",
          "contentLocale",
          "areaLabel",
          "serviceStartAt",
          "serviceEndAt",
          "expiresAt",
          "serviceMode",
          "serviceAreas",
          "campaignPriceJpy"
        ],
        properties: {
          type: { type: "string", enum: ["intelligence"] },
          title: {
            type: "string",
            minLength: 1,
            maxLength: 120,
            example: "平日限定のヘッドスパ枠をご案内します"
          },
          detail: {
            type: "string",
            minLength: 1,
            maxLength: 10000,
            example: "落ち着いた個室で施術します。事前相談も可能です。"
          },
          contentLocale: { type: "string", enum: ["zh-CN", "zh-TW", "en", "ja", "ko"] },
          areaLabel: { type: "string", minLength: 1, maxLength: 120 },
          serviceStartAt: { type: "string", format: "date-time" },
          serviceEndAt: { type: "string", format: "date-time" },
          expiresAt: { type: "string", format: "date-time" },
          serviceMode: { type: "string", enum: ["store", "onsite", "flexible"] },
          addressLabel: { type: ["string", "null"], maxLength: 255 },
          serviceAreas: {
            type: "array",
            minItems: 1,
            maxItems: 30,
            uniqueItems: true,
            items: { type: "string", minLength: 1, maxLength: 120 }
          },
          originalPriceJpy: {
            type: ["integer", "null"],
            minimum: 0,
            maximum: 1000000000
          },
          campaignPriceJpy: { type: "integer", minimum: 0, maximum: 1000000000 }
        }
      },
      ExchangePublishRequest: {
        oneOf: [
          { $ref: "#/components/schemas/ExchangeDemandPublishRequest" },
          { $ref: "#/components/schemas/ExchangeIntelligencePublishRequest" }
        ],
        discriminator: { propertyName: "type" }
      },
      ExchangeCommentCreateRequest: {
        type: "object",
        additionalProperties: false,
        required: ["content"],
        properties: { content: { type: "string", minLength: 1, maxLength: 1000 } }
      },
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
      ImMessageTranslationRequest: {
        type: "object",
        additionalProperties: false,
        required: ["messageIds", "targetLanguage"],
        properties: {
          messageIds: {
            type: "array",
            minItems: 1,
            maxItems: 50,
            uniqueItems: true,
            items: { type: "integer", minimum: 1 }
          },
          targetLanguage: { type: "string", enum: ["zh", "zh-Hant", "ja", "en", "ko"] }
        }
      },
      ImMessageTranslationItem: {
        type: "object",
        additionalProperties: false,
        required: ["messageId", "status"],
        properties: {
          messageId: { type: "integer", minimum: 1 },
          status: { type: "string", enum: ["translated", "same_language", "ineligible"] },
          translatedContent: { type: "string" }
        }
      },
      ImChatRecordSummary: {
        type: "object",
        additionalProperties: false,
        required: [
          "publicId",
          "title",
          "preview",
          "senderNames",
          "senderCount",
          "itemCount",
          "createdAt"
        ],
        properties: {
          publicId: { type: "string", format: "uuid" },
          title: { type: "string", maxLength: 255 },
          preview: { type: "string", maxLength: 500 },
          senderNames: {
            type: "array",
            minItems: 1,
            maxItems: 100,
            items: { type: "string", minLength: 1, maxLength: 120 }
          },
          senderCount: { type: "integer", minimum: 1, maximum: 100 },
          itemCount: { type: "integer", minimum: 1, maximum: 100 },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      ImChatRecordItem: {
        type: "object",
        additionalProperties: false,
        required: [
          "id", "position", "senderDisplayName", "senderAvatarUrl",
          "messageType", "content", "metadata", "sentAt"
        ],
        properties: {
          id: { type: "integer", minimum: 1, maximum: safeIntegerMaximum },
          position: { type: "integer", minimum: 1, maximum: 100 },
          senderDisplayName: { type: "string", maxLength: 100 },
          senderAvatarUrl: { type: ["string", "null"] },
          messageType: { type: "string" },
          content: { type: ["string", "null"] },
          metadata: { type: ["object", "null"], additionalProperties: true },
          sentAt: { type: "string", format: "date-time" }
        }
      },
      ImChatRecordItemPage: {
        type: "object",
        additionalProperties: false,
        required: ["list", "total", "page", "page_size", "nextCursor"],
        properties: {
          list: { type: "array", items: { $ref: "#/components/schemas/ImChatRecordItem" } },
          total: { type: "integer", minimum: 0, maximum: safeIntegerMaximum },
          page: { type: "integer", minimum: 1, maximum: safeIntegerMaximum },
          page_size: { type: "integer", minimum: 1, maximum: 50 },
          nextCursor: { type: ["integer", "null"], minimum: 1, maximum: safeIntegerMaximum }
        }
      },
      ImChatRecordFavorite: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "bundlePublicId",
          "title",
          "preview",
          "senderNames",
          "senderCount",
          "itemCount",
          "createdAt"
        ],
        properties: {
          id: { type: "integer", minimum: 1, maximum: safeIntegerMaximum },
          bundlePublicId: { type: "string", format: "uuid" },
          title: { type: "string", maxLength: 255 },
          preview: { type: "string", maxLength: 500 },
          senderNames: {
            type: "array",
            minItems: 1,
            maxItems: 100,
            items: { type: "string", minLength: 1, maxLength: 120 }
          },
          senderCount: { type: "integer", minimum: 1, maximum: 100 },
          itemCount: { type: "integer", minimum: 1, maximum: 100 },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      ImChatRecordFavoritePage: {
        type: "object",
        additionalProperties: false,
        required: ["list", "total", "page", "page_size"],
        properties: {
          list: { type: "array", items: { $ref: "#/components/schemas/ImChatRecordFavorite" } },
          total: { type: "integer", minimum: 0, maximum: safeIntegerMaximum },
          page: { type: "integer", minimum: 1, maximum: safeIntegerMaximum },
          page_size: { type: "integer", minimum: 1, maximum: 100 }
        }
      },
      ImChatRecordCommand: {
        type: "object",
        additionalProperties: false,
        required: ["idempotencyKey", "messageIds", "sourceConversationId"],
        properties: {
          idempotencyKey: { type: "string", format: "uuid" },
          messageIds: {
            type: "array", minItems: 1, maxItems: 100, uniqueItems: true,
            items: { type: "integer", minimum: 1, maximum: safeIntegerMaximum }
          },
          sourceConversationId: { type: "integer", minimum: 1, maximum: safeIntegerMaximum }
        }
      },
      ImBatchDeleteRequest: {
        type: "object",
        additionalProperties: false,
        required: ["messageIds", "idempotencyKey"],
        properties: {
          messageIds: {
            type: "array", minItems: 1, maxItems: 100, uniqueItems: true,
            items: { type: "integer", minimum: 1, maximum: safeIntegerMaximum }
          },
          idempotencyKey: { type: "string", format: "uuid" }
        }
      },
      ImChatRecordDeliveryResult: {
        type: "object",
        additionalProperties: false,
        required: ["replayed", "bundle", "message"],
        properties: {
          replayed: { type: "boolean" },
          bundle: { $ref: "#/components/schemas/ImChatRecordSummary" },
          message: { $ref: "#/components/schemas/RealtimeMessage" }
        }
      },
      ImChatRecordFavoriteMutationResult: {
        type: "object",
        additionalProperties: false,
        required: ["replayed", "favorite"],
        properties: {
          replayed: { type: "boolean" },
          favorite: { $ref: "#/components/schemas/ImChatRecordFavorite" }
        }
      },
      ImChatRecordFavoriteDeleteResult: {
        type: "object",
        additionalProperties: false,
        required: ["deleted"],
        properties: { deleted: { type: "boolean", enum: [true] } }
      },
      ImBatchDeleteResult: {
        type: "object",
        additionalProperties: false,
        required: ["conversationId", "messageIds", "count", "deleted", "replayed"],
        properties: {
          conversationId: { type: "integer", minimum: 1, maximum: safeIntegerMaximum },
          messageIds: {
            type: "array", minItems: 1, maxItems: 100, uniqueItems: true,
            items: { type: "integer", minimum: 1, maximum: safeIntegerMaximum }
          },
          count: { type: "integer", minimum: 1, maximum: 100 },
          deleted: { type: "boolean", enum: [true] },
          replayed: { type: "boolean" }
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
          avatarUrl: { type: ["string", "null"] },
          role: { type: "string", enum: ["owner", "admin", "member"] }
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
          "expiresAt",
          "recallDeadlineAt",
          "recalledAt",
          "recallMode",
          "contentPurgedAt",
          "privacyPolicyVersionAtSend",
          "lifecycleVersion",
          "reactionVersion",
          "availableRecallModes",
          "createdAt"
        ],
        properties: {
          id: { type: "integer", minimum: 1, maximum: PRISMA_INT_MAX },
          conversationId: { type: "integer", minimum: 1, maximum: PRISMA_INT_MAX },
          senderUserId: {
            type: ["integer", "null"],
            minimum: 1,
            maximum: PRISMA_INT_MAX
          },
          type: { type: "string", enum: ["text", "system", "orderStatus"] },
          content: { type: ["string", "null"] },
          metadata: {},
          reactions: {
            type: "array",
            items: { $ref: "#/components/schemas/RealtimeMessageReaction" }
          },
          expiresAt: { type: ["string", "null"], format: "date-time" },
          recallDeadlineAt: { type: ["string", "null"], format: "date-time" },
          recalledAt: { type: ["string", "null"], format: "date-time" },
          recallMode: {
            type: ["string", "null"],
            enum: ["standard", "traceless", null]
          },
          contentPurgedAt: { type: ["string", "null"], format: "date-time" },
          privacyPolicyVersionAtSend: { type: ["integer", "null"], minimum: 0 },
          lifecycleVersion: { type: "integer", minimum: 0 },
          reactionVersion: { type: "integer", minimum: 0 },
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
          "isPinned",
          "isMuted",
          "autoTranslateMessages",
          "privacyModeEnabled",
          "hideMemberProfiles",
          "disappearingTtlSeconds",
          "disappearingStartMode",
          "privacyPolicyVersion",
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
          directPeer: {
            anyOf: [{ $ref: "#/components/schemas/RealtimeParticipant" }, { type: "null" }],
            description:
              "Read-only display peer for a direct conversation whose former contact removed their own participant record. This does not grant membership or send permission."
          },
          lastMessage: {
            anyOf: [{ $ref: "#/components/schemas/RealtimeMessage" }, { type: "null" }]
          },
          unreadCount: { type: "integer" },
          isPinned: { type: "boolean" },
          isMuted: { type: "boolean" },
          autoTranslateMessages: { type: "boolean", default: false },
          privacyModeEnabled: { type: "boolean" },
          hideMemberProfiles: { type: "boolean" },
          disappearingTtlSeconds: {
            type: ["integer", "null"],
            minimum: IM_PRIVACY_TTL_MIN_SECONDS,
            maximum: IM_PRIVACY_TTL_MAX_SECONDS
          },
          disappearingStartMode: { type: "string", enum: ["sent", "read_by_all"] },
          privacyPolicyVersion: { type: "integer", minimum: 0 },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      RealtimeContact: {
        type: "object",
        required: [
          "id",
          "ownerUserId",
          "ownerIdentityId",
          "contactUserId",
          "contactIdentityId",
          "contactUser",
          "nickname",
          "source",
          "isBlocked",
          "createdAt"
        ],
        properties: {
          id: { type: "integer" },
          ownerUserId: { type: "integer" },
          ownerIdentityId: { type: "integer" },
          contactUserId: { type: "integer" },
          contactIdentityId: { type: "integer" },
          contactUser: { $ref: "#/components/schemas/RealtimeParticipant" },
          nickname: { type: ["string", "null"] },
          source: { type: "string" },
          isBlocked: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      RealtimeUploadedImage: {
        type: "object",
        required: ["fileName", "fileSize", "mimeType", "url"],
        properties: {
          fileName: { type: "string", minLength: 1, maxLength: 255 },
          fileSize: { type: "integer", minimum: 1, maximum: 8388608 },
          mimeType: { type: "string", enum: ["image/jpeg", "image/png", "image/webp"] },
          url: { type: "string", format: "uri" }
        }
      },
      FriendRequest: {
        type: "object",
        required: [
          "id",
          "requesterUserId",
          "requesterIdentityId",
          "targetUserId",
          "targetIdentityId",
          "requester",
          "target",
          "status",
          "message",
          "respondedAt",
          "expiresAt",
          "expiredAt",
          "createdAt"
        ],
        properties: {
          id: { type: "integer" },
          requesterUserId: { type: "integer" },
          requesterIdentityId: { type: "integer" },
          targetUserId: { type: "integer" },
          targetIdentityId: { type: "integer" },
          requester: { $ref: "#/components/schemas/RealtimeParticipant" },
          target: { $ref: "#/components/schemas/RealtimeParticipant" },
          status: { type: "string", enum: ["pending", "accepted", "rejected", "expired"] },
          message: { type: "string", nullable: true },
          respondedAt: { type: "string", format: "date-time", nullable: true },
          expiresAt: { type: "string", format: "date-time" },
          expiredAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      FriendRequestCreateResult: {
        type: "object",
        required: ["friendRequest", "created"],
        properties: {
          friendRequest: { $ref: "#/components/schemas/FriendRequest" },
          created: { type: "boolean" }
        }
      },
      RealtimeDirectoryIdentityCard: {
        type: "object",
        required: [
          "entityType",
          "profileId",
          "displayName",
          "identityLabel",
          "verified",
          "creditValue",
          "creditReviewCount",
          "gender",
          "age",
          "heightCm",
          "languages",
          "city",
          "serviceArea",
          "yearsExperience",
          "bio"
        ],
        properties: {
          entityType: {
            type: "string",
            enum: ["user", "technician", "shop", "account"]
          },
          profileId: { type: "integer", nullable: true },
          displayName: { type: "string" },
          identityLabel: { type: "string", nullable: true },
          verified: { type: "boolean" },
          creditValue: { type: "string", nullable: true },
          creditReviewCount: { type: "integer", minimum: 0 },
          gender: { type: "string", nullable: true },
          age: { type: "integer", nullable: true, minimum: 0 },
          heightCm: { type: "string", nullable: true },
          languages: { type: "array", items: { type: "string" } },
          city: { type: "string", nullable: true },
          serviceArea: { type: "string", nullable: true },
          yearsExperience: { type: "integer", nullable: true, minimum: 0 },
          bio: { type: "string", nullable: true }
        }
      },
      RealtimeDirectoryProfile: {
        type: "object",
        required: ["user", "identityCard", "relationship", "contactId", "friendRequest"],
        properties: {
          user: { $ref: "#/components/schemas/RealtimeParticipant" },
          identityCard: { $ref: "#/components/schemas/RealtimeDirectoryIdentityCard" },
          relationship: {
            type: "string",
            enum: ["none", "friend", "incoming_pending", "outgoing_pending", "self"]
          },
          contactId: { type: "integer", nullable: true },
          friendRequest: {
            anyOf: [{ $ref: "#/components/schemas/FriendRequest" }, { type: "null" }]
          }
        }
      },
      DeleteFriendshipResult: {
        type: "object",
        required: [
          "actorUserId",
          "counterpartUserId",
          "contactIds",
          "deletedContactCount",
          "deletedFollowCount",
          "deletedConversationId",
          "deletedAt",
          "deleted"
        ],
        properties: {
          actorUserId: { type: "integer" },
          counterpartUserId: { type: "integer" },
          contactIds: { type: "array", items: { type: "integer" } },
          deletedContactCount: { type: "integer", minimum: 0 },
          deletedFollowCount: { type: "integer", minimum: 0 },
          deletedConversationId: { type: "integer", nullable: true },
          deletedAt: { type: "string", format: "date-time" },
          deleted: { type: "boolean", enum: [true] }
        }
      },
      SocialPost: {
        type: "object",
        required: [
          "id",
          "authorUserId",
          "authorIdentityId",
          "content",
          "media",
          "replyToPostId",
          "replyCount",
          "visibility",
          "createdAt",
          "updatedAt",
          "author",
          "viewerFollowsAuthor",
          "authorFollowsViewer",
          "viewerIsFriend",
          "counters",
          "viewerInteraction"
        ],
        properties: {
          id: { type: "integer" },
          authorUserId: { type: "integer" },
          authorIdentityId: { type: "integer" },
          content: { type: "string" },
          media: {},
          replyToPostId: { type: "integer", nullable: true, minimum: 1 },
          replyCount: { type: "integer", minimum: 0 },
          visibility: { type: "string", enum: ["public", "followers"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          viewerFollowsAuthor: { type: "boolean" },
          authorFollowsViewer: { type: "boolean" },
          viewerIsFriend: {
            type: "boolean",
            description:
              "True when the viewer and author have active, unblocked Contact rows in both directions."
          },
          counters: {
            type: "object",
            additionalProperties: false,
            required: ["likes", "reposts", "views", "bookmarks"],
            properties: {
              likes: { type: "integer", minimum: 0 },
              reposts: { type: "integer", minimum: 0 },
              views: { type: "integer", minimum: 0 },
              bookmarks: { type: "integer", minimum: 0 }
            }
          },
          viewerInteraction: {
            type: "object",
            additionalProperties: false,
            required: ["liked", "bookmarked", "shared"],
            properties: {
              liked: { type: "boolean" },
              bookmarked: { type: "boolean" },
              shared: { type: "boolean" }
            }
          },
          author: { $ref: "#/components/schemas/SocialProfileSummary" }
        }
      },
      SocialProfileSummary: {
        type: "object",
        additionalProperties: false,
        required: [
          "userId",
          "identityId",
          "username",
          "displayName",
          "avatarUrl",
          "entityType",
          "joinedAt"
        ],
        properties: {
          userId: { type: "integer" },
          identityId: { type: "integer" },
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
        required: [
          "id",
          "followerUserId",
          "followerIdentityId",
          "followingUserId",
          "followingIdentityId",
          "createdAt"
        ],
        properties: {
          id: { type: "integer" },
          followerUserId: { type: "integer" },
          followerIdentityId: { type: "integer" },
          followingUserId: { type: "integer" },
          followingIdentityId: { type: "integer" },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      Notification: {
        type: "object",
        required: [
          "id",
          "recipientUserId",
          "recipientIdentityId",
          "actorUserId",
          "actorIdentityId",
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
          recipientIdentityId: { type: "integer" },
          actorUserId: { type: ["integer", "null"] },
          actorIdentityId: { type: ["integer", "null"] },
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
          "needoId",
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
          needoId: { type: "string", pattern: "^[usm][0-9]{10}$" },
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
      BackofficeAuditTimelinePage: {
        type: "object",
        required: ["list", "total", "page", "page_size"],
        properties: {
          list: {
            type: "array",
            items: { $ref: "#/components/schemas/BackofficeAuditEvent" }
          },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          page_size: { type: "integer", minimum: 1, maximum: 100 }
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
          "customerProfileId",
          "customerName",
          "serviceId",
          "serviceName",
          "shopId",
          "shopName",
          "technicianProfileId",
          "technicianNeedoId",
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
          customerProfileId: { type: ["integer", "null"] },
          customerName: { type: "string" },
          serviceId: { type: ["integer", "null"] },
          serviceName: { type: "string" },
          shopId: { type: "integer" },
          shopName: { type: "string" },
          technicianProfileId: { type: ["integer", "null"] },
          technicianNeedoId: { type: ["string", "null"] },
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
              "timeline",
              "membershipGrantMode",
              "membershipDurationUnit",
              "membershipDurationValue",
              "membershipStartsAt",
              "membershipExpiresAt",
              "membershipGrantedBy"
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
              },
              membershipGrantMode: {
                type: "string",
                enum: ["self_service", "operator_complimentary"]
              },
              membershipDurationUnit: {
                type: ["string", "null"],
                enum: ["forever", "day", "month", null]
              },
              membershipDurationValue: { type: ["integer", "null"], minimum: 1 },
              membershipStartsAt: { type: ["string", "null"], format: "date-time" },
              membershipExpiresAt: { type: ["string", "null"], format: "date-time" },
              membershipGrantedBy: {
                anyOf: [
                  {
                    type: "object",
                    required: ["needoId", "username"],
                    properties: {
                      needoId: { type: "string" },
                      username: { type: "string" }
                    }
                  },
                  { type: "null" }
                ]
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
          phone: { type: ["string", "null"], minLength: 5, maxLength: 32 },
          avatarDataUrl: {
            type: "string",
            pattern: "^data:image/(?:png|jpeg|webp);base64,",
            maxLength: 7000000
          }
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
          isPublic: { type: "boolean" }
        }
      },
      BackofficeCustomerMembershipGrantInput: {
        type: "object",
        additionalProperties: false,
        required: ["membershipLevel", "grantMode", "durationUnit", "durationValue", "startsAt"],
        properties: {
          membershipLevel: { type: "string", minLength: 1, maxLength: 50 },
          grantMode: { type: "string", enum: ["operator_complimentary"] },
          durationUnit: { type: "string", enum: ["forever", "day", "month"] },
          durationValue: { type: ["integer", "null"], minimum: 1, maximum: 1200 },
          startsAt: { type: "string", format: "date-time" }
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
      SwitchMerchantShopResponse: {
        type: "object",
        additionalProperties: false,
        required: ["accessToken", "refreshToken", "expiresIn", "me", "shopPublicId"],
        properties: {
          accessToken: { type: "string" },
          refreshToken: { type: "string" },
          expiresIn: { type: "integer", enum: [config.AUTH_ACCESS_TOKEN_TTL_SECONDS] },
          me: { $ref: "#/components/schemas/AuthMe" },
          shopPublicId: { type: "string", pattern: "^shop[0-9]{10}$" }
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
          "isTestAccount",
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
          isTestAccount: { type: "boolean" },
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
          "isTestAccount",
          "balances",
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
          isTestAccount: { type: "boolean" },
          balances: {
            type: "object",
            required: ["ndp", "testNdp"],
            properties: {
              ndp: { $ref: "#/components/schemas/UserWalletBalance" },
              testNdp: { $ref: "#/components/schemas/UserWalletBalance" }
            }
          },
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
      UserWalletBalance: {
        type: "object",
        required: ["available", "frozen"],
        properties: {
          available: { type: "integer", minimum: 0 },
          frozen: { type: "integer", minimum: 0 }
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
          "publicId",
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
          publicId: { type: "string", format: "uuid" },
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
      ServiceCardPage: {
        type: "object",
        additionalProperties: false,
        required: ["list", "total", "page", "page_size"],
        properties: {
          list: { type: "array", items: { $ref: "#/components/schemas/ServiceCard" } },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          page_size: { type: "integer", minimum: 1, maximum: 100 }
        }
      },
      ShopCardPage: {
        type: "object",
        additionalProperties: false,
        required: ["list", "total", "page", "page_size"],
        properties: {
          list: { type: "array", items: { $ref: "#/components/schemas/ShopCard" } },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          page_size: { type: "integer", minimum: 1, maximum: 100 }
        }
      },
      TechnicianCardPage: {
        type: "object",
        additionalProperties: false,
        required: ["list", "total", "page", "page_size"],
        properties: {
          list: { type: "array", items: { $ref: "#/components/schemas/TechnicianCard" } },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          page_size: { type: "integer", minimum: 1, maximum: 100 }
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
      TechnicianSelfProfile: {
        type: "object",
        required: [
          "id",
          "publicId",
          "userId",
          "shopId",
          "displayName",
          "avatarUrl",
          "bio",
          "city",
          "age",
          "heightCm",
          "languages",
          "serviceAreas",
          "profileTags",
          "canServeForeigners",
          "bidBudgetMinJpy",
          "bidBudgetMaxJpy",
          "paymentMethods",
          "visibility",
          "employmentType",
          "yearsExperience",
          "createdAt",
          "updatedAt"
        ],
        properties: {
          id: { type: "integer", minimum: 1 },
          publicId: { type: "string" },
          userId: { type: "integer", minimum: 1 },
          shopId: { type: ["integer", "null"], minimum: 1 },
          displayName: { type: "string", minLength: 1, maxLength: 120 },
          avatarUrl: { type: ["string", "null"] },
          bio: { type: ["string", "null"], maxLength: 2000 },
          city: { type: "string" },
          age: { type: ["integer", "null"], minimum: 18, maximum: 150 },
          heightCm: { type: ["number", "null"], minimum: 30, maximum: 250 },
          languages: { type: "array", items: { type: "string" } },
          serviceAreas: { type: "array", items: { type: "string" } },
          profileTags: { type: "array", items: { type: "string" } },
          canServeForeigners: { type: "boolean" },
          bidBudgetMinJpy: { type: ["integer", "null"], minimum: 0 },
          bidBudgetMaxJpy: { type: ["integer", "null"], minimum: 0 },
          paymentMethods: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "platform",
                "offline",
                "prepay",
                "cash",
                "paypay",
                "paypal",
                "wechatpay",
                "alipay"
              ]
            }
          },
          visibility: { type: "string", enum: ["public", "privateAll", "limited", "network"] },
          employmentType: { type: "string", enum: ["independent", "full_time", "temporary"] },
          yearsExperience: { type: "integer", minimum: 0 },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      TechnicianSelfProfileUpdate: {
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
          age: { type: ["integer", "null"], minimum: 18, maximum: 150 },
          heightCm: { type: ["number", "null"], minimum: 30, maximum: 250 },
          languages: {
            type: "array",
            minItems: 1,
            maxItems: 10,
            items: { type: "string", maxLength: 40 }
          },
          bio: { type: ["string", "null"], maxLength: 2000 },
          serviceAreas: {
            type: "array",
            minItems: 1,
            maxItems: 20,
            items: { type: "string", maxLength: 80 }
          },
          profileTags: { type: "array", maxItems: 20, items: { type: "string", maxLength: 50 } },
          canServeForeigners: { type: "boolean" },
          bidBudgetMinJpy: { type: ["integer", "null"], minimum: 0, maximum: 100000000 },
          bidBudgetMaxJpy: { type: ["integer", "null"], minimum: 0, maximum: 100000000 },
          paymentMethods: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: {
              type: "string",
              enum: [
                "platform",
                "offline",
                "prepay",
                "cash",
                "paypay",
                "paypal",
                "wechatpay",
                "alipay"
              ]
            }
          },
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
          currency: { type: "string", enum: ["NDP", "TEST_NDP"] },
          availableBalance: { type: "integer" },
          frozenBalance: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      WalletSummary: {
        type: "object",
        additionalProperties: false,
        required: ["activeCurrency", "ndp", "testNdp"],
        properties: {
          activeCurrency: { type: "string", enum: ["NDP", "TEST_NDP"] },
          ndp: { $ref: "#/components/schemas/WalletBalance" },
          testNdp: { $ref: "#/components/schemas/WalletBalance" }
        }
      },
      WalletBalance: {
        type: "object",
        additionalProperties: false,
        required: ["available", "frozen"],
        properties: {
          available: { type: "integer" },
          frozen: { type: "integer" }
        }
      },
      NdpAmountPair: {
        type: "object",
        additionalProperties: false,
        required: ["ndp", "testNdp"],
        properties: {
          ndp: { type: "integer" },
          testNdp: { type: "integer" }
        }
      },
      BackofficeNdpSummary: {
        type: "object",
        additionalProperties: false,
        required: [
          "period",
          "todayNdpConsumption",
          "platformNetRevenue",
          "requestFeeRevenue",
          "userRewardCost",
          "pendingHold",
          "campaignDiscount",
          "settleableNdp"
        ],
        properties: {
          period: {
            type: "object",
            additionalProperties: false,
            required: ["date", "timeZone"],
            properties: {
              date: { type: "string", format: "date" },
              timeZone: { type: "string", enum: ["Asia/Tokyo"] }
            }
          },
          todayNdpConsumption: { $ref: "#/components/schemas/NdpAmountPair" },
          platformNetRevenue: { $ref: "#/components/schemas/NdpAmountPair" },
          requestFeeRevenue: { $ref: "#/components/schemas/NdpAmountPair" },
          userRewardCost: { $ref: "#/components/schemas/NdpAmountPair" },
          pendingHold: { $ref: "#/components/schemas/NdpAmountPair" },
          campaignDiscount: { $ref: "#/components/schemas/NdpAmountPair" },
          settleableNdp: { type: "integer" }
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
      PayrollScheduleRule: {
        type: "object",
        required: [
          "id",
          "version",
          "cadence",
          "weeklySettlementWeekday",
          "monthlySettlementDay",
          "holidayAdjustment",
          "timezone",
          "effectiveFrom",
          "effectiveTo"
        ],
        properties: {
          id: { type: "integer", minimum: 1 },
          version: { type: "integer", minimum: 1 },
          cadence: { type: "string", enum: ["daily", "weekly", "monthly"] },
          weeklySettlementWeekday: { type: ["integer", "null"], minimum: 1, maximum: 7 },
          monthlySettlementDay: { type: ["integer", "null"], minimum: 1, maximum: 31 },
          holidayAdjustment: {
            type: "string",
            enum: ["previous_business_day", "next_business_day"]
          },
          timezone: { type: "string", enum: ["Asia/Tokyo"] },
          effectiveFrom: { type: "string", format: "date" },
          effectiveTo: { type: ["string", "null"], format: "date" }
        }
      },
      PayrollSchedulePreview: {
        type: "object",
        required: [
          "periodStart",
          "periodEnd",
          "naturalSettlementDate",
          "plannedPaymentDate",
          "adjustmentReason"
        ],
        properties: {
          periodStart: { type: "string", format: "date" },
          periodEnd: { type: "string", format: "date" },
          naturalSettlementDate: { type: "string", format: "date" },
          plannedPaymentDate: { type: "string", format: "date" },
          adjustmentReason: {
            type: ["string", "null"],
            enum: ["weekend", "public_holiday", null]
          }
        }
      },
      PayrollSchedulePolicyResult: {
        type: "object",
        required: ["configured", "source", "effectivePolicy", "preview"],
        properties: {
          configured: { type: "boolean" },
          source: {
            type: "string",
            enum: ["shop", "employee_override", "shop_unconfigured"]
          },
          inheritShopPolicy: { type: "boolean" },
          shopPolicy: { type: ["object", "null"], additionalProperties: true },
          employeeOverride: { type: ["object", "null"], additionalProperties: true },
          effectivePolicy: {
            oneOf: [{ $ref: "#/components/schemas/PayrollScheduleRule" }, { type: "null" }]
          },
          preview: {
            oneOf: [{ $ref: "#/components/schemas/PayrollSchedulePreview" }, { type: "null" }]
          }
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
      EmployeeCompensationProfile: {
        type: "object",
        additionalProperties: false,
        required: [
          "sourceType",
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
          "bonusRules",
          "deductionRules",
          "effectiveFrom",
          "effectiveTo",
          "createdAt",
          "updatedAt"
        ],
        properties: {
          sourceType: { type: "string", enum: ["shop_default", "technician_override"] },
          name: { type: "string" },
          status: { type: "string", enum: ["active", "archived"] },
          version: { type: "integer", minimum: 0 },
          wageMode: {
            type: "string",
            enum: ["fixed_per_order", "commission", "base_plus_commission", "hourly"]
          },
          baseSalaryJpy: { type: "integer", minimum: 0 },
          hourlyRateJpy: { type: "integer", minimum: 0 },
          dailyRateJpy: { type: "integer", minimum: 0 },
          fixedOrderPayJpy: { type: "integer", minimum: 0 },
          commissionRatePercent: { type: "number", minimum: 0, maximum: 100 },
          guaranteedMinimumJpy: { type: "integer", minimum: 0 },
          ndpFeeBearer: { type: "string", enum: ["shop", "technician", "split"] },
          technicianNdpSharePercent: { type: "number", minimum: 0, maximum: 100 },
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
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      EmployeePayrollSummary: {
        type: "object",
        additionalProperties: false,
        required: [
          "payslipId",
          "periodStart",
          "periodEnd",
          "status",
          "disputeStatus",
          "completedOrderCount",
          "workedMinutes",
          "serviceIncomeJpy",
          "basePayJpy",
          "commissionJpy",
          "bonusJpy",
          "allowanceJpy",
          "deductionJpy",
          "platformFeeShareDeductionJpy",
          "netPayJpy",
          "paidAmountJpy",
          "unpaidAmountJpy",
          "payoutRecordCount"
        ],
        properties: {
          payslipId: { type: ["integer", "null"], minimum: 1 },
          periodStart: { type: ["string", "null"], format: "date-time" },
          periodEnd: { type: ["string", "null"], format: "date-time" },
          status: { type: ["string", "null"] },
          disputeStatus: { type: ["string", "null"] },
          completedOrderCount: { type: "integer", minimum: 0 },
          workedMinutes: { type: "integer", minimum: 0 },
          serviceIncomeJpy: { type: "integer", minimum: 0 },
          basePayJpy: { type: "integer" },
          commissionJpy: { type: "integer" },
          bonusJpy: { type: "integer" },
          allowanceJpy: { type: "integer" },
          deductionJpy: { type: "integer" },
          platformFeeShareDeductionJpy: { type: "integer" },
          netPayJpy: { type: "integer" },
          paidAmountJpy: { type: "integer", minimum: 0 },
          unpaidAmountJpy: { type: "integer", minimum: 0 },
          payoutRecordCount: { type: "integer", minimum: 0 }
        }
      },
      EmployeeCompensationResult: {
        type: "object",
        additionalProperties: false,
        required: ["employee", "profile", "payrollSummary"],
        properties: {
          employee: {
            type: "object",
            additionalProperties: false,
            required: ["needoId"],
            properties: { needoId: { type: "string", pattern: "^s\\d{10}$" } }
          },
          profile: { $ref: "#/components/schemas/EmployeeCompensationProfile" },
          payrollSummary: { $ref: "#/components/schemas/EmployeePayrollSummary" }
        }
      },
      EmployeeCompensationPreviewResult: {
        type: "object",
        additionalProperties: false,
        required: ["employee", "profile", "preview"],
        properties: {
          employee: {
            type: "object",
            additionalProperties: false,
            required: ["needoId"],
            properties: { needoId: { type: "string", pattern: "^s\\d{10}$" } }
          },
          profile: { $ref: "#/components/schemas/EmployeeCompensationProfile" },
          preview: { $ref: "#/components/schemas/CompensationPreview" }
        }
      },
      CompensationProfileInput: {
        type: "object",
        additionalProperties: false,
        required: ["name", "wageMode"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 160 },
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
            maxItems: 20,
            items: { $ref: "#/components/schemas/ShopFinanceAdjustmentRule" }
          },
          deductionRules: {
            type: "array",
            maxItems: 20,
            items: { $ref: "#/components/schemas/ShopFinanceAdjustmentRule" }
          },
          effectiveFrom: { type: ["string", "null"], format: "date-time" },
          effectiveTo: { type: ["string", "null"], format: "date-time" }
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
          "technicianNeedoId",
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
          technicianNeedoId: {
            type: "string",
            pattern: "^(u|s|b|o)\\d{10}$",
            description: "Public NeeDoID for the employee linked to this payslip"
          },
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
      AffiliateAlliancePermissions: {
        type: "object",
        additionalProperties: false,
        required: [
          "canClaimTasks",
          "canViewAllianceOverview",
          "canViewMemberDetails",
          "canManageOwnSubordinates",
          "canViewAllianceWallet"
        ],
        properties: {
          canClaimTasks: { type: "boolean" },
          canViewAllianceOverview: { type: "boolean" },
          canViewMemberDetails: { type: "boolean" },
          canManageOwnSubordinates: { type: "boolean" },
          canViewAllianceWallet: { type: "boolean" }
        }
      },
      AffiliateAllianceOwner: {
        type: "object",
        additionalProperties: false,
        required: ["needoId", "displayName", "avatarUrl"],
        properties: {
          needoId: { type: "string", pattern: "^(?:u|needo)[0-9]{10}$" },
          displayName: { type: "string", minLength: 1 },
          avatarUrl: { type: ["string", "null"], format: "uri" }
        }
      },
      AffiliateAllianceMembership: {
        type: "object",
        additionalProperties: false,
        required: ["memberId", "role", "managerNeedoId", "promoterShareBpsOverride", "permissions"],
        properties: {
          memberId: { type: "integer", minimum: 1 },
          role: { type: "string", enum: ["owner", "partner", "subordinate"] },
          managerNeedoId: {
            type: ["string", "null"],
            pattern: "^(?:u|needo)[0-9]{10}$"
          },
          promoterShareBpsOverride: {
            type: ["integer", "null"],
            minimum: 0,
            maximum: 10000
          },
          permissions: { $ref: "#/components/schemas/AffiliateAlliancePermissions" }
        }
      },
      AffiliateAllianceWallet: {
        type: "object",
        additionalProperties: false,
        required: ["currency", "availableBalance", "frozenBalance"],
        properties: {
          currency: { type: "string", enum: ["NDP"] },
          availableBalance: { type: "integer", minimum: 0 },
          frozenBalance: { type: "integer", minimum: 0 }
        }
      },
      AffiliateAlliance: {
        type: "object",
        additionalProperties: false,
        required: [
          "allianceId",
          "name",
          "description",
          "status",
          "version",
          "defaultPromoterShareBps",
          "owner",
          "membership",
          "wallet",
          "createdAt",
          "updatedAt"
        ],
        properties: {
          allianceId: { type: "integer", minimum: 1 },
          name: { type: "string", minLength: 2, maxLength: 120 },
          description: { type: ["string", "null"], minLength: 1, maxLength: 500 },
          status: { type: "string", enum: ["active", "suspended", "closed"] },
          version: { type: "integer", minimum: 1 },
          defaultPromoterShareBps: { type: "integer", minimum: 0, maximum: 10000 },
          owner: { $ref: "#/components/schemas/AffiliateAllianceOwner" },
          membership: { $ref: "#/components/schemas/AffiliateAllianceMembership" },
          wallet: {
            oneOf: [{ $ref: "#/components/schemas/AffiliateAllianceWallet" }, { type: "null" }]
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      AffiliateAllianceMine: {
        type: "object",
        additionalProperties: false,
        required: ["alliance"],
        properties: {
          alliance: {
            oneOf: [{ $ref: "#/components/schemas/AffiliateAlliance" }, { type: "null" }]
          }
        }
      },
      AffiliateAllianceCreated: {
        type: "object",
        additionalProperties: false,
        required: ["alliance"],
        properties: {
          alliance: { $ref: "#/components/schemas/AffiliateAlliance" }
        }
      },
      AffiliateAllianceCreate: {
        type: "object",
        additionalProperties: false,
        required: ["name", "defaultPromoterShareBps"],
        properties: {
          name: { type: "string", minLength: 2, maxLength: 120 },
          description: { type: ["string", "null"], minLength: 1, maxLength: 500 },
          defaultPromoterShareBps: { type: "integer", minimum: 0, maximum: 10000 }
        }
      },
      AffiliateAlliancePublicPerson: {
        type: "object",
        additionalProperties: false,
        required: ["needoId", "displayName", "avatarUrl"],
        properties: {
          needoId: { type: "string", pattern: "^u[0-9]{10}$" },
          displayName: { type: "string", minLength: 1 },
          avatarUrl: { type: ["string", "null"], format: "uri" }
        }
      },
      AffiliateAllianceMemberParent: {
        type: "object",
        additionalProperties: false,
        required: ["memberId", "person"],
        properties: {
          memberId: { type: "integer", minimum: 1 },
          person: { $ref: "#/components/schemas/AffiliateAlliancePublicPerson" }
        }
      },
      AffiliateAllianceMember: {
        type: "object",
        additionalProperties: false,
        required: [
          "memberId",
          "person",
          "role",
          "parent",
          "promoterShareBpsOverride",
          "permissions",
          "joinedAt"
        ],
        properties: {
          memberId: { type: "integer", minimum: 1 },
          person: { $ref: "#/components/schemas/AffiliateAlliancePublicPerson" },
          role: { type: "string", enum: ["owner", "partner", "subordinate"] },
          parent: {
            oneOf: [
              { $ref: "#/components/schemas/AffiliateAllianceMemberParent" },
              { type: "null" }
            ]
          },
          promoterShareBpsOverride: {
            type: ["integer", "null"],
            minimum: 0,
            maximum: 10000
          },
          permissions: { $ref: "#/components/schemas/AffiliateAlliancePermissions" },
          joinedAt: { type: "string", format: "date-time" }
        }
      },
      AffiliateAllianceInvitation: {
        type: "object",
        additionalProperties: false,
        required: [
          "invitationId",
          "alliance",
          "inviter",
          "invitee",
          "role",
          "proposedParent",
          "status",
          "expiresAt",
          "respondedAt",
          "createdAt"
        ],
        properties: {
          invitationId: { type: "integer", minimum: 1 },
          alliance: {
            type: "object",
            additionalProperties: false,
            required: ["allianceId", "name"],
            properties: {
              allianceId: { type: "integer", minimum: 1 },
              name: { type: "string", minLength: 2, maxLength: 120 }
            }
          },
          inviter: { $ref: "#/components/schemas/AffiliateAlliancePublicPerson" },
          invitee: { $ref: "#/components/schemas/AffiliateAlliancePublicPerson" },
          role: { type: "string", enum: ["partner", "subordinate"] },
          proposedParent: {
            oneOf: [
              { $ref: "#/components/schemas/AffiliateAllianceMemberParent" },
              { type: "null" }
            ]
          },
          status: {
            type: "string",
            enum: ["pending", "accepted", "rejected", "expired"]
          },
          expiresAt: { type: "string", format: "date-time" },
          respondedAt: { type: ["string", "null"], format: "date-time" },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      AffiliateAllianceMemberPage: {
        type: "object",
        additionalProperties: false,
        required: ["list", "total", "page", "page_size"],
        properties: {
          list: {
            type: "array",
            items: { $ref: "#/components/schemas/AffiliateAllianceMember" }
          },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          page_size: { type: "integer", minimum: 1, maximum: 100 }
        }
      },
      AffiliateAllianceCandidatePage: {
        type: "object",
        additionalProperties: false,
        required: ["list", "total", "page", "page_size"],
        properties: {
          list: {
            type: "array",
            items: { $ref: "#/components/schemas/AffiliateAlliancePublicPerson" }
          },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          page_size: { type: "integer", minimum: 1, maximum: 100 }
        }
      },
      AffiliateAllianceInvitationPage: {
        type: "object",
        additionalProperties: false,
        required: ["list", "total", "page", "page_size"],
        properties: {
          list: {
            type: "array",
            items: { $ref: "#/components/schemas/AffiliateAllianceInvitation" }
          },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          page_size: { type: "integer", minimum: 1, maximum: 100 }
        }
      },
      AffiliateAllianceInvitationCreate: {
        type: "object",
        additionalProperties: false,
        required: ["inviteeNeedoId", "role"],
        properties: {
          inviteeNeedoId: { type: "string", pattern: "^u[0-9]{10}$" },
          role: { type: "string", enum: ["partner", "subordinate"] },
          proposedParentMemberId: { type: ["integer", "null"], minimum: 1 }
        },
        allOf: [
          {
            if: { properties: { role: { const: "subordinate" } } },
            then: { required: ["proposedParentMemberId"] }
          },
          {
            if: { properties: { role: { const: "partner" } } },
            then: { properties: { proposedParentMemberId: { type: "null" } } }
          }
        ]
      },
      AffiliateAllianceInvitationCreated: {
        type: "object",
        additionalProperties: false,
        required: ["invitation"],
        properties: {
          invitation: { $ref: "#/components/schemas/AffiliateAllianceInvitation" }
        }
      },
      AffiliateAllianceInvitationAccepted: {
        type: "object",
        additionalProperties: false,
        required: ["invitation", "member"],
        properties: {
          invitation: { $ref: "#/components/schemas/AffiliateAllianceInvitation" },
          member: { $ref: "#/components/schemas/AffiliateAllianceMember" }
        }
      },
      StrictEmptyBody: {
        type: "object",
        additionalProperties: false,
        maxProperties: 0,
        properties: {}
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
          "commissionFrozenNdp",
          "platformFeeFrozenNdp",
          "allocatedNdp",
          "capturedNdp",
          "platformFeeCapturedNdp",
          "releasedNdp",
          "platformFeeReleasedNdp",
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
          commissionFrozenNdp: { type: "integer", minimum: 0 },
          platformFeeFrozenNdp: { type: "integer", minimum: 0 },
          allocatedNdp: { type: "integer", minimum: 0 },
          capturedNdp: { type: "integer", minimum: 0 },
          platformFeeCapturedNdp: { type: "integer", minimum: 0 },
          releasedNdp: { type: "integer", minimum: 0 },
          platformFeeReleasedNdp: { type: "integer", minimum: 0 },
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
          "translations",
          "name",
          "rewardNdpPerCompletedOrder",
          "totalBudgetNdp",
          "platformFeeBps",
          "platformFeeReserveNdp",
          "reservedBudgetNdp",
          "grossReservedBudgetNdp",
          "allocatedBudgetNdp",
          "settledBudgetNdp",
          "settledPlatformFeeNdp",
          "releasedBudgetNdp",
          "releasedPlatformFeeNdp",
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
          translations: { $ref: "#/components/schemas/AffiliateTaskTranslations" },
          name: affiliateEditableTaskProperties.name,
          description: affiliateEditableTaskProperties.description,
          coverMediaAssetId: affiliateEditableTaskProperties.coverMediaAssetId,
          rewardNdpPerCompletedOrder: affiliateEditableTaskProperties.rewardNdpPerCompletedOrder,
          totalBudgetNdp: affiliateEditableTaskProperties.totalBudgetNdp,
          platformFeeBps: { type: "integer", minimum: 0, maximum: 10000 },
          platformFeeReserveNdp: { type: "integer", minimum: 0 },
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
          grossReservedBudgetNdp: { type: "integer", minimum: 0 },
          allocatedBudgetNdp: { type: "integer", minimum: 0 },
          settledBudgetNdp: { type: "integer", minimum: 0 },
          settledPlatformFeeNdp: { type: "integer", minimum: 0 },
          releasedBudgetNdp: { type: "integer", minimum: 0 },
          releasedPlatformFeeNdp: { type: "integer", minimum: 0 },
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
              sourceLocale: { type: "string", enum: affiliateContentLocales },
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
              sourceLocale: { type: "string", enum: affiliateContentLocales },
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
      AffiliateTaskTranslation: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description", "sourceLocale", "isInitialCopy"],
        properties: {
          name: affiliateEditableTaskProperties.name,
          description: affiliateEditableTaskProperties.description,
          sourceLocale: { type: "string", enum: affiliateContentLocales },
          isInitialCopy: { type: "boolean" }
        }
      },
      AffiliateTaskTranslations: {
        type: "object",
        additionalProperties: false,
        minProperties: 1,
        properties: Object.fromEntries(
          affiliateContentLocales.map((locale) => [
            locale,
            { $ref: "#/components/schemas/AffiliateTaskTranslation" }
          ])
        )
      },
      AffiliateTaskTranslationUpdate: {
        type: "object",
        additionalProperties: false,
        required: ["lockVersion", "name", "description"],
        properties: {
          lockVersion: { type: "integer", minimum: 1 },
          name: affiliateEditableTaskProperties.name,
          description: affiliateEditableTaskProperties.description,
          syncToAll: { type: "boolean", default: false }
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
      AffiliatePlatformFeeRule: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "scopeType",
          "scopeKey",
          "shopId",
          "shopName",
          "shopCity",
          "feeBps",
          "version",
          "effectiveFrom",
          "effectiveTo",
          "activeKey",
          "reason",
          "createdByNeedoId",
          "updatedByNeedoId",
          "createdAt",
          "updatedAt"
        ],
        properties: {
          id: { type: "integer", minimum: 1 },
          scopeType: { type: "string", enum: ["global", "shop"] },
          scopeKey: { type: "string", pattern: "^(?:global|shop:[1-9][0-9]*)$" },
          shopId: { type: ["integer", "null"], minimum: 1 },
          shopName: { type: ["string", "null"] },
          shopCity: { type: ["string", "null"] },
          feeBps: { type: "integer", minimum: 0, maximum: 10000 },
          version: { type: "integer", minimum: 1 },
          effectiveFrom: { type: "string", format: "date-time" },
          effectiveTo: { type: ["string", "null"], format: "date-time" },
          activeKey: { type: ["string", "null"], maxLength: 191 },
          reason: { type: "string", minLength: 1, maxLength: 500 },
          createdByNeedoId: {
            type: ["string", "null"],
            pattern: "^(?:u|needo)[0-9]{10}$"
          },
          updatedByNeedoId: {
            type: ["string", "null"],
            pattern: "^(?:u|needo)[0-9]{10}$"
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      AffiliatePlatformFeeRulePage: {
        type: "object",
        additionalProperties: false,
        required: ["list", "total", "page", "page_size"],
        properties: {
          list: {
            type: "array",
            items: { $ref: "#/components/schemas/AffiliatePlatformFeeRule" }
          },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          page_size: { type: "integer", minimum: 1, maximum: 100 }
        }
      },
      AffiliatePlatformFeeRuleCreate: {
        type: "object",
        additionalProperties: false,
        required: ["scopeType", "shopId", "feeBps", "expectedVersion", "effectiveFrom", "reason"],
        properties: {
          scopeType: { type: "string", enum: ["global", "shop"] },
          shopId: { type: ["integer", "null"], minimum: 1 },
          feeBps: { type: "integer", minimum: 0, maximum: 10000 },
          expectedVersion: { type: "integer", minimum: 0 },
          effectiveFrom: { type: "string", format: "date-time" },
          reason: { type: "string", minLength: 1, maxLength: 500 }
        },
        description:
          "Global scope requires shopId=null; shop scope requires a positive shopId. expectedVersion provides optimistic concurrency."
      },
      AffiliatePlatformFeeRuleSummary: {
        type: "object",
        additionalProperties: false,
        required: ["evaluatedAt", "current", "nextScheduled", "latestVersion"],
        properties: {
          evaluatedAt: { type: "string", format: "date-time" },
          current: {
            oneOf: [{ $ref: "#/components/schemas/AffiliatePlatformFeeRule" }, { type: "null" }]
          },
          nextScheduled: {
            oneOf: [{ $ref: "#/components/schemas/AffiliatePlatformFeeRule" }, { type: "null" }]
          },
          latestVersion: { type: "integer", minimum: 0 }
        }
      },
      AffiliatePlatformFeeShopOption: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "city"],
        properties: {
          id: { type: "integer", minimum: 1 },
          name: { type: "string", minLength: 1 },
          city: { type: "string" }
        }
      },
      AffiliatePlatformFeeShopOptionPage: {
        type: "object",
        additionalProperties: false,
        required: ["list", "total", "page", "page_size"],
        properties: {
          list: {
            type: "array",
            items: { $ref: "#/components/schemas/AffiliatePlatformFeeShopOption" }
          },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          page_size: { type: "integer", minimum: 1, maximum: 100 }
        }
      },
      AffiliateMarketplaceMediaAsset: {
        type: "object",
        additionalProperties: false,
        required: ["url", "altText", "sortOrder"],
        properties: {
          url: { type: "string", minLength: 1 },
          altText: { type: ["string", "null"], maxLength: 200 },
          sortOrder: { type: "integer", minimum: 0 }
        }
      },
      AffiliateMarketplaceShop: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "shopId",
          "shopNameSnapshot",
          "publicId",
          "city",
          "address",
          "mediaAssets"
        ],
        properties: {
          id: { type: "integer", minimum: 1 },
          shopId: { type: "integer", minimum: 1 },
          shopNameSnapshot: { type: "string", maxLength: 160 },
          publicId: { type: ["string", "null"], pattern: "^shop[0-9]{10}$" },
          city: { type: "string", maxLength: 120 },
          address: { type: "string", maxLength: 500 },
          mediaAssets: {
            type: "array",
            items: { $ref: "#/components/schemas/AffiliateMarketplaceMediaAsset" }
          }
        }
      },
      AffiliateMarketplaceTask: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "taskCode",
          "translations",
          "name",
          "description",
          "coverMediaAssetId",
          "coverImageUrl",
          "rewardNdpPerCompletedOrder",
          "totalBudgetNdp",
          "remainingBudgetNdp",
          "remainingBudgetBps",
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
          translations: { $ref: "#/components/schemas/AffiliateTaskTranslations" },
          name: affiliateEditableTaskProperties.name,
          description: affiliateEditableTaskProperties.description,
          coverMediaAssetId: affiliateEditableTaskProperties.coverMediaAssetId,
          coverImageUrl: { type: ["string", "null"] },
          rewardNdpPerCompletedOrder: affiliateEditableTaskProperties.rewardNdpPerCompletedOrder,
          totalBudgetNdp: affiliateEditableTaskProperties.totalBudgetNdp,
          remainingBudgetNdp: { type: "integer", minimum: 0 },
          remainingBudgetBps: { type: "integer", minimum: 0, maximum: 10000 },
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
            items: { $ref: "#/components/schemas/AffiliateMarketplaceShop" }
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
      MerchantEmployeeProfile: {
        type: "object",
        additionalProperties: false,
        required: ["bio", "city", "serviceArea", "yearsExperience", "updatedAt"],
        properties: {
          bio: { type: ["string", "null"], maxLength: 5000 },
          city: { type: "string", minLength: 1, maxLength: 100 },
          serviceArea: { type: ["string", "null"], maxLength: 255 },
          yearsExperience: { type: "integer", minimum: 0, maximum: 80 },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      MerchantEmployeeAccount: {
        type: "object",
        additionalProperties: false,
        required: ["isActive", "lastLoginAt"],
        properties: {
          isActive: { type: "boolean" },
          lastLoginAt: { type: ["string", "null"], format: "date-time" }
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
          "profile",
          "account",
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
          profile: { $ref: "#/components/schemas/MerchantEmployeeProfile" },
          account: { $ref: "#/components/schemas/MerchantEmployeeAccount" },
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
      MerchantEmployeeTimelineEvent: {
        type: "object",
        additionalProperties: false,
        required: ["id", "at", "actorName", "actorAvatarUrl", "actorRole", "message", "tone"],
        properties: {
          id: { type: "string", pattern: "^audit-[0-9]+$" },
          at: { type: "string", format: "date-time" },
          actorName: { type: "string" },
          actorAvatarUrl: { type: ["string", "null"], format: "uri-reference" },
          actorRole: { type: "string" },
          message: { type: "string" },
          tone: { type: "string", enum: ["accent", "green", "red", "neutral"] }
        }
      },
      MerchantEmployeeTimelinePage: {
        type: "object",
        additionalProperties: false,
        required: ["list", "total", "page", "page_size"],
        properties: {
          list: {
            type: "array",
            items: { $ref: "#/components/schemas/MerchantEmployeeTimelineEvent" }
          },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          page_size: { type: "integer", minimum: 1, maximum: 100 }
        }
      },
      MerchantEmployeeTimelineCommentInput: {
        type: "object",
        additionalProperties: false,
        required: ["message"],
        properties: {
          message: { type: "string", minLength: 1, maxLength: 1000 }
        }
      },
      MerchantEmployeeScheduleVisibleEvent: {
        type: "object",
        additionalProperties: false,
        required: [
          "projectionId",
          "kind",
          "visibility",
          "status",
          "startsAt",
          "endsAt",
          "title",
          "isClickable",
          "isEditable"
        ],
        properties: {
          projectionId: { type: "string" },
          kind: { type: "string", enum: ["availability", "schedule", "booking"] },
          visibility: { type: "string", enum: ["current_shop", "affiliated_shops"] },
          status: {
            type: "string",
            enum: [
              "available",
              "scheduled",
              "pending",
              "confirmed",
              "in_service",
              "completed",
              "blocked"
            ]
          },
          startsAt: { type: "string", format: "date-time" },
          endsAt: { type: "string", format: "date-time" },
          title: { type: "string" },
          detail: { type: "string" },
          orderId: { type: "integer", minimum: 1 },
          isClickable: { type: "boolean" },
          isEditable: { type: "boolean" }
        }
      },
      MerchantEmployeeScheduleRedactedEvent: {
        type: "object",
        additionalProperties: false,
        description:
          "Privacy projection for another affiliated shop's confirmed or in-service booking. No source shop, participant, service, order, price, address, note, or source event identifier is returned.",
        required: [
          "projectionId",
          "kind",
          "visibility",
          "status",
          "startsAt",
          "endsAt",
          "title",
          "isClickable",
          "isEditable"
        ],
        properties: {
          projectionId: { type: "string" },
          kind: { type: "string", enum: ["busy_redacted"] },
          visibility: { type: "string", enum: ["busy_redacted"] },
          status: { type: "string", enum: ["busy"] },
          startsAt: { type: "string", format: "date-time" },
          endsAt: { type: "string", format: "date-time" },
          title: { type: "string", enum: ["其他店铺已有确认安排"] },
          isClickable: { type: "boolean", enum: [false] },
          isEditable: { type: "boolean", enum: [false] }
        }
      },
      MerchantEmployeeScheduleProjection: {
        type: "object",
        additionalProperties: false,
        required: ["employee", "range", "events"],
        properties: {
          employee: {
            type: "object",
            additionalProperties: false,
            required: ["needoId", "displayName", "avatarUrl", "relationshipType", "workStatus"],
            properties: {
              needoId: { type: "string", pattern: "^s[0-9]{10}$" },
              displayName: { type: "string" },
              avatarUrl: { type: ["string", "null"], format: "uri-reference" },
              relationshipType: { type: "string", enum: ["exclusive", "partner"] },
              workStatus: {
                type: "string",
                enum: ["active", "on_leave", "suspended", "ended"]
              }
            }
          },
          range: {
            type: "object",
            additionalProperties: false,
            required: ["from", "to", "view"],
            properties: {
              from: { type: "string", format: "date-time" },
              to: { type: "string", format: "date-time" },
              view: { type: "string", enum: ["day", "week", "month"] }
            }
          },
          events: {
            type: "array",
            items: {
              oneOf: [
                { $ref: "#/components/schemas/MerchantEmployeeScheduleVisibleEvent" },
                { $ref: "#/components/schemas/MerchantEmployeeScheduleRedactedEvent" }
              ]
            }
          }
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
      MerchantEmployeeProfileInput: {
        type: "object",
        additionalProperties: false,
        minProperties: 1,
        properties: {
          displayName: { type: "string", minLength: 1, maxLength: 120 },
          bio: { type: ["string", "null"], maxLength: 5000 },
          city: { type: "string", minLength: 1, maxLength: 100 },
          serviceArea: { type: ["string", "null"], maxLength: 255 },
          yearsExperience: { type: "integer", minimum: 0, maximum: 80 }
        }
      },
      GlobalBookingPlatformFee: {
        type: "object",
        additionalProperties: false,
        required: ["amountNdp", "version", "effectiveFrom", "source"],
        properties: {
          amountNdp: { type: "integer", minimum: 0 },
          version: { type: "integer", minimum: 0 },
          effectiveFrom: { type: ["string", "null"], format: "date-time" },
          source: { type: "string", enum: ["persisted", "default"] }
        }
      },
      ShopPlatformFeePolicy: {
        type: "object",
        additionalProperties: false,
        required: [
          "shopId",
          "shopPublicId",
          "shopName",
          "globalAmountNdp",
          "globalVersion",
          "feeEnabled",
          "payerType",
          "policyVersion",
          "policySource",
          "updatedAt"
        ],
        properties: {
          shopId: {
            type: "integer",
            minimum: 1,
            description: "Internal numeric shop key; this is not a NeeDo ID"
          },
          shopPublicId: {
            type: ["string", "null"],
            pattern: "^shop[0-9]{10}$",
            description: "Public shop NeeDo ID"
          },
          shopName: { type: "string" },
          globalAmountNdp: { type: "integer", minimum: 0 },
          globalVersion: { type: "integer", minimum: 0 },
          feeEnabled: { type: "boolean" },
          payerType: { type: "string", enum: ["shop", "technician"] },
          policyVersion: { type: "integer", minimum: 0 },
          policySource: { type: "string", enum: ["persisted", "default"] },
          updatedAt: { type: ["string", "null"], format: "date-time" }
        }
      },
      ShopPlatformFeePolicyPage: {
        type: "object",
        additionalProperties: false,
        required: ["list", "total", "page", "page_size"],
        properties: {
          list: {
            type: "array",
            items: { $ref: "#/components/schemas/ShopPlatformFeePolicy" }
          },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          page_size: { type: "integer", minimum: 1, maximum: 100 }
        }
      },
      GlobalPlatformFeeUpdateRequest: {
        type: "object",
        additionalProperties: false,
        required: ["amountNdp", "expectedVersion"],
        properties: {
          amountNdp: { type: "integer", minimum: 0, maximum: 10000000 },
          expectedVersion: { type: "integer", minimum: 1 }
        }
      },
      ShopFeeEnabledUpdateRequest: {
        type: "object",
        additionalProperties: false,
        required: ["feeEnabled", "expectedVersion"],
        properties: {
          feeEnabled: { type: "boolean" },
          expectedVersion: { type: "integer", minimum: 0 }
        }
      },
      ShopFeePayerUpdateRequest: {
        type: "object",
        additionalProperties: false,
        required: ["payerType", "expectedVersion"],
        properties: {
          payerType: { type: "string", enum: ["shop", "technician"] },
          expectedVersion: { type: "integer", minimum: 0 }
        }
      },
      CarouselTranslationInput: {
        type: "object",
        additionalProperties: false,
        required: [
          "locale",
          "mediaAssetPublicId",
          "badge",
          "title",
          "caption",
          "ctaLabel",
          "imageAltText"
        ],
        properties: {
          locale: { type: "string", enum: ["zh-CN", "zh-TW", "en", "ja", "ko"] },
          mediaAssetPublicId: {
            type: "string",
            nullable: true,
            pattern: "^[a-f0-9]{64}$"
          },
          badge: { type: ["string", "null"], maxLength: 40 },
          title: { type: "string", minLength: 1, maxLength: 160 },
          caption: { type: ["string", "null"], maxLength: 500 },
          ctaLabel: { type: ["string", "null"], maxLength: 60 },
          imageAltText: { type: "string", minLength: 1, maxLength: 255 }
        }
      },
      CarouselReplacementTranslationInput: {
        type: "object",
        additionalProperties: false,
        required: [
          "locale",
          "mediaAssetPublicId",
          "badge",
          "title",
          "caption",
          "ctaLabel",
          "imageAltText",
          "sourceLocale",
          "isInitialCopy"
        ],
        properties: {
          locale: { type: "string", enum: ["zh-CN", "zh-TW", "en", "ja", "ko"] },
          mediaAssetPublicId: {
            type: "string",
            nullable: true,
            pattern: "^[a-f0-9]{64}$"
          },
          badge: { type: ["string", "null"], maxLength: 40 },
          title: { type: "string", minLength: 1, maxLength: 160 },
          caption: { type: ["string", "null"], maxLength: 500 },
          ctaLabel: { type: ["string", "null"], maxLength: 60 },
          imageAltText: { type: "string", minLength: 1, maxLength: 255 },
          sourceLocale: { type: "string", enum: ["zh-CN", "zh-TW", "en", "ja", "ko"] },
          isInitialCopy: { type: "boolean" }
        }
      },
      CarouselProtectedTarget: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["type"],
            properties: { type: { const: "none" } }
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "shopId"],
            properties: { type: { const: "shop" }, shopId: { type: "integer", minimum: 1 } }
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "technicianProfileId"],
            properties: {
              type: { const: "technician" },
              technicianProfileId: { type: "integer", minimum: 1 }
            }
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "serviceId"],
            properties: { type: { const: "service" }, serviceId: { type: "integer", minimum: 1 } }
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "announcementPublicId", "affiliateTaskId"],
            properties: {
              type: { const: "affiliate_announcement" },
              announcementPublicId: { type: "string", format: "uuid" },
              affiliateTaskId: { type: ["integer", "null"], minimum: 1 }
            }
          }
        ]
      },
      CarouselUserHomeTargetInput: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["type"],
            properties: { type: { const: "none" } }
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "shopId"],
            properties: { type: { const: "shop" }, shopId: { type: "integer", minimum: 1 } }
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "publicId"],
            properties: {
              type: { const: "shop" },
              publicId: { type: "string", pattern: "^shop[0-9]{10}$" }
            }
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "technicianProfileId"],
            properties: {
              type: { const: "technician" },
              technicianProfileId: { type: "integer", minimum: 1 }
            }
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "publicId"],
            properties: {
              type: { const: "technician" },
              publicId: { type: "string", pattern: "^s[0-9]{10}$" }
            }
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "serviceId"],
            properties: { type: { const: "service" }, serviceId: { type: "integer", minimum: 1 } }
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "publicId"],
            properties: { type: { const: "service" }, publicId: { type: "string", format: "uuid" } }
          }
        ]
      },
      CarouselAffiliateNoticeTargetInput: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "announcementPublicId", "affiliateTaskId"],
            properties: {
              type: { const: "affiliate_announcement" },
              announcementPublicId: { type: "string", format: "uuid" },
              affiliateTaskId: { type: ["integer", "null"], minimum: 1 }
            }
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "announcementPublicId", "taskCode"],
            properties: {
              type: { const: "affiliate_announcement" },
              announcementPublicId: { type: "string", format: "uuid" },
              taskCode: { type: ["string", "null"], minLength: 1, maxLength: 80 }
            }
          }
        ]
      },
      CarouselFiveTranslations: {
        type: "array",
        minItems: 5,
        maxItems: 5,
        items: { $ref: "#/components/schemas/CarouselReplacementTranslationInput" },
        allOf: ["zh-CN", "zh-TW", "en", "ja", "ko"].map((locale) => ({
          contains: {
            type: "object",
            required: ["locale"],
            properties: { locale: { const: locale } }
          },
          minContains: 1,
          maxContains: 1
        }))
      },
      CarouselUserHomeCreateSlideInput: carouselSlideInputSchema(
        "CarouselUserHomeTargetInput",
        false
      ),
      CarouselUserHomeReplaceSlideInput: carouselSlideInputSchema(
        "CarouselUserHomeTargetInput",
        true
      ),
      CarouselAffiliateNoticeCreateSlideInput: carouselSlideInputSchema(
        "CarouselAffiliateNoticeTargetInput",
        false
      ),
      CarouselAffiliateNoticeReplaceSlideInput: carouselSlideInputSchema(
        "CarouselAffiliateNoticeTargetInput",
        true
      ),
      CarouselUserHomeDraftCreate: carouselDraftInputSchema(
        "CarouselUserHomeCreateSlideInput",
        true
      ),
      CarouselUserHomeDraftReplace: carouselDraftInputSchema(
        "CarouselUserHomeReplaceSlideInput",
        false
      ),
      CarouselAffiliateNoticeDraftCreate: carouselDraftInputSchema(
        "CarouselAffiliateNoticeCreateSlideInput",
        true
      ),
      CarouselAffiliateNoticeDraftReplace: carouselDraftInputSchema(
        "CarouselAffiliateNoticeReplaceSlideInput",
        false
      ),
      CarouselLocaleUpdate: {
        type: "object",
        additionalProperties: false,
        required: [
          "expectedLockVersion",
          "mediaAssetPublicId",
          "badge",
          "title",
          "caption",
          "ctaLabel",
          "imageAltText"
        ],
        properties: {
          expectedLockVersion: { type: "integer", minimum: 1 },
          mediaAssetPublicId: {
            type: "string",
            nullable: true,
            pattern: "^[a-f0-9]{64}$"
          },
          badge: { type: ["string", "null"], maxLength: 40 },
          title: { type: "string", minLength: 1, maxLength: 160 },
          caption: { type: ["string", "null"], maxLength: 500 },
          ctaLabel: { type: ["string", "null"], maxLength: 60 },
          imageAltText: { type: "string", minLength: 1, maxLength: 255 }
        }
      },
      CarouselLocaleCopyCommand: {
        type: "object",
        additionalProperties: false,
        required: ["operation", "expectedLockVersion", "sourceLocale"],
        properties: {
          operation: { const: "copy_to_all" },
          expectedLockVersion: { type: "integer", minimum: 1 },
          sourceLocale: { type: "string", enum: ["zh-CN", "zh-TW", "en", "ja", "ko"] }
        }
      },
      CarouselLocaleMutation: {
        oneOf: [
          { $ref: "#/components/schemas/CarouselLocaleUpdate" },
          { $ref: "#/components/schemas/CarouselLocaleCopyCommand" }
        ]
      },
      CarouselCopyAll: {
        type: "object",
        additionalProperties: false,
        required: ["expectedLockVersion", "sourceLocale"],
        properties: {
          expectedLockVersion: { type: "integer", minimum: 1 },
          sourceLocale: { type: "string", enum: ["zh-CN", "zh-TW", "en", "ja", "ko"] }
        }
      },
      CarouselTranslation: {
        type: "object",
        additionalProperties: false,
        required: [
          "mediaAssetPublicId",
          "imageUrl",
          "badge",
          "title",
          "caption",
          "ctaLabel",
          "imageAltText",
          "sourceLocale",
          "isInitialCopy"
        ],
        properties: {
          mediaAssetPublicId: {
            type: "string",
            nullable: true,
            pattern: "^[a-f0-9]{64}$"
          },
          imageUrl: { type: "string", format: "uri-reference" },
          badge: { type: ["string", "null"], maxLength: 40 },
          title: { type: "string", minLength: 1, maxLength: 160 },
          caption: { type: ["string", "null"], maxLength: 500 },
          ctaLabel: { type: ["string", "null"], maxLength: 60 },
          imageAltText: { type: "string", minLength: 1, maxLength: 255 },
          sourceLocale: { type: "string", enum: ["zh-CN", "zh-TW", "en", "ja", "ko"] },
          isInitialCopy: { type: "boolean" }
        }
      },
      CarouselProtectedSlide: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "defaultMediaAssetPublicId",
          "defaultImageUrl",
          "sortOrder",
          "isEnabled",
          "visibleFrom",
          "visibleUntil",
          "target",
          "translations"
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          defaultMediaAssetPublicId: { type: "string", pattern: "^[a-f0-9]{64}$" },
          defaultImageUrl: { type: "string", format: "uri-reference" },
          sortOrder: { type: "integer", minimum: 0 },
          isEnabled: { type: "boolean" },
          visibleFrom: { type: ["string", "null"], format: "date-time" },
          visibleUntil: { type: ["string", "null"], format: "date-time" },
          target: { $ref: "#/components/schemas/CarouselProtectedTarget" },
          translations: {
            type: "object",
            additionalProperties: false,
            required: ["zh-CN", "zh-TW", "en", "ja", "ko"],
            properties: Object.fromEntries(
              ["zh-CN", "zh-TW", "en", "ja", "ko"].map((locale) => [
                locale,
                { $ref: "#/components/schemas/CarouselTranslation" }
              ])
            )
          }
        }
      },
      CarouselProtectedPayload: {
        type: "object",
        additionalProperties: false,
        required: [
          "scene",
          "releaseId",
          "version",
          "status",
          "lockVersion",
          "publishAt",
          "activatedAt",
          "disabledAt",
          "archivedAt",
          "sourceReleaseId",
          "slides",
          "createdAt",
          "updatedAt"
        ],
        properties: {
          scene: { type: "string", enum: ["USER_HOME", "AFFILIATE_HOME_NOTICE"] },
          releaseId: { type: "integer", minimum: 1 },
          version: { type: "integer", minimum: 1 },
          status: {
            type: "string",
            enum: ["draft", "scheduled", "published", "disabled", "archived"]
          },
          lockVersion: { type: "integer", minimum: 1 },
          publishAt: { type: ["string", "null"], format: "date-time" },
          activatedAt: { type: ["string", "null"], format: "date-time" },
          disabledAt: { type: ["string", "null"], format: "date-time" },
          archivedAt: { type: ["string", "null"], format: "date-time" },
          sourceReleaseId: { type: ["integer", "null"], minimum: 1 },
          slides: {
            type: "array",
            items: { $ref: "#/components/schemas/CarouselProtectedSlide" }
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      CarouselProtectedPage: {
        type: "object",
        additionalProperties: false,
        required: ["list", "total", "page", "page_size"],
        properties: {
          list: { type: "array", items: { $ref: "#/components/schemas/CarouselProtectedPayload" } },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          page_size: { type: "integer", minimum: 1, maximum: 100 }
        }
      },
      CarouselSceneState: {
        type: "object",
        additionalProperties: false,
        required: ["scene", "draft", "published", "scheduled"],
        properties: {
          scene: { type: "string", enum: ["USER_HOME", "AFFILIATE_HOME_NOTICE"] },
          draft: {
            anyOf: [{ $ref: "#/components/schemas/CarouselProtectedPayload" }, { type: "null" }]
          },
          published: {
            anyOf: [{ $ref: "#/components/schemas/CarouselProtectedPayload" }, { type: "null" }]
          },
          scheduled: {
            anyOf: [{ $ref: "#/components/schemas/CarouselProtectedPayload" }, { type: "null" }]
          }
        }
      },
      CarouselPickerTarget: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "publicId"],
            properties: {
              type: { type: "string", enum: ["shop", "technician", "service"] },
              publicId: { type: "string" }
            }
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "announcementPublicId", "taskCode"],
            properties: {
              type: { const: "affiliate_announcement" },
              announcementPublicId: { type: "string", format: "uuid" },
              taskCode: { type: ["string", "null"], maxLength: 80 }
            }
          }
        ]
      },
      CarouselTargetSearchItem: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "publicId", "label", "status", "target"],
            properties: {
              type: {
                type: "string",
                enum: ["shop", "technician", "service", "affiliate_announcement"]
              },
              publicId: { type: "string" },
              label: { type: "string" },
              status: { type: "string" },
              target: { $ref: "#/components/schemas/CarouselPickerTarget" }
            }
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "taskCode", "label", "status"],
            properties: {
              type: { const: "affiliate_task" },
              taskCode: { type: "string" },
              label: { type: "string" },
              status: { type: "string" }
            }
          }
        ]
      },
      CarouselTargetSearchPage: {
        type: "object",
        additionalProperties: false,
        required: ["list", "total", "page", "page_size"],
        properties: {
          list: { type: "array", items: { $ref: "#/components/schemas/CarouselTargetSearchItem" } },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          page_size: { type: "integer", minimum: 1, maximum: 100 }
        }
      },
      PublishedCarouselTarget: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["type"],
            properties: { type: { const: "none" } }
          },
          ...["shop", "technician", "service", "affiliate_announcement"].map((type) => ({
            type: "object",
            additionalProperties: false,
            required: ["type", "publicId"],
            properties: {
              type: { const: type },
              publicId: { type: "string" }
            }
          }))
        ]
      },
      PublishedCarouselPayload: {
        type: "object",
        additionalProperties: false,
        required: ["scene", "locale", "releaseVersion", "generatedAt", "slides"],
        properties: {
          scene: { type: "string", enum: ["USER_HOME", "AFFILIATE_HOME_NOTICE"] },
          locale: { type: "string", enum: ["zh-CN", "zh-TW", "en", "ja", "ko"] },
          releaseVersion: { type: ["integer", "null"], minimum: 1 },
          generatedAt: { type: "string", format: "date-time" },
          slides: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "id",
                "badge",
                "title",
                "caption",
                "ctaLabel",
                "imageAltText",
                "imageUrl",
                "target"
              ],
              properties: {
                id: { type: "string", format: "uuid" },
                badge: { type: ["string", "null"] },
                title: { type: "string" },
                caption: { type: ["string", "null"] },
                ctaLabel: { type: ["string", "null"] },
                imageAltText: { type: "string" },
                imageUrl: { type: "string", format: "uri-reference" },
                target: { $ref: "#/components/schemas/PublishedCarouselTarget" }
              }
            }
          }
        }
      },
      OfficialAnnouncementTranslationInput: {
        type: "object",
        additionalProperties: false,
        required: ["title", "summary", "body"],
        properties: {
          title: { type: "string", minLength: 1, maxLength: 160 },
          summary: { type: ["string", "null"], maxLength: 500 },
          body: { type: "string", minLength: 1, maxLength: 50000 }
        }
      },
      OfficialAnnouncementDraftCreate: {
        type: "object",
        additionalProperties: false,
        required: ["idempotencyKey", "sourceLocale", "translation"],
        properties: {
          idempotencyKey: { type: "string", format: "uuid" },
          sourceLocale: { type: "string", enum: ["zh-CN", "zh-TW", "en", "ja", "ko"] },
          affiliateTaskId: { type: ["integer", "null"], minimum: 1, default: null },
          visibleFrom: { type: ["string", "null"], format: "date-time", default: null },
          visibleUntil: { type: ["string", "null"], format: "date-time", default: null },
          translation: { $ref: "#/components/schemas/OfficialAnnouncementTranslationInput" }
        }
      },
      OfficialAnnouncementLocaleUpdate: {
        type: "object",
        additionalProperties: false,
        required: ["expectedLockVersion", "locale", "title", "summary", "body"],
        properties: {
          expectedLockVersion: { type: "integer", minimum: 1 },
          locale: { type: "string", enum: ["zh-CN", "zh-TW", "en", "ja", "ko"] },
          title: { type: "string", minLength: 1, maxLength: 160 },
          summary: { type: ["string", "null"], maxLength: 500 },
          body: { type: "string", minLength: 1, maxLength: 50000 }
        }
      },
      OfficialAnnouncementCopyAll: {
        type: "object",
        additionalProperties: false,
        required: ["operation", "expectedLockVersion", "sourceLocale"],
        properties: {
          operation: { type: "string", enum: ["copy_to_all"] },
          expectedLockVersion: { type: "integer", minimum: 1 },
          sourceLocale: { type: "string", enum: ["zh-CN", "zh-TW", "en", "ja", "ko"] }
        }
      },
      OfficialAnnouncementMetadataUpdate: {
        type: "object",
        additionalProperties: false,
        required: [
          "operation",
          "expectedLockVersion",
          "affiliateTaskId",
          "visibleFrom",
          "visibleUntil"
        ],
        properties: {
          operation: { type: "string", enum: ["update_metadata"] },
          expectedLockVersion: { type: "integer", minimum: 1 },
          affiliateTaskId: { type: ["integer", "null"], minimum: 1 },
          visibleFrom: { type: ["string", "null"], format: "date-time" },
          visibleUntil: { type: ["string", "null"], format: "date-time" }
        }
      },
      OfficialAnnouncementDraftMutation: {
        oneOf: [
          { $ref: "#/components/schemas/OfficialAnnouncementLocaleUpdate" },
          { $ref: "#/components/schemas/OfficialAnnouncementCopyAll" },
          { $ref: "#/components/schemas/OfficialAnnouncementMetadataUpdate" }
        ]
      },
      OfficialAnnouncementProtectedTranslation: {
        type: "object",
        additionalProperties: false,
        required: ["title", "summary", "body", "sourceLocale", "isInitialCopy"],
        properties: {
          title: { type: "string", minLength: 1, maxLength: 160 },
          summary: { type: ["string", "null"], maxLength: 500 },
          body: { type: "string", minLength: 1, maxLength: 50000 },
          sourceLocale: { type: "string", enum: ["zh-CN", "zh-TW", "en", "ja", "ko"] },
          isInitialCopy: { type: "boolean" }
        }
      },
      ContentPublishCommand: {
        type: "object",
        additionalProperties: false,
        required: ["idempotencyKey", "expectedLockVersion"],
        properties: {
          idempotencyKey: { type: "string", format: "uuid" },
          expectedLockVersion: { type: "integer", minimum: 1 },
          reason: { type: "string", minLength: 1, maxLength: 500 }
        }
      },
      ContentScheduleCommand: {
        type: "object",
        additionalProperties: false,
        required: ["idempotencyKey", "expectedLockVersion", "publishAt"],
        properties: {
          idempotencyKey: { type: "string", format: "uuid" },
          expectedLockVersion: { type: "integer", minimum: 1 },
          publishAt: {
            type: "string",
            format: "date-time",
            description: "Future UTC instant ending in Z"
          },
          reason: { type: "string", minLength: 1, maxLength: 500 }
        }
      },
      ContentDisableCommand: {
        type: "object",
        additionalProperties: false,
        required: ["idempotencyKey", "expectedLockVersion", "reason"],
        properties: {
          idempotencyKey: { type: "string", format: "uuid" },
          expectedLockVersion: { type: "integer", minimum: 1 },
          reason: { type: "string", minLength: 1, maxLength: 500 }
        }
      },
      ContentRollbackCommand: {
        type: "object",
        additionalProperties: false,
        required: ["idempotencyKey", "expectedCurrentVersion", "reason"],
        properties: {
          idempotencyKey: { type: "string", format: "uuid" },
          expectedCurrentVersion: { type: "integer", minimum: 1 },
          reason: { type: "string", minLength: 1, maxLength: 500 }
        }
      },
      OfficialAnnouncementProtectedPayload: {
        type: "object",
        additionalProperties: false,
        required: [
          "publicId",
          "releaseId",
          "version",
          "status",
          "lockVersion",
          "announcementType",
          "visibilityScope",
          "affiliateTaskId",
          "publishAt",
          "visibleFrom",
          "visibleUntil",
          "activatedAt",
          "disabledAt",
          "archivedAt",
          "sourceReleaseId",
          "translations",
          "createdAt",
          "updatedAt"
        ],
        properties: {
          publicId: { type: "string", format: "uuid" },
          releaseId: { type: "integer", minimum: 1 },
          version: { type: "integer", minimum: 1 },
          status: {
            type: "string",
            enum: ["draft", "scheduled", "published", "disabled", "archived"]
          },
          lockVersion: { type: "integer", minimum: 1 },
          announcementType: { type: "string", enum: ["affiliate_notice"] },
          visibilityScope: { type: "string", enum: ["all_affiliates"] },
          affiliateTaskId: { type: ["integer", "null"], minimum: 1 },
          publishAt: { type: ["string", "null"], format: "date-time" },
          visibleFrom: { type: ["string", "null"], format: "date-time" },
          visibleUntil: { type: ["string", "null"], format: "date-time" },
          activatedAt: { type: ["string", "null"], format: "date-time" },
          disabledAt: { type: ["string", "null"], format: "date-time" },
          archivedAt: { type: ["string", "null"], format: "date-time" },
          sourceReleaseId: { type: ["integer", "null"], minimum: 1 },
          translations: {
            type: "object",
            additionalProperties: false,
            required: ["zh-CN", "zh-TW", "en", "ja", "ko"],
            properties: Object.fromEntries(
              ["zh-CN", "zh-TW", "en", "ja", "ko"].map((locale) => [
                locale,
                { $ref: "#/components/schemas/OfficialAnnouncementProtectedTranslation" }
              ])
            )
          },
          taskAction: { $ref: "#/components/schemas/OfficialAnnouncementTaskAction" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      OfficialAnnouncementProtectedPage: {
        type: "object",
        additionalProperties: false,
        required: ["list", "total", "page", "page_size"],
        properties: {
          list: {
            type: "array",
            items: { $ref: "#/components/schemas/OfficialAnnouncementProtectedPayload" }
          },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          page_size: { type: "integer", minimum: 1, maximum: 100 }
        }
      },
      OfficialAnnouncementAffiliateTaskSearchItem: {
        type: "object",
        additionalProperties: false,
        required: ["id", "taskCode", "label", "status"],
        properties: {
          id: { type: "integer", minimum: 1 },
          taskCode: { type: "string", minLength: 1, maxLength: 80 },
          label: { type: "string", minLength: 1, maxLength: 160 },
          status: { type: "string", enum: ["scheduled", "active"] }
        }
      },
      OfficialAnnouncementAffiliateTaskSearchPage: {
        type: "object",
        additionalProperties: false,
        required: ["list", "total", "page", "page_size"],
        properties: {
          list: {
            type: "array",
            items: { $ref: "#/components/schemas/OfficialAnnouncementAffiliateTaskSearchItem" }
          },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          page_size: { type: "integer", minimum: 1, maximum: 100 }
        }
      },
      OfficialAnnouncementTaskAction: {
        type: ["object", "null"],
        additionalProperties: false,
        required: ["taskCode", "label", "claimable"],
        properties: {
          taskCode: { type: "string" },
          label: { type: "string" },
          claimable: { type: "boolean" }
        }
      },
      OfficialAnnouncementPublicPayload: {
        type: "object",
        additionalProperties: false,
        required: [
          "publicId",
          "version",
          "locale",
          "title",
          "summary",
          "body",
          "visibleFrom",
          "visibleUntil",
          "activatedAt",
          "taskAction"
        ],
        properties: {
          publicId: { type: "string", format: "uuid" },
          version: { type: "integer", minimum: 1 },
          locale: { type: "string", enum: ["zh-CN", "zh-TW", "en", "ja", "ko"] },
          title: { type: "string", minLength: 1, maxLength: 160 },
          summary: { type: ["string", "null"], maxLength: 500 },
          body: { type: "string", minLength: 1, maxLength: 50000 },
          visibleFrom: { type: ["string", "null"], format: "date-time" },
          visibleUntil: { type: ["string", "null"], format: "date-time" },
          activatedAt: { type: ["string", "null"], format: "date-time" },
          taskAction: { $ref: "#/components/schemas/OfficialAnnouncementTaskAction" }
        }
      },
      ShopMembershipStore: {
        type: "object",
        additionalProperties: false,
        required: ["id", "shopNo", "name", "city", "address"],
        properties: {
          id: { type: "integer", minimum: 1 },
          shopNo: { type: ["string", "null"], pattern: "^s[0-9]{9,10}$" },
          name: { type: "string", minLength: 1, maxLength: 160 },
          city: { type: "string", minLength: 1, maxLength: 100 },
          address: { type: "string", minLength: 1, maxLength: 255 }
        }
      },
      ShopMembershipCardAdjustmentCreateRequest: {
        type: "object",
        additionalProperties: false,
        required: ["targetPrincipalBalanceJpy", "targetRemainingUses", "reason", "idempotencyKey"],
        properties: {
          targetPrincipalBalanceJpy: { type: ["integer", "null"], minimum: 0, maximum: 2_147_483_647 },
          targetRemainingUses: { type: ["integer", "null"], minimum: 0, maximum: 2_147_483_647 },
          reason: { type: "string", minLength: 1, maxLength: 500 },
          idempotencyKey: { type: "string", minLength: 8, maxLength: 160 }
        }
      },
      ShopMembershipCardAdjustmentDecisionRequest: {
        type: "object",
        additionalProperties: false,
        required: ["decision", "idempotencyKey"],
        properties: {
          decision: { type: "string", enum: ["approve", "reject"] },
          idempotencyKey: { type: "string", minLength: 8, maxLength: 160 }
        }
      },
      ShopMembershipCardAdjustment: {
        type: "object",
        additionalProperties: false,
        required: [
          "publicId", "status", "reason", "dimension", "beforeValue", "targetValue", "difference",
          "expiresAt", "remainingSeconds", "decidedAt", "cancelledAt", "invalidatedAt", "createdAt",
          "updatedAt", "card", "shop", "customer", "replayed"
        ],
        properties: {
          publicId: { type: "string", format: "uuid" },
          status: { type: "string", enum: ["pending", "approved", "rejected", "cancelled", "expired", "invalidated"] },
          reason: { type: "string", minLength: 1, maxLength: 500 },
          dimension: { type: "string", enum: ["principal_balance", "remaining_uses"] },
          beforeValue: { type: "integer", minimum: 0 },
          targetValue: { type: "integer", minimum: 0 },
          difference: { type: "integer" },
          expiresAt: { type: "string", format: "date-time" },
          remainingSeconds: { type: "integer", minimum: 0, maximum: 259_200 },
          decidedAt: { type: ["string", "null"], format: "date-time" },
          cancelledAt: { type: ["string", "null"], format: "date-time" },
          invalidatedAt: { type: ["string", "null"], format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          replayed: { type: "boolean" },
          card: {
            type: "object",
            additionalProperties: false,
            required: ["publicId", "cardNoMasked", "name", "type", "status", "principalBalanceJpy", "bonusBalanceJpy", "remainingUses", "totalUses"],
            properties: {
              publicId: { type: "string", format: "uuid" },
              cardNoMasked: { type: "string" },
              name: { type: "string" },
              type: { type: "string", enum: ["stored_value", "count", "benefit"] },
              status: { type: "string", enum: ["active", "frozen", "expired", "void"] },
              principalBalanceJpy: { type: ["integer", "null"], minimum: 0 },
              bonusBalanceJpy: { type: ["integer", "null"], minimum: 0 },
              remainingUses: { type: ["integer", "null"], minimum: 0 },
              totalUses: { type: ["integer", "null"], minimum: 0 }
            }
          },
          shop: {
            type: "object",
            additionalProperties: false,
            required: ["shopNo", "name"],
            properties: { shopNo: { type: ["string", "null"] }, name: { type: "string" } }
          },
          customer: {
            type: "object",
            additionalProperties: false,
            required: ["needoId", "displayName"],
            properties: { needoId: { type: "string" }, displayName: { type: "string" } }
          }
        }
      },
      ShopMembershipCardAdjustmentPage: {
        type: "object",
        additionalProperties: false,
        required: ["list", "total", "page", "page_size"],
        properties: {
          list: { type: "array", items: { $ref: "#/components/schemas/ShopMembershipCardAdjustment" } },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          page_size: { type: "integer", minimum: 1, maximum: 100 }
        }
      },
      ShopMembershipCard: {
        type: "object",
        additionalProperties: false,
        required: shopMembershipCardRequired,
        properties: shopMembershipCardProperties
      },
      MerchantShopMembershipCard: {
        type: "object",
        additionalProperties: false,
        required: [...shopMembershipCardRequired, "membershipPublicId", "customerNeedoId", "customerDisplayName", "pendingAdjustment"],
        properties: {
          ...shopMembershipCardProperties,
          membershipPublicId: { type: "string", format: "uuid" },
          customerNeedoId: { type: "string", pattern: "^u[0-9]{10}$" },
          customerDisplayName: { type: "string", minLength: 1, maxLength: 120 },
          pendingAdjustment: {
            oneOf: [
              { type: "null" },
              {
                type: "object",
                additionalProperties: false,
                required: ["publicId", "status", "beforeValue", "targetValue", "expiresAt"],
                properties: {
                  publicId: { type: "string", format: "uuid" },
                  status: { type: "string", enum: ["pending"] },
                  beforeValue: { type: "integer", minimum: 0 },
                  targetValue: { type: "integer", minimum: 0 },
                  expiresAt: { type: "string", format: "date-time" }
                }
              }
            ]
          }
        }
      },
      ShopMembership: {
        type: "object",
        additionalProperties: false,
        required: ["publicId", "customerNeedoId", "displayName", "avatarUrl", "city", "status", "source", "startedAt", "endedAt", "cardCount", "activeCardCount", "lastActivityAt"],
        properties: {
          publicId: { type: "string", format: "uuid" },
          customerNeedoId: { type: "string", pattern: "^u[0-9]{10}$" },
          displayName: { type: "string", minLength: 1, maxLength: 120 },
          avatarUrl: { type: ["string", "null"] },
          city: { type: ["string", "null"], maxLength: 100 },
          status: { type: "string", enum: ["active", "ended"] },
          source: { type: "string", enum: ["merchant_manual"] },
          startedAt: { type: "string", format: "date-time" },
          endedAt: { type: ["string", "null"], format: "date-time" },
          cardCount: { type: "integer", minimum: 0 },
          activeCardCount: { type: "integer", minimum: 0 },
          lastActivityAt: { type: "string", format: "date-time" }
        }
      },
      ShopMembershipDetail: {
        allOf: [
          { $ref: "#/components/schemas/ShopMembership" },
          {
            type: "object",
            additionalProperties: false,
            required: ["shop", "cards"],
            properties: {
              shop: { $ref: "#/components/schemas/ShopMembershipStore" },
              cards: { type: "array", items: { $ref: "#/components/schemas/ShopMembershipCard" } }
            }
          }
        ]
      },
      ShopMembershipActivity: {
        type: "object",
        additionalProperties: false,
        required: ["id", "action", "membershipPublicId", "customerNeedoId", "customerDisplayName", "actorName", "occurredAt"],
        properties: {
          id: { type: "string" },
          action: { type: "string", enum: ["membership_created"] },
          membershipPublicId: { type: "string", format: "uuid" },
          customerNeedoId: { type: "string", pattern: "^u[0-9]{10}$" },
          customerDisplayName: { type: "string" },
          actorName: { type: "string" },
          occurredAt: { type: "string", format: "date-time" }
        }
      },
      ShopMembershipOverview: {
        type: "object",
        additionalProperties: false,
        required: ["shop", "activeMemberCount", "todayNewMemberCount", "activeCardCount", "expiringSoonCardCount", "recentActivities"],
        properties: {
          shop: { $ref: "#/components/schemas/ShopMembershipStore" },
          activeMemberCount: { type: "integer", minimum: 0 },
          todayNewMemberCount: { type: "integer", minimum: 0 },
          activeCardCount: { type: "integer", minimum: 0 },
          expiringSoonCardCount: { type: "integer", minimum: 0 },
          recentActivities: { type: "array", items: { $ref: "#/components/schemas/ShopMembershipActivity" } }
        }
      },
      ShopMembershipAnalytics: {
        type: "object",
        additionalProperties: false,
        required: ["period", "from", "to", "activeMemberCount", "newMemberCount", "cardStatusCounts", "dailyNewMembers"],
        properties: {
          period: { type: "string", enum: ["last7days", "last30days", "last90days"] },
          from: { type: "string", format: "date-time" },
          to: { type: "string", format: "date-time" },
          activeMemberCount: { type: "integer", minimum: 0 },
          newMemberCount: { type: "integer", minimum: 0 },
          cardStatusCounts: { type: "object", additionalProperties: false },
          dailyNewMembers: { type: "array", items: { type: "object", additionalProperties: false } }
        }
      },
      ShopMembershipCreateRequest: {
        type: "object",
        additionalProperties: false,
        required: ["customerNeedoId"],
        properties: { customerNeedoId: { type: "string", pattern: "^u[0-9]{10}$" } }
      },
      ShopMembershipCandidate: {
        type: "object",
        additionalProperties: false,
        required: ["customerNeedoId", "displayName", "avatarUrl", "city", "lastOrderAt"],
        properties: {
          customerNeedoId: { type: "string", pattern: "^u[0-9]{10}$" },
          displayName: { type: "string", minLength: 1, maxLength: 120 },
          avatarUrl: { type: ["string", "null"] },
          city: { type: ["string", "null"], maxLength: 100 },
          lastOrderAt: { type: "string", format: "date-time" }
        }
      },
      ShopMembershipPage: {
        type: "object",
        additionalProperties: false,
        required: ["list", "total", "page", "page_size"],
        properties: {
          list: { type: "array", items: { $ref: "#/components/schemas/ShopMembership" } },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          page_size: { type: "integer", minimum: 1, maximum: 100 }
        }
      },
      CustomerShopMembership: {
        type: "object",
        additionalProperties: false,
        required: ["publicId", "status", "startedAt", "endedAt", "cardCount", "activeCardCount", "expiringSoonCardCount", "updatedAt", "shop"],
        properties: {
          publicId: { type: "string", format: "uuid" },
          status: { type: "string", enum: ["active", "ended"] },
          startedAt: { type: "string", format: "date-time" },
          endedAt: { type: ["string", "null"], format: "date-time" },
          cardCount: { type: "integer", minimum: 0 },
          activeCardCount: { type: "integer", minimum: 0 },
          expiringSoonCardCount: { type: "integer", minimum: 0 },
          updatedAt: { type: "string", format: "date-time" },
          shop: { $ref: "#/components/schemas/ShopMembershipStore" }
        }
      },
      CustomerShopMembershipDetail: {
        allOf: [
          { $ref: "#/components/schemas/CustomerShopMembership" },
          {
            type: "object",
            additionalProperties: false,
            required: ["cards"],
            properties: { cards: { type: "array", items: { $ref: "#/components/schemas/ShopMembershipCard" } } }
          }
        ]
      },
      OrderAcceptancePause: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "subjectType",
          "subjectId",
          "merchantAccountId",
          "merchantAccountName",
          "shopId",
          "shopName",
          "authorityType",
          "status",
          "reasonCode",
          "reasonDetail",
          "startsAt",
          "releasedAt",
          "releaseReason",
          "createdAt",
          "updatedAt"
        ],
        properties: {
          id: { type: "integer", minimum: 1 },
          subjectType: { type: "string", enum: ["merchant_account", "shop"] },
          subjectId: { type: "integer", minimum: 1 },
          merchantAccountId: { type: ["integer", "null"], minimum: 1 },
          merchantAccountName: { type: ["string", "null"] },
          shopId: { type: ["integer", "null"], minimum: 1 },
          shopName: { type: ["string", "null"] },
          authorityType: { type: "string", enum: ["operations", "merchant", "shop"] },
          status: { type: "string", enum: ["active", "released"] },
          reasonCode: { type: "string", pattern: "^[a-z0-9][a-z0-9_-]{1,79}$" },
          reasonDetail: { type: "string", minLength: 1, maxLength: 500 },
          startsAt: { type: "string", format: "date-time" },
          releasedAt: { type: ["string", "null"], format: "date-time" },
          releaseReason: { type: ["string", "null"], maxLength: 500 },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      OrderAcceptancePauseSummary: {
        type: "object",
        additionalProperties: false,
        required: ["subjectType", "authorityType", "reasonCode", "startsAt"],
        properties: {
          subjectType: { type: "string", enum: ["merchant_account", "shop"] },
          authorityType: { type: "string", enum: ["operations", "merchant", "shop"] },
          reasonCode: { type: "string", pattern: "^[a-z0-9][a-z0-9_-]{1,79}$" },
          startsAt: { type: "string", format: "date-time" }
        }
      },
      OrderAcceptancePausePage: {
        type: "object",
        additionalProperties: false,
        required: ["list", "total", "page", "page_size"],
        properties: {
          list: {
            type: "array",
            items: { $ref: "#/components/schemas/OrderAcceptancePause" }
          },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          page_size: { type: "integer", minimum: 1, maximum: 100 }
        }
      },
      OrderAcceptancePauseCreateRequest: {
        type: "object",
        additionalProperties: false,
        required: ["subjectType", "subjectId", "reasonCode", "reasonDetail"],
        properties: {
          subjectType: { type: "string", enum: ["merchant_account", "shop"] },
          subjectId: { type: "integer", minimum: 1 },
          reasonCode: { type: "string", pattern: "^[a-z0-9][a-z0-9_-]{1,79}$" },
          reasonDetail: { type: "string", minLength: 1, maxLength: 500 }
        }
      },
      OrderAcceptancePauseReleaseRequest: {
        type: "object",
        additionalProperties: false,
        required: ["releaseReason"],
        properties: {
          releaseReason: { type: "string", minLength: 1, maxLength: 500 }
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
    ...createShopMembershipCardPlanOpenApiPaths(config),
    ...createCarouselOpenApiPaths(config),
    ...createExchangeOpenApiPaths(config),
    [`${config.API_PREFIX}/backoffice/affiliate/fee-rules/summary`]: {
      get: {
        tags: ["Affiliate Platform Fee"],
        summary: "Read the server-evaluated global Affiliate platform fee summary",
        description:
          "Requires page:backoffice-affiliate-fee-rule and a global or platform operations identity.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "scopeType",
            in: "query",
            required: true,
            schema: { type: "string", enum: ["global"] }
          }
        ],
        responses: {
          "200": jsonDataResponse("Current, next scheduled, and latest global fee versions", {
            $ref: "#/components/schemas/AffiliatePlatformFeeRuleSummary"
          }),
          ...affiliatePlatformFeeErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/affiliate/fee-rule-shops`]: {
      get: {
        tags: ["Affiliate Platform Fee"],
        summary: "Search published shops for an Affiliate fee-rule scope",
        description:
          "Requires page:backoffice-affiliate-fee-rule. Returns only minimal published shop options.",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "keyword", in: "query", schema: { type: "string", maxLength: 100 } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          {
            name: "pageSize",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100 }
          }
        ],
        responses: {
          "200": jsonDataResponse("Paginated minimal published shop options", {
            $ref: "#/components/schemas/AffiliatePlatformFeeShopOptionPage"
          }),
          ...affiliatePlatformFeeErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/affiliate/fee-rules`]: {
      get: {
        tags: ["Affiliate Platform Fee"],
        summary: "List versioned Affiliate platform fee rules",
        description:
          "Requires page:backoffice-affiliate-fee-rule and a global or platform operations identity.",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          {
            name: "pageSize",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100 }
          },
          {
            name: "scopeType",
            in: "query",
            schema: { type: "string", enum: ["global", "shop"] }
          },
          { name: "shopId", in: "query", schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": jsonDataResponse("Paginated Affiliate platform fee rule history", {
            $ref: "#/components/schemas/AffiliatePlatformFeeRulePage"
          }),
          ...affiliatePlatformFeeErrorResponses
        }
      },
      post: {
        tags: ["Affiliate Platform Fee"],
        summary: "Create the next Affiliate platform fee rule version",
        description:
          "Requires button:backoffice-affiliate-fee-rule-create. The prior version is closed and retained for immutable task snapshots.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AffiliatePlatformFeeRuleCreate" }
            }
          }
        },
        responses: {
          "201": jsonDataResponse("Created Affiliate platform fee rule version", {
            $ref: "#/components/schemas/AffiliatePlatformFeeRule"
          }),
          ...affiliatePlatformFeeErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/platform-fee-policy`]: {
      get: {
        tags: ["Platform Fee Policy"],
        summary: "Read the current global Booking platform fee",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": jsonDataResponse("Current global Booking platform fee", {
            $ref: "#/components/schemas/GlobalBookingPlatformFee"
          }),
          ...platformFeePolicyErrorResponses
        }
      },
      patch: {
        tags: ["Platform Fee Policy"],
        summary: "Create the next effective global Booking platform fee version",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/GlobalPlatformFeeUpdateRequest" }
            }
          }
        },
        responses: {
          "200": jsonDataResponse("Updated global Booking platform fee", {
            $ref: "#/components/schemas/GlobalBookingPlatformFee"
          }),
          ...platformFeePolicyErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/shop-platform-fee-policies`]: {
      get: {
        tags: ["Platform Fee Policy"],
        summary: "List effective platform fee policies for shops",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          {
            name: "pageSize",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100 }
          },
          { name: "keyword", in: "query", schema: { type: "string", maxLength: 160 } },
          { name: "feeEnabled", in: "query", schema: { type: "boolean" } }
        ],
        responses: {
          "200": jsonDataResponse("Paginated effective shop platform fee policies", {
            $ref: "#/components/schemas/ShopPlatformFeePolicyPage"
          }),
          ...platformFeePolicyErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/shops/{shopId}/platform-fee-policy`]: {
      patch: {
        tags: ["Platform Fee Policy"],
        summary: "Enable or disable platform fee collection for one shop",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParameter("shopId")],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ShopFeeEnabledUpdateRequest" }
            }
          }
        },
        responses: {
          "200": jsonDataResponse("Updated shop platform fee collection state", {
            $ref: "#/components/schemas/ShopPlatformFeePolicy"
          }),
          ...platformFeePolicyErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/shops/{shopId}/platform-fee-policy`]: {
      get: {
        tags: ["Platform Fee Policy"],
        summary: "Read a shop platform fee policy in the active merchant identity scope",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParameter("shopId")],
        responses: {
          "200": jsonDataResponse("Effective shop platform fee policy", {
            $ref: "#/components/schemas/ShopPlatformFeePolicy"
          }),
          ...platformFeePolicyErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/shops/{shopId}/platform-fee-policy/payer`]: {
      patch: {
        tags: ["Platform Fee Policy"],
        summary: "Set the shop or technician as platform fee payer",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParameter("shopId")],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ShopFeePayerUpdateRequest" }
            }
          }
        },
        responses: {
          "200": jsonDataResponse("Updated shop platform fee payer", {
            $ref: "#/components/schemas/ShopPlatformFeePolicy"
          }),
          ...platformFeePolicyErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/shop-memberships/overview`]: {
      get: {
        tags: ["Shop Membership"],
        summary: "Read the current shop membership overview",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": jsonDataResponse("Current shop membership overview", { $ref: "#/components/schemas/ShopMembershipOverview" }),
          ...shopMembershipErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/shop-memberships`]: {
      get: {
        tags: ["Shop Membership"],
        summary: "List memberships in the current shop identity scope",
        security: [{ bearerAuth: [] }],
        parameters: [
          ...shopMembershipPageParameters,
          { name: "keyword", in: "query", schema: { type: "string", maxLength: 100 } },
          { name: "status", in: "query", schema: { type: "string", enum: ["active", "ended"] } }
        ],
        responses: {
          "200": jsonDataResponse("Paginated shop memberships", { $ref: "#/components/schemas/ShopMembershipPage" }),
          ...shopMembershipErrorResponses
        }
      },
      post: {
        tags: ["Shop Membership"],
        summary: "Enroll one eligible customer in the current shop",
        description: "The shop is resolved exclusively from the authenticated shop identity. Card issuing, top-up, redemption, and refund are not part of this operation.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ShopMembershipCreateRequest" }
            }
          }
        },
        responses: {
          "201": jsonDataResponse("Created shop membership with transactional audit", { $ref: "#/components/schemas/ShopMembershipDetail" }),
          ...shopMembershipErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/shop-memberships/{publicId}`]: {
      get: {
        tags: ["Shop Membership"],
        summary: "Read one membership in the current shop",
        security: [{ bearerAuth: [] }],
        parameters: [shopMembershipPublicIdParameter],
        responses: {
          "200": jsonDataResponse("Shop membership detail", { $ref: "#/components/schemas/ShopMembershipDetail" }),
          ...shopMembershipErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/shop-membership-candidates`]: {
      get: {
        tags: ["Shop Membership"],
        summary: "List customers eligible for shop membership enrollment",
        description: "Only customers with a persisted booking in the current shop and no active membership are returned.",
        security: [{ bearerAuth: [] }],
        parameters: [...shopMembershipPageParameters, { name: "keyword", in: "query", schema: { type: "string", maxLength: 100 } }],
        responses: {
          "200": jsonDataResponse("Paginated eligible customers", shopMembershipPageSchema({ $ref: "#/components/schemas/ShopMembershipCandidate" })),
          ...shopMembershipErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/shop-membership-cards`]: {
      get: {
        tags: ["Shop Membership"],
        summary: "List read-only membership card projections in the current shop",
        security: [{ bearerAuth: [] }],
        parameters: [
          ...shopMembershipPageParameters,
          { name: "type", in: "query", schema: { type: "string", enum: ["stored_value", "count", "benefit"] } },
          { name: "status", in: "query", schema: { type: "string", enum: ["active", "frozen", "expired", "void"] } }
        ],
        responses: {
          "200": jsonDataResponse("Paginated read-only membership cards", shopMembershipPageSchema({ $ref: "#/components/schemas/MerchantShopMembershipCard" })),
          ...shopMembershipErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/shop-membership-cards/{publicId}/adjustment-requests`]: {
      post: {
        tags: ["Shop Membership Card Adjustment"],
        summary: "Submit a 72-hour customer-approved card value correction",
        security: [{ bearerAuth: [] }],
        parameters: [shopMembershipPublicIdParameter],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ShopMembershipCardAdjustmentCreateRequest" } } }
        },
        responses: {
          "200": jsonDataResponse("Idempotent replay of the existing request", { $ref: "#/components/schemas/ShopMembershipCardAdjustment" }),
          "201": jsonDataResponse("Created pending adjustment request", { $ref: "#/components/schemas/ShopMembershipCardAdjustment" }),
          ...shopMembershipCardAdjustmentErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/shop-membership-card-adjustment-requests`]: {
      get: {
        tags: ["Shop Membership Card Adjustment"],
        summary: "List adjustment requests in the current shop",
        security: [{ bearerAuth: [] }],
        parameters: [
          ...shopMembershipPageParameters,
          { name: "status", in: "query", schema: { type: "string", enum: ["pending", "approved", "rejected", "cancelled", "expired", "invalidated"] } },
          { name: "cardPublicId", in: "query", schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": jsonDataResponse("Paginated shop adjustment requests", { $ref: "#/components/schemas/ShopMembershipCardAdjustmentPage" }),
          ...shopMembershipCardAdjustmentErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/shop-membership-card-adjustment-requests/{publicId}/cancel`]: {
      post: {
        tags: ["Shop Membership Card Adjustment"],
        summary: "Cancel a pending adjustment before the customer decides",
        security: [{ bearerAuth: [] }],
        parameters: [shopMembershipPublicIdParameter],
        responses: {
          "200": jsonDataResponse("Cancelled adjustment request", { $ref: "#/components/schemas/ShopMembershipCardAdjustment" }),
          ...shopMembershipCardAdjustmentErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/shop-membership-activities`]: {
      get: {
        tags: ["Shop Membership"],
        summary: "List membership operation activity in the current shop",
        security: [{ bearerAuth: [] }],
        parameters: shopMembershipPageParameters,
        responses: {
          "200": jsonDataResponse("Paginated shop membership activity", shopMembershipPageSchema({ $ref: "#/components/schemas/ShopMembershipActivity" })),
          ...shopMembershipErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/shop-membership-analytics`]: {
      get: {
        tags: ["Shop Membership"],
        summary: "Read bounded membership and card-state analytics for the current shop",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "period", in: "query", schema: { type: "string", enum: ["last7days", "last30days", "last90days"], default: "last30days" } }],
        responses: {
          "200": jsonDataResponse("Current shop membership analytics", { $ref: "#/components/schemas/ShopMembershipAnalytics" }),
          ...shopMembershipErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/customer-profile/me/shop-memberships`]: {
      get: {
        tags: ["Shop Membership"],
        summary: "List the authenticated customer's own shop memberships",
        security: [{ bearerAuth: [] }],
        parameters: [...shopMembershipPageParameters, { name: "status", in: "query", schema: { type: "string", enum: ["active", "ended"] } }],
        responses: {
          "200": jsonDataResponse("Paginated customer shop memberships", shopMembershipPageSchema({ $ref: "#/components/schemas/CustomerShopMembership" })),
          ...shopMembershipErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/customer-profile/me/shop-memberships/{publicId}`]: {
      get: {
        tags: ["Shop Membership"],
        summary: "Read one authenticated-customer shop membership and its card states",
        security: [{ bearerAuth: [] }],
        parameters: [shopMembershipPublicIdParameter],
        responses: {
          "200": jsonDataResponse("Customer shop membership detail", { $ref: "#/components/schemas/CustomerShopMembershipDetail" }),
          ...shopMembershipErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/customer-profile/me/shop-membership-card-adjustment-requests`]: {
      get: {
        tags: ["Shop Membership Card Adjustment"],
        summary: "List the authenticated customer's card adjustment requests",
        security: [{ bearerAuth: [] }],
        parameters: [
          ...shopMembershipPageParameters,
          { name: "status", in: "query", schema: { type: "string", enum: ["pending", "approved", "rejected", "cancelled", "expired", "invalidated"] } },
          { name: "cardPublicId", in: "query", schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": jsonDataResponse("Paginated customer adjustment requests", { $ref: "#/components/schemas/ShopMembershipCardAdjustmentPage" }),
          ...shopMembershipCardAdjustmentErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/customer-profile/me/shop-membership-card-adjustment-requests/{publicId}/decision`]: {
      post: {
        tags: ["Shop Membership Card Adjustment"],
        summary: "Approve or reject an unexpired adjustment request",
        security: [{ bearerAuth: [] }],
        parameters: [shopMembershipPublicIdParameter],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ShopMembershipCardAdjustmentDecisionRequest" } } }
        },
        responses: {
          "200": jsonDataResponse("Customer decision result", { $ref: "#/components/schemas/ShopMembershipCardAdjustment" }),
          ...shopMembershipCardAdjustmentErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/order-acceptance-pauses`]: {
      get: {
        tags: ["Order Acceptance Pause"],
        summary: "List group and shop order acceptance pauses in operations scope",
        security: [{ bearerAuth: [] }],
        parameters: orderAcceptancePauseListParameters,
        responses: {
          "200": jsonDataResponse("Paginated order acceptance pauses", {
            $ref: "#/components/schemas/OrderAcceptancePausePage"
          }),
          ...orderAcceptancePauseErrorResponses
        }
      },
      post: {
        tags: ["Order Acceptance Pause"],
        summary: "Pause order acceptance for one merchant group or shop as operations",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OrderAcceptancePauseCreateRequest" }
            }
          }
        },
        responses: {
          "201": jsonDataResponse("Created or existing active order acceptance pause", {
            $ref: "#/components/schemas/OrderAcceptancePause"
          }),
          ...orderAcceptancePauseErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/order-acceptance-pauses/{id}/release`]: {
      post: {
        tags: ["Order Acceptance Pause"],
        summary: "Release an order acceptance pause as operations",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParameter()],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OrderAcceptancePauseReleaseRequest" }
            }
          }
        },
        responses: {
          "200": jsonDataResponse("Released order acceptance pause", {
            $ref: "#/components/schemas/OrderAcceptancePause"
          }),
          ...orderAcceptancePauseErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/order-acceptance-pauses`]: {
      get: {
        tags: ["Order Acceptance Pause"],
        summary: "List order acceptance pauses in the active merchant or shop identity scope",
        security: [{ bearerAuth: [] }],
        parameters: orderAcceptancePauseListParameters,
        responses: {
          "200": jsonDataResponse("Paginated order acceptance pauses", {
            $ref: "#/components/schemas/OrderAcceptancePausePage"
          }),
          ...orderAcceptancePauseErrorResponses
        }
      },
      post: {
        tags: ["Order Acceptance Pause"],
        summary: "Pause order acceptance in the active merchant or shop identity scope",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OrderAcceptancePauseCreateRequest" }
            }
          }
        },
        responses: {
          "201": jsonDataResponse("Created or existing active order acceptance pause", {
            $ref: "#/components/schemas/OrderAcceptancePause"
          }),
          ...orderAcceptancePauseErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/order-acceptance-pauses/{id}/release`]: {
      post: {
        tags: ["Order Acceptance Pause"],
        summary: "Release an order acceptance pause in the active merchant or shop identity scope",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParameter()],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OrderAcceptancePauseReleaseRequest" }
            }
          }
        },
        responses: {
          "200": jsonDataResponse("Released order acceptance pause", {
            $ref: "#/components/schemas/OrderAcceptancePause"
          }),
          ...orderAcceptancePauseErrorResponses
        }
      }
    },
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
    [`${config.API_PREFIX}/merchant-admin/employees/{needoId}/schedule`]: {
      get: {
        tags: ["Merchant Employees"],
        summary: "Read a privacy-safe employee schedule projection",
        description:
          "The authenticated shop receives its own schedule details, technician-published partner availability, and time-only gray locks for another shop's confirmed or in-service bookings.",
        security: [{ bearerAuth: [] }],
        parameters: [
          merchantEmployeeNeedoIdParameter,
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
          {
            name: "view",
            in: "query",
            required: true,
            schema: { type: "string", enum: ["day", "week", "month"] }
          }
        ],
        responses: {
          "200": jsonDataResponse("Privacy-safe employee schedule projection", {
            $ref: "#/components/schemas/MerchantEmployeeScheduleProjection"
          }),
          "400": merchantEmployeeErrorResponses["400"],
          "401": merchantEmployeeErrorResponses["401"],
          "403": merchantEmployeeErrorResponses["403"],
          "404": merchantEmployeeErrorResponses["404"]
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/employees/{needoId}/timeline`]: {
      get: {
        tags: ["Merchant Employees"],
        summary: "List semantic employee result events",
        description:
          "Returns only mutation outcomes for the authenticated shop affiliation. Read and preview audit actions, internal IDs, raw actions, and raw metadata are not exposed.",
        security: [{ bearerAuth: [] }],
        parameters: [
          merchantEmployeeNeedoIdParameter,
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          {
            name: "pageSize",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 }
          }
        ],
        responses: {
          "200": jsonDataResponse("Paginated employee event timeline", {
            $ref: "#/components/schemas/MerchantEmployeeTimelinePage"
          }),
          ...merchantEmployeeErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/employees/{needoId}/timeline/comments`]: {
      post: {
        tags: ["Merchant Employees"],
        summary: "Add an employee timeline comment",
        description:
          "Persists a scoped audit comment. It does not change payroll status or initiate a payment.",
        security: [{ bearerAuth: [] }],
        parameters: [merchantEmployeeNeedoIdParameter],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MerchantEmployeeTimelineCommentInput" }
            }
          }
        },
        responses: {
          "201": jsonDataResponse("Employee timeline comment created", {
            type: "object",
            required: ["created"],
            properties: { created: { type: "boolean", enum: [true] } }
          }),
          ...merchantEmployeeErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/employees/{needoId}/profile`]: {
      patch: {
        tags: ["Merchant Employees"],
        summary: "Update the authenticated shop employee's global technician profile",
        description:
          "The employee is resolved by canonical technician S NeeDoID and must have a current affiliation with the authenticated shop. Account credentials and contact fields are read-only here.",
        security: [{ bearerAuth: [] }],
        parameters: [merchantEmployeeNeedoIdParameter],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MerchantEmployeeProfileInput" }
            }
          }
        },
        responses: {
          "200": jsonDataResponse("Updated employee profile", {
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
    [`${config.API_PREFIX}/affiliate/alliances/me/members`]: {
      get: {
        tags: ["Affiliate Alliance"],
        summary: "List members of the authenticated owner's active alliance",
        security: [{ bearerAuth: [] }],
        "x-permission": "affiliate-alliance:members:list",
        parameters: affiliateAllianceListParameters,
        responses: {
          "200": jsonDataResponse("Paginated alliance members", {
            $ref: "#/components/schemas/AffiliateAllianceMemberPage"
          }),
          ...affiliateAllianceErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/affiliate/alliances/me/eligible-contacts`]: {
      get: {
        tags: ["Affiliate Alliance"],
        summary: "List reciprocal NeeDo friends eligible for an alliance invitation",
        security: [{ bearerAuth: [] }],
        "x-permission": "affiliate-alliance:candidates:list",
        parameters: affiliateAllianceListParameters,
        responses: {
          "200": jsonDataResponse("Paginated eligible reciprocal contacts", {
            $ref: "#/components/schemas/AffiliateAllianceCandidatePage"
          }),
          ...affiliateAllianceErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/affiliate/alliances/me/invitations`]: {
      get: {
        tags: ["Affiliate Alliance"],
        summary: "List invitations sent by the authenticated alliance owner",
        security: [{ bearerAuth: [] }],
        "x-permission": "affiliate-alliance:invitations:list",
        parameters: affiliateAllianceInvitationListParameters,
        responses: {
          "200": jsonDataResponse("Paginated sent alliance invitations", {
            $ref: "#/components/schemas/AffiliateAllianceInvitationPage"
          }),
          ...affiliateAllianceErrorResponses
        }
      },
      post: {
        tags: ["Affiliate Alliance"],
        summary: "Invite an eligible reciprocal NeeDo friend",
        security: [{ bearerAuth: [] }],
        "x-permission": "button:affiliate-alliance-invite",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AffiliateAllianceInvitationCreate" }
            }
          }
        },
        responses: {
          "201": jsonDataResponse("Created alliance invitation", {
            $ref: "#/components/schemas/AffiliateAllianceInvitationCreated"
          }),
          ...affiliateAllianceErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/affiliate/alliance-invitations/mine`]: {
      get: {
        tags: ["Affiliate Alliance"],
        summary: "List alliance invitations received by the authenticated Affiliate",
        security: [{ bearerAuth: [] }],
        "x-permission": "affiliate-alliance:invitations:list",
        parameters: affiliateAllianceInvitationListParameters,
        responses: {
          "200": jsonDataResponse("Paginated received alliance invitations", {
            $ref: "#/components/schemas/AffiliateAllianceInvitationPage"
          }),
          ...affiliateAllianceErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/affiliate/alliance-invitations/{id}/accept`]: {
      post: {
        tags: ["Affiliate Alliance"],
        summary: "Accept the authenticated Affiliate's pending alliance invitation",
        security: [{ bearerAuth: [] }],
        "x-permission": "button:affiliate-alliance-invitation-respond",
        parameters: [idPathParameter()],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/StrictEmptyBody" } }
          }
        },
        responses: {
          "200": jsonDataResponse("Accepted invitation and created member", {
            $ref: "#/components/schemas/AffiliateAllianceInvitationAccepted"
          }),
          ...affiliateAllianceErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/affiliate/alliance-invitations/{id}/reject`]: {
      post: {
        tags: ["Affiliate Alliance"],
        summary: "Reject the authenticated Affiliate's pending alliance invitation",
        security: [{ bearerAuth: [] }],
        "x-permission": "button:affiliate-alliance-invitation-respond",
        parameters: [idPathParameter()],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/StrictEmptyBody" } }
          }
        },
        responses: {
          "200": jsonDataResponse("Rejected alliance invitation", {
            $ref: "#/components/schemas/AffiliateAllianceInvitationCreated"
          }),
          ...affiliateAllianceErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/affiliate/alliances/me`]: {
      get: {
        tags: ["Affiliate Alliance"],
        summary: "Get the authenticated Affiliate's current alliance",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": jsonDataResponse("Current Affiliate alliance or null", {
            $ref: "#/components/schemas/AffiliateAllianceMine"
          }),
          ...affiliateAllianceErrorResponses
        }
      }
    },
    [`${config.API_PREFIX}/affiliate/alliances`]: {
      post: {
        tags: ["Affiliate Alliance"],
        summary: "Create the authenticated Affiliate's owned alliance",
        description:
          "Creates an owner membership, all owner permissions, and a separate zero-balance NDP alliance wallet. eKYC and bank details are not required for creation.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AffiliateAllianceCreate" }
            }
          }
        },
        responses: {
          "201": jsonDataResponse("Created Affiliate alliance", {
            $ref: "#/components/schemas/AffiliateAllianceCreated"
          }),
          ...affiliateAllianceErrorResponses
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
    [`${config.API_PREFIX}/merchant-admin/affiliate/tasks/{taskId}/locales/{locale}`]: {
      put: {
        tags: ["Affiliate Task Publishing"],
        summary: "Update one authored task language or explicitly synchronize it to all languages",
        security: [{ bearerAuth: [] }],
        parameters: [
          idPathParameter("taskId"),
          {
            name: "locale",
            in: "path",
            required: true,
            schema: { type: "string", enum: affiliateContentLocales }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AffiliateTaskTranslationUpdate" }
            }
          }
        },
        responses: {
          "200": jsonDataResponse("Updated affiliate task language", {
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
    [`${config.API_PREFIX}/auth/merchant-shop/switch`]: {
      post: {
        tags: ["Auth"],
        summary: "Switch the active shop for a merchant-account identity and rotate the token pair",
        security: [{ bearerAuth: [] }],
        requestBody: authJsonBody(
          {
            refreshToken: { type: "string", minLength: 1, maxLength: 8192 },
            shopPublicId: { type: "string", pattern: "^shop[0-9]{10}$" }
          },
          ["refreshToken", "shopPublicId"]
        ),
        responses: {
          "200": jsonDataResponse("Rotated token pair scoped to the requested active shop", {
            $ref: "#/components/schemas/SwitchMerchantShopResponse"
          }),
          "400": { description: "error.validation — strict request validation failed" },
          "401": {
            description: "error.auth.token_invalid — access or refresh session validation failed"
          },
          "403": {
            description:
              "error.forbidden or error.identity.forbidden — permission, identity, membership, account, or shop denial"
          }
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
        parameters: [
          {
            name: "isTestAccount",
            in: "query",
            required: false,
            schema: { type: "boolean" }
          }
        ],
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
    [`${config.API_PREFIX}/users/{id}/test-account`]: {
      patch: {
        tags: ["User Management"],
        summary: "Change a user's test-account classification",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
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
                additionalProperties: false,
                required: ["isTestAccount", "expectedUpdatedAt"],
                properties: {
                  isTestAccount: { type: "boolean" },
                  expectedUpdatedAt: { type: "string", format: "date-time" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Account classification updated" },
          "403": { description: "Dedicated permission required" },
          "404": { description: "User not found" },
          "409": { description: "Stale version or active financial state" }
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
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              oneOf: [
                { type: "integer", minimum: 1 },
                { type: "string", format: "uuid" }
              ]
            }
          }
        ],
        responses: {
          "200": jsonDataResponse("Service detail", {
            $ref: "#/components/schemas/ServiceDetail"
          }),
          "400": { description: "error.validation" },
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
        summary: "Typed public shop, technician, or service search",
        description:
          "Repeated keywords and categoryIds use OR semantics. Shop and technician names use substring matching. Omitting entityType preserves the legacy service result page.",
        parameters: [
          {
            name: "entityType",
            in: "query",
            schema: {
              type: "string",
              enum: ["service", "shop", "technician"],
              default: "service"
            }
          },
          {
            name: "keyword",
            in: "query",
            description: "Legacy singular keyword, folded into service search terms.",
            schema: { type: "string", minLength: 1, maxLength: 100 }
          },
          {
            name: "keywords",
            in: "query",
            description: "Repeated fuzzy terms; matching any term is sufficient.",
            style: "form",
            explode: true,
            schema: {
              type: "array",
              maxItems: 20,
              uniqueItems: true,
              items: { type: "string", minLength: 1, maxLength: 100 }
            }
          },
          {
            name: "categoryIds",
            in: "query",
            description: "Repeated formal category IDs; matching any category is sufficient.",
            style: "form",
            explode: true,
            schema: {
              type: "array",
              maxItems: 20,
              uniqueItems: true,
              items: { type: "integer", minimum: 1 }
            }
          },
          { name: "categoryId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "shopId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "technicianId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "city", in: "query", schema: { type: "string", maxLength: 100 } },
          { name: "serviceMode", in: "query", schema: { type: "string", maxLength: 50 } },
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
          {
            name: "pageSize",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100 }
          }
        ],
        responses: {
          "200": {
            description: "Typed paginated search results",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: {
                      anyOf: [
                        { $ref: "#/components/schemas/ServiceCardPage" },
                        { $ref: "#/components/schemas/ShopCardPage" },
                        { $ref: "#/components/schemas/TechnicianCardPage" }
                      ]
                    }
                  }
                }
              }
            }
          },
          "400": { description: "error.validation" }
        }
      }
    },
    [`${config.API_PREFIX}/shops/{id}`]: {
      get: {
        tags: ["Core Read"],
        summary: "Public shop detail",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              oneOf: [
                { type: "integer", minimum: 1 },
                { type: "string", pattern: "^shop[0-9]{10}$" }
              ]
            }
          }
        ],
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
    [`${config.API_PREFIX}/technician-profile/me`]: {
      get: {
        tags: ["Technician Profile"],
        summary: "Get the profile belonging to the authenticated technician identity",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": jsonDataResponse("Current technician self-profile", {
            $ref: "#/components/schemas/TechnicianSelfProfile"
          }),
          ...technicianProfileErrorResponses
        }
      },
      patch: {
        tags: ["Technician Profile"],
        summary: "Update editable fields on the authenticated technician profile",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TechnicianSelfProfileUpdate" }
            }
          }
        },
        responses: {
          "200": jsonDataResponse("Updated current technician self-profile", {
            $ref: "#/components/schemas/TechnicianSelfProfile"
          }),
          ...technicianProfileErrorResponses
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
        description:
          "Provide serviceId or technicianServiceId, but not both. technicianId can be used without a service filter, or can further narrow a service query. The from/to window must not exceed 93 days. Results are limited to published, unsuspended shops and available slots with remaining capacity.",
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
            description:
              "Exclusive ISO 8601 booking start timestamp; requires from; maximum window is 93 days",
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
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  insufficientBalanceConfirmation: {
                    type: "object",
                    additionalProperties: false,
                    required: ["confirmed", "idempotencyKey", "previewVersion"],
                    properties: {
                      confirmed: { type: "boolean", const: true },
                      idempotencyKey: { type: "string", minLength: 16, maxLength: 160 },
                      previewVersion: {
                        type: "string",
                        pattern: "^sha256:[a-f0-9]{64}$"
                      }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Order confirmed" },
          "409": {
            description: "Invalid state transition or platform-fee balance confirmation required",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer" },
                    message: {
                      type: "string",
                      enum: [
                        "error.order.invalid_transition",
                        "error.order.acceptance_paused",
                        "error.platform_fee.insufficient_balance_confirmation_required",
                        "error.platform_fee.preview_stale",
                        "error.platform_fee.technician_required",
                        "error.platform_fee.confirmation_conflict"
                      ]
                    },
                    data: {
                      type: ["object", "null"],
                      properties: {
                        feeAmountNdp: { type: "integer", minimum: 0 },
                        availableBalanceNdp: { type: "integer" },
                        shortfallNdp: { type: "integer", minimum: 0 },
                        payerType: { type: "string", enum: ["shop", "technician"] },
                        walletOwnerType: { type: "string", enum: ["shop", "user"] },
                        previewVersion: {
                          type: "string",
                          pattern: "^sha256:[a-f0-9]{64}$"
                        },
                        pauses: {
                          type: "array",
                          items: { $ref: "#/components/schemas/OrderAcceptancePauseSummary" }
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
    [`${config.API_PREFIX}/wallets/me/summary`]: {
      get: {
        tags: ["Ledger"],
        summary: "Current user's formal and Test NDP wallet summary",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Dual-currency wallet balance summary",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/WalletSummary" }
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
        parameters: [
          ...dashboardQueryParameters,
          {
            name: "city",
            in: "query",
            required: false,
            schema: { type: "string", minLength: 1, maxLength: 100 }
          }
        ],
        responses: {
          "200": jsonDataResponse("Operations dashboard payload", {
            $ref: "#/components/schemas/Dashboard"
          }),
          ...dashboardErrorResponses,
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
    [`${config.API_PREFIX}/backoffice/finance/ndp-summary`]: {
      get: {
        tags: ["Step 12 Backoffice"],
        summary: "Daily formal and Test NDP finance summary",
        description:
          "Uses Asia/Tokyo calendar boundaries. Test NDP is reported separately and excluded from settleableNdp.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "date",
            in: "query",
            required: false,
            schema: { type: "string", format: "date" }
          }
        ],
        responses: {
          "200": {
            description: "Paired NDP finance metrics",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code", "message", "data"],
                  properties: {
                    code: { type: "integer", enum: [0] },
                    message: { type: "string", enum: ["success"] },
                    data: { $ref: "#/components/schemas/BackofficeNdpSummary" }
                  }
                }
              }
            }
          },
          "400": { description: "Invalid calendar date" },
          "403": { description: "Missing backoffice finance permission" }
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
    [`${config.API_PREFIX}/backoffice/customers/{id}/timeline`]: {
      get: {
        tags: ["Master Data"],
        summary: "Paginated user activity timeline",
        security: [{ bearerAuth: [] }],
        parameters: [
          idPathParameter(),
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          {
            name: "pageSize",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 10 }
          }
        ],
        responses: {
          "200": jsonDataResponse("Paginated user activity", {
            $ref: "#/components/schemas/BackofficeAuditTimelinePage"
          }),
          "401": { description: "Authentication required" },
          "403": { description: "Permission denied" },
          "404": { description: "User profile not found" }
        }
      }
    },
    [`${config.API_PREFIX}/backoffice/customers/{id}/membership`]: {
      put: {
        tags: ["Master Data"],
        summary: "Assign a complimentary customer membership level and validity period",
        security: [{ bearerAuth: [] }],
        parameters: [idPathParameter()],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BackofficeCustomerMembershipGrantInput" }
            }
          }
        },
        responses: {
          "200": { description: "Membership assigned" },
          "400": { description: "Invalid membership grant" },
          "401": { description: "Authentication required" },
          "403": { description: "Permission denied" },
          "404": { description: "Customer not found" }
        }
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
        parameters: [merchantPreviewShopHeaderParameter, ...dashboardQueryParameters],
        responses: {
          "200": jsonDataResponse("Merchant dashboard payload", {
            $ref: "#/components/schemas/Dashboard"
          }),
          ...dashboardErrorResponses,
          "403": { description: "Missing merchant scope or permission" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/manageable-shops`]: {
      get: {
        tags: ["Step 12 Merchant Admin"],
        summary: "Paginated public-safe shops manageable by the authenticated merchant identity",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "page",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, default: 1 }
          },
          {
            name: "page_size",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 }
          }
        ],
        responses: {
          "200": jsonDataResponse("Paginated manageable merchant shops", {
            $ref: "#/components/schemas/ManageableMerchantShopPage"
          }),
          "400": { description: "error.validation — strict pagination validation failed" },
          "401": { description: "error.auth.token_invalid — missing or invalid access token" },
          "403": { description: "Missing merchant-admin dashboard permission or shop scope" }
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
    [`${config.API_PREFIX}/merchant-admin/employees/{needoId}/compensation-profile`]: {
      get: {
        tags: ["Finance Center"],
        summary: "Read an employee compensation rule and latest payroll summary by NeeDoID",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "needoId",
            in: "path",
            required: true,
            schema: { type: "string", pattern: "^s\\d{10}$" }
          }
        ],
        responses: {
          "200": jsonDataResponse("Employee compensation and payroll summary", {
            $ref: "#/components/schemas/EmployeeCompensationResult"
          }),
          "400": { description: "error.validation — malformed technician NeeDoID" },
          "401": { description: "error.auth.token_invalid — missing or invalid access token" },
          "403": { description: "Missing compensation read permission or shop identity" },
          "404": { description: "error.technician_affiliation.not_found" }
        }
      },
      put: {
        tags: ["Finance Center"],
        summary: "Create a versioned compensation override for a current-shop employee",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "needoId",
            in: "path",
            required: true,
            schema: { type: "string", pattern: "^s\\d{10}$" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CompensationProfileInput" }
            }
          }
        },
        responses: {
          "200": jsonDataResponse("Updated employee compensation and payroll summary", {
            $ref: "#/components/schemas/EmployeeCompensationResult"
          }),
          "400": { description: "error.validation — invalid compensation profile" },
          "401": { description: "error.auth.token_invalid — missing or invalid access token" },
          "403": { description: "Missing compensation write permission or shop identity" },
          "404": { description: "error.technician_affiliation.not_found" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/employees/{needoId}/compensation-profile/preview`]: {
      post: {
        tags: ["Finance Center"],
        summary: "Preview the effective current-shop employee compensation rule",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "needoId",
            in: "path",
            required: true,
            schema: { type: "string", pattern: "^s\\d{10}$" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
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
          "200": jsonDataResponse("Employee compensation preview", {
            $ref: "#/components/schemas/EmployeeCompensationPreviewResult"
          }),
          "400": { description: "error.validation — invalid preview input" },
          "401": { description: "error.auth.token_invalid — missing or invalid access token" },
          "403": { description: "Missing compensation preview permission or shop identity" },
          "404": { description: "error.technician_affiliation.not_found" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/payroll-schedule-policy`]: {
      get: {
        tags: ["Payroll Schedule Policy"],
        summary: "Read the authenticated shop payroll schedule policy and payment preview",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "referenceDate",
            in: "query",
            required: false,
            schema: { type: "string", format: "date" }
          }
        ],
        responses: {
          "200": jsonDataResponse("Shop payroll schedule policy", {
            $ref: "#/components/schemas/PayrollSchedulePolicyResult"
          }),
          "400": { description: "error.validation — invalid reference date" },
          "401": { description: "error.auth.token_invalid — missing or invalid access token" },
          "403": { description: "error.forbidden or error.identity.forbidden" }
        }
      },
      put: {
        tags: ["Payroll Schedule Policy"],
        summary: "Create a new version of the authenticated shop payroll schedule policy",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                required: [
                  "cadence",
                  "weeklySettlementWeekday",
                  "monthlySettlementDay",
                  "holidayAdjustment",
                  "timezone",
                  "effectiveFrom"
                ],
                properties: {
                  cadence: { type: "string", enum: ["daily", "weekly", "monthly"] },
                  weeklySettlementWeekday: {
                    type: ["integer", "null"],
                    minimum: 1,
                    maximum: 7
                  },
                  monthlySettlementDay: {
                    type: ["integer", "null"],
                    minimum: 1,
                    maximum: 31
                  },
                  holidayAdjustment: {
                    type: "string",
                    enum: ["previous_business_day", "next_business_day"]
                  },
                  timezone: { type: "string", enum: ["Asia/Tokyo"] },
                  effectiveFrom: { type: "string", format: "date" },
                  effectiveTo: { type: ["string", "null"], format: "date" }
                }
              }
            }
          }
        },
        responses: {
          "200": jsonDataResponse("Versioned shop payroll schedule policy", {
            $ref: "#/components/schemas/PayrollSchedulePolicyResult"
          }),
          "400": { description: "error.validation — invalid cadence or effective date" },
          "401": { description: "error.auth.token_invalid — missing or invalid access token" },
          "403": { description: "Missing merchant payroll write permission or shop scope" }
        }
      }
    },
    [`${config.API_PREFIX}/merchant-admin/employees/{needoId}/payroll-schedule-policy`]: {
      get: {
        tags: ["Payroll Schedule Policy"],
        summary: "Read an affiliated employee effective payroll schedule policy",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "needoId",
            in: "path",
            required: true,
            schema: { type: "string", pattern: "^s[0-9]{10}$" }
          },
          {
            name: "referenceDate",
            in: "query",
            required: false,
            schema: { type: "string", format: "date" }
          }
        ],
        responses: {
          "200": jsonDataResponse("Employee effective payroll schedule policy", {
            $ref: "#/components/schemas/PayrollSchedulePolicyResult"
          }),
          "400": { description: "error.validation — invalid technician NeeDoID" },
          "401": { description: "error.auth.token_invalid — missing or invalid access token" },
          "403": { description: "Missing merchant payroll read permission" },
          "404": { description: "error.technician_affiliation.not_found" }
        }
      },
      put: {
        tags: ["Payroll Schedule Policy"],
        summary: "Create a versioned employee payroll schedule override",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "needoId",
            in: "path",
            required: true,
            schema: { type: "string", pattern: "^s[0-9]{10}$" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                required: [
                  "inheritShopPolicy",
                  "cadence",
                  "weeklySettlementWeekday",
                  "monthlySettlementDay",
                  "holidayAdjustment",
                  "timezone",
                  "effectiveFrom"
                ],
                properties: {
                  inheritShopPolicy: { type: "boolean" },
                  cadence: {
                    type: ["string", "null"],
                    enum: ["daily", "weekly", "monthly", null]
                  },
                  weeklySettlementWeekday: {
                    type: ["integer", "null"],
                    minimum: 1,
                    maximum: 7
                  },
                  monthlySettlementDay: {
                    type: ["integer", "null"],
                    minimum: 1,
                    maximum: 31
                  },
                  holidayAdjustment: {
                    type: ["string", "null"],
                    enum: ["previous_business_day", "next_business_day", null]
                  },
                  timezone: { type: ["string", "null"], enum: ["Asia/Tokyo", null] },
                  effectiveFrom: { type: "string", format: "date" },
                  effectiveTo: { type: ["string", "null"], format: "date" }
                }
              }
            }
          }
        },
        responses: {
          "200": jsonDataResponse("Versioned employee payroll schedule override", {
            $ref: "#/components/schemas/PayrollSchedulePolicyResult"
          }),
          "400": { description: "error.validation — invalid override or technician NeeDoID" },
          "401": { description: "error.auth.token_invalid — missing or invalid access token" },
          "403": { description: "Missing merchant payroll write permission" },
          "404": { description: "error.technician_affiliation.not_found" }
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
    [`${config.API_PREFIX}/merchant-admin/customers/{id}/timeline`]: {
      get: {
        tags: ["Master Data"],
        summary: "Paginated user activity scoped to the authenticated shop",
        security: [{ bearerAuth: [] }],
        parameters: [
          idPathParameter(),
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          {
            name: "pageSize",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 10 }
          }
        ],
        responses: {
          "200": jsonDataResponse("Paginated scoped user activity", {
            $ref: "#/components/schemas/BackofficeAuditTimelinePage"
          }),
          "401": { description: "Authentication required" },
          "403": { description: "Permission denied" },
          "404": { description: "User profile not visible to current shop" }
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
    [`${config.API_PREFIX}/backoffice/affiliate/announcements`]: {
      get: announcementOperation(
        "List localized Affiliate announcements",
        "page:backoffice-affiliate-announcement",
        {
          parameters: contentHistoryParameters,
          responses: {
            "200": jsonDataResponse("Paginated Affiliate announcements", {
              $ref: "#/components/schemas/OfficialAnnouncementProtectedPage"
            })
          }
        }
      ),
      post: announcementOperation(
        "Create one localized Affiliate announcement draft",
        "button:backoffice-affiliate-announcement-edit",
        {
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OfficialAnnouncementDraftCreate" }
              }
            }
          },
          responses: {
            "201": jsonDataResponse("Affiliate announcement draft created", {
              $ref: "#/components/schemas/OfficialAnnouncementProtectedPayload"
            })
          }
        }
      )
    },
    [`${config.API_PREFIX}/backoffice/affiliate/announcements/affiliate-tasks`]: {
      get: announcementOperation(
        "Search visible AffiliateTasks for announcement metadata",
        "page:backoffice-affiliate-announcement",
        {
          parameters: [
            ...contentHistoryParameters,
            {
              in: "query",
              name: "q",
              schema: { type: "string", minLength: 1, maxLength: 160 }
            }
          ],
          responses: {
            "200": jsonDataResponse("Paginated visible AffiliateTasks", {
              $ref: "#/components/schemas/OfficialAnnouncementAffiliateTaskSearchPage"
            })
          }
        }
      )
    },
    [`${config.API_PREFIX}/backoffice/affiliate/announcements/{publicId}/history`]: {
      get: announcementOperation(
        "List immutable Affiliate announcement release history",
        "page:backoffice-affiliate-announcement",
        {
          parameters: [announcementPublicIdParameter, ...contentHistoryParameters],
          responses: {
            "200": jsonDataResponse("Paginated announcement history", {
              $ref: "#/components/schemas/OfficialAnnouncementProtectedPage"
            })
          }
        }
      )
    },
    [`${config.API_PREFIX}/backoffice/affiliate/announcements/{publicId}/releases/{releaseId}`]: {
      get: announcementOperation(
        "Read one protected Affiliate announcement release",
        "page:backoffice-affiliate-announcement",
        {
          parameters: [announcementPublicIdParameter, announcementReleaseIdParameter],
          responses: {
            "200": jsonDataResponse("Protected announcement release", {
              $ref: "#/components/schemas/OfficialAnnouncementProtectedPayload"
            })
          }
        }
      ),
      patch: announcementOperation(
        "Edit exactly one locale of a draft release",
        "button:backoffice-affiliate-announcement-edit",
        {
          parameters: [announcementPublicIdParameter, announcementReleaseIdParameter],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OfficialAnnouncementDraftMutation" }
              }
            }
          },
          responses: {
            "200": jsonDataResponse("Draft locale updated", {
              $ref: "#/components/schemas/OfficialAnnouncementProtectedPayload"
            })
          }
        }
      )
    },
    [`${config.API_PREFIX}/backoffice/affiliate/announcements/{publicId}/releases/{releaseId}/preview`]:
      {
        get: announcementOperation(
          "Preview all five protected translations and redacted task action",
          "page:backoffice-affiliate-announcement",
          {
            parameters: [announcementPublicIdParameter, announcementReleaseIdParameter],
            responses: {
              "200": jsonDataResponse("Protected announcement preview", {
                $ref: "#/components/schemas/OfficialAnnouncementProtectedPayload"
              })
            }
          }
        )
      },
    [`${config.API_PREFIX}/backoffice/affiliate/announcements/{publicId}/releases/{releaseId}/publish`]:
      {
        post: announcementOperation(
          "Publish a complete draft immediately",
          "button:backoffice-affiliate-announcement-publish",
          {
            parameters: [announcementPublicIdParameter, announcementReleaseIdParameter],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ContentPublishCommand" }
                }
              }
            },
            responses: {
              "200": jsonDataResponse("Announcement published", {
                $ref: "#/components/schemas/OfficialAnnouncementProtectedPayload"
              })
            }
          }
        )
      },
    [`${config.API_PREFIX}/backoffice/affiliate/announcements/{publicId}/releases/{releaseId}/schedule`]:
      {
        post: announcementOperation(
          "Schedule a complete draft for future UTC publication",
          "button:backoffice-affiliate-announcement-publish",
          {
            parameters: [announcementPublicIdParameter, announcementReleaseIdParameter],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ContentScheduleCommand" }
                }
              }
            },
            responses: {
              "200": jsonDataResponse("Announcement scheduled", {
                $ref: "#/components/schemas/OfficialAnnouncementProtectedPayload"
              })
            }
          }
        )
      },
    [`${config.API_PREFIX}/backoffice/affiliate/announcements/{publicId}/releases/{releaseId}/disable`]:
      {
        post: announcementOperation(
          "Disable a published or scheduled announcement release",
          "button:backoffice-affiliate-announcement-publish",
          {
            parameters: [announcementPublicIdParameter, announcementReleaseIdParameter],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ContentDisableCommand" }
                }
              }
            },
            responses: {
              "200": jsonDataResponse("Announcement disabled", {
                $ref: "#/components/schemas/OfficialAnnouncementProtectedPayload"
              })
            }
          }
        )
      },
    [`${config.API_PREFIX}/backoffice/affiliate/announcements/{publicId}/releases/{releaseId}/rollback`]:
      {
        post: announcementOperation(
          "Clone an immutable historical release into a new rollback draft",
          "button:backoffice-affiliate-announcement-publish",
          {
            parameters: [announcementPublicIdParameter, announcementReleaseIdParameter],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ContentRollbackCommand" }
                }
              }
            },
            responses: {
              "200": jsonDataResponse("Rollback draft cloned", {
                $ref: "#/components/schemas/OfficialAnnouncementProtectedPayload"
              })
            }
          }
        )
      },
    [`${config.API_PREFIX}/affiliate/announcements/{publicId}`]: {
      get: announcementOperation(
        "Read the active localized announcement through Affiliate marketplace visibility",
        "page:affiliate-marketplace",
        {
          description:
            "Requires page:affiliate-marketplace and an active Affiliate identity (current identity type scout).",
          parameters: [
            announcementPublicIdParameter,
            {
              name: "locale",
              in: "query",
              required: true,
              schema: { type: "string", enum: ["zh-CN", "zh-TW", "en", "ja", "ko"] }
            }
          ],
          responses: {
            "200": jsonDataResponse("One-locale Affiliate announcement", {
              $ref: "#/components/schemas/OfficialAnnouncementPublicPayload"
            }),
            "403": {
              description:
                "error.forbidden — missing page:affiliate-marketplace; error.affiliate_profile.identity_required — active Affiliate identity (current identity type scout) required"
            }
          }
        }
      )
    },
    [`${config.API_PREFIX}/backoffice/content/media`]: {
      post: {
        tags: ["Content Publication"],
        summary: "Upload immutable public publication media",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "alt_text",
            in: "query",
            required: false,
            schema: { type: "string", minLength: 1, maxLength: 255 }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "image/jpeg": { schema: { type: "string", format: "binary", maxLength: 8388608 } },
            "image/png": { schema: { type: "string", format: "binary", maxLength: 8388608 } },
            "image/webp": { schema: { type: "string", format: "binary", maxLength: 8388608 } }
          }
        },
        responses: {
          "201": jsonDataResponse("Public content media created", {
            type: "object",
            additionalProperties: false,
            required: [
              "publicId",
              "mediaAssetId",
              "url",
              "mimeType",
              "width",
              "height",
              "checksumSha256"
            ],
            properties: {
              publicId: { type: "string", pattern: "^[a-f0-9]{64}$" },
              mediaAssetId: { type: "integer", minimum: 1 },
              url: {
                type: "string",
                pattern: "^/media/content/[a-f0-9]{64}\\.(jpg|png|webp)$"
              },
              mimeType: { type: "string", enum: ["image/jpeg", "image/png", "image/webp"] },
              width: { type: "null" },
              height: { type: "null" },
              checksumSha256: { type: "string", pattern: "^[a-f0-9]{64}$" }
            }
          }),
          "400": { description: "error.content.media_invalid — invalid query or media bytes" },
          "401": { description: "error.auth.token_invalid — missing or invalid access token" },
          "403": { description: "error.forbidden — missing content media upload permission" },
          "409": {
            description: "error.content.lock_conflict — checksum lock acquisition timed out"
          },
          "413": { description: "error.content.media_too_large — upload exceeds 8 MiB" },
          "415": { description: "error.content.media_invalid — unsupported media or encoding" }
        }
      }
    },
    [`${config.API_PREFIX}/social/media`]: {
      post: {
        tags: ["Realtime"],
        summary: "Upload an authenticated Social post image",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "fileName",
            in: "query",
            required: true,
            schema: { type: "string", minLength: 1, maxLength: 255 }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "image/jpeg": { schema: { type: "string", format: "binary", maxLength: 8388608 } },
            "image/png": { schema: { type: "string", format: "binary", maxLength: 8388608 } },
            "image/webp": { schema: { type: "string", format: "binary", maxLength: 8388608 } }
          }
        },
        responses: {
          "201": jsonDataResponse("Social media uploaded", {
            type: "object",
            additionalProperties: false,
            required: ["publicId", "url", "mimeType", "fileSize"],
            properties: {
              publicId: { type: "string", pattern: "^[a-f0-9]{64}$" },
              url: {
                type: "string",
                pattern: "^/media/content/[a-f0-9]{64}\\.(jpg|png|webp)$"
              },
              mimeType: { type: "string", enum: ["image/jpeg", "image/png", "image/webp"] },
              fileSize: { type: "integer", minimum: 1, maximum: 8388608 }
            }
          }),
          "400": { description: "error.social.media_invalid — invalid filename or media bytes" },
          "401": { description: "error.auth.token_invalid — missing or invalid access token" },
          "403": { description: "error.forbidden — missing social-post:create permission" },
          "413": { description: "error.social.media_too_large — upload exceeds 8 MiB" },
          "415": { description: "error.social.media_invalid — unsupported media or encoding" }
        }
      }
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
    [`${config.API_PREFIX}/im/conversations/{targetConversationId}/chat-records`]: {
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Create an immutable chat-record delivery",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "targetConversationId", in: "path", required: true, schema: { type: "integer", minimum: 1, maximum: safeIntegerMaximum } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ImChatRecordCommand" } } }
        },
        responses: {
          "201": jsonDataResponse("Created or exactly replayed chat-record delivery", { $ref: "#/components/schemas/ImChatRecordDeliveryResult" }),
          "400": { description: "Strict validation failed" },
          "401": { description: "Missing or invalid Bearer access token" },
          "403": { description: "Missing message:forward permission" },
          "404": { description: "Target conversation not found for the active identity" },
          "409": { description: "Source unavailable or idempotency key reused with changed payload" }
        }
      }
    },
    [`${config.API_PREFIX}/im/chat-records/{publicId}`]: {
      get: {
        tags: ["Step 13 Realtime"],
        summary: "Read an authorized chat-record summary",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "publicId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": jsonDataResponse("Authorized chat-record summary", { $ref: "#/components/schemas/ImChatRecordSummary" }),
          "400": { description: "Invalid chat-record public UUID" },
          "401": { description: "Missing or invalid Bearer access token" },
          "403": { description: "Missing message:list permission" },
          "404": { description: "Bundle missing or unavailable to the active identity" }
        }
      }
    },
    [`${config.API_PREFIX}/im/chat-records/{publicId}/items`]: {
      get: {
        tags: ["Step 13 Realtime"],
        summary: "Cursor-paginated immutable chat-record items",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "publicId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "beforePosition", in: "query", schema: { type: "integer", minimum: 1, maximum: safeIntegerMaximum } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 50 } }
        ],
        responses: {
          "200": jsonDataResponse("Authorized chat-record item page", { $ref: "#/components/schemas/ImChatRecordItemPage" }),
          "400": { description: "Invalid chat-record public UUID, cursor, or page size" },
          "401": { description: "Missing or invalid Bearer access token" },
          "403": { description: "Missing message:list permission" },
          "404": { description: "Bundle missing or unavailable to the active identity" }
        }
      }
    },
    [`${config.API_PREFIX}/im/chat-records/{publicId}/media/{checksumSha256}`]: {
      get: {
        tags: ["Step 13 Realtime"],
        summary: "Stream one authorized immutable chat-record media snapshot",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "publicId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "checksumSha256", in: "path", required: true, schema: { type: "string", pattern: "^[a-f0-9]{64}$" } }
        ],
        responses: {
          "200": {
            description: "Authorized snapshot bytes",
            headers: {
              ETag: { schema: { type: "string" } },
              "Content-Length": { schema: { type: "integer", minimum: 0 } },
              "Cache-Control": { schema: { type: "string", enum: ["private, max-age=31536000, immutable"] } }
            },
            content: {
              "image/jpeg": { schema: { type: "string", format: "binary" } },
              "image/png": { schema: { type: "string", format: "binary" } },
              "image/webp": { schema: { type: "string", format: "binary" } },
              "audio/webm": { schema: { type: "string", format: "binary" } },
              "audio/mp4": { schema: { type: "string", format: "binary" } },
              "audio/ogg": { schema: { type: "string", format: "binary" } },
              "video/mp4": { schema: { type: "string", format: "binary" } },
              "video/webm": { schema: { type: "string", format: "binary" } },
              "application/pdf": { schema: { type: "string", format: "binary" } }
            }
          },
          "400": { description: "Invalid chat-record public UUID or SHA-256 checksum" },
          "401": { description: "Missing or invalid Bearer access token" },
          "403": { description: "Missing message:list permission" },
          "404": { description: "Media missing or unavailable to the active identity" }
        }
      }
    },
    [`${config.API_PREFIX}/im/chat-record-favorites`]: {
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Create an immutable chat-record favorite",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ImChatRecordCommand" } } }
        },
        responses: {
          "201": jsonDataResponse("Created or exactly replayed chat-record favorite", { $ref: "#/components/schemas/ImChatRecordFavoriteMutationResult" }),
          "400": { description: "Strict validation failed" },
          "401": { description: "Missing or invalid Bearer access token" },
          "403": { description: "Missing message:favorite permission" },
          "409": { description: "Source unavailable or idempotency key reused with changed payload" }
        }
      },
      get: {
        tags: ["Step 13 Realtime"],
        summary: "Paginated favorites for the active identity",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, maximum: safeIntegerMaximum } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: {
          "200": jsonDataResponse("Active identity favorite page", { $ref: "#/components/schemas/ImChatRecordFavoritePage" }),
          "400": { description: "Invalid pagination" },
          "401": { description: "Missing or invalid Bearer access token" },
          "403": { description: "Missing message:favorite permission" }
        }
      }
    },
    [`${config.API_PREFIX}/im/chat-record-favorites/{favoriteId}`]: {
      delete: {
        tags: ["Step 13 Realtime"],
        summary: "Remove one favorite owned by the active identity",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "favoriteId", in: "path", required: true, schema: { type: "integer", minimum: 1, maximum: safeIntegerMaximum } }],
        responses: {
          "200": jsonDataResponse("Favorite removed", { $ref: "#/components/schemas/ImChatRecordFavoriteDeleteResult" }),
          "400": { description: "Invalid favorite ID" },
          "401": { description: "Missing or invalid Bearer access token" },
          "403": { description: "Missing message:favorite permission" },
          "404": { description: "Favorite missing or owned by another identity" }
        }
      }
    },
    [`${config.API_PREFIX}/im/conversations/{conversationId}/messages/delete-for-me`]: {
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Atomically delete up to 100 messages for the active identity",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "conversationId", in: "path", required: true, schema: { type: "integer", minimum: 1, maximum: safeIntegerMaximum } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ImBatchDeleteRequest" } } }
        },
        responses: {
          "200": jsonDataResponse("Atomic deletion result or exact replay", { $ref: "#/components/schemas/ImBatchDeleteResult" }),
          "400": { description: "Strict validation failed" },
          "401": { description: "Missing or invalid Bearer access token" },
          "403": { description: "Missing message:list permission" },
          "404": { description: "Conversation or any requested message unavailable" },
          "409": { description: "Idempotency key reused with changed payload" }
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
                  },
                  privacyModeEnabled: { type: "boolean" },
                  hideMemberProfiles: { type: "boolean" },
                  disappearingTtlSeconds: {
                    type: ["integer", "null"],
                    minimum: IM_PRIVACY_TTL_MIN_SECONDS,
                    maximum: IM_PRIVACY_TTL_MAX_SECONDS
                  },
                  disappearingStartMode: {
                    type: "string",
                    enum: ["sent", "read_by_all"]
                  }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Created conversation" },
          "403": { description: "error.im.not_friends for unauthorized direct conversations" }
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
        summary: "Update the current participant's conversation preferences",
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
                  isMuted: { type: "boolean" },
                  autoTranslateMessages: { type: "boolean", default: false }
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
    [`${config.API_PREFIX}/im/conversations/{conversationId}/privacy`]: {
      patch: {
        tags: ["Step 13 Realtime"],
        summary: "Update group privacy as the current group owner",
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
                required: ["privacyModeEnabled"],
                properties: {
                  privacyModeEnabled: { type: "boolean" },
                  hideMemberProfiles: { type: "boolean" },
                  disappearingTtlSeconds: {
                    type: ["integer", "null"],
                    minimum: IM_PRIVACY_TTL_MIN_SECONDS,
                    maximum: IM_PRIVACY_TTL_MAX_SECONDS
                  },
                  disappearingStartMode: {
                    type: "string",
                    enum: ["sent", "read_by_all"]
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Updated group privacy settings" },
          "404": { description: "Group not found or current account is not the owner" }
        }
      }
    },
    [`${config.API_PREFIX}/im/conversations/{conversationId}/leave`]: {
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Leave a group; owners must explicitly transfer ownership first",
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
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  transferOwnerUserId: { type: "integer", minimum: 1 }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description:
              "Current participant left; groups with fewer than two remaining members are dissolved"
          },
          "400": { description: "Owner transfer is required or the selected successor is invalid" },
          "404": { description: "Group not found for current participant" }
        }
      }
    },
    [`${config.API_PREFIX}/im/conversations/{conversationId}/dissolve`]: {
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Dissolve a group as its current owner",
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
          "200": { description: "Group dissolved and removed for every participant" },
          "404": { description: "Group not found or current account is not the owner" }
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
          "201": { description: "Created message" },
          "403": { description: "error.im.not_friends or blocked recipient" }
        }
      },
      delete: {
        tags: ["Step 13 Realtime"],
        summary: "Permanently clear message history for the current participant only",
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
          "200": { description: "Current participant history cleared through the latest message" },
          "404": { description: "Conversation not found for current participant" }
        }
      }
    },
    [`${config.API_PREFIX}/im/conversations/{conversationId}/media`]: {
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Upload one validated image for an IM conversation",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "conversationId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 }
          },
          {
            name: "fileName",
            in: "query",
            required: true,
            schema: { type: "string", minLength: 1, maxLength: 255 }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "image/jpeg": { schema: { type: "string", format: "binary" } },
            "image/png": { schema: { type: "string", format: "binary" } },
            "image/webp": { schema: { type: "string", format: "binary" } }
          }
        },
        responses: {
          "201": {
            description: "Uploaded image metadata",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RealtimeUploadedImage" }
              }
            }
          },
          "400": { description: "Invalid image bytes or request" },
          "404": { description: "Conversation not found for current participant" },
          "413": { description: "Image exceeds 8 MiB" },
          "415": { description: "Unsupported image media type" }
        }
      }
    },
    [`${config.API_PREFIX}/im/conversations/{conversationId}/voice`]: {
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Send one validated raw-audio IM voice message",
        description:
          "Requires Bearer authentication and message:create. Accepts at most 8 MiB of pure audio. The server-probed duration is authoritative: media must contain audio, contain no video track, and be no longer than 59.5 seconds. Parser failures and unverifiable media fail closed. The response uses the existing RealtimeMessage contract.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "conversationId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 }
          },
          {
            name: "fileName",
            in: "query",
            required: true,
            schema: { type: "string", minLength: 1, maxLength: 255 }
          },
          {
            name: "durationSeconds",
            in: "query",
            required: true,
            description:
              "Integer client hint from 1 to 59 seconds. The server parses the media and accepts only when its authoritative rounded duration differs by at most one second.",
            schema: { type: "integer", minimum: 1, maximum: 59 }
          }
        ],
        requestBody: {
          required: true,
          description: "Raw audio body, maximum 8 MiB",
          content: {
            "audio/webm": { schema: { type: "string", format: "binary" } },
            "audio/mp4": { schema: { type: "string", format: "binary" } },
            "audio/ogg": { schema: { type: "string", format: "binary" } }
          }
        },
        responses: {
          "201": jsonDataResponse("Created voice message", {
            $ref: "#/components/schemas/RealtimeMessage"
          }),
          "400": {
            description:
              "Invalid path or query, parser failure, unverifiable media, video-bearing media, over-limit authoritative duration, or client hint mismatch"
          },
          "401": { description: "Missing or invalid Bearer access token" },
          "403": { description: "Missing message:create permission or send access" },
          "404": { description: "Conversation not found for current participant" },
          "413": { description: "Audio exceeds 8 MiB" },
          "415": { description: "Unsupported audio media type" }
        }
      }
    },
    [`${config.API_PREFIX}/im/conversations/{conversationId}/messages/translations`]: {
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Translate visible authoritative IM message text and captions",
        description:
          "Requires message:translate. The server loads every source by message ID under the active identity visibility boundary; client-supplied raw text is rejected. If any requested message is unavailable, the whole batch is rejected. Only user text and image/video captions are eligible.",
        security: [{ bearerAuth: [] }],
        "x-permission": "message:translate",
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
              schema: { $ref: "#/components/schemas/ImMessageTranslationRequest" }
            }
          }
        },
        responses: {
          "200": jsonDataResponse("Ordered translation results", {
            type: "array",
            minItems: 1,
            maxItems: 50,
            items: { $ref: "#/components/schemas/ImMessageTranslationItem" }
          }),
          "400": jsonErrorResponse("error.validation or error.im.translation_request_too_large"),
          "401": jsonErrorResponse("error.auth.token_invalid — authentication required"),
          "403": jsonErrorResponse("error.forbidden or error.auth.identity_not_found"),
          "404": jsonErrorResponse("error.im.translation_message_not_found — batch rejected"),
          "409": jsonErrorResponse(
            "error.im.translation_cache_conflict — cache reservation changed concurrently"
          ),
          "429": jsonErrorResponse("error.im.translation_rate_limited — provider throttled"),
          "456": jsonErrorResponse(
            "error.im.translation_quota_exceeded — provider quota exhausted"
          ),
          "503": jsonErrorResponse(
            "error.im.translation_timeout, error.im.translation_provider_unavailable, or error.im.translation_provider_invalid_response"
          )
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
    [`${config.API_PREFIX}/im/conversations/{conversationId}/messages/{messageId}`]: {
      delete: {
        tags: ["Step 13 Realtime"],
        summary: "Delete one IM message only from the current user's history",
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
        responses: {
          "200": {
            description: "Viewer-scoped message deletion persisted",
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
                      required: ["conversationId", "messageId", "deleted"],
                      properties: {
                        conversationId: { type: "integer" },
                        messageId: { type: "integer" },
                        deleted: { type: "boolean", enum: [true] }
                      }
                    }
                  }
                }
              }
            }
          },
          "403": { description: "Missing message:list permission" },
          "404": { description: "Conversation or message not found for current participant" }
        }
      }
    },
    [`${config.API_PREFIX}/im/conversations/{conversationId}/messages/{messageId}/reactions`]: {
      put: {
        tags: ["Step 13 Realtime"],
        summary: "Set the current user's reaction in its IM reply category",
        description:
          "Each user may keep one judgement and one emoji on a message. Judgement values are OK, NO, Pending, +1, Done, Cool, Good, Thanks. Repeating the currently selected value is idempotent; choose DELETE before setting a different value in the same category.",
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
          "200": { description: "Authoritative message; may be an idempotent unchanged result" },
          "400": { description: "Invalid path or reaction payload" },
          "401": { description: "Authentication required" },
          "403": { description: "Missing message:list permission" },
          "404": { description: "Conversation or message not found" },
          "409": {
            description:
              "error.im.reaction_slot_occupied: another value already occupies this reply category"
          }
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
          "400": { description: "Invalid path or reaction payload" },
          "401": { description: "Authentication required" },
          "403": { description: "Missing message:list permission" },
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
    [`${config.API_PREFIX}/im/directory`]: {
      get: {
        tags: ["Step 13 Realtime"],
        summary: "Fuzzy-search active non-contact accounts by display name or immutable NeeDoID",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "query",
            in: "query",
            required: true,
            schema: { type: "string", minLength: 1, maxLength: 100 }
          },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: {
          "200": { description: "Paginated safe account directory results" }
        }
      }
    },
    [`${config.API_PREFIX}/im/directory/{userId}`]: {
      get: {
        tags: ["Step 13 Realtime"],
        summary: "Get a safe account profile and verified friendship state",
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
            description: "Safe directory profile",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RealtimeDirectoryProfile" }
              }
            }
          },
          "404": { description: "Target user not found" }
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
    [`${config.API_PREFIX}/im/contacts/{contactId}`]: {
      delete: {
        tags: ["Step 13 Realtime"],
        summary: "Hard-delete the bilateral friendship and the deleter's conversation entry",
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
          "200": {
            description: "Bilateral friendship hard-deleted",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DeleteFriendshipResult" }
              }
            }
          },
          "403": { description: "Missing contact:delete permission" },
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
            schema: {
              type: "string",
              enum: ["pending", "accepted", "rejected", "expired"]
            }
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
          "200": {
            description: "Created or unchanged active friend request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/FriendRequestCreateResult" }
              }
            }
          },
          "400": { description: "Self request or already friends" },
          "404": { description: "Target user not found" }
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
          "200": { description: "Accepted friend request" },
          "404": { description: "Request not found or not owned by current recipient" },
          "409": { description: "Friend request expired" }
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
          "200": { description: "Rejected friend request" },
          "404": { description: "Request not found or not owned by current recipient" },
          "409": { description: "Friend request expired" }
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
          { name: "replyToPostId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "bookmarked", in: "query", schema: { type: "boolean" } },
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
                additionalProperties: false,
                required: ["content"],
                anyOf: [
                  {
                    required: ["content"],
                    properties: { content: { type: "string", minLength: 1 } }
                  },
                  {
                    required: ["media"],
                    properties: {
                      media: {
                        type: "object",
                        required: ["items"],
                        properties: {
                          items: { type: "array", minItems: 1 }
                        }
                      }
                    }
                  }
                ],
                properties: {
                  content: {
                    type: "string",
                    maxLength: 5000,
                    description:
                      "Trimmed content; may be empty only when at least one image is attached"
                  },
                  media: {
                    type: "object",
                    additionalProperties: false,
                    required: ["items"],
                    properties: {
                      items: {
                        type: "array",
                        maxItems: 9,
                        items: {
                          type: "object",
                          additionalProperties: false,
                          required: ["id", "type", "mediaAssetPublicId"],
                          properties: {
                            id: { type: "string", minLength: 1, maxLength: 120 },
                            type: { type: "string", enum: ["image"] },
                            mediaAssetPublicId: {
                              type: "string",
                              pattern: "^[a-f0-9]{64}$"
                            },
                            alt: { type: "string", maxLength: 255 }
                          }
                        }
                      },
                      quotePostId: { type: "integer", minimum: 1 },
                      replyToPostId: { type: "integer", minimum: 1 },
                      repostPostId: { type: "integer", minimum: 1 },
                      postType: {
                        type: "string",
                        enum: [
                          "post",
                          "reply",
                          "quote",
                          "repost",
                          "announcement",
                          "technician-daily"
                        ]
                      },
                      locationLabel: { type: "string", maxLength: 160 },
                      richText: socialRichTextOpenApiSchema
                    }
                  },
                  mentionUserIds: {
                    type: "array",
                    maxItems: 50,
                    uniqueItems: true,
                    items: { type: "integer", minimum: 1 },
                    default: []
                  },
                  visibility: { type: "string", enum: ["public", "followers"], default: "public" }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Created social post and persisted contact reminders" },
          "400": { description: "Strict Social post request validation failed" },
          "401": { description: "Missing or invalid access token" },
          "403": { description: "Missing social-post:create permission" },
          "409": {
            description:
              "error.social.invalid_mention_contact or error.social.media_not_owned — contact or media ownership changed"
          }
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
      },
      patch: {
        tags: ["Step 13 Realtime"],
        summary: "Update the authenticated author's published social post",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        requestBody: socialPostWriteRequestBody,
        responses: {
          "200": { description: "Updated social post and persisted newly added contact reminders" },
          "400": { description: "Strict Social post request validation failed" },
          "401": { description: "Missing or invalid access token" },
          "403": { description: "Missing social-post:create permission" },
          "404": { description: "Post is missing or is not owned by the current user" },
          "409": {
            description:
              "error.social.invalid_mention_contact or error.social.media_not_owned — contact or media ownership changed"
          }
        }
      }
    },
    [`${config.API_PREFIX}/social/posts/{id}/like`]: {
      put: {
        tags: ["Step 13 Realtime"],
        summary: "Like one visible social post",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Authoritative post counters and viewer interaction state" },
          "403": { description: "Missing social-post:interact permission" },
          "404": { description: "Post is missing or not visible" }
        }
      },
      delete: {
        tags: ["Step 13 Realtime"],
        summary: "Remove the current identity's like",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Authoritative post counters and viewer interaction state" },
          "403": { description: "Missing social-post:interact permission" },
          "404": { description: "Post is missing or not visible" }
        }
      }
    },
    [`${config.API_PREFIX}/social/posts/{id}/bookmark`]: {
      put: {
        tags: ["Step 13 Realtime"],
        summary: "Bookmark one visible social post",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Authoritative post counters and viewer interaction state" },
          "403": { description: "Missing social-post:interact permission" },
          "404": { description: "Post is missing or not visible" }
        }
      },
      delete: {
        tags: ["Step 13 Realtime"],
        summary: "Remove one bookmark for the current identity",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Authoritative post counters and viewer interaction state" },
          "403": { description: "Missing social-post:interact permission" },
          "404": { description: "Post is missing or not visible" }
        }
      }
    },
    [`${config.API_PREFIX}/social/posts/{id}/view`]: {
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Record one unique authenticated viewer",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          "200": { description: "Idempotent authoritative view count" },
          "403": { description: "Missing social-post:interact permission" },
          "404": { description: "Post is missing or not visible" }
        }
      }
    },
    [`${config.API_PREFIX}/social/posts/{id}/shares`]: {
      post: {
        tags: ["Step 13 Realtime"],
        summary: "Forward a visible social post to active bilateral friends",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
          { name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 8, maxLength: 191 } }
        ],
        requestBody: authJsonBody(
          {
            targetUserIds: {
              type: "array",
              minItems: 1,
              maxItems: 20,
              uniqueItems: true,
              items: { type: "integer", minimum: 1 }
            }
          },
          ["targetUserIds"]
        ),
        responses: {
          "200": { description: "Delivered friend user ids and authoritative post counters" },
          "400": { description: "Invalid targets or Idempotency-Key" },
          "403": { description: "Missing social-post:interact or message:create permission" },
          "404": { description: "Post is missing or not visible" },
          "409": { description: "Target is no longer a friend or cannot view the post" }
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
