import request from "supertest";
import { TRAVEL_FARE_PERMISSIONS } from "../src/constants/permissions.constants";
import type { ShopTravelFarePolicyRepositoryPort } from "../src/services/shop-travel-fare-policy.service";
import { createStep06Fixture } from "./helpers/step06-fixture";
import { createDirectShopContextRepository } from "./helpers/merchant-shop-context";

const policy = {
  publicId: "policy-v1",
  version: 1,
  effectiveFrom: "2026-09-06T00:00:00.000Z",
  publishedByUserId: 1,
  reason: "Initial",
  bands: [{ ordinal: 1, maximumDistanceMeters: 5_000, fareAmountJpy: 0 }],
  createdAt: "2026-09-05T00:00:00.000Z"
};

const createRepository = (): jest.Mocked<ShopTravelFarePolicyRepositoryPort> => ({
  findCurrentAndNext: jest.fn(async (shopId: number, at: Date) => {
    void shopId; void at;
    return { current: policy, next: null };
  }),
  listVersions: jest.fn(async (_shopId, input) => ({
    list: [policy], total: 21, page: input.page ?? 1, page_size: input.pageSize ?? 20
  })),
  publishVersion: jest.fn(async (input) => {
    void input;
    return { kind: "created", value: { ...policy, version: 2, publicId: "policy-v2" } } as const;
  })
});

const createMerchantFixture = async (permissions: string[]) => {
  const repository = createRepository();
  const fixture = await createStep06Fixture({
    shopTravelFarePolicyRepository: repository,
    merchantShopContextRepository: createDirectShopContextRepository({
      shopId: 11,
      shopPublicId: "shop0000000011"
    })
  } as never);
  fixture.users[0]!.identities.push({
    id: 99, userId: 1, type: "merchant_owner", scopeType: "shop", scopeId: 11,
    displayName: "Shop owner", isDefault: true, isActive: true, deletedAt: null,
    publicIdentifier: { publicId: "shop0000000011", status: "ACTIVE", deletedAt: null }
  } as never);
  fixture.users[0]!.identities[0]!.isDefault = false;
  fixture.replaceAdminPermissions(["auth:me", ...permissions]);
  const adminRole = fixture.users[0]!.userRoles[0]!.role;
  fixture.users[0]!.userRoles.push({
    ...fixture.users[0]!.userRoles[0]!,
    id: 99,
    roleId: 99,
    scopeType: "shop",
    scopeId: 11,
    role: { ...adminRole, id: 99, name: "Merchant Owner", code: "merchant_owner" }
  });
  const login = await request(fixture.app)
    .post("/api/v1/auth/login")
    .send({ loginIdentifier: "admin@example.com", password: "Abcd@1234" })
    .expect(200);
  const token = login.body.data.accessToken as string;
  return { ...fixture, repository, token };
};

describe("merchant travel fare policy API", () => {
  it("requires authentication", async () => {
    const fixture = await createMerchantFixture([TRAVEL_FARE_PERMISSIONS.merchantRead]);
    await request(fixture.app).get("/api/v1/merchant-admin/travel-fare-policy").expect(401);
  });

  it("separates read and write permission and returns stable envelopes", async () => {
    const fixture = await createMerchantFixture([TRAVEL_FARE_PERMISSIONS.merchantRead]);
    const response = await request(fixture.app)
      .get("/api/v1/merchant-admin/travel-fare-policy")
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(200);
    expect(response.body).toEqual({ code: 0, message: "success", data: { current: policy, next: null } });

    await request(fixture.app)
      .post("/api/v1/merchant-admin/travel-fare-policy/versions")
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({ expectedVersion: 1, effectiveFrom: "2026-09-07T00:00:00.000Z", reason: "Publish", bands: [{ maximumDistanceMeters: 10_000, fareAmountJpy: 500 }] })
      .expect(403);
  });

  it("validates strict bodies and publishes with write permission", async () => {
    const fixture = await createMerchantFixture([TRAVEL_FARE_PERMISSIONS.merchantWrite]);
    const body = { expectedVersion: 1, effectiveFrom: "2026-09-07T00:00:00.000Z", reason: "Publish", bands: [{ maximumDistanceMeters: 10_000, fareAmountJpy: 500 }] };
    await request(fixture.app)
      .post("/api/v1/merchant-admin/travel-fare-policy/versions")
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({ ...body, fare: 1 })
      .expect(400);
    const response = await request(fixture.app)
      .post("/api/v1/merchant-admin/travel-fare-policy/versions")
      .set("Authorization", `Bearer ${fixture.token}`)
      .send(body)
      .expect(201);
    expect(response.body).toMatchObject({ code: 0, message: "success", data: { publicId: "policy-v2", version: 2 } });
  });

  it("returns paginated immutable history", async () => {
    const fixture = await createMerchantFixture([TRAVEL_FARE_PERMISSIONS.merchantRead]);
    const response = await request(fixture.app)
      .get("/api/v1/merchant-admin/travel-fare-policy/versions?page=2&pageSize=5")
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(200);
    expect(response.body).toMatchObject({ code: 0, message: "success", data: { total: 21, page: 2, page_size: 5 } });
    expect(fixture.repository.listVersions).toHaveBeenCalledWith(11, { page: 2, pageSize: 5 });
  });
});
