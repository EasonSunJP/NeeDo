import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import { PlatformAccessPolicyService } from "../src/services/platform-access-policy.service";
import { createPlatformMaintenanceMiddleware } from "../src/middlewares/platform-maintenance.middleware";
import type { PlatformSettingsRecord } from "../src/repositories/platform-settings.repository";

const settings = (overrides: Partial<PlatformSettingsRecord> = {}): PlatformSettingsRecord => ({
  id: 1,
  publicId: "00000000-0000-4000-8000-000000000001",
  version: 1,
  siteEnabled: true,
  selfRegistrationEnabled: true,
  googleLoginEnabled: true,
  passwordLoginOtpEnabled: false,
  passwordLoginOtpRule: "first_login",
  passwordLoginOtpOnNewIp: false,
  loginLogoMediaAssetId: null,
  requestButtonMediaAssetId: null,
  offlinePaymentEnabled: true,
  ndpPaymentEnabled: true,
  createdByUserId: null,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
  loginLogo: null,
  requestButton: null,
  ...overrides
});

const actor = (
  currentIdentityScopeType: string | null,
  currentIdentityType: string
): AuthenticatedAccessContext => ({
  userId: 1,
  email: "actor@example.com",
  accessTokenJti: "policy-test",
  accessTokenExpiresAt: 2_000_000_000,
  currentIdentityType,
  currentIdentityScopeType,
  currentIdentityScopeId: currentIdentityScopeType === "global" ? null : 1,
  roles: [currentIdentityType],
  permissions: []
});

describe("PlatformAccessPolicyService", () => {
  it.each([
    ["customer_profile", "customer"],
    ["technician_profile", "technician"],
    ["merchant", "merchant_owner"],
    ["global", "scout"]
  ])("blocks the %s identity while the site is closed", async (scopeType, identityType) => {
    const service = new PlatformAccessPolicyService({
      getActive: jest.fn(async () => settings({ siteEnabled: false }))
    });

    await expect(
      service.assertAuthenticatedAccess(actor(scopeType, identityType))
    ).rejects.toMatchObject({
      statusCode: 503,
      message: "error.platform.maintenance"
    });
  });

  it("keeps global and platform operations identities available during maintenance", async () => {
    const service = new PlatformAccessPolicyService({
      getActive: jest.fn(async () => settings({ siteEnabled: false }))
    });

    await expect(
      service.assertAuthenticatedAccess(actor("global", "operator"))
    ).resolves.toBeUndefined();
    await expect(
      service.assertAuthenticatedAccess(actor("platform", "platform"))
    ).resolves.toBeUndefined();
  });

  it("fails closed for public business access, registration, and Google independently", async () => {
    let current = settings({
      siteEnabled: false,
      selfRegistrationEnabled: false,
      googleLoginEnabled: false
    });
    const service = new PlatformAccessPolicyService({ getActive: async () => current });

    await expect(service.assertPublicBusinessAccess()).rejects.toMatchObject({
      statusCode: 503,
      message: "error.platform.maintenance"
    });
    await expect(service.assertSelfRegistrationEnabled()).rejects.toMatchObject({
      statusCode: 403,
      message: "error.auth.registration_disabled"
    });
    await expect(service.assertGoogleLoginEnabled()).rejects.toMatchObject({
      statusCode: 503,
      message: "error.auth.google_disabled"
    });

    current = settings();
    await expect(service.assertPublicBusinessAccess()).resolves.toBeUndefined();
  });

  it("applies maintenance to public business routes but bypasses backoffice routing", async () => {
    const policy = { assertPublicBusinessAccess: jest.fn(async () => undefined) };
    const middleware = createPlatformMaintenanceMiddleware(policy);
    const publicNext = jest.fn();
    const backofficeNext = jest.fn();

    await middleware({ path: "/shops" } as never, {} as never, publicNext);
    await middleware({ path: "/backoffice/users" } as never, {} as never, backofficeNext);

    expect(policy.assertPublicBusinessAccess).toHaveBeenCalledTimes(1);
    expect(publicNext).toHaveBeenCalledWith();
    expect(backofficeNext).toHaveBeenCalledWith();
  });
});
