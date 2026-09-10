import { useCallback, useEffect, useState } from "react";
import {
  contentPublicationApi,
  type ContentLocaleCode,
  type PublishedCarouselPayload
} from "../../api/contentPublication";
import { persistentResourceCache } from "../../lib/persistentResourceCache";

export type PublishedCarouselUiScene = "user-home" | "affiliate-home-notice";

type PublishedCarouselState = {
  data: PublishedCarouselPayload | null;
  error: unknown;
  loading: boolean;
};

const initialState: PublishedCarouselState = {
  data: null,
  error: null,
  loading: true
};

export function usePublishedCarousel(scene: PublishedCarouselUiScene, locale: ContentLocaleCode) {
  const [revision, setRevision] = useState(0);
  const cacheKey = `carousel:${scene}:${locale}`;
  const [state, setState] = useState<PublishedCarouselState>(() => {
    const cached = persistentResourceCache.peek<PublishedCarouselPayload>("public", cacheKey);
    return cached ? { data: cached, error: null, loading: false } : initialState;
  });

  useEffect(() => {
    let active = true;
    const cached = persistentResourceCache.peek<PublishedCarouselPayload>("public", cacheKey);
    setState(cached ? { data: cached, error: null, loading: false } : initialState);
    const unsubscribe = persistentResourceCache.subscribe<PublishedCarouselPayload>(
      "public",
      cacheKey,
      (data) => {
        if (active) setState({ data, error: null, loading: false });
      }
    );

    const request = persistentResourceCache.load({
      force: revision > 0,
      key: cacheKey,
      scope: "public",
      load: async () => {
        const data = scene === "user-home"
          ? await contentPublicationApi.getUserHomeCarousel(locale)
          : await contentPublicationApi.getAffiliateCarousel(locale);
        const current = persistentResourceCache.peek<PublishedCarouselPayload>("public", cacheKey);
        return current?.releaseVersion === data.releaseVersion ? current : data;
      }
    });

    void request.then(
      (data) => {
        if (active) {
          setState({ data, error: null, loading: false });
        }
      },
      (error: unknown) => {
        if (active) {
          const fallback = persistentResourceCache.peek<PublishedCarouselPayload>("public", cacheKey);
          setState({ data: fallback ?? null, error: fallback ? null : error, loading: false });
        }
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [cacheKey, locale, revision, scene]);

  const retry = useCallback(() => setRevision((current) => current + 1), []);

  return { ...state, retry };
}
