import request from "supertest";
import { createStep06Fixture } from "./helpers/step06-fixture";

describe("customer platform membership projection", () => {
  it("returns the authenticated customer's resolved published tier and theme", async () => {
    const service = {
      getMyMembership: jest.fn(async () => ({
        tierCode: "gold",
        tierVersionPublicId: "tier-gold-v3",
        multiplier: 5,
        ekycVerified: true,
        expiresAt: "2026-10-01T00:00:00.000Z",
        benefits: [{ code: "ndp_experience", configuration: {} }],
        theme: {
          detailAccentColor: "#F4C967",
          detailSurfaceColor: "#302818",
          detailSurfaceMiddleColor: "#253026",
          detailSurfaceBottomColor: "#17243A",
          detailItemSurfaceColor: "#201A10",
          detailOuterBorderColor: "#A98645",
          detailItemBorderColor: "#66552F",
          detailAvatarBorderColor: "#D0A857",
          simpleTopColor: "#382C13",
          simpleBottomColor: "#241E12"
        }
      }))
    };
    const fixture = await createStep06Fixture({
      platformMembershipAdministrationService: service
    } as never);
    const token = await fixture.loginAsAdmin();
    const response = await request(fixture.app)
      .get("/api/v1/me/platform-membership")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(response.body.data).toMatchObject({
      tierCode: "gold",
      multiplier: 5,
      ekycVerified: true,
      theme: { simpleTopColor: "#382C13" }
    });
    expect(service.getMyMembership).toHaveBeenCalledWith(expect.objectContaining({ userId: 1 }));
  });
});
