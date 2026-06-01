export type TrendChartDimensions = {
  bottom: number;
  height: number;
  left: number;
  right?: number;
  top: number;
  width: number;
};

export type TrendCoordinate = {
  x: number;
  y: number;
};

function roundCoordinate(value: number) {
  return Number(value.toFixed(3));
}

export function buildTrendCoordinates(values: number[], { bottom, height, left, right = 18, top, width }: TrendChartDimensions): TrendCoordinate[] {
  const maxValue = Math.max(...values, 1);
  const usableHeight = height - top - bottom;
  const usableWidth = width - left - right;
  const step = values.length > 1 ? usableWidth / (values.length - 1) : 0;

  return values.map((value, index) => ({
    x: roundCoordinate(left + step * index),
    y: roundCoordinate(top + usableHeight - (Math.max(0, value) / maxValue) * usableHeight)
  }));
}

export function buildTrendPolylineFromIndexes(coordinates: TrendCoordinate[], indexes: number[]) {
  return indexes
    .map((index) => coordinates[index])
    .filter((coordinate): coordinate is TrendCoordinate => Boolean(coordinate))
    .map((coordinate) => `${coordinate.x},${coordinate.y}`)
    .join(" ");
}
