import { ERROR_CODES } from "../constants/error-codes";
import { PLATFORM_SETTINGS_PERMISSIONS } from "../constants/permissions.constants";
import {
  PLATFORM_LOGIN_VERIFICATION_RULES,
  type PlatformBrandMedia,
  type PlatformCapabilityProject,
  type PublicPlatformSettings
} from "../domain/platform-settings";
import type {
  PlatformBasicSettingsChanges,
  PlatformPaymentSettingsChanges,
  PlatformSettingsMutationResult,
  PlatformSettingsRecord,
  PlatformSettingsRepositoryPort
} from "../repositories/platform-settings.repository";
import { AppError } from "../utils/app-error";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type { PlatformSettingsResolver } from "./platform-settings.resolver";

type AuditInputFactory = Pick<AuditLogService, "createInput">;

export interface PlatformBasicSettingsUpdateInput extends PlatformBasicSettingsChanges {
  expectedVersion: number;
}

export interface PlatformPaymentSettingsUpdateInput extends PlatformPaymentSettingsChanges {
  expectedVersion: number;
}

export interface OperationsPlatformSettings extends PlatformSettingsRecord {
  loginProviderProjects: PlatformCapabilityProject[];
  paymentProviderProjects: PlatformCapabilityProject[];
}

const LOGIN_PROVIDER_PROJECTS: PlatformCapabilityProject[] = [
  { code: "apple", configured: false, enabled: false, actionable: false },
  { code: "line", configured: false, enabled: false, actionable: false }
];

const PAYMENT_PROVIDER_PROJECTS: PlatformCapabilityProject[] = [
  { code: "paypay", configured: false, enabled: false, actionable: false },
  { code: "paypal", configured: false, enabled: false, actionable: false },
  { code: "stripe", configured: false, enabled: false, actionable: false }
];

export class PlatformSettingsService {
  public constructor(
    private readonly repository: PlatformSettingsRepositoryPort,
    private readonly resolver: PlatformSettingsResolver,
    private readonly auditInputFactory: AuditInputFactory
  ) {}

  public async getPublic(): Promise<PublicPlatformSettings> {
    const setting = await this.resolver.getActive();
    return {
      version: setting.version,
      siteEnabled: setting.siteEnabled,
      selfRegistrationEnabled: setting.selfRegistrationEnabled,
      loginMethods: { password: true, google: setting.googleLoginEnabled },
      loginLogo: this.publicMedia(setting.loginLogo),
      requestButton: this.publicMedia(setting.requestButton),
      paymentMethods: [
        ...(setting.offlinePaymentEnabled ? (["cash"] as const) : []),
        ...(setting.ndpPaymentEnabled ? (["ndp"] as const) : [])
      ]
    };
  }

  public async getForOperations(
    actor: AuthenticatedAccessContext
  ): Promise<OperationsPlatformSettings> {
    this.assertOperationsIdentity(actor);
    const setting = await this.resolver.getActive();
    return {
      ...setting,
      loginProviderProjects: LOGIN_PROVIDER_PROJECTS.map((project) => ({ ...project })),
      paymentProviderProjects: PAYMENT_PROVIDER_PROJECTS.map((project) => ({ ...project }))
    };
  }

  public async updateBasic(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: PlatformBasicSettingsUpdateInput
  ): Promise<PlatformSettingsRecord> {
    this.assertOperationsIdentity(actor);
    this.assertBasicInput(input);
    const current = await this.resolver.getActive();
    const changedFields = this.basicChangedFields(current, input);
    if (
      changedFields.some((field) =>
        ["loginLogoMediaPublicId", "requestButtonMediaPublicId"].includes(field)
      ) &&
      !actor.permissions.includes(PLATFORM_SETTINGS_PERMISSIONS.brandMediaActivate)
    ) {
      throw new AppError({
        code: ERROR_CODES.FORBIDDEN,
        message: "error.forbidden",
        statusCode: 403
      });
    }

    const result = await this.repository.replaceWithAudit({
      section: "basic",
      expectedVersion: input.expectedVersion,
      actorUserId: actor.userId,
      changes: {
        siteEnabled: input.siteEnabled,
        selfRegistrationEnabled: input.selfRegistrationEnabled,
        googleLoginEnabled: input.googleLoginEnabled,
        passwordLoginOtpEnabled: input.passwordLoginOtpEnabled,
        passwordLoginOtpRule: input.passwordLoginOtpRule,
        passwordLoginOtpOnNewIp: input.passwordLoginOtpOnNewIp,
        anytimeServiceTestEnabled: input.anytimeServiceTestEnabled,
        loginLogoMediaPublicId: input.loginLogoMediaPublicId,
        requestButtonMediaPublicId: input.requestButtonMediaPublicId
      },
      audit: this.auditInputFactory.createInput({
        actor,
        context,
        action: "backoffice.platform_settings.basic_updated",
        targetType: "PlatformSettingVersion",
        metadata: { expectedVersion: input.expectedVersion, changedFields }
      })
    });
    return this.unwrap(result);
  }

