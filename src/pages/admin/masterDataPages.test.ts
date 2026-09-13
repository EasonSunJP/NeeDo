import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("master data pages", () => {
  it("uses formal shop, service, and category APIs without mock imports", () => {
    const source = read("./MerchantsPage.tsx");
    expect(source).not.toContain("../../data/mock");
    expect(source).toContain("backofficeRealDataApi.createShop");
    expect(source).toContain("backofficeRealDataApi.approveShop");
    expect(source).toContain("backofficeRealDataApi.services");
    expect(source).toContain("backofficeRealDataApi.createService");
    expect(source).toContain("backofficeRealDataApi.updateService");
    expect(source).toContain("coreReadApi.listCategories");
  });

  it("shows formal merchant SaaS account type, payment mode, and monthly fee controls", () => {
    const pageSource = read("./MerchantsPage.tsx");
    const collectionSource = read("../../components/admin/MerchantAccountCollection.tsx");
    const cardSource = read("../../components/admin/MerchantBillingCard.tsx");

    expect(pageSource).toContain("merchantSaasBillingApi.listAccounts");
    expect(pageSource).toContain("MerchantAccountCollection");
    expect(pageSource).toContain("refreshMerchantAccountCard");
    expect(collectionSource).toContain("MerchantBillingCard");
    expect(collectionSource).toContain("expandedGroups");
    expect(cardSource).toContain("账号类型");
    expect(cardSource).toContain("付费模式");
    expect(cardSource).toContain("月费");
    expect(cardSource).toContain("onEditBilling");
    expect(cardSource).toContain("切换到商户后台");
    expect(cardSource).toContain("onOpenMerchantAdminPreview");
    expect(pageSource).toContain("startMerchantAdminPreview");
  });

  it("keeps the technician page on persisted technician and shop records only", () => {
    const source = read("./TechniciansPage.tsx");
    expect(source).not.toContain("../../data/mock");
    expect(source).not.toContain("virtualSeeds");
    expect(source).not.toContain("TechnicianProfilePanel");
    expect(source).toContain("backofficeRealDataApi.approveTechnician");
    expect(source).toContain("backofficeRealDataApi.updateTechnician");
    expect(source).toContain('backofficeRealDataApi.technician("backoffice"');
    expect(source).toContain("FormalTechnicianDetailPanel");
    expect(source).toContain("createFormalDetailRequestCoordinator");
    expect(source).toContain("runFormalDetailMutationSequence");
    expect(source).toContain("technicianDetailRequest.retry()");
    expect(source).toContain("technicianDetailRequest.activate()");
    expect(source).toContain("useOptionalI18n");
    expect(source).not.toContain("DetailGrid");
    expect(source).toMatch(
      /const deleteTechnician[\s\S]*?closeTechnician\(\);[\s\S]*?await load\(\);/,
    );
  });

  it("labels the legacy shop field as display-only and points operators to formal approval", () => {
    const techniciansPageSource = read("./TechniciansPage.tsx");
    expect(techniciansPageSource).toContain("主展示店铺（不建立合作关系）");
    expect(techniciansPageSource).toContain("正式合作绑定需由目标店铺在技师申请审核中批准");
  });

  it("renders a complete formal technician ranking for module=ranking", () => {
    const pageSource = read("./TechniciansPage.tsx");
    const rankingSource = read(
      "../../components/admin/TechnicianRankingModule.tsx",
    );

    expect(pageSource).toContain('searchParams.get("module") === "ranking"');
    expect(pageSource).toContain("TechnicianRankingModule");
    expect(pageSource).toContain("openRankingTechnician");
    expect(rankingSource).toMatch(
      /backofficeRealDataApi\s*\.\s*technicianRankings/,
    );
    expect(rankingSource).toContain(
      "backofficeRealDataApi.exportTechnicianRankings",
    );
    expect(rankingSource).toContain("downloadCsvExport");
    expect(rankingSource).toContain('key: "month"');
    expect(rankingSource).toContain('key: "today"');
    expect(rankingSource).toContain('key: "last7days"');
    expect(rankingSource).toContain('key: "last30days"');
    expect(rankingSource).toContain('key: "custom"');
    expect(rankingSource).toContain('key: "all"');
    expect(rankingSource).toContain("已完成订单服务金额");
    expect(rankingSource).toContain("已完成订单数");
    expect(rankingSource).toContain("工作天数");
    expect(rankingSource).toContain("加钟金额计入原订单服务金额");
    expect(rankingSource).toContain("同一订单加钟仍计为 1 单");
    expect(rankingSource).toContain("至少完成 1 单计为 1 天");
    expect(rankingSource).toContain("page_size");
    expect(rankingSource).not.toContain("../../data/mock");
  });

  it("keeps operations customer profiles on formal paginated APIs", () => {
    const source = read("./UsersPage.tsx");
    expect(source).toContain('backofficeRealDataApi.customers("backoffice"');
    expect(source).toContain("backofficeRealDataApi.updateCustomer(");
    expect(source).toContain("backofficeRealDataApi.deleteCustomer(");
    expect(source).toContain('backofficeRealDataApi.customer("backoffice"');
    expect(source).toContain("FormalCustomerDetailPanel");
    expect(source).toContain("createFormalDetailRequestCoordinator");
    expect(source).toContain("runFormalDetailMutationSequence");
    expect(source).toContain("customerDetailRequest.retry()");
    expect(source).toContain("customerDetailRequest.activate()");
    expect(source).toContain("useOptionalI18n");
    expect(source).not.toContain("DetailGrid");
    expect(source).toMatch(
      /const deleteCustomer[\s\S]*?closeCustomer\(\);[\s\S]*?await load\(\);/,
    );
    expect(source).not.toContain("../../data/mock");
  });

  it("uses merchant-scoped customers and NeeDoID employees without merchant demo data", () => {
    const source = read("../merchant-admin/MerchantAdminPeoplePage.tsx");
    expect(source).not.toContain("getMerchantAdminDemo");
    expect(source).toContain("merchantEmployeeApi.list(query)");
    expect(source).toContain('<UnifiedUserDirectory onSelect={openCustomer} scope="merchant" />');
    expect(source).toContain("merchantEmployeeApi.list(");
    expect(source).toContain("merchantEmployeeApi.detail(needoId)");
    expect(source).toContain("merchantEmployeeApi.updateProfile(");
    expect(source).toContain("merchantEmployeeApi.updateAffiliation(");
    expect(source).not.toContain(
      'backofficeRealDataApi.technicians("merchant-admin"',
    );
    expect(source).not.toContain(
      'backofficeRealDataApi.approveTechnician("merchant-admin"',
    );
    expect(source).not.toContain(
      'backofficeRealDataApi.technician("merchant-admin"',
    );
    expect(source).toContain("EmployeeDetailCard");
    expect(source).not.toContain("FormalTechnicianDetailPanel");
    expect(source).toContain("UnifiedUserDetailDrawer");
  });
});
