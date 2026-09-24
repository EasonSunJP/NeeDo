import { contentPublicationApi } from "../../api/contentPublication";
import { httpClient } from "../../api/httpClient";
import { userManagementApi } from "../../api/userManagement";
import { platformUserManagementApi } from "../platform-user-management/api";
import type {
  BasicSettingsInput,
  ImRetentionInput,
  ImRetentionSettings,
  LegalDocumentCatalog,
  LegalDocumentDraft,
  LegalDocumentLocale,
  LegalDocumentLocaleState,
  LegalDocumentRelease,
  OperationsPlatformSettings,
  Page,
  PaymentSettingsInput,
  PublicLegalDocument,
  TestNdpVisibilityPreference,
  UploadedBrandMedia
} from "./types";

function assertPositiveVersion(value: unknown) {
  if (!Number.isInteger(value) || Number(value) < 1) throw new Error("error.api");
}

function parseOperationsSettings(value: unknown): OperationsPlatformSettings {
  if (!value || typeof value !== "object") throw new Error("error.api");
  const settings = value as OperationsPlatformSettings;
  assertPositiveVersion(settings.version);
  if (
    typeof settings.siteEnabled !== "boolean" ||
    typeof settings.selfRegistrationEnabled !== "boolean" ||
    typeof settings.googleLoginEnabled !== "boolean" ||
    typeof settings.passwordLoginOtpEnabled !== "boolean" ||
    !["first_login", "monthly_first", "every_login"].includes(settings.passwordLoginOtpRule) ||
    typeof settings.passwordLoginOtpOnNewIp !== "boolean" ||
    typeof settings.offlinePaymentEnabled !== "boolean" ||
    typeof settings.ndpPaymentEnabled !== "boolean" ||
    typeof settings.anytimeServiceTestEnabled !== "boolean" ||
    typeof settings.overdueAppointmentGateEnabled !== "boolean" ||
    typeof settings.membershipCardFollowUiTheme !== "boolean" ||
    !Array.isArray(settings.loginProviderProjects) ||
    !Array.isArray(settings.paymentProviderProjects)
  ) throw new Error("error.api");
  return settings;
}

function parseRetention(value: unknown): ImRetentionSettings {
  if (!value || typeof value !== "object") throw new Error("error.api");
  const settings = value as ImRetentionSettings;
  assertPositiveVersion(settings.version);
  if (
    !Number.isInteger(settings.messageDays) ||
    settings.messageDays < 1 ||
    !Number.isInteger(settings.mediaDays) ||
    settings.mediaDays < 1 ||
    typeof settings.updatedAt !== "string"
  ) throw new Error("error.api");
  return settings;
}

