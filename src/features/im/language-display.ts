const languageLabelAliases = new Map<string, string>([
  ["ja", "日本語"],
  ["ja-jp", "日本語"],
  ["japanese", "日本語"],
  ["日本語", "日本語"],
  ["zh", "中文"],
  ["zh-cn", "中文"],
  ["zh-hans", "中文"],
  ["zh-hant", "中文"],
  ["chinese", "中文"],
  ["中文", "中文"],
  ["en", "English"],
  ["en-us", "English"],
  ["english", "English"],
  ["ko", "한국어"],
  ["ko-kr", "한국어"],
  ["korean", "한국어"],
  ["한국어", "한국어"],
  ["th", "ไทย"],
  ["th-th", "ไทย"],
  ["thai", "ไทย"],
  ["ไทย", "ไทย"],
  ["vi", "Tiếng Việt"],
  ["vi-vn", "Tiếng Việt"],
  ["vietnamese", "Tiếng Việt"],
  ["tiếng việt", "Tiếng Việt"],
  ["es", "Español"],
  ["es-es", "Español"],
  ["spanish", "Español"],
  ["español", "Español"],
]);

export function normalizeImLanguageLabels(values: readonly string[]): string[] {
  const labels: string[] = [];
  const seenKeys = new Set<string>();

  values.forEach((value) => {
    const trimmed = value.trim();

    if (!trimmed) {
      return;
    }

    const label = languageLabelAliases.get(trimmed.toLowerCase()) ?? trimmed;
    const deduplicationKey = label.toLowerCase();

    if (seenKeys.has(deduplicationKey)) {
      return;
    }

    seenKeys.add(deduplicationKey);
    labels.push(label);
  });

  return labels;
}
