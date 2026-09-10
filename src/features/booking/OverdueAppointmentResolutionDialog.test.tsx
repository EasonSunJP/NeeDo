// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OverdueAppointmentResolutionDialog } from "./OverdueAppointmentResolutionDialog";

vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: "zh" }) }));

describe("overdue appointment resolution dialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows the blocked appointment and all three formal resolution choices", () => {
    const onResolve = vi.fn();
    act(() => {
      root.render(createElement(OverdueAppointmentResolutionDialog, {
        appointment: {
          orderId: 17,
          orderNo: "ND202608310017",
          serviceName: "此前的到店护理",
          startsAt: "2026-08-31T08:00:00.000Z",
          endsAt: "2026-08-31T09:00:00.000Z"
        },
        pending: false,
        onResolve
      }));
    });

    expect(container.textContent).toContain("此前的到店护理");
    expect(container.textContent).toContain("ND202608310017");
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons).toHaveLength(3);
    for (const [label, resolution] of [
      ["实际已完成", "actually_completed"],
      ["客户未到店", "customer_no_show"],
      ["技师未到店", "technician_no_show"]
    ] as const) {
      act(() => buttons.find((button) => button.textContent === label)?.click());
      expect(onResolve).toHaveBeenCalledWith(resolution);
    }
  });
});
