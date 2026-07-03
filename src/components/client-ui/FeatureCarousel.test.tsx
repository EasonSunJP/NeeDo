import { describe, expect, it } from "vitest";
import featureCarouselSource from "./FeatureCarousel.tsx?raw";

describe("FeatureCarousel indicators", () => {
  it("keeps the active capsule and makes inactive dots visible on image carousels", () => {
    expect(featureCarouselSource).toContain("feature-carousel-indicator-pill");
    expect(featureCarouselSource).toContain("feature-carousel-indicator-dot");
    expect(featureCarouselSource).toContain("w-6 bg-[color:var(--client-primary)]");
    expect(featureCarouselSource).toContain("border border-white/35");
    expect(featureCarouselSource).toContain("bg-white/45");
    expect(featureCarouselSource).toContain("shadow-[0_0_8px_rgba(0,0,0,0.22)]");
    expect(featureCarouselSource).not.toContain("w-2 bg-[color:color-mix(in_srgb,var(--client-line)_82%,transparent)]");
  });
});
