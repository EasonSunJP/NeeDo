import type { PrismaClient } from "@prisma/client";
import { RealtimeRepository } from "../src/repositories/realtime.repository";

describe("RealtimeRepository Social friends", () => {
  it("marks an active bilateral contact as a friend without inventing follow rows", async () => {
    const createdAt = new Date("2026-08-29T18:40:21.517Z");
    const client = {
      socialPost: {
        findMany: jest.fn(async () => [
          {
            id: 64774,
            authorUserId: 1,
            content: "123456788888888",
            media: null,
            visibility: "PUBLIC",
            createdAt,
            updatedAt: createdAt,
            deletedAt: null,
            author: {
              id: 1,
              username: "LifeDance 管理员",
              avatarUrl: null,
              createdAt,
              identities: []
            }
          }
        ]),
        count: jest.fn(async () => 1)
      },
      follow: {
        findMany: jest.fn(async () => [])
      },
      contact: {
        findMany: jest.fn(async () => [
          { ownerUserId: 787, contactUserId: 1 },
          { ownerUserId: 1, contactUserId: 787 }
        ])
      }
    };

    const result = await new RealtimeRepository(
      client as unknown as PrismaClient
    ).listSocialPosts(787, { page: 1, pageSize: 20 });

    expect(result.list[0]).toMatchObject({
      authorUserId: 1,
      viewerFollowsAuthor: false,
      authorFollowsViewer: false,
      viewerIsFriend: true
    });
    expect(client.contact.findMany).toHaveBeenCalledWith({
      where: {
        blockedAt: null,
        deletedAt: null,
        OR: [
          { ownerUserId: 787, contactUserId: { in: [1] } },
          { ownerUserId: { in: [1] }, contactUserId: 787 }
        ]
      },
      select: { ownerUserId: true, contactUserId: true }
    });
  });

  it("does not treat a one-way contact as a friend", async () => {
    const createdAt = new Date("2026-08-29T18:40:21.517Z");
    const client = {
      socialPost: {
        findMany: jest.fn(async () => [
          {
            id: 64774,
            authorUserId: 1,
            content: "123456788888888",
            media: null,
            visibility: "PUBLIC",
            createdAt,
            updatedAt: createdAt,
            deletedAt: null,
            author: {
              id: 1,
              username: "LifeDance 管理员",
              avatarUrl: null,
              createdAt,
              identities: []
            }
          }
        ]),
        count: jest.fn(async () => 1)
      },
      follow: {
        findMany: jest.fn(async () => [])
      },
      contact: {
        findMany: jest.fn(async () => [{ ownerUserId: 787, contactUserId: 1 }])
      }
    };

    const result = await new RealtimeRepository(
      client as unknown as PrismaClient
    ).listSocialPosts(787, { page: 1, pageSize: 20 });

    expect(result.list[0]).toMatchObject({ viewerIsFriend: false });
  });
});
