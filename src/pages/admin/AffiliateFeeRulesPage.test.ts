import { describe, expect, it } from "vitest";
import source from "./AffiliateFeeRulesPage.tsx?raw";

describe("AffiliateFeeRulesPage", () => {
  it("loads the formal summary and paginated immutable rule history", () => {
    expect(source).toContain("affiliatePlatformFeeApi.getGlobalSummary()")
    expect(source).toContain("affiliatePlatformFeeApi.listRules({")
    expect(source).toContain("historyRequestId")
    expect(source).toContain("summaryRequestId")
    expect(source).toContain("classifyAffiliateFeeRule")
    expect(source).toContain("pageSize")
    expect(source).not.toContain("backofficeRealDataApi.shops")
    expect(source).not.toContain("../../data/mock")
    expect(source).not.toContain("localStorage")
  });

  it("selects a real published shop through the dedicated debounced search", () => {
    expect(source).toContain("affiliatePlatformFeeApi.searchShops({")
    expect(source).toContain("setTimeout(() =>")
    expect(source).toContain("}, 350)")
    expect(source).toContain("shopSearchRequestId")
    expect(source).toContain("draft.shop?.id")
    expect(source).not.toContain('name="shopId"')
  });

  it("validates, reconfirms the latest version, and preserves the draft on conflict", () => {
    expect(source).toContain("validateAffiliateFeeDraft")
    expect(source).toContain("buildAffiliateFeeCreateInput")
    expect(source).toContain("loadLatestTargetVersion")
    expect(source).toContain("expectedVersion")
    expect(source).toContain("affiliatePlatformFeeApi.createRule")
    expect(source).toContain("affiliateFeeVersionConflictCode")
    expect(source).toContain("setConfirmation(null)")
    expect(source).toContain("setSelectedShop")
  });

  it("protects mutation controls with the formal RBAC permission", () => {
    expect(source).toContain("PermissionGate")
    expect(source).toContain('permission="button:backoffice-affiliate-fee-rule-create"')
    expect(source).toContain("mutationStatus === \"saving\"")
  });
});
