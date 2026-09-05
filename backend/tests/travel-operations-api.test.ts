import request from "supertest";
import { TRAVEL_FARE_PERMISSIONS } from "../src/constants/permissions.constants";
import type { TravelOperationsRepositoryPort } from "../src/services/travel-operations.service";
import { createStep06Fixture } from "./helpers/step06-fixture";

const repository: jest.Mocked<TravelOperationsRepositoryPort> = {
  listFarePolicies: jest.fn(async (input, at) => {
    void at;
    return {
    list: [{
      shopId: 11, shopPublicId: "shop0000000011", shopName: "NeeDo Shinjuku", city: "Tokyo",
      current: { publicId: "00000000-0000-4000-8000-000000000031", version: 2, effectiveFrom: "2026-09-01T00:00:00.000Z", publishedByUserId: 7, reason: "Current", bands: [{ ordinal: 0, maximumDistanceMeters: 10_000, fareAmountJpy: 500 }], createdAt: "2026-08-31T00:00:00.000Z" },
      next: null
    }],
    total: 1, page: input.page ?? 1, page_size: input.pageSize ?? 20
    };
  })
};

describe("backoffice travel operations API", () => {
  it("requires authentication and explicit travel read permission", async () => {
    const fixture = await createStep06Fixture({ travelOperationsRepository: repository } as never);
    await request(fixture.app).get("/api/v1/backoffice/travel/providers/status").expect(401);
    fixture.replaceAdminPermissions(["auth:me"]);
    const token = await fixture.loginAsAdmin();
    await request(fixture.app).get("/api/v1/backoffice/travel/fare-policies").set("Authorization", `Bearer ${token}`).expect(403);
  });

  it("returns redacted provider status without exposing key or credential values", async () => {
    const fixture = await createStep06Fixture({ travelOperationsRepository: repository } as never);
    fixture.replaceAdminPermissions(["auth:me", TRAVEL_FARE_PERMISSIONS.backofficeRead]);
    const token = await fixture.loginAsAdmin();
    const response = await request(fixture.app).get("/api/v1/backoffice/travel/providers/status").set("Authorization", `Bearer ${token}`).expect(200);
    expect(response.body).toMatchObject({ code: 0, message: "success", data: { providerCode: "disabled", status: "unconfigured", configured: false } });
    expect(JSON.stringify(response.body)).not.toMatch(/apiKey|credential|secret/i);
  });

  it("returns city/shop-scoped paginated policy visibility and read audit evidence", async () => {
    const fixture = await createStep06Fixture({ travelOperationsRepository: repository } as never);
    fixture.replaceAdminPermissions(["auth:me", TRAVEL_FARE_PERMISSIONS.backofficeRead]);
    const token = await fixture.loginAsAdmin();
    const response = await request(fixture.app)
      .get("/api/v1/backoffice/travel/fare-policies?page=2&pageSize=5&city=Tokyo&shopKeyword=Shinjuku")
      .set("Authorization", `Bearer ${token}`).expect(200);
    expect(response.body).toMatchObject({ code: 0, message: "success", data: { total: 1, page: 2, page_size: 5 } });
    expect(repository.listFarePolicies).toHaveBeenCalledWith({ page: 2, pageSize: 5, city: "Tokyo", shopKeyword: "Shinjuku" }, expect.any(Date));
    expect(fixture.auditLogs).toContainEqual(expect.objectContaining({ action: "backoffice.travel.fare_policies.read", metadata: { page: 2, pageSize: 5, city: "Tokyo", shopKeyword: "Shinjuku" } }));
  });
});
