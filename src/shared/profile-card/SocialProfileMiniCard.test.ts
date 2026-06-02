import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import appScaffoldSource from "../../components/client-ui/AppScaffold.tsx?raw";
import homePageSource from "../../pages/user/HomePage.tsx?raw";
import type { Technician } from "../../types/domain";
import cardSource from "./SocialProfileMiniCard.tsx?raw";
import simpleRatingBadgeSource from "./SimpleRatingBadge.tsx?raw";
import { TechnicianPublicInfoCard } from "./TechnicianPublicInfoCard";
import technicianPublicInfoCardSource from "./TechnicianPublicInfoCard.tsx?raw";
import technicianShowcaseCardSource from "./TechnicianShowcaseCard.tsx?raw";

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
    expect(simpleRatingBadgeSource).toContain("h-[29px] min-w-12");
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

  it("opens the public technician info card from the technician avatar while keeping a dynamic-page action", () => {
    expect(cardSource).toContain('import { TechnicianPublicInfoCardModal } from "./TechnicianPublicInfoCard"');
    expect(cardSource).toContain('const sourceTechnician = "technician" in props ? props.technician : null;');
    expect(cardSource).toContain("shouldOpenTechnicianInfoCard");
    expect(cardSource).toContain("avatarOnOpenDetails");
    expect(cardSource).toContain("<TechnicianPublicInfoCardModal");
    expect(cardSource).toContain('dynamicTo={technicianDynamicPath}');
    expect(cardSource).toContain("themeScope={currentScope}");
  });

  it("keeps the public technician info card budget-free with special tags above normal tags", () => {
    expect(appScaffoldSource).toContain('case "moments"');
    expect(technicianPublicInfoCardSource).toContain('name="moments"');
    expect(technicianPublicInfoCardSource).toContain("onClose");
    expect(technicianPublicInfoCardSource).toContain("TechnicianPublicInfoCardThemeScope");
    expect(technicianPublicInfoCardSource).toContain('import { createPortal } from "react-dom";');
    expect(technicianPublicInfoCardSource).toContain("getTechnicianPublicInfoCardThemeStyle");
    expect(technicianPublicInfoCardSource).toContain("--profile-card-primary");
    expect(technicianPublicInfoCardSource).toContain("--profile-card-primary-soft");
    expect(technicianPublicInfoCardSource).toContain("--profile-card-soft-muted");
    expect(technicianPublicInfoCardSource).toContain("radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--profile-card-primary)_22%,transparent),transparent_34%)");
    expect(technicianPublicInfoCardSource).toContain("--profile-card-backdrop");
    expect(technicianPublicInfoCardSource).toContain("bg-[color:var(--profile-card-backdrop)]");
    expect(technicianPublicInfoCardSource).toContain("z-[180]");
    expect(technicianPublicInfoCardSource).toContain('document.querySelector<HTMLElement>(".client-shell") ?? document.body');
    expect(technicianPublicInfoCardSource).toContain("return createPortal(modal, portalTarget);");
    expect(technicianPublicInfoCardSource).toContain("data-theme-scope={themeScope}");
    expect(technicianPublicInfoCardSource).toContain('data-testid="technician-info-special-tags"');
    expect(technicianPublicInfoCardSource).toContain('data-testid="technician-info-tags"');
    expect(technicianPublicInfoCardSource.indexOf('data-testid="technician-info-special-tags"')).toBeLessThan(
      technicianPublicInfoCardSource.indexOf('data-testid="technician-info-tags"')
    );
    expect(technicianPublicInfoCardSource).toContain("TechnicianReviewStampList");
    expect(technicianPublicInfoCardSource).not.toContain('name="sparkles"');
    expect(technicianPublicInfoCardSource).not.toContain("接单预算");
    expect(technicianPublicInfoCardSource).not.toContain("bg-black/62");
    expect(technicianPublicInfoCardSource).not.toContain("#061018");
    expect(technicianPublicInfoCardSource).not.toContain("--technician-status-duty");
  });

  it("keeps the self-introduction section visible even when a technician has not filled bio", () => {
    const technician: Technician = {
      id: "tech-public-no-bio",
      systemId: "B-900",
      name: "No Bio Technician",
      storeId: "store-1",
      role: "therapist",
      status: "available",
      rating: 4.8,
      orderCount: 120,
      income: 880000,
      skills: ["肩颈调理", "睡眠放松"],
      serviceAreas: ["银座"],
      acceptRate: 96,
      cancelRate: 1,
      reviewCount: 32,
      languages: ["日本語"],
      avatar: "/images/generated/profiles/profile-01.jpg"
    };

    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(TechnicianPublicInfoCard, {
          dynamicTo: "/profiles/technician/tech-public-no-bio",
          technician
        })
      )
    );

    expect(markup).toContain("自我介绍");
    expect(markup).toContain("这个技师暂时还没有补充介绍。");
    expect(markup).not.toContain("接单预算");
    expect(markup).not.toContain("收入");
  });

  it("opens the same public info card from technician showcase photos", () => {
    expect(technicianShowcaseCardSource).toContain("photoTrigger");
    expect(technicianShowcaseCardSource).toContain("setTechnicianInfoCardOpen(true)");
    expect(technicianShowcaseCardSource).toContain("<TechnicianPublicInfoCardModal");
    expect(technicianShowcaseCardSource).toContain("themeScope={currentScope}");
  });
});