export const adminSystemSettingsApi = {
  getTestNdpVisibility() {
    return httpClient.request<TestNdpVisibilityPreference>(
      "/backoffice/preferences/test-ndp-visibility",
      { auth: true, method: "GET", retryOnUnauthorized: true }
    );
  },
  updateTestNdpVisibility(showTestNdpData: boolean) {
    return httpClient.request<TestNdpVisibilityPreference>(
      "/backoffice/preferences/test-ndp-visibility",
      {
        auth: true,
        body: { showTestNdpData },
        method: "PUT",
        retryOnUnauthorized: false
      }
    );
  },
  listTestParticipants(page = 1) {
    return platformUserManagementApi.listUsers("operations", {
      isTestAccount: true,
      page,
      page_size: 100,
      sortBy: "createdAt",
      sortDirection: "desc"
    });
  },
  searchParticipantCandidates(keyword: string) {
    return platformUserManagementApi.listUsers("operations", {
      keyword,
      page: 1,
      page_size: 20,
      sortBy: "createdAt",
      sortDirection: "desc"
    });
  },
  updateTestParticipant(userId: number, isTestAccount: boolean, expectedUpdatedAt: string) {
    return userManagementApi.updateTestAccount(userId, { isTestAccount, expectedUpdatedAt });
  },
  async getSettings() {
    return parseOperationsSettings(
      await httpClient.request<unknown>("/backoffice/system-settings", {
        auth: true,
        method: "GET",
        retryOnUnauthorized: true
      })
    );
  },
  updateBasic(input: BasicSettingsInput) {
    return httpClient.request<unknown>("/backoffice/system-settings/basic", {
      auth: true,
      body: input,
      method: "PUT",
      retryOnUnauthorized: false
    });
  },
  updatePayment(input: PaymentSettingsInput) {
    return httpClient.request<unknown>("/backoffice/system-settings/payment", {
      auth: true,
      body: input,
      method: "PUT",
      retryOnUnauthorized: false
    });
  },
  async getRetention() {
    return parseRetention(
      await httpClient.request<unknown>("/backoffice/system-settings/im-retention", {
        auth: true,
        method: "GET",
        retryOnUnauthorized: true
      })
    );
  },
  async updateRetention(input: ImRetentionInput) {
    return parseRetention(
      await httpClient.request<unknown>("/backoffice/system-settings/im-retention", {
        auth: true,
        body: input,
        method: "PUT",
        retryOnUnauthorized: false
      })
    );
  },
  async uploadBrandImage(file: Blob, altText: string): Promise<UploadedBrandMedia> {
    const media = await contentPublicationApi.uploadContentImage(file, altText);
    return {
      publicId: media.publicId,
      url: media.url,
      mimeType: media.mimeType,
      width: media.width,
      height: media.height,
      altText
    };
  },
  listLegalDocuments(page = 1, pageSize = 20) {
    return httpClient.request<Page<LegalDocumentCatalog>>("/backoffice/legal-documents", {
      auth: true,
      method: "GET",
      query: { page, page_size: pageSize },
      retryOnUnauthorized: true
    });
  },
  createLegalDocument(input: Pick<LegalDocumentCatalog, "slug" | "name" | "internalPath" | "displayLocations" | "isEnabled">) {
    return httpClient.request<LegalDocumentCatalog>("/backoffice/legal-documents", {
      auth: true,
      body: input,
      method: "POST",
      retryOnUnauthorized: false
    });
  },
  updateLegalDocument(publicId: string, input: Pick<LegalDocumentCatalog, "name" | "internalPath" | "displayLocations" | "isEnabled"> & { expectedLockVersion: number }) {
    return httpClient.request<LegalDocumentCatalog>(`/backoffice/legal-documents/${encodeURIComponent(publicId)}`, {
      auth: true,
      body: input,
      method: "PATCH",
      retryOnUnauthorized: false
    });
  },
  getLegalLocale(publicId: string, locale: LegalDocumentLocale) {
    return httpClient.request<LegalDocumentLocaleState>(`/backoffice/legal-documents/${encodeURIComponent(publicId)}/locales/${locale}`, {
      auth: true,
      method: "GET",
      retryOnUnauthorized: true
    });
  },
  saveLegalDraft(publicId: string, locale: LegalDocumentLocale, input: { expectedLockVersion: number | null; title: string; body: string }) {
    return httpClient.request<LegalDocumentDraft>(`/backoffice/legal-documents/${encodeURIComponent(publicId)}/locales/${locale}/draft`, {
      auth: true,
      body: input,
      method: "PUT",
      retryOnUnauthorized: false
    });
  },
  publishLegalDraft(publicId: string, locale: LegalDocumentLocale, input: { expectedDraftLockVersion: number; publishedAt: string; setEnabled?: boolean }) {
    return httpClient.request<LegalDocumentRelease>(`/backoffice/legal-documents/${encodeURIComponent(publicId)}/locales/${locale}/publish`, {
      auth: true,
      body: input,
      method: "POST",
      retryOnUnauthorized: false
    });
  },
  listLegalReleases(publicId: string, locale: LegalDocumentLocale, page = 1, pageSize = 10) {
    return httpClient.request<Page<LegalDocumentRelease>>(`/backoffice/legal-documents/${encodeURIComponent(publicId)}/locales/${locale}/releases`, {
      auth: true,
      method: "GET",
      query: { page, page_size: pageSize },
      retryOnUnauthorized: true
    });
  },
  getPublicLegalDocument(slug: string, locale: LegalDocumentLocale) {
    return httpClient.request<PublicLegalDocument>(`/legal-documents/${encodeURIComponent(slug)}/current`, {
      auth: false,
      method: "GET",
      query: { locale },
      retryOnUnauthorized: false
    });
  }
};
