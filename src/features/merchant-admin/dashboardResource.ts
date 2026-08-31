import {
  backofficeRealDataApi,
  type BackofficeDashboardPayload,
  type DashboardQuery
} from "../../api/backofficeRealData";
import {
  getAuthCredentialSnapshot,
  subscribeAuthCredentialSnapshot
} from "../../auth/authCredentialCoordinator";
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
  touchedAt: number;
};

const resolvedPayloadMaxAgeMs = 5_000;
const maximumDashboardCacheEntries = 32;
const dashboardCache = new Map<string, MerchantAdminDashboardCacheEntry>();
let observedCredentialVersion = getAuthCredentialSnapshot().credentialVersion;

function sweepDashboardCache() {
  const expiredAt = Date.now();
  dashboardCache.forEach((candidate, candidateKey) => {
    if (!candidate.request && candidate.expiresAt <= expiredAt) {
      candidate.controller.abort();
      dashboardCache.delete(candidateKey);
    }
  });
  while (dashboardCache.size > maximumDashboardCacheEntries) {
    const oldest = [...dashboardCache.entries()].sort(
      (left, right) => left[1].touchedAt - right[1].touchedAt
    )[0];
    if (!oldest) break;
    oldest[1].controller.abort();
    dashboardCache.delete(oldest[0]);
  }
}

function invalidateAllDashboardEntries() {
  dashboardCache.forEach((entry) => entry.controller.abort());
  dashboardCache.clear();
}

subscribeAuthCredentialSnapshot(() => {
  const nextVersion = getAuthCredentialSnapshot().credentialVersion;
  if (nextVersion === observedCredentialVersion) return;
  observedCredentialVersion = nextVersion;
  invalidateAllDashboardEntries();
});

function getDashboardOwnerKey(owner: MerchantAdminDashboardOwner) {
  return JSON.stringify([
    owner.userId,
    owner.identityId,
    owner.shopPublicId,
    owner.credentialEpoch
  ]);
}

function getDashboardCacheKey(owner: MerchantAdminDashboardOwner, query: DashboardQuery) {
  return JSON.stringify([
    getDashboardOwnerKey(owner),
    query.period,
    query.from ?? null,
    query.to ?? null,
    query.city ?? null
  ]);
}

function createSupersededError() {
  return new DOMException("Dashboard owner was superseded", "AbortError");
}

function assertDashboardOwnerCurrent(
  owner: MerchantAdminDashboardOwner,
  controller: AbortController
) {
  if (
    controller.signal.aborted ||
    getAuthCredentialSnapshot().credentialVersion !== owner.credentialEpoch
  ) {
    throw createSupersededError();
  }
}

function assertMerchantDashboardScope(
  payload: BackofficeDashboardPayload,
  expectedShopPublicId: string
) {
  if (payload.scope?.kind !== "shop" || payload.scope.shopPublicId !== expectedShopPublicId) {
    throw new Error("error.auth.dashboard_scope_mismatch");
  }
}

export function invalidateMerchantAdminDashboard(
  owner: MerchantAdminDashboardOwner,
  query: DashboardQuery
) {
  const cacheKey = getDashboardCacheKey(owner, query);
  dashboardCache.get(cacheKey)?.controller.abort();
  dashboardCache.delete(cacheKey);
}

export function invalidateMerchantAdminDashboardOwner(owner: MerchantAdminDashboardOwner) {
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
  query: DashboardQuery
): Promise<BackofficeDashboardPayload> {
  if (!/^shop\d{10}$/.test(owner.shopPublicId)) {
    return Promise.reject(new Error("error.auth.merchant_shop_required"));
  }

  const requestQuery = { ...query };
  const cacheKey = getDashboardCacheKey(owner, requestQuery);
  const cached = dashboardCache.get(cacheKey);

  if (cached?.request) {
    try {
      assertDashboardOwnerCurrent(owner, cached.controller);
    } catch (error) {
      return Promise.reject(error);
    }
    cached.touchedAt = Date.now();
    return cached.request;
  }

  if (cached?.payload && cached.expiresAt > Date.now()) {
    try {
      assertDashboardOwnerCurrent(owner, cached.controller);
    } catch (error) {
      return Promise.reject(error);
    }
    cached.touchedAt = Date.now();
    return Promise.resolve(cached.payload);
  }

  if (cached) dashboardCache.delete(cacheKey);

  const controller = new AbortController();
  const ownerKey = getDashboardOwnerKey(owner);
  const entry: MerchantAdminDashboardCacheEntry = {
    controller,
    expiresAt: 0,
    ownerKey,
    touchedAt: Date.now()
  };
  const request = loadCoreReadWithTransientRetry(async () => {
    assertDashboardOwnerCurrent(owner, controller);
    return backofficeRealDataApi.dashboard("merchant-admin", requestQuery, {
      signal: controller.signal
    });
  })
    .then((payload) => {
      assertDashboardOwnerCurrent(owner, controller);
      assertMerchantDashboardScope(payload, owner.shopPublicId);

      if (dashboardCache.get(cacheKey) === entry) {
        entry.expiresAt = Date.now() + resolvedPayloadMaxAgeMs;
        entry.payload = payload;
        entry.touchedAt = Date.now();
        delete entry.request;
        sweepDashboardCache();
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
  sweepDashboardCache();

  return request;
}
