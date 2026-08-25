import { describe, expect, it } from "vitest";
import source from "./ReviewPages.tsx?raw";

describe("identity application review pages", () => {
  it("gives the receiving shop the required resume, contact, and approval actions", () => {
    expect(source).toContain("downloadTechnicianResume(selected.applicationId)");
    expect(source).toContain("contactTechnicianApplicant(selected.applicationId)");
    expect(source).toContain("approveTechnicianApplication(selected.applicationId, selected.version)");
    expect(source).toContain("technician-application-${selected.applicationId}.xlsx");
    expect(source).toContain(">OK</ApplicationButton>");
  });

  it("shows protected evidence and masked bank details to operations review", () => {
    expect(source).toContain("<ProtectedApplicationImage");
    expect(source).toContain("selected.bankAccount.accountNumberMasked");
    expect(source).toContain("selected.contractAcceptance?.receiptId");
    expect(source).toContain("approveMerchantApplication(selected.applicationId, selected.version)");
  });

  it("documents the exact 15-day trial boundary in the approval surface", () => {
    expect(source).toContain("剩余正好 15 天或大于 15 天时，当月计为试用第一个月");
  });
});
