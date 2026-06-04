import request from "supertest";
import { createApp } from "../src/app";

describe("GET /api/v1/openapi.json", () => {
  it("describes the health endpoint with the versioned API prefix", async () => {
    const response = await request(createApp()).get("/api/v1/openapi.json").expect(200);

    expect(response.body.openapi).toBe("3.1.0");
    expect(response.body.paths).toHaveProperty("/api/v1/health");
    expect(response.body.paths).toHaveProperty("/api/v1/ready");
    expect(response.body.paths).toHaveProperty("/api/v1/metrics");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/login");
    expect(response.body.paths).not.toHaveProperty("/api/v1/auth/test-login");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/otp/send");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/otp/verify");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/refresh");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/logout");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/me");
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
    expect(response.body.paths).toHaveProperty("/api/v1/bookings");
    expect(response.body.paths).toHaveProperty("/api/v1/orders");
    expect(response.body.paths).toHaveProperty("/api/v1/orders/{id}");
    expect(response.body.paths).toHaveProperty("/api/v1/orders/{id}/confirm");
    expect(response.body.paths).toHaveProperty("/api/v1/orders/{id}/cancel");
    expect(response.body.paths).toHaveProperty("/api/v1/orders/{id}/start");
    expect(response.body.paths).toHaveProperty("/api/v1/orders/{id}/complete");
    expect(response.body.paths).toHaveProperty("/api/v1/wallets/me");
    expect(response.body.paths).toHaveProperty("/api/v1/wallets/{id}/ledger");
    expect(response.body.paths).toHaveProperty("/api/v1/finance/ledger/transactions");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/dashboard");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/orders");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/schedule");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/finance/settlements");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/finance/settlements/export");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/technicians");
    expect(response.body.paths).toHaveProperty("/api/v1/backoffice/shops");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/dashboard");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/orders");
    expect(response.body.paths).toHaveProperty("/api/v1/merchant-admin/schedule");
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
    expect(response.body.paths).toHaveProperty("/api/v1/im/conversations");
    expect(response.body.paths).toHaveProperty(
      "/api/v1/im/conversations/{conversationId}/messages"
    );
    expect(response.body.paths).toHaveProperty("/api/v1/im/conversations/{conversationId}/read");
    expect(response.body.paths).toHaveProperty("/api/v1/im/contacts");
    expect(response.body.paths).toHaveProperty("/api/v1/im/friend-requests");
    expect(response.body.paths).toHaveProperty("/api/v1/im/friend-requests/{id}/accept");
    expect(response.body.paths).toHaveProperty("/api/v1/im/friend-requests/{id}/reject");
    expect(response.body.paths).toHaveProperty("/api/v1/social/posts");
    expect(response.body.paths).toHaveProperty("/api/v1/social/follows");
    expect(response.body.paths).toHaveProperty("/api/v1/social/follows/{targetUserId}");
    expect(response.body.paths).toHaveProperty("/api/v1/notifications");
    expect(response.body.paths).toHaveProperty("/api/v1/notifications/{id}/read");
    expect(response.body.paths).toHaveProperty("/api/v1/notifications/read-all");
    expect(response.body.paths).toHaveProperty("/api/v1/realtime/unread-counts");
    expect(response.body.paths).toHaveProperty("/api/v1/realtime/events");
    expect(response.body.paths).toHaveProperty("/api/v1/finance/reconciliation");
    expect(response.body.paths).toHaveProperty("/api/v1/finance/reconciliation/export");
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
    expect(response.body.components.schemas).toHaveProperty("CustomerProfile");
    expect(response.body.components.schemas).toHaveProperty("ScheduleSlot");
    expect(response.body.components.schemas).toHaveProperty("BookingOrder");
    expect(response.body.components.schemas).toHaveProperty("Wallet");
    expect(response.body.components.schemas).toHaveProperty("LedgerTransaction");
    expect(response.body.components.schemas).toHaveProperty("FinanceReconciliation");
    expect(response.body.components.schemas).toHaveProperty("ShopFinanceRuleSet");
    expect(response.body.components.schemas).toHaveProperty("ShopFinanceRulePreviewResult");
    expect(response.body.components.schemas).toHaveProperty("OrderFinanceDetail");
    expect(response.body.components.schemas).toHaveProperty("TechnicianCompensationProfile");
    expect(response.body.components.schemas).toHaveProperty("CompensationProfilePreviewResult");
    expect(response.body.components.schemas).toHaveProperty("PayrollCsvExport");
    expect(response.body.components.schemas).toHaveProperty("PayrollAdjustmentRequest");
    expect(response.body.components.schemas).toHaveProperty("RealtimeConversation");
    expect(response.body.components.schemas).toHaveProperty("RealtimeMessage");
    expect(response.body.components.schemas).toHaveProperty("RealtimeContact");
    expect(response.body.components.schemas).toHaveProperty("FriendRequest");
    expect(response.body.components.schemas).toHaveProperty("SocialPost");
    expect(response.body.components.schemas).toHaveProperty("Follow");
    expect(response.body.components.schemas).toHaveProperty("Notification");
    expect(response.body.components.schemas).toHaveProperty("RealtimeUnreadCounts");

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
  });
});
