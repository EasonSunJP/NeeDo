import { describe, expect, it } from "vitest";
import serviceDetailSource from "./ServiceDetailPage.tsx?raw";

describe("ServiceDetailPage legacy service routes", () => {
  it("opens legacy recommendation service IDs instead of showing the unavailable-link state", () => {
    expect(serviceDetailSource).toContain('services as legacyServices');
    expect(serviceDetailSource).toContain("legacyServices.find((item) => item.id === id) ?? null");
    expect(serviceDetailSource).toContain("serviceQuery.data ? mapCoreServiceToServiceItem(serviceQuery.data) : legacyService");
    expect(serviceDetailSource).not.toContain("服务链接不可用");
  });
});
