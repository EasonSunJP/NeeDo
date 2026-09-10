// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  hasPermission: vi.fn((_permission?: string) => false),
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

vi.mock("../../components/admin/AdminLayout", () => ({
  AdminLayout: ({ children }: { children: React.ReactNode }) => <div data-admin-layout="true">{children}</div>
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
  anytimeServiceTestEnabled: false,
  overdueAppointmentGateEnabled: false,
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
    expect(container.querySelector('[data-admin-layout="true"] [role="tablist"]')).not.toBeNull();
    const basic = container.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')!;
    await act(async () => basic.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" })));
    const selected = container.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]');
    expect(selected?.textContent).toContain("政策和协议");
  });

  it("shows the effective default brand images and styled image pickers", async () => {
    mocked.hasPermission.mockImplementation((permission?: string) =>
      [
        "backoffice:system-settings:write",
        "backoffice:system-brand-media:activate",
        "button:backoffice-content-media-upload"
      ].includes(permission ?? "")
    );
    await act(async () => {
      root.render(createElement(MemoryRouter, { initialEntries: ["/admin/settings/system?tab=basic"] }, createElement(SystemSettingsPage)));
    });

    const loginLogo = container.querySelector<HTMLImageElement>('img[alt="登录页 LOGO"]');
    const requestButton = container.querySelector<HTMLImageElement>('img[alt="Request 中央按钮图片"]');
    expect(loginLogo?.getAttribute("src")).toBe("/icons/needo-login-check-mark-white.png");
    expect(requestButton?.getAttribute("src")).toBe("/icons/needo-green-button-light.png");
    expect(loginLogo?.classList.contains("needo-login-logo__mark")).toBe(true);
    expect(requestButton?.classList.contains("client-featured-nav-image")).toBe(true);
    expect(loginLogo?.parentElement?.parentElement?.getAttribute("style")).toContain("place-items: center");
    expect(requestButton?.parentElement?.getAttribute("style")).toContain("justify-content: center");
    expect(container.textContent).toContain("颜色会跟随每位用户的 UI 主题自动适配");
    expect(container.textContent).not.toContain("尚未设置");
    expect(container.textContent?.match(/系统默认 · 当前启用/g)).toHaveLength(2);
    expect(Array.from(container.querySelectorAll('input[type="file"]')).every((input) => input.classList.contains("sr-only"))).toBe(true);
    expect(Array.from(container.querySelectorAll("label")).filter((label) => label.textContent?.includes("选择新图片"))).toHaveLength(2);
  });

  it("publishes the anytime-service test switch through the protected basic settings write", async () => {
    mocked.hasPermission.mockImplementation((permission?: string) =>
      permission === "backoffice:system-settings:write"
    );
    mocked.updateBasic.mockResolvedValue({ ...settings, anytimeServiceTestEnabled: true });
    await act(async () => {
      root.render(createElement(MemoryRouter, { initialEntries: ["/admin/settings/system?tab=basic"] }, createElement(SystemSettingsPage)));
    });

    const toggle = container.querySelector<HTMLButtonElement>('[role="switch"][aria-label="随时服务测试"]');
    expect(toggle?.getAttribute("aria-checked")).toBe("false");
    await act(async () => toggle?.click());
    const save = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.includes("保存并发布"));
    await act(async () => save?.click());

    expect(mocked.updateBasic).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: 2, anytimeServiceTestEnabled: true })
    );
  });

  it("publishes the overdue appointment gate with the exact operations label", async () => {
    mocked.hasPermission.mockImplementation((permission?: string) =>
      permission === "backoffice:system-settings:write"
    );
    mocked.updateBasic.mockResolvedValue({ ...settings, overdueAppointmentGateEnabled: true });
    await act(async () => {
      root.render(createElement(MemoryRouter, { initialEntries: ["/admin/settings/system?tab=basic"] }, createElement(SystemSettingsPage)));
    });

    const toggle = container.querySelector<HTMLButtonElement>('[role="switch"][aria-label="过期预约未处理门禁"]');
    expect(toggle?.getAttribute("aria-checked")).toBe("false");
    await act(async () => toggle?.click());
    const save = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.includes("保存并发布"));
    await act(async () => save?.click());

    expect(mocked.updateBasic).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: 2, overdueAppointmentGateEnabled: true })
    );
  });
});
