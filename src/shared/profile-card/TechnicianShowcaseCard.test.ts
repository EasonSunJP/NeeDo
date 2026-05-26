import { describe, expect, it } from "vitest";
import { getTechnicianCardRankBadge } from "./TechnicianShowcaseCard";
import cardSource from "./TechnicianShowcaseCard.tsx?raw";

describe("TechnicianShowcaseCard selectable behavior", () => {
  it("keeps the card linked to the technician dynamic page while selection is handled by the corner icon", () => {
    expect(cardSource).toContain("const detailHref = detailTo ?? getTechnicianDynamicPath(technician)");
    expect(cardSource).toContain("to={detailHref}");
    expect(cardSource).toContain("event.stopPropagation()");
    expect(cardSource).toContain("onClick={(event) => {");
    expect(cardSource).not.toContain("if (onSelect)");
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
