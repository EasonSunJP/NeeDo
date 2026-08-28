import type { PrismaClient } from "@prisma/client";
import { RealtimeRepository } from "../src/repositories/realtime.repository";

describe("RealtimeRepository formal identity payloads", () => {
  it("returns the immutable NeeDoID with conversation participants", async () => {
    const createdAt = new Date("2026-08-25T00:00:00.000Z");
    const client = {
      conversation: {
        findMany: jest.fn(async () => [
          {
            id: 91,
            type: "DIRECT",
            title: null,
            createdByUserId: 137,
            createdAt,
            updatedAt: createdAt,
            deletedAt: null,
            participants: [
              {
                id: 1,
                conversationId: 91,
                userId: 237,
                role: "member",
                unreadCount: 0,
                isPinned: false,
                isMuted: false,
                hiddenAt: null,
                createdAt,
                updatedAt: createdAt,
                deletedAt: null,
                user: {
                  id: 237,
                  needoId: "u0000000237",
                  username: "柴田 陽菜",
                  avatarUrl: "/images/generated/profiles/cartoon-profile-03.png"
                }
              }
            ],
            messages: []
          }
        ]),
        count: jest.fn(async () => 1)
      }
    } as unknown as PrismaClient;

    const result = await new RealtimeRepository(client).listConversations(137, {
      page: 1,
      pageSize: 20
    });

    expect(result.list[0]?.participants[0]).toEqual({
      userId: 237,
      needoId: "u0000000237",
      username: "柴田 陽菜",
      avatarUrl: "/images/generated/profiles/cartoon-profile-03.png"
    });
    expect(client.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          participants: expect.objectContaining({
            include: {
              user: {
                select: {
                  id: true,
                  needoId: true,
                  username: true,
                  avatarUrl: true
                }
              }
            }
          })
        })
      })
    );
  });

  it("returns the immutable NeeDoID and persisted profile with every contact", async () => {
    const createdAt = new Date("2026-08-25T00:00:00.000Z");
    const client = {
      contact: {
        findMany: jest.fn(async () => [
          {
            id: 4056,
            ownerUserId: 137,
            contactUserId: 237,
            nickname: null,
            source: "simulation_seed",
            blockedAt: createdAt,
            createdAt,
            updatedAt: createdAt,
            deletedAt: null,
            contactUser: {
              id: 237,
              needoId: "u0000000237",
              username: "柴田 陽菜",
              avatarUrl: "/images/generated/profiles/cartoon-profile-03.png"
            }
          }
        ]),
        count: jest.fn(async () => 1)
      }
    } as unknown as PrismaClient;

    const result = await new RealtimeRepository(client).listContacts(137, {
      page: 1,
      pageSize: 20
    });

    expect(result.list[0]).toMatchObject({
      id: 4056,
      contactUserId: 237,
      isBlocked: true,
      contactUser: {
        userId: 237,
        needoId: "u0000000237",
        username: "柴田 陽菜",
        avatarUrl: "/images/generated/profiles/cartoon-profile-03.png"
      }
    });
    expect(client.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          contactUser: {
            select: {
              id: true,
              needoId: true,
              username: true,
              avatarUrl: true
            }
          }
        }
      })
    );
  });

  it("updates block state only for a contact owned by the authenticated user", async () => {
    const createdAt = new Date("2026-08-25T00:00:00.000Z");
    const updatedContact = {
      id: 4056,
      ownerUserId: 137,
      contactUserId: 237,
      nickname: null,
      source: "simulation_seed",
      blockedAt: createdAt,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      contactUser: {
        id: 237,
        needoId: "n0000000237",
        username: "柴田 陽菜",
        avatarUrl: "/images/generated/profiles/cartoon-profile-03.png"
      }
    };
    const client = {
      contact: {
        findFirst: jest.fn(async () => ({ id: 4056, blockedAt: null })),
        update: jest.fn(async () => updatedContact)
      }
    } as unknown as PrismaClient;
    const repository = new RealtimeRepository(client) as RealtimeRepository & {
      setContactBlocked: (input: {
        contactId: number;
        isBlocked: boolean;
        ownerUserId: number;
      }) => Promise<unknown>;
    };

    const result = await repository.setContactBlocked({
      contactId: 4056,
      isBlocked: true,
      ownerUserId: 137
    });

    expect(client.contact.findFirst).toHaveBeenCalledWith({
      where: {
        id: 4056,
        ownerUserId: 137,
        deletedAt: null,
        contactUser: { deletedAt: null, isActive: true }
      },
      select: { blockedAt: true, id: true }
    });
    expect(client.contact.update).toHaveBeenCalledWith({
      where: { id: 4056 },
      data: { blockedAt: expect.any(Date) },
      include: expect.any(Object)
    });
    expect(result).toMatchObject({ id: 4056, isBlocked: true });
  });
});
