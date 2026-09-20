import request from "supertest";
import type { UserFavoritesService } from "../src/services/user-favorites.service";
import { createStep06Fixture } from "./helpers/step06-fixture";

describe("user favorites routes", () => {
  it("requires authentication, read permission, and bounded query input", async () => {
    const service = {
      listFavorites: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 20 })),
      setPin: jest.fn(),
      setReaction: jest.fn()
    } as unknown as jest.Mocked<UserFavoritesService>;
    const fixture = await createStep06Fixture({ userFavoritesService: service });

    await request(fixture.app).get("/api/v1/me/favorites").expect(401);
    const token = await fixture.loginAsAdmin();
    fixture.replaceAdminPermissions([]);
    await request(fixture.app)
      .get("/api/v1/me/favorites")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);

    fixture.replaceAdminPermissions(["entity-favorite:read", "entity-favorite:write"]);
    await request(fixture.app)
      .get("/api/v1/me/favorites?pageSize=101")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);

    await request(fixture.app)
      .get("/api/v1/me/favorites?type=shop&page=1&pageSize=20")
      .set("Authorization", `Bearer ${token}`)
      .expect(200, {
        code: 0,
        message: "success",
        data: { list: [], total: 0, page: 1, page_size: 20 }
      });
  });

  it("validates the shared reaction catalog before calling the service", async () => {
    const service = {
      listFavorites: jest.fn(),
      setPin: jest.fn(),
      setReaction: jest.fn(async () => ({
        itemType: "shop" as const,
        itemKey: "shop0000000001",
        pinnedAt: null,
        reaction: "🥰",
        updatedAt: new Date("2026-09-20T09:00:00.000Z")
      }))
    } as unknown as jest.Mocked<UserFavoritesService>;
    const fixture = await createStep06Fixture({ userFavoritesService: service });
    const token = await fixture.loginAsAdmin();
    fixture.replaceAdminPermissions(["entity-favorite:read", "entity-favorite:write"]);

    await request(fixture.app)
      .put("/api/v1/me/favorites/shop/shop0000000001/reaction")
      .set("Authorization", `Bearer ${token}`)
      .send({ reaction: "not-an-emoji" })
      .expect(400);

    await request(fixture.app)
      .put("/api/v1/me/favorites/shop/shop0000000001/reaction")
      .set("Authorization", `Bearer ${token}`)
      .send({ reaction: "🥰" })
      .expect(200);
    expect(service.setReaction).toHaveBeenCalledWith(
      expect.objectContaining({ userId: expect.any(Number) }),
      "shop",
      "shop0000000001",
      "🥰",
      expect.objectContaining({ ip: expect.any(String) })
    );
  });
});
