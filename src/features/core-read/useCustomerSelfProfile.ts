import { useCallback, useEffect, useRef, useState } from "react";
import type { Customer } from "../../types/domain";
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

export function useCustomerSelfProfile(): CustomerSelfProfileResource {
  const [state, setState] = useState<CustomerSelfProfileState>(initialState);
  const requestGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    setState({
      profile: null,
      customer: null,
      loading: true,
      error: null
    });

    try {
      const profile = await customerProfileApi.getMine();
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
  }, []);

  useEffect(() => {
    void load();
    return () => {
      requestGeneration.current += 1;
    };
  }, [load]);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  return { ...state, reload };
}
