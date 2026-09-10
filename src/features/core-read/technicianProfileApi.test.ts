import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import { persistentResourceCache } from "../../lib/persistentResourceCache";
import { technicianProfileApi } from "./technicianProfileApi";

vi.mock("../../api/httpClient", () => ({
  httpClient: { request: vi.fn() }
}));

vi.mock("../../lib/persistentCacheScope", () => ({
  getAuthenticatedPersistentCacheScope: () => "account:181"
}));

vi.mock("../../lib/persistentResourceCache", () => ({
  persistentResourceCache: { write: vi.fn() }
}));

describe("technicianProfileApi", () => {
  beforeEach(() => {
    vi.mocked(httpClient.request).mockReset();
    vi.mocked(persistentResourceCache.write).mockReset().mockResolvedValue({});
  });

  it("reads and patches the approved authenticated technician fields without a client-selected id", async () => {
    const saved = { id: 81, displayName: "正式技师" };
    vi.mocked(httpClient.request).mockResolvedValue(saved);

    await technicianProfileApi.getMine();
    await technicianProfileApi.updateMine({
      gender: "female",
      age: 29,
      heightCm: 168,
      languages: ["日本語", "中文"],
      bio: "预约前请联系。",
      visibility: "network"
    });

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/technician-profile/me");
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/technician-profile/me", {
      method: "PATCH",
      body: {
        gender: "female",
        age: 29,
        heightCm: 168,
        languages: ["日本語", "中文"],
        bio: "预约前请联系。",
        visibility: "network"
      }
    });
    expect(persistentResourceCache.write).toHaveBeenCalledWith(
      "account:181",
      "technician:self",
      saved
    );
  });
});
