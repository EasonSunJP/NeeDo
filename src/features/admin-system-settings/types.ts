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
  anytimeServiceTestEnabled: boolean;
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
  anytimeServiceTestEnabled: boolean;
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

export const legalDocumentLocales = ["zh-CN", "zh-TW", "ja", "en", "ko"] as const;
export type LegalDocumentLocale = (typeof legalDocumentLocales)[number];

export type Page<T> = { list: T[]; total: number; page: number; page_size: number };
export type LegalDocumentCatalog = {
  publicId: string;
  slug: string;
  name: string;
  internalPath: string;
  displayLocations: string[];
  isEnabled: boolean;
  lockVersion: number;
  createdAt: string;
  updatedAt: string;
};
export type LegalDocumentDraft = {
  documentId: number;
  locale: LegalDocumentLocale;
  title: string;
  body: string;
  lockVersion: number;
  updatedAt: string;
};
export type LegalDocumentRelease = {
  publicId: string;
  documentId: number;
  locale: LegalDocumentLocale;
  version: number;
  title: string;
  body: string;
  contentHash: string;
  publishedAt: string;
  publishedByUserId: number | null;
};
export type LegalDocumentLocaleState = {
  publicId: string;
  locale: LegalDocumentLocale;
  draft: LegalDocumentDraft | null;
  currentRelease: LegalDocumentRelease | null;
};
export type PublicLegalDocument = {
  publicId: string;
  slug: string;
  internalPath: string;
  displayLocations: string[];
  locale: LegalDocumentLocale;
  version: number;
  title: string;
  body: string;
  contentHash: string;
  publishedAt: string;
};
