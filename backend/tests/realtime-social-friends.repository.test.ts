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
            authorIdentityId: 101,
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
            },
            authorIdentity: { id: 101, type: "customer", displayName: "LifeDance 管理员" }
          }
        ]),
        count: jest.fn(async () => 1)
      },
      follow: {
        findMany: jest.fn(async () => [])
      },
      contact: {
        findMany: jest.fn(async () => [
          { ownerIdentityId: 787, contactIdentityId: 101 },
          { ownerIdentityId: 101, contactIdentityId: 787 }
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
          { ownerIdentityId: 787, contactIdentityId: { in: [101] } },
          { ownerIdentityId: { in: [101] }, contactIdentityId: 787 }
        ]
      },
      select: { ownerIdentityId: true, contactIdentityId: true }
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
            authorIdentityId: 101,
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
            },
            authorIdentity: { id: 101, type: "customer", displayName: "LifeDance 管理员" }
          }
        ]),
        count: jest.fn(async () => 1)
      },
      follow: {
        findMany: jest.fn(async () => [])
      },
      contact: {
        findMany: jest.fn(async () => [{ ownerIdentityId: 787, contactIdentityId: 101 }])
      }
    };

    const result = await new RealtimeRepository(
      client as unknown as PrismaClient
    ).listSocialPosts(787, { page: 1, pageSize: 20 });

    expect(result.list[0]).toMatchObject({ viewerIsFriend: false });
  });
});
