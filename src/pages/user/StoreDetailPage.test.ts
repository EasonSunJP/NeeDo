import { describe, expect, it } from "vitest";
import pageSource from "./StoreDetailPage.tsx?raw";

describe("StoreDetailPage routed booking defaults", () => {
  it("keeps technician and schedule query defaults when opening checkout", () => {
    expect(pageSource).toContain("useSearchParams");
    expect(pageSource).toContain('searchParams.get("technician")');
    expect(pageSource).toContain("routedBookingTechnician");
    expect(pageSource).toContain("buildStoreCheckoutRoute");
    expect(pageSource).toContain("指名");
  });
});
