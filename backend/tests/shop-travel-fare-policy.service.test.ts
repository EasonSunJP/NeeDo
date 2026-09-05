import type { AuditLogCreateInput } from "../src/repositories/audit-log.repository";
import {
  ShopTravelFarePolicyService,
  type ShopTravelFarePolicyRepositoryPort,
  type TravelFarePolicyVersionPayload
} from "../src/services/shop-travel-fare-policy.service";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";

const actor: AuthenticatedAccessContext = {
  userId: 7,
  email: "owner@example.com",
  accessTokenJti: "jti",
  accessTokenExpiresAt: 2_000_000_000,
  currentIdentityId: 70,
  currentIdentityType: "merchant_owner",
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: 11,
  roles: ["merchant_owner"],
  permissions: []
};

const version = (overrides: Partial<TravelFarePolicyVersionPayload> = {}): TravelFarePolicyVersionPayload => ({
  publicId: "policy-v1",
  version: 1,
  effectiveFrom: "2026-09-06T00:00:00.000Z",
  publishedByUserId: 7,
  reason: "Initial home service bands",
  bands: [
    { ordinal: 1, maximumDistanceMeters: 5_000, fareAmountJpy: 0 },
    { ordinal: 2, maximumDistanceMeters: 10_000, fareAmountJpy: 500 }
  ],
  createdAt: "2026-09-05T00:00:00.000Z",
  ...overrides
});

const repository = (): jest.Mocked<ShopTravelFarePolicyRepositoryPort> => ({
  findCurrentAndNext: jest.fn(async (shopId: number, at: Date) => {
    void shopId; void at;
    return { current: version(), next: null };
  }),
  listVersions: jest.fn(async (shopId: number, input) => {
    void shopId; void input;
    return { list: [version()], total: 1, page: 1, page_size: 20 };
  }),
  publishVersion: jest.fn(async (input) => ({
    kind: "created",
    value: version({ publicId: "policy-v2", version: input.expectedVersion + 1 })
  } as const))
});

