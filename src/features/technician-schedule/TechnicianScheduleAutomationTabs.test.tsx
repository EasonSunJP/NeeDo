// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TechnicianScheduleAutomationTabs } from "./TechnicianScheduleAutomationTabs";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("TechnicianScheduleAutomationTabs", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps My Schedule and adds two explained Test automation tabs", async () => {
    const onChange = vi.fn();
    await act(async () => root.render(
      <TechnicianScheduleAutomationTabs onChange={onChange} value="calendar" />
    ));

    expect(container.textContent).toContain("我的排班");
    expect(container.textContent).toContain("接单设置");
    expect(container.textContent).toContain("抢单设置");
    expect(container.querySelectorAll('[aria-label="Test 功能"]')).toHaveLength(2);
    expect(container.querySelectorAll('[aria-label$="说明"]')).toHaveLength(2);

    await act(async () => {
      (Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("接单设置")) as HTMLButtonElement).click();
    });
    expect(onChange).toHaveBeenCalledWith("bookingSettings");
  });
});
