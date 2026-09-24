// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicPlatformSettings } from "../../features/platform-settings/types";
import type { WalletSummary } from "../../features/wallet/api";
import { ClientThemeProvider } from "../../theme/ClientThemeProvider";
import pageSource from "./UserPaymentMethodsPage.tsx?raw";
import { UserPaymentMethodsPage } from "./UserPaymentMethodsPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  getMyWalletSummary: vi.fn(),
  platform: {
    reload: vi.fn(),
    settings: {} as PublicPlatformSettings,
    status: "ready" as "loading" | "ready" | "error",
  },
}));

vi.mock("../../features/platform-settings/PlatformSettingsProvider", () => ({
  usePlatformSettings: () => mocks.platform,
}));

vi.mock("../../features/wallet/api", () => ({
  walletApi: { getMyWalletSummary: mocks.getMyWalletSummary },
}));

vi.mock("../../i18n/I18nProvider", () => ({
  useI18n: () => ({ language: "zh" }),
}));

const settings = (paymentMethods: Array<"cash" | "ndp">): PublicPlatformSettings => ({
  version: 7,
  siteEnabled: true,
  selfRegistrationEnabled: true,
  loginMethods: { password: true, google: false },
  loginLogo: null,
  requestButton: null,
  paymentMethods,
  membershipCardFollowUiTheme: true,
});

const wallet = (activeCurrency: WalletSummary["activeCurrency"]): WalletSummary => ({
  activeCurrency,
  hasTestNdpWallet: activeCurrency === "TEST_NDP",
  ndp: { available: activeCurrency === "NDP" ? 800 : 0, frozen: 0 },
  testNdp: { available: activeCurrency === "TEST_NDP" ? 800 : 0, frozen: 0 },
});

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("UserPaymentMethodsPage", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    root = createRoot(host);
    mocks.platform.settings = settings(["cash", "ndp"]);
    mocks.platform.status = "ready";
    mocks.platform.reload.mockReset();
    mocks.getMyWalletSummary.mockReset().mockResolvedValue(wallet("TEST_NDP"));
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.restoreAllMocks();
  });

  async function renderPage() {
    await act(async () => {
      root.render(
        createElement(
          ClientThemeProvider,
          null,
          createElement(MemoryRouter, null, createElement(UserPaymentMethodsPage)),
        ),
      );
    });
    await flushEffects();
  }

  it("marks only server-enabled cash and the account wallet currency as available", async () => {
    await renderPage();

    expect(host.querySelector('[data-testid="payment-method-cash"]')?.textContent).toContain("已可用");
    expect(host.querySelector('[data-testid="payment-method-ndp"]')?.textContent).toContain("Test NDP");
    expect(host.querySelector('[data-testid="payment-method-ndp"]')?.textContent).toContain("已可用");
    for (const code of ["card", "paypay", "paypal"]) {
      const row = host.querySelector(`[data-testid="payment-method-${code}"]`);
      expect(row?.textContent).toContain("未接入");
      expect(row?.getAttribute("aria-disabled")).toBe("true");
      expect(row?.getAttribute("role")).toBe("button");
    }
    expect(host.querySelector('[data-testid="payment-method-card"]')?.textContent).toContain("在线支付（Stripe）");
    await act(async () => {
      (host.querySelector('[data-testid="payment-method-paypay"]') as HTMLElement).click();
    });
    expect(host.querySelector('[role="status"]')?.textContent).toBe("目前此支付方式暂不可用");
    expect(host.textContent).not.toContain("未绑定");
  });

  it("fails closed when a supported method is disabled or its account state cannot be loaded", async () => {
    mocks.platform.settings = settings(["cash"]);
    mocks.getMyWalletSummary.mockRejectedValueOnce(new Error("offline"));

    await renderPage();

    expect(host.querySelector('[data-testid="payment-method-cash"]')?.textContent).toContain("已可用");
    expect(host.querySelector('[data-testid="payment-method-ndp"]')?.textContent).toContain("暂不可用");
    expect(host.querySelector('[data-testid="payment-method-ndp"]')?.textContent).not.toContain("已可用");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("支付状态读取失败");
  });

  it("does not mark any supported method available when platform configuration fails", async () => {
    mocks.platform.status = "error";
    mocks.platform.settings = settings([]);

    await renderPage();

    expect(host.querySelector('[data-testid="payment-method-cash"]')?.textContent).toContain("暂不可用");
    expect(host.querySelector('[data-testid="payment-method-ndp"]')?.textContent).toContain("暂不可用");
  });

  it("reloads formal platform and wallet state without persisting a local success flag", async () => {
    mocks.getMyWalletSummary
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(wallet("NDP"));
    await renderPage();

    const retry = Array.from(host.querySelectorAll("button")).find((button) => button.textContent === "重试");
    expect(retry).toBeDefined();
    await act(async () => {
      retry?.click();
    });
    await flushEffects();

    expect(mocks.platform.reload).toHaveBeenCalledTimes(1);
    expect(mocks.getMyWalletSummary).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[data-testid="payment-method-ndp"]')?.textContent).toContain("NDP");
    expect(host.querySelector('[data-testid="payment-method-ndp"]')?.textContent).toContain("已可用");
    expect(pageSource).not.toMatch(/localStorage|sessionStorage/u);
  });

  it("has no fixed service, checkout, settlement, binding, selection, or payment jump", () => {
    expect(pageSource).not.toMatch(/\/checkout|\/orders|serviceId|settlement/u);
    expect(pageSource).not.toMatch(/绑定银行卡|立即绑定|选择支付|立即支付/u);
  });
});
