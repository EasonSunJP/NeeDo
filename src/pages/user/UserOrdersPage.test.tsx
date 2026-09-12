import { describe, expect, it } from "vitest";
import source from "./UserOrdersPage.tsx?raw";

describe("UserOrdersPage", () => {
  it("lets the appointment list content sit behind the glass header", () => {
    expect(source).toContain('<MobileFullscreenPage innerClassName="client-glass-page-surface">');
    expect(source).toContain('className={cn(fullscreenHeaderClassName, "needo-orders-glass-header")}');
    expect(source).toContain("onClose={closePage}");
    expect(source).toContain("showSpacer={false}");
    expect(source).toContain("pt-[calc(env(safe-area-inset-top)+86px)]");
  });

  it("keeps formal provider, service, amount, and order identity together", () => {
    expect(source).toContain("<OrderProviderInfoCard order={order} />");
    expect(source).toContain("{order.itemName}");
    expect(source).toContain("{yen(order.amount)}");
    expect(source).toContain("{order.orderNo}");
    expect(source).toContain("getProviderDetailPath(order)");
  });

  it("uses only the formal order API and exposes loading, failure, retry, and empty states", () => {
    expect(source).toContain("bookingApi.listOrders");
    expect(source).toContain("useCoreReadQuery");
    expect(source).toContain('key: "booking:customer-orders:page-1:size-100"');
    expect(source).toContain("getAuthenticatedPersistentCacheScope");
    expect(source).toContain("重新加载预约");
    expect(source).toContain("预约加载失败");
    expect(source).toContain("正在加载预约");
    expect(source).not.toContain("../../data/mock");
    expect(source).not.toContain("useUserOrders");
    expect(source).not.toContain("needo.user.orders.deleted");
    expect(source).not.toContain("orderServiceSessionStore");
    expect(source).not.toContain("删除订单");
  });

  it("uses the server-authoritative rebook decision and exposes the stopped-service notice", () => {
    expect(source).toContain("getRebookAction(order.rebook)");
    expect(source).toContain("{rebook.notice}");
    expect(source).toContain("aria-disabled");
  });
});
