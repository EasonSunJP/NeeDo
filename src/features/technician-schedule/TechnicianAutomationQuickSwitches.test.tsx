// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type TechnicianAutomationKind,
  type TechnicianAutomationRules,
  type TechnicianAutomationSetting,
} from "./automation-api";
import { TechnicianAutomationQuickSwitches } from "./TechnicianAutomationQuickSwitches";

const apiMocks = vi.hoisted(() => ({
  getSetting: vi.fn(),
  updateSetting: vi.fn(),
}));

vi.mock("./automation-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./automation-api")>()),
  automationApi: apiMocks,
}));

const rules: TechnicianAutomationRules = {
  timeWindows: [],
  minLeadMinutes: 30,
  bufferMinutes: 30,
  areaCodes: [],
  maxDistanceKm: 5,
  minOrderAmountJpy: null,
  minNetAmountJpy: null,
  minCustomerRating: null,
  acceptNewCustomers: true,
  minCompletedOrders: 0,
  requireEkyc: false,
  maxCancellationRatePercent: null,
  source: { mode: "any", contactIdentityIds: [] },
  customerType: "all",
  partyTypes: ["single"],
  serviceModes: ["store", "home"],
  paymentMethods: ["onsite", "card", "ndp", "other"],
  serviceIds: [],
  minimumPrepaymentPercent: 0,
  onlyOnline: false,
  requestStartWindow: "any",
  requireMatchingTags: false,
};

function setting(
  kind: TechnicianAutomationKind,
  enabled: boolean,
  version: number,
  entitled = true,
): TechnicianAutomationSetting {
  return {
    kind,
    enabled,
    entitled,
    testBadgeEnabled: true,
    rules,
    version,
    updatedAt: "2026-09-09T00:00:00.000Z",
  };
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  apiMocks.getSetting.mockImplementation((kind: TechnicianAutomationKind) =>
    Promise.resolve(kind === "booking" ? setting(kind, false, 4) : setting(kind, true, 7)),
  );
  apiMocks.updateSetting.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("technician automation quick switches", () => {
  it("loads both formal settings and saves the full current rule version", async () => {
    await act(async () => root.render(<TechnicianAutomationQuickSwitches />));

    const booking = container.querySelector<HTMLButtonElement>(
      '[role="switch"][aria-label="自动接单"]',
    )!;
    const request = container.querySelector<HTMLButtonElement>(
      '[role="switch"][aria-label="自动抢单"]',
    )!;
    expect(booking.getAttribute("aria-checked")).toBe("false");
    expect(request.getAttribute("aria-checked")).toBe("true");

    apiMocks.updateSetting.mockResolvedValue(setting("booking", true, 5));
    await act(async () => booking.click());

    expect(apiMocks.updateSetting).toHaveBeenCalledWith("booking", {
      enabled: true,
      expectedVersion: 4,
      rules,
    });
    expect(booking.getAttribute("aria-checked")).toBe("true");
  });

  it("keeps the server value and exposes retry when a save fails", async () => {
    await act(async () => root.render(<TechnicianAutomationQuickSwitches />));
    const booking = container.querySelector<HTMLButtonElement>(
      '[role="switch"][aria-label="自动接单"]',
    )!;
    apiMocks.updateSetting.mockRejectedValueOnce(new Error("network"));

    await act(async () => booking.click());

    expect(booking.getAttribute("aria-checked")).toBe("false");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "自动接单设置保存失败",
    );
    expect(container.querySelector<HTMLButtonElement>('[data-action="retry-load"]')).not.toBeNull();
  });

  it("disables only the setting that is not entitled", async () => {
    apiMocks.getSetting.mockImplementation((kind: TechnicianAutomationKind) =>
      Promise.resolve(
        kind === "booking" ? setting(kind, false, 4, false) : setting(kind, false, 7),
      ),
    );
    await act(async () => root.render(<TechnicianAutomationQuickSwitches />));

    expect(
      container.querySelector<HTMLButtonElement>('[role="switch"][aria-label="自动接单"]')
        ?.disabled,
    ).toBe(true);
    expect(
      container.querySelector<HTMLButtonElement>('[role="switch"][aria-label="自动抢单"]')
        ?.disabled,
    ).toBe(false);
  });
});
