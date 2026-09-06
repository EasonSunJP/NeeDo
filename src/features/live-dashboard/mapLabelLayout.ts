type Point = [number, number];
type ViewBox = readonly [number, number, number, number];

export interface MapLabelViewport {
  scale: number;
  x: number;
  y: number;
}

export interface MapLabelRegion {
  code: string;
  nameJa: string;
  /** Regions without a projected anchor do not produce a placement. */
  labelPoint: readonly [number, number] | null;
}

interface LabelBox {
  /** Center of the box, in SVG viewBox coordinates. */
  label: Point;
  width: number;
  height: number;
}

export interface MapLabelPlacement extends LabelBox {
  code: string;
  anchor: Point;
  external: boolean;
  leader: Point[];
}

export interface MapLabelLayoutInput {
  regions: readonly MapLabelRegion[];
  viewBox: ViewBox;
  /** Matches SVG translate(x y) scale(scale); labels themselves are not scaled. */
  viewport: MapLabelViewport;
  selectedCode?: string | null;
  orderCountByCode?: Readonly<Record<string, number>>;
}

const EDGE_CLEARANCE = 8;
const LABEL_GAP = 4;
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

/** Touching edges do not overlap. The optional gap reserves space between boxes. */
export function boxesOverlap(a: LabelBox, b: LabelBox, gap = 0): boolean {
  return Math.abs(a.label[0] - b.label[0]) < (a.width + b.width) / 2 + gap
    && Math.abs(a.label[1] - b.label[1]) < (a.height + b.height) / 2 + gap;
}

function leaderToBox(anchor: Point, box: LabelBox): Point[] {
  const dx = anchor[0] - box.label[0];
  const dy = anchor[1] - box.label[1];
  const ratio = Math.max(Math.abs(dx) / (box.width / 2), Math.abs(dy) / (box.height / 2));
  const length = Math.hypot(dx, dy);
  return [anchor, [
    box.label[0] + dx / ratio + dx / length * LABEL_GAP,
    box.label[1] + dy / ratio + dy / length * LABEL_GAP
  ]];
}

function findCallout(anchor: Point, size: Pick<LabelBox, "width" | "height">, viewBox: ViewBox, accepted: MapLabelPlacement[], anchorBoxes: LabelBox[]): Point {
  const [x, y, width, height] = viewBox;
  const left = x + EDGE_CLEARANCE + size.width / 2;
  const right = x + width - EDGE_CLEARANCE - size.width / 2;
  const top = y + EDGE_CLEARANCE + size.height / 2;
  const bottom = y + height - EDGE_CLEARANCE - size.height / 2;
  const xs = new Set([left, right, clamp(anchor[0], left, right)]);
  const ys = new Set([top, bottom, clamp(anchor[1], top, bottom)]);
  // Every occupied edge introduces another exact, gap-separated slot boundary.
  for (const box of accepted) {
    xs.add(clamp(box.label[0] - (box.width + size.width) / 2 - LABEL_GAP, left, right));
    xs.add(clamp(box.label[0] + (box.width + size.width) / 2 + LABEL_GAP, left, right));
    ys.add(clamp(box.label[1] - (box.height + size.height) / 2 - LABEL_GAP, top, bottom));
    ys.add(clamp(box.label[1] + (box.height + size.height) / 2 + LABEL_GAP, top, bottom));
  }
  // A displaced box must leave room for its own anchor and leader endpoint.
  xs.add(clamp(anchor[0] - size.width / 2 - LABEL_GAP, left, right));
  xs.add(clamp(anchor[0] + size.width / 2 + LABEL_GAP, left, right));
  ys.add(clamp(anchor[1] - size.height / 2 - LABEL_GAP, top, bottom));
  ys.add(clamp(anchor[1] + size.height / 2 + LABEL_GAP, top, bottom));

  let best: Point | undefined;
  let bestDistance = Infinity;
  const consider = (label: Point, inward = false) => {
    const distance = (label[0] - anchor[0]) ** 2 + (label[1] - anchor[1]) ** 2;
    if (distance >= bestDistance) return;
    const box = { ...size, label };
    if (Math.abs(label[0] - anchor[0]) < size.width / 2 + LABEL_GAP
      && Math.abs(label[1] - anchor[1]) < size.height / 2 + LABEL_GAP) return;
    if (accepted.some((other) => boxesOverlap(box, other, LABEL_GAP))) return;
    if (inward && anchorBoxes.some((other) => boxesOverlap(box, other, LABEL_GAP))) return;
    best = label;
    bestDistance = distance;
  };
  // Side and coordinate order resolves equal-distance choices deterministically.
  const sortedXs = [...xs].sort((a, b) => a - b);
  const sortedYs = [...ys].sort((a, b) => a - b);
  for (const slotY of sortedYs) consider([left, slotY]);
  for (const slotY of sortedYs) consider([right, slotY]);
  for (const slotX of sortedXs) consider([slotX, top]);
  for (const slotX of sortedXs) consider([slotX, bottom]);
  if (best) return best;

  // Additional rows stay parallel to their original edge, in its outer third.
  // A common column width aligns mixed-length labels and bounds the row count.
  const columnStride = Math.max(...anchorBoxes.map((box) => box.width)) + LABEL_GAP;
  const rowStride = size.height + LABEL_GAP;
  for (let row = 1; ; row += 1) {
    const verticalFits = EDGE_CLEARANCE + row * columnStride + size.width <= width / 3;
    const horizontalFits = EDGE_CLEARANCE + row * rowStride + size.height <= height / 3;
    if (!verticalFits && !horizontalFits) break;
    if (verticalFits) {
      for (const slotY of sortedYs) consider([left + row * columnStride, slotY], true);
      for (const slotY of sortedYs) consider([right - row * columnStride, slotY], true);
    }
    if (horizontalFits) {
      for (const slotX of sortedXs) consider([slotX, top + row * rowStride], true);
      for (const slotX of sortedXs) consider([slotX, bottom - row * rowStride], true);
    }
    if (best) return best;
  }
  throw new RangeError("map_label_layout_capacity_exceeded");
}

