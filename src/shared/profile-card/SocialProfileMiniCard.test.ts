import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import appScaffoldSource from "../../components/client-ui/AppScaffold.tsx?raw";
import homePageSource from "../../pages/user/HomePage.tsx?raw";
import { ClientThemeProvider } from "../../theme/ClientThemeProvider";
import type { Store, Technician } from "../../types/domain";
import cardSource from "./SocialProfileMiniCard.tsx?raw";
import simpleRatingBadgeSource from "./SimpleRatingBadge.tsx?raw";
import { SocialProfileMiniCard } from "./SocialProfileMiniCard";
import { TechnicianPublicInfoCard } from "./TechnicianPublicInfoCard";
import technicianPublicInfoCardSource from "./TechnicianPublicInfoCard.tsx?raw";
import technicianShowcaseCardSource from "./TechnicianShowcaseCard.tsx?raw";
import technicianProfileInfoViewSource from "../technician-profile/TechnicianProfileInfoView.tsx?raw";

describe("SocialProfileMiniCard cover readability", () => {
  it("renders a neutral initial surface when formal data has no public image", () => {
    const markup = renderToStaticMarkup(
      createElement(
        ClientThemeProvider,
        null,
        createElement(
          MemoryRouter,
          null,
          createElement(SocialProfileMiniCard, {
            data: {
              id: "formal-shop-no-photo",
              entityType: "shop",
              displayName: "LifeDance Ginza",
              avatar: "",
              coverImage: "",
              regionLabel: "Tokyo",
              primaryLabel: "店铺",
              levelLabel: "",
              scoreLabel: "服务评价",
              scoreValue: "4.9/5",
              followerCount: 0,
              followingCount: 0
            }
          })
        )
      )
    );

    expect(markup).toContain('aria-label="LifeDance Ginza 暂无公开照片"');
    expect(markup).not.toContain('src=""');
  });

  it("changes cover text colors without adding a title capsule container", () => {
    expect(cardSource).toContain("coverDark ? \"text-white");
    expect(cardSource).toContain("text-[#25282d]");
    expect(cardSource).toContain("bg-[#f3cf78]/22 text-[#7b560f]");
    expect(cardSource).toContain("bg-[#7662e8]/16 text-[#4b3ca5]");
    expect(cardSource).not.toContain("rounded-[14px] bg-black/48 px-2 py-1");
  });

  it("does not append the generic service type chip in service card titles", () => {
    expect(cardSource).toContain("UnifiedServiceInfoCard");
    expect(cardSource).toContain("serviceInfo");
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

  it("does not render follower/following stats inside shop info cards", () => {
    const store: Store = {
      id: "store-social-stats-hidden",
      systemId: "S-900",
      merchantId: "merchant-1",
      name: "Roppongi Recovery",
      area: "Roppongi",
      address: "Tokyo 6-8 Roppongi, Minato-ku",
      rating: 4.9,
      reviewCount: 970,
      priceLabel: "¥12,000",
      tags: ["recovery", "private", "night"],
      openStatus: "open",
      nextSlot: "18:00",
      cover: "/images/generated/store/store-01.jpg",
      gallery: ["/images/generated/store/store-01.jpg"],
      description: "Private recovery salon",
      rankLabel: "店铺",
      businessHours: "10:00-24:00",
      mode: "store"
    };

    const markup = renderToStaticMarkup(
      createElement(
        ClientThemeProvider,
        null,
        createElement(
          MemoryRouter,
          null,
          createElement(SocialProfileMiniCard, {
            detailTo: "/stores/store-social-stats-hidden",
            showShareAction: true,
            store
          })
        )
      )
    );

    expect(cardSource).toContain("function SocialStatsLine");
    expect(markup).toContain("Roppongi Recovery");
    expect(markup).not.toContain("粉丝：");
    expect(markup).not.toContain("关注：");
  });

  it("hides technician social counts and level by default", () => {
    const markup = renderToStaticMarkup(
      createElement(
        ClientThemeProvider,
        null,
        createElement(
          MemoryRouter,
          null,
          createElement(SocialProfileMiniCard, {
            data: {
              id: "17",
              entityType: "technician",
              displayName: "Misaki",
              avatar: "/images/misaki.jpg",
              coverImage: "/images/misaki.jpg",
              regionLabel: "东京都",
              addressValue: "东京都",
              primaryLabel: "技师",
              kycVerified: false,
              levelLabel: "Lv.99",
              scoreLabel: "服务评价",
              scoreValue: "5.0/5",
              followerCount: 1200,
              followingCount: 300
            },
            detailTo: "/profiles/technician/17?view=card",
            showAction: false
          })
        )
      )
    );

    expect(markup).toContain("Misaki");
    expect(markup).toContain("5.0");
    expect(markup).toContain("东京都");
    expect(markup).not.toContain("粉丝：");
    expect(markup).not.toContain("关注：");
    expect(markup).not.toContain("Lv.99");
  });

  it("links technician avatars to the scoped full detail page without a dialog", () => {
    const retiredModalName = ["TechnicianPublicInfoCard", "Modal"].join("");

    expect(cardSource).toContain('const currentScope = location.pathname.startsWith("/merchant/") ? "merchant" : location.pathname.startsWith("/technician/") ? "technician" : "user";');
    expect(cardSource).toContain('"technician" in props ? getScopedTechnicianDynamicPath(currentScope, props.technician)');
    expect(cardSource).toContain("detailTo={avatarDetailTo}");
    expect(cardSource).not.toContain(retiredModalName);
  });

  it("keeps the public technician information view budget-free with special tags above normal tags", () => {
    expect(appScaffoldSource).toContain('case "moments"');
    expect(technicianPublicInfoCardSource).toContain('name="moments"');
    expect(technicianPublicInfoCardSource).toContain("onClose");
    expect(technicianPublicInfoCardSource).toContain("TechnicianPublicInfoCardThemeScope");
    expect(technicianPublicInfoCardSource).toContain("data-theme-scope={themeScope}");
    expect(technicianProfileInfoViewSource).toContain('data-testid="technician-info-special-tags"');
    expect(technicianProfileInfoViewSource).toContain('data-testid="technician-info-tags"');
    expect(technicianProfileInfoViewSource.indexOf('data-testid="technician-info-special-tags"')).toBeLessThan(
      technicianProfileInfoViewSource.indexOf('data-testid="technician-info-tags"')
    );
    expect(technicianPublicInfoCardSource).toContain("TechnicianProfileInfoView");
    expect(technicianPublicInfoCardSource).not.toContain('name="sparkles"');
    expect(technicianPublicInfoCardSource).toContain("formalData?.contactDetails");
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
    expect(markup).toContain("暂无简介");
    expect(markup).not.toContain("接单预算");
    expect(markup).not.toContain("收入");
  });

  it("keeps technician showcase photos on the scoped full detail path", () => {
    const retiredModalName = ["TechnicianPublicInfoCard", "Modal"].join("");

    expect(technicianShowcaseCardSource).toContain("photoTrigger");
    expect(technicianShowcaseCardSource).toContain("to={detailHref}");
    expect(technicianShowcaseCardSource).not.toContain(retiredModalName);
  });
});
