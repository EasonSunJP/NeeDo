import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import mobileShellSource from "./MobileShell.tsx?raw";

const stylesSource = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

describe("MobileShell shared navigation", () => {
  it("allows a page to opt out of the shared bottom navigation without deleting nav items globally", () => {
    expect(mobileShellSource).toContain("showBottomNav = true");
    expect(mobileShellSource).toContain("showBottomNav?: boolean");
    expect(mobileShellSource).toContain("const displayedNavItems = showBottomNav ? resolvedNavItems : [];");
    expect(mobileShellSource).toContain('showBottomNav && "safe-shell-bottom"');
  });

  it("uses the shared liquid glass bottom navigation for every current theme", () => {
    expect(mobileShellSource).toContain("const displayedNavItems = showBottomNav ? resolvedNavItems : [];");
    expect(mobileShellSource).toContain("client-liquid-glass-nav");
    expect(mobileShellSource).toContain("MobileNavIcon");
    expect(mobileShellSource).toContain("NeedoFeaturedNavButton");
  });

  it("renders the raised center Needo button with the supplied green artwork", () => {
    expect(mobileShellSource).toContain("function NeedoFeaturedNavButton");
    expect(mobileShellSource).toContain("<NeedoFeaturedNavButton");
    expect(mobileShellSource).toContain("/icons/needo-green-button-light.png");
    expect(mobileShellSource).not.toContain("/icons/needo-nav-button-light.png");
    expect(mobileShellSource).not.toContain("/icons/needo-nav-button-dark.png");
    expect(mobileShellSource).not.toContain("needoNavButtonImages[theme]");
    expect(stylesSource).not.toContain(".client-featured-nav-theme-button");
  });
});
