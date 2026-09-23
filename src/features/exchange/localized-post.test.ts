import { describe, expect, it } from "vitest";
import { localizedExchangePostText } from "./localized-post";

describe("localizedExchangePostText", () => {
  const post = {
    title: "元の題名",
    detail: "元の説明",
    contentLocale: "ja" as const,
    contentTranslations: { en: { title: "English title", detail: "English detail" } }
  };

  it("selects the requested authored version", () => {
    expect(localizedExchangePostText(post, "en")).toEqual({ title: "English title", detail: "English detail" });
  });

  it("falls back to the source when the system language has no authored version", () => {
    expect(localizedExchangePostText(post, "zh")).toEqual({ title: "元の題名", detail: "元の説明" });
  });
});
