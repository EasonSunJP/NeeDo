import type { PrismaClient } from "@prisma/client";
import { RealtimeRepository } from "../src/repositories/realtime.repository";
import { RealtimeService } from "../src/services/realtime.service";

type ActivityStatusMethod = (input: {
  viewerUserId: number;
  viewerIdentityId?: number;
  targetUserId: number;
  targetIdentityId?: number;
  since: Date;
}) => Promise<unknown>;

const joinedAt = new Date("2026-01-15T00:00:00.000Z");

describe("RealtimeRepository friend activity status", () => {
  const since = new Date("2026-07-28T10:00:00.000Z");
  const latestVisiblePostAt = new Date("2026-08-27T09:00:00.000Z");

  function createClient(post: { createdAt: Date; id: number } | null) {
    return {
      user: {
        findFirst: jest.fn(async () => ({
          id: 237,
          username: "柴田 陽菜",
          avatarUrl: "/images/generated/profiles/cartoon-profile-03.png",
          createdAt: joinedAt,
          identities: [
            {
              id: 1237,
              type: "customer",
              displayName: "柴田 陽菜",
              isDefault: true
            },
            {
              id: 2237,
              type: "technician",
              displayName: "技师 柴田",
              isDefault: false
            }
          ]
        }))
      },
      socialPost: {
        findFirst: jest.fn(async () => post)
      }
    };
  }

  it("uses an author-scoped, visibility-safe post existence query with only avatar media", async () => {
    const client = createClient({ id: 88, createdAt: latestVisiblePostAt });
    const repository = new RealtimeRepository(client as unknown as PrismaClient);
    const method = (repository as unknown as { getSocialActivityStatus?: ActivityStatusMethod })
      .getSocialActivityStatus;

    expect(typeof method).toBe("function");
    if (!method) return;

    await expect(
      method.call(repository, {
        viewerUserId: 137,
        viewerIdentityId: 1137,
        targetUserId: 237,
        targetIdentityId: 1237,
        since
      })
    ).resolves.toEqual({
      status: "recent_posts",
      latestVisiblePostAt,
      profile: {
        userId: 237,
        identityId: 1237,
        username: "柴田 陽菜",
        displayName: "柴田 陽菜",
        avatarUrl: "/images/generated/profiles/cartoon-profile-03.png",
        entityType: "user",
        joinedAt
      }
    });

    expect(client.user.findFirst).toHaveBeenCalledWith({
      where: { id: 237, isActive: true, deletedAt: null },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        createdAt: true,
        customerProfile: {
          select: { displayName: true, deletedAt: true }
        },
        technicianProfile: {
          select: {
            displayName: true,
            deletedAt: true,
            mediaAssets: {
              where: { usageType: "avatar", isActive: true, deletedAt: null },
              orderBy: { id: "desc" },
              take: 1,
              select: { url: true }
            }
          }
        },
        identities: {
          where: { deletedAt: null, isActive: true },
          select: {
            id: true,
            type: true,
            displayName: true,
            isDefault: true,
            merchantIdentityProfile: {
              select: { displayName: true, deletedAt: true }
            }
          },
          orderBy: [{ isDefault: "desc" }, { id: "asc" }]
        }
      }
    });
    expect(client.socialPost.findFirst).toHaveBeenCalledWith({
      where: {
        authorIdentityId: 1237,
        createdAt: { gte: since },
        deletedAt: null,
        OR: [
          { visibility: "PUBLIC" },
          { authorIdentityId: 1137 },
          {
            authorIdentity: {
              followers: {
                some: { followerIdentityId: 1137, deletedAt: null }
              }
            }
          }
        ]
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { createdAt: true, id: true }
    });
  });

  it("returns no_recent_posts without inventing a timestamp", async () => {
    const client = createClient(null);
    const repository = new RealtimeRepository(client as unknown as PrismaClient);
    const method = (repository as unknown as { getSocialActivityStatus?: ActivityStatusMethod })
      .getSocialActivityStatus;

    expect(typeof method).toBe("function");
    if (!method) return;

    await expect(
      method.call(repository, {
        viewerUserId: 137,
        viewerIdentityId: 1137,
        targetUserId: 237,
        targetIdentityId: 1237,
        since
      })
    ).resolves.toMatchObject({
      status: "no_recent_posts",
      latestVisiblePostAt: null
    });
  });

  it("maps the explicitly selected technician identity instead of the account default", async () => {
    const client = createClient(null);
    const repository = new RealtimeRepository(client as unknown as PrismaClient);
    const method = (repository as unknown as { getSocialActivityStatus?: ActivityStatusMethod })
      .getSocialActivityStatus;

    expect(typeof method).toBe("function");
    if (!method) return;

    await expect(
      method.call(repository, {
        viewerUserId: 137,
        viewerIdentityId: 1137,
        targetUserId: 237,
        targetIdentityId: 2237,
        since
      })
    ).resolves.toMatchObject({
      profile: {
        userId: 237,
        identityId: 2237,
        displayName: "技师 柴田",
        entityType: "technician"
      }
    });
  });

  it("rejects an identity that is not active on the target account", async () => {
    const client = createClient(null);
    const repository = new RealtimeRepository(client as unknown as PrismaClient);
    const method = (repository as unknown as { getSocialActivityStatus?: ActivityStatusMethod })
      .getSocialActivityStatus;

    expect(typeof method).toBe("function");
    if (!method) return;

    await expect(
      method.call(repository, {
        viewerUserId: 137,
        viewerIdentityId: 1137,
        targetUserId: 237,
        targetIdentityId: 9999,
        since
      })
    ).resolves.toBeNull();
    expect(client.socialPost.findFirst).not.toHaveBeenCalled();
  });
});