describe("ShopTravelFarePolicyService", () => {
  it("rejects a shop-scoped merchant staff identity at the service boundary", async () => {
    const repo = repository();
    const service = new ShopTravelFarePolicyService(repo, { createInput: (input) => input as never });

    await expect(service.publishVersion(
      { ...actor, roles: ["merchant_staff"] },
      { ip: "127.0.0.1" },
      { expectedVersion: 1, effectiveFrom: "2026-09-07T00:00:00.000Z", reason: "Forbidden", bands: [{ maximumDistanceMeters: 5_000, fareAmountJpy: 0 }] }
    )).rejects.toMatchObject({ message: "error.identity.forbidden", statusCode: 403 });
    expect(repo.publishVersion).not.toHaveBeenCalled();
  });

  it("rejects a staff active identity even when the account also has an owner role", async () => {
    const repo = repository();
    const service = new ShopTravelFarePolicyService(repo, { createInput: (input) => input as never });

    await expect(service.publishVersion(
      { ...actor, currentIdentityType: "merchant_staff", roles: ["merchant_owner", "merchant_staff"] },
      { ip: "127.0.0.1" },
      { expectedVersion: 1, effectiveFrom: "2026-09-07T00:00:00.000Z", reason: "Forbidden", bands: [{ maximumDistanceMeters: 5_000, fareAmountJpy: 0 }] }
    )).rejects.toMatchObject({ message: "error.identity.forbidden", statusCode: 403 });
    expect(repo.publishVersion).not.toHaveBeenCalled();
  });

  it("always scopes reads and immutable publication to the signed merchant shop", async () => {
    const repo = repository();
    const service = new ShopTravelFarePolicyService(repo, { createInput: (input) => input as never });

    await service.getPolicy(actor, new Date("2026-09-05T00:00:00.000Z"));
    await service.listVersions(actor, { page: 2, pageSize: 5 });
    await service.publishVersion(actor, { ip: "127.0.0.1" }, {
      expectedVersion: 1,
      effectiveFrom: "2026-09-07T00:00:00.000Z",
      reason: "Extend the service area",
      bands: [{ maximumDistanceMeters: 20_000, fareAmountJpy: 1_000 }]
    });

    expect(repo.findCurrentAndNext).toHaveBeenCalledWith(11, expect.any(Date));
    expect(repo.listVersions).toHaveBeenCalledWith(11, { page: 2, pageSize: 5 });
    expect(repo.publishVersion).toHaveBeenCalledWith(expect.objectContaining({
      shopId: 11,
      expectedVersion: 1,
      actorUserId: 7,
      bands: [{ ordinal: 0, maximumDistanceMeters: 20_000, fareAmountJpy: 1_000 }]
    }));
  });

  it.each([
    [[{ maximumDistanceMeters: 5_000, fareAmountJpy: 0 }, { maximumDistanceMeters: 5_000, fareAmountJpy: 500 }]],
    [[{ maximumDistanceMeters: 10_000, fareAmountJpy: 0 }, { maximumDistanceMeters: 5_000, fareAmountJpy: 500 }]]
  ])("rejects overlapping or unordered maximum-distance bands", async (bands) => {
    const repo = repository();
    const service = new ShopTravelFarePolicyService(repo, { createInput: (input) => input as never });

    await expect(service.publishVersion(actor, { ip: "127.0.0.1" }, {
      expectedVersion: 1,
      effectiveFrom: "2026-09-07T00:00:00.000Z",
      reason: "Invalid bands",
      bands
    })).rejects.toMatchObject({ message: "error.travel_fare_policy.invalid_bands", statusCode: 400 });
    expect(repo.publishVersion).not.toHaveBeenCalled();
  });

  it("preserves the greatest inclusive maximum and writes complete immutable audit metadata", async () => {
    const repo = repository();
    let audit: AuditLogCreateInput | undefined;
    const service = new ShopTravelFarePolicyService(repo, {
      createInput: (input) => {
        audit = input as unknown as AuditLogCreateInput;
        return audit;
      }
    });
    const bands = [
      { maximumDistanceMeters: 5_000, fareAmountJpy: 0 },
      { maximumDistanceMeters: 20_000, fareAmountJpy: 1_000 }
    ];

    await service.publishVersion(actor, { ip: "127.0.0.1", userAgent: "jest" }, {
      expectedVersion: 1,
      effectiveFrom: "2026-09-07T00:00:00.000Z",
      reason: "Publish maximum supported area",
      bands
    });

    expect(repo.publishVersion).toHaveBeenCalledWith(expect.objectContaining({ bands: [
      { ordinal: 0, ...bands[0] },
      { ordinal: 1, ...bands[1] }
    ] }));
    expect(audit).toMatchObject({
      action: "merchant_admin.travel_fare_policy.publish",
      targetType: "shop_travel_fare_policy_version",
      metadata: {
        previousVersionPublicId: "policy-v1",
        newVersionPublicId: expect.any(String),
        effectiveFrom: "2026-09-07T00:00:00.000Z",
        reason: "Publish maximum supported area",
        bands: [
          { ordinal: 0, ...bands[0] },
          { ordinal: 1, ...bands[1] }
        ]
      }
    });
  });

  it("maps optimistic publication conflicts to a stable error", async () => {
    const repo = repository();
    repo.publishVersion.mockResolvedValue({ kind: "version_conflict" });
    const service = new ShopTravelFarePolicyService(repo, { createInput: (input) => input as never });

    await expect(service.publishVersion(actor, { ip: "127.0.0.1" }, {
      expectedVersion: 1,
      effectiveFrom: "2026-09-07T00:00:00.000Z",
      reason: "Conflict",
      bands: [{ maximumDistanceMeters: 5_000, fareAmountJpy: 0 }]
    })).rejects.toMatchObject({ message: "error.travel_fare_policy.version_conflict", statusCode: 409 });
  });
});
