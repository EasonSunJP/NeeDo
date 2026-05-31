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

  it("keeps order IDs below the provider photo and reuses recommendation card share controls", () => {
    expect(source).toContain("absolute left-3.5 bottom-3 z-30 max-w-36 truncate text-[9px] font-normal");
    expect(source).not.toContain("absolute left-4 top-3 z-30");
    expect(source).not.toContain("max-w-[130px] truncate text-[10px] font-black");
    expect(source).toContain("<SocialProfileMiniCard showShareAction store={provider.store} {...sharedProps} />");
    expect(source).toContain("<SocialProfileMiniCard showShareAction technician={provider.technician} {...sharedProps} />");
  });

  it("does not let an empty dev API response or stale delete cache hide legacy appointments", () => {
    expect(source).toContain('const shouldUseLegacyOrderFallback = import.meta.env.DEV || import.meta.env.VITE_NEEDO_STATIC_DEMO === "true";');
    expect(source).toContain("apiOrders && (apiOrders.length > 0 || !shouldUseLegacyOrderFallback) ? apiOrders : localOrders");
    expect(source).toContain("hasDeletedOrderInSessionRef");
    expect(source).toContain("visibleOrders.length === 0");
    expect(source).toContain("setDeletedOrderIds([]);");
  });
});
