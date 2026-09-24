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
  anytimeServiceTestEnabled: boolean;
  overdueAppointmentGateEnabled: boolean;
  membershipCardFollowUiTheme: boolean;
  createdByUserId: number | null;
  createdAt: Date;
}

export interface PlatformBrandMedia {
  publicId: string;
  url: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  altText: string | null;
}

export interface PublicPlatformSettings {
  version: number;
  siteEnabled: boolean;
  selfRegistrationEnabled: boolean;
  loginMethods: {
    password: true;
    google: boolean;
  };
  loginLogo: PlatformBrandMedia | null;
  requestButton: PlatformBrandMedia | null;
  paymentMethods: PlatformPaymentMethod[];
  membershipCardFollowUiTheme: boolean;
}

export interface PlatformCapabilityProject {
  code: "apple" | "line" | "paypay" | "paypal" | "stripe";
  configured: false;
  enabled: false;
  actionable: false;
}