  public async updatePayment(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: PlatformPaymentSettingsUpdateInput
  ): Promise<PlatformSettingsRecord> {
    this.assertOperationsIdentity(actor);
    this.assertVersion(input.expectedVersion);
    const current = await this.resolver.getActive();
    const changedFields = (["offlinePaymentEnabled", "ndpPaymentEnabled"] as const).filter(
      (field) => current[field] !== input[field]
    );
    const result = await this.repository.replaceWithAudit({
      section: "payment",
      expectedVersion: input.expectedVersion,
      actorUserId: actor.userId,
      changes: {
        offlinePaymentEnabled: input.offlinePaymentEnabled,
        ndpPaymentEnabled: input.ndpPaymentEnabled
      },
      audit: this.auditInputFactory.createInput({
        actor,
        context,
        action: "backoffice.platform_settings.payment_updated",
        targetType: "PlatformSettingVersion",
        metadata: { expectedVersion: input.expectedVersion, changedFields }
      })
    });
    return this.unwrap(result);
  }

  private unwrap(result: PlatformSettingsMutationResult): PlatformSettingsRecord {
    if (result.kind === "updated") {
      this.resolver.invalidate();
      return result.value;
    }
    if (result.kind === "media_not_found") {
      throw new AppError({
        code: ERROR_CODES.PLATFORM_SETTINGS_MEDIA_NOT_FOUND,
        message: "error.platform_settings.media_not_found",
        statusCode: 404,
        data: { field: result.field }
      });
    }
    throw new AppError({
      code: ERROR_CODES.PLATFORM_SETTINGS_VERSION_CONFLICT,
      message: "error.platform_settings.version_conflict",
      statusCode: 409
    });
  }

  private basicChangedFields(
    current: PlatformSettingsRecord,
    input: PlatformBasicSettingsUpdateInput
  ): string[] {
    const comparisons: Array<[string, unknown, unknown]> = [
      ["siteEnabled", current.siteEnabled, input.siteEnabled],
      ["selfRegistrationEnabled", current.selfRegistrationEnabled, input.selfRegistrationEnabled],
      ["googleLoginEnabled", current.googleLoginEnabled, input.googleLoginEnabled],
      ["passwordLoginOtpEnabled", current.passwordLoginOtpEnabled, input.passwordLoginOtpEnabled],
      ["passwordLoginOtpRule", current.passwordLoginOtpRule, input.passwordLoginOtpRule],
      ["passwordLoginOtpOnNewIp", current.passwordLoginOtpOnNewIp, input.passwordLoginOtpOnNewIp],
      [
        "anytimeServiceTestEnabled",
        current.anytimeServiceTestEnabled,
        input.anytimeServiceTestEnabled
      ],
      ["loginLogoMediaPublicId", current.loginLogo?.publicId ?? null, input.loginLogoMediaPublicId],
      [
        "requestButtonMediaPublicId",
        current.requestButton?.publicId ?? null,
        input.requestButtonMediaPublicId
      ]
    ];
    return comparisons.filter(([, before, after]) => before !== after).map(([field]) => field);
  }

  private assertBasicInput(input: PlatformBasicSettingsUpdateInput): void {
    this.assertVersion(input.expectedVersion);
    if (!PLATFORM_LOGIN_VERIFICATION_RULES.includes(input.passwordLoginOtpRule)) {
      throw this.validationError();
    }
    if (!input.passwordLoginOtpEnabled && input.passwordLoginOtpOnNewIp) {
      throw this.validationError();
    }
    for (const publicId of [input.loginLogoMediaPublicId, input.requestButtonMediaPublicId]) {
      if (publicId !== null && !/^[a-f0-9]{64}$/u.test(publicId)) throw this.validationError();
    }
  }

  private assertVersion(version: number): void {
    if (!Number.isInteger(version) || version < 1) throw this.validationError();
  }

  private assertOperationsIdentity(actor: AuthenticatedAccessContext): void {
    if (
      actor.currentIdentityScopeType === "global" ||
      actor.currentIdentityScopeType === "platform"
    ) {
      return;
    }
    throw new AppError({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden",
      statusCode: 403
    });
  }

  private publicMedia(media: PlatformSettingsRecord["loginLogo"]): PlatformBrandMedia | null {
    if (!media) return null;
    const { publicId, url, mimeType, width, height, altText } = media;
    return { publicId, url, mimeType, width, height, altText };
  }

  private validationError(): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.validation",
      statusCode: 400
    });
  }
}
