import { describe, expect, it } from "vitest";
import appScaffoldSource from "../../components/client-ui/AppScaffold.tsx?raw";
import { getTechnicianCardRankBadge, shouldShowTechnicianBeginnerIcon } from "./TechnicianShowcaseCard";
import cardSource from "./TechnicianShowcaseCard.tsx?raw";

describe("TechnicianShowcaseCard selectable behavior", () => {
  it("keeps the card linked to the technician dynamic page while selection is handled by the corner icon", () => {
    expect(cardSource).toContain("const detailHref = detailTo ?? getTechnicianDynamicPath(technician)");
    expect(cardSource).toContain("to={detailHref}");
    expect(cardSource).toContain("event.stopPropagation()");
    expect(cardSource).toContain("onClick={(event) => {");
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
    expect(cardSource).toContain("textShadow");
    expect(cardSource).not.toContain("WebkitTextStroke");
    expect(cardSource).not.toContain("ShareNetworkIcon");
  });

  it("aligns compact metric icons with the rank badge left edge and keeps counts below the circle", () => {
    expect(cardSource).toContain('className="-ml-[5px] flex flex-col items-center gap-2"');
    expect(appScaffoldSource).toContain('count: "top-[25px] w-10 text-[10px]"');
    expect(appScaffoldSource).toContain('icon: "h-[11px] w-[11px]"');
    expect(appScaffoldSource).toContain('root: "h-[39px] w-8"');
    expect(appScaffoldSource).toContain('shell: "h-[22px] w-[22px]"');
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
