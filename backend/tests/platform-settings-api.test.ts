import request from "supertest";
import { createStep06Fixture } from "./helpers/step06-fixture";

const publicSettings = {
  version: 4,
  siteEnabled: true,
  selfRegistrationEnabled: true,
  loginMethods: { password: true as const, google: true },
  loginLogo: null,
  requestButton: null,
  paymentMethods: ["cash", "ndp"] as const,
  membershipCardFollowUiTheme: true
};

const operationsSettings = {
  id: 4,
  publicId: "00000000-0000-4000-8000-000000000004",
  version: 4,
  siteEnabled: true,
  selfRegistrationEnabled: true,
  googleLoginEnabled: true,
  passwordLoginOtpEnabled: false,
  passwordLoginOtpRule: "first_login" as const,
  passwordLoginOtpOnNewIp: false,
  anytimeServiceTestEnabled: false,
  overdueAppointmentGateEnabled: false,
  membershipCardFollowUiTheme: true,
  loginLogoMediaAssetId: null,
  requestButtonMediaAssetId: null,
  offlinePaymentEnabled: true,
  ndpPaymentEnabled: true,
  createdByUserId: null,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
  loginLogo: null,
  requestButton: null,
  loginProviderProjects: [
    { code: "apple", configured: false, enabled: false, actionable: false },
    { code: "line", configured: false, enabled: false, actionable: false }
  ],
  paymentProviderProjects: [
    { code: "paypay", configured: false, enabled: false, actionable: false },
    { code: "paypal", configured: false, enabled: false, actionable: false },
    { code: "stripe", configured: false, enabled: false, actionable: false }
  ]
};

const basicBody = {
  expectedVersion: 4,
  siteEnabled: false,
  selfRegistrationEnabled: true,
  googleLoginEnabled: true,
  passwordLoginOtpEnabled: true,
  passwordLoginOtpRule: "monthly_first",
  passwordLoginOtpOnNewIp: true,
  anytimeServiceTestEnabled: true,
  overdueAppointmentGateEnabled: true,
  membershipCardFollowUiTheme: true,
  loginLogoMediaPublicId: null,
  requestButtonMediaPublicId: null
};

const createService = () => ({
  getPublic: jest.fn(async () => publicSettings),
  getForOperations: jest.fn(async () => operationsSettings),
  updateBasic: jest.fn(async () => ({ ...operationsSettings, version: 5 })),
  updatePayment: jest.fn(async () => ({
    ...operationsSettings,
    version: 5,
    offlinePaymentEnabled: false
  }))
});

describe("platform settings API", () => {
  it("exposes only the public projection without authentication", async () => {
    const service = createService();
    const fixture = await createStep06Fixture({ platformSettingsService: service } as never);

    const response = await request(fixture.app).get("/api/v1/platform/settings/public").expect(200);

    const { membershipCardFollowUiTheme, ...legacySettings } = publicSettings;
    expect(membershipCardFollowUiTheme).toBe(true);
    expect(response.body.data).toEqual(legacySettings);
    const extended = await request(fixture.app).get("/api/v1/platform/settings/public?cardTheme=1").expect(200);
    expect(extended.body.data).toEqual(publicSettings);
    expect(response.body.data).not.toHaveProperty("id");
    expect(response.body.data).not.toHaveProperty("passwordLoginOtpRule");
    expect(service.getPublic).toHaveBeenCalledTimes(2);
  });

  it("requires the read permission for the operations projection", async () => {
    const service = createService();
    const fixture = await createStep06Fixture({ platformSettingsService: service } as never);
    fixture.replaceAdminPermissions([]);
    const token = await fixture.loginAsAdmin();

    await request(fixture.app)
      .get("/api/v1/backoffice/system-settings")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);

    fixture.replaceAdminPermissions(["backoffice:system-settings:read"]);
    const allowedToken = await fixture.loginAsAdmin();
    const response = await request(fixture.app)
      .get("/api/v1/backoffice/system-settings")
      .set("Authorization", `Bearer ${allowedToken}`)
      .expect(200);

    expect(response.body.data.loginProviderProjects).toEqual(
      operationsSettings.loginProviderProjects
    );
    expect(response.body.data.paymentProviderProjects).toEqual(
      operationsSettings.paymentProviderProjects
    );
  });

  it("strictly validates and forwards basic setting updates", async () => {
    const service = createService();
    const fixture = await createStep06Fixture({ platformSettingsService: service } as never);
    fixture.replaceAdminPermissions(["backoffice:system-settings:write"]);
    const token = await fixture.loginAsAdmin();

    await request(fixture.app)
      .put("/api/v1/backoffice/system-settings/basic")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...basicBody, unknownField: true })
      .expect(400);
    expect(service.updateBasic).not.toHaveBeenCalled();

    await request(fixture.app)
      .put("/api/v1/backoffice/system-settings/basic")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...basicBody, passwordLoginOtpEnabled: false })
      .expect(400);
    expect(service.updateBasic).not.toHaveBeenCalled();

    await request(fixture.app)
      .put("/api/v1/backoffice/system-settings/basic")
      .set("Authorization", `Bearer ${token}`)
      .send(basicBody)
      .expect(200);

    expect(service.updateBasic).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1 }),
      expect.objectContaining({ ip: expect.any(String) }),
      basicBody
    );

    const { membershipCardFollowUiTheme: _cardTheme, ...legacyBody } = basicBody;
    void _cardTheme;
    await request(fixture.app)
      .put("/api/v1/backoffice/system-settings/basic")
      .set("Authorization", `Bearer ${token}`)
      .send(legacyBody)
      .expect(200);
    expect(service.updateBasic).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      legacyBody
    );
  });

  it("keeps payment updates limited to the two implemented payment methods", async () => {
    const service = createService();
    const fixture = await createStep06Fixture({ platformSettingsService: service } as never);
    fixture.replaceAdminPermissions(["backoffice:payment-settings:write"]);
    const token = await fixture.loginAsAdmin();

    await request(fixture.app)
      .put("/api/v1/backoffice/system-settings/payment")
      .set("Authorization", `Bearer ${token}`)
      .send({
        expectedVersion: 4,
        offlinePaymentEnabled: false,
        ndpPaymentEnabled: true,
        paypalEnabled: true
      })
      .expect(400);
    expect(service.updatePayment).not.toHaveBeenCalled();

    const body = {
      expectedVersion: 4,
      offlinePaymentEnabled: false,
      ndpPaymentEnabled: true
    };
    await request(fixture.app)
      .put("/api/v1/backoffice/system-settings/payment")
      .set("Authorization", `Bearer ${token}`)
      .send(body)
      .expect(200);

    expect(service.updatePayment).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1 }),
      expect.objectContaining({ ip: expect.any(String) }),
      body
    );
  });
});
