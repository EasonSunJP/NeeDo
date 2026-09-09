export const PROFILE_LANGUAGE_OPTIONS = [
  "日本語",
  "中文",
  "English",
  "한국어",
  "ไทย",
  "Tiếng Việt",
  "Español"
] as const;

const canonicalLanguageByAlias = new Map<string, string>([
  ["ja", "日本語"],
  ["ja-jp", "日本語"],
  ["jp", "日本語"],
  ["日本語", "日本語"],
  ["日本语", "日本語"],
  ["zh", "中文"],
  ["zh-cn", "中文"],
  ["zh-hans", "中文"],
  ["zh-tw", "中文"],
  ["zh-hant", "中文"],
  ["中文", "中文"],
  ["简体中文", "中文"],
  ["繁體中文", "中文"],
  ["en", "English"],
  ["en-us", "English"],
  ["en-gb", "English"],
  ["english", "English"],
  ["ko", "한국어"],
  ["ko-kr", "한국어"],
  ["한국어", "한국어"],
  ["th", "ไทย"],
  ["th-th", "ไทย"],
  ["ไทย", "ไทย"],
  ["vi", "Tiếng Việt"],
  ["vi-vn", "Tiếng Việt"],
  ["tiếng việt", "Tiếng Việt"],
  ["es", "Español"],
  ["es-es", "Español"],
  ["español", "Español"]
]);

export function normalizeProfileLanguageLabels(values: readonly string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;

    const canonical = canonicalLanguageByAlias.get(trimmed.toLocaleLowerCase()) ?? trimmed;
    const identity = canonical.toLocaleLowerCase();
    if (seen.has(identity)) continue;

    seen.add(identity);
    normalized.push(canonical);
  }

  return normalized;
}
