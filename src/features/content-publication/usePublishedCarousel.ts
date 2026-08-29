import { useCallback, useEffect, useState } from "react";
import {
  contentPublicationApi,
  type ContentLocaleCode,
  type PublishedCarouselPayload
} from "../../api/contentPublication";

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
  const [state, setState] = useState<PublishedCarouselState>(initialState);

  useEffect(() => {
    let active = true;
    setState(initialState);

    const request =
      scene === "user-home"
        ? contentPublicationApi.getUserHomeCarousel(locale)
        : contentPublicationApi.getAffiliateCarousel(locale);

    void request.then(
      (data) => {
        if (active) {
          setState({ data, error: null, loading: false });
        }
      },
      (error: unknown) => {
        if (active) {
          setState({ data: null, error, loading: false });
        }
      }
    );

    return () => {
      active = false;
    };
  }, [locale, revision, scene]);

  const retry = useCallback(() => setRevision((current) => current + 1), []);

  return { ...state, retry };
}
