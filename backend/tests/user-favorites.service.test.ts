import {
  UserFavoritesService,
  type UserFavoritesRepositoryPort
} from "../src/services/user-favorites.service";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";

const auth: AuthenticatedAccessContext = {
  userId: 42,
  email: "customer@example.com",
  roles: ["customer"],
  permissions: ["entity-favorite:read", "entity-favorite:write", "message:list", "message:forward"],
  currentIdentityId: 10,
  currentIdentityType: "customer",
  currentIdentityScopeType: "user",
  currentIdentityScopeId: 42,
  accessTokenJti: "jti-favorites",
  accessTokenExpiresAt: 1_900_000_000
};

const pinnedAt = new Date("2026-09-20T09:00:00.000Z");

const makeRepository = (): jest.Mocked<UserFavoritesRepositoryPort> => ({
  list: jest.fn(async (input: Parameters<UserFavoritesRepositoryPort["list"]>[0]) => {
    void input;
    return { list: [], total: 0 };
  }),
  owns: jest.fn(async (input: Parameters<UserFavoritesRepositoryPort["owns"]>[0]) => {
    void input;
    return true;
  }),
  setPin: jest.fn(async (input) => ({
    itemType: input.itemType,
    itemKey: input.itemKey,
    pinnedAt: input.active ? pinnedAt : null,
    reaction: null,
    updatedAt: pinnedAt
  })),
  setReaction: jest.fn(async (input) => ({
    itemType: input.itemType,
    itemKey: input.itemKey,
    pinnedAt: null,
    reaction: input.reaction,
    updatedAt: pinnedAt
  }))
});

const identityScope = {
  resolve: jest.fn(async () => ({ identityId: 10 }))
};

describe("UserFavoritesService", () => {
  it("sorts pinned favorites first and uses a stable key tie-break", async () => {
    const repository = makeRepository();
    repository.list.mockResolvedValueOnce({
      total: 4,
      list: [
        {
          key: "shop:z",
          type: "shop",
          itemKey: "z",
          title: "Z",
          summary: null,
          imageUrl: null,
          detailPath: "/stores/z",
          favoritedAt: new Date("2026-09-20T08:00:00.000Z"),
          activityAt: new Date("2026-09-20T08:00:00.000Z"),
          pinnedAt: null,
          reaction: null,
          canForward: true,
          canDelete: true
        },
        {
          key: "service:pinned",
          type: "service",
          itemKey: "pinned",
          title: "Pinned",
          summary: null,
          imageUrl: null,
          detailPath: "/services/pinned",
          favoritedAt: new Date("2026-09-18T08:00:00.000Z"),
          activityAt: new Date("2026-09-18T08:00:00.000Z"),
          pinnedAt,
          reaction: null,
          canForward: true,
          canDelete: true
        },
        {
          key: "shop:b",
          type: "shop",
          itemKey: "b",
          title: "B",
          summary: null,
          imageUrl: null,
          detailPath: "/stores/b",
          favoritedAt: new Date("2026-09-19T08:00:00.000Z"),
          activityAt: new Date("2026-09-19T08:00:00.000Z"),
          pinnedAt: null,
          reaction: null,
          canForward: true,
          canDelete: true
        },
        {
          key: "shop:a",
          type: "shop",
          itemKey: "a",
          title: "A",
          summary: null,
          imageUrl: null,
          detailPath: "/stores/a",
          favoritedAt: new Date("2026-09-19T08:00:00.000Z"),
          activityAt: new Date("2026-09-19T08:00:00.000Z"),
          pinnedAt: null,
          reaction: null,
          canForward: true,
          canDelete: true
        }
      ]
    });
    const service = new UserFavoritesService(repository, identityScope as never);

    const result = await service.listFavorites(auth, { page: 1, pageSize: 20 });

    expect(result.list.map((row) => row.key)).toEqual([
      "service:pinned",
      "shop:z",
      "shop:a",
      "shop:b"
    ]);
    expect(result).toMatchObject({ page: 1, page_size: 20, total: 4 });
  });

  it("persists pin and reaction only for a favorite owned by the active user", async () => {
    const repository = makeRepository();
    const service = new UserFavoritesService(repository, identityScope as never);

    await expect(service.setPin(auth, "shop", "shop0000000001", true)).resolves.toMatchObject({
      pinnedAt
    });
    await expect(service.setReaction(auth, "shop", "shop0000000001", "🥰")).resolves.toMatchObject({
      reaction: "🥰"
    });

    expect(repository.owns).toHaveBeenCalledWith({
      userId: 42,
      identityId: 10,
      itemType: "shop",
      itemKey: "shop0000000001"
    });
  });

  it("returns not found instead of creating metadata for an unowned favorite", async () => {
    const repository = makeRepository();
    repository.owns.mockResolvedValueOnce(false);
    const service = new UserFavoritesService(repository, identityScope as never);

    await expect(service.setPin(auth, "social_post", "91", true)).rejects.toMatchObject({
      statusCode: 404,
      message: "error.favorite.not_found"
    });
    expect(repository.setPin).not.toHaveBeenCalled();
  });
});
