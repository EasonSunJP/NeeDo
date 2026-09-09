import { describe, expect, it } from "vitest";
import source from "./ReviewPages.tsx?raw";

describe("identity application review pages", () => {
  it("gives the receiving shop the required resume, contact, and approval actions", () => {
    expect(source).toContain("downloadTechnicianResume(selected.applicationId)");
    expect(source).toContain("contactTechnicianApplicant(selected.applicationId)");
    expect(source).toContain("approveTechnicianApplication(selected.applicationId, selected.version)");
    expect(source).toContain("technician-application-${selected.applicationId}.xlsx");
    expect(source).toContain('{t("审核通过")}</ApplicationButton>');
    expect(source).not.toContain(">OK</ApplicationButton>");
  });

  it("allows the shared employee header search to filter the embedded review queue", () => {
    expect(source).toContain("searchQuery = \"\"");
    expect(source).toContain("const visibleItems = items.filter");
    expect(source).toContain("normalizedSearchQuery");
    expect(source).toContain("visibleItems.length === 0");
    expect(source).toContain("visibleItems.map((item)");
  });

  it("shows protected evidence and masked bank details to operations review", () => {
    expect(source).toContain("<ProtectedApplicationImage");
    expect(source).toContain("selected.bankAccount.accountNumberMasked");
    expect(source).toContain("selected.contractAcceptance?.receiptId");
    expect(source).toContain("approveMerchantApplication(selected.applicationId, selected.version)");
    expect(source).toContain("selected.serviceCategories.map((category) => category.label)");
    expect(source).toContain("selected.businessKeywords.map((keyword) => keyword.label)");
  });

  it("documents the exact 15-day trial boundary in the approval surface", () => {
    expect(source).toContain("剩余正好 15 天或大于 15 天时，当月计为试用第一个月");
  });

  it("restores the pending-review union and selected application from sidebar deep links", () => {
    expect(source).toContain("useSearchParams");
    expect(source).toContain('searchParams.get("status") === "pending"');
    expect(source).toContain('searchParams.get("applicationId")');
    expect(source).toContain('status: "submitted"');
    expect(source).toContain('status: "under_review"');
    expect(source).toContain("setSearchParams");
  });
});
