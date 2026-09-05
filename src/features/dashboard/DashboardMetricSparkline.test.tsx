// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardMetricSparkline } from "./DashboardMetricSparkline";

const render = (values: number[]) => {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    <DashboardMetricSparkline
      points={values.map((value, index) => ({
        key: `2026-09-0${index + 1}`,
        label: `09-0${index + 1}`,
        value
      }))}
    />
  );
  return container;
};

describe("DashboardMetricSparkline", () => {
  it("renders exactly three server points and an accessible value list", () => {
    const container = render([2, 8, 5]);
    const path = container.querySelector("path")?.getAttribute("d") ?? "";

    expect(container.querySelectorAll('[data-dashboard-sparkline-node="true"]')).toHaveLength(3);
    expect(path).toBe("M 8 40 L 48 8 L 88 24");
    expect(path).not.toMatch(/NaN|Infinity/);
    expect(container.textContent).toContain("09-01: 2");
    expect(container.textContent).toContain("09-02: 8");
    expect(container.textContent).toContain("09-03: 5");
  });

  it("renders a flat middle line and rejects non-three-point or non-finite input", () => {
    expect(render([4, 4, 4]).querySelector("path")?.getAttribute("d"))
      .toBe("M 8 24 L 48 24 L 88 24");
    expect(render([1, 2]).innerHTML).toBe("");
    expect(render([1, Number.NaN, 3]).innerHTML).toBe("");
  });
});
