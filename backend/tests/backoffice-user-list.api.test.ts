import request from "supertest";
import { createStep06Fixture } from "./helpers/step06-fixture";

describe("backoffice all-user API", () => {
  it("validates filters, enforces permission and returns the formal aggregate", async () => {
    const listManagedUsers = jest.fn(async () => ({
      list: [
        {
          id: 41,
          needoId: "u0000000041",
          username: "Mia",
          email: "mia@example.test",
          phone: null,
          phoneBound: false,
          emailBound: true,
          avatarUrl: null,
          isActive: true,
          isTestAccount: false,
          source: ["password"],
          identities: [],
          roles: [],
          groups: ["system:free"],
          ekycVerified: false,
          membership: { tierCode: "free", expiresAt: null, lockVersion: null },
          experience: { currentLevel: 1, totalExpUnits: "0" },
          ndpBalance: { available: 0, frozen: 0 },
          bookingCount: 0,
          lastLoginAt: null,
          createdAt: "2026-09-01T12:00:00.000Z",
          updatedAt: "2026-09-01T12:00:00.000Z"
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    }));
    const fixture = await createStep06Fixture({
      backofficeRepository: { listManagedUsers }
    } as never);
    fixture.replaceAdminPermissions(["backoffice:users:read"]);
    const token = await fixture.loginAsAdmin();

    const response = await request(fixture.app)
      .get("/api/v1/backoffice/users?page=1&pageSize=20&identityType=customer&state=active")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.list[0]).toMatchObject({ needoId: "u0000000041" });
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|otp|accessToken|refreshToken/);
    expect(listManagedUsers).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20, identityType: "customer", state: "active" }),
      expect.any(Date)
    );

    await request(fixture.app)
      .get("/api/v1/backoffice/users?minLevel=101")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
    await request(fixture.app).get("/api/v1/backoffice/users").expect(401);
  });
});
