import { describe, expect, it } from "vitest";
import categoryIconSource from "./CategoryIcon.tsx?raw";

describe("CategoryIcon theme palettes", () => {
  it("maps icon colors by client theme instead of day/night green defaults", () => {
    expect(categoryIconSource).toContain("Record<ClientTheme, CategoryPalette>");
    expect(categoryIconSource).toContain('"vital-mono": vitalMonoPalette');
    expect(categoryIconSource).toContain('"cool-black-gray": coolBlackGrayPalette');
    expect(categoryIconSource).toContain('"special-black": specialBlackPalette');
    expect(categoryIconSource).toContain('"black-gold": blackGoldPalette');
    expect(categoryIconSource).toContain('primary: "#087bb8"');
    expect(categoryIconSource).toContain('primary: "#18d2f0"');
    expect(categoryIconSource).toContain('primary: "#5f8dff"');
    expect(categoryIconSource).not.toContain("const palette = isNight ? nightPalette : dayPalette");
  });
});
