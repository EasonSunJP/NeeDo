import { describe, expect, it } from "vitest";
import { normalizeProfileLanguageLabels } from "./profileLanguages";

describe("normalizeProfileLanguageLabels", () => {
  it("maps locale aliases to one canonical visible label", () => {
    expect(
      normalizeProfileLanguageLabels(["ja", "zh", "en", "日本語", "中文", "English"])
    ).toEqual(["日本語", "中文", "English"]);
  });

  it("trims and preserves unknown saved language labels without duplicates", () => {
    expect(normalizeProfileLanguageLabels([" Français ", "français", "", "  "])).toEqual([
      "Français"
    ]);
  });
});
