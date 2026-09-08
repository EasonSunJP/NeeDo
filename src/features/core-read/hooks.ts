import { useEffect, useState, type DependencyList } from "react";
import { persistentResourceCache } from "../../lib/persistentResourceCache";

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
  deps: DependencyList,
  cache?: { enabled?: boolean; force?: boolean; key: string; scope?: string | null }
): CoreReadQueryState<TData> {
  const scope = cache?.scope === undefined ? "public" : cache.scope;
  const [state, setState] = useState<CoreReadQueryState<TData>>(() => {
    const cached = cache && scope ? persistentResourceCache.peek<TData>(scope, cache.key) : undefined;
    return { data: cached ?? null, error: null, loading: cached === undefined };
  });

  useEffect(() => {
    let active = true;
    if (cache?.enabled === false) {
      setState({ data: null, error: null, loading: false });
      return () => {
        active = false;
      };
    }

    const request = cache && scope
      ? persistentResourceCache.load<TData>({
          force: cache.force,
          key: cache.key,
          load: async () => {
            const serverRequest = load();
            if (!serverRequest) throw new Error("error.cache.disabled_resource");
            return serverRequest;
          },
          scope
        })
      : load();

    if (!request) {
      setState({ data: null, error: null, loading: false });
      return () => {
        active = false;
      };
    }

    const cached = cache && scope ? persistentResourceCache.peek<TData>(scope, cache.key) : undefined;
    setState((current) => ({
      ...current,
      data: cached ?? current.data,
      error: null,
      loading: cached === undefined && current.data === null
    }));

    const unsubscribe = cache && scope
      ? persistentResourceCache.subscribe<TData>(scope, cache.key, (data) => {
          if (active) setState({ data, error: null, loading: false });
        })
      : () => undefined;

    request
      .then((data) => {
        if (active) {
          setState({ data, error: null, loading: false });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          const fallback = cache && scope
            ? persistentResourceCache.peek<TData>(scope, cache.key)
            : undefined;
          setState({
            data: fallback ?? null,
            error: fallback === undefined ? normalizeCoreReadError(error) : null,
            loading: false
          });
        }
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [...deps, cache?.enabled, cache?.force, cache?.key, scope]);

  return state;
}
