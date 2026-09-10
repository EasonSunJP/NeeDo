import { describe, expect, it } from "vitest";
import routeSource from "./NeedoRoutePages.tsx?raw";
import detailSource from "../../features/exchange/ExchangePostDetailPage.tsx?raw";

describe("NeedoRoutePages", () => {
  it("keeps formal intelligence, demand, and claim content behind the glass header", () => {
    expect(routeSource).toContain("ExchangePostDetailPage");
    expect(detailSource).toContain('<MobileFullscreenPage innerClassName="client-glass-page-surface">');
    expect(detailSource).toContain("showSpacer={false}");
    expect(detailSource).toContain("pt-[calc(env(safe-area-inset-top)+86px)]");
    expect(detailSource).toContain("ExchangeClaimPanel");
    expect(detailSource).toContain("ExchangeReceivedClaims");
    expect(detailSource).not.toMatch(/findNeedoPost|getDemandDetail|localStorage|needoExchangeBridge|fakeBooking|fakePayment/u);
  });
});
