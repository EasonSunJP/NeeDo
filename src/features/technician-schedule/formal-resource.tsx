import { useCallback, useEffect, useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import type { AuthSession } from "../../auth/rbac";
import { bookingApi, type BookingOrder, type BookingScheduleSlot } from "../booking/api";
import { technicianProfileApi, type TechnicianSelfProfile } from "../core-read/technicianProfileApi";
import {
  pricingModeApi,
  type TechnicianServicePayload
} from "../pricing-mode/api";
import { schedulingApi } from "../scheduling/api";
import { getAuthenticatedPersistentCacheScope } from "../../lib/persistentCacheScope";
import { persistentResourceCache } from "../../lib/persistentResourceCache";

export type FormalTechnicianScheduleContext = {
  profile: Pick<TechnicianSelfProfile, "id" | "displayName" | "avatarUrl">;
  shopId: number | null;
  shopName: string;
  services: TechnicianServicePayload[];
  slot: BookingScheduleSlot | null;
};

export type FormalResourceState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  retry: () => void;
};

type ResourceValue<T> = Omit<FormalResourceState<T>, "retry">;

const technicianIdentityError = "error.auth.identity_forbidden";
const invalidRouteIdError = "error.request.invalid";

function normalizeFormalResourceError(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message || "error.api";
  }
  if (error instanceof Error) {
    return error.message || "error.api";
  }
  return typeof error === "string" && error ? error : "error.api";
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export function parsePositiveRouteId(value: string | null | undefined): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function getActiveTechnicianProfileId(session: AuthSession | null | undefined): number | null {
  if (
    session?.portal !== "technician" ||
    session.currentIdentity.type !== "technician" ||
    session.currentIdentity.scopeType !== "technician_profile" ||
    session.currentIdentity.scopeId === null ||
    !isPositiveInteger(session.currentIdentity.scopeId)
  ) {
    return null;
  }

  return session.currentIdentity.scopeId;
}

export async function loadAllTechnicianServices(_shopId?: number): Promise<TechnicianServicePayload[]> {
  const pageSize = 100;
  const firstPage = await pricingModeApi.listMyTechnicianServices({
    activeOnly: true,
    page: 1,
    pageSize
  });
  const pages = Math.max(1, Math.ceil(firstPage.total / Math.max(1, firstPage.page_size)));
  const services = [...firstPage.list];

  for (let page = 2; page <= pages; page += 1) {
    const response = await pricingModeApi.listMyTechnicianServices({
      activeOnly: true,
      page,
      pageSize
    });
    services.push(...response.list);
  }

  return services
    .filter((service) => service.isActive && service.isBookable)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
}

export function useFormalTechnicianScheduleResource(
  session: AuthSession | null | undefined,
  slotId: number | null
): FormalResourceState<FormalTechnicianScheduleContext> {
  const technicianProfileId = getActiveTechnicianProfileId(session);
  const cacheScope = getAuthenticatedPersistentCacheScope();
  const cacheKey = `technician:schedule-context:v2:${technicianProfileId ?? "missing"}:slot:${slotId ?? "new"}`;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<ResourceValue<FormalTechnicianScheduleContext>>(() => {
    const cached = cacheScope
      ? persistentResourceCache.peek<FormalTechnicianScheduleContext>(cacheScope, cacheKey)
      : undefined;
    return { data: cached ?? null, error: null, loading: cached === undefined };
  });

  useEffect(() => {
    let active = true;

    if (!technicianProfileId) {
      setState({ data: null, error: technicianIdentityError, loading: false });
      return () => {
        active = false;
      };
    }
    if (slotId !== null && !isPositiveInteger(slotId)) {
      setState({ data: null, error: invalidRouteIdError, loading: false });
      return () => {
        active = false;
      };
    }

    const cached = cacheScope
      ? persistentResourceCache.peek<FormalTechnicianScheduleContext>(cacheScope, cacheKey)
      : undefined;
    setState({ data: cached ?? null, error: null, loading: cached === undefined });
    const unsubscribe = cacheScope
      ? persistentResourceCache.subscribe<FormalTechnicianScheduleContext>(cacheScope, cacheKey, (data) => {
          if (active) setState({ data, error: null, loading: false });
        })
      : () => undefined;
    const loadFromServer = async () => {
      const selfProfile = await technicianProfileApi.getMine();
      const [services, slot] = await Promise.all([
        loadAllTechnicianServices(),
        slotId === null ? Promise.resolve(null) : schedulingApi.getTechnicianSlot(slotId)
      ]);
      return {
        profile: {
          avatarUrl: selfProfile.avatarUrl,
          displayName: selfProfile.displayName,
          id: selfProfile.id
        },
        shopId: selfProfile.shopId,
        shopName: selfProfile.shopId
          ? services.find((service) => service.shopId === selfProfile.shopId)?.shop?.name
            ?? slot?.shopName
            ?? "关联店铺"
          : "独立技师",
        services,
        slot
      };
    };
    void (async () => {
      try {
        const data = cacheScope
          ? await persistentResourceCache.load({
              force: revision > 0,
              key: cacheKey,
              load: loadFromServer,
              scope: cacheScope
            })
          : await loadFromServer();
        if (active) {
          setState({ data, error: null, loading: false });
        }
      } catch (error) {
        if (active) {
          setState({ data: null, error: normalizeFormalResourceError(error), loading: false });
        }
      }
    })();

    return () => {
      active = false;
      unsubscribe();
    };
  }, [cacheKey, cacheScope, revision, slotId, technicianProfileId]);

  const retry = useCallback(() => setRevision((current) => current + 1), []);
  return { ...state, retry };
}

export function useFormalTechnicianOrderResource(
  session: AuthSession | null | undefined,
  orderId: number | null
): FormalResourceState<BookingOrder> {
  const technicianProfileId = getActiveTechnicianProfileId(session);
  const cacheScope = getAuthenticatedPersistentCacheScope();
  const cacheKey = `technician:order:${technicianProfileId ?? "missing"}:${orderId ?? "missing"}`;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<ResourceValue<BookingOrder>>(() => {
    const cached = cacheScope
      ? persistentResourceCache.peek<BookingOrder>(cacheScope, cacheKey)
      : undefined;
    return { data: cached ?? null, error: null, loading: cached === undefined };
  });

  useEffect(() => {
    let active = true;

    if (!technicianProfileId) {
      setState({ data: null, error: technicianIdentityError, loading: false });
      return () => {
        active = false;
      };
    }
    if (orderId === null || !isPositiveInteger(orderId)) {
      setState({ data: null, error: invalidRouteIdError, loading: false });
      return () => {
        active = false;
      };
    }

    const cached = cacheScope ? persistentResourceCache.peek<BookingOrder>(cacheScope, cacheKey) : undefined;
    setState({ data: cached ?? null, error: null, loading: cached === undefined });
    const unsubscribe = cacheScope
      ? persistentResourceCache.subscribe<BookingOrder>(cacheScope, cacheKey, (order) => {
          if (active) setState({ data: order, error: null, loading: false });
        })
      : () => undefined;
    const request = cacheScope
      ? persistentResourceCache.load({
          force: revision > 0,
          key: cacheKey,
          load: () => bookingApi.getOrder(orderId),
          scope: cacheScope
        })
      : bookingApi.getOrder(orderId);
    void request
      .then((order) => {
        if (active) setState({ data: order, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (active) {
          setState({ data: null, error: normalizeFormalResourceError(error), loading: false });
        }
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [cacheKey, cacheScope, orderId, revision, technicianProfileId]);

  const retry = useCallback(() => setRevision((current) => current + 1), []);
  return { ...state, retry };
}
