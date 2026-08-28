// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminLoginPortal } from "../../auth/adminLogin";
import adminLoginSource from "./AdminLoginPage.tsx?raw";

const mocked = vi.hoisted(() => ({
  auth: {
    canAccess: vi.fn(() => false),
    isAuthenticated: false,
    loginWithFormalPassword: vi.fn(),
    loginWithQr: vi.fn(),
    loginWithVerificationCode: vi.fn(),
    logout: vi.fn(),
    sendVerificationCode: vi.fn(),
    session: null as { email?: string; loginMethod?: string; portal?: string; username?: string } | null,
    switchPortal: vi.fn()
  },
  language: "en" as "en" | "ja" | "ko" | "zh" | "zh-Hant",
  requestBrowserPasswordSave: vi.fn(async () => undefined),
  setLanguage: vi.fn(),
  navigate: vi.fn()
}));

vi.mock("../../auth/AuthProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../auth/AuthProvider")>();
  return { ...actual, useAuth: () => mocked.auth };
});

vi.mock("../../i18n/I18nProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/I18nProvider")>();
  return { ...actual, useI18n: () => ({ language: mocked.language, setLanguage: mocked.setLanguage }) };
});

vi.mock("../../auth/browserPasswordSave", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../auth/browserPasswordSave")>();
  return { ...actual, requestBrowserPasswordSave: mocked.requestBrowserPasswordSave };
});

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mocked.navigate,
    useSearchParams: () => [new URLSearchParams(), vi.fn()]
  };
});

import { AdminLoginPage } from "./AdminLoginPage";

