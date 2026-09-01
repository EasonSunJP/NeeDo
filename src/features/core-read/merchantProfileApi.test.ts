import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import { merchantProfileApi } from "./merchantProfileApi";

vi.mock("../../api/httpClient", () => ({
  httpClient: { request: vi.fn() }
}));

describe("merchantProfileApi", () => {
  beforeEach(() => vi.mocked(httpClient.request).mockReset());

  it("reads and patches only the current merchant identity profile", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});

    await merchantProfileApi.getMine();
    await merchantProfileApi.updateMine({ displayName: "佐藤 美咲", languages: [] });

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/merchant-profile/me");
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/merchant-profile/me", {
      method: "PATCH",
      body: { displayName: "佐藤 美咲", languages: [] }
    });
  });
});
