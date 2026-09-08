import { useCallback, useEffect, useRef, useState } from "react";
import type { Customer } from "../../types/domain";
import { platformMembershipSelfApi } from "../platform-membership/api";
import { mapCoreCustomerToCustomer } from "./api";
import { customerProfileApi, type CustomerSelfProfile } from "./customerProfileApi";
import { getAuthenticatedPersistentCacheScope } from "../../lib/persistentCacheScope";
import { persistentResourceCache } from "../../lib/persistentResourceCache";

export type CustomerSelfProfileResource = {
  profile: CustomerSelfProfile | null;
  customer: Customer | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

type CustomerSelfProfileState = Omit<CustomerSelfProfileResource, "reload">;

const initialState: CustomerSelfProfileState = {
  profile: null,
  customer: null,
  loading: true,
  error: null
};

const disabledState: CustomerSelfProfileState = {
  profile: null,
  customer: null,
  loading: false,
  error: null
};

const customerSelfProfileRequestsInFlight = new Map<string, Promise<CustomerSelfProfile>>();

function requestCustomerSelfProfile(scope: string | null, force = false) {
  const requestScope = scope ?? "uncached";
  const current = customerSelfProfileRequestsInFlight.get(requestScope);
  if (!force && current) {
    return current;
  }

  const serverRequest = () => Promise.all([
    customerProfileApi.getMine(),
    platformMembershipSelfApi.getMine().catch(() => null)
  ]).then(([profile, membership]) => ({ ...profile, membershipLevel: membership?.tierCode ?? "" }));
  const request = scope
    ? persistentResourceCache.load({ force, key: "customer:self", load: serverRequest, scope })
    : serverRequest();
  customerSelfProfileRequestsInFlight.set(requestScope, request);
  const clearRequest = () => {
    if (customerSelfProfileRequestsInFlight.get(requestScope) === request) {
      customerSelfProfileRequestsInFlight.delete(requestScope);
    }
  };
  void request.then(clearRequest, clearRequest);

  return request;
}

export function useCustomerSelfProfile(enabled = true): CustomerSelfProfileResource {
  const cacheScope = getAuthenticatedPersistentCacheScope();
  const [state, setState] = useState<CustomerSelfProfileState>(() => {
    if (!enabled) return disabledState;
    const profile = cacheScope
      ? persistentResourceCache.peek<CustomerSelfProfile>(cacheScope, "customer:self")
      : undefined;
    return profile
      ? { profile, customer: mapCoreCustomerToCustomer(profile), loading: false, error: null }
      : initialState;
  });
  const requestGeneration = useRef(0);

  const load = useCallback(async (force = false) => {
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;

    if (!enabled) {
      setState(disabledState);
      return;
    }

    const cached = cacheScope
      ? persistentResourceCache.peek<CustomerSelfProfile>(cacheScope, "customer:self")
      : undefined;
    setState({
      profile: cached ?? null,
      customer: cached ? mapCoreCustomerToCustomer(cached) : null,
      loading: cached === undefined,
      error: null
    });

    try {
      const profile = await requestCustomerSelfProfile(cacheScope, force);
      if (requestGeneration.current !== generation) return;
      setState({
        profile,
        customer: mapCoreCustomerToCustomer(profile),
        loading: false,
        error: null
      });
    } catch (error) {
      if (requestGeneration.current !== generation) return;
      const fallback = cacheScope
        ? persistentResourceCache.peek<CustomerSelfProfile>(cacheScope, "customer:self")
        : undefined;
      setState({
        profile: fallback ?? null,
        customer: fallback ? mapCoreCustomerToCustomer(fallback) : null,
        loading: false,
        error: fallback ? null : error instanceof Error ? error.message : String(error)
      });
    }
  }, [cacheScope, enabled]);

  useEffect(() => {
    const unsubscribe = enabled && cacheScope
      ? persistentResourceCache.subscribe<CustomerSelfProfile>(cacheScope, "customer:self", (profile) => {
          setState({
            profile,
            customer: mapCoreCustomerToCustomer(profile),
            loading: false,
            error: null
          });
        })
      : () => undefined;
    void load();
    return () => {
      requestGeneration.current += 1;
      unsubscribe();
    };
  }, [cacheScope, enabled, load]);

  const reload = useCallback(() => {
    void load(true);
  }, [load]);

  return { ...state, reload };
}
