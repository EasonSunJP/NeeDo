export type MapViewport = Readonly<{
  scale: number;
  x: number;
  y: number;
}>;

type Point = readonly [number, number];
type ViewBox = readonly [number, number, number, number];

export const IDENTITY_VIEWPORT: MapViewport = Object.freeze({ scale: 1, x: 0, y: 0 });

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const ZOOM_STEP = 0.5;

const isFiniteNumber = (value: number): boolean => Number.isFinite(value);

function isValidViewBox(viewBox: ViewBox): boolean {
  return viewBox.every(isFiniteNumber) && viewBox[2] > 0 && viewBox[3] > 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function cleanZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function clampViewport(viewport: MapViewport, viewBox: ViewBox): MapViewport {
  // SVG translate(...) scale(...) maps each point to scale * point + pan.
  // Keep both transformed viewBox edges outside the original viewport edges.
  const offset = 1 - viewport.scale;
  const [left, top, width, height] = viewBox;
  return {
    scale: viewport.scale,
    x: cleanZero(clamp(viewport.x, offset * (left + width), offset * left)),
    y: cleanZero(clamp(viewport.y, offset * (top + height), offset * top))
  };
}

function keepContentVisible(viewport: MapViewport, viewBox: ViewBox, contentPoints: readonly Point[]): MapViewport {
  const bounded = clampViewport(viewport, viewBox);
  const [left, top, width, height] = viewBox;
  const right = left + width;
  const bottom = top + height;
  const margin = Math.min(1, width / 2, height / 2);
  let nearest = bounded;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const point of contentPoints) {
    if (!point.every(isFiniteNumber) || point[0] < left || point[0] > right || point[1] < top || point[1] > bottom) continue;
    const x = point[0] * bounded.scale + bounded.x;
    const y = point[1] * bounded.scale + bounded.y;
    if (x >= left && x <= right && y >= top && y <= bottom) return bounded;
    const candidate = clampViewport({
      scale: bounded.scale,
      x: bounded.x + clamp(x, left + margin, right - margin) - x,
      y: bounded.y + clamp(y, top + margin, bottom - margin) - y
    }, viewBox);
    const distance = (candidate.x - bounded.x) ** 2 + (candidate.y - bounded.y) ** 2;
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function isValidViewport(viewport: MapViewport, viewBox: ViewBox): boolean {
  if (!isFiniteNumber(viewport.scale) || !isFiniteNumber(viewport.x) || !isFiniteNumber(viewport.y)) return false;
  if (viewport.scale < MIN_SCALE || viewport.scale > MAX_SCALE) return false;
  const normalized = clampViewport(viewport, viewBox);
  return normalized.x === viewport.x && normalized.y === viewport.y;
}

function currentOrIdentity(current: MapViewport, viewBox: ViewBox): MapViewport {
  return isValidViewport(current, viewBox) ? current : IDENTITY_VIEWPORT;
}

export function zoomMapViewport(
  current: MapViewport,
  direction: "in" | "out",
  center: Point,
  viewBox: ViewBox,
  contentPoints: readonly Point[] = []
): MapViewport {
  if (!isValidViewBox(viewBox) || !center.every(isFiniteNumber)) return currentOrIdentity(current, viewBox);
  const validCurrent = currentOrIdentity(current, viewBox);
  const nextScale = direction === "in"
    ? Math.min(MAX_SCALE, validCurrent.scale + ZOOM_STEP)
    : Math.max(MIN_SCALE, validCurrent.scale - ZOOM_STEP);
  if (nextScale === validCurrent.scale) return keepContentVisible(validCurrent, viewBox, contentPoints);

  const ratio = nextScale / validCurrent.scale;
  return keepContentVisible({
    scale: nextScale,
    x: center[0] - (center[0] - validCurrent.x) * ratio,
    y: center[1] - (center[1] - validCurrent.y) * ratio
  }, viewBox, contentPoints);
}

export function panMapViewport(current: MapViewport, delta: Point, viewBox: ViewBox, contentPoints: readonly Point[] = []): MapViewport {
  if (!isValidViewBox(viewBox) || !delta.every(isFiniteNumber)) return currentOrIdentity(current, viewBox);
  const validCurrent = currentOrIdentity(current, viewBox);
  return keepContentVisible({
    scale: validCurrent.scale,
    x: validCurrent.x + delta[0],
    y: validCurrent.y + delta[1]
  }, viewBox, contentPoints);
}

// Accumulate pointer movement independently of the nearest-visible-content
// correction so a continuous gesture can cross disconnected islands.
export function panMapGesture(intent: MapViewport, delta: Point, viewBox: ViewBox, contentPoints: readonly Point[] = []): { intent: MapViewport; viewport: MapViewport } {
  const nextIntent = panMapViewport(intent, delta, viewBox);
  return { intent: nextIntent, viewport: panMapViewport(nextIntent, [0, 0], viewBox, contentPoints) };
}

export function mapViewportTransform(viewport: MapViewport): string {
  return `translate(${cleanZero(viewport.x)} ${cleanZero(viewport.y)}) scale(${viewport.scale})`;
}
