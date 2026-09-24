import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import { listExchangePosts } from "./api";
import type { ExchangePost, ExchangePostType } from "./types";

export type ExchangeFeedErrorKind = "unauthorized" | "forbidden" | "unavailable" | "unknown";

export type ExchangeFeedError = {
  kind: ExchangeFeedErrorKind;
  message: string;
};

type FeedBucket = {
  ids: number[];
  page: number;
  total: number;
};

type FeedState = {
  items: Record<number, ExchangePost>;
  buckets: Record<ExchangePostType, FeedBucket>;
  loading: boolean;
  loadingMore: boolean;
  error: ExchangeFeedError | null;
};

const emptyBucket = (): FeedBucket => ({ ids: [], page: 0, total: 0 });

const initialState = (): FeedState => ({
  items: {},
  buckets: {
    demand: emptyBucket(),
    intelligence: emptyBucket()
  },
  loading: true,
  loadingMore: false,
  error: null
});

function classifyExchangeFeedError(error: unknown): ExchangeFeedError {
  const message = error instanceof Error ? error.message : String(error);

  if (error instanceof ApiClientError && error.status === 401) {
    return { kind: "unauthorized", message };
  }
  if (error instanceof ApiClientError && error.status === 403) {
    return { kind: "forbidden", message };
  }
  if (error instanceof TypeError || (error instanceof ApiClientError && error.status >= 500)) {
    return { kind: "unavailable", message };
  }

  return { kind: "unknown", message };
}

function removeBucketItems(state: FeedState, type: ExchangePostType) {
  const items = { ...state.items };
  state.buckets[type].ids.forEach((id) => delete items[id]);
  return items;
}

export function useExchangeFeed(initialType: ExchangePostType, pageSize = 20) {
  const [activeType, setActiveTypeState] = useState<ExchangePostType>(initialType);
  const [state, setState] = useState<FeedState>(initialState);
  const [reloadVersion, setReloadVersion] = useState(0);
  const requestRef = useRef<AbortController | null>(null);
  const requestGeneration = useRef(0);

  const loadFirstPage = useCallback(async (type: ExchangePostType) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;

    setState((current) => ({
      ...current,
      items: removeBucketItems(current, type),
      buckets: { ...current.buckets, [type]: emptyBucket() },
      loading: true,
      loadingMore: false,
      error: null
    }));

    try {
      const result = await listExchangePosts({ type, page: 1, pageSize, signal: controller.signal });
      if (controller.signal.aborted || requestGeneration.current !== generation) return;

      setState((current) => ({
        ...current,
        items: {
          ...current.items,
          ...Object.fromEntries(result.list.map((post) => [post.id, post]))
        },
        buckets: {
          ...current.buckets,
          [type]: { ids: result.list.map((post) => post.id), page: result.page, total: result.total }
        },
        loading: false,
        loadingMore: false,
        error: null
      }));
    } catch (error) {
      if (controller.signal.aborted || requestGeneration.current !== generation) return;
      setState((current) => ({
        ...current,
        items: removeBucketItems(current, type),
        buckets: { ...current.buckets, [type]: emptyBucket() },
        loading: false,
        loadingMore: false,
        error: classifyExchangeFeedError(error)
      }));
    }
  }, [pageSize]);

  useEffect(() => {
    void loadFirstPage(activeType);
    return () => requestRef.current?.abort();
  }, [activeType, loadFirstPage, reloadVersion]);

  const setActiveType = useCallback((type: ExchangePostType) => {
    if (type === activeType) return;
    requestRef.current?.abort();
    setState((current) => ({
      ...current,
      items: removeBucketItems(current, type),
      buckets: { ...current.buckets, [type]: emptyBucket() },
      loading: true,
      loadingMore: false,
      error: null
    }));
    setActiveTypeState(type);
  }, [activeType]);

  const refresh = useCallback(() => {
    requestRef.current?.abort();
    setReloadVersion((version) => version + 1);
  }, []);

  const loadMore = useCallback(async () => {
    const bucket = state.buckets[activeType];
    if (state.loading || state.loadingMore || bucket.ids.length >= bucket.total) return;

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    setState((current) => ({ ...current, loadingMore: true, error: null }));

    try {
      const result = await listExchangePosts({
        type: activeType,
        page: bucket.page + 1,
        pageSize,
        signal: controller.signal
      });
      if (controller.signal.aborted || requestGeneration.current !== generation) return;

      setState((current) => {
        const currentBucket = current.buckets[activeType];
        const ids = Array.from(new Set([...currentBucket.ids, ...result.list.map((post) => post.id)]));
        return {
          ...current,
          items: {
            ...current.items,
            ...Object.fromEntries(result.list.map((post) => [post.id, post]))
          },
          buckets: {
            ...current.buckets,
            [activeType]: { ids, page: result.page, total: result.total }
          },
          loadingMore: false,
          error: null
        };
      });
    } catch (error) {
      if (controller.signal.aborted || requestGeneration.current !== generation) return;
      setState((current) => ({
        ...current,
        loadingMore: false,
        error: classifyExchangeFeedError(error)
      }));
    }
  }, [activeType, pageSize, state.buckets, state.loading, state.loadingMore]);

  const upsertPost = useCallback((post: ExchangePost) => {
    setState((current) => {
      const bucket = current.buckets[post.type];
      const exists = bucket.ids.includes(post.id);
      return {
        ...current,
        items: { ...current.items, [post.id]: post },
        buckets: {
          ...current.buckets,
          [post.type]: {
            ...bucket,
            ids: exists ? bucket.ids : [post.id, ...bucket.ids],
            total: exists ? bucket.total : bucket.total + 1
          }
        }
      };
    });
  }, []);

  const removePost = useCallback((postId: number) => {
    setState((current) => {
      const items = { ...current.items };
      delete items[postId];
      const removeFromBucket = (bucket: FeedBucket): FeedBucket => {
        if (!bucket.ids.includes(postId)) return bucket;
        return {
          ...bucket,
          ids: bucket.ids.filter((id) => id !== postId),
          total: Math.max(0, bucket.total - 1)
        };
      };
      return {
        ...current,
        items,
        buckets: {
          demand: removeFromBucket(current.buckets.demand),
          intelligence: removeFromBucket(current.buckets.intelligence)
        }
      };
    });
  }, []);

  const posts = useMemo(
    () => state.buckets[activeType].ids
      .map((id) => state.items[id])
      .filter((post): post is ExchangePost => Boolean(post)),
    [activeType, state.buckets, state.items]
  );
  const bucket = state.buckets[activeType];

  return {
    activeType,
    posts,
    total: bucket.total,
    page: bucket.page,
    hasMore: bucket.ids.length < bucket.total,
    loading: state.loading,
    loadingMore: state.loadingMore,
    error: state.error,
    setActiveType,
    refresh,
    loadMore,
    upsertPost,
    removePost
  };
}
