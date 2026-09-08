import { useCallback, useEffect, useRef, useState } from "react";
import type { Customer } from "../../types/domain";
import { platformMembershipSelfApi } from "../platform-membership/api";
import { mapCoreCustomerToCustomer } from "./api";
import { customerProfileApi, type CustomerSelfProfile } from "./customerProfileApi";

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

let customerSelfProfileRequestInFlight: Promise<CustomerSelfProfile> | null = null;

function requestCustomerSelfProfile(force = false) {
  if (!force && customerSelfProfileRequestInFlight) {
    return customerSelfProfileRequestInFlight;
  }

  const request = Promise.all([
    customerProfileApi.getMine(),
    platformMembershipSelfApi.getMine().catch(() => null)
  ]).then(([profile, membership]) => ({ ...profile, membershipLevel: membership?.tierCode ?? "" }));
  customerSelfProfileRequestInFlight = request;
  const clearRequest = () => {
    if (customerSelfProfileRequestInFlight === request) {
      customerSelfProfileRequestInFlight = null;
    }
  };
  void request.then(clearRequest, clearRequest);

  return request;
}

export function useCustomerSelfProfile(enabled = true): CustomerSelfProfileResource {
  const [state, setState] = useState<CustomerSelfProfileState>(() =>
    enabled ? initialState : disabledState
  );
  const requestGeneration = useRef(0);

  const load = useCallback(async (force = false) => {
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;

    if (!enabled) {
      setState(disabledState);
      return;
    }

    setState({
      profile: null,
      customer: null,
      loading: true,
      error: null
    });

    try {
      const profile = await requestCustomerSelfProfile(force);
      if (requestGeneration.current !== generation) return;
      setState({
        profile,
        customer: mapCoreCustomerToCustomer(profile),
        loading: false,
        error: null
      });
    } catch (error) {
      if (requestGeneration.current !== generation) return;
      setState({
        profile: null,
        customer: null,
        loading: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }, [enabled]);

  useEffect(() => {
    void load();
    return () => {
      requestGeneration.current += 1;
    };
  }, [load]);

  const reload = useCallback(() => {
    void load(true);
  }, [load]);

  return { ...state, reload };
}
