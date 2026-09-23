import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OfferInfoCard } from "./OfferInfoCard";

vi.mock("../../theme/ClientThemeProvider", () => ({ useClientTheme: () => ({ theme: "dark-green" }) }));

describe("OfferInfoCard image layouts", () => {
  it("renders an explicit full-width 16:9 cover before the title", () => {
    const markup = renderToStaticMarkup(
      <OfferInfoCard
        fields={[]}
        image="/media/content/exchange/aa.webp"
        imageAlt="A service request"
        imageLabel="需求"
        imageLayout="wide"
        title="A service request"
      />
    );

    expect(markup).toContain('data-image-layout="wide"');
    expect(markup).toContain("aspect-video w-full");
    expect(markup).toContain('class="h-full w-full object-cover"');
    expect(markup).toContain('src="/media/content/exchange/aa.webp"');
    expect(markup.indexOf('data-image-layout="wide"')).toBeLessThan(markup.indexOf("<h3"));
  });

  it("keeps the existing thumbnail layout as the default", () => {
    const markup = renderToStaticMarkup(
      <OfferInfoCard fields={[]} image="/media/content/exchange/aa.webp" title="A service" />
    );

    expect(markup).toContain("grid-cols-[90px,1fr]");
    expect(markup).toContain("h-[90px] w-[90px]");
    expect(markup).not.toContain('data-image-layout="wide"');
  });
});