describe("RealtimeService friend activity window", () => {
  it("uses the exact rolling 30-day boundary from a fixed clock", async () => {
    const repository = {
      findCanonicalIdentityIdForUser: jest.fn(async () => 1237),
      getSocialActivityStatus: jest.fn(async () => ({
        status: "no_recent_posts" as const,
        latestVisiblePostAt: null,
        profile: {
          userId: 237,
          username: "柴田 陽菜",
          displayName: "柴田 陽菜",
          avatarUrl: null,
          entityType: "user" as const,
          joinedAt
        }
      }))
    };
    const service = new RealtimeService(repository as never, {
      publish: jest.fn(),
      subscribe: jest.fn()
    });
    const method = (
      service as unknown as {
        getSocialActivityStatus?: (
          auth: { userId: number },
          targetUserId: number,
          targetIdentityId: number | undefined,
          now: Date
        ) => Promise<unknown>;
      }
    ).getSocialActivityStatus;
    const now = new Date("2026-08-27T10:00:00.000Z");

    expect(typeof method).toBe("function");
    if (!method) return;

    await method.call(service, { userId: 137 }, 237, undefined, now);

    expect(repository.getSocialActivityStatus).toHaveBeenCalledWith({
      viewerUserId: 137,
      viewerIdentityId: 137,
      targetUserId: 237,
      targetIdentityId: 1237,
      since: new Date("2026-07-28T10:00:00.000Z")
    });
  });

  it("returns a stable not-found error when the target account is unavailable", async () => {
    const repository = {
      findCanonicalIdentityIdForUser: jest.fn(async () => null),
      getSocialActivityStatus: jest.fn(async () => null)
    };
    const service = new RealtimeService(repository as never, {
      publish: jest.fn(),
      subscribe: jest.fn()
    });
    const method = (
      service as unknown as {
        getSocialActivityStatus?: (
          auth: { userId: number },
          targetUserId: number,
          targetIdentityId: number | undefined,
          now: Date
        ) => Promise<unknown>;
      }
    ).getSocialActivityStatus;

    expect(typeof method).toBe("function");
    if (!method) return;

    await expect(
      method.call(service, { userId: 137 }, 999999, undefined, new Date("2026-08-27T10:00:00.000Z"))
    ).rejects.toMatchObject({
      message: "error.realtime.social_profile_not_found",
      statusCode: 404
    });
  });
});

describe("RealtimeService exact profile identity follows", () => {
  it("uses the requested active identity for follow and unfollow", async () => {
    const repository = {
      findActiveUserIds: jest.fn(async () => [237]),
      findIdentityIdForUser: jest.fn(async () => 2237),
      createFollow: jest.fn(async () => ({ id: 91 })),
      deleteFollow: jest.fn(async () => ({ deleted: true }))
    };
    const publish = jest.fn();
    const service = new RealtimeService(repository as never, {
      publish,
      subscribe: jest.fn()
    });
    const auth = { userId: 137, currentIdentityId: 1137, currentIdentityType: "customer" };

    await service.createFollow(auth as never, {
      targetUserId: 237,
      targetIdentityId: 2237
    });
    await service.deleteFollow(auth as never, 237, 2237);

    expect(repository.findIdentityIdForUser).toHaveBeenNthCalledWith(1, 237, 2237);
    expect(repository.findIdentityIdForUser).toHaveBeenNthCalledWith(2, 237, 2237);
    expect(repository.createFollow).toHaveBeenCalledWith({
      followerUserId: 137,
      followerIdentityId: 1137,
      followingUserId: 237,
      followingIdentityId: 2237
    });
    expect(repository.deleteFollow).toHaveBeenCalledWith(1137, 2237);
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ recipientIdentityId: 2237 }));
  });

  it("rejects an identity that is not active on the target account", async () => {
    const repository = {
      findActiveUserIds: jest.fn(async () => [237]),
      findIdentityIdForUser: jest.fn(async () => null),
      createFollow: jest.fn()
    };
    const service = new RealtimeService(repository as never, {
      publish: jest.fn(),
      subscribe: jest.fn()
    });

    await expect(
      service.createFollow({ userId: 137, currentIdentityId: 1137 } as never, {
        targetUserId: 237,
        targetIdentityId: 9999
      })
    ).rejects.toMatchObject({ message: "error.realtime.user_not_found", statusCode: 404 });
    expect(repository.createFollow).not.toHaveBeenCalled();
  });
});
