export function formatCompactCount(value: number): string {
  const normalized = Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
  return normalized < 1000
    ? String(normalized)
    : `${Math.floor(normalized / 1000)}k`;
}
