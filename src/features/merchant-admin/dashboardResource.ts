import {
  backofficeRealDataApi,
  type BackofficeDashboardPayload,
  type DashboardQuery
} from "../../api/backofficeRealData";
import { loadCoreReadWithTransientRetry } from "../core-read/transientRetry";

type MerchantAdminDashboardCacheEntry = {
  expiresAt: number;
  payload?: BackofficeDashboardPayload;
  request?: Promise<BackofficeDashboardPayload>;
};

const resolvedPayloadMaxAgeMs = 5_000;
const dashboardCache = new Map<string, MerchantAdminDashboardCacheEntry>();
const dashboardRequestGenerations = new Map<string, number>();

function getDashboardCacheKey(scopeKey: string, query: DashboardQuery) {
  return JSON.stringify([
    scopeKey,
    query.period,
    query.from ?? null,
    query.to ?? null,
    query.city ?? null
  ]);
}

export function invalidateMerchantAdminDashboard(
  scopeKey: string,
  query: DashboardQuery
) {
  const cacheKey = getDashboardCacheKey(scopeKey, query);
  dashboardCache.delete(cacheKey);
  dashboardRequestGenerations.set(
    cacheKey,
    (dashboardRequestGenerations.get(cacheKey) ?? 0) + 1
  );
}

export function loadMerchantAdminDashboard(
  scopeKey: string,
  query: DashboardQuery
): Promise<BackofficeDashboardPayload> {
  const requestQuery = { ...query };
  const cacheKey = getDashboardCacheKey(scopeKey, requestQuery);
  const cached = dashboardCache.get(cacheKey);

  if (cached?.request) {
    return cached.request;
  }

  if (cached?.payload && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.payload);
  }

  const requestGeneration = dashboardRequestGenerations.get(cacheKey) ?? 0;
  const request = loadCoreReadWithTransientRetry(
    () => backofficeRealDataApi.dashboard("merchant-admin", requestQuery)
  )
    .then((payload) => {
      if (
        dashboardCache.get(cacheKey)?.request === request &&
        (dashboardRequestGenerations.get(cacheKey) ?? 0) === requestGeneration
      ) {
        dashboardCache.set(cacheKey, {
          expiresAt: Date.now() + resolvedPayloadMaxAgeMs,
          payload
        });
      }

      return payload;
    })
    .catch((error: unknown) => {
      if (
        dashboardCache.get(cacheKey)?.request === request &&
        (dashboardRequestGenerations.get(cacheKey) ?? 0) === requestGeneration
      ) {
        dashboardCache.delete(cacheKey);
      }

      throw error;
    });

  const entry: MerchantAdminDashboardCacheEntry = {
    expiresAt: 0,
    request
  };
  dashboardCache.set(cacheKey, entry);

  return request;
}
