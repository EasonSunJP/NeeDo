import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import { adminSystemSettingsApi } from "./api";

vi.mock("../../api/httpClient", () => ({ httpClient: { request: vi.fn() } }));
vi.mock("../../api/contentPublication", () => ({
  contentPublicationApi: { uploadContentImage: vi.fn() }
}));

const operationsSettings = {
  id: 1,
  publicId: "settings-1",
  version: 2,
  siteEnabled: true,
  selfRegistrationEnabled: true,
  googleLoginEnabled: false,
  passwordLoginOtpEnabled: true,
  passwordLoginOtpRule: "monthly_first",
  passwordLoginOtpOnNewIp: true,
  loginLogoMediaAssetId: null,
  requestButtonMediaAssetId: null,
  offlinePaymentEnabled: true,
  ndpPaymentEnabled: true,
  createdByUserId: 1,
  createdAt: "2026-09-06T00:00:00.000Z",
  updatedAt: "2026-09-06T00:00:00.000Z",
  loginLogo: null,
  requestButton: null,
  loginProviderProjects: [],
  paymentProviderProjects: []
};

describe("admin system settings API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the formal operations projection", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce(operationsSettings);
    await expect(adminSystemSettingsApi.getSettings()).resolves.toEqual(operationsSettings);
    expect(httpClient.request).toHaveBeenCalledWith("/backoffice/system-settings", {
      auth: true,
      method: "GET",
      retryOnUnauthorized: true
    });
  });

  it("writes only the two implemented payment switches", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({});
    await adminSystemSettingsApi.updatePayment({
      expectedVersion: 2,
      offlinePaymentEnabled: true,
      ndpPaymentEnabled: false
    });
    expect(httpClient.request).toHaveBeenCalledWith("/backoffice/system-settings/payment", {
      auth: true,
      body: { expectedVersion: 2, offlinePaymentEnabled: true, ndpPaymentEnabled: false },
      method: "PUT",
      retryOnUnauthorized: false
    });
  });

  it("uses the dedicated retention contract", async () => {
    const retention = { version: 1, messageDays: 30, mediaDays: 3, updatedAt: "2026-09-06T00:00:00.000Z" };
    vi.mocked(httpClient.request).mockResolvedValueOnce(retention);
    await expect(adminSystemSettingsApi.getRetention()).resolves.toEqual(retention);
    expect(httpClient.request).toHaveBeenCalledWith("/backoffice/system-settings/im-retention", {
      auth: true,
      method: "GET",
      retryOnUnauthorized: true
    });
  });
});
