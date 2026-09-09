import { useEffect, useState, type ReactNode } from "react";
import type {
  CarouselRelease,
  CarouselReleaseSlide,
  ContentLocaleCode,
} from "../../api/contentPublication";
import {
  FeatureCarousel,
  type FeatureCarouselSlide,
} from "../../components/client-ui/FeatureCarousel";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import { contentPublicationEditorText } from "./i18n";

export const carouselWorkspaceLocales = [
  "ja",
  "en",
  "ko",
  "zh-TW",
  "zh-CN",
] as const;

export const carouselWorkspaceLocaleLabels: Record<
  ContentLocaleCode,
  string
> = {
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  en: "English",
  ja: "日本語",
  ko: "한국어",
};

const dateLocales: Record<Language, string> = {
  zh: "zh-CN",
  "zh-Hant": "zh-TW",
  en: "en-US",
  ja: "ja-JP",
  ko: "ko-KR",
};

export function formatCarouselPublishedAt(
  value: string | null,
  language: Language,
) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(dateLocales[language], {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function sortedSlides(release: CarouselRelease | null) {
  return release
    ? [...release.slides].sort((left, right) => left.sortOrder - right.sortOrder)
    : [];
}

function imageFor(slide: CarouselReleaseSlide, locale: ContentLocaleCode) {
  return slide.translations[locale].imageUrl || slide.defaultImageUrl;
}

function toFeatureSlide(
  slide: CarouselReleaseSlide,
  locale: ContentLocaleCode,
): FeatureCarouselSlide {
  const copy = slide.translations[locale];
  return {
    id: slide.id,
    badge: copy.badge ?? undefined,
    title: copy.title,
    caption: copy.caption ?? undefined,
    cta: copy.ctaLabel,
    image: imageFor(slide, locale),
    imageAlt: copy.imageAltText,
  };
}

function ContentSummary({
  label,
  locale,
  onOpenImage,
  slide,
}: {
  label: string;
  locale: ContentLocaleCode;
  onOpenImage: (image: { alt: string; src: string }) => void;
  slide: CarouselReleaseSlide | null;
}) {
  const { language } = useOptionalI18n();
  if (!slide) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-paper px-4 py-6 text-sm font-bold text-ink/45">
        {label} · —
      </div>
    );
  }

  const copy = slide.translations[locale];
  const image = imageFor(slide, locale);

  return (
    <div className="grid gap-4 lg:grid-cols-[184px_minmax(0,1fr)] lg:items-center">
      <button
        aria-label={`${contentPublicationEditorText("viewLargeImage", language)}：${copy.imageAltText}`}
        className="focus-ring group relative overflow-hidden rounded-xl border border-line bg-paper text-left"
        onClick={() => onOpenImage({ alt: copy.imageAltText, src: image })}
        type="button"
      >
        <img
          alt={copy.imageAltText}
          className="aspect-[15/8] w-full object-cover transition-transform duration-200 motion-reduce:transition-none group-hover:scale-[1.025]"
          src={image}
        />
      </button>
      <div className="min-w-0">
        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-ink/40">
          {label}
        </p>
        <h3 className="mt-1 truncate text-lg font-black text-ink">
          {copy.title}
        </h3>
        {copy.caption ? (
          <p className="mt-1 line-clamp-2 text-sm font-semibold leading-6 text-ink/60">
            {copy.caption}
          </p>
        ) : null}
        <p className="mt-2 text-xs font-bold text-ink/40">
          {contentPublicationEditorText("clickToEnlarge", language)}
        </p>
      </div>
    </div>
  );
}

