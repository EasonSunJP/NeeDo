import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import { identityApplicationsApi, type MerchantReview } from "./api";

vi.mock("../../api/httpClient", () => ({
  httpClient: {
    request: vi.fn(),
    requestDataUrl: vi.fn()
  }
}));

describe("identity application API client", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the formal applicant, contract, and activation routes", async () => {
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        contractAcceptance: { receiptId: "receipt-91" },
        affiliate: {
          affiliateStatus: "active",
          needoId: "u0000000007",
          profileId: 57
        }
      });
    await identityApplicationsApi.createTechnicianDraft({ targetShopId: 8, applicantName: "山田 花" });
    await identityApplicationsApi.acceptMerchantContract(41, {
      expectedVersion: 3,
      contractVersion: "merchant-v1",
      contentHash: "a".repeat(64),
      language: "ja",
      hasRead: true,
      hasAgreed: true
    });
    const activation = await identityApplicationsApi.activateAffiliate({
      contractVersion: "affiliate-v1",
      contentHash: "b".repeat(64),
      language: "ja",
      hasRead: true,
      hasAgreed: true
    });
    expect(activation.affiliate).toEqual({
      affiliateStatus: "active",
      needoId: "u0000000007",
      profileId: 57
    });

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/identity-applications/technician", {
      body: { targetShopId: 8, applicantName: "山田 花" },
      method: "POST"
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(
      2,
      "/identity-applications/41/merchant-contract-acceptance",
      expect.objectContaining({ method: "POST" })
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      3,
      "/identity-activations/affiliate",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("uploads protected raw media with purpose and optimistic version", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "portrait.jpg", { type: "image/jpeg" });
    await identityApplicationsApi.uploadMedia(41, "portrait", 3, file);
    expect(httpClient.request).toHaveBeenCalledWith("/identity-applications/41/media", {
      body: file,
      headers: { "Content-Type": "image/jpeg" },
      method: "POST",
      query: { expected_version: 3, purpose: "portrait" }
    });
  });

  it("uses shop-scoped review, contact, XLSX, and operations review routes", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});
    vi.mocked(httpClient.requestDataUrl).mockResolvedValue("data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,AA==");
    await identityApplicationsApi.listTechnicianReviews({ page: 1, pageSize: 20 });
    await identityApplicationsApi.contactTechnicianApplicant(9);
    await identityApplicationsApi.downloadTechnicianResume(9);
    await identityApplicationsApi.approveMerchantApplication(12, 4);
    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/merchant/technician-applications", {
      query: { page: 1, page_size: 20, status: undefined }
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/merchant/technician-applications/9/contact", {
      body: {},
      method: "POST"
    });
    expect(httpClient.requestDataUrl).toHaveBeenCalledWith(
      "/merchant/technician-applications/9/resume.xlsx",
      { headers: { Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(3, "/ops/merchant-applications/12/approve", {
      body: { expectedVersion: 4 },
      method: "POST"
    });
  });

  it("preserves merchant review submission and creation timestamps", async () => {
    const result = {
      list: [{
        applicationId: 91,
        submittedAt: "2026-09-06T01:00:00.000Z",
        createdAt: "2026-09-05T01:00:00.000Z"
      } as MerchantReview],
      total: 1,
      page: 1,
      page_size: 5
    };
    vi.mocked(httpClient.request).mockResolvedValueOnce(result);

    await expect(
      identityApplicationsApi.listMerchantReviews({ page: 1, pageSize: 5, status: "submitted" })
    ).resolves.toEqual(result);
  });
});
