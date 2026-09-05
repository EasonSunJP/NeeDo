export const PLATFORM_LOGIN_VERIFICATION_RULES = [
  "first_login",
  "monthly_first",
  "every_login"
] as const;

export type PlatformLoginVerificationRule =
  (typeof PLATFORM_LOGIN_VERIFICATION_RULES)[number];

export const PLATFORM_PAYMENT_METHODS = ["cash", "ndp"] as const;

export type PlatformPaymentMethod = (typeof PLATFORM_PAYMENT_METHODS)[number];

export interface PlatformSettingsSnapshot {
  id: number;
  publicId: string;
  version: number;
  siteEnabled: boolean;
  selfRegistrationEnabled: boolean;
  googleLoginEnabled: boolean;
  passwordLoginOtpEnabled: boolean;
  passwordLoginOtpRule: PlatformLoginVerificationRule;
  passwordLoginOtpOnNewIp: boolean;
  loginLogoMediaAssetId: number | null;
  requestButtonMediaAssetId: number | null;
  offlinePaymentEnabled: boolean;
  ndpPaymentEnabled: boolean;
  createdByUserId: number | null;
  createdAt: Date;
}
