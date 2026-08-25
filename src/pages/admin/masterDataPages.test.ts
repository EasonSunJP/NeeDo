import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

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
    const cardSource = read("../../components/admin/MerchantBillingCard.tsx");

    expect(pageSource).toContain("merchantSaasBillingApi.listAccounts");
    expect(pageSource).toContain("MerchantBillingCard");
    expect(pageSource).toContain("expandedGroups");
    expect(cardSource).toContain("账号类型");
    expect(cardSource).toContain("付费模式");
    expect(cardSource).toContain("月费");
    expect(cardSource).toContain("onEditBilling");
  });

  it("keeps the technician page on persisted technician and shop records only", () => {
    const source = read("./TechniciansPage.tsx");
    expect(source).not.toContain("../../data/mock");
    expect(source).not.toContain("virtualSeeds");
    expect(source).not.toContain("TechnicianProfilePanel");
    expect(source).toContain("backofficeRealDataApi.approveTechnician");
    expect(source).toContain("backofficeRealDataApi.updateTechnician");
  });

  it("keeps operations customer profiles on formal paginated APIs", () => {
    const source = read("./UsersPage.tsx");
    expect(source).toContain('backofficeRealDataApi.customers("backoffice"');
    expect(source).toContain("backofficeRealDataApi.updateCustomer(");
    expect(source).toContain("backofficeRealDataApi.deleteCustomer(");
    expect(source).not.toContain("../../data/mock");
  });

  it("uses merchant-scoped customers and technicians without merchant demo data", () => {
    const source = read("../merchant-admin/MerchantAdminPeoplePage.tsx");
    expect(source).not.toContain("getMerchantAdminDemo");
    expect(source).toMatch(/backofficeRealDataApi\.customers\(\s*"merchant-admin"/);
    expect(source).toMatch(/backofficeRealDataApi\.technicians\(\s*"merchant-admin"/);
    expect(source).toContain('backofficeRealDataApi.approveTechnician("merchant-admin"');
  });
});
