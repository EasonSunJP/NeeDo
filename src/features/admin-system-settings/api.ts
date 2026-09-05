import { contentPublicationApi } from "../../api/contentPublication";
import { httpClient } from "../../api/httpClient";
import type {
  BasicSettingsInput,
  ImRetentionInput,
  ImRetentionSettings,
  OperationsPlatformSettings,
  PaymentSettingsInput,
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
  }
};
