import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "./httpClient";
import { userManagementApi } from "./userManagement";

vi.mock("./httpClient", () => ({ httpClient: { request: vi.fn() } }));

describe("userManagementApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls the protected test-account mutation with optimistic concurrency", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});

    await userManagementApi.updateTestAccount(41, {
      isTestAccount: false,
      expectedUpdatedAt: "2026-08-30T00:00:00.000Z"
    });

    expect(httpClient.request).toHaveBeenCalledWith("/users/41/test-account", {
      body: {
        isTestAccount: false,
        expectedUpdatedAt: "2026-08-30T00:00:00.000Z"
      },
      method: "PATCH"
    });
  });

  it("passes the test-account filter to the paginated formal user list", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});

    await userManagementApi.listUsers({ isTestAccount: true, page: 2, pageSize: 20 });

    expect(httpClient.request).toHaveBeenCalledWith("/users", {
      query: { isTestAccount: true, page: 2, pageSize: 20 }
    });
  });

  it("passes the role filter to the paginated formal user list", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});

    await userManagementApi.listUsers({ roleId: 7, page: 2, pageSize: 20 });

    expect(httpClient.request).toHaveBeenCalledWith("/users", {
      query: { roleId: 7, page: 2, pageSize: 20 }
    });
  });
});
