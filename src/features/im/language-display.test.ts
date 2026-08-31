import { describe, expect, it } from "vitest";
import { normalizeImLanguageLabels } from "./language-display";

describe("normalizeImLanguageLabels", () => {
  it("normalizes aliases case-insensitively while preserving first-seen order and unknown values", () => {
    expect(normalizeImLanguageLabels([
      " ja ",
      "ja-JP",
      "Chinese",
      "EN-us",
      "ko-KR",
      "Thai",
      "vi-VN",
      "Spanish",
      "Klingon",
      " ",
    ])).toEqual([
      "日本語",
      "中文",
      "English",
      "한국어",
      "ไทย",
      "Tiếng Việt",
      "Español",
      "Klingon",
    ]);
  });

  it("covers every approved code, locale, English name, and native-label alias", () => {
    expect(normalizeImLanguageLabels([
      "ja", "ja-JP", "Japanese", "日本語",
      "zh", "zh-CN", "zh-Hans", "zh-Hant", "Chinese", "中文",
      "en", "en-US", "English",
      "ko", "ko-KR", "Korean", "한국어",
      "th", "th-TH", "Thai", "ไทย",
      "vi", "vi-VN", "Vietnamese", "Tiếng Việt",
      "es", "es-ES", "Spanish", "Español",
    ])).toEqual([
      "日本語",
      "中文",
      "English",
      "한국어",
      "ไทย",
      "Tiếng Việt",
      "Español",
    ]);
  });

  it("does not mutate the formal profile language values", () => {
    const values = [" ja ", "Klingon", ""];

    normalizeImLanguageLabels(values);

    expect(values).toEqual([" ja ", "Klingon", ""]);
  });

  it("deduplicates unknown labels case-insensitively while preserving the first trimmed spelling", () => {
    expect(normalizeImLanguageLabels([" Klingon ", "klingon", "KLINGON"])).toEqual([
      "Klingon",
    ]);
  });
});
