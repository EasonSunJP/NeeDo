import {
  compareAnalyticsMetric,
  type AnalyticsMetricPayload,
  type AnalyticsMetricSeries
} from "../src/domain/analytics-metric";

describe("shared analytics metric contract", () => {
  it.each([
    [null, null],
    [null, 10],
    [10, null]
  ])("returns unavailable when either fact is unavailable (%s, %s)", (current, previous) => {
    expect(compareAnalyticsMetric(current, previous)).toEqual({
      comparisonPercent: null,
      comparisonDirection: "unavailable"
    });
  });

  it.each([0, 10, -10])("returns a flat zero comparison for equal values (%s)", (value) => {
    expect(compareAnalyticsMetric(value, value)).toEqual({
      comparisonPercent: 0,
      comparisonDirection: "flat"
    });
  });

  it.each([
    [3, 0, 100, "up"],
    [-3, 0, -100, "down"],
    [0, 3, -100, "down"],
    [0, -3, 100, "up"]
  ] as const)(
    "handles a zero baseline without publishing infinity (%s, %s)",
    (current, previous, comparisonPercent, comparisonDirection) => {
      expect(compareAnalyticsMetric(current, previous)).toEqual({
        comparisonPercent,
        comparisonDirection
      });
    }
  );

  it.each([
    [-5, -10, 50, "up"],
    [-15, -10, -50, "down"],
    [5, -10, 150, "up"],
    [-5, 10, -150, "down"],
    [1, 3, -66.67, "down"]
  ] as const)(
    "uses the absolute previous value for signed facts (%s, %s)",
    (current, previous, comparisonPercent, comparisonDirection) => {
      expect(compareAnalyticsMetric(current, previous)).toEqual({
        comparisonPercent,
        comparisonDirection
      });
    }
  );

  it.each([
    [101.005, 100, 1.01, "up"],
    [98.995, 100, -1.01, "down"],
    [100.004, 100, 0, "flat"],
    [99.996, 100, 0, "flat"]
  ] as const)(
    "rounds to two decimals and derives direction from the rounded percentage (%s, %s)",
    (current, previous, comparisonPercent, comparisonDirection) => {
      expect(compareAnalyticsMetric(current, previous)).toEqual({
        comparisonPercent,
        comparisonDirection
      });
    }
  );

  it.each([
    [Number.NaN, 1],
    [1, Number.NaN],
    [Number.POSITIVE_INFINITY, 1],
    [1, Number.NEGATIVE_INFINITY],
    [Number.POSITIVE_INFINITY, null],
    [Number.MAX_VALUE, Number.MIN_VALUE]
  ])("fails closed instead of publishing a non-finite comparison (%s, %s)", (current, previous) => {
    expect(() => compareAnalyticsMetric(current, previous)).toThrow(
      "Analytics metric comparison requires finite values"
    );
  });

  it("does not coerce runtime strings into metric numbers", () => {
    expect(() => compareAnalyticsMetric("10" as unknown as number, 5)).toThrow(
      "Analytics metric comparison requires finite values"
    );
  });

  it("locks the metric and series payload shapes", () => {
    const metric: AnalyticsMetricPayload = {
      metricKey: "gross_revenue",
      currentValue: 12_000,
      previousValue: 10_000,
      comparisonPercent: 20,
      comparisonDirection: "up",
      unit: "jpy",
      dataStatus: "ready",
      description: "Settled gross revenue",
      formula: "completed checkout amount",
      detailRoute: "/admin/analytics/metrics/gross_revenue"
    };
    const series: AnalyticsMetricSeries = {
      seriesKey: "gross_revenue",
      label: "Gross revenue",
      unit: metric.unit,
      points: [{ key: "2026-09-01", label: "09-01", value: 12_000 }]
    };

    expect(metric).toMatchObject({ comparisonDirection: "up", dataStatus: "ready" });
    expect(series.points).toEqual([{ key: "2026-09-01", label: "09-01", value: 12_000 }]);
  });
});
