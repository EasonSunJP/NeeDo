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

  it("opens the assigned technician through the canonical merchant-scoped profile path", () => {
    expect(source).toContain('getScopedTechnicianDynamicPath("merchant", technician)');
    expect(source).not.toContain(
      'getScopedProfileDetailPath("merchant", "technician", technician.id)'
    );
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

  it("uses the user booking-detail scaffold and shared sections for formal merchant orders", () => {
    const start = source.indexOf("function FormalMerchantOrderDetailContent");
    const end = source.indexOf("function MerchantOrderDetailContent", start);
    const formalDetail = source.slice(start, end);

    expect(formalDetail).toContain("<PageScaffold");
    expect(formalDetail).toContain("<AppTopBar");
    expect(formalDetail).toContain('title="预约详情"');
    expect(formalDetail).toContain("<OrderDynamicStatusCard");
    expect(formalDetail).toContain("<OrderDetailSection");
    expect(formalDetail).toContain("<OrderDetailFactGrid");
    expect(formalDetail).toContain("<DangerConfirmDialog");
    expect(formalDetail).toContain("联系用户");
    expect(formalDetail).toContain("联系技师");
    expect(formalDetail).toContain('detailTo={`/merchant/stores/${store.id}`}');
    expect(formalDetail).not.toContain("服务验证码");
    expect(formalDetail).not.toContain("服务开始");
    expect(formalDetail).not.toContain(">追加服务</button>");
  });
});
