import request from "supertest";
import { TRAVEL_FARE_PERMISSIONS } from "../src/constants/permissions.constants";
import type { RouteEstimateRepositoryPort } from "../src/services/route-estimate.service";
import type { RouteDistanceProvider } from "../src/services/route-distance.provider";
import { createStep06Fixture } from "./helpers/step06-fixture";

const destination = { countryCode: "JP", postalCode: "160-0022", prefecture: "東京都", city: "新宿区", addressLine1: "新宿1-2-3" };
const repository: jest.Mocked<RouteEstimateRepositoryPort> = {
  findEligibleContext: jest.fn(async (servicePublicId: string, scheduleSlotId: number, at: Date) => { void servicePublicId; void scheduleSlotId; void at; return ({
    serviceId: 21, scheduleSlotId: 71, servicePublicId: "service-21", shopId: 11,
    origin: { countryCode: "JP" as const, postalCode: "", prefecture: "東京都", city: "新宿区", addressLine1: "西新宿1-1-1" },
    policyVersionId: 31, policyVersionPublicId: "policy-v1", policyVersion: 1,
    bands: [{ id: 41, ordinal: 0, maximumDistanceMeters: 10_000, fareAmountJpy: 500 }]
  }); }),
  findReusableEstimate: jest.fn(async (input) => { void input; return null; }),
  createEstimate: jest.fn(async (input) => ({ publicId: input.publicId, distanceMeters: input.distanceMeters, durationSeconds: input.durationSeconds, fareAmountJpy: input.fareAmountJpy, policyVersionPublicId: "policy-v1", policyVersion: 1, bandMaximumDistanceMeters: 10_000, expiresAt: input.expiresAt.toISOString() }))
};
const routeProvider: RouteDistanceProvider = { key: "test", getDrivingRoute: jest.fn(async () => ({ providerCode: "test", providerRequestId: null, distanceMeters: 7_000, durationSeconds: 900 })) };

const createFixture = async () => {
  const fixture = await createStep06Fixture({ routeEstimateRepository: repository, routeDistanceProvider: routeProvider } as never);
  fixture.users[0]!.identities[0]!.isDefault = false;
  fixture.users[0]!.identities.push({ id: 90, userId: 1, type: "customer", scopeType: "user", scopeId: 1, displayName: "Customer", isDefault: true, isActive: true, deletedAt: null, publicIdentifier: { publicId: "u0000000001", status: "ACTIVE", deletedAt: null } } as never);
  fixture.replaceAdminPermissions(["auth:me", TRAVEL_FARE_PERMISSIONS.estimateCreate]);
  const token = await fixture.loginAsAdmin();
  return { ...fixture, token };
};

describe("POST /api/v1/bookings/travel-estimates", () => {
  it("requires authentication and explicit permission", async () => {
    const fixture = await createFixture();
    await request(fixture.app).post("/api/v1/bookings/travel-estimates").send({ servicePublicId: "service-21", scheduleSlotId: 71, destination }).expect(401);
    fixture.replaceAdminPermissions(["auth:me"]);
    const denied = await fixture.loginAsAdmin();
    await request(fixture.app).post("/api/v1/bookings/travel-estimates").set("Authorization", `Bearer ${denied}`).send({ servicePublicId: "service-21", scheduleSlotId: 71, destination }).expect(403);
  });

  it("accepts only structured Japanese destination and returns a redacted stable envelope", async () => {
    const fixture = await createFixture();
    await request(fixture.app).post("/api/v1/bookings/travel-estimates").set("Authorization", `Bearer ${fixture.token}`).send({ servicePublicId: "service-21", scheduleSlotId: 71, destination: { ...destination, longitude: 139.7 } }).expect(400);
    await request(fixture.app).post("/api/v1/bookings/travel-estimates").set("Authorization", `Bearer ${fixture.token}`).send({ servicePublicId: "service-21", destination }).expect(400);
    const response = await request(fixture.app).post("/api/v1/bookings/travel-estimates").set("Authorization", `Bearer ${fixture.token}`).send({ servicePublicId: "service-21", scheduleSlotId: 71, destination }).expect(201);
    expect(response.body).toMatchObject({ code: 0, message: "success", data: { distanceMeters: 7_000, durationSeconds: 900, fareAmountJpy: 500, policyVersionPublicId: "policy-v1", bandMaximumDistanceMeters: 10_000 } });
    expect(JSON.stringify(response.body)).not.toContain("AddressHash");
    expect(repository.findEligibleContext).toHaveBeenCalledWith("service-21", 71, expect.any(Date));
  });
});
