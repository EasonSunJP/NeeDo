// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import {
  MerchantMembershipMetricCard,
  MerchantShopSwitcher,
  shouldBlockMerchantDashboardForOwnerTransition,
  type MerchantShopSwitcherProps
} from "./MerchantAdminDashboardPage";
import source from "./MerchantAdminDashboardPage.tsx?raw";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("merchant unified data dashboard", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("needo.language", "zh");
    window.localStorage.setItem("needo.language.mode", "manual");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function renderSwitcher(props: MerchantShopSwitcherProps) {
    await act(async () => {
      root.render(createElement(I18nProvider, null, createElement(MerchantShopSwitcher, props)));
    });
    await settle();
  }

  it("renders ready member and utilizer facts without the obsolete unavailable status", async () => {
    await act(async () => {
      root.render(
        createElement(
          I18nProvider,
          null,
          createElement(MerchantMembershipMetricCard, {
            membership: {
              memberCount: 12,
              memberDataStatus: "ready",
              completedCustomerCount: 7
            }
          })
        )
      );
    });
    await settle();

    expect(container.textContent).toContain("会员数");
    expect(container.textContent).toContain("12");
    expect(container.textContent).toContain("利用者数");
    expect(container.textContent).toContain("7");
    expect(container.textContent).not.toContain("会员功能尚未开放");
  });

  it("renders the final named contract without legacy previews or browser derivation", () => {
    expect(source).toContain("DashboardFilterBar");
    expect(source).toContain("dashboard.summary.availableScheduleSlots");
    expect(source).toContain("dashboard.summary.activeTechnicians");
    expect(source).toContain("dashboard.summary.registeredTechnicians");
    expect(source).toContain("membership?.memberCount");
    expect(source).toContain("membership.completedCustomerCount");
    expect(source).toContain("dashboard.series.buckets");
    expect(source).toContain('key: "shopEstimatedGrossProfitJpy"');
    expect(source).toContain('key: "scheduleTotalHours"');
    expect(source).toContain("const cost = dashboard.finance.shopNdpCost");
    expect(source).toContain("formatDashboardNumber(cost.totalNdp, language)");
    expect(source).toContain("dashboard.finance.frozen.ndp");
    expect(source).not.toContain("mapBackofficeOrder");
    expect(source).not.toContain("DataTable");
    expect(source).not.toContain("dashboard.orders");
    expect(source).not.toContain("dashboard.technicians");
    expect(source).not.toContain("../../data/mock");
    expect(source).not.toContain("尚未启用的商户模块");
  });

  it("uses the ready formal member count and exposes the real completed-customer count", () => {
    expect(source).toContain('title={t("会员数")}');
    expect(source).toContain('label: t("利用者数")');
    expect(source).toContain("value={membership?.memberCount}");
    expect(source).toContain("statusMessage={membership ? undefined");
  });

  it("freezes stale owner data only while loading and exposes retry after a switch-load failure", () => {
    expect(
      shouldBlockMerchantDashboardForOwnerTransition("loading", null, true)
    ).toBe(true);
    expect(
      shouldBlockMerchantDashboardForOwnerTransition("error", null, true)
    ).toBe(false);
    expect(source).toContain('t("以下仍显示上次成功结果")');
    expect(source).toContain('t("重新加载数据大盘")');
    expect(source).toContain("{ownerSwitchPending ? (");
  });

  it("keeps shop billing and wallet values server-authored", () => {
    expect(source).toContain("dashboard.shop.billing");
    expect(source).toContain("dashboard.shop.wallet.availableBalance");
    expect(source).toContain("dashboard.shop.wallet.frozenBalance");
    expect(source).toContain('dashboard.shop.wallet.status === "not_opened"');
    expect(source).toContain("formatBillingAccountLabel");
  });

  it("loads paginated manageable shops, shows the control only for total greater than one, and restores focus on Escape", async () => {
    const loadPage = vi.fn(async (page: number) => ({
      list:
        page === 1
          ? [
              {
                publicId: "shop0000000001",
                name: "Shop A",
                city: "Tokyo",
                status: "active",
                selected: true
              }
            ]
          : [
              {
                publicId: "shop0000000002",
                name: "Shop B",
                city: "Osaka",
                status: "active",
                selected: false
              }
            ],
      page,
      page_size: 1,
      total: 2
    }));

    await renderSwitcher({
      currentShopPublicId: "shop0000000001",
      loadPage,
      onSwitch: vi.fn()
    });

    const trigger = container.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]');
    expect(trigger).not.toBeNull();
    await act(async () => trigger?.click());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    const loadMore = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("加载更多")
    );
    await act(async () => loadMore?.click());
    await settle();
    expect(loadPage).toHaveBeenNthCalledWith(
      2,
      2,
      20,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(container.textContent).toContain("Shop B");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await settle();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("preserves the current shop and reports a failed token rotation", async () => {
    const onSwitch = vi.fn(async () => ({
      ok: false as const,
      message: "error.auth.shop_forbidden"
    }));
    await renderSwitcher({
      currentShopPublicId: "shop0000000001",
      loadPage: vi.fn(async () => ({
        list: [
          {
            publicId: "shop0000000001",
            name: "Shop A",
            city: "Tokyo",
            status: "active",
            selected: true
          },
          {
            publicId: "shop0000000002",
            name: "Shop B",
            city: "Osaka",
            status: "active",
            selected: false
          }
        ],
        page: 1,
        page_size: 20,
        total: 2
      })),
      onSwitch
    });

    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]')?.click()
    );
    const target = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("Shop B")
    );
    await act(async () => target?.click());
    await settle();

    expect(onSwitch).toHaveBeenCalledWith("shop0000000002");
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("店铺切换失败");
    expect(container.textContent).toContain("Shop A");
  });
});
