import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import { platformUserManagementApi } from "./api";

vi.mock("../../api/httpClient", async () => {
  const actual = await vi.importActual<typeof import("../../api/httpClient")>("../../api/httpClient");
  return { ...actual, httpClient: { request: vi.fn() } };
});

describe("platformUserManagementApi", () => {
  beforeEach(() => vi.mocked(httpClient.request).mockReset());

  it("serializes the formal routes and maps page_size to pageSize", async () => {
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce({ list: [], total: 0, page: 2, page_size: 25 })
      .mockResolvedValueOnce({ list: [], total: 0, page: 1, page_size: 20 })
      .mockResolvedValueOnce({ current: null, draft: null })
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ list: [], total: 0, page: 1, page_size: 20 });

    await platformUserManagementApi.listUsers({ page: 2, page_size: 25, tier: "gold" });
    await platformUserManagementApi.listGroups({ page: 1, page_size: 20 });
    await platformUserManagementApi.getGlobalSettings();
    await platformUserManagementApi.listTiers();
    await platformUserManagementApi.listBenefits();
    await platformUserManagementApi.listExperienceEntries(41, { page: 1, page_size: 20 });

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/backoffice/users", {
      query: { page: 2, pageSize: 25, tier: "gold" }
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/backoffice/user-groups", {
      query: { page: 1, pageSize: 20 }
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(3, "/backoffice/user-global-settings");
    expect(httpClient.request).toHaveBeenNthCalledWith(4, "/backoffice/membership-tiers");
    expect(httpClient.request).toHaveBeenNthCalledWith(5, "/backoffice/membership-benefits");
    expect(httpClient.request).toHaveBeenNthCalledWith(
      6,
      "/backoffice/users/41/experience-entries",
      { query: { page: 1, pageSize: 20 } }
    );
  });

  it("rejects malformed responses instead of accepting legacy local data", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({ list: [{ id: "not-an-id" }], total: 1, page: 1, page_size: 20 });

    await expect(platformUserManagementApi.listUsers()).rejects.toThrow("Invalid user management response");
  });

  it("preserves 409 conflicts for the workspace recovery UI", async () => {
    const conflict = { message: "error.version_conflict", code: 40901, status: 409 };
    vi.mocked(httpClient.request).mockImplementationOnce(() => {
      throw conflict;
    });

    let caught: unknown;
    try {
      await platformUserManagementApi.publishGlobalSettings({ expectedVersion: 2, expectedLockVersion: 1 });
    } catch (error) {
      caught = error;
    }
    const preserved = caught as typeof conflict;
    expect(preserved.status).toBe(409);
    expect(preserved.code).toBe(40901);
    expect(preserved.message).toBe("error.version_conflict");
  });
});
