import { describe, expect, it } from "vitest";
import serviceDetailSource from "./ServiceDetailPage.tsx?raw";

describe("ServiceDetailPage formal service routes", () => {
  it("rejects nonnumeric legacy service IDs", () => {
    expect(serviceDetailSource).not.toContain("data/mock");
    expect(serviceDetailSource).toContain("if (!apiId)");
    expect(serviceDetailSource).toContain("serviceQuery.data ? mapCoreServiceToServiceItem(serviceQuery.data) : null");
    expect(serviceDetailSource).toContain("服务链接不可用");
  });
});
