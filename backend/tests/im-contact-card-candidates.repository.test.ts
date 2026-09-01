import { describe, expect, it, jest } from "@jest/globals";
import { RealtimeRepository } from "../src/repositories/realtime.repository";

const self = {
  id: 41,
  needoId: "u0000000041",
  username: "山田太郎",
  avatarUrl: "/media/self.jpg"
};

const friend = {
  id: 52,
  needoId: "u0000000052",
  username: "佐藤花子",
  avatarUrl: null
};

describe("RealtimeRepository contact-card candidates", () => {
  it("returns self once, then unique reciprocal active friends without internal IDs", async () => {
    const client = {
      user: {
        findFirst: jest.fn(async () => self),
        findMany: jest.fn(async () => [friend]),
        count: jest.fn(async () => 1)
      }
    };
    const repository = new RealtimeRepository(client as never);

    await expect(repository.listContactCardCandidates(41, 410, {
      page: 1,
      pageSize: 20,
      query: ""
    })).resolves.toEqual({
      list: [
        {
          targetUserId: "u0000000041",
          needoId: "u0000000041",
          nickname: "山田太郎",
          avatarUrl: "/media/self.jpg",
          relationship: "self"
        },
        {
          targetUserId: "u0000000052",
          needoId: "u0000000052",
          nickname: "佐藤花子",
          avatarUrl: null,
          relationship: "friend"
        }
      ],
      total: 2,
      page: 1,
      page_size: 20
    });

    expect(client.user.findMany).toHaveBeenCalledWith({
      where: {
        id: { not: 41 },
        isActive: true,
        deletedAt: null,
        contactEntries: {
          some: {
            ownerIdentityId: 410,
            blockedAt: null,
            deletedAt: null,
            contactIdentity: {
              isActive: true,
              deletedAt: null,
              ownedContacts: {
                some: {
                  contactIdentityId: 410,
                  blockedAt: null,
                  deletedAt: null
                }
              }
            }
          }
        }
      },
      select: {
        id: true,
        needoId: true,
        username: true,
        avatarUrl: true
      },
      skip: 0,
      take: 19,
      orderBy: [{ username: "asc" }, { needoId: "asc" }, { id: "asc" }]
    });
  });

  it("keeps self pinned while applying stable pagination to friends", async () => {
    const client = {
      user: {
        findFirst: jest.fn(async () => self),
        findMany: jest.fn(async () => [friend]),
        count: jest.fn(async () => 5)
      }
    };
    const repository = new RealtimeRepository(client as never);

    const page = await repository.listContactCardCandidates(41, 410, {
      page: 2,
      pageSize: 2,
      query: "u000"
    });

    expect(page).toMatchObject({ total: 6, page: 2, page_size: 2 });
    expect(page.list).toEqual([
      {
        targetUserId: "u0000000052",
        needoId: "u0000000052",
        nickname: "佐藤花子",
        avatarUrl: null,
        relationship: "friend"
      }
    ]);
    expect(client.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 1,
      take: 2,
      where: expect.objectContaining({
        OR: [
          { username: { contains: "u000" } },
          { needoId: { contains: "u000" } }
        ]
      })
    }));
  });

  it("does not reserve a page slot when self does not match the search", async () => {
    const client = {
      user: {
        findFirst: jest.fn(async () => null),
        findMany: jest.fn(async () => [friend]),
        count: jest.fn(async () => 1)
      }
    };

    const page = await new RealtimeRepository(client as never)
      .listContactCardCandidates(41, 410, { page: 1, pageSize: 1, query: "佐藤" });

    expect(page.total).toBe(1);
    expect(page.list).toHaveLength(1);
    expect(client.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 0,
      take: 1
    }));
  });
});
