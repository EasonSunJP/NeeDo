import request from "supertest";
import { createApp } from "../src/app";
import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";

describe("GET /api/v1/openapi.json", () => {
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
    expect(response.body.paths).toHaveProperty("/api/v1/auth/logout");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/me");

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
      ["/api/v1/auth/password/setup/verify", ["challengeId", "otp"]]
    ] as const;
    for (const [path, required] of strictAuthBodies) {
      const schema = response.body.paths[path].post.requestBody.content["application/json"].schema;
      expect(schema.additionalProperties).toBe(false);
      expect(schema.required ?? []).toEqual(required);
      expect(schema.properties).not.toHaveProperty("userId");
    }

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
    expect(response.body.paths).toHaveProperty("/api/v1/categories");
    expect(response.body.paths).toHaveProperty("/api/v1/services");
    expect(response.body.paths).toHaveProperty("/api/v1/services/{id}");
    expect(response.body.paths).toHaveProperty("/api/v1/home/recommendations");
    expect(response.body.paths).toHaveProperty("/api/v1/search");
    expect(response.body.paths).toHaveProperty("/api/v1/shops/{id}");
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
    expect(response.body.paths).toHaveProperty("/api/v1/wallets/{id}/ledger");
    expect(response.body.paths).toHaveProperty("/api/v1/finance/ledger/transactions");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/dashboard");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/orders");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/schedule");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/finance/settlements");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/finance/settlements/export");
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
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/orders");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/schedule");
    expect(response.body.paths["/api/v1/merchant-admin/dashboard"].get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          in: "header",
          name: "X-NeeDo-Merchant-Preview-Shop-Id"
        })
      ])
    );
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
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/pay-runs");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/pay-runs/export");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/pay-runs/{id}");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/pay-runs/{id}/publish");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/pay-runs/{id}/approve");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/pay-runs/{id}/lock");
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
      response.body.paths[
        "/api/v1/im/conversations/{conversationId}/messages/{messageId}/recall"
      ]
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
    expect(
      response.body.paths[
        "/api/v1/im/conversations/{conversationId}/messages/{messageId}/reactions"
      ]
    ).toMatchObject({ put: expect.any(Object), delete: expect.any(Object) });
    expect(response.body.paths).toHaveProperty("/api/v1/im/conversations/{conversationId}/read");
    expect(response.body.paths).toHaveProperty("/api/v1/im/contacts");
    expect(response.body.paths).toHaveProperty("/api/v1/im/friend-requests");
    expect(response.body.paths).toHaveProperty("/api/v1/im/friend-requests/{id}/accept");
    expect(response.body.paths).toHaveProperty("/api/v1/im/friend-requests/{id}/reject");
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
    expect(response.body.components.schemas).toHaveProperty("LedgerTransaction");
    expect(response.body.components.schemas.RealtimeMessage.required).toEqual(
      expect.arrayContaining([
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
    expect(response.body.components.schemas).toHaveProperty("RealtimeMessage");
    expect(response.body.components.schemas.RealtimeMessage.required).toContain("reactions");
    expect(response.body.components.schemas).toHaveProperty("RealtimeMessageReaction");
    expect(response.body.components.schemas).toHaveProperty("RealtimeContact");
    expect(response.body.components.schemas).toHaveProperty("FriendRequest");
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
        "membershipLevel"
      ])
    );
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
});
