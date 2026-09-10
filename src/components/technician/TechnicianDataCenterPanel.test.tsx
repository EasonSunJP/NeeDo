// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  TechnicianDualTrendChart,
  type TechnicianDualTrendPoint
} from "./TechnicianDataCenterPanel";

const points: TechnicianDualTrendPoint[] = [
  { key: "one", label: "8/25", incomeJpy: 12_000, workedMinutes: 60 },
  { key: "two", label: "8/26", incomeJpy: 8_000, workedMinutes: 120 },
  { key: "three", label: "8/27", incomeJpy: 14_000, workedMinutes: 90 }
];

describe("TechnicianDualTrendChart", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("renders both formal series and lets each legend hide and restore its own line", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <TechnicianDualTrendChart points={points} />
        </MemoryRouter>
      );
    });

    const incomeLegend = container.querySelector<HTMLButtonElement>('button[aria-label="隐藏收入趋势"]');
    const workLegend = container.querySelector<HTMLButtonElement>('button[aria-label="隐藏工作趋势"]');
    expect(container.querySelector("section")?.className).toContain(
      "text-[color:var(--client-text)]"
    );
    expect(container.querySelector("section")?.className).toContain(
      "technician-data-center-panel"
    );
    expect(container.querySelector('[data-series="income"]')).not.toBeNull();
    expect(container.querySelector('[data-series="work"]')).not.toBeNull();
    expect(container.querySelector('[data-series="work"] polyline')?.getAttribute("stroke")).toBe("var(--client-accent)");
    expect(workLegend?.className).toContain("var(--client-accent)");
    expect(workLegend?.className).not.toContain("cyan");
    expect(incomeLegend?.getAttribute("aria-pressed")).toBe("true");
    expect(workLegend?.getAttribute("aria-pressed")).toBe("true");

    await act(async () => incomeLegend?.click());
    expect(container.querySelector('[data-series="income"]')).toBeNull();
    expect(container.querySelector('[data-series="work"]')).not.toBeNull();
    expect(incomeLegend?.getAttribute("aria-label")).toBe("显示收入趋势");

    await act(async () => incomeLegend?.click());
    await act(async () => workLegend?.click());
    expect(container.querySelector('[data-series="income"]')).not.toBeNull();
    expect(container.querySelector('[data-series="work"]')).toBeNull();
    expect(workLegend?.getAttribute("aria-label")).toBe("显示工作趋势");
  });
});
