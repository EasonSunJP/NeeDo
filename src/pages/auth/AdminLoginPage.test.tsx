// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    session: null
  },
  navigate: vi.fn()
}));

vi.mock("../../auth/AuthProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../auth/AuthProvider")>();
  return { ...actual, useAuth: () => mocked.auth };
});

vi.mock("../../i18n/I18nProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/I18nProvider")>();
  return { ...actual, useI18n: () => ({ language: "en" as const, setLanguage: vi.fn() }) };
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
    await act(async () => {
      root.render(createElement(AdminLoginPage, { portal: "admin" }));
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("mounts only browser-managed username and current-password inputs", () => {
    const username = container.querySelector<HTMLInputElement>('input[autocomplete="username"]');
    const password = container.querySelector<HTMLInputElement>('input[autocomplete="current-password"]');

    expect(username?.value).toBe("admin");
    expect(password?.value).toBe("");
    expect(container.querySelector('[role="switch"]')).toBeNull();
    expect(container.textContent).not.toContain("Remember account and password");
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
