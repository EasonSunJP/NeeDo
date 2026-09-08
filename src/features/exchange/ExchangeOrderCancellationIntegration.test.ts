import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("Exchange bilateral cancellation UI integration", () => {
  it("reuses the formal cancellation panel in both Exchange participant surfaces", () => {
    const ownerSource = read("./ExchangeReceivedClaims.tsx");
    const providerSource = read("./ExchangeMatchedBookingCard.tsx");

    expect(ownerSource).toContain("<ExchangeOrderCancellationPanel");
    expect(providerSource).toContain("<ExchangeOrderCancellationPanel");
  });

  it("replaces generic cancellation for linked customer and technician orders", () => {
    const customerSource = read("../../pages/user/UserOrderDetailPage.tsx");
    const technicianSource = read("../technician-schedule/route-pages.tsx");

    expect(customerSource).toContain("exchangeOrderLinked === false && canCancel");
    expect(technicianSource).toContain("exchangeOrderLinked === false && canCancel");
    expect(customerSource).toContain("<ExchangeOrderCancellationPanel");
    expect(technicianSource).toContain("<ExchangeOrderCancellationPanel");
  });

  it("exposes the same formal state in the merchant order detail", () => {
    const merchantSource = read("../../pages/mobile/MerchantOrderRoutePages.tsx");

    expect(merchantSource).toContain("<ExchangeOrderCancellationPanel");
  });
});
