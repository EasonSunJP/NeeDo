import { PLATFORM_SETTINGS_PERMISSIONS } from "../src/constants/permissions.constants";
import type {
  PlatformSettingsRecord,
  PlatformSettingsMutationResult,
  PlatformSettingsRepositoryPort,
  ReplacePlatformSettingsInput
} from "../src/repositories/platform-settings.repository";
import { PlatformSettingsResolver } from "../src/services/platform-settings.resolver";
import { PlatformSettingsService } from "../src/services/platform-settings.service";

const actor = {
  userId: 7,
  email: "operator@example.com",
  accessTokenJti: "platform-settings-test",
  accessTokenExpiresAt: 2_000_000_000,
  roles: ["operator"],
  permissions: [
    PLATFORM_SETTINGS_PERMISSIONS.read,
    PLATFORM_SETTINGS_PERMISSIONS.write,
    PLATFORM_SETTINGS_PERMISSIONS.brandMediaActivate,
    PLATFORM_SETTINGS_PERMISSIONS.paymentRead,
    PLATFORM_SETTINGS_PERMISSIONS.paymentWrite
  ],
  currentIdentityType: "operator",
  currentIdentityScopeType: "global",
  currentIdentityScopeId: null
};
const context = { ip: "127.0.0.1", userAgent: "platform-settings-test" };

const setting = (overrides: Partial<PlatformSettingsRecord> = {}): PlatformSettingsRecord => ({
  id: 4,
  publicId: "00000000-0000-4000-8000-000000000004",
  version: 4,
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
  anytimeServiceTestEnabled: false,
  overdueAppointmentGateEnabled: false,
  membershipCardFollowUiTheme: true,
  createdByUserId: null,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
  loginLogo: null,
  requestButton: null,
  ...overrides
});

const basicInput = {
  expectedVersion: 4,
  siteEnabled: false,
  selfRegistrationEnabled: true,
  googleLoginEnabled: true,
  passwordLoginOtpEnabled: true,
  passwordLoginOtpRule: "monthly_first" as const,
  passwordLoginOtpOnNewIp: true,
  anytimeServiceTestEnabled: true,
  overdueAppointmentGateEnabled: true,
  membershipCardFollowUiTheme: false,
  loginLogoMediaPublicId: null,
  requestButtonMediaPublicId: null
};

const createHarness = () => {
  let current = setting();
  const repository: jest.Mocked<PlatformSettingsRepositoryPort> = {
    getActive: jest.fn(async () => current),
    replaceWithAudit: jest.fn(async (
      input: ReplacePlatformSettingsInput
    ): Promise<PlatformSettingsMutationResult> => {
      if (input.expectedVersion !== current.version) return { kind: "version_conflict" };
      current = setting({
        ...current,
        ...(input.section === "basic" ? input.changes : input.changes),
        id: current.id + 1,
        version: current.version + 1,
        createdByUserId: input.actorUserId,
        updatedAt: new Date("2026-09-06T00:00:00.000Z")
      });
      return { kind: "updated", value: current };
    })
  };
  const resolver = new PlatformSettingsResolver(repository, 5_000, () => 1_000);
  const auditFactory = { createInput: jest.fn((input) => input) };
  const service = new PlatformSettingsService(repository, resolver, auditFactory as never);
  return { repository, resolver, service, current: () => current, auditFactory };
};

