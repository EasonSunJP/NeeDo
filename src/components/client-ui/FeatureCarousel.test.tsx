import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import {
  FeatureCarousel,
  resolveCarouselActiveIndex,
  resolveCarouselScrollLeft,
  type FeatureCarouselSlide
} from "./FeatureCarousel";
import featureCarouselSource from "./FeatureCarousel.tsx?raw";

function renderSlide(slide: FeatureCarouselSlide) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <FeatureCarousel autoRotateMs={null} slides={[slide]} />
    </MemoryRouter>
  );
}

describe("FeatureCarousel indicators", () => {
  it("aligns programmatic indicator navigation to full-width slide boundaries", () => {
    expect(resolveCarouselScrollLeft(0, 16, 16)).toBe(0);
    expect(resolveCarouselScrollLeft(0, 840, 16)).toBe(824);
    expect(resolveCarouselScrollLeft(3232, 66, 16)).toBe(3282);
  });

  it("aligns the selected slide within its real scroll container", () => {
    expect(featureCarouselSource).toContain("currentSlide.getBoundingClientRect()");
    expect(featureCarouselSource).toContain("viewport.getBoundingClientRect()");
    expect(featureCarouselSource).toContain("viewport.scrollTo({");
    expect(featureCarouselSource).not.toContain("currentSlide.scrollIntoView({");
  });

  it("resolves a settled horizontal scroll to the nearest full-width slide", () => {
    const offsets = [16, 840, 1664, 2488, 3312];

    expect(resolveCarouselActiveIndex(0, offsets)).toBe(0);
    expect(resolveCarouselActiveIndex(823, offsets)).toBe(1);
    expect(resolveCarouselActiveIndex(1649, offsets)).toBe(2);
    expect(resolveCarouselActiveIndex(9999, offsets)).toBe(4);
  });

  it("keeps the active capsule and makes inactive dots visible on image carousels", () => {
    expect(featureCarouselSource).toContain("feature-carousel-indicator-pill");
    expect(featureCarouselSource).toContain("feature-carousel-indicator-dot");
    expect(featureCarouselSource).toContain("w-6 bg-[color:var(--client-primary)]");
    expect(featureCarouselSource).toContain("border border-white/35");
    expect(featureCarouselSource).toContain("bg-white/45");
    expect(featureCarouselSource).toContain("shadow-[0_0_8px_rgba(0,0,0,0.22)]");
    expect(featureCarouselSource).not.toContain("w-2 bg-[color:color-mix(in_srgb,var(--client-line)_82%,transparent)]");
  });

  it("uses an authored image alt instead of replacing it with the slide title", () => {
    const markup = renderSlide({
      id: "localized",
      title: "Tokyo care",
      image: "/media/content/tokyo.webp",
      imageAlt: "A therapist preparing a treatment room"
    });

    expect(markup).toContain('alt="A therapist preparing a treatment room"');
    expect(markup).not.toContain('alt="Tokyo care"');
  });

  it("preserves authored CTA text and uses the legacy fallback only when CTA is undefined", () => {
    const authored = renderSlide({
      id: "authored",
      title: "東京ケア",
      image: "/media/content/tokyo.webp",
      cta: "詳しく見る"
    });
    const legacy = renderSlide({
      id: "legacy",
      title: "Legacy",
      image: "/media/content/legacy.webp"
    });

    expect(authored).toContain("詳しく見る");
    expect(authored).not.toContain("查看详情");
    expect(legacy).toContain("查看详情");
  });

  it("renders no CTA when the authored CTA is explicitly null", () => {
    const markup = renderSlide({
      id: "no-cta",
      title: "공지",
      image: "/media/content/notice.webp",
      cta: null
    });

    expect(markup).not.toContain("查看详情");
    expect(markup).not.toContain('data-feature-carousel-cta="true"');
  });

  it("exposes the shared carousel and paused state for controlled admin previews", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <FeatureCarousel
          activeIndex={0}
          autoRotateMs={null}
          onSlideClick={() => undefined}
          slides={[
            {
              id: "admin-preview",
              title: "Admin preview",
              image: "/media/content/admin-preview.webp",
            },
          ]}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain('data-testid="feature-carousel"');
    expect(markup).toContain('data-auto-rotate="paused"');
    expect(markup).toContain("<button");
  });
});
