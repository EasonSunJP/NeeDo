import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./AdminEventTimeline.css", import.meta.url), "utf8");

describe("AdminEventTimeline narrow layout", () => {
  it("keeps date text away from the timeline node on narrow drawers", () => {
    expect(css).toContain("grid-template-columns: 84px 18px minmax(0, 1fr)");
    expect(css).toContain("white-space: normal");
  });
});
