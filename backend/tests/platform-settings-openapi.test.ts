import request from "supertest";
import { createApp } from "../src/app";

describe("platform settings OpenAPI contract", () => {
  it("documents public and protected settings routes with exact permissions", async () => {
    const response = await request(createApp()).get("/api/v1/openapi.json").expect(200);
    const paths = response.body.paths;

    expect(paths["/api/v1/platform/settings/public"].get.security).toBeUndefined();
    expect(paths["/api/v1/backoffice/system-settings"].get).toMatchObject({
      security: [{ bearerAuth: [] }],
      "x-required-permission": "backoffice:system-settings:read"
    });
    expect(paths["/api/v1/backoffice/system-settings/basic"].put).toMatchObject({
      security: [{ bearerAuth: [] }],
      "x-required-permission": "backoffice:system-settings:write"
    });
    expect(paths["/api/v1/backoffice/system-settings/payment"].put).toMatchObject({
      security: [{ bearerAuth: [] }],
      "x-required-permission": "backoffice:payment-settings:write"
    });
  });

  it("keeps strict write schemas and documents only implemented provider controls", async () => {
    const response = await request(createApp()).get("/api/v1/openapi.json").expect(200);
    const schemas = response.body.components.schemas;
    const basic = schemas.PlatformBasicSettingsUpdate;
    const payment = schemas.PlatformPaymentSettingsUpdate;

    expect(basic.additionalProperties).toBe(false);
    expect(basic.required).toEqual(
      expect.arrayContaining([
        "expectedVersion",
        "siteEnabled",
        "selfRegistrationEnabled",
        "googleLoginEnabled",
        "passwordLoginOtpEnabled",
        "passwordLoginOtpRule",
        "passwordLoginOtpOnNewIp",
        "anytimeServiceTestEnabled",
        "overdueAppointmentGateEnabled",
        "loginLogoMediaPublicId",
        "requestButtonMediaPublicId"
      ])
    );
    expect(basic.required).not.toContain("membershipCardFollowUiTheme");
    expect(basic.properties.membershipCardFollowUiTheme).toEqual({ type: "boolean" });
    expect(basic.properties.passwordLoginOtpRule.enum).toEqual([
      "first_login",
      "monthly_first",
      "every_login"
    ]);
    expect(basic.properties.anytimeServiceTestEnabled).toEqual({ type: "boolean" });
    expect(basic.properties.overdueAppointmentGateEnabled).toEqual({ type: "boolean" });
    expect(basic.properties.membershipCardFollowUiTheme).toEqual({ type: "boolean" });

    expect(schemas.PlatformOperationsSettings.required).toContain(
      "anytimeServiceTestEnabled"
    );
    expect(schemas.PlatformOperationsSettings.required).toContain(
      "overdueAppointmentGateEnabled"
    );

    expect(payment).toMatchObject({
      additionalProperties: false,
      required: ["expectedVersion", "offlinePaymentEnabled", "ndpPaymentEnabled"]
    });
    expect(payment.properties).not.toHaveProperty("paypayEnabled");
    expect(payment.properties).not.toHaveProperty("paypalEnabled");
    expect(payment.properties).not.toHaveProperty("stripeEnabled");

    const operations = schemas.PlatformOperationsSettings;
    expect(operations.properties.loginProviderProjects).toBeDefined();
    expect(operations.properties.paymentProviderProjects).toBeDefined();
  });
});
