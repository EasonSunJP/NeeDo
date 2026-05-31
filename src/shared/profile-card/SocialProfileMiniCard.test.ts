import { describe, expect, it } from "vitest";
import appScaffoldSource from "../../components/client-ui/AppScaffold.tsx?raw";
import homePageSource from "../../pages/user/HomePage.tsx?raw";
import cardSource from "./SocialProfileMiniCard.tsx?raw";
import simpleRatingBadgeSource from "./SimpleRatingBadge.tsx?raw";

describe("SocialProfileMiniCard cover readability", () => {
  it("changes cover text colors without adding a title capsule container", () => {
    expect(cardSource).toContain("coverDark ? \"text-white");
    expect(cardSource).toContain("text-[#25282d]");
    expect(cardSource).toContain("bg-[#f3cf78]/22 text-[#7b560f]");
    expect(cardSource).toContain("bg-[#7662e8]/16 text-[#4b3ca5]");
    expect(cardSource).not.toContain("rounded-[14px] bg-black/48 px-2 py-1");
  });

  it("does not append the generic service type chip in service card titles", () => {
    expect(cardSource).toContain('if (data.entityType === "service")');
    expect(cardSource).toContain("return null;");
    expect(cardSource).toContain('data.entityType === "service" ? "max-w-full"');
  });

  it("shows service-rating scores as a simple top-left number pill without a star icon", () => {
    expect(cardSource).toContain('import { SimpleRatingBadge } from "./SimpleRatingBadge"');
    expect(cardSource).toContain('const usesSimpleScorePill = data.scoreLabel === "服务评价"');
    expect(cardSource).toContain("!usesSimpleScorePill");
    expect(cardSource).toContain('<SimpleRatingBadge className="absolute left-3.5 top-2 z-20" value={scoreParts.score} />');
    expect(cardSource).toContain("isService || shouldOverlayScoreOnAvatar || usesSimpleScorePill ? null");
    expect(simpleRatingBadgeSource).toContain("inline-flex h-[29px] min-w-12");
  });

  it("uses the shared circle heart metric action for follow controls", () => {
    expect(cardSource).toContain("<IconMetricAction");
    expect(cardSource).toContain('icon="heart"');
    expect(cardSource).toContain('icon="share"');
    expect(cardSource).toContain("count={count}");
    expect(cardSource).toContain("count={resolvedShareCount}");
    expect(cardSource).toContain('size="compactLg"');
    expect(cardSource).toContain("showShareAction");
    expect(cardSource).toContain("absolute right-[1.5px] top-2 z-20 flex items-start -space-x-[5.5px]");
    expect(cardSource).toContain('hasShareAction && hasPrimaryAction ? "right-[102px]"');
    expect(cardSource).not.toContain("scale-[1.3]");
    expect(appScaffoldSource).toContain('compactLg: {\n    count: "top-[32px] w-10 text-[10px]"');
    expect(homePageSource).toContain("<SocialProfileMiniCard detailTo={data.to} showShareAction store={data.store} />");
    expect(homePageSource).toContain("<SocialProfileMiniCard detailTo={data.to} showShareAction technician={data.technician} />");
    expect(cardSource).not.toContain('label === "关注"');
  });
});
