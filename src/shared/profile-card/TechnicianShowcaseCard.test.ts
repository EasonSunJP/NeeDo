import { describe, expect, it } from "vitest";
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
