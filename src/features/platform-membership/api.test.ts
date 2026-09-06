import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import { platformMembershipSelfApi } from "./api";

vi.mock("../../api/httpClient", async () => {
  const actual = await vi.importActual<typeof import("../../api/httpClient")>("../../api/httpClient");
  return { ...actual, httpClient: { request: vi.fn() } };
});

describe("platformMembershipSelfApi", () => {
  beforeEach(() => vi.mocked(httpClient.request).mockReset());

  it("decodes all three detailed-card background stops", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({
      tierCode: "gold",
      tierVersionPublicId: "tier-gold-v2",
      multiplier: 5,
      expiresAt: null,
      ekycVerified: true,
      benefits: [],
      theme: {
        detailAccentColor: "#A7FF1E",
        detailSurfaceColor: "#10242D",
        detailSurfaceMiddleColor: "#183A32",
        detailSurfaceBottomColor: "#24314B",
        detailItemSurfaceColor: "#09161D",
        detailOuterBorderColor: "#5D8B35",
        detailItemBorderColor: "#29424D",
        detailAvatarBorderColor: "#79A84B",
        simpleTopColor: "#0D2F27",
        simpleBottomColor: "#132630"
      }
    });

    await expect(platformMembershipSelfApi.getMine()).resolves.toMatchObject({
      theme: {
        detailSurfaceColor: "#10242D",
        detailSurfaceMiddleColor: "#183A32",
        detailSurfaceBottomColor: "#24314B"
      }
    });
  });
});
