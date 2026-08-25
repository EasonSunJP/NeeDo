import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./MerchantAdminPeoplePage.tsx", import.meta.url), "utf8");

describe("MerchantAdminPeoplePage formal scoped data", () => {
  it("uses server-paginated shop-scoped technicians and customers directly", () => {
    expect(source).toContain('backofficeRealDataApi.technicians("merchant-admin"');
    expect(source).toContain('backofficeRealDataApi.customers("merchant-admin"');
    expect(source).toContain("pageSize");
    expect(source).toContain("keyword:");
    expect(source).not.toContain("CustomerManagementModule");
    expect(source).not.toContain("TechnicianListModule");
    expect(source).not.toContain("mapCustomer");
    expect(source).not.toContain("mapBackofficeOrder");
  });

  it("keeps supported technician mutations on audited merchant endpoints", () => {
    expect(source).toContain('backofficeRealDataApi.updateTechnician("merchant-admin"');
    expect(source).toContain('backofficeRealDataApi.approveTechnician("merchant-admin"');
    expect(source).toContain('backofficeRealDataApi.deleteTechnician("merchant-admin"');
    expect(source).toContain("再次点击确认审核技师");
    expect(source).toContain("再次点击确认移除技师");
  });

  it("loads formal selected profiles into the shared detail panels", () => {
    expect(source).toContain('backofficeRealDataApi.technician("merchant-admin"');
    expect(source).toContain('backofficeRealDataApi.customer("merchant-admin"');
    expect(source).toContain("FormalTechnicianDetailPanel");
    expect(source).toContain("FormalCustomerDetailPanel");
    expect(source).toContain("selectedTechnicianId");
    expect(source).toContain("selectedCustomerId");
    expect(source).toContain("重试");
  });

  it("protects both formal detail requests from stale responses and refreshes after writes", () => {
    expect(source).toContain("technicianDetailRequestRef");
    expect(source).toContain("customerDetailRequestRef");
    expect(source).toContain("mountedRef.current");
    expect(source).toContain("await load();");
    expect(source).toContain("await loadTechnicianDetail(");
  });

  it("does not invent reviews or customer analytics", () => {
    expect(source).not.toContain("LTV");
    expect(source).not.toContain("churnRisk");
    expect(source).not.toContain("activeScore");
    expect(source).not.toContain("../../data/mock");
    expect(source).toContain("正式评价功能尚未启用");
    expect(source).toContain("当前不会展示模拟评价、评分或回复操作");
  });
});
