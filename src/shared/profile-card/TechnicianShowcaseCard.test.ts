import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import appScaffoldSource from "../../components/client-ui/AppScaffold.tsx?raw";
import type { Technician } from "../../types/domain";
import { getTechnicianCardRankBadge, shouldShowTechnicianBeginnerIcon, TechnicianShowcaseCard } from "./TechnicianShowcaseCard";
import cardSource from "./TechnicianShowcaseCard.tsx?raw";
import simpleRatingBadgeSource from "./SimpleRatingBadge.tsx?raw";

describe("TechnicianShowcaseCard photo source", () => {
  it("uses the generated technician avatar before service or store gallery photos", () => {
    const technician: Technician = {
      id: "tech-avatar-priority",
      systemId: "B-999",
      name: "Avatar Priority",
      storeId: "store-1",
      role: "therapist",
      status: "available",
      rating: 4.9,
      orderCount: 12,
      income: 0,
      skills: ["Body care"],
      serviceAreas: ["Tokyo"],
      acceptRate: 95,
      cancelRate: 0,
      reviewCount: 8,
      languages: ["ja"],
      avatar: "/images/generated/profiles/profile-11.jpg",
      gallery: ["/images/generated/stores/store-clean-base.jpg"]
    };

    const markup = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(TechnicianShowcaseCard, { language: "ja", rankIndex: 0, technician }))
    );

    expect(markup).toContain("/images/generated/thumbnails/profiles/profile-11.jpg");
    expect(markup).not.toContain("/images/generated/thumbnails/stores/store-clean-base.jpg");
  });
});

describe("TechnicianShowcaseCard selectable behavior", () => {
  it("keeps the card linked to the technician dynamic page while selection is handled by the corner icon", () => {
    expect(cardSource).toContain('const currentScope = location.pathname.startsWith("/merchant/") ? "merchant" : location.pathname.startsWith("/technician/") ? "technician" : "user";');
    expect(cardSource).toContain('const detailHref = detailTo ?? getScopedProfileDetailPath(currentScope, "technician", technician.id);');
    expect(cardSource).toContain("to={detailHref}");
    expect(cardSource).toContain("event.stopPropagation()");
    expect(cardSource).toContain("onClick={(event) => {");
    expect(cardSource).not.toContain("onServiceSelect");
    expect(cardSource).not.toContain("handleServiceSelect");
    expect(cardSource).not.toContain("查看店铺服务项目");
    expect(cardSource).not.toContain("if (onSelect)");
  });

  it("allows merchant-owned cards to replace the selection plus with visibility icons", () => {
    expect(cardSource).toContain('selectionActiveIcon = "check"');
    expect(cardSource).toContain('selectionInactiveIcon = "plus"');
    expect(cardSource).toContain("const selectionIconName = selected ? selectionActiveIcon : selectionInactiveIcon");
    expect(cardSource).toContain("name={selectionIconName}");
    expect(appScaffoldSource).toContain('case "eye":');
    expect(appScaffoldSource).toContain('case "eyeOff":');
  });

  it("can render unavailable selectable cards with a disabled x action", () => {
    expect(cardSource).toContain("selectionDisabled?: boolean");
    expect(cardSource).toContain("selectionDisabled = false");
    expect(cardSource).toContain("disabled={selectionDisabled}");
    expect(cardSource).toContain("aria-disabled={selectionDisabled}");
    expect(cardSource).toContain("\"border-white/46 bg-black/42 text-[#ff5f6e] shadow-[0_8px_20px_rgba(0,0,0,0.22)]\"");
    expect(cardSource).toContain("if (selectionDisabled) {");
    expect(cardSource).toContain("return;");
    expect(appScaffoldSource).toContain('| "x"');
    expect(appScaffoldSource).toContain('case "x":');
  });
});

describe("TechnicianShowcaseCard ranking badges", () => {
  it("labels only the first three technicians with rank icons", () => {
    expect(getTechnicianCardRankBadge(0)).toMatchObject({ label: "Best1", rank: 1 });
    expect(getTechnicianCardRankBadge(1)).toMatchObject({ label: "Best2", rank: 2 });
    expect(getTechnicianCardRankBadge(2)).toMatchObject({ label: "Best3", rank: 3 });
    expect(getTechnicianCardRankBadge(3)).toBeNull();
    expect(getTechnicianCardRankBadge(9)).toBeNull();
  });

  it("uses provided image assets instead of the old No. and drawn rank badges", () => {
    expect(cardSource).not.toContain("No.");
    expect(cardSource).not.toContain("StandardRankBadge");
    expect(cardSource).not.toContain("<svg aria-hidden=\"true\" className=\"h-[38px] w-[54px]\"");
    expect(cardSource).toContain("TopRankImageBadge");
    expect(cardSource).toContain("className=\"inline-flex h-9 w-9 shrink-0 items-center justify-center\"");
    expect(cardSource).toContain("className=\"h-full w-full origin-center scale-[1.56] object-contain\"");
    expect(cardSource).toContain('filter: "drop-shadow(0 0 1px rgba(0,0,0,0.95)) drop-shadow(0 0 2px rgba(0,0,0,0.72))"');
    expect(cardSource).not.toContain("rounded-full bg-white/90");
    expect(cardSource).toContain("/images/icons/ranking/needo_rank_1_icon_transparent.png");
    expect(cardSource).toContain("/images/icons/ranking/needo_rank_2_icon_transparent.png");
    expect(cardSource).toContain("/images/icons/ranking/needo_rank_3_icon_transparent.png");
    expect(cardSource).not.toContain("RecommendationIconBadge");
    expect(cardSource).not.toContain('kind: "recommendation"');
  });
});

