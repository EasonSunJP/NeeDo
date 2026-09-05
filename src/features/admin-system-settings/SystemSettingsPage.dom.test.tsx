// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  hasPermission: vi.fn(() => false),
  getSettings: vi.fn(),
  getRetention: vi.fn(),
  updateBasic: vi.fn(),
  updatePayment: vi.fn(),
  updateRetention: vi.fn(),
  uploadBrandImage: vi.fn()
}));

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({
    hasAnyPermission: () => false,
    hasPermission: mocked.hasPermission
  })
}));
vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: "zh" }) }));
vi.mock("./api", () => ({
  adminSystemSettingsApi: {
    getSettings: mocked.getSettings,
    getRetention: mocked.getRetention,
    updateBasic: mocked.updateBasic,
    updatePayment: mocked.updatePayment,
    updateRetention: mocked.updateRetention,
    uploadBrandImage: mocked.uploadBrandImage
  }
}));

import { SystemSettingsPage } from "./SystemSettingsPage";

const settings = {
  id: 1,
  publicId: "settings-1",
  version: 2,
  siteEnabled: true,
  selfRegistrationEnabled: true,
  googleLoginEnabled: false,
  passwordLoginOtpEnabled: true,
  passwordLoginOtpRule: "monthly_first" as const,
  passwordLoginOtpOnNewIp: true,
  loginLogoMediaAssetId: null,
  requestButtonMediaAssetId: null,
  offlinePaymentEnabled: true,
  ndpPaymentEnabled: true,
  createdByUserId: 1,
  createdAt: "2026-09-06T00:00:00.000Z",
  updatedAt: "2026-09-06T00:00:00.000Z",
  loginLogo: null,
  requestButton: null,
  loginProviderProjects: [
    { code: "apple" as const, configured: false as const, enabled: false as const, actionable: false as const },
    { code: "line" as const, configured: false as const, enabled: false as const, actionable: false as const }
  ],
  paymentProviderProjects: [
    { code: "paypay" as const, configured: false as const, enabled: false as const, actionable: false as const },
    { code: "paypal" as const, configured: false as const, enabled: false as const, actionable: false as const },
    { code: "stripe" as const, configured: false as const, enabled: false as const, actionable: false as const }
  ]
};

describe("SystemSettingsPage interactions", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    mocked.getSettings.mockResolvedValue(settings);
    mocked.getRetention.mockResolvedValue({
      version: 1,
      messageDays: 30,
      mediaDays: 3,
      updatedAt: "2026-09-06T00:00:00.000Z"
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("opens a deep-linked storage tab without granting write controls", async () => {
    await act(async () => {
      root.render(createElement(MemoryRouter, { initialEntries: ["/admin/settings/system?tab=storage"] }, createElement(SystemSettingsPage)));
    });
    const storage = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((tab) => tab.textContent?.includes("储存设置"));
    expect(storage?.getAttribute("aria-selected")).toBe("true");
    expect(mocked.getRetention).toHaveBeenCalledTimes(1);
    expect(container.querySelector<HTMLInputElement>('input[type="number"]')?.disabled).toBe(true);
  });

  it("moves to the next URL-backed tab with ArrowRight", async () => {
    await act(async () => {
      root.render(createElement(MemoryRouter, { initialEntries: ["/admin/settings/system?tab=basic"] }, createElement(SystemSettingsPage)));
    });
    const basic = container.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')!;
    await act(async () => basic.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" })));
    const selected = container.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]');
    expect(selected?.textContent).toContain("政策和协议");
  });
});
