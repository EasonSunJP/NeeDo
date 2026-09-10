type Point = [number, number];
type ViewBox = readonly [number, number, number, number];

export interface MapLabelViewport { scale: number; x: number; y: number }
export interface MapLabelRegion { code: string; nameJa: string; labelPoint: readonly [number, number] | null }
interface LabelBox { label: Point; width: number; height: number }
export interface MapLabelPlacement extends LabelBox { code: string; anchor: Point; external: false; leader: [] }

export interface MapLabelLayoutInput {
  regions: readonly MapLabelRegion[];
  viewBox: ViewBox;
  viewport: MapLabelViewport;
  selectedCode?: string | null;
  focusedCode?: string | null;
  orderCountByCode?: Readonly<Record<string, number>>;
  priorityCodes?: readonly string[];
  maximumLabels?: number;
  fontSize?: number;
  capacity?: "complete" | "partial";
}

export const PRIMARY_ADMIN1_LABEL_CODES = Object.freeze([
  "13", "27", "23", "01", "40", "14", "28", "11", "12", "26", "34", "04", "47"
]);

const EDGE_CLEARANCE = 8;
const LABEL_GAP = 4;

export function boxesOverlap(a: LabelBox, b: LabelBox, gap = 0): boolean {
  return Math.abs(a.label[0] - b.label[0]) < (a.width + b.width) / 2 + gap
    && Math.abs(a.label[1] - b.label[1]) < (a.height + b.height) / 2 + gap;
}

export function labelLimitForZoom(level: "admin1" | "admin2", scale: number, regionCount: number): number {
  const normalized = Math.max(1, Math.min(8, scale));
  const base = level === "admin1" ? 12 : 10;
  const maximum = level === "admin1" ? regionCount : Math.min(regionCount, 120);
  const progress = (normalized - 1) / 7;
  return Math.min(maximum, Math.max(base, Math.round(base + (maximum - base) * progress)));
}

export function layoutMapLabels({
  regions,
  viewBox,
  viewport,
  selectedCode,
  focusedCode,
  orderCountByCode = {},
  priorityCodes = [],
  maximumLabels = Number.POSITIVE_INFINITY,
  fontSize,
  capacity = "complete"
}: MapLabelLayoutInput): MapLabelPlacement[] {
  const [left, top, width, height] = viewBox;
  const right = left + width;
  const bottom = top + height;
  const priorities = new Map(priorityCodes.map((code, index) => [code, index]));
  const candidates = regions.flatMap((item) => item.labelPoint === null ? [] : [{
    code: item.code,
    anchor: [item.labelPoint[0] * viewport.scale + viewport.x, item.labelPoint[1] * viewport.scale + viewport.y] as Point,
    width: fontSize ? item.nameJa.length * fontSize + 8 : Math.max(48, item.nameJa.length * 15 + 16),
    height: fontSize ? fontSize + 6 : 28
  }]);
  candidates.sort((a, b) => Number(b.code === selectedCode) - Number(a.code === selectedCode)
    || Number(b.code === focusedCode) - Number(a.code === focusedCode)
    || (priorities.get(a.code) ?? Number.MAX_SAFE_INTEGER) - (priorities.get(b.code) ?? Number.MAX_SAFE_INTEGER)
    || Number((orderCountByCode[b.code] ?? 0) > 0) - Number((orderCountByCode[a.code] ?? 0) > 0)
    || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));

  const accepted: MapLabelPlacement[] = [];
  for (const candidate of candidates) {
    if (accepted.length >= maximumLabels) break;
    const box = { ...candidate, label: candidate.anchor };
    const contained = box.label[0] - box.width / 2 >= left + EDGE_CLEARANCE
      && box.label[0] + box.width / 2 <= right - EDGE_CLEARANCE
      && box.label[1] - box.height / 2 >= top + EDGE_CLEARANCE
      && box.label[1] + box.height / 2 <= bottom - EDGE_CLEARANCE;
    if (!contained || accepted.some((other) => boxesOverlap(box, other, LABEL_GAP))) {
      if (capacity === "partial") continue;
      throw new RangeError("map_label_layout_capacity_exceeded");
    }
    accepted.push({ ...box, external: false, leader: [] });
  }
  return accepted;
}
