export function buildSocialLocationOptions(
  authorLocation: string | undefined,
  query: string
): string[] {
  const base = [
    authorLocation,
    "东京 / 新宿区 / 新宿",
    "东京 / 涩谷区 / 涩谷",
    "东京 / 中央区 / 银座",
    "东京 / 港区 / 六本木",
    "东京 / 千代田区 / 丸之内"
  ].filter((value): value is string => Boolean(value));
  const normalized = query.trim().toLowerCase();
  const filtered = [...new Set(base)].filter(
    (value) => !normalized || value.toLowerCase().includes(normalized)
  );

  if (query.trim() && !filtered.includes(query.trim())) {
    filtered.unshift(query.trim());
  }

  return filtered.slice(0, 8);
}
