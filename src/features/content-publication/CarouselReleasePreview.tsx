import type { ReactNode } from "react";
import type { CarouselRelease, ContentLocaleCode } from "../../api/contentPublication";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { contentPublicationEditorText } from "./i18n";

export function CarouselReleasePreview({
  locale,
  release,
  renderActions,
}: {
  locale: ContentLocaleCode;
  release: CarouselRelease;
  renderActions?: (slide: CarouselRelease["slides"][number], index: number) => ReactNode;
}) {
  const { language } = useOptionalI18n();

  return (
    <section
      className="rounded-lg border border-line bg-white p-5 shadow-panel"
      data-testid="published-carousel-preview"
    >
      <h2 className="text-lg font-black text-ink">
        {contentPublicationEditorText("publishedPreview", language)}
      </h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {release.slides.map((slide, index) => {
            if (!slide.isEnabled) return null;
            const copy = slide.translations[locale];
            return (
              <article
                className="overflow-hidden rounded-lg border border-line bg-paper"
                key={slide.id}
              >
                <img
                  alt={copy.imageAltText}
                  className="h-24 w-full bg-paper object-contain"
                  src={copy.imageUrl || slide.defaultImageUrl}
                />
                <div className="p-4">
                  <strong className="text-lg font-black text-ink">
                    {copy.title}
                  </strong>
                  {copy.caption ? (
                    <p className="mt-1 text-sm font-semibold text-ink/60">
                      {copy.caption}
                    </p>
                  ) : null}
                  {renderActions ? <div className="mt-3 flex flex-wrap gap-2">{renderActions(slide, index)}</div> : null}
                </div>
              </article>
            );
          })}
      </div>
    </section>
  );
}
