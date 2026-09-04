export type AnalyticsDataStatus = "ready" | "not_connected" | "not_available";

export type AnalyticsComparisonDirection = "up" | "down" | "flat" | "unavailable";

export interface AnalyticsMetricPayload {
  metricKey: string;
  currentValue: number | null;
  previousValue: number | null;
  comparisonPercent: number | null;
  comparisonDirection: AnalyticsComparisonDirection;
  unit: "jpy" | "ndp" | "people" | "count";
  dataStatus: AnalyticsDataStatus;
  description: string;
  formula: string;
  detailRoute: string | null;
}

export interface AnalyticsMetricSeries {
  seriesKey: string;
  label: string;
  unit: AnalyticsMetricPayload["unit"];
  points: Array<{ key: string; label: string; value: number | null }>;
}

const assertFiniteMetricValue = (value: number | null): void => {
  if (value !== null && !Number.isFinite(value)) {
    throw new RangeError("Analytics metric comparison requires finite values");
  }
};

const roundComparisonPercent = (value: number): number => {
  if (!Number.isFinite(value)) {
    throw new RangeError("Analytics metric comparison requires finite values");
  }
  const scaledMagnitude = Number((Math.abs(value) * 100).toPrecision(15));
  if (!Number.isFinite(scaledMagnitude)) {
    throw new RangeError("Analytics metric comparison requires finite values");
  }
  const rounded = Math.sign(value) * (Math.round(scaledMagnitude) / 100);
  return Object.is(rounded, -0) ? 0 : rounded;
};

export function compareAnalyticsMetric(
  current: number | null,
  previous: number | null
): {
  comparisonPercent: number | null;
  comparisonDirection: AnalyticsComparisonDirection;
} {
  assertFiniteMetricValue(current);
  assertFiniteMetricValue(previous);

  if (current === null || previous === null) {
    return { comparisonPercent: null, comparisonDirection: "unavailable" };
  }
  if (current === previous) {
    return { comparisonPercent: 0, comparisonDirection: "flat" };
  }

  const unroundedPercent =
    previous === 0 ? (current > 0 ? 100 : -100) : ((current - previous) / Math.abs(previous)) * 100;
  const comparisonPercent = roundComparisonPercent(unroundedPercent);
  const comparisonDirection: AnalyticsComparisonDirection =
    comparisonPercent > 0 ? "up" : comparisonPercent < 0 ? "down" : "flat";

  return { comparisonPercent, comparisonDirection };
}
