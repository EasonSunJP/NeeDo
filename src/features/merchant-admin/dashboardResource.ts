import {
  backofficeRealDataApi,
  type BackofficeDashboardPayload,
  type DashboardQuery,
} from "../../api/backofficeRealData";
import { getAuthCredentialEpoch } from "../../api/httpClient";
import { loadCoreReadWithTransientRetry } from "../core-read/transientRetry";

export type MerchantAdminDashboardOwner = {
  credentialEpoch: number;
  identityId: number;
  shopPublicId: string;
  userId: number;
};

type MerchantAdminDashboardCacheEntry = {
  controller: AbortController;
  expiresAt: number;
  ownerKey: string;
  payload?: BackofficeDashboardPayload;
  request?: Promise<BackofficeDashboardPayload>;
};

const resolvedPayloadMaxAgeMs = 5_000;
const dashboardCache = new Map<string, MerchantAdminDashboardCacheEntry>();

function getDashboardOwnerKey(owner: MerchantAdminDashboardOwner) {
  return JSON.stringify([
    owner.userId,
    owner.identityId,
    owner.shopPublicId,
    owner.credentialEpoch,
  ]);
}

function getDashboardCacheKey(
  owner: MerchantAdminDashboardOwner,
  query: DashboardQuery,
) {
  return JSON.stringify([
    getDashboardOwnerKey(owner),
    query.period,
    query.from ?? null,
    query.to ?? null,
    query.city ?? null,
  ]);
}

function createSupersededError() {
  return new DOMException("Dashboard owner was superseded", "AbortError");
}

function assertDashboardOwnerCurrent(
  owner: MerchantAdminDashboardOwner,
  controller: AbortController,
) {
  if (
    controller.signal.aborted ||
    getAuthCredentialEpoch() !== owner.credentialEpoch
  ) {
    throw createSupersededError();
  }
}

function assertMerchantDashboardScope(
  payload: BackofficeDashboardPayload,
  expectedShopPublicId: string,
) {
  if (
    payload.scope?.kind !== "shop" ||
    payload.scope.shopPublicId !== expectedShopPublicId
  ) {
    throw new Error("error.auth.dashboard_scope_mismatch");
  }
}

export function invalidateMerchantAdminDashboard(
  owner: MerchantAdminDashboardOwner,
  query: DashboardQuery,
) {
  const cacheKey = getDashboardCacheKey(owner, query);
  dashboardCache.get(cacheKey)?.controller.abort();
  dashboardCache.delete(cacheKey);
}

export function invalidateMerchantAdminDashboardOwner(
  owner: MerchantAdminDashboardOwner,
) {
  const ownerKey = getDashboardOwnerKey(owner);

  dashboardCache.forEach((entry, cacheKey) => {
    if (entry.ownerKey === ownerKey) {
      entry.controller.abort();
      dashboardCache.delete(cacheKey);
    }
  });
}

export function loadMerchantAdminDashboard(
  owner: MerchantAdminDashboardOwner,
  query: DashboardQuery,
): Promise<BackofficeDashboardPayload> {
  if (!/^shop\d{10}$/.test(owner.shopPublicId)) {
    return Promise.reject(new Error("error.auth.merchant_shop_required"));
  }

  const requestQuery = { ...query };
  const cacheKey = getDashboardCacheKey(owner, requestQuery);
  const cached = dashboardCache.get(cacheKey);

  if (cached?.request) {
    return cached.request;
  }

  if (cached?.payload && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.payload);
  }

  const controller = new AbortController();
  const ownerKey = getDashboardOwnerKey(owner);
  const entry: MerchantAdminDashboardCacheEntry = {
    controller,
    expiresAt: 0,
    ownerKey,
  };
  const request = loadCoreReadWithTransientRetry(async () => {
    assertDashboardOwnerCurrent(owner, controller);
    return backofficeRealDataApi.dashboard("merchant-admin", requestQuery, {
      signal: controller.signal,
    });
  })
    .then((payload) => {
      assertDashboardOwnerCurrent(owner, controller);
      assertMerchantDashboardScope(payload, owner.shopPublicId);

      if (dashboardCache.get(cacheKey) === entry) {
        entry.expiresAt = Date.now() + resolvedPayloadMaxAgeMs;
        entry.payload = payload;
        delete entry.request;
      }

      return payload;
    })
    .catch((error: unknown) => {
      if (dashboardCache.get(cacheKey) === entry) {
        dashboardCache.delete(cacheKey);
      }
      throw error;
    });

  entry.request = request;
  dashboardCache.set(cacheKey, entry);

  return request;
}
