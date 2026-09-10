import { ERROR_CODES } from "../src/constants/error-codes";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import {
  EntityEngagementService,
  type EntityEngagementRepositoryPort
} from "../src/services/entity-engagement.service";

const makeAccess = (identityId: number): AuthenticatedAccessContext => ({
  userId: 42,
  email: "owner@example.com",
  roles: ["customer"],
  permissions: ["entity-favorite:read", "entity-favorite:write"],
  currentIdentityId: identityId,
  currentIdentityType: identityId === 10 ? "customer" : "technician",
  currentIdentityScopeType: "user",
  currentIdentityScopeId: 42,
  accessTokenJti: `jti-${identityId}`,
  accessTokenExpiresAt: 1_900_000_000
});

const makeRepository = (): jest.Mocked<EntityEngagementRepositoryPort> => ({
  setFavorite: jest.fn(async (_userId, target, isFavorited) => ({
    ...target,
    isFavorited,
    favoriteCount: isFavorited ? 8 : 7
  })),
  getFavoriteStatuses: jest.fn(async (_userId, targets) =>
    targets.map((target) => ({ ...target, isFavorited: false, favoriteCount: 3 }))
  ),
  listFavorites: jest.fn(async (input) => ({
    list: [],
    total: 0,
    page: input.page,
    page_size: input.pageSize
  })),
  resolveTarget: jest.fn(async (target) => ({
    ...target,
    shopId: target.targetType === "shop" ? 7 : null,
    technicianProfileId: target.targetType === "technician" ? 8 : null,
    serviceId: target.targetType === "service" ? 9 : null,
    technicianServiceId: target.targetType === "technician_service" ? 10 : null
  })),
  recordSystemShare: jest.fn(async (input) => ({
    status: "created" as const,
    receipt: {
      ...input.target,
      eventId: 21,
      messageId: null,
      shareCount: 9,
      replayed: false
    }
  }))
});

describe("EntityEngagementService", () => {
  it("owns favorites by user account across identity switches", async () => {
    const repository = makeRepository();
    const service = new EntityEngagementService(repository);

    await service.setFavorite(makeAccess(10), "shop", "shop0000000001", true);
    await service.setFavorite(makeAccess(11), "shop", "shop0000000001", false);

    expect(repository.setFavorite).toHaveBeenNthCalledWith(
      1,
      42,
      { targetType: "shop", publicId: "shop0000000001" },
      true
    );
    expect(repository.setFavorite).toHaveBeenNthCalledWith(
      2,
      42,
      { targetType: "shop", publicId: "shop0000000001" },
      false
    );
  });

  it("rejects targets that are not active and publicly visible", async () => {
    const repository = makeRepository();
    repository.setFavorite.mockResolvedValueOnce(null);
    const service = new EntityEngagementService(repository);

    await expect(
      service.setFavorite(makeAccess(10), "technician", "s0000000001", true)
    ).rejects.toMatchObject({
      code: ERROR_CODES.ENTITY_ENGAGEMENT_TARGET_NOT_FOUND,
      statusCode: 404,
      message: "error.entity_engagement.target_not_found"
    });
  });

  it("records system shares with the resolved personal identity and stable fingerprint", async () => {
    const repository = makeRepository();
    const identityScope = {
      resolve: jest.fn(async () => ({ identityId: 10 }))
    };
    const service = new EntityEngagementService(repository, undefined, identityScope as never);

    await expect(
      service.recordSystemShare(
        makeAccess(10),
        "shop",
        "shop0000000001",
        "d295f424-8be2-4a8a-a465-1eb538129bb3"
      )
    ).resolves.toMatchObject({ shareCount: 9, replayed: false });
    expect(repository.recordSystemShare).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 42,
        actorIdentityId: 10,
        target: { targetType: "shop", publicId: "shop0000000001" },
        idempotencyKey: "d295f424-8be2-4a8a-a465-1eb538129bb3",
        requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u)
      })
    );
  });

  it("maps share idempotency payload conflicts to 409", async () => {
    const repository = makeRepository();
    repository.recordSystemShare.mockResolvedValueOnce({ status: "idempotency_conflict" });
    const service = new EntityEngagementService(repository, undefined, {
      resolve: jest.fn(async () => ({ identityId: 10 }))
    } as never);

    await expect(
      service.recordSystemShare(
        makeAccess(10),
        "shop",
        "shop0000000001",
        "d295f424-8be2-4a8a-a465-1eb538129bb3"
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.IDEMPOTENCY_KEY_REUSED, statusCode: 409 });
  });
});
