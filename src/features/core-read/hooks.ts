import { useEffect, useState, type DependencyList } from "react";

export type CoreReadQueryState<TData> = {
  data: TData | null;
  error: string | null;
  loading: boolean;
};

function normalizeCoreReadError(error: unknown) {
  return error instanceof Error ? error.message : String(error || "error.api");
}

export function useCoreReadQuery<TData>(
  load: () => Promise<TData> | null,
  deps: DependencyList
): CoreReadQueryState<TData> {
  const [state, setState] = useState<CoreReadQueryState<TData>>({
    data: null,
    error: null,
    loading: true
  });

  useEffect(() => {
    let active = true;
    const request = load();

    if (!request) {
      setState({ data: null, error: null, loading: false });
      return () => {
        active = false;
      };
    }

    setState((current) => ({ ...current, error: null, loading: true }));

    request
      .then((data) => {
        if (active) {
          setState({ data, error: null, loading: false });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({ data: null, error: normalizeCoreReadError(error), loading: false });
        }
      });

    return () => {
      active = false;
    };
  }, deps);

  return state;
}
