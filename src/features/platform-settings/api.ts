import { httpClient } from "../../api/httpClient";
import type { PlatformMedia, PublicPlatformSettings } from "./types";

const mediaKeys = ["publicId", "url", "mimeType", "width", "height", "altText"] as const;
const settingsKeys = [
  "version",
  "siteEnabled",
  "selfRegistrationEnabled",
  "loginMethods",
  "loginLogo",
  "requestButton",
  "paymentMethods"
] as const;

function hasExactKeys(value: object, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function parseMedia(value: unknown): PlatformMedia | null {
  if (value === null) return null;
  if (!value || typeof value !== "object" || !hasExactKeys(value, mediaKeys)) throw new Error("error.api");
  const media = value as Record<string, unknown>;
  if (
    typeof media.publicId !== "string" ||
    !media.publicId ||
    typeof media.url !== "string" ||
    !media.url ||
    typeof media.mimeType !== "string" ||
    !media.mimeType ||
    (media.width !== null && (!Number.isInteger(media.width) || Number(media.width) < 1)) ||
    (media.height !== null && (!Number.isInteger(media.height) || Number(media.height) < 1)) ||
    (media.altText !== null && typeof media.altText !== "string")
  ) throw new Error("error.api");
  return media as PlatformMedia;
}

export function parsePublicPlatformSettings(value: unknown): PublicPlatformSettings {
  if (!value || typeof value !== "object" || !hasExactKeys(value, settingsKeys)) throw new Error("error.api");
  const settings = value as Record<string, unknown>;
  const methods = settings.loginMethods;
  const payments = settings.paymentMethods;
  if (
    !Number.isInteger(settings.version) ||
    Number(settings.version) < 1 ||
    typeof settings.siteEnabled !== "boolean" ||
    typeof settings.selfRegistrationEnabled !== "boolean" ||
    !methods ||
    typeof methods !== "object" ||
    !hasExactKeys(methods, ["password", "google"]) ||
    (methods as Record<string, unknown>).password !== true ||
    typeof (methods as Record<string, unknown>).google !== "boolean" ||
    !Array.isArray(payments) ||
    payments.some((method) => method !== "cash" && method !== "ndp") ||
    new Set(payments).size !== payments.length
  ) throw new Error("error.api");
  return {
    version: Number(settings.version),
    siteEnabled: settings.siteEnabled,
    selfRegistrationEnabled: settings.selfRegistrationEnabled,
    loginMethods: methods as PublicPlatformSettings["loginMethods"],
    loginLogo: parseMedia(settings.loginLogo),
    requestButton: parseMedia(settings.requestButton),
    paymentMethods: payments as PublicPlatformSettings["paymentMethods"]
  };
}

export const platformSettingsApi = {
  async getPublic() {
    const payload = await httpClient.request<unknown>("/platform/settings/public", {
      auth: false,
      method: "GET",
      retryOnUnauthorized: false
    });
    return parsePublicPlatformSettings(payload);
  }
};
