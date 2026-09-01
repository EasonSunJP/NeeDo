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
});