describe("TechnicianShowcaseCard engagement metrics", () => {
  it("uses the shared icon metric action for favorite and share counts", () => {
    expect(cardSource).toContain("IconMetricAction");
    expect(cardSource).toContain('icon="heart"');
    expect(cardSource).toContain('icon="share"');
    expect(cardSource).toContain('metricLayout = "cluster"');
    expect(cardSource).toContain('metricLayout === "split"');
    expect(cardSource).toContain("absolute left-2 top-2 z-20 flex items-start justify-between gap-1");
    expect(cardSource).toContain('metricLayout === "split" ? "right-[5px]" : "right-2"');
    expect(cardSource).toContain('className="flex shrink-0 items-start -space-x-[4px]"');
    expect(cardSource).not.toContain("absolute left-2 top-2 z-20 flex max-w-[calc(100%-16px)] items-start -space-x-[4px]");
    expect(cardSource).toContain('size="cluster"');
    expect(cardSource).not.toContain("WebkitTextStroke");
    expect(cardSource).not.toContain("ShareNetworkIcon");
  });

  it("renders default favorite and share actions in the top-right corner", () => {
    const technician: Technician = {
      id: "technician-card-right-actions",
      systemId: "B-910",
      name: "Right Action Technician",
      storeId: "store-1",
      role: "therapist",
      status: "available",
      rating: 4.7,
      orderCount: 154,
      income: 0,
      skills: ["Clean"],
      serviceAreas: ["Tokyo"],
      acceptRate: 98,
      cancelRate: 0,
      reviewCount: 32,
      languages: ["ja"],
      avatar: "/images/generated/profiles/profile-11.jpg"
    };

    const markup = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(TechnicianShowcaseCard, { language: "zh", rankIndex: 0, technician }))
    );

    expect(markup).toContain("absolute left-2 top-2 z-20 flex items-start justify-between gap-1 right-2");
    expect(markup).toContain("收藏 154");
    expect(markup).toContain("分享 0");
    expect(markup).not.toContain("max-w-[calc(100%-16px)]");
  });

  it("matches the mini-card top-right metric action size and keeps counts below the circles", () => {
    expect(appScaffoldSource).toContain('cluster: {');
    expect(appScaffoldSource).toContain('count: "top-[24px] w-7 text-[10px]"');
    expect(appScaffoldSource).toContain('icon: "h-[11px] w-[11px]"');
    expect(appScaffoldSource).toContain('root: "h-[37px] w-[29px]"');
    expect(appScaffoldSource).toContain('shell: "h-[23px] w-[23px]"');
    expect(appScaffoldSource).toContain('compactLg: {');
    expect(appScaffoldSource).toContain('count: "top-[32px] w-10 text-[10px]"');
    expect(appScaffoldSource).toContain('icon: "h-[14px] w-[14px]"');
    expect(appScaffoldSource).toContain('root: "h-[46px] w-[42px]"');
    expect(appScaffoldSource).toContain('shell: "h-[29px] w-[29px]"');
    expect(cardSource).not.toContain('className="-ml-[5px] flex flex-col items-center gap-2"');
  });

  it("places the rating score in the top-left without a star and moves rank badges above the name", () => {
    expect(cardSource).toContain('import { SimpleRatingBadge } from "./SimpleRatingBadge"');
    expect(cardSource).toContain('<SimpleRatingBadge compact value={formatTechnicianCardRating(technician.rating).toFixed(1)} />');
    expect(simpleRatingBadgeSource).toContain("compact ? \"h-[25px] min-w-[38px] px-1.5 text-[11px]\" : \"h-[29px] min-w-12 px-2 text-[12px]\"");
    expect(cardSource).toContain("const ageLabel =");
    expect(cardSource).toContain('[ageLabel, technician.height ?? "", primarySkill, areaLabel]');
    expect(cardSource).not.toContain('`${technician.height}cm`');
    expect(cardSource).not.toContain("({technician.age})");
    expect(cardSource).toContain('className="-ml-1 mb-2 flex items-center gap-1"');
    expect(cardSource).not.toContain("★{formatTechnicianCardRating");
    expect(cardSource).not.toContain('absolute left-2 top-2 flex max-w-[calc(100%-62px)]');
  });

  it("renders the beginner mark before stable 20% test technician names", () => {
    expect(shouldShowTechnicianBeginnerIcon({ id: "technician-1", name: "A" })).toBe(true);
    expect(shouldShowTechnicianBeginnerIcon({ id: "technician-2", name: "B" })).toBe(false);
    expect(shouldShowTechnicianBeginnerIcon({ id: "technician-3", name: "C" })).toBe(false);
    expect(shouldShowTechnicianBeginnerIcon({ id: "technician-4", name: "D" })).toBe(false);
    expect(shouldShowTechnicianBeginnerIcon({ id: "technician-5", name: "E" })).toBe(false);
    expect(shouldShowTechnicianBeginnerIcon({ id: "technician-6", name: "F" })).toBe(true);
    expect(cardSource).toContain("const showBeginnerIcon = shouldShowTechnicianBeginnerIcon(technician)");
    expect(cardSource).toContain("/images/icons/profile/needo_beginner_mark_icon.png");
    expect(cardSource).toContain('className="h-[18px] w-[18px] shrink-0 object-contain"');
    expect(cardSource).toContain('className="flex min-w-0 items-center text-[17px] font-black leading-6"');
    expect(cardSource).not.toContain("InexperiencedMarkBadge");
    expect(cardSource).not.toContain('name="sprout"');
    expect(appScaffoldSource).not.toContain('case "sprout":');
  });
});