/** Pure layout over the supplied visible-level regions; no nationwide index lookup. */
export function layoutMapLabels({ regions, viewBox, viewport, selectedCode, orderCountByCode = {} }: MapLabelLayoutInput): MapLabelPlacement[] {
  const [x, y, width, height] = viewBox;
  const candidates = regions.flatMap((region) => region.labelPoint === null ? [] : [{
    code: region.code,
    anchor: [region.labelPoint[0] * viewport.scale + viewport.x, region.labelPoint[1] * viewport.scale + viewport.y] as Point,
    width: Math.max(48, region.nameJa.length * 15 + 16),
    height: 28
  }]);
  candidates.sort((a, b) => Number(b.code === selectedCode) - Number(a.code === selectedCode)
    || Number((orderCountByCode[b.code] ?? 0) > 0) - Number((orderCountByCode[a.code] ?? 0) > 0)
    || a.width - b.width
    || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  const anchorBoxes = candidates.map((candidate) => ({ ...candidate, label: candidate.anchor }));
  const accepted: MapLabelPlacement[] = [];
  for (const candidate of candidates) {
    if (candidate.width + EDGE_CLEARANCE * 2 > width || candidate.height + EDGE_CLEARANCE * 2 > height) {
      throw new RangeError("map_label_layout_capacity_exceeded");
    }
    const centered = { ...candidate, label: candidate.anchor };
    const internal = centered.label[0] - centered.width / 2 >= x + EDGE_CLEARANCE
      && centered.label[0] + centered.width / 2 <= x + width - EDGE_CLEARANCE
      && centered.label[1] - centered.height / 2 >= y + EDGE_CLEARANCE
      && centered.label[1] + centered.height / 2 <= y + height - EDGE_CLEARANCE
      && !accepted.some((other) => boxesOverlap(centered, other, LABEL_GAP));
    const label = internal ? candidate.anchor : findCallout(candidate.anchor, candidate, viewBox, accepted, anchorBoxes);
    const box = { ...candidate, label };
    accepted.push({ ...box, external: !internal, leader: internal ? [] : leaderToBox(candidate.anchor, box) });
  }
  return accepted;
}
