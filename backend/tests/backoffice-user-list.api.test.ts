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
          displayName: "Mia",
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
          city: "Tokyo",
          privacyMode: true,
          privacyScope: "limited",
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
      .get(
        "/api/v1/backoffice/users?page=1&pageSize=20&identityType=customer&state=active&city=Tokyo&emailState=set&privacy=enabled&minBookings=2&maxBookings=20&sortBy=city&sortDirection=desc"
      )
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.list[0]).toMatchObject({ needoId: "u0000000041" });
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|otp|accessToken|refreshToken/);
    expect(listManagedUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "platform",
        page: 1,
        pageSize: 20,
        identityType: "customer",
        state: "active",
        city: "Tokyo",
        emailState: "set",
        privacy: "enabled",
        minBookings: 2,
        maxBookings: 20,
        sortBy: "city",
        sortDirection: "desc"
      }),
      expect.any(Date)
    );

    await request(fixture.app)
      .get("/api/v1/backoffice/users?minLevel=101")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
    await request(fixture.app)
      .get("/api/v1/backoffice/users?minBookings=10&maxBookings=2")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
    await request(fixture.app).get("/api/v1/backoffice/users").expect(401);
  });

  it("derives detail mutation capabilities from the authenticated permissions", async () => {
    const getManagedUser = jest.fn(async () => ({
      id: 41,
      needoId: "u0000000041",
      username: "Mia",
      displayName: "Mia",
      email: "mia@example.test",
      phone: null,
      phoneBound: false,
      emailBound: true,
      avatarUrl: null,
      city: "Tokyo",
      privacyMode: true,
      privacyScope: "limited",
      isActive: true,
      isTestAccount: false,
      source: ["password"],
      identities: [],
      roles: [],
      groups: [],
      ekycVerified: false,
      membership: { tierCode: "gold", tierVersionPublicId: null, entitlementPublicId: null, expiresAt: null, experienceMultiplier: 2, lockVersion: null },
      experience: { currentLevel: 2, totalExpUnits: "100" },
      ndpBalance: { available: 900, frozen: 0 },
      bookingCount: 3,
      lastLoginAt: null,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
      profile: { displayName: "Mia", bio: null, city: "Tokyo", gender: null, age: null, heightCm: null, languages: [] },
      account: { roles: [] },
      bookingSpend: { totalBookings: 3, completedBookings: 2, completedSpendJpy: 18000 },
      metrics: { ndpAvailable: 900, usageCount: 3, credit: { ratingAverage: 4.8, reviewCount: 12, latestReviewAt: null } },
      audit: { total: 0, list: [] }
    }));
    const fixture = await createStep06Fixture({ backofficeRepository: { getManagedUser } } as never);
    fixture.replaceAdminPermissions([
      "backoffice:users:read",
      "backoffice:customers:write",
      "backoffice:partner-profile:write"
    ]);
    const token = await fixture.loginAsAdmin();

    const response = await request(fixture.app)
      .get("/api/v1/backoffice/users/41")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.capabilities).toEqual({
      membershipWrite: false,
      reviewAmend: true,
      refundAmend: false,
      partnerWrite: true,
      timelineCommentWrite: false
    });
    expect(getManagedUser).toHaveBeenCalledWith(
      { scope: "platform", userId: 41 },
      expect.any(Date)
    );
  });
});
