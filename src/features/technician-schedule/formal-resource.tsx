import { useCallback, useEffect, useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import type { AuthSession } from "../../auth/rbac";
import { bookingApi, type BookingOrder, type BookingScheduleSlot } from "../booking/api";
import { coreReadApi, type CoreTechnicianDetail } from "../core-read/api";
import { technicianProfileApi } from "../core-read/technicianProfileApi";
import {
  pricingModeApi,
  type TechnicianServicePayload
} from "../pricing-mode/api";
import { schedulingApi } from "../scheduling/api";

export type FormalTechnicianScheduleContext = {
  profile: CoreTechnicianDetail;
  shopId: number;
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
const missingShopError = "error.technician.shop_required";

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

export async function loadAllTechnicianServices(shopId: number): Promise<TechnicianServicePayload[]> {
  const pageSize = 100;
  const firstPage = await pricingModeApi.listTechnicianServices(shopId, {
    activeOnly: true,
    page: 1,
    pageSize
  });
  const pages = Math.max(1, Math.ceil(firstPage.total / Math.max(1, firstPage.page_size)));
  const services = [...firstPage.list];

  for (let page = 2; page <= pages; page += 1) {
    const response = await pricingModeApi.listTechnicianServices(shopId, {
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
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<ResourceValue<FormalTechnicianScheduleContext>>({
    data: null,
    error: null,
    loading: true
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

    setState({ data: null, error: null, loading: true });
    void (async () => {
      try {
        const selfProfile = await technicianProfileApi.getMine();
        if (!selfProfile.shopId) throw new Error(missingShopError);
        const profile = await coreReadApi.getTechnicianDetail(technicianProfileId);
        if (!profile.shop || profile.shop.id !== selfProfile.shopId) throw new Error(missingShopError);
        const [services, slot] = await Promise.all([
          loadAllTechnicianServices(profile.shop.id),
          slotId === null ? Promise.resolve(null) : schedulingApi.getTechnicianSlot(slotId)
        ]);
        if (active) {
          setState({
            data: { profile, shopId: profile.shop.id, services, slot },
            error: null,
            loading: false
          });
        }
      } catch (error) {
        if (active) {
          setState({ data: null, error: normalizeFormalResourceError(error), loading: false });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [revision, slotId, technicianProfileId]);

  const retry = useCallback(() => setRevision((current) => current + 1), []);
  return { ...state, retry };
}

export function useFormalTechnicianOrderResource(
  session: AuthSession | null | undefined,
  orderId: number | null
): FormalResourceState<BookingOrder> {
  const technicianProfileId = getActiveTechnicianProfileId(session);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<ResourceValue<BookingOrder>>({
    data: null,
    error: null,
    loading: true
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

    setState({ data: null, error: null, loading: true });
    void bookingApi.getOrder(orderId)
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
    };
  }, [orderId, revision, technicianProfileId]);

  const retry = useCallback(() => setRevision((current) => current + 1), []);
  return { ...state, retry };
}
