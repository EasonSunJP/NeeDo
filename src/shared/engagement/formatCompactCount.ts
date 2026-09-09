export function formatCompactCount(value: number): string {
  const normalized = Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
  if (normalized < 1000) return String(normalized);
  const truncatedTenths = Math.floor(normalized / 100);
  const compact = truncatedTenths / 10;
  return `${Number.isInteger(compact) ? compact.toFixed(0) : compact.toFixed(1)}k`;
}