export function UserHomeCarouselWorkspace({
  children,
  draft,
  locale,
  onLocaleChange,
  onSelectedIndexChange,
  published,
  selectedIndex,
}: {
  children: ReactNode;
  draft: CarouselRelease | null;
  locale: ContentLocaleCode;
  onLocaleChange: (locale: ContentLocaleCode) => void;
  onSelectedIndexChange: (index: number) => void;
  published: CarouselRelease | null;
  selectedIndex: number;
}) {
  const { language } = useOptionalI18n();
  const [paused, setPaused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const [fullImage, setFullImage] = useState<{
    alt: string;
    src: string;
  } | null>(null);
  const previewRelease = draft ?? published;
  const previewSlides = sortedSlides(previewRelease).filter(
    (slide) => slide.isEnabled,
  );
  const currentSlide = sortedSlides(published)[activeIndex] ?? null;
  const replacementSlide = sortedSlides(draft)[activeIndex] ?? null;

  useEffect(() => {
    setActiveIndex(selectedIndex);
  }, [selectedIndex]);

  const selectIndex = (index: number) => {
    setActiveIndex(index);
    onSelectedIndexChange(index);
  };

  return (
    <div
      className="space-y-4"
      data-testid="user-home-carousel-workspace"
    >
      {previewSlides.length > 0 ? (
        <section className="rounded-xl border border-line bg-white p-4 shadow-panel sm:p-5">
          <FeatureCarousel
            activeIndex={Math.min(activeIndex, previewSlides.length - 1)}
            autoRotateMs={paused ? null : 5000}
            cardHeightClassName="h-[190px] sm:h-[220px]"
            dataNoI18n
            onActiveIndexChange={selectIndex}
            onSlideClick={(_slide, index) => {
              setPaused(true);
              selectIndex(index);
            }}
            slides={previewSlides.map((slide) =>
              toFeatureSlide(slide, locale),
            )}
          />
        </section>
      ) : null}

      <nav
        aria-label={contentPublicationEditorText("carouselEditor", language)}
        className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-white p-2 shadow-panel sm:grid-cols-5"
        role="tablist"
      >
        {carouselWorkspaceLocales.map((item) => (
          <button
            aria-selected={item === locale}
            className={`focus-ring min-h-10 rounded-lg px-3 py-2 text-sm font-black transition-colors ${
              item === locale
                ? "bg-moss text-white shadow-sm"
                : "bg-paper text-ink/55 hover:bg-mint/20 hover:text-ink"
            }`}
            key={item}
            onClick={() => onLocaleChange(item)}
            role="tab"
            type="button"
          >
            {carouselWorkspaceLocaleLabels[item]}
          </button>
        ))}
      </nav>

      <section className="rounded-xl border border-line bg-white p-4 shadow-panel sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <h2 className="text-base font-black text-ink">
            {contentPublicationEditorText(
              "currentPublishedContent",
              language,
            )}
          </h2>
          <p className="text-xs font-bold text-ink/50">
            {contentPublicationEditorText("lastPublishedAt", language)} ·{" "}
            <time dateTime={published?.activatedAt ?? undefined}>
              {formatCarouselPublishedAt(published?.activatedAt ?? null, language)}
            </time>
          </p>
        </div>
        <ContentSummary
          label={contentPublicationEditorText(
            "currentPublishedContent",
            language,
          )}
          locale={locale}
          onOpenImage={setFullImage}
          slide={currentSlide}
        />
      </section>

      <div
        className="flex flex-col items-center justify-center text-moss"
        data-testid="carousel-replacement-arrow"
      >
        <span className="text-xs font-black text-ink/45">
          {contentPublicationEditorText("replacesBelow", language)}
        </span>
        <svg
          aria-hidden="true"
          className="mt-1 h-7 w-7 motion-safe:animate-bounce"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            d="M12 4v15m0 0 6-6m-6 6-6-6"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </svg>
      </div>

      <section className="rounded-xl border border-moss/30 bg-white p-4 shadow-panel ring-1 ring-mint/30 sm:p-5">
        <h2 className="mb-4 border-b border-line pb-3 text-base font-black text-ink">
          {contentPublicationEditorText("replacementContent", language)}
        </h2>
        <ContentSummary
          label={contentPublicationEditorText("replacementContent", language)}
          locale={locale}
          onOpenImage={setFullImage}
          slide={replacementSlide}
        />
        <div className="mt-5 border-t border-line pt-5">{children}</div>
      </section>

      {fullImage ? (
        <div
          aria-label={fullImage.alt}
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-5"
          onClick={() => setFullImage(null)}
          role="dialog"
        >
          <div
            className="relative max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-xl bg-black shadow-soft"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              alt={fullImage.alt}
              className="max-h-[90vh] w-full object-contain"
              src={fullImage.src}
            />
            <button
              aria-label={contentPublicationEditorText(
                "closePreview",
                language,
              )}
              className="focus-ring absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-black/65 text-xl font-black text-white"
              onClick={() => setFullImage(null)}
              type="button"
            >
              ×
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
