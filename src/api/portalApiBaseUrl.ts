import type { AuthPersistenceScope } from "../auth/authPersistenceScope";

export type PortalApiEnvironment = {
  VITE_API_BASE_URL?: string;
  VITE_MERCHANT_API_BASE_URL?: string;
  VITE_OPS_API_BASE_URL?: string;
};
const defaultApiPrefix = "/api/v1";
const defaultMerchantApiPrefix = "/merchant-api/v1";
const defaultOpsApiPrefix = "/ops-api/v1";

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");
const configuredOrDefault = (configured: string | undefined, fallback: string): string => {
  const value = configured?.trim();
  return value ? trimTrailingSlash(value) : fallback;
};

export const resolvePortalApiBaseUrl = (
  scope: AuthPersistenceScope,
  environment: PortalApiEnvironment
): string => {
  if (scope === "operations-admin") {
    return configuredOrDefault(environment.VITE_OPS_API_BASE_URL, defaultOpsApiPrefix);
  }
  if (scope === "merchant-admin") {
    return configuredOrDefault(environment.VITE_MERCHANT_API_BASE_URL, defaultMerchantApiPrefix);
  }
  return configuredOrDefault(environment.VITE_API_BASE_URL, defaultApiPrefix);
};
