import type { PrismaClient } from "@prisma/client";
import { RealtimeRepository } from "../src/repositories/realtime.repository";
import { RealtimeService } from "../src/services/realtime.service";

type ActivityStatusMethod = (input: {
  viewerUserId: number;
  targetUserId: number;
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
              type: "customer",
              displayName: "柴田 陽菜",
              isDefault: true
            }
          ]
        }))
      },
      socialPost: {
        findFirst: jest.fn(async () => post)
      }
    };
  }

  it("uses an author-scoped, visibility-safe existence query without reading media", async () => {
    const client = createClient({ id: 88, createdAt: latestVisiblePostAt });
    const repository = new RealtimeRepository(client as unknown as PrismaClient);
    const method = (repository as unknown as { getSocialActivityStatus?: ActivityStatusMethod })
      .getSocialActivityStatus;

    expect(typeof method).toBe("function");
    if (!method) return;

    await expect(
      method.call(repository, {
        viewerUserId: 137,
        targetUserId: 237,
        since
      })
    ).resolves.toEqual({
      status: "recent_posts",
      latestVisiblePostAt,
      profile: {
        userId: 237,
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
        identities: {
          where: { deletedAt: null, isActive: true },
          select: { type: true, displayName: true, isDefault: true },
          orderBy: [{ isDefault: "desc" }, { id: "asc" }]
        }
      }
    });
    expect(client.socialPost.findFirst).toHaveBeenCalledWith({
      where: {
        authorUserId: 237,
        createdAt: { gte: since },
        deletedAt: null,
        OR: [
          { visibility: "PUBLIC" },
          { authorUserId: 137 },
          {
            author: {
              followers: {
                some: { followerUserId: 137, deletedAt: null }
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
        targetUserId: 237,
        since
      })
    ).resolves.toMatchObject({
      status: "no_recent_posts",
      latestVisiblePostAt: null
    });
  });
});

describe("RealtimeService friend activity window", () => {
  it("uses the exact rolling 30-day boundary from a fixed clock", async () => {
    const repository = {
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
          now: Date
        ) => Promise<unknown>;
      }
    ).getSocialActivityStatus;
    const now = new Date("2026-08-27T10:00:00.000Z");

    expect(typeof method).toBe("function");
    if (!method) return;

    await method.call(service, { userId: 137 }, 237, now);

    expect(repository.getSocialActivityStatus).toHaveBeenCalledWith({
      viewerUserId: 137,
      targetUserId: 237,
      since: new Date("2026-07-28T10:00:00.000Z")
    });
  });

  it("returns a stable not-found error when the target account is unavailable", async () => {
    const repository = {
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
          now: Date
        ) => Promise<unknown>;
      }
    ).getSocialActivityStatus;

    expect(typeof method).toBe("function");
    if (!method) return;

    await expect(
      method.call(
        service,
        { userId: 137 },
        999999,
        new Date("2026-08-27T10:00:00.000Z")
      )
    ).rejects.toMatchObject({
      message: "error.realtime.social_profile_not_found",
      statusCode: 404
    });
  });
});
