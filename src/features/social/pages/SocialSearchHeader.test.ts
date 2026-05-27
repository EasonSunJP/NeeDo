import { describe, expect, it } from "vitest";
import searchSource from "./SocialSearchPage.tsx?raw";
import timelineSource from "./SocialTimelinePage.tsx?raw";

describe("social search header", () => {
  it("uses the shared floating header search component in timeline and search pages", () => {
    expect(timelineSource).toContain("FloatingHeaderSearchBar");
    expect(searchSource).toContain("FloatingHeaderSearchBar");
    expect(timelineSource).not.toContain("floatingHeaderSearchFieldClassName");
    expect(searchSource).not.toContain("floatingHeaderSearchFieldClassName");
  });
});
