export interface MapHeatScale {
  minimum: number;
  maximum: number;
}

interface PreviousDayRegion {
  previousDayOrderCount: number;
}

const STOPS = [
  { at: 0, rgb: [47, 158, 100] },
  { at: 0.5, rgb: [226, 185, 59] },
  { at: 0.75, rgb: [239, 139, 44] },
  { at: 1, rgb: [227, 77, 89] }
] as const;

const toHex = (value: number) => Math.round(value).toString(16).padStart(2, "0");

export function buildMapHeatScale(regions: readonly PreviousDayRegion[]): MapHeatScale {
  if (regions.length === 0) return { minimum: 0, maximum: 0 };
  const counts = regions.map((region) => region.previousDayOrderCount);
  return { minimum: Math.min(...counts), maximum: Math.max(...counts) };
}

export function mapHeatColor(orderCount: number, scale: MapHeatScale): string {
  if (scale.maximum === scale.minimum) return orderCount > scale.maximum ? "#e34d59" : "#2f9e64";
  const ratio = Math.max(0, Math.min(1, (orderCount - scale.minimum) / (scale.maximum - scale.minimum)));
  const upperIndex = STOPS.findIndex((stop) => stop.at >= ratio);
  const upper = STOPS[Math.max(0, upperIndex)];
  const lower = STOPS[Math.max(0, upperIndex - 1)];
  if (upper.at === lower.at) return `#${upper.rgb.map(toHex).join("")}`;
  const local = (ratio - lower.at) / (upper.at - lower.at);
  return `#${upper.rgb.map((value, index) => toHex(lower.rgb[index] + (value - lower.rgb[index]) * local)).join("")}`;
}

export function previousJstDate(evaluatedAt: string): string {
  const instant = new Date(evaluatedAt);
  const jstDay = new Date(instant.getTime() + 9 * 60 * 60 * 1000);
  jstDay.setUTCDate(jstDay.getUTCDate() - 1);
  return jstDay.toISOString().slice(0, 10);
}
