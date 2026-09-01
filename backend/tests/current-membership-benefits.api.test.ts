import request from "supertest";
import { createStep06Fixture } from "./helpers/step06-fixture";

describe("GET /api/v1/me/membership-benefits", () => {
  it("uses only the authenticated user and requested locale", async () => {
    const service = {
      getMyMembershipBenefits: jest.fn(async () => ({
        tierCode: "gold",
        tierVersionPublicId: "gold-v3",
        expiresAt: "2026-10-01T00:00:00.000Z",
        list: [
          {
            code: "support_service",
            configuredEnabled: true,
            globallyEnabled: true,
            effective: false,
            deliveryCapability: "unavailable",
            name: "専属サポート",
            description: "準備中です"
          }
        ]
      }))
    };
    const fixture = await createStep06Fixture({
      platformMembershipAdministrationService: service
    } as never);
    const token = await fixture.loginAsAdmin();

    const response = await request(fixture.app)
      .get("/api/v1/me/membership-benefits?locale=ja")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.list[0]).toMatchObject({
      code: "support_service",
      deliveryCapability: "unavailable",
      effective: false,
      name: "専属サポート"
    });
    expect(service.getMyMembershipBenefits).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1 }),
      "ja"
    );
    expect(response.text).not.toMatch(/targetUserId|conversationId|couponId/);
  });
});
