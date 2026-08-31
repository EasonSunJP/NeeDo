import { describe, expect, it, vi } from "vitest";
import type { BackofficeDashboardPayload } from "../../api/backofficeRealData";
import {
  readOwnedDashboardPayload,
  resolveOwnedDashboardAfterFailure,
  resolveSelectedManageableShop
} from "./MerchantAdminLayout";
import source from "./MerchantAdminLayout.tsx?raw";

describe("MerchantAdminLayout formal shop summary", () => {
  it("does not render the obstructive bottom-left store notice", () => {
    expect(source).not.toContain("本店经营提醒");
    expect(source).not.toContain("高频入口只保留本店自己能处理的事务，不显示平台运营后台模块。");
    expect(source).not.toContain("admin-sidebar-note");
  });

  it("does not render the shared merchant shell from demo data", () => {
    expect(source).not.toContain("merchantAdminDemo");
    expect(source).not.toContain("store-admin@needo.jp");
    expect(source).not.toContain("merchantAdminDemo.orders.reduce");
  });

  it("loads shop identity and operating totals from the scoped dashboard", () => {
    expect(source).toContain("loadMerchantAdminDashboard");
    expect(source).not.toContain('backofficeRealDataApi.dashboard("merchant-admin")');
    expect(source).toContain("readOwnedDashboardPayload(ownedDashboard, dashboardOwnerKey)");
    expect(source).toContain("dashboard.summary.pendingOrders");
    expect(source).toContain("dashboard.summary.serviceGmvJpy");
    expect(source).not.toContain("dashboard.orders");
    expect(source).not.toContain("dashboard.shops");
    expect(source).not.toContain("dashboard.finance.estimatedServiceGmvJpy");
    expect(source).toContain("session?.avatarUrl");
    expect(source).toContain("服务 GMV");
  });

  it("keys and loads the resource from authenticated merchant scope with an explicit query", () => {
    expect(source).toContain("userId: session.id");
    expect(source).toContain("identityId: session.currentIdentity.id");
    expect(source).toContain("shopPublicId: resolvedShopPublicId");
    expect(source).toContain("credentialEpoch");
    expect(source).not.toContain("unselected");
    expect(source).not.toContain('readOnlyPreview?.selectedShopId ?? "current-shop"');
    expect(source).not.toContain('session?.loggedInAt ?? "no-session"');
    expect(source).toContain('period: "last7days"');
    expect(source).toContain("loadMerchantAdminDashboard(dashboardOwner, dashboardQuery)");
    expect(source).toContain("invalidateMerchantAdminDashboard(dashboardOwner, dashboardQuery)");
    expect(source).toContain("invalidateMerchantAdminDashboardOwner(dashboardOwner)");
  });

  it("resolves a server-confirmed selected shop before requesting or caching dashboard data", () => {
    expect(source).toContain("session?.merchantShopPublicId");
    expect(source).toContain("resolvedShop?.ownerKey === shopResolutionOwnerKey");
    expect(source).toContain("subscribeAuthCredentialSnapshot");
    expect(source).toContain("useSyncExternalStore");
    expect(source).toContain("resolveSelectedManageableShop(controller.signal)");
    expect(source).toContain("controller.abort()");
    expect(source).toContain(
      "const totalPages = Math.ceil(manageable.total / manageable.page_size)"
    );
    expect(source).toContain("if (page >= totalPages)");
    expect(source).toContain("manageable.list.find((shop) => shop.selected)");
    expect(source).toContain("if (!dashboardOwner)");
    expect(source.indexOf("manageableMerchantShops")).toBeLessThan(
      source.indexOf("loadMerchantAdminDashboard(dashboardOwner")
    );
  });

  it("hides owner A's resolved payload synchronously while owner B is pending", () => {
    const payload = { shop: { name: "Shop A" } } as BackofficeDashboardPayload;
    const owned = { ownerKey: "owner-a", payload };

    expect(readOwnedDashboardPayload(owned, "owner-a")).toBe(payload);
    expect(readOwnedDashboardPayload(owned, "owner-b")).toBeNull();
  });

  it("keeps the last successful payload after a same-shop query failure but clears an old shop owner", () => {
    const payload = { shop: { name: "Shop A" } } as BackofficeDashboardPayload;
    const owned = { ownerKey: "owner-a", payload };

    expect(resolveOwnedDashboardAfterFailure(owned, "owner-a")).toBe(owned);
    expect(resolveOwnedDashboardAfterFailure(owned, "owner-b")).toBeNull();
  });

  it("scans bounded manageable pages and finds a server-selected shop on page two", async () => {
    const loadPage = vi.fn(async (page: number) => ({
      list:
        page === 2
          ? [
              {
                publicId: "shop0000000012",
                name: "Shop B",
                city: "Tokyo",
                status: "active",
                selected: true
              }
            ]
          : [],
      total: 101,
      page,
      page_size: 100
    }));

    await expect(
      resolveSelectedManageableShop(new AbortController().signal, loadPage)
    ).resolves.toMatchObject({ publicId: "shop0000000012", selected: true });
    expect(loadPage).toHaveBeenCalledTimes(2);
  });

  it("aborts manageable scanning when the layout owner changes", async () => {
    const controller = new AbortController();
    const loadPage = vi.fn(
      (_page: number, _pageSize: number, options?: { signal?: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        })
    );

    const resolving = resolveSelectedManageableShop(controller.signal, loadPage);
    controller.abort();

    await expect(resolving).rejects.toMatchObject({ name: "AbortError" });
    expect(loadPage.mock.calls[0]?.[2]?.signal).toBe(controller.signal);
  });

  it("keeps loading and retryable failure evidence visible", () => {
    expect(source).toContain("正在加载正式店铺资料");
    expect(source).toContain("店铺摘要加载失败");
    expect(source).toContain("重新加载店铺摘要");
    expect(source).toContain("invalidateMerchantAdminDashboard");
  });

  it("shares the scoped dashboard state with data pages instead of making them reload it", () => {
    expect(source).toContain("MerchantAdminDashboardResource");
    expect(source).toContain('typeof children === "function"');
    expect(source).toContain("children(dashboardResource)");
    expect(source).toContain("query: dashboardQuery");
    expect(source).toContain("setQuery: setDashboardQuery");
  });

  it("keeps exactly one merchant data dashboard navigation item", () => {
    const oldAnalyticsPath = ["/merchant-admin", "analytics"].join("/");
    const oldAnalyticsLabel = ["数据", "经营驾驶舱"].join(" / ");
    const oldOverviewLabel = ["门店", "总览"].join("");
    expect(source).toContain('label: "数据大盘"');
    expect(source.match(/label: "数据大盘"/g)).toHaveLength(1);
    expect(source).not.toContain(`to: "${oldAnalyticsPath}"`);
    expect(source).not.toContain(oldAnalyticsLabel);
    expect(source).not.toContain(oldOverviewLabel);
  });

  it("shows the operations preview banner, shop selector, and explicit return action", () => {
    expect(source).toContain("只读代看");
    expect(source).toContain("切换查看店铺");
    expect(source).toContain("退出只读代看");
    expect(source).toContain("setMerchantAdminPreviewShop");
    expect(source).toContain("clearMerchantAdminPreview");
  });

  it("reloads the active merchant page after a group preview shop changes", () => {
    expect(source).toContain("setMerchantAdminPreviewShop(shopId)");
    expect(source).toContain("navigate(0)");
  });

  it("does not expose the removed merchant UI decoration module", () => {
    expect(source).not.toContain('key: "design"');
    expect(source).not.toContain('title: "UI装修"');
    expect(source).not.toContain('to: "/merchant-admin/design"');
    expect(source).not.toContain('to: "/merchant-admin/design?module=cards"');
  });

  it("uses independent employee and user management navigation sections", () => {
    expect(source).toContain('key: "staff"');
    expect(source).toContain('title: "员工管理"');
    expect(source).toContain('key: "users"');
    expect(source).toContain('title: "用户管理"');
    expect(source).toContain('to: "/merchant-admin/people?module=users"');
    expect(source).not.toContain('title: "人员与顾客"');
    expect(source).not.toContain("module=customers");
    expect(source).toContain('children: ["预约处理", "改期", "联系用户"]');
    expect(source.match(/placeholder="搜索订单、用户、员工/g)?.length).toBe(2);
    expect(source).not.toContain("联系顾客");
    expect(source).not.toContain("搜索订单、顾客");
  });
});
