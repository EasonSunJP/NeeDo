import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import { technicianProfileApi } from "./technicianProfileApi";

vi.mock("../../api/httpClient", () => ({
  httpClient: { request: vi.fn() }
}));

describe("technicianProfileApi", () => {
  beforeEach(() => vi.mocked(httpClient.request).mockReset());

  it("reads and patches the approved authenticated technician fields without a client-selected id", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});

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
  });
});
