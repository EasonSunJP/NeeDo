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

function extent(scale: number, dimension: number): number {
  return (scale - 1) * dimension / 2;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function cleanZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function clampViewport(viewport: MapViewport, viewBox: ViewBox): MapViewport {
  const maxX = extent(viewport.scale, viewBox[2]);
  const maxY = extent(viewport.scale, viewBox[3]);
  return {
    scale: viewport.scale,
    x: cleanZero(clamp(viewport.x, -maxX, maxX)),
    y: cleanZero(clamp(viewport.y, -maxY, maxY))
  };
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
  viewBox: ViewBox
): MapViewport {
  if (!isValidViewBox(viewBox) || !center.every(isFiniteNumber)) return currentOrIdentity(current, viewBox);
  const validCurrent = currentOrIdentity(current, viewBox);
  const nextScale = direction === "in"
    ? Math.min(MAX_SCALE, validCurrent.scale + ZOOM_STEP)
    : Math.max(MIN_SCALE, validCurrent.scale - ZOOM_STEP);
  if (nextScale === validCurrent.scale) return validCurrent;

  const ratio = nextScale / validCurrent.scale;
  return clampViewport({
    scale: nextScale,
    x: center[0] - (center[0] - validCurrent.x) * ratio,
    y: center[1] - (center[1] - validCurrent.y) * ratio
  }, viewBox);
}

export function panMapViewport(current: MapViewport, delta: Point, viewBox: ViewBox): MapViewport {
  if (!isValidViewBox(viewBox) || !delta.every(isFiniteNumber)) return currentOrIdentity(current, viewBox);
  const validCurrent = currentOrIdentity(current, viewBox);
  return clampViewport({
    scale: validCurrent.scale,
    x: validCurrent.x + delta[0],
    y: validCurrent.y + delta[1]
  }, viewBox);
}

export function mapViewportTransform(viewport: MapViewport): string {
  return `translate(${cleanZero(viewport.x)} ${cleanZero(viewport.y)}) scale(${viewport.scale})`;
}
