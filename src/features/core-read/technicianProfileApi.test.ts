import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import { technicianProfileApi } from "./technicianProfileApi";

vi.mock("../../api/httpClient", () => ({
  httpClient: { request: vi.fn() }
}));

describe("technicianProfileApi", () => {
  beforeEach(() => vi.mocked(httpClient.request).mockReset());

  it("reads and patches the authenticated technician profile without a client-selected id", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});

    await technicianProfileApi.getMine();
    await technicianProfileApi.updateMine({
      displayName: "彩",
      serviceBase: { latitude: 35.6762, longitude: 139.6503 },
      visibility: "network"
    });

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/technician-profile/me");
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/technician-profile/me", {
      method: "PATCH",
      body: {
        displayName: "彩",
        serviceBase: { latitude: 35.6762, longitude: 139.6503 },
        visibility: "network"
      }
    });
  });
});
