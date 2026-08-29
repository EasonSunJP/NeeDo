import {
  FeatureCarousel,
  featureCarouselFrameClassName,
  type FeatureCarouselSlide
} from "../../components/client-ui/FeatureCarousel";
import type { PublishedCarouselTarget } from "../../api/contentPublication";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { cn } from "../../lib/utils";
import { contentPublicationText } from "./i18n";
import { toContentLocale } from "./locales";
import {
  usePublishedCarousel,
  type PublishedCarouselUiScene
} from "./usePublishedCarousel";

export function carouselTargetPath(target: PublishedCarouselTarget): string {
  if (target.type === "shop") {
    return `/stores/${encodeURIComponent(target.publicId)}`;
  }
  if (target.type === "technician") {
    return `/profiles/technician/${encodeURIComponent(target.publicId)}`;
  }
  if (target.type === "service") {
    return `/services/${encodeURIComponent(target.publicId)}`;
  }
  return `/afirieito/announcements/${encodeURIComponent(target.publicId)}`;
}

function PublishedCarouselState({
  cardHeightClassName,
  children,
  className,
  testId
}: {
  cardHeightClassName: string;
  children: React.ReactNode;
  className?: string;
  testId: string;
}) {
  return (
    <section
      className={cn(
        featureCarouselFrameClassName,
        "flex items-center justify-center",
        cardHeightClassName,
        className
      )}
      data-testid={testId}
      role="status"
    >
      {children}
    </section>
  );
}

export function PublishedCarousel({
  cardHeightClassName,
  scene
}: {
  cardHeightClassName?: string;
  scene: PublishedCarouselUiScene;
}) {
  const { language } = useOptionalI18n();
  const locale = toContentLocale(language);
  const { data, error, loading, retry } = usePublishedCarousel(scene, locale);
  const resolvedCardHeightClassName = cardHeightClassName ?? "h-[176px]";

  if (loading) {
    return (
      <PublishedCarouselState
        cardHeightClassName={resolvedCardHeightClassName}
        className="motion-safe:animate-pulse rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] text-sm font-bold text-[color:var(--client-muted)]"
        testId="published-carousel-loading"
      >
        {contentPublicationText("loading", language)}
      </PublishedCarouselState>
    );
  }

  if (error) {
    return (
      <PublishedCarouselState
        cardHeightClassName={resolvedCardHeightClassName}
        className="flex-col gap-3 rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-5 text-center"
        testId="published-carousel-error"
      >
        <p className="text-sm font-bold text-[color:var(--client-text)]">
          {contentPublicationText("error", language)}
        </p>
        <button
          className="focus-ring rounded-full bg-[color:var(--client-primary)] px-4 py-2 text-xs font-black text-white"
          onClick={retry}
          type="button"
        >
          {contentPublicationText("retry", language)}
        </button>
      </PublishedCarouselState>
    );
  }

  if (!data || data.slides.length === 0) {
    return (
      <PublishedCarouselState
        cardHeightClassName={resolvedCardHeightClassName}
        className="rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-5 text-center text-sm font-bold text-[color:var(--client-muted)]"
        testId="published-carousel-empty"
      >
        {contentPublicationText("empty", language)}
      </PublishedCarouselState>
    );
  }

  const slides: FeatureCarouselSlide[] = data.slides.map((slide) => ({
    id: slide.id,
    badge: slide.badge ?? undefined,
    title: slide.title,
    caption: slide.caption ?? undefined,
    cta: slide.ctaLabel,
    image: slide.imageUrl,
    imageAlt: slide.imageAltText,
    to: carouselTargetPath(slide.target)
  }));

  return <FeatureCarousel cardHeightClassName={resolvedCardHeightClassName} slides={slides} />;
}
