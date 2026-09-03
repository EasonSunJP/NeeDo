import { describe, expect, it } from "vitest";
import source from "./MerchantOrderRoutePages.tsx?raw";

describe("MerchantOrderRoutePages service cards", () => {
  it("uses the unified service card for detail, selection, and dispatch wrappers", () => {
    expect(source).toContain("UnifiedServiceInfoCard");
    expect(source).toContain("mapServiceItemToUnifiedData");
    expect(source).toContain("buildOrderServiceMiniCardData(order)");
    expect(source).toContain("actionSlot={<DispatchStatusBadge");
    expect(source).toContain("selectServicePackage(selection)");
  });

  it("does not manufacture unavailable order service facts", () => {
    expect(source).toContain("usageCount: formalData?.usageCount ?? null");
    expect(source).toContain("shopPublicId: formalData?.shopPublicId ?? null");
    expect(source).toContain("shopAddress: formalData?.shopAddress ?? null");
    expect(source).not.toMatch(/usageCount\s*:\s*[^\n]*\.sales/u);
    expect(source).not.toContain("buildServiceMiniCardData");
  });

  it("keeps persisted legacy duration ahead of current service metadata and never invents scenario duration", () => {
    const start = source.indexOf("function buildOrderServiceCardData");
    const end = source.indexOf("function buildUnassignedStaffCardData", start);
    const cardBuilder = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(cardBuilder).toContain("snapshotData.durationMinutes ?? formalData?.durationMinutes");
    expect(cardBuilder).not.toMatch(/scenario === "restaurant" \? 120 : 90/u);
    expect(cardBuilder).not.toMatch(/scenario === "restaurant" \? "2 小时" : "90 分钟"/u);
  });
});
