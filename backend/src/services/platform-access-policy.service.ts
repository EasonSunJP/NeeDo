import { ERROR_CODES } from "../constants/error-codes";
import type { PlatformLoginVerificationRule } from "../domain/platform-settings";
import type { PlatformSettingsRecord } from "../repositories/platform-settings.repository";
import { AppError } from "../utils/app-error";
import type { AuthenticatedAccessContext } from "./auth.service";

type PlatformSettingsSource = {
  getActive(): Promise<PlatformSettingsRecord>;
};

export interface PasswordLoginVerificationPolicy {
  platformSettingsVersion: number;
  enabled: boolean;
  rule: PlatformLoginVerificationRule;
  onNewIp: boolean;
}

export interface PlatformAccessPolicyPort {
  assertPublicBusinessAccess(): Promise<void>;
  assertAuthenticatedAccess(actor: AuthenticatedAccessContext): Promise<void>;
  assertSelfRegistrationEnabled(): Promise<void>;
  assertGoogleLoginEnabled(): Promise<void>;
  getPasswordLoginVerificationPolicy(): Promise<PasswordLoginVerificationPolicy>;
}

export class PlatformAccessPolicyService implements PlatformAccessPolicyPort {
  public constructor(private readonly settings: PlatformSettingsSource) {}

  public async assertPublicBusinessAccess(): Promise<void> {
    if (!(await this.settings.getActive()).siteEnabled) throw this.maintenanceError();
  }

  public async assertAuthenticatedAccess(actor: AuthenticatedAccessContext): Promise<void> {
    if ((await this.settings.getActive()).siteEnabled || this.isOperationsIdentity(actor)) return;
    throw this.maintenanceError();
  }

  public async assertSelfRegistrationEnabled(): Promise<void> {
    if ((await this.settings.getActive()).selfRegistrationEnabled) return;
    throw new AppError({
      code: ERROR_CODES.REGISTRATION_DISABLED,
      message: "error.auth.registration_disabled",
      statusCode: 403
    });
  }

  public async assertGoogleLoginEnabled(): Promise<void> {
    if ((await this.settings.getActive()).googleLoginEnabled) return;
    throw new AppError({
      code: ERROR_CODES.GOOGLE_LOGIN_DISABLED,
      message: "error.auth.google_disabled",
      statusCode: 503
    });
  }

  public async getPasswordLoginVerificationPolicy(): Promise<PasswordLoginVerificationPolicy> {
    const current = await this.settings.getActive();
    return {
      platformSettingsVersion: current.version,
      enabled: current.passwordLoginOtpEnabled,
      rule: current.passwordLoginOtpRule,
      onNewIp: current.passwordLoginOtpOnNewIp
    };
  }

  private isOperationsIdentity(actor: AuthenticatedAccessContext): boolean {
    const operationsIdentityTypes = new Set([
      "platform",
      "platform_admin",
      "operator",
      "operations"
    ]);
    return (
      operationsIdentityTypes.has(actor.currentIdentityType ?? "") &&
      (actor.currentIdentityScopeType === "global" || actor.currentIdentityScopeType === "platform")
    );
  }

  private maintenanceError(): AppError {
    return new AppError({
      code: ERROR_CODES.PLATFORM_MAINTENANCE,
      message: "error.platform.maintenance",
      statusCode: 503
    });
  }
}
