import request from "supertest";
import { createApp } from "../src/app";
import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";

describe("GET /api/v1/openapi.json", () => {
  it("uses a root server when versioned paths already include the API prefix", () => {
    const document = createOpenApiDocument(env) as unknown as {
      servers: Array<{ url: string }>;
      paths: Record<string, unknown>;
    };
    const loginPath = "/api/v1/auth/login";

    expect(document.servers).toEqual([{ url: "/" }]);
    expect(document.paths).toHaveProperty(loginPath);
    expect(`${document.servers[0].url.replace(/\/$/, "")}${loginPath}`).toBe(loginPath);
  });

  it("describes the health endpoint with the versioned API prefix", async () => {
    const response = await request(createApp()).get("/api/v1/openapi.json").expect(200);

    expect(response.body.openapi).toBe("3.1.0");
    expect(response.body.paths).toHaveProperty("/api/v1/health");
    expect(response.body.paths).toHaveProperty("/api/v1/ready");
    expect(response.body.paths).toHaveProperty("/api/v1/metrics");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/login");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/register");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/register/verify");
    expect(response.body.paths).not.toHaveProperty("/api/v1/auth/test-login");
    expect(response.body.paths).not.toHaveProperty("/api/v1/auth/otp/send");
    expect(response.body.paths).not.toHaveProperty("/api/v1/auth/otp/verify");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/google/init");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/google");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/google/verify");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/google/link");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/google/link/init");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/google/link/verify");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/google/unlink");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/google/unlink/verify");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/password/setup");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/password/setup/verify");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/refresh");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/merchant-shop/switch");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/logout");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/me");
    [
      "/api/v1/social/posts/{id}/like",
      "/api/v1/social/posts/{id}/bookmark",
      "/api/v1/social/posts/{id}/view",
      "/api/v1/social/posts/{id}/shares"
    ].forEach((path) => expect(response.body.paths).toHaveProperty(path));
    expect(response.body.components.schemas.SocialPost.required).toEqual(
      expect.arrayContaining(["counters", "viewerInteraction"])
    );
    expect(response.body.paths["/api/v1/social/posts"].get.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "bookmarked", in: "query" })])
    );
    expect(response.body.paths["/api/v1/social/posts/{id}/shares"].post.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Idempotency-Key", in: "header", required: true })
      ])
    );

    const strictAuthBodies = [
      ["/api/v1/auth/register", ["email", "password"]],
      ["/api/v1/auth/register/verify", ["challengeId", "otp"]],
      ["/api/v1/auth/login", ["loginIdentifier", "password"]],
      ["/api/v1/auth/google/init", []],
      ["/api/v1/auth/google", ["credential", "nonceChallengeId"]],
      ["/api/v1/auth/google/verify", ["challengeId", "otp"]],
      ["/api/v1/auth/google/link/init", []],
      ["/api/v1/auth/google/link", ["credential", "nonceChallengeId"]],
      ["/api/v1/auth/google/link/verify", ["challengeId", "otp"]],
      ["/api/v1/auth/google/unlink", []],
      ["/api/v1/auth/google/unlink/verify", ["challengeId", "otp"]],
      ["/api/v1/auth/password/setup", ["password"]],
      ["/api/v1/auth/password/setup/verify", ["challengeId", "otp"]],
      ["/api/v1/auth/merchant-shop/switch", ["refreshToken", "shopPublicId"]]
    ] as const;
    for (const [path, required] of strictAuthBodies) {
      const schema = response.body.paths[path].post.requestBody.content["application/json"].schema;
      expect(schema.additionalProperties).toBe(false);
      expect(schema.required ?? []).toEqual(required);
      expect(schema.properties).not.toHaveProperty("userId");
    }

    expect(response.body.paths["/api/v1/auth/merchant-shop/switch"].post).toMatchObject({
      security: [{ bearerAuth: [] }],
      responses: {
        "400": { description: expect.stringContaining("error.validation") },
        "401": { description: expect.stringContaining("error.auth") },
        "403": { description: expect.stringContaining("error.identity.forbidden") }
      }
    });

    const protectedAuthPaths = [
      "/api/v1/auth/google/link",
      "/api/v1/auth/google/link/init",
      "/api/v1/auth/google/link/verify",
      "/api/v1/auth/google/unlink",
      "/api/v1/auth/google/unlink/verify",
      "/api/v1/auth/password/setup",
      "/api/v1/auth/password/setup/verify"
    ];
    for (const path of protectedAuthPaths) {
      const method = response.body.paths[path].get ?? response.body.paths[path].post;
      expect(method.security).toEqual([{ bearerAuth: [] }]);
      expect(method.responses).toEqual(
        expect.objectContaining({
          "400": expect.objectContaining({
            description: expect.stringContaining("error.validation")
          }),
          "401": expect.objectContaining({ description: expect.stringContaining("error.auth") }),
          "403": expect.objectContaining({
            description: expect.stringContaining("error.forbidden")
          }),
          "409": expect.objectContaining({
            description: expect.stringContaining("error.auth.google_conflict")
          }),
          "429": expect.objectContaining({
            description: expect.stringContaining("error.rate_limited")
          }),
          "502": expect.objectContaining({
            description: expect.stringContaining("error.auth.otp_delivery_failed")
          }),
          "503": expect.objectContaining({
            description: expect.stringContaining("error.dependency")
          })
        })
      );
    }

    expect(response.body.components.schemas).toEqual(
      expect.objectContaining({
        AuthChallengeMetadata: expect.any(Object),
        GoogleAuthInitialization: expect.any(Object),
        GoogleCredentialResult: expect.any(Object),
        GoogleLinkStatus: expect.any(Object),
        TokenPairWithNeedoId: expect.any(Object)
      })
    );
    expect(response.body.components.schemas.AuthMe.required).toEqual(
      expect.arrayContaining([
        "needoId",
        "primaryPublicId",
        "activeIdentityId",
        "activePublicId",
        "emailVerifiedAt",
        "hasPassword",
        "identityAvailability"
      ])
    );
    expect(response.body.components.schemas.AuthIdentity.required).toContain("publicId");
    expect(response.body.components.schemas.AuthMe.properties.needoId.pattern).toBe(
      "^(?:u|needo)[0-9]{10}$"
    );
    expect(response.body.components.schemas.AuthMe.properties.identityAvailability).toMatchObject({
      type: "array",
      items: { $ref: "#/components/schemas/AuthIdentityAvailability" }
    });
    const authResponseContracts = protectedAuthPaths
      .concat([
        "/api/v1/auth/register",
        "/api/v1/auth/register/verify",
        "/api/v1/auth/login",
        "/api/v1/auth/google/init",
        "/api/v1/auth/google",
        "/api/v1/auth/google/verify"
      ])
      .map((path) => {
        const method = response.body.paths[path].get ?? response.body.paths[path].post;
        return method.responses;
      });
    const serializedAuthResponses = JSON.stringify(authResponseContracts);
    expect(serializedAuthResponses).not.toMatch(
      /"(?:providerSubject|rawGoogleCredential|credential|otp|password|passwordHash|tokenJti|jti)"/
    );
    [
      "/api/v1/identity-applications/mine",
      "/api/v1/merchants/search",
      "/api/v1/identity-applications/technician",
      "/api/v1/identity-applications/{id}/technician-profile",
      "/api/v1/identity-applications/merchant",
      "/api/v1/identity-applications/{id}/merchant-showcase",
      "/api/v1/identity-applications/{id}/merchant-bank-account",
      "/api/v1/identity-applications/{id}/merchant-contract-acceptance",
      "/api/v1/identity-applications/{id}/media",
      "/api/v1/identity-applications/{id}/media/{mediaId}",
      "/api/v1/backoffice/content/media",
      "/api/v1/social/media",
      "/api/v1/identity-applications/{id}/submit",
      "/api/v1/identity-applications/{id}/withdraw",
      "/api/v1/contracts/affiliate/current",
      "/api/v1/contracts/merchant/current",
      "/api/v1/contracts/acceptances/{receiptId}/receipt",
      "/api/v1/identity-activations/affiliate",
      "/api/v1/bank-accounts/affiliate-withdrawal",
      "/api/v1/merchant/technician-applications",
      "/api/v1/merchant/technician-applications/{id}",
      "/api/v1/merchant/technician-applications/{id}/approve",
      "/api/v1/merchant/technician-applications/{id}/reject",
      "/api/v1/merchant/technician-applications/{id}/contact",
      "/api/v1/merchant/technician-applications/{id}/resume.xlsx",
      "/api/v1/ops/merchant-applications",
      "/api/v1/ops/merchant-applications/{id}",
      "/api/v1/ops/merchant-applications/{id}/approve",
      "/api/v1/ops/merchant-applications/{id}/reject"
    ].forEach((path) => expect(response.body.paths[path]).toBeDefined());
    expect(
      response.body.paths["/api/v1/identity-applications/{id}/media"].post.requestBody.content
    ).toHaveProperty("image/jpeg");
    const contentMediaUpload = response.body.paths["/api/v1/backoffice/content/media"].post;
    expect(contentMediaUpload.security).toEqual([{ bearerAuth: [] }]);
    expect(contentMediaUpload.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "alt_text",
          in: "query",
          required: false,
          schema: expect.objectContaining({ minLength: 1, maxLength: 255 })
        })
      ])
    );
    expect(contentMediaUpload.requestBody.required).toBe(true);
    expect(Object.keys(contentMediaUpload.requestBody.content).sort()).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp"
    ]);
    expect(
      contentMediaUpload.responses["201"].content["application/json"].schema.properties.data
    ).toMatchObject({
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
        url: { type: "string", pattern: "^/media/content/[a-f0-9]{64}\\.(jpg|png|webp)$" },
        mimeType: { type: "string", enum: ["image/jpeg", "image/png", "image/webp"] },
        width: { type: "null" },
        height: { type: "null" },
        checksumSha256: { type: "string", pattern: "^[a-f0-9]{64}$" }
      }
    });
    expect(contentMediaUpload.responses).toEqual(
      expect.objectContaining({
        "400": expect.objectContaining({ description: expect.stringContaining("media_invalid") }),
        "401": expect.objectContaining({ description: expect.stringContaining("token_invalid") }),
        "403": expect.objectContaining({ description: expect.stringContaining("forbidden") }),
        "409": expect.objectContaining({ description: expect.stringContaining("lock_conflict") }),
        "413": expect.objectContaining({ description: expect.stringContaining("media_too_large") }),
        "415": expect.objectContaining({ description: expect.stringContaining("media_invalid") })
      })
    );
    const socialMediaUpload = response.body.paths["/api/v1/social/media"].post;
    expect(socialMediaUpload.security).toEqual([{ bearerAuth: [] }]);
    expect(socialMediaUpload.parameters).toEqual([
      expect.objectContaining({
        name: "fileName",
        in: "query",
        required: true,
        schema: expect.objectContaining({ minLength: 1, maxLength: 255 })
      })
    ]);
    expect(Object.keys(socialMediaUpload.requestBody.content).sort()).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp"
    ]);
    expect(
      socialMediaUpload.responses["201"].content["application/json"].schema.properties.data
    ).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["publicId", "url", "mimeType", "fileSize"],
      properties: {
        publicId: { type: "string", pattern: "^[a-f0-9]{64}$" },
        url: { type: "string", pattern: "^/media/content/[a-f0-9]{64}\\.(jpg|png|webp)$" },
        mimeType: { type: "string", enum: ["image/jpeg", "image/png", "image/webp"] },
        fileSize: { type: "integer", minimum: 1, maximum: 8388608 }
      }
    });
    expect(socialMediaUpload.responses).toEqual(
      expect.objectContaining({
        "400": expect.objectContaining({ description: expect.stringContaining("media_invalid") }),
        "401": expect.objectContaining({ description: expect.stringContaining("token_invalid") }),
        "403": expect.objectContaining({ description: expect.stringContaining("forbidden") }),
        "413": expect.objectContaining({ description: expect.stringContaining("media_too_large") }),
        "415": expect.objectContaining({ description: expect.stringContaining("media_invalid") })
      })
    );
    const socialPostCreate = response.body.paths["/api/v1/social/posts"].post;
    const socialPostCreateSchema = socialPostCreate.requestBody.content["application/json"].schema;
    expect(socialPostCreateSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["content"],
      properties: {
        mentionUserIds: {
          type: "array",
          maxItems: 50,
          uniqueItems: true,
          items: { type: "integer", minimum: 1 }
        },
        media: {
          type: "object",
          additionalProperties: false,
          properties: {
            items: {
              type: "array",
              maxItems: 9,
              items: expect.objectContaining({
                type: "object",
                additionalProperties: false,
                required: ["id", "type", "mediaAssetPublicId"]
              })
            }
          }
        }
      }
    });
    const socialPostUpdate = response.body.paths["/api/v1/social/posts/{id}"].patch;
    expect(socialPostUpdate).toMatchObject({
      security: [{ bearerAuth: [] }],
      requestBody: expect.any(Object),
      responses: expect.objectContaining({
        "200": expect.any(Object),
        "400": expect.any(Object),
        "403": expect.any(Object),
        "404": expect.any(Object),
        "409": expect.any(Object)
      })
    });
    expect(socialPostCreate.responses).toEqual(
      expect.objectContaining({
        "201": expect.any(Object),
        "409": expect.objectContaining({
          description: expect.stringContaining("invalid_mention_contact")
        })
      })
    );
    expect(
      response.body.paths["/api/v1/contracts/acceptances/{receiptId}/receipt"].get.security
    ).toEqual([{ bearerAuth: [] }]);
    expect(response.body.paths).toHaveProperty("/api/v1/permissions");
    expect(response.body.paths).toHaveProperty("/api/v1/permissions/tree");
    expect(response.body.paths).toHaveProperty("/api/v1/permissions/{id}");
    expect(response.body.paths).toHaveProperty("/api/v1/roles");
    expect(response.body.paths).toHaveProperty("/api/v1/roles/{id}");
    expect(response.body.paths).toHaveProperty("/api/v1/roles/{id}/permissions");
    expect(response.body.paths).toHaveProperty("/api/v1/users");
    expect(response.body.paths).toHaveProperty("/api/v1/users/{id}");
    expect(response.body.paths).toHaveProperty("/api/v1/users/{id}/enable");
    expect(response.body.paths).toHaveProperty("/api/v1/users/{id}/disable");
    expect(response.body.paths).toHaveProperty("/api/v1/users/{id}/roles");
    expect(response.body.paths).toHaveProperty("/api/v1/users/{id}/test-account");
    expect(response.body.components.schemas.User.required).toEqual(
      expect.arrayContaining(["isTestAccount", "balances"])
    );
    expect(response.body.components.schemas.AuthMe.required).toEqual(
      expect.arrayContaining(["isTestAccount"])
    );
    expect(response.body.paths).toHaveProperty("/api/v1/categories");
    expect(response.body.paths).toHaveProperty("/api/v1/services");
    expect(response.body.paths).toHaveProperty("/api/v1/services/{id}");
    expect(response.body.paths).toHaveProperty("/api/v1/home/recommendations");
    expect(response.body.paths).toHaveProperty("/api/v1/search");
    expect(response.body.paths).toHaveProperty("/api/v1/im/directory");
    expect(response.body.paths).toHaveProperty("/api/v1/im/directory/{userId}");
    expect(response.body.components.schemas.RealtimeDirectoryProfile).toMatchObject({
      required: expect.arrayContaining(["user", "identityCard"]),
      properties: {
        identityCard: { $ref: "#/components/schemas/RealtimeDirectoryIdentityCard" }
      }
    });
    expect(
      response.body.components.schemas.RealtimeDirectoryProfile.properties.relationship.enum
    ).toEqual(["none", "friend", "incoming_pending", "outgoing_pending", "self"]);
    expect(response.body.components.schemas.RealtimeDirectoryIdentityCard).toMatchObject({
      required: expect.arrayContaining([
        "entityType",
        "displayName",
        "creditValue",
        "creditReviewCount",
        "languages"
      ]),
      properties: {
        entityType: { enum: ["user", "technician", "shop", "account"] },
        creditValue: { type: "string", nullable: true },
        creditReviewCount: { type: "integer", minimum: 0 }
      }
    });
    expect(response.body.paths["/api/v1/im/contacts"].post).toBeUndefined();
    expect(response.body.paths).toHaveProperty("/api/v1/im/conversations/{conversationId}/media");
    expect(
      response.body.paths["/api/v1/im/conversations/{conversationId}/media"].post.requestBody
        .content
    ).toHaveProperty("image/png");
    const voicePath =
      response.body.paths["/api/v1/im/conversations/{conversationId}/voice"].post;
    expect(voicePath.security).toEqual([{ bearerAuth: [] }]);
    expect(voicePath.description).toContain("server-probed duration is authoritative");
    expect(voicePath.description).toContain("pure audio");
    expect(voicePath.description).toContain("59.5 seconds");
    expect(voicePath.requestBody.content).toEqual(
      expect.objectContaining({
        "audio/webm": expect.any(Object),
        "audio/mp4": expect.any(Object),
        "audio/ogg": expect.any(Object)
      })
    );
    expect(voicePath.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "durationSeconds",
          description: expect.stringContaining("client hint"),
          schema: expect.objectContaining({ minimum: 1, maximum: 59 })
        })
      ])
    );
    expect(voicePath.responses).toEqual(
      expect.objectContaining({
        "201": expect.any(Object),
        "400": expect.any(Object),
        "403": expect.any(Object),
        "404": expect.any(Object),
        "413": expect.any(Object),
        "415": expect.any(Object)
      })
    );
    expect(response.body.paths).toHaveProperty("/api/v1/shops/{id}");
    expect(response.body.paths["/api/v1/shops/{id}"].get.parameters[0].schema.oneOf).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "integer", minimum: 1 }),
        expect.objectContaining({ type: "string", pattern: "^shop[0-9]{10}$" })
      ])
    );
    expect(response.body.paths).toHaveProperty("/api/v1/technicians/{id}");
    expect(response.body.paths).toHaveProperty("/api/v1/profiles/customers/{id}");
    expect(response.body.paths).toHaveProperty("/api/v1/schedule/availability");
    expect(response.body.paths["/api/v1/schedule/availability"].get.description).toEqual(
      expect.stringMatching(/technicianId.*without a service filter/i)
    );
    expect(response.body.paths).toHaveProperty("/api/v1/bookings");
    expect(response.body.paths).toHaveProperty("/api/v1/orders");
    expect(response.body.paths["/api/v1/orders"].get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "from",
          in: "query",
          description: expect.stringMatching(/inclusive/i)
        }),
        expect.objectContaining({
          name: "to",
          in: "query",
          description: expect.stringMatching(/exclusive/i)
        })
      ])
    );
    expect(response.body.paths).toHaveProperty("/api/v1/orders/{id}");
    expect(response.body.paths).toHaveProperty("/api/v1/orders/{id}/confirm");
    const confirmOperation = response.body.paths["/api/v1/orders/{id}/confirm"].post;
    const confirmBodySchema = confirmOperation.requestBody.content["application/json"].schema;
    expect(confirmBodySchema.additionalProperties).toBe(false);
    expect(confirmBodySchema.properties.insufficientBalanceConfirmation).toEqual(
      expect.objectContaining({
        type: "object",
        additionalProperties: false,
        required: ["confirmed", "idempotencyKey", "previewVersion"]
      })
    );
    const insufficientBalanceSchema =
      confirmOperation.responses["409"].content["application/json"].schema.properties.data;
    expect(insufficientBalanceSchema.properties).toEqual(
      expect.objectContaining({
        feeAmountNdp: expect.any(Object),
        availableBalanceNdp: expect.any(Object),
        shortfallNdp: expect.any(Object),
        payerType: expect.any(Object),
        walletOwnerType: expect.any(Object),
        previewVersion: expect.any(Object)
      })
    );
    expect(response.body.paths).toHaveProperty("/api/v1/orders/{id}/cancel");
    expect(response.body.paths).toHaveProperty("/api/v1/orders/{id}/start");
    expect(response.body.paths).toHaveProperty("/api/v1/orders/{id}/complete");
    expect(response.body.paths).toHaveProperty(
      "/api/v1/merchant-admin/orders/{id}/payment/confirm"
    );
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/orders/{id}/payment/refund");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/orders/{id}/payment/confirm");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/orders/{id}/payment/refund");
    expect(response.body.paths).toHaveProperty("/api/v1/wallets/me");
    expect(response.body.paths).toHaveProperty("/api/v1/wallets/me/summary");
    expect(response.body.paths).toHaveProperty("/api/v1/wallets/{id}/ledger");
    expect(response.body.paths).toHaveProperty("/api/v1/finance/ledger/transactions");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/dashboard");
    const dashboardSchemas = response.body.components.schemas;
    expect(dashboardSchemas).toEqual(
      expect.objectContaining({
        DashboardPeriod: expect.any(Object),
        DashboardMetricComparison: expect.any(Object),
        DashboardNdpPair: expect.any(Object),
        DashboardPlatformGlobalNdpPair: expect.any(Object),
        DashboardBucket: expect.any(Object),
        DashboardShopSnapshot: expect.any(Object),
        DashboardMembership: expect.any(Object),
        Dashboard: expect.any(Object)
      })
    );
    expect(dashboardSchemas.DashboardPeriod).toEqual({
      type: "string",
      enum: ["today", "last7days", "last30days", "week", "month", "year", "custom"],
      default: "last7days"
    });
    expect(dashboardSchemas.DashboardMetricComparison).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["current", "previous", "changeRatePercent"],
      properties: {
        current: { type: "number" },
        previous: { type: "number" },
        changeRatePercent: { type: ["number", "null"] }
      }
    });
    expect(dashboardSchemas.DashboardPlatformGlobalNdpPair).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["ndp", "testNdp", "cityFilterApplied", "scopeLabel"],
      properties: {
        cityFilterApplied: { type: "boolean", const: false },
        scopeLabel: { type: "string", const: "platform_global" }
      }
    });
    expect(dashboardSchemas.DashboardBucket.required).toEqual([
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
    ]);
    expect(dashboardSchemas.DashboardMembership).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["memberCount", "memberDataStatus", "completedCustomerCount"],
      properties: {
        memberCount: { type: "null" },
        memberDataStatus: { type: "string", const: "not_available" },
        completedCustomerCount: { type: "integer", minimum: 0 }
      }
    });
    expect(dashboardSchemas.DashboardShopSnapshot.properties.publicId).toEqual({
      type: "string",
      pattern: "^shop[0-9]{10}$"
    });
    expect(dashboardSchemas.Dashboard).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["filter", "summary", "series", "finance", "shop", "membership", "scope"]
    });
    expect(dashboardSchemas.Dashboard.properties.finance.properties.walletStock).toEqual({
      oneOf: [{ $ref: "#/components/schemas/DashboardPlatformGlobalNdpPair" }, { type: "null" }]
    });
    expect(dashboardSchemas.Dashboard.properties.finance.properties.withdrawn).toEqual({
      oneOf: [{ $ref: "#/components/schemas/DashboardPlatformGlobalNdpPair" }, { type: "null" }]
    });
    expect(dashboardSchemas.Dashboard.properties.scope.oneOf[1].properties.shopPublicId).toEqual({
      type: "string",
      pattern: "^shop[0-9]{10}$"
    });
    const operationsDashboard = response.body.paths["/api/v1/backoffice/dashboard"].get;
    expect(
      operationsDashboard.parameters
        .filter((parameter: { in: string }) => parameter.in === "query")
        .map((parameter: { name: string }) => parameter.name)
        .sort()
    ).toEqual(["city", "from", "period", "to"]);
    expect(
      operationsDashboard.responses["200"].content["application/json"].schema.properties.data
    ).toEqual({ $ref: "#/components/schemas/Dashboard" });
    expect(operationsDashboard.responses).toEqual(
      expect.objectContaining({
        "400": expect.objectContaining({
          description: expect.stringContaining("error.validation")
        }),
        "401": expect.objectContaining({ description: expect.stringContaining("error.auth") }),
        "403": expect.objectContaining({ description: expect.stringContaining("permission") })
      })
    );
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/orders");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/schedule");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/finance/settlements");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/finance/settlements/export");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/finance/ndp-summary");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/technicians");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/technician-rankings");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/technician-rankings/export");
    expect(response.body.paths["/api/v1/backoffice/technician-rankings"].get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "period",
          schema: expect.objectContaining({ default: "month" })
        }),
        expect.objectContaining({
          name: "from",
          schema: expect.objectContaining({ format: "date" })
        }),
        expect.objectContaining({
          name: "to",
          schema: expect.objectContaining({ format: "date" })
        }),
        expect.objectContaining({ name: "sortBy" })
      ])
    );
    const technicianRankingExport =
      response.body.paths["/api/v1/backoffice/technician-rankings/export"].get;
    expect(technicianRankingExport.security).toEqual([{ bearerAuth: [] }]);
    expect(technicianRankingExport.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "period",
          schema: expect.objectContaining({
            enum: ["today", "last7days", "last30days", "month", "custom", "all"],
            default: "month"
          })
        }),
        expect.objectContaining({
          name: "from",
          schema: expect.objectContaining({ format: "date" })
        }),
        expect.objectContaining({
          name: "to",
          schema: expect.objectContaining({ format: "date" })
        }),
        expect.objectContaining({
          name: "keyword",
          schema: expect.objectContaining({ maxLength: 100 })
        }),
        expect.objectContaining({
          name: "shopId",
          schema: expect.objectContaining({ minimum: 1 })
        }),
        expect.objectContaining({
          name: "city",
          schema: expect.objectContaining({ maxLength: 100 })
        }),
        expect.objectContaining({
          name: "sortBy",
          schema: expect.objectContaining({
            enum: ["revenue", "completedOrders", "workingDays"],
            default: "revenue"
          })
        }),
        expect.objectContaining({
          name: "sortOrder",
          schema: expect.objectContaining({ enum: ["asc", "desc"], default: "desc" })
        })
      ])
    );
    expect(
      technicianRankingExport.responses["200"].content["application/json"].schema.properties.data
    ).toMatchObject({
      type: "object",
      required: ["filename", "contentType", "content"],
      properties: {
        filename: { type: "string" },
        contentType: { type: "string", enum: ["text/csv; charset=utf-8"] },
        content: { type: "string" }
      }
    });
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/shops");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/merchant-accounts");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/merchant-accounts/{id}");
    expect(response.body.paths).toHaveProperty(
      "/api/v1/backoffice/merchant-accounts/{id}/billing-profile"
    );
    expect(response.body.paths).toHaveProperty(
      "/api/v1/backoffice/merchant-accounts/{id}/payment-responsibility"
    );
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/merchant-accounts/{id}/shops");
    expect(response.body.paths).toHaveProperty(
      "/api/v1/backoffice/merchant-accounts/{id}/shops/{shopId}"
    );
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/shops/{id}/billing-profile");
    expect(response.body.paths).toHaveProperty(
      "/api/v1/backoffice/billing-subjects/{subjectType}/{subjectId}/trial/extensions"
    );
    expect(response.body.paths).toHaveProperty(
      "/api/v1/backoffice/billing-subjects/{subjectType}/{subjectId}/trial/interrupt"
    );
    expect(response.body.paths).toHaveProperty(
      "/api/v1/backoffice/billing-subjects/{subjectType}/{subjectId}/free-periods"
    );
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/saas-invoices");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/saas-invoices/{id}");
    expect(response.body.paths).toHaveProperty(
      "/api/v1/backoffice/saas-invoices/{id}/manual-payments"
    );
    expect(response.body.paths).toHaveProperty(
      "/api/v1/backoffice/entities/{subjectType}/{subjectId}/suspensions"
    );
    expect(response.body.paths).toHaveProperty(
      "/api/v1/backoffice/entities/{subjectType}/{subjectId}/suspensions/{suspensionId}/release"
    );
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/shops/{id}");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/shops/{id}/approve");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/technicians/{id}");
    expect(response.body.paths["/api/v1/backoffice/technicians/{id}"]).toMatchObject({
      get: expect.any(Object),
      patch: expect.any(Object),
      delete: expect.any(Object)
    });
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/technicians/{id}/approve");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/customers");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/customers/{id}");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/services");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/shops/{shopId}/services");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/services/{id}");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/dashboard");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/manageable-shops");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/orders");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/schedule");
    const merchantDashboard = response.body.paths["/api/v1/merchant-admin/dashboard"].get;
    expect(merchantDashboard.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          in: "header",
          name: "X-NeeDo-Merchant-Preview-Shop-Id"
        })
      ])
    );
    expect(
      merchantDashboard.parameters
        .filter((parameter: { in: string }) => parameter.in === "query")
        .map((parameter: { name: string }) => parameter.name)
        .sort()
    ).toEqual(["from", "period", "to"]);
    expect(merchantDashboard.parameters).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ in: "query", name: "city" }),
        expect.objectContaining({ in: "query", name: "shopId" })
      ])
    );
    expect(
      merchantDashboard.responses["200"].content["application/json"].schema.properties.data
    ).toEqual({ $ref: "#/components/schemas/Dashboard" });
    expect(merchantDashboard.responses).toEqual(
      expect.objectContaining({
        "400": expect.objectContaining({
          description: expect.stringContaining("error.validation")
        }),
        "401": expect.objectContaining({ description: expect.stringContaining("error.auth") }),
        "403": expect.objectContaining({ description: expect.stringContaining("scope") })
      })
    );
    const manageableShops = response.body.paths["/api/v1/merchant-admin/manageable-shops"].get;
    expect(manageableShops.parameters).toEqual([
      expect.objectContaining({ in: "query", name: "page" }),
      expect.objectContaining({ in: "query", name: "page_size" })
    ]);
    expect(manageableShops.responses).toEqual(
      expect.objectContaining({
        "400": expect.any(Object),
        "401": expect.any(Object),
        "403": expect.any(Object)
      })
    );
    expect(
      manageableShops.responses["200"].content["application/json"].schema.properties.data
    ).toEqual({ $ref: "#/components/schemas/ManageableMerchantShopPage" });
    expect(response.body.components.schemas.ManageableMerchantShop).toMatchObject({
      additionalProperties: false,
      required: ["publicId", "name", "city", "status", "selected"],
      properties: {
        publicId: { type: "string", pattern: "^shop[0-9]{10}$" }
      }
    });
    expect(response.body.paths).toHaveProperty(
      "/api/v1/merchant-admin/shops/{shopId}/finance/rules"
    );
    expect(response.body.paths).toHaveProperty(
      "/api/v1/merchant-admin/shops/{shopId}/finance/rules/preview"
    );
    expect(response.body.paths).toHaveProperty(
      "/api/v1/merchant-admin/finance/orders/{bookingOrderId}"
    );
    expect(response.body.paths).toHaveProperty(
      "/api/v1/merchant-admin/finance/orders/{bookingOrderId}/service-income-report"
    );
    expect(response.body.paths).toHaveProperty(
      "/api/v1/backoffice/finance/orders/{bookingOrderId}"
    );
    expect(response.body.paths).toHaveProperty(
      "/api/v1/merchant-admin/shops/{shopId}/technicians/{technicianProfileId}/compensation-profile"
    );
    expect(response.body.paths).toHaveProperty(
      "/api/v1/merchant-admin/shops/{shopId}/technicians/{technicianProfileId}/compensation-profile/preview"
    );
    expect(response.body.paths).toHaveProperty(
      "/api/v1/merchant-admin/employees/{needoId}/compensation-profile"
    );
    expect(response.body.paths).toHaveProperty(
      "/api/v1/merchant-admin/employees/{needoId}/compensation-profile/preview"
    );
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-profile/me");
    expect(response.body.paths["/api/v1/merchant-profile/me"]).toMatchObject({
      get: { responses: { "200": expect.any(Object), "403": expect.any(Object) } },
      patch: { responses: { "200": expect.any(Object), "400": expect.any(Object) } }
    });
    expect(response.body.components.schemas.MerchantIdentityProfile).toMatchObject({
      additionalProperties: false,
      properties: {
        publicId: { type: "string", pattern: "^[bB][0-9]{10}$" },
        displayName: { type: "string" },
        languages: { type: "array" }
      }
    });
    const employeeCompensationSchema = response.body.components.schemas.EmployeeCompensationProfile;
    expect(employeeCompensationSchema.properties).not.toHaveProperty("shopId");
    expect(employeeCompensationSchema.properties).not.toHaveProperty("technicianProfileId");
    expect(employeeCompensationSchema.properties).not.toHaveProperty("createdById");
    expect(employeeCompensationSchema.properties).not.toHaveProperty("updatedById");
    for (const schemaName of [
      "ShopFinanceRuleSet",
      "TechnicianCompensationProfile",
      "EmployeeCompensationProfile",
      "CompensationProfileInput"
    ]) {
      expect(response.body.components.schemas[schemaName].properties).toEqual(
        expect.objectContaining({
          extensionCommissionRatePercent: expect.objectContaining({ type: "number" }),
          nominationFeeJpy: expect.objectContaining({ type: "integer" })
        })
      );
    }
    expect(response.body.components.schemas.CompensationPreview.properties).toEqual(
      expect.objectContaining({
        baseServiceAmountJpy: expect.objectContaining({ type: "integer" }),
        extensionAmountJpy: expect.objectContaining({ type: "integer" }),
        nominationChargeAmountJpy: expect.objectContaining({ type: "integer" }),
        nominated: expect.objectContaining({ type: "boolean" }),
        serviceCommissionPayJpy: expect.objectContaining({ type: "integer" }),
        extensionCommissionPayJpy: expect.objectContaining({ type: "integer" }),
        nominationPayJpy: expect.objectContaining({ type: "integer" })
      })
    );
    const serviceIncomeReportSchema =
      response.body.paths[
        "/api/v1/merchant-admin/finance/orders/{bookingOrderId}/service-income-report"
      ].put.requestBody.content["application/json"].schema;
    expect(serviceIncomeReportSchema.properties).toEqual(
      expect.objectContaining({
        baseServiceAmountJpy: expect.objectContaining({ type: "integer" }),
        extensionAmountJpy: expect.objectContaining({ type: "integer" }),
        nominationChargeAmountJpy: expect.objectContaining({ type: "integer" }),
        wasTechnicianNominated: expect.objectContaining({ type: "boolean" })
      })
    );
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/pay-runs");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/pay-runs/export");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/pay-runs/{id}");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/pay-runs/{id}/publish");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/pay-runs/{id}/approve");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/pay-runs/{id}/lock");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/payroll-schedule-policy");
    expect(response.body.paths).toHaveProperty(
      "/api/v1/merchant-admin/employees/{needoId}/payroll-schedule-policy"
    );
    const payrollSchedulePolicyPath =
      response.body.paths["/api/v1/merchant-admin/payroll-schedule-policy"];
    expect(payrollSchedulePolicyPath.get.security).toEqual([{ bearerAuth: [] }]);
    expect(payrollSchedulePolicyPath.put.requestBody.content["application/json"].schema).toEqual(
      expect.objectContaining({
        additionalProperties: false,
        required: expect.arrayContaining([
          "cadence",
          "weeklySettlementWeekday",
          "monthlySettlementDay",
          "holidayAdjustment",
          "timezone",
          "effectiveFrom"
        ])
      })
    );
    expect(
      response.body.paths["/api/v1/merchant-admin/employees/{needoId}/payroll-schedule-policy"].get
        .parameters
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          in: "path",
          name: "needoId",
          schema: expect.objectContaining({ pattern: "^s[0-9]{10}$" })
        })
      ])
    );
    expect(response.body.components.schemas).toHaveProperty("PayrollSchedulePolicyResult");
    expect(response.body.paths).toHaveProperty(
      "/api/v1/merchant-admin/payslips/{id}/payout-records"
    );
    expect(response.body.paths).toHaveProperty(
      "/api/v1/merchant-admin/payslips/{id}/resolve-dispute"
    );
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/payroll-adjustments");
    expect(response.body.paths).toHaveProperty(
      "/api/v1/merchant-admin/payroll-adjustments/{id}/submit"
    );
    expect(response.body.paths).toHaveProperty(
      "/api/v1/merchant-admin/payroll-adjustments/{id}/approve"
    );
    expect(response.body.paths).toHaveProperty(
      "/api/v1/merchant-admin/payroll-adjustments/{id}/reject"
    );
    expect(response.body.paths).toHaveProperty("/api/v1/technician/payslips");
    expect(response.body.paths).toHaveProperty("/api/v1/technician/payslips/export");
    expect(response.body.paths).toHaveProperty("/api/v1/technician/payslips/{id}/confirm");
    expect(response.body.paths).toHaveProperty("/api/v1/technician/payslips/{id}/dispute");
    expect(response.body.paths).toHaveProperty(
      "/api/v1/technician/payslips/{payslipId}/payout-records/{payoutRecordId}/confirm"
    );
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/pay-runs");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/pay-runs/export");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/finance/settlements");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/finance/settlements/export");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/technicians");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/shop");
    expect(response.body.paths["/api/v1/merchant-admin/shop"]).toHaveProperty("patch");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/technicians/{id}");
    expect(response.body.paths["/api/v1/merchant-admin/technicians/{id}"]).toMatchObject({
      get: expect.any(Object),
      patch: expect.any(Object),
      delete: expect.any(Object)
    });
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/technicians/{id}/approve");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/customers");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/customers/{id}");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/services");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/services/{id}");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/schedule/slots");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/schedule/slots/{id}");
    expect(response.body.paths).toHaveProperty("/api/v1/technician/schedule/slots");
    expect(response.body.paths).toHaveProperty("/api/v1/technician/schedule/slots/{id}");
    expect(response.body.paths["/api/v1/technician/schedule/slots/{id}"].get).toMatchObject({
      security: [{ bearerAuth: [] }],
      parameters: [expect.objectContaining({ name: "id", in: "path", required: true })],
      responses: expect.objectContaining({
        "200": expect.any(Object),
        "400": expect.any(Object),
        "401": expect.any(Object),
        "403": expect.any(Object),
        "404": expect.any(Object)
      })
    });
    expect(response.body.paths).toHaveProperty("/api/v1/im/conversations");
    expect(response.body.paths).toHaveProperty(
      "/api/v1/im/conversations/{conversationId}/messages"
    );
    expect(response.body.paths).toHaveProperty(
      "/api/v1/im/conversations/{conversationId}/messages/{messageId}/reactions"
    );
    expect(response.body.paths).toHaveProperty(
      "/api/v1/im/conversations/{conversationId}/messages/{messageId}/recall"
    );
    expect(
      response.body.paths["/api/v1/im/conversations/{conversationId}/messages/{messageId}"]
    ).toMatchObject({
      delete: expect.objectContaining({
        security: [{ bearerAuth: [] }],
        responses: expect.objectContaining({
          "200": expect.any(Object),
          "403": expect.any(Object),
          "404": expect.any(Object)
        })
      })
    });
    expect(
      response.body.paths["/api/v1/im/conversations/{conversationId}/messages/{messageId}/recall"]
    ).toMatchObject({
      post: expect.objectContaining({
        security: [{ bearerAuth: [] }],
        requestBody: expect.any(Object),
        responses: expect.objectContaining({
          "200": expect.any(Object),
          "400": expect.any(Object),
          "403": expect.any(Object),
          "404": expect.any(Object)
        })
      })
    });
    const reactionPath =
      response.body.paths[
        "/api/v1/im/conversations/{conversationId}/messages/{messageId}/reactions"
      ];
    expect(reactionPath).toMatchObject({ put: expect.any(Object), delete: expect.any(Object) });
    expect(reactionPath.put.summary).toBe(
      "Set the current user's reaction in its IM reply category"
    );
    expect(reactionPath.put.description).toContain("OK, NO, Pending, +1, Done, Cool, Good, Thanks");
    expect(reactionPath.put.description).toContain("one judgement and one emoji");
    expect(reactionPath.put.responses).toEqual(
      expect.objectContaining({
        "200": expect.any(Object),
        "400": expect.any(Object),
        "401": expect.any(Object),
        "403": expect.any(Object),
        "404": expect.any(Object),
        "409": expect.objectContaining({
          description: expect.stringContaining("error.im.reaction_slot_occupied")
        })
      })
    );
    expect(response.body.paths).toHaveProperty("/api/v1/im/conversations/{conversationId}/read");
    expect(response.body.paths).toHaveProperty("/api/v1/im/contacts");
    expect(response.body.paths["/api/v1/im/contacts/{contactId}"].delete).toMatchObject({
      security: [{ bearerAuth: [] }],
      summary: expect.stringContaining("Hard-delete"),
      responses: expect.objectContaining({
        "200": expect.any(Object),
        "403": expect.any(Object),
        "404": expect.any(Object)
      })
    });
    expect(response.body.paths).toHaveProperty("/api/v1/im/friend-requests");
    expect(response.body.paths).toHaveProperty("/api/v1/im/friend-requests/{id}/accept");
    expect(response.body.paths).toHaveProperty("/api/v1/im/friend-requests/{id}/reject");
    expect(
      response.body.paths["/api/v1/im/conversations/{conversationId}/messages"].post.responses[
        "403"
      ].description
    ).toContain("error.im.not_friends");
    expect(response.body.paths).toHaveProperty("/api/v1/social/posts");
    expect(response.body.paths).toHaveProperty("/api/v1/social/posts/{id}");
    expect(response.body.paths).toHaveProperty("/api/v1/social/follows");
    expect(response.body.paths).toHaveProperty("/api/v1/social/follows/{targetUserId}");
    expect(response.body.paths).toHaveProperty("/api/v1/notifications");
    expect(response.body.paths).toHaveProperty("/api/v1/notifications/{id}/read");
    expect(response.body.paths).toHaveProperty("/api/v1/notifications/read-all");
    expect(response.body.paths).toHaveProperty("/api/v1/realtime/unread-counts");
    expect(response.body.paths).toHaveProperty("/api/v1/realtime/events");
    expect(response.body.paths).toHaveProperty("/api/v1/finance/reconciliation");
    expect(response.body.paths).toHaveProperty("/api/v1/finance/reconciliation/export");
    expect(response.body.paths).toHaveProperty("/api/v1/affiliate/tasks");
    expect(response.body.paths).toHaveProperty("/api/v1/affiliate/tasks/{taskId}");
    expect(response.body.paths).toHaveProperty("/api/v1/affiliate/tasks/{taskId}/claims");
    expect(response.body.paths).toHaveProperty("/api/v1/affiliate/claims");
    expect(response.body.paths).toHaveProperty("/api/v1/affiliate/claims/{claimId}");
    expect(response.body.paths).toHaveProperty("/api/v1/affiliate/resolve/{publicToken}");
    expect(response.body.paths).toHaveProperty("/api/v1/affiliate/codes/validate");
    [
      "/api/v1/merchant-admin/pay-runs/export",
      "/api/v1/technician/payslips/export",
      "/api/v1/backoffice/pay-runs/export"
    ].forEach((path) => {
      expect(response.body.paths[path].get.responses["200"].content).toHaveProperty("text/csv");
      expect(response.body.paths[path].get.responses["200"].content).not.toHaveProperty(
        "application/json"
      );
    });
    expect(response.body.components.schemas).toHaveProperty("ServiceCard");
    expect(response.body.components.schemas).toHaveProperty("ShopDetail");
    expect(response.body.components.schemas.TechnicianDetail.allOf[1].required).toContain("shop");
    expect(response.body.components.schemas).toHaveProperty("CustomerProfile");
    expect(response.body.components.schemas).toHaveProperty("ScheduleSlot");
    expect(response.body.components.schemas).toHaveProperty("BookingOrder");
    expect(response.body.components.schemas).toHaveProperty("Wallet");
    expect(response.body.components.schemas).toHaveProperty("WalletSummary");
    expect(response.body.components.schemas).toHaveProperty("BackofficeNdpSummary");
    expect(response.body.components.schemas.BackofficeNdpSummary.required).toEqual(
      expect.arrayContaining(["todayNdpConsumption", "platformNetRevenue", "settleableNdp"])
    );
    expect(response.body.components.schemas).toHaveProperty("LedgerTransaction");
    expect(response.body.components.schemas.RealtimeMessage.required).toEqual(
      expect.arrayContaining([
        "expiresAt",
        "privacyPolicyVersionAtSend",
        "recallDeadlineAt",
        "recalledAt",
        "recallMode",
        "contentPurgedAt",
        "lifecycleVersion",
        "availableRecallModes"
      ])
    );
    expect(response.body.components.schemas.LedgerTransaction.properties.type.enum).toEqual(
      expect.arrayContaining([
        "manual_topup_approved",
        "manual_withdrawal_approved",
        "affiliate_task_budget_freeze",
        "affiliate_task_budget_release",
        "affiliate_reward_settlement"
      ])
    );
    expect(response.body.components.schemas).toHaveProperty("FinanceReconciliation");
    expect(response.body.components.schemas).toHaveProperty("AffiliateMarketplaceTask");
    expect(response.body.components.schemas).toHaveProperty("AffiliateMarketplaceShop");
    expect(response.body.components.schemas).toHaveProperty("AffiliateMarketplaceMediaAsset");
    expect(response.body.components.schemas.AffiliateMarketplaceTask.required).toEqual(
      expect.arrayContaining([
        "coverImageUrl",
        "totalBudgetNdp",
        "remainingBudgetNdp",
        "remainingBudgetBps"
      ])
    );
    expect(
      response.body.components.schemas.AffiliateMarketplaceTask.properties.shops.items.$ref
    ).toBe("#/components/schemas/AffiliateMarketplaceShop");
    expect(response.body.components.schemas).toHaveProperty("AffiliateClaim");
    expect(response.body.components.schemas).toHaveProperty("AffiliateResolvedLink");
    expect(response.body.components.schemas).toHaveProperty("AffiliateCodeValidation");
    expect(response.body.components.schemas).toHaveProperty("ShopFinanceRuleSet");
    expect(response.body.components.schemas).toHaveProperty("ShopFinanceRulePreviewResult");
    expect(response.body.components.schemas).toHaveProperty("OrderFinanceDetail");
    expect(response.body.components.schemas).toHaveProperty("TechnicianCompensationProfile");
    expect(response.body.components.schemas).toHaveProperty("BackofficeTechnicianRankingRow");
    expect(response.body.components.schemas.BackofficeTechnicianRankingRow.required).toEqual(
      expect.arrayContaining([
        "completedServiceAmountJpy",
        "completedOrderCount",
        "workingDayCount"
      ])
    );
    expect(response.body.components.schemas).toHaveProperty("CompensationProfilePreviewResult");
    expect(response.body.components.schemas).toHaveProperty("PayrollCsvExport");
    expect(response.body.components.schemas).toHaveProperty("PayrollAdjustmentRequest");
    expect(response.body.components.schemas).toHaveProperty("RealtimeConversation");
    expect(response.body.components.schemas.RealtimeConversation).toMatchObject({
      required: expect.arrayContaining(["autoTranslateMessages"]),
      properties: { autoTranslateMessages: { type: "boolean", default: false } }
    });
    expect(
      response.body.components.schemas.RealtimeConversation.properties.disappearingTtlSeconds
        .maximum
    ).toBe(359_940);
    expect(
      response.body.paths["/api/v1/im/conversations"].post.requestBody.content["application/json"]
        .schema.properties.disappearingTtlSeconds.maximum
    ).toBe(359_940);
    expect(
      response.body.paths["/api/v1/im/conversations/{conversationId}/privacy"].patch.requestBody
        .content["application/json"].schema.properties.disappearingTtlSeconds.maximum
    ).toBe(359_940);
    expect(
      response.body.paths["/api/v1/im/conversations/{conversationId}/preferences"].patch
        .requestBody.content["application/json"].schema
    ).toMatchObject({
      minProperties: 1,
      properties: { autoTranslateMessages: { type: "boolean", default: false } }
    });
    expect(response.body.components.schemas).toHaveProperty("RealtimeMessage");
    expect(response.body.components.schemas.RealtimeMessage.required).toContain("reactions");
    expect(response.body.components.schemas).toHaveProperty("RealtimeMessageReaction");
    expect(response.body.components.schemas).toHaveProperty("RealtimeContact");
    expect(response.body.components.schemas).toHaveProperty("FriendRequest");
    expect(response.body.components.schemas.FriendRequest).toMatchObject({
      required: expect.arrayContaining(["requester", "target", "expiresAt", "expiredAt"]),
      properties: {
        status: { enum: ["pending", "accepted", "rejected", "expired"] },
        requester: { $ref: "#/components/schemas/RealtimeParticipant" },
        target: { $ref: "#/components/schemas/RealtimeParticipant" },
        expiresAt: { type: "string", format: "date-time" },
        expiredAt: { type: "string", format: "date-time", nullable: true }
      }
    });
    expect(response.body.components.schemas).toHaveProperty("SocialPost");
    expect(response.body.components.schemas).toHaveProperty("Follow");
    expect(response.body.components.schemas).toHaveProperty("Notification");
    expect(response.body.components.schemas).toHaveProperty("RealtimeUnreadCounts");
    expect(response.body.components.schemas).toHaveProperty("MerchantAccountCard");
    expect(response.body.components.schemas).toHaveProperty("ShopBillingCard");
    expect(response.body.components.schemas).toHaveProperty("SaasBillingCard");
    expect(response.body.components.schemas).toHaveProperty("SaasInvoice");
    expect(response.body.components.schemas).toHaveProperty("EntitySuspensionResult");
    expect(response.body.components.schemas).toHaveProperty("BackofficeCustomer");
    [
      "BackofficeRole",
      "BackofficeIdentity",
      "BackofficeAccount",
      "BackofficeAuditEvent",
      "BackofficeTechnicianServiceDetail",
      "BackofficeScheduleSummary",
      "BackofficeCompensation",
      "BackofficeBookingSummary",
      "BackofficeTechnicianDetail",
      "BackofficeCustomerDetail"
    ].forEach((schema) => expect(response.body.components.schemas).toHaveProperty(schema));
    expect(
      response.body.paths["/api/v1/backoffice/technicians/{id}"].get.responses["200"].content[
        "application/json"
      ].schema.properties.data
    ).toEqual({ $ref: "#/components/schemas/BackofficeTechnicianDetail" });
    expect(
      response.body.paths["/api/v1/merchant-admin/customers/{id}"].get.responses["200"].content[
        "application/json"
      ].schema.properties.data
    ).toEqual({ $ref: "#/components/schemas/BackofficeCustomerDetail" });
    expect(response.body.components.schemas).toHaveProperty("BackofficeService");
    expect(response.body.components.schemas).toHaveProperty("BackofficeServiceCreateInput");
    expect(response.body.components.schemas).toHaveProperty("BackofficeServiceUpdateInput");
    expect(response.body.components.schemas).toHaveProperty("ScheduleSlotCreateInput");
    expect(response.body.components.schemas).toHaveProperty("ScheduleSlotUpdateInput");
    [
      ["/api/v1/backoffice/shops/{id}", "patch"],
      ["/api/v1/backoffice/technicians/{id}", "patch"],
      ["/api/v1/backoffice/customers/{id}", "patch"],
      ["/api/v1/backoffice/shops/{shopId}/services", "post"],
      ["/api/v1/backoffice/services/{id}", "patch"],
      ["/api/v1/merchant-admin/technicians/{id}", "patch"],
      ["/api/v1/merchant-admin/services", "post"],
      ["/api/v1/merchant-admin/services/{id}", "patch"]
    ].forEach(([path, method]) => {
      expect(response.body.paths[path][method].requestBody.required).toBe(true);
      expect(response.body.paths[path][method].requestBody.content).toHaveProperty(
        "application/json"
      );
    });

    const registrationPath = response.body.paths["/api/v1/auth/register"].post;
    expect(registrationPath.security).toBeUndefined();
    expect(
      registrationPath.responses["200"].content["application/json"].schema.properties.data
    ).toEqual({ $ref: "#/components/schemas/AuthChallengeMetadata" });
    expect(
      response.body.paths["/api/v1/auth/register/verify"].post.responses["200"].content[
        "application/json"
      ].schema.properties.data
    ).toEqual({ $ref: "#/components/schemas/TokenPairWithNeedoId" });

    const orderFinanceSchema = response.body.components.schemas.OrderFinanceDetail;
    expect(orderFinanceSchema.properties).toMatchObject({
      orderType: { type: "string", enum: ["booking", "request"] },
      cRequestFeeHoldNdp: { type: "integer" },
      cRequestFeeActualNdp: { type: "integer" },
      requestFeeNdpRevenue: { type: "integer" }
    });
    expect(
      response.body.paths["/api/v1/bookings"].post.requestBody.content["application/json"].schema
        .properties.orderType
    ).toEqual({ type: "string", enum: ["booking", "request"] });
    expect(
      response.body.paths["/api/v1/bookings"].post.requestBody.content["application/json"].schema
        .properties
    ).toMatchObject({
      affiliateCode: { type: "string", maxLength: 40 },
      affiliatePublicToken: { type: "string", maxLength: 512 }
    });
    expect(response.body.components.schemas.BookingOrder.required).toContain("affiliate");
    expect(response.body.components.schemas.BookingOrder.properties.affiliate).toEqual({
      anyOf: [{ $ref: "#/components/schemas/AffiliateCheckoutSummary" }, { type: "null" }]
    });
    expect(
      response.body.components.schemas.AffiliateCheckoutSummary.properties.attributionStatus.enum
    ).toEqual(["attributed", "qualified", "settled", "invalidated", "reversed"]);
    const codeValidationPath = response.body.paths["/api/v1/affiliate/codes/validate"].post;
    expect(codeValidationPath.security).toEqual([{ bearerAuth: [] }]);
    expect(codeValidationPath.requestBody.content["application/json"].schema).toMatchObject({
      additionalProperties: false,
      required: ["publicCode", "scheduleSlotId"]
    });
    expect(
      codeValidationPath.responses["200"].content["application/json"].schema.properties.data
    ).toEqual({ $ref: "#/components/schemas/AffiliateCodeValidation" });

    const resolveDisputePath =
      response.body.paths["/api/v1/merchant-admin/payslips/{id}/resolve-dispute"].post;
    expect(resolveDisputePath.security).toEqual([{ bearerAuth: [] }]);
    expect(
      resolveDisputePath.responses["200"].content["application/json"].schema.properties.data
    ).toEqual({ $ref: "#/components/schemas/Payslip" });

    const payoutConfirmPath =
      response.body.paths[
        "/api/v1/technician/payslips/{payslipId}/payout-records/{payoutRecordId}/confirm"
      ].post;
    expect(payoutConfirmPath.security).toEqual([{ bearerAuth: [] }]);
    expect(payoutConfirmPath.responses["200"].content["application/json"].schema.required).toEqual([
      "code",
      "message",
      "data"
    ]);

    const payslipSchema = response.body.components.schemas.Payslip;
    expect(payslipSchema.properties).toMatchObject({
      disputeResolvedAt: { type: ["string", "null"], format: "date-time" },
      disputeResolvedById: { type: ["integer", "null"] },
      disputeResolutionNote: { type: ["string", "null"] }
    });
    expect(response.body.components.schemas.PayoutRecord.properties.technicianConfirmedAt).toEqual({
      type: ["string", "null"],
      format: "date-time"
    });

    const currentCustomerProfilePath = response.body.paths["/api/v1/customer-profile/me"];
    expect(currentCustomerProfilePath).toMatchObject({
      get: expect.any(Object),
      patch: expect.any(Object)
    });
    expect(currentCustomerProfilePath.get.security).toEqual([{ bearerAuth: [] }]);
    expect(currentCustomerProfilePath.patch.security).toEqual([{ bearerAuth: [] }]);
    expect(currentCustomerProfilePath.patch.requestBody.content["application/json"].schema).toEqual(
      {
        $ref: "#/components/schemas/CustomerSelfProfileUpdate"
      }
    );
    expect(response.body.components.schemas.CustomerSelfProfile.required).toEqual(
      expect.arrayContaining([
        "id",
        "publicId",
        "displayName",
        "avatarUrl",
        "gender",
        "age",
        "heightCm",
        "languages",
        "bio",
        "visibility",
        "membershipLevel",
        "level"
      ])
    );
    expect(response.body.components.schemas.CustomerSelfProfile.properties.level).toEqual({
      type: "integer",
      minimum: 1,
      maximum: 100
    });
    expect(response.body.paths).toHaveProperty("/media/customer-avatars/{filename}");
  });

  it("documents immutable realtime identities and the friend activity status contract", () => {
    const document = createOpenApiDocument(env) as {
      paths: Record<
        string,
        {
          get?: {
            security: unknown;
            parameters: unknown;
            responses: Record<
              string,
              {
                content: Record<string, { schema: { properties: Record<string, unknown> } }>;
              }
            >;
          };
        }
      >;
      components: {
        schemas: Record<
          string,
          {
            required: string[];
            properties: Record<string, Record<string, unknown>>;
          }
        >;
      };
    };
    const activityPath = document.paths["/api/v1/social/users/{userId}/activity-status"]?.get;

    if (!activityPath) {
      throw new Error("Missing friend activity status OpenAPI operation");
    }

    expect(activityPath).toMatchObject({
      security: [{ bearerAuth: [] }],
      parameters: [
        expect.objectContaining({
          name: "userId",
          in: "path",
          required: true,
          schema: { type: "integer", minimum: 1 }
        })
      ]
    });
    expect(
      activityPath.responses["200"].content["application/json"].schema.properties.data
    ).toEqual({ $ref: "#/components/schemas/SocialActivityStatus" });
    expect(document.components.schemas.RealtimeParticipant.required).toContain("needoId");
    expect(document.components.schemas.RealtimeContact.required).toContain("contactUser");
    expect(document.components.schemas.RealtimeContact.properties.contactUser).toEqual({
      $ref: "#/components/schemas/RealtimeParticipant"
    });
    expect(document.components.schemas.SocialProfileSummary.required).toContain("joinedAt");
    expect(document.components.schemas.SocialPost.properties.author).toEqual({
      $ref: "#/components/schemas/SocialProfileSummary"
    });
    expect(document.components.schemas.SocialPost.required).toEqual(
      expect.arrayContaining(["replyToPostId", "replyCount"])
    );
    expect(document.components.schemas.SocialPost.properties).toMatchObject({
      replyToPostId: { type: "integer", nullable: true, minimum: 1 },
      replyCount: { type: "integer", minimum: 0 }
    });
    expect(
      (document.paths["/api/v1/social/posts"] as { get: { parameters: unknown[] } }).get.parameters
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "replyToPostId",
          in: "query",
          schema: { type: "integer", minimum: 1 }
        })
      ])
    );
    const socialCreateMedia = (
      document.paths["/api/v1/social/posts"] as {
        post: {
          requestBody: {
            content: Record<string, { schema: { properties: Record<string, unknown> } }>;
          };
        };
      }
    ).post.requestBody.content["application/json"].schema.properties.media as {
      properties: Record<string, unknown>;
    };
    const socialPatchMedia = (
      document.paths["/api/v1/social/posts/{id}"] as {
        patch: {
          requestBody: {
            content: Record<string, { schema: { properties: Record<string, unknown> } }>;
          };
        };
      }
    ).patch.requestBody.content["application/json"].schema.properties.media as {
      properties: Record<string, unknown>;
    };
    const expectedRichText = {
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
                  value: {
                    type: "string",
                    enum: ["OK", "NO", "Pending", "+1", "Done", "Cool", "Good", "Thanks"]
                  }
                }
              }
            ]
          }
        }
      }
    };
    expect(socialCreateMedia.properties.richText).toEqual(expectedRichText);
    expect(socialPatchMedia.properties.richText).toEqual(expectedRichText);
    expect(document.components.schemas.SocialActivityStatus.properties.status.enum).toEqual([
      "recent_posts",
      "no_recent_posts"
    ]);
  });

  it("keeps the additive public-identifier foundation out of runtime contracts until cutover", () => {
    const document = createOpenApiDocument(env) as {
      paths: Record<string, unknown>;
      components: {
        schemas: Record<string, { properties?: Record<string, unknown> }>;
      };
    };

    for (const schemaName of ["AuthMe", "RealtimeParticipant", "SocialProfileSummary"]) {
      expect(document.components.schemas[schemaName]?.properties).not.toHaveProperty("accountNo");
      expect(document.components.schemas[schemaName]?.properties).not.toHaveProperty("publicId");
      expect(document.components.schemas[schemaName]?.properties).not.toHaveProperty(
        "primaryIdentityType"
      );
    }
    expect(document.paths).not.toHaveProperty("/api/v1/public-identifiers");
    expect(document.paths).not.toHaveProperty("/api/v1/public-identifiers/{publicId}");
  });

  it("documents the configured access-token lifetime instead of a fixed default", () => {
    const document = createOpenApiDocument({
      ...env,
      AUTH_ACCESS_TOKEN_TTL_SECONDS: 600
    }) as {
      components: {
        schemas: Record<string, { properties?: Record<string, unknown> }>;
      };
    };

    const schemas = document.components.schemas;
    expect(schemas.TokenPair.properties?.expiresIn).toEqual({ type: "integer", enum: [600] });
    expect(schemas.TokenPairWithNeedoId.properties?.expiresIn).toEqual({
      type: "integer",
      enum: [600]
    });
    expect(schemas.GoogleCredentialResult).toEqual(
      expect.objectContaining({
        oneOf: expect.arrayContaining([
          expect.objectContaining({
            properties: expect.objectContaining({
              expiresIn: { type: "integer", enum: [600] }
            })
          })
        ])
      })
    );
  });

  it("documents the authenticated affiliate profile and redacted activation contracts", () => {
    type Operation = {
      security: Array<Record<string, unknown>>;
      responses: Record<
        string,
        {
          content: {
            "application/json": {
              schema: { properties: { data: unknown } };
            };
          };
        }
      >;
      requestBody: {
        content: Record<string, { schema: Record<string, string> }>;
      };
      parameters: unknown[];
    };
    type Schema = {
      additionalProperties?: boolean;
      properties: Record<string, { pattern?: string }>;
    };
    const document = createOpenApiDocument(env) as unknown as {
      paths: Record<string, Record<"get" | "patch" | "post" | "delete", Operation>>;
      components: { schemas: Record<string, Schema> };
    };
    const profilePath = document.paths["/api/v1/affiliate/profile"];
    const channelCollectionPath = document.paths["/api/v1/affiliate/profile/channels"];
    const channelPath = document.paths["/api/v1/affiliate/profile/channels/{channelId}"];

    expect(profilePath.get.security).toEqual([{ bearerAuth: [] }]);
    expect(profilePath.patch.security).toEqual([{ bearerAuth: [] }]);
    expect(channelCollectionPath.post.security).toEqual([{ bearerAuth: [] }]);
    expect(channelPath.patch.security).toEqual([{ bearerAuth: [] }]);
    expect(channelPath.delete.security).toEqual([{ bearerAuth: [] }]);

    for (const operation of [
      profilePath.get,
      profilePath.patch,
      channelCollectionPath.post,
      channelPath.patch,
      channelPath.delete
    ]) {
      expect(operation.responses).toEqual(
        expect.objectContaining({
          "400": expect.any(Object),
          "401": expect.any(Object),
          "403": expect.any(Object),
          "404": expect.any(Object),
          "409": expect.any(Object)
        })
      );
    }

    expect(document.components.schemas.AffiliateProfile.properties.needoId.pattern).toBe(
      "^(?:u|needo)[0-9]{10}$"
    );
    for (const schemaName of [
      "AffiliateProfileUpdate",
      "AffiliateChannelCreate",
      "AffiliateChannelUpdate"
    ]) {
      expect(document.components.schemas[schemaName].additionalProperties).toBe(false);
    }
    expect(profilePath.patch.requestBody.content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/AffiliateProfileUpdate"
    });
    expect(channelPath.delete.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "channelId", in: "path", required: true }),
        expect.objectContaining({
          name: "expected_profile_version",
          in: "query",
          required: true
        })
      ])
    );

    const activation = document.paths["/api/v1/identity-activations/affiliate"].post;
    expect(activation.responses["200"].content["application/json"].schema.properties.data).toEqual({
      $ref: "#/components/schemas/AffiliateIdentityActivation"
    });
    const publicContract = JSON.stringify({
      response: activation.responses["200"],
      schema: document.components.schemas.AffiliateIdentityActivation
    });
    expect(publicContract).not.toMatch(/"(?:userId|identityId|identityType|roleCode)"/);
    expect(publicContract).not.toContain("scout");
  });

  it("documents strict authenticated affiliate alliance read and create contracts", () => {
    type Operation = {
      security: Array<Record<string, unknown>>;
      requestBody?: { content: Record<string, { schema: Record<string, string> }> };
      responses: Record<string, unknown>;
    };
    type Schema = {
      additionalProperties?: boolean;
      required?: string[];
      properties: Record<string, unknown>;
    };
    const document = createOpenApiDocument(env) as unknown as {
      paths: Record<string, Record<"get" | "post", Operation>>;
      components: { schemas: Record<string, Schema> };
    };
    const mine = document.paths["/api/v1/affiliate/alliances/me"].get;
    const create = document.paths["/api/v1/affiliate/alliances"].post;

    expect(mine.security).toEqual([{ bearerAuth: [] }]);
    expect(create.security).toEqual([{ bearerAuth: [] }]);
    for (const operation of [mine, create]) {
      expect(operation.responses).toEqual(
        expect.objectContaining({
          "400": expect.any(Object),
          "401": expect.any(Object),
          "403": expect.any(Object),
          "409": expect.any(Object)
        })
      );
    }
    expect(create.requestBody?.content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/AffiliateAllianceCreate"
    });
    expect(document.components.schemas.AffiliateAllianceCreate.additionalProperties).toBe(false);
    expect(document.components.schemas.AffiliateAllianceCreate.required).toEqual([
      "name",
      "defaultPromoterShareBps"
    ]);
    const publicContract = JSON.stringify({
      mine,
      create,
      schemas: Object.fromEntries(
        Object.entries(document.components.schemas).filter(([name]) =>
          name.startsWith("AffiliateAlliance")
        )
      )
    });
    expect(publicContract).toContain("needoId");
    expect(publicContract).toContain("canViewAllianceWallet");
    expect(publicContract).not.toMatch(/userId|identityId|scout/);
  });

  it("documents all paginated alliance invitation operations and exact permissions", () => {
    type Operation = {
      security: Array<Record<string, unknown>>;
      parameters?: Array<Record<string, unknown>>;
      requestBody?: { content: Record<string, { schema: Record<string, string> }> };
      responses: Record<string, unknown>;
      "x-permission": string;
    };
    type Schema = { additionalProperties?: boolean; properties?: Record<string, unknown> };
    const document = createOpenApiDocument(env) as unknown as {
      paths: Record<string, Record<string, Operation>>;
      components: { schemas: Record<string, Schema> };
    };
    const operations = [
      ["/api/v1/affiliate/alliances/me/members", "get", "affiliate-alliance:members:list"],
      [
        "/api/v1/affiliate/alliances/me/eligible-contacts",
        "get",
        "affiliate-alliance:candidates:list"
      ],
      ["/api/v1/affiliate/alliances/me/invitations", "get", "affiliate-alliance:invitations:list"],
      ["/api/v1/affiliate/alliances/me/invitations", "post", "button:affiliate-alliance-invite"],
      ["/api/v1/affiliate/alliance-invitations/mine", "get", "affiliate-alliance:invitations:list"],
      [
        "/api/v1/affiliate/alliance-invitations/{id}/accept",
        "post",
        "button:affiliate-alliance-invitation-respond"
      ],
      [
        "/api/v1/affiliate/alliance-invitations/{id}/reject",
        "post",
        "button:affiliate-alliance-invitation-respond"
      ]
    ] as const;

    for (const [path, method, permissionCode] of operations) {
      const operation = document.paths[path]?.[method];
      expect(operation).toBeDefined();
      expect(operation.security).toEqual([{ bearerAuth: [] }]);
      expect(operation["x-permission"]).toBe(permissionCode);
      expect(operation.responses).toEqual(
        expect.objectContaining({
          "400": expect.any(Object),
          "401": expect.any(Object),
          "403": expect.any(Object),
          "404": expect.any(Object),
          "409": expect.any(Object)
        })
      );
    }

    expect(
      document.paths["/api/v1/affiliate/alliances/me/invitations"].post.requestBody?.content[
        "application/json"
      ].schema
    ).toEqual({ $ref: "#/components/schemas/AffiliateAllianceInvitationCreate" });
    for (const path of [
      "/api/v1/affiliate/alliance-invitations/{id}/accept",
      "/api/v1/affiliate/alliance-invitations/{id}/reject"
    ]) {
      const operation = document.paths[path].post;
      expect(operation.requestBody?.content["application/json"].schema).toEqual({
        $ref: "#/components/schemas/StrictEmptyBody"
      });
      expect(operation.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "id", in: "path", required: true })
        ])
      );
    }
    for (const schemaName of [
      "AffiliateAlliancePublicPerson",
      "AffiliateAllianceMember",
      "AffiliateAllianceInvitation",
      "AffiliateAllianceInvitationCreate",
      "StrictEmptyBody"
    ]) {
      expect(document.components.schemas[schemaName]).toBeDefined();
      expect(document.components.schemas[schemaName].additionalProperties).toBe(false);
    }
    const publicSchemaNames = [
      "AffiliateAlliancePublicPerson",
      "AffiliateAllianceMemberParent",
      "AffiliateAllianceMember",
      "AffiliateAllianceInvitation",
      "AffiliateAllianceMemberPage",
      "AffiliateAllianceCandidatePage",
      "AffiliateAllianceInvitationPage",
      "AffiliateAllianceInvitationCreate",
      "AffiliateAllianceInvitationCreated",
      "AffiliateAllianceInvitationAccepted",
      "StrictEmptyBody"
    ];
    const publicContract = JSON.stringify({
      operations,
      schemas: Object.fromEntries(
        publicSchemaNames.map((schemaName) => [schemaName, document.components.schemas[schemaName]])
      )
    });
    expect(publicContract).not.toMatch(/passwordHash|email|phone|identityId|bankAccount|ekyc/);
  });

  it("documents the complete localized Affiliate announcement lifecycle without public internals", () => {
    type Operation = {
      description: string;
      security: Array<Record<string, unknown>>;
      parameters?: Array<Record<string, unknown>>;
      requestBody?: { content: Record<string, { schema: Record<string, unknown> }> };
      responses: Record<string, { description?: string }>;
      "x-permission": string;
    };
    const document = createOpenApiDocument(env) as unknown as {
      paths: Record<string, Record<string, Operation>>;
      components: { schemas: Record<string, Record<string, unknown>> };
    };
    const base = "/api/v1/backoffice/affiliate/announcements";
    const release = `${base}/{publicId}/releases/{releaseId}`;
    const operations = [
      [base, "get", "page:backoffice-affiliate-announcement"],
      [base, "post", "button:backoffice-affiliate-announcement-edit"],
      [`${base}/{publicId}/history`, "get", "page:backoffice-affiliate-announcement"],
      [release, "get", "page:backoffice-affiliate-announcement"],
      [release, "patch", "button:backoffice-affiliate-announcement-edit"],
      [`${release}/preview`, "get", "page:backoffice-affiliate-announcement"],
      [`${release}/publish`, "post", "button:backoffice-affiliate-announcement-publish"],
      [`${release}/schedule`, "post", "button:backoffice-affiliate-announcement-publish"],
      [`${release}/disable`, "post", "button:backoffice-affiliate-announcement-publish"],
      [`${release}/rollback`, "post", "button:backoffice-affiliate-announcement-publish"],
      ["/api/v1/affiliate/announcements/{publicId}", "get", "page:affiliate-marketplace"]
    ] as const;

    for (const [path, method, permission] of operations) {
      const operation = document.paths[path]?.[method];
      expect(operation).toBeDefined();
      expect(operation.security).toEqual([{ bearerAuth: [] }]);
      expect(operation["x-permission"]).toBe(permission);
      expect(operation.responses).toEqual(
        expect.objectContaining({
          "400": expect.any(Object),
          "401": expect.any(Object),
          "403": expect.any(Object),
          "404": expect.any(Object),
          "409": expect.any(Object)
        })
      );
      expect(operation.responses["400"].description).toContain("error.validation");
    }

    expect(document.paths[base].post.requestBody?.content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/OfficialAnnouncementDraftCreate"
    });
    expect(document.paths[release].patch.requestBody?.content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/OfficialAnnouncementDraftMutation"
    });
    expect(
      document.paths[`${release}/schedule`].post.requestBody?.content["application/json"].schema
    ).toEqual({ $ref: "#/components/schemas/ContentScheduleCommand" });
    expect(
      document.paths[`${release}/rollback`].post.requestBody?.content["application/json"].schema
    ).toEqual({ $ref: "#/components/schemas/ContentRollbackCommand" });

    const createSchema = document.components.schemas.OfficialAnnouncementDraftCreate as {
      additionalProperties: boolean;
      required: string[];
    };
    expect(createSchema.additionalProperties).toBe(false);
    expect(createSchema.required).toEqual(["idempotencyKey", "sourceLocale", "translation"]);
    const protectedPayload = JSON.stringify({
      payload: document.components.schemas.OfficialAnnouncementProtectedPayload,
      translation: document.components.schemas.OfficialAnnouncementProtectedTranslation
    });
    expect(protectedPayload).toContain("translations");
    expect(protectedPayload).toContain("sourceLocale");
    expect(protectedPayload).toContain("isInitialCopy");
    const publicPayload = JSON.stringify(
      document.components.schemas.OfficialAnnouncementPublicPayload
    );
    expect(publicPayload).toContain("locale");
    expect(publicPayload).toContain("taskAction");
    expect(publicPayload).not.toMatch(
      /releaseId|affiliateTaskId|translations|createdBy|updatedBy|publishedBy|disabledBy/
    );
    const publicOperation = document.paths["/api/v1/affiliate/announcements/{publicId}"].get;
    expect(publicOperation.description).toContain("active Affiliate identity");
    expect(publicOperation.description).toContain("scout");
    expect(publicOperation.responses["403"].description).toContain(
      "error.affiliate_profile.identity_required"
    );
    expect(publicOperation.responses["403"].description).toContain("scout");
    const lifecycleContract = JSON.stringify({
      operations: Object.fromEntries(
        operations.map(([path, method]) => [`${method}:${path}`, document.paths[path][method]])
      ),
      schemas: Object.fromEntries(
        Object.entries(document.components.schemas).filter(([name]) =>
          /OfficialAnnouncement|Content(?:Publish|Schedule|Disable|Rollback)/.test(name)
        )
      )
    });
    for (const errorKey of [
      "error.content.locale_invalid",
      "error.content.not_found",
      "error.content.release_not_found",
      "error.content.draft_exists",
      "error.content.lock_conflict",
      "error.content.incomplete_translations",
      "error.content.schedule_conflict",
      "error.content.target_unavailable",
      "error.content.invalid_state_transition",
      "error.idempotency_key_reused"
    ]) {
      expect(lifecycleContract).toContain(errorKey);
    }
  });

  it("documents both fixed carousel scenes, target search, copy-to-all, and public-safe payloads", () => {
    type CarouselOperation = {
      security: Array<Record<string, unknown>>;
      parameters: Array<{ name: string }>;
      responses: Record<string, unknown>;
      "x-permission": string;
    };
    const document = createOpenApiDocument(env) as unknown as {
      paths: Record<string, Record<string, CarouselOperation>>;
      components: { schemas: Record<string, Record<string, unknown>> };
    };
    const scenes = [
      [
        "user-home",
        "page:backoffice-user-home-carousel",
        "button:backoffice-user-home-carousel-edit",
        "button:backoffice-user-home-carousel-publish"
      ],
      [
        "affiliate-home-notice",
        "page:backoffice-affiliate-notice-carousel",
        "button:backoffice-affiliate-notice-carousel-edit",
        "button:backoffice-affiliate-notice-carousel-publish"
      ]
    ] as const;
    for (const [slug, read, edit, publish] of scenes) {
      const base = `/api/v1/backoffice/content/carousels/${slug}`;
      const release = `${base}/releases/{releaseId}`;
      const operations = [
        [base, "get", read],
        [base + "/releases", "post", edit],
        [base + "/history", "get", read],
        [base + "/targets", "get", read],
        [release, "get", read],
        [release, "patch", edit],
        [release + "/slides/{slidePublicId}/locales/{locale}", "patch", edit],
        [release + "/slides/{slidePublicId}/copy-to-all", "post", edit],
        [release + "/preview", "get", read],
        [release + "/publish", "post", publish],
        [release + "/schedule", "post", publish],
        [release + "/disable", "post", publish],
        [release + "/rollback", "post", publish]
      ] as const;
      for (const [path, method, permission] of operations) {
        expect(document.paths[path]?.[method]).toEqual(
          expect.objectContaining({
            security: [{ bearerAuth: [] }],
            "x-permission": permission,
            responses: expect.objectContaining({
              "400": expect.any(Object),
              "401": expect.any(Object),
              "403": expect.any(Object),
              "404": expect.any(Object),
              "409": expect.any(Object)
            })
          })
        );
      }
      expect(document.paths[base + "/targets"].get.parameters.map((value) => value.name)).toEqual(
        expect.arrayContaining(["type", "q", "page", "pageSize"])
      );
      const expectedPrefix = slug === "user-home" ? "CarouselUserHome" : "CarouselAffiliateNotice";
      type RequestBodyOperation = {
        requestBody: { content: Record<string, { schema: { $ref: string } }> };
      };
      expect(
        (document.paths[base + "/releases"].post as unknown as RequestBodyOperation).requestBody
          .content["application/json"].schema.$ref
      ).toBe(`#/components/schemas/${expectedPrefix}DraftCreate`);
      expect(
        (document.paths[release].patch as unknown as RequestBodyOperation).requestBody.content[
          "application/json"
        ].schema.$ref
      ).toBe(`#/components/schemas/${expectedPrefix}DraftReplace`);
      expect(
        (
          document.paths[release + "/slides/{slidePublicId}/locales/{locale}"]
            .patch as unknown as RequestBodyOperation
        ).requestBody.content["application/json"].schema.$ref
      ).toBe("#/components/schemas/CarouselLocaleMutation");
    }
    expect(document.paths["/api/v1/content/carousels/user-home"].get).toBeDefined();
    expect(document.paths["/api/v1/affiliate/content/carousel"].get["x-permission"]).toBe(
      "page:affiliate-marketplace"
    );
    const publicPayload = JSON.stringify({
      payload: document.components.schemas.PublishedCarouselPayload,
      target: document.components.schemas.PublishedCarouselTarget
    });
    expect(publicPayload).toContain("releaseVersion");
    expect(publicPayload).toContain("publicId");
    expect(publicPayload).not.toMatch(
      /shopId|technicianProfileId|serviceId|announcementId|affiliateTaskId|releaseId/
    );
    const targetSearch = JSON.stringify({
      page: document.components.schemas.CarouselTargetSearchPage,
      item: document.components.schemas.CarouselTargetSearchItem
    });
    expect(targetSearch).toContain("publicId");
    expect(targetSearch).toContain("taskCode");
    expect(targetSearch).toContain("target");
    expect(targetSearch).not.toMatch(
      /shopId|technicianProfileId|serviceId|announcementId|affiliateTaskId/
    );
    const userCreate = JSON.stringify(document.components.schemas.CarouselUserHomeCreateSlideInput);
    const affiliateCreate = JSON.stringify(
      document.components.schemas.CarouselAffiliateNoticeCreateSlideInput
    );
    const userReplace = JSON.stringify(
      document.components.schemas.CarouselUserHomeReplaceSlideInput
    );
    expect(userCreate).toContain("CarouselUserHomeTargetInput");
    expect(JSON.stringify(document.components.schemas.CarouselUserHomeTargetInput)).not.toContain(
      "affiliate_announcement"
    );
    expect(affiliateCreate).toContain("CarouselAffiliateNoticeTargetInput");
    expect(
      JSON.stringify(document.components.schemas.CarouselAffiliateNoticeTargetInput)
    ).not.toContain("technicianProfileId");
    expect(userCreate).toContain('"minItems":1');
    expect(userCreate).toContain('"maxItems":1');
    expect(userReplace).toContain("CarouselFiveTranslations");
    expect(JSON.stringify(document.components.schemas.CarouselFiveTranslations)).toContain(
      '"minItems":5'
    );
    expect(JSON.stringify(document.components.schemas.CarouselFiveTranslations)).toContain(
      '"maxItems":5'
    );
    expect(document.components.schemas.CarouselTranslation).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          mediaAssetPublicId: {
            type: "string",
            nullable: true,
            pattern: "^[a-f0-9]{64}$"
          },
          imageUrl: { type: "string", format: "uri-reference" }
        })
      })
    );
    expect(document.components.schemas.CarouselUserHomeTargetInput).toEqual(
      expect.objectContaining({
        oneOf: expect.arrayContaining([
          expect.objectContaining({ properties: { type: { const: "none" } } })
        ])
      })
    );
    expect(document.components.schemas.PublishedCarouselTarget).toEqual(
      expect.objectContaining({
        oneOf: expect.arrayContaining([
          expect.objectContaining({ properties: { type: { const: "none" } } })
        ])
      })
    );
    expect(document.components.schemas.CarouselLocaleMutation).toEqual({
      oneOf: [
        { $ref: "#/components/schemas/CarouselLocaleUpdate" },
        { $ref: "#/components/schemas/CarouselLocaleCopyCommand" }
      ]
    });
  });

  it("documents canonical Service UUID and legacy numeric identifiers on the same detail route", () => {
    const document = createOpenApiDocument(env) as unknown as {
      paths: Record<
        string,
        Record<
          string,
          {
            parameters: Array<Record<string, unknown>>;
            responses: Record<
              string,
              { content: Record<string, { schema: Record<string, unknown> }> }
            >;
          }
        >
      >;
      components: {
        schemas: Record<string, { required?: string[]; properties?: Record<string, unknown> }>;
      };
    };
    const operation = document.paths["/api/v1/services/{id}"].get;
    const id = operation.parameters.find((parameter) => parameter.name === "id") as {
      schema: { oneOf: Array<Record<string, unknown>> };
    };

    expect(id.schema.oneOf).toEqual([
      { type: "integer", minimum: 1 },
      { type: "string", format: "uuid" }
    ]);
    expect(document.components.schemas.ServiceCard.required).toContain("publicId");
    expect(document.components.schemas.ServiceCard.properties).toHaveProperty("publicId", {
      type: "string",
      format: "uuid"
    });
    expect(operation.responses["200"].content["application/json"].schema).toEqual({
      type: "object",
      required: ["code", "message", "data"],
      properties: {
        code: { type: "integer", enum: [0] },
        message: { type: "string", enum: ["success"] },
        data: { $ref: "#/components/schemas/ServiceDetail" }
      }
    });
  });

  it("documents the formal platform fee policy contracts", () => {
    type Operation = {
      security: Array<Record<string, unknown>>;
      responses: Record<string, unknown>;
      requestBody?: { content: { "application/json": { schema: { $ref: string } } } };
      parameters?: Array<{ name: string; in: string }>;
    };
    type Schema = {
      additionalProperties?: boolean;
      required?: string[];
      properties: Record<string, { type?: string; pattern?: string }>;
    };
    const document = createOpenApiDocument(env) as unknown as {
      paths: Record<string, Record<"get" | "patch", Operation>>;
      components: { schemas: Record<string, Schema> };
    };
    const operations = [
      document.paths["/api/v1/backoffice/platform-fee-policy"].get,
      document.paths["/api/v1/backoffice/platform-fee-policy"].patch,
      document.paths["/api/v1/backoffice/shop-platform-fee-policies"].get,
      document.paths["/api/v1/backoffice/shops/{shopId}/platform-fee-policy"].patch,
      document.paths["/api/v1/merchant-admin/shops/{shopId}/platform-fee-policy"].get,
      document.paths["/api/v1/merchant-admin/shops/{shopId}/platform-fee-policy/payer"].patch
    ];

    for (const operation of operations) {
      expect(operation.security).toEqual([{ bearerAuth: [] }]);
      expect(operation.responses).toEqual(
        expect.objectContaining({
          "400": expect.any(Object),
          "401": expect.any(Object),
          "403": expect.any(Object),
          "409": expect.any(Object)
        })
      );
    }
    expect(document.paths["/api/v1/backoffice/shop-platform-fee-policies"].get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "page", in: "query" }),
        expect.objectContaining({ name: "pageSize", in: "query" })
      ])
    );
    for (const schemaName of [
      "GlobalPlatformFeeUpdateRequest",
      "ShopFeeEnabledUpdateRequest",
      "ShopFeePayerUpdateRequest"
    ]) {
      expect(document.components.schemas[schemaName].additionalProperties).toBe(false);
    }
    expect(document.components.schemas.ShopPlatformFeePolicy.properties.shopId.type).toBe(
      "integer"
    );
    expect(document.components.schemas.ShopPlatformFeePolicy.properties.shopPublicId.pattern).toBe(
      "^shop[0-9]{10}$"
    );
    expect(document.components.schemas).toEqual(
      expect.objectContaining({
        GlobalBookingPlatformFee: expect.any(Object),
        ShopPlatformFeePolicy: expect.any(Object),
        ShopPlatformFeePolicyPage: expect.any(Object)
      })
    );
  });

  it("documents the formal order acceptance pause contracts", () => {
    type Operation = {
      security: Array<Record<string, unknown>>;
      responses: Record<string, unknown>;
      requestBody?: { content: { "application/json": { schema: { $ref: string } } } };
      parameters?: Array<{ name: string; in: string }>;
    };
    type Schema = {
      additionalProperties?: boolean;
      required?: string[];
      properties: Record<string, { type?: string; enum?: string[] }>;
    };
    const document = createOpenApiDocument(env) as unknown as {
      paths: Record<string, Record<"get" | "post", Operation>>;
      components: { schemas: Record<string, Schema> };
    };
    const basePaths = [
      "/api/v1/backoffice/order-acceptance-pauses",
      "/api/v1/merchant-admin/order-acceptance-pauses"
    ];
    const operations = basePaths.flatMap((path) => [
      document.paths[path].get,
      document.paths[path].post,
      document.paths[`${path}/{id}/release`].post
    ]);

    for (const operation of operations) {
      expect(operation.security).toEqual([{ bearerAuth: [] }]);
      expect(operation.responses).toEqual(
        expect.objectContaining({
          "400": expect.any(Object),
          "401": expect.any(Object),
          "403": expect.any(Object),
          "404": expect.any(Object),
          "409": expect.any(Object)
        })
      );
    }
    for (const path of basePaths) {
      expect(document.paths[path].get.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "page", in: "query" }),
          expect.objectContaining({ name: "pageSize", in: "query" }),
          expect.objectContaining({ name: "status", in: "query" }),
          expect.objectContaining({ name: "subjectType", in: "query" })
        ])
      );
      expect(document.paths[path].post.requestBody?.content["application/json"].schema).toEqual({
        $ref: "#/components/schemas/OrderAcceptancePauseCreateRequest"
      });
      expect(
        document.paths[`${path}/{id}/release`].post.requestBody?.content["application/json"].schema
      ).toEqual({ $ref: "#/components/schemas/OrderAcceptancePauseReleaseRequest" });
    }
    expect(document.components.schemas.OrderAcceptancePause.required).toEqual(
      expect.arrayContaining([
        "id",
        "subjectType",
        "subjectId",
        "authorityType",
        "status",
        "reasonCode",
        "reasonDetail",
        "startsAt"
      ])
    );
    expect(document.components.schemas.OrderAcceptancePause.properties.subjectType.enum).toEqual([
      "merchant_account",
      "shop"
    ]);
    expect(document.components.schemas.OrderAcceptancePause.properties.authorityType.enum).toEqual([
      "operations",
      "merchant",
      "shop"
    ]);
    for (const schemaName of [
      "OrderAcceptancePauseCreateRequest",
      "OrderAcceptancePauseReleaseRequest"
    ]) {
      expect(document.components.schemas[schemaName].additionalProperties).toBe(false);
    }
    expect(document.components.schemas.OrderAcceptancePauseSummary.properties).not.toHaveProperty(
      "reasonDetail"
    );
    const confirmationConflict = document.paths["/api/v1/orders/{id}/confirm"].post.responses[
      "409"
    ] as {
      content: {
        "application/json": {
          schema: {
            properties: {
              message: { enum: string[] };
              data: { properties: { pauses: { items: { $ref: string } } } };
            };
          };
        };
      };
    };
    expect(
      confirmationConflict.content["application/json"].schema.properties.message.enum
    ).toContain("error.order.acceptance_paused");
    expect(
      confirmationConflict.content["application/json"].schema.properties.data.properties.pauses
        .items
    ).toEqual({ $ref: "#/components/schemas/OrderAcceptancePauseSummary" });
  });

  it("documents the Affiliate platform fee rule history and immutable fee snapshots", () => {
    type Operation = {
      security: Array<Record<string, unknown>>;
      responses: Record<string, { description?: string }>;
      requestBody?: { content: { "application/json": { schema: { $ref: string } } } };
      parameters?: Array<{ name: string; in: string }>;
    };
    type Schema = {
      additionalProperties?: boolean;
      required?: string[];
      properties: Record<string, { type?: string | string[]; pattern?: string }>;
    };
    const document = createOpenApiDocument(env) as unknown as {
      paths: Record<string, Record<"get" | "post", Operation>>;
      components: { schemas: Record<string, Schema> };
    };
    const feeRules = document.paths["/api/v1/backoffice/affiliate/fee-rules"];
    const feeSummary = document.paths["/api/v1/backoffice/affiliate/fee-rules/summary"];
    const feeRuleShops = document.paths["/api/v1/backoffice/affiliate/fee-rule-shops"];

    for (const operation of [feeRules.get, feeRules.post]) {
      expect(operation.security).toEqual([{ bearerAuth: [] }]);
      expect(operation.responses).toEqual(
        expect.objectContaining({
          "400": expect.objectContaining({
            description: expect.stringContaining("error.validation")
          }),
          "401": expect.objectContaining({ description: expect.stringContaining("error.auth") }),
          "403": expect.objectContaining({ description: expect.stringContaining("error") }),
          "404": expect.objectContaining({
            description: expect.stringContaining("error.affiliate.platform_fee_shop_not_found")
          }),
          "409": expect.objectContaining({
            description: expect.stringContaining("error.affiliate.platform_fee")
          })
        })
      );
    }
    expect(feeRules.get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "page", in: "query" }),
        expect.objectContaining({ name: "pageSize", in: "query" }),
        expect.objectContaining({ name: "scopeType", in: "query" }),
        expect.objectContaining({ name: "shopId", in: "query" })
      ])
    );
    expect(feeRules.post.requestBody?.content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/AffiliatePlatformFeeRuleCreate"
    });
    expect(feeSummary.get.security).toEqual([{ bearerAuth: [] }]);
    expect(feeSummary.get.parameters).toEqual([
      expect.objectContaining({ name: "scopeType", in: "query" })
    ]);
    expect(feeRuleShops.get.security).toEqual([{ bearerAuth: [] }]);
    expect(feeRuleShops.get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "keyword", in: "query" }),
        expect.objectContaining({ name: "page", in: "query" }),
        expect.objectContaining({ name: "pageSize", in: "query" })
      ])
    );

    const rule = document.components.schemas.AffiliatePlatformFeeRule;
    expect(rule.additionalProperties).toBe(false);
    expect(rule.required).toEqual(
      expect.arrayContaining([
        "scopeType",
        "feeBps",
        "version",
        "effectiveFrom",
        "shopName",
        "shopCity",
        "createdByNeedoId",
        "updatedByNeedoId"
      ])
    );
    expect(rule.properties).not.toHaveProperty("createdById");
    expect(rule.properties).not.toHaveProperty("updatedById");
    expect(rule.properties.createdByNeedoId.pattern).toBe("^(?:u|needo)[0-9]{10}$");
    expect(rule.properties.updatedByNeedoId.pattern).toBe("^(?:u|needo)[0-9]{10}$");
    expect(document.components.schemas.AffiliatePlatformFeeRuleCreate.additionalProperties).toBe(
      false
    );
    expect(document.components.schemas.AffiliatePlatformFeeRulePage.required).toEqual([
      "list",
      "total",
      "page",
      "page_size"
    ]);
    expect(document.components.schemas.AffiliatePlatformFeeRuleSummary.required).toEqual([
      "evaluatedAt",
      "current",
      "nextScheduled",
      "latestVersion"
    ]);
    expect(document.components.schemas.AffiliatePlatformFeeShopOption.required).toEqual([
      "id",
      "name",
      "city"
    ]);
    expect(document.components.schemas.AffiliatePlatformFeeShopOptionPage.required).toEqual([
      "list",
      "total",
      "page",
      "page_size"
    ]);

    expect(document.components.schemas.AffiliateTask.required).toEqual(
      expect.arrayContaining([
        "platformFeeBps",
        "platformFeeReserveNdp",
        "grossReservedBudgetNdp",
        "settledPlatformFeeNdp",
        "releasedPlatformFeeNdp"
      ])
    );
    expect(document.components.schemas.AffiliateBudgetReservation.required).toEqual(
      expect.arrayContaining([
        "commissionFrozenNdp",
        "platformFeeFrozenNdp",
        "platformFeeCapturedNdp",
        "platformFeeReleasedNdp"
      ])
    );
  });

  it("documents typed multi-entity core search parameters and pages", async () => {
    const response = await request(createApp()).get("/api/v1/openapi.json").expect(200);
    const search = response.body.paths["/api/v1/search"].get;

    expect(search.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "entityType",
        schema: expect.objectContaining({ enum: ["service", "shop", "technician"] })
      }),
      expect.objectContaining({
        name: "keywords",
        style: "form",
        explode: true,
        schema: expect.objectContaining({ type: "array", maxItems: 20 })
      }),
      expect.objectContaining({
        name: "categoryIds",
        style: "form",
        explode: true,
        schema: expect.objectContaining({ type: "array", maxItems: 20 })
      })
    ]));
    expect(
      search.responses["200"].content?.["application/json"].schema.properties.data.anyOf
    ).toHaveLength(3);
    expect(
      search.responses["200"].content?.["application/json"].schema.properties.data
    ).not.toHaveProperty("oneOf");
  });
});
