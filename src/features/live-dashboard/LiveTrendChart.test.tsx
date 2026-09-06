// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { LiveTrendChart } from "./LiveTrendChart";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("LiveTrendChart geometry", () => {
  it.each([{ values: [0, 0, 0, 0, 0, 0, 0] }, { values: [8] }, { values: [0, 3, 7, 2, 10, 5, 1] }])("keeps plot and dates separate for $values", ({ values }) => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const points = values.map((value, i) => ({ key: String(i), label: `09-0${i + 1}`, orderCount: value, confirmedPayments: { jpy: value * 10000, ndp: 0, testNdp: 0 } }));
    act(() => root.render(<LiveTrendChart points={points} ordersLabel="Orders" paymentsLabel="Payments" />));
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
    expect(svg.querySelector("[data-chart-plot]")).toBeTruthy();
    expect(svg.querySelector("[data-chart-axis]")).toBeTruthy();
    const baseline = Number(svg.querySelector("[data-chart-baseline]")?.getAttribute("data-y"));
    const labels = [...svg.querySelectorAll(".live-dashboard-chart-label")];
    expect(labels).toHaveLength(values.length);
    labels.forEach((label) => expect(Number(label.getAttribute("y")) - baseline).toBeGreaterThanOrEqual(16));
    svg.querySelectorAll("polyline").forEach((line) => {
      const positions = line.getAttribute("points")!.split(" ").map((point) => point.split(",").map(Number));
      if (values.some((value) => value > 0)) expect(Math.min(...positions.map(([, y]) => y))).toBe(18);
      positions.forEach(([x, y]) => {
        expect(x).toBeGreaterThanOrEqual(22);
        expect(x).toBeLessThanOrEqual(382);
        expect(y).toBeGreaterThanOrEqual(18);
        expect(y).toBeLessThanOrEqual(baseline);
        if (values.every((value) => value === 0)) expect(y).toBe(baseline);
      });
    });
    if (values.length === 1) expect(svg.querySelectorAll("[data-chart-point]")).toHaveLength(2);
    act(() => root.unmount());
  });
});