describe("PlatformSettingsService", () => {
  it("creates one coherent next version and rejects stale updates", async () => {
    const harness = createHarness();
    const updated = await harness.service.updateBasic(actor, context, basicInput);

    expect(updated).toMatchObject({
      version: 5,
      siteEnabled: false,
      passwordLoginOtpRule: "monthly_first",
      passwordLoginOtpOnNewIp: true,
      anytimeServiceTestEnabled: true,
      overdueAppointmentGateEnabled: true,
      membershipCardFollowUiTheme: false,
      offlinePaymentEnabled: true,
      ndpPaymentEnabled: true
    });
    await expect(
      harness.service.updatePayment(actor, context, {
        expectedVersion: 4,
        offlinePaymentEnabled: false,
        ndpPaymentEnabled: true
      })
    ).rejects.toMatchObject({ statusCode: 409, message: "error.platform_settings.version_conflict" });
  });

  it("preserves the card theme mode for a legacy basic settings update", async () => {
    const harness = createHarness();
    const { membershipCardFollowUiTheme: _cardTheme, ...legacyInput } = basicInput;
    void _cardTheme;
    await harness.service.updateBasic(actor, context, legacyInput);
    expect(harness.current().membershipCardFollowUiTheme).toBe(true);
    expect(harness.repository.replaceWithAudit).toHaveBeenCalledWith(expect.objectContaining({
      changes: expect.objectContaining({ membershipCardFollowUiTheme: true })
    }));
  });

  it("returns a safe public projection without internal ids or actor data", async () => {
    const repository: PlatformSettingsRepositoryPort = {
      getActive: jest.fn(async () =>
        setting({
          loginLogoMediaAssetId: 14,
          loginLogo: {
            mediaAssetId: 14,
            publicId: "a".repeat(64),
            url: "/media/content/logo.webp",
            mimeType: "image/webp",
            width: 240,
            height: 80,
            altText: "NeeDo"
          },
          offlinePaymentEnabled: false
        })
      ),
      replaceWithAudit: jest.fn()
    };
    const service = new PlatformSettingsService(
      repository,
      new PlatformSettingsResolver(repository),
      { createInput: jest.fn((input) => input) } as never
    );

    const projection = await service.getPublic();
    expect(projection).toEqual({
      version: 4,
      siteEnabled: true,
      selfRegistrationEnabled: true,
      loginMethods: { password: true, google: true },
      loginLogo: {
        publicId: "a".repeat(64),
        url: "/media/content/logo.webp",
        mimeType: "image/webp",
        width: 240,
        height: 80,
        altText: "NeeDo"
      },
      requestButton: null,
      paymentMethods: ["ndp"],
      membershipCardFollowUiTheme: true
    });
    expect(projection).not.toHaveProperty("id");
    expect(projection).not.toHaveProperty("createdByUserId");
  });

  it("invalidates the resolver only after a committed update", async () => {
    const harness = createHarness();
    await harness.service.getPublic();
    await harness.service.getPublic();
    expect(harness.repository.getActive).toHaveBeenCalledTimes(1);

    await harness.service.updateBasic(actor, context, basicInput);
    await harness.service.getPublic();
    expect(harness.repository.getActive).toHaveBeenCalledTimes(2);
  });

  it("requires a global operations identity", async () => {
    const harness = createHarness();
    const merchant = { ...actor, currentIdentityScopeType: "shop", currentIdentityScopeId: 3 };

    await expect(harness.service.getForOperations(merchant)).rejects.toMatchObject({
      statusCode: 403,
      message: "error.identity.forbidden"
    });
    await expect(harness.service.updateBasic(merchant, context, basicInput)).rejects.toMatchObject({
      statusCode: 403,
      message: "error.identity.forbidden"
    });
  });

  it("requires brand activation permission only when a media reference changes", async () => {
    const harness = createHarness();
    const withoutBrandPermission = {
      ...actor,
      permissions: actor.permissions.filter(
        (permission) => permission !== PLATFORM_SETTINGS_PERMISSIONS.brandMediaActivate
      )
    };

    await expect(
      harness.service.updateBasic(withoutBrandPermission, context, {
        ...basicInput,
        loginLogoMediaPublicId: "b".repeat(64)
      })
    ).rejects.toMatchObject({ statusCode: 403, message: "error.forbidden" });

    await expect(
      harness.service.updateBasic(withoutBrandPermission, context, basicInput)
    ).resolves.toMatchObject({ version: 5 });
  });

  it("maps unavailable settings and invalid media to stable errors", async () => {
    const unavailableRepository: PlatformSettingsRepositoryPort = {
      getActive: jest.fn(async () => null),
      replaceWithAudit: jest.fn()
    };
    const unavailable = new PlatformSettingsService(
      unavailableRepository,
      new PlatformSettingsResolver(unavailableRepository),
      { createInput: jest.fn((input) => input) } as never
    );
    await expect(unavailable.getPublic()).rejects.toMatchObject({
      statusCode: 503,
      message: "error.platform_settings.unavailable"
    });

    const harness = createHarness();
    harness.repository.replaceWithAudit.mockResolvedValueOnce({
      kind: "media_not_found",
      field: "loginLogo"
    });
    await expect(
      harness.service.updateBasic(actor, context, {
        ...basicInput,
        loginLogoMediaPublicId: "c".repeat(64)
      })
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "error.platform_settings.media_not_found"
    });
  });

  it("audits changed field names without media bytes", async () => {
    const harness = createHarness();
    await harness.service.updateBasic(actor, context, basicInput);

    expect(harness.auditFactory.createInput).toHaveBeenCalledWith(
      expect.objectContaining({
        actor,
        context,
        action: "backoffice.platform_settings.basic_updated",
        metadata: {
          expectedVersion: 4,
          changedFields: expect.arrayContaining([
            "siteEnabled",
            "passwordLoginOtpEnabled",
            "passwordLoginOtpRule",
            "passwordLoginOtpOnNewIp",
            "anytimeServiceTestEnabled",
            "overdueAppointmentGateEnabled"
          ])
        }
      })
    );
    expect(JSON.stringify(harness.auditFactory.createInput.mock.calls[0])).not.toContain("bytes");
  });
});