describe("AdminLoginPage formal password surface", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocked.language = "en";
    mocked.auth.canAccess.mockReturnValue(false);
    mocked.auth.isAuthenticated = false;
    mocked.auth.session = null;
    window.localStorage.clear();
    window.localStorage.setItem(
      "needo.auth.remember-credentials.admin.admin",
      JSON.stringify({ account: "stored@example.com", enabled: true, password: "plain-password" })
    );
    window.localStorage.setItem(
      "needo.auth.remember-credentials.admin.merchant-admin",
      JSON.stringify({ account: "merchant@example.com", enabled: true, password: "merchant-password" })
    );
    window.localStorage.setItem("needo.auth.portal", "admin");

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await renderPortal("admin");
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function renderPortal(portal: AdminLoginPortal) {
    await act(async () => {
      root.render(createElement(AdminLoginPage, { portal }));
    });
  }

  function setInput(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function setBrowserAutofilledValue(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
  }

  it("keeps browser password saving opt-in", () => {
    const account = container.querySelector<HTMLInputElement>('input[placeholder="admin@example.com"]');
    const password = container.querySelector<HTMLInputElement>('input[type="password"]');

    expect(account?.value).toBe("");
    expect(account?.autocomplete).toBe("off");
    expect(password?.value).toBe("");
    expect(password?.autocomplete).toBe("off");
    expect(container.querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("false");
    expect(container.textContent).not.toContain("Remember account and password");
  });

  it.each([
    ["zh", "admin", "请使用运营后台"],
    ["zh", "merchant-admin", "请使用商户/店铺后台"],
    ["zh-Hant", "admin", "請使用營運後台"],
    ["zh-Hant", "merchant-admin", "請使用商戶／店鋪後台"],
    ["ja", "admin", "運営管理画面をご利用ください"],
    ["ja", "merchant-admin", "店舗管理画面をご利用ください"],
    ["en", "admin", "Please use Operations Admin"],
    ["en", "merchant-admin", "Please use Merchant / Store Admin"],
    ["ko", "admin", "운영 관리자 화면을 이용해 주세요"],
    ["ko", "merchant-admin", "가맹점/매장 관리자 화면을 이용해 주세요"]
  ] as const)("renders %s %s portal copy", async (language, portal, subtitle) => {
    mocked.language = language;
    await renderPortal(portal);

    expect(container.textContent).toContain(subtitle);
  });

  it("places the five-language selector beside the heading", async () => {
    const languageButton = container.querySelector<HTMLButtonElement>('button[aria-label="Language selector"]');

    expect(languageButton).not.toBeNull();
    await act(async () => languageButton?.click());
    const japanese = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')).find(
      (button) => button.textContent?.includes("日本語")
    );
    await act(async () => japanese?.click());

    expect(mocked.setLanguage).toHaveBeenCalledWith("ja");
  });

  it("persists only the backend portal preference and enables password-manager semantics", async () => {
    const toggle = container.querySelector<HTMLButtonElement>('[role="switch"]')!;

    await act(async () => toggle.click());

    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(window.localStorage.getItem("needo.auth.browser-password-save.backend:admin")).toBe("true");
    expect(container.querySelector<HTMLInputElement>('input[autocomplete="username"]')?.value).toBe("");
    expect(container.querySelector<HTMLInputElement>('input[autocomplete="current-password"]')?.value).toBe("");
  });

  it("exposes standard credential field names to the browser password manager", () => {
    expect(container.querySelector<HTMLInputElement>('input[name="username"]')?.name).toBe("username");
    expect(container.querySelector<HTMLInputElement>('input[type="password"]')?.name).toBe("password");
  });

  it("submits credentials filled by the browser without React input events", async () => {
    mocked.auth.loginWithFormalPassword.mockResolvedValue({
      ok: true,
      session: { portal: "admin" }
    });
    const account = container.querySelector<HTMLInputElement>('input[name="username"]')!;
    const password = container.querySelector<HTMLInputElement>('input[type="password"]')!;
    setBrowserAutofilledValue(account, "autofill-admin@example.com");
    setBrowserAutofilledValue(password, "Autofill.Admin.Password.2026");

    await act(async () => {
      container.querySelector<HTMLFormElement>("form")?.requestSubmit();
    });

    expect(mocked.auth.loginWithFormalPassword).toHaveBeenCalledWith(
      "admin",
      "autofill-admin@example.com",
      "Autofill.Admin.Password.2026"
    );
  });

  it("requests browser password storage only after a successful opted-in login", async () => {
    mocked.auth.loginWithFormalPassword.mockResolvedValue({
      ok: true,
      session: { portal: "admin" }
    });
    const toggle = container.querySelector<HTMLButtonElement>('[role="switch"]')!;
    await act(async () => toggle.click());
    const account = container.querySelector<HTMLInputElement>('input[autocomplete="username"]')!;
    const password = container.querySelector<HTMLInputElement>('input[autocomplete="current-password"]')!;
    setInput(account, "admin@lifedance.com");
    setInput(password, "Strong.Password.2026");

    await act(async () => {
      container.querySelector<HTMLFormElement>("form")?.requestSubmit();
    });

    expect(mocked.requestBrowserPasswordSave).toHaveBeenCalledWith({
      id: "admin@lifedance.com",
      name: "Operations Admin",
      password: "Strong.Password.2026"
    });
    expect(mocked.navigate).toHaveBeenCalledWith("/admin", { replace: true });
  });

  it("switches the active backend identity before continuing an existing merchant session", async () => {
    mocked.auth.canAccess.mockReturnValue(true);
    mocked.auth.isAuthenticated = true;
    mocked.auth.session = {
      email: "admin@lifedance.com",
      loginMethod: "password",
      portal: "admin"
    };
    mocked.auth.switchPortal.mockResolvedValue({
      ok: true,
      session: { portal: "merchant" }
    });
    await renderPortal("merchant-admin");

    const continueButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Enter Admin"
    );
    await act(async () => continueButton?.click());

    expect(mocked.auth.switchPortal).toHaveBeenCalledWith("merchant");
    expect(mocked.navigate).toHaveBeenCalledWith("/merchant-admin", { replace: true });
  });

  it("purges all legacy plaintext credential records while preserving unrelated auth storage", () => {
    expect(Object.keys(window.localStorage).filter((key) => key.startsWith("needo.auth.remember-credentials."))).toEqual([]);
    expect(window.localStorage.getItem("needo.auth.portal")).toBe("admin");
  });

  it("does not mount or retain an unsupported Gmail provider fallback", () => {
    expect(container.textContent).not.toContain("Continue with Gmail");
    expect(Array.from(container.querySelectorAll("button")).some((button) => button.textContent?.trim() === "G")).toBe(false);
    expect(adminLoginSource).not.toContain("loginWithProvider");
    expect(adminLoginSource).not.toContain("gmailEmail");
    expect(adminLoginSource).not.toContain("writeRememberedCredentials");
    expect(adminLoginSource).not.toContain("readRememberedCredentials");
  });
});
