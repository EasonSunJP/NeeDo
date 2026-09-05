import type { PlatformMedia } from "../platform-settings/types";

export type LoginVerificationRule = "first_login" | "monthly_first" | "every_login";
export type CapabilityProjectCode = "apple" | "line" | "paypay" | "paypal" | "stripe";

export type CapabilityProject = {
  code: CapabilityProjectCode;
  configured: false;
  enabled: false;
  actionable: false;
};

export type OperationsPlatformSettings = {
  id: number;
  publicId: string;
  version: number;
  siteEnabled: boolean;
  selfRegistrationEnabled: boolean;
  googleLoginEnabled: boolean;
  passwordLoginOtpEnabled: boolean;
  passwordLoginOtpRule: LoginVerificationRule;
  passwordLoginOtpOnNewIp: boolean;
  loginLogoMediaAssetId: number | null;
  requestButtonMediaAssetId: number | null;
  offlinePaymentEnabled: boolean;
  ndpPaymentEnabled: boolean;
  createdByUserId: number | null;
  createdAt: string;
  updatedAt: string;
  loginLogo: (PlatformMedia & { mediaAssetId?: number }) | null;
  requestButton: (PlatformMedia & { mediaAssetId?: number }) | null;
  loginProviderProjects: CapabilityProject[];
  paymentProviderProjects: CapabilityProject[];
};

export type BasicSettingsInput = {
  expectedVersion: number;
  siteEnabled: boolean;
  selfRegistrationEnabled: boolean;
  googleLoginEnabled: boolean;
  passwordLoginOtpEnabled: boolean;
  passwordLoginOtpRule: LoginVerificationRule;
  passwordLoginOtpOnNewIp: boolean;
  loginLogoMediaPublicId: string | null;
  requestButtonMediaPublicId: string | null;
};

export type PaymentSettingsInput = {
  expectedVersion: number;
  offlinePaymentEnabled: boolean;
  ndpPaymentEnabled: boolean;
};

export type ImRetentionSettings = {
  version: number;
  messageDays: number;
  mediaDays: number;
  updatedAt: string;
};

export type ImRetentionInput = Pick<ImRetentionSettings, "messageDays" | "mediaDays"> & {
  expectedVersion: number;
};

export type UploadedBrandMedia = {
  publicId: string;
  url: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  altText: string | null;
};
