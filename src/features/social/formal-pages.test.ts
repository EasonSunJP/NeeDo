import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(new URL("./route-pages.tsx", import.meta.url), "utf8");
const timelineSource = readFileSync(new URL("./pages/SocialTimelinePage.tsx", import.meta.url), "utf8");

describe("single complete social pages", () => {
  it("routes every session to the existing complete social page instead of a minimal formal page", () => {
    expect(routeSource).toContain('import("./pages/SocialTimelinePage")');
    expect(routeSource).not.toContain("SocialRouteSwitch");
    expect(routeSource).not.toContain("FormalSocialTimelinePage");
    expect(routeSource).not.toContain("isStaticDemoMode");
    expect(timelineSource).toContain("SharedHomeHeader");
    expect(timelineSource).toContain("SocialPostItem");
    expect(routeSource).toContain('import("./pages/SocialProfilePage")');
    expect(routeSource).toContain("SocialAccountProfilePage");
  });

  it("localizes the lazy-route loading fallback", () => {
    expect(routeSource).toContain('translateText("正在加载…", language)');
    expect(routeSource).not.toContain(">正在加载动态...</div>");
  });
});
