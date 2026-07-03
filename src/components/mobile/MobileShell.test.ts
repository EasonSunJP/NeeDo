import { describe, expect, it } from "vitest";
// @ts-expect-error -- Vitest runs this source guard in Node; frontend tsconfig intentionally omits Node types.
import { readFileSync } from "node:fs";
import mobileShellSource from "./MobileShell.tsx?raw";
import specialBlackIconSource from "./SpecialBlackIcon.tsx?raw";

const stylesSource = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

describe("MobileShell special black navigation", () => {
  it("allows a page to opt out of the shared bottom navigation without deleting nav items globally", () => {
    expect(mobileShellSource).toContain("showBottomNav = true");
    expect(mobileShellSource).toContain("showBottomNav?: boolean");
    expect(mobileShellSource).toContain("const displayedNavItems = showBottomNav ? resolvedNavItems : [];");
    expect(mobileShellSource).toContain('showBottomNav && "safe-shell-bottom"');
  });

  it("uses a dedicated PNG navigation branch for the special black UI", () => {
    expect(mobileShellSource).toContain('theme === "special-black"');
    expect(mobileShellSource).toContain("special-black-bottom-nav");
    expect(mobileShellSource).toContain("special-black-bottom-nav-panel");
    expect(mobileShellSource).not.toContain("special-black-home-indicator");
    expect(mobileShellSource).toContain("w-full px-0 pb-0 pt-0");
    expect(mobileShellSource).toContain("getSpecialBlackNavIconName");
    expect(mobileShellSource).toContain("getSpecialBlackNavLabel");
    expect(mobileShellSource).toContain("return item.label");
    expect(mobileShellSource).toContain("const displayedNavItems = showBottomNav ? resolvedNavItems : [];");
    expect(mobileShellSource).not.toContain("getSpecialBlackNavItems");
    expect(mobileShellSource).not.toContain("to: `${rolePrefix}/me`");
    expect(mobileShellSource).not.toContain('label: "我的"');
    expect(mobileShellSource).toContain("special-black-bottom-nav-dock");
    expect(mobileShellSource).toContain("/icons/special-black/nav-dock.png");
    expect(mobileShellSource).toContain("special-black-bottom-nav-label");
    expect(specialBlackIconSource).toContain("/icons/special-black/");
    expect(specialBlackIconSource).toContain("/icons/special-black/flat/");
    expect(mobileShellSource).toContain("SpecialBlackFlatIcon");
    expect(mobileShellSource).toContain('return "home"');
    expect(mobileShellSource).toContain('return "feed"');
    expect(mobileShellSource).toContain('return "chat"');
    expect(mobileShellSource).toContain('return "contacts"');
    expect(mobileShellSource).toContain("notificationCount > 99 ? \"99+\" : notificationCount");
    expect(mobileShellSource).toContain("NeedoFeaturedNavButton");
    expect(mobileShellSource).toContain("special-black-featured-nav-image");
  });

  it("pins the reference dock proportions for the raised center navigation", () => {
    expect(mobileShellSource).toContain("special-black-bottom-nav-backplate");
    expect(mobileShellSource).toContain("special-black-bottom-nav-center-glow");
    expect(mobileShellSource).toContain("h-[124px]");
    expect(mobileShellSource).toContain("top-[-18px]");
    expect(mobileShellSource).toContain("h-[88px] w-[88px]");
    expect(mobileShellSource).toContain("pt-[48px]");
  });

  it("renders the raised center Needo button with the supplied green artwork", () => {
    expect(mobileShellSource).toContain("function NeedoFeaturedNavButton");
    expect(mobileShellSource).toContain("<NeedoFeaturedNavButton");
    expect(mobileShellSource).toContain("/icons/needo-green-button-light.png");
    expect(mobileShellSource).not.toContain("/icons/needo-nav-button-light.png");
    expect(mobileShellSource).not.toContain("/icons/needo-nav-button-dark.png");
    expect(mobileShellSource).not.toContain("/icons/special-black/needo-nav-button.png");
    expect(mobileShellSource).not.toContain("needoNavButtonImages[theme]");
    expect(stylesSource).not.toContain(".client-featured-nav-theme-button");
  });
});
