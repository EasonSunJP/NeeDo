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

    const enabled = container.querySelector('[aria-label="启用自动接单"]') as HTMLInputElement;
    expect(enabled.checked).toBe(false);
    await act(async () => enabled.click());
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    await act(async () => {
      (container.querySelector('[data-testid="automation-save"]') as HTMLButtonElement).click();
    });
    await act(async () => Promise.resolve());

    expect(mocks.updateSetting).toHaveBeenCalledWith("booking", expect.objectContaining({
      enabled: true,
      expectedVersion: 1
    }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });
});
