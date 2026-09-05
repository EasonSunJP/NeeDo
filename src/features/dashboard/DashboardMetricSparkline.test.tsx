// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { DashboardMetricSparkline } from "./DashboardMetricSparkline";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const render = (values: number[]) => {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    <I18nProvider>
      <DashboardMetricSparkline
        points={values.map((value, index) => ({
          key: `2026-09-0${index + 1}`,
          label: `09-0${index + 1}`,
          value
        }))}
        title="新增用户"
        unit="people"
      />
    </I18nProvider>
  );
  return container;
};

describe("DashboardMetricSparkline", () => {
  it("renders exactly three server points and an accessible value list", () => {
    const container = render([2, 8, 5]);
    const path = container.querySelector("path")?.getAttribute("d") ?? "";

    expect(container.querySelectorAll('[data-dashboard-sparkline-node="true"]')).toHaveLength(3);
    expect(container.querySelector("line")).toBeNull();
    expect(path).toBe("M 8 40 L 48 8 L 88 24");
    expect(path).not.toMatch(/NaN|Infinity/);
    expect(container.textContent).toContain("09-01: 2");
    expect(container.textContent).toContain("09-02: 8");
    expect(container.textContent).toContain("09-03: 5");
  });

  it("opens, switches, and closes exact point data with mouse and keyboard", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(
      <I18nProvider>
        <DashboardMetricSparkline
          points={[
            { key: "2026-09-01", label: "09-01", value: 2 },
            { key: "2026-09-02", label: "09-02", value: 8 },
            { key: "2026-09-03", label: "09-03", value: 5 }
          ]}
          title="新增用户"
          unit="people"
        />
      </I18nProvider>
    ));

    const controls = container.querySelectorAll<SVGElement>(
      '[data-dashboard-sparkline-control="true"]'
    );
    expect(controls).toHaveLength(3);
    expect(controls[1]?.getAttribute("aria-label")).toContain("09-02");

    await act(async () => controls[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.querySelector('[data-dashboard-sparkline-detail="true"]')?.textContent)
      .toContain("09-02");
    expect(container.querySelector('[data-dashboard-sparkline-detail="true"]')?.textContent)
      .toContain("8 人");

    await act(async () => controls[2]?.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: " " })
    ));
    expect(container.querySelector('[data-dashboard-sparkline-detail="true"]')?.textContent)
      .toContain("09-03");

    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-dashboard-sparkline-detail="true"] button'
    )?.click());
    expect(container.querySelector('[data-dashboard-sparkline-detail="true"]')).toBeNull();

    await act(async () => controls[0]?.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })
    ));
    expect(container.querySelector('[data-dashboard-sparkline-detail="true"]')).not.toBeNull();
    await act(async () => container.querySelector('[data-dashboard-sparkline="true"]')
      ?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })));
    expect(container.querySelector('[data-dashboard-sparkline-detail="true"]')).toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it("renders a flat middle line and rejects non-three-point or non-finite input", () => {
    expect(render([4, 4, 4]).querySelector("path")?.getAttribute("d"))
      .toBe("M 8 24 L 48 24 L 88 24");
    expect(render([1, 2]).innerHTML).toBe("");
    expect(render([1, Number.NaN, 3]).innerHTML).toBe("");
  });
});
