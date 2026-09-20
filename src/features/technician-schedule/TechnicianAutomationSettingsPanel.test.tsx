// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSetting: vi.fn(),
  updateSetting: vi.fn(),
  listContacts: vi.fn()
}));

vi.mock("./automation-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./automation-api")>();
  return { ...actual, automationApi: mocks };
});
vi.mock("../pricing-mode/api", () => ({
  pricingModeApi: { listMyTechnicianServices: vi.fn().mockResolvedValue({ list: [], total: 0, page: 1, page_size: 200 }) }
}));

import { defaultAutomationRules, TechnicianAutomationSettingsPanel } from "./TechnicianAutomationSettingsPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("TechnicianAutomationSettingsPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.getSetting.mockResolvedValue({
      kind: "booking",
      enabled: false,
      entitled: true,
      testBadgeEnabled: true,
      rules: defaultAutomationRules("booking"),
      version: 1,
      updatedAt: null
    });
    mocks.updateSetting.mockImplementation(async (_kind, input) => ({
      kind: "booking",
      enabled: input.enabled,
      entitled: true,
      testBadgeEnabled: true,
      rules: input.rules,
      version: 2,
      updatedAt: "2026-09-09T00:00:00.000Z"
    }));
    mocks.listContacts.mockResolvedValue({ list: [], total: 0, page: 1, page_size: 20 });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("loads disabled by default, tracks dirty state, and saves a versioned formal setting", async () => {
    const onDirtyChange = vi.fn();
    await act(async () => root.render(
      <TechnicianAutomationSettingsPanel kind="booking" onDirtyChange={onDirtyChange} />
    ));
    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());

    const enabled = container.querySelector('[aria-label="启用自动接单"]') as HTMLButtonElement;
    expect(enabled.tagName).toBe("BUTTON");
    expect(enabled.getAttribute("role")).toBe("switch");
    expect(enabled.getAttribute("aria-checked")).toBe("false");
    await act(async () => enabled.click());
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    const saveButton = container.querySelector('[data-testid="automation-save"]') as HTMLButtonElement;
    expect(saveButton.parentElement).toBe(container.querySelector('[data-testid="technician-booking-automation-settings"]'));
    expect(saveButton.className).toContain("fixed");

    await act(async () => {
      saveButton.click();
    });
    await act(async () => Promise.resolve());

    expect(mocks.updateSetting).toHaveBeenCalledWith("booking", expect.objectContaining({
      enabled: true,
      expectedVersion: 1
    }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("matches the application form visual for the three customer rule selects", async () => {
    await act(async () => root.render(
      <TechnicianAutomationSettingsPanel kind="booking" />
    ));
    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());

    const labels = ["最低已完成订单", "客户来源", "客户类型"];
    labels.forEach((labelText) => {
      const label = Array.from(container.querySelectorAll("label"))
        .find((candidate) => candidate.textContent?.startsWith(labelText));
      const select = label?.querySelector("select");
      expect(select?.className).toContain("min-h-12");
      expect(select?.className).toContain("rounded-[18px]");
      expect(select?.className).toContain("text-[15px]");
    });
  });

  it("keeps save highlighted and handles an unchanged setting without a write", async () => {
    await act(async () => root.render(
      <TechnicianAutomationSettingsPanel kind="booking" />
    ));
    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());

    const saveButton = container.querySelector('[data-testid="automation-save"]') as HTMLButtonElement;
    expect(saveButton.disabled).toBe(false);
    await act(async () => saveButton.click());
    expect(mocks.updateSetting).not.toHaveBeenCalled();
    expect(container.textContent).toContain("当前设置已是最新");
  });

  it("places an integer prepayment threshold at the bottom of order attributes", async () => {
    await act(async () => root.render(
      <TechnicianAutomationSettingsPanel kind="booking" />
    ));
    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());

    const orderAttributes = Array.from(container.querySelectorAll("section"))
      .find((section) => section.querySelector("h3")?.textContent === "订单属性");
    expect(orderAttributes).toBeTruthy();
    const prepaymentSwitch = orderAttributes?.querySelector('[aria-label="需要预付"]') as HTMLInputElement;
    expect(prepaymentSwitch?.type).toBe("checkbox");
    expect(prepaymentSwitch.checked).toBe(false);
    expect(orderAttributes?.lastElementChild?.textContent).toContain("需要预付");

    await act(async () => prepaymentSwitch.click());
    const input = orderAttributes?.querySelector('[aria-label="最低预付比例"]') as HTMLInputElement;
    expect(input.value).toBe("10");
    expect(input.min).toBe("10");
    expect(input.max).toBe("100");
    expect(input.step).toBe("1");

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(input, "30");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => (container.querySelector('[data-testid="automation-save"]') as HTMLButtonElement).click());
    await act(async () => Promise.resolve());
    expect(mocks.updateSetting).toHaveBeenCalledWith("booking", expect.objectContaining({
      rules: expect.objectContaining({ minimumPrepaymentPercent: 30 })
    }));
  });
});
