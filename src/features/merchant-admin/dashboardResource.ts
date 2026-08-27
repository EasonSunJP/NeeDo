import {
  backofficeRealDataApi,
  type BackofficeDashboardPayload
} from "../../api/backofficeRealData";
import { loadCoreReadWithTransientRetry } from "../core-read/transientRetry";

type MerchantAdminDashboardCacheEntry = {
  expiresAt: number;
  payload?: BackofficeDashboardPayload;
  request?: Promise<BackofficeDashboardPayload>;
};

const resolvedPayloadMaxAgeMs = 5_000;
const dashboardCache = new Map<string, MerchantAdminDashboardCacheEntry>();

export function invalidateMerchantAdminDashboard(scopeKey: string) {
  dashboardCache.delete(scopeKey);
}

export function loadMerchantAdminDashboard(scopeKey: string): Promise<BackofficeDashboardPayload> {
  const cached = dashboardCache.get(scopeKey);

  if (cached?.request) {
    return cached.request;
  }

  if (cached?.payload && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.payload);
  }

  let entry: MerchantAdminDashboardCacheEntry;
  const request = loadCoreReadWithTransientRetry(
    () => backofficeRealDataApi.dashboard("merchant-admin")
  )
    .then((payload) => {
      if (dashboardCache.get(scopeKey) === entry) {
        dashboardCache.set(scopeKey, {
          expiresAt: Date.now() + resolvedPayloadMaxAgeMs,
          payload
        });
      }

      return payload;
    })
    .catch((error: unknown) => {
      if (dashboardCache.get(scopeKey) === entry) {
        dashboardCache.delete(scopeKey);
      }

      throw error;
    });

  entry = {
    expiresAt: 0,
    request
  };
  dashboardCache.set(scopeKey, entry);

  return request;
}
