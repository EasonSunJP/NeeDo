import type { PrismaClient } from "@prisma/client";
import { RealtimeRepository } from "../src/repositories/realtime.repository";

describe("RealtimeRepository formal identity payloads", () => {
  it("uses the current customer profile name in direct conversations", async () => {
    const createdAt = new Date("2026-09-08T00:00:00.000Z");
    const client = {
      conversation: {
        findMany: jest.fn(async () => [{
          id: 91,
          type: "DIRECT",
          title: null,
          friendshipPairKey: "1370:2370",
          createdByUserId: 137,
          createdAt,
          updatedAt: createdAt,
          deletedAt: null,
          participants: [{
            id: 1,
            conversationId: 91,
            userId: 237,
            identityId: 2370,
            role: "member",
            unreadCount: 0,
            isPinned: false,
            isMuted: false,
            hiddenAt: null,
            createdAt,
            updatedAt: createdAt,
            deletedAt: null,
            identity: { id: 2370, type: "customer", displayName: "旧身份名" },
            user: {
              id: 237,
              needoId: "u0000000237",
              username: "旧账号名",
              avatarUrl: null,
              customerProfile: { displayName: "Eason", deletedAt: null },
              technicianProfile: null
            }
          }],
          messages: []
        }]),
        count: jest.fn(async () => 1)
      }
    } as unknown as PrismaClient;

    const result = await new RealtimeRepository(client).listConversations(1370, {
      page: 1,
      pageSize: 20
    });

    expect(result.list[0]?.participants[0]?.username).toBe("Eason");
  });

  it("uses the current customer profile name in contacts", async () => {
    const createdAt = new Date("2026-09-08T00:00:00.000Z");
    const client = {
      contact: {
        findMany: jest.fn(async () => [{
          id: 4056,
          ownerUserId: 137,
          ownerIdentityId: 1370,
          contactUserId: 237,
          contactIdentityId: 2370,
          nickname: null,
          source: "friend_request",
          blockedAt: null,
          createdAt,
          updatedAt: createdAt,
          deletedAt: null,
          contactIdentity: { id: 2370, type: "customer", displayName: "旧身份名" },
          contactUser: {
            id: 237,
            needoId: "u0000000237",
            username: "旧账号名",
            avatarUrl: null,
            customerProfile: { displayName: "Eason", deletedAt: null },
            technicianProfile: null
          }
        }]),
        count: jest.fn(async () => 1)
      }
    } as unknown as PrismaClient;

    const result = await new RealtimeRepository(client).listContacts(1370, {
      page: 1,
      pageSize: 20
    });

    expect(result.list[0]?.contactUser.username).toBe("Eason");
  });

  it("searches and returns the current customer profile name for add-friend candidates", async () => {
    const client = {
      user: {
        findMany: jest.fn(async () => [{
          id: 237,
          needoId: "u0000000237",
          username: "旧账号名",
          avatarUrl: null,
          identities: [{ id: 2370, type: "customer", displayName: "旧身份名", isDefault: true }],
          customerProfile: { displayName: "Eason", deletedAt: null },
          technicianProfile: null
        }]),
        count: jest.fn(async () => 1)
      }
    } as unknown as PrismaClient;

    const result = await new RealtimeRepository(client).searchDirectory(137, {
      ownerIdentityId: 1370,
      query: "Eason",
      page: 1,
      pageSize: 20
    });

    expect(result.list[0]?.username).toBe("Eason");
    expect(client.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { customerProfile: { is: { displayName: { contains: "Eason" }, deletedAt: null } } }
          ])
        })
      })
    );
  });

  it("returns the current profile name to the IM store after opening contact information", async () => {
    const dbNow = new Date("2026-09-08T00:00:00.000Z");
    const client = {
      $queryRaw: jest.fn(async () => [{ dbNow }]),
      user: {
        findFirst: jest.fn(async () => ({
          id: 237,
          needoId: "u0000000237",
          username: "旧账号名",
          avatarUrl: null,
          identities: [{
            id: 2370,
            type: "customer",
            scopeType: "customer_profile",
            scopeId: 41,
            displayName: "旧身份名",
            isDefault: true
          }],
          customerProfile: {
            id: 41,
            displayName: "Eason",
            bio: null,
            city: null,
            membershipLevel: "standard",
            isPublic: true,
            gender: "private",
            age: null,
            heightCm: null,
            languages: [],
            visibility: "public",
            deletedAt: null,
            reviewSummary: null
          },
          technicianProfile: null
        }))
      }
    } as unknown as PrismaClient;

    const result = await new RealtimeRepository(client).getDirectoryProfile(
      237,
      2370,
      237,
      2370
    );

    expect(result?.user.username).toBe("Eason");
  });

  it("keeps the former direct peer available for the retained history owner", async () => {
    const createdAt = new Date("2026-08-25T00:00:00.000Z");
    const client = {
      conversation: {
        findMany: jest.fn(async () => [
          {
            id: 91,
            type: "DIRECT",
            title: null,
            friendshipPairKey: "1370:2370",
            createdByUserId: 137,
            createdAt,
            updatedAt: createdAt,
            deletedAt: null,
            participants: [
              {
                id: 1,
                conversationId: 91,
                userId: 137,
                identityId: 1370,
                role: "member",
                unreadCount: 0,
                isPinned: false,
                isMuted: false,
                hiddenAt: null,
                createdAt,
                updatedAt: createdAt,
                deletedAt: null,
                user: {
                  id: 137,
                  needoId: "u0000000137",
                  username: "保留历史的一方",
                  avatarUrl: null
                }
              }
            ],
            messages: []
          }
        ]),
        count: jest.fn(async () => 1)
      },
      userIdentity: {
        findMany: jest.fn(async () => [
          {
            id: 2370,
            user: {
              id: 237,
              needoId: "u0000000237",
              username: "已删除好友关系的一方",
              avatarUrl: "/images/generated/profiles/cartoon-profile-03.png"
            }
          }
        ])
      }
    } as unknown as PrismaClient;

    const result = await new RealtimeRepository(client).listConversations(1370, {
      page: 1,
      pageSize: 20
    });

    expect(result.list[0]).toMatchObject({
      participants: [expect.objectContaining({ userId: 137 })],
      directPeer: {
        userId: 237,
        needoId: "u0000000237",
        username: "已删除好友关系的一方",
        avatarUrl: "/images/generated/profiles/cartoon-profile-03.png"
      }
    });
    expect(client.userIdentity.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: [2370] },
        isActive: true,
        deletedAt: null,
        user: { isActive: true, deletedAt: null }
      },
      select: expect.objectContaining({
        id: true,
        type: true,
        user: {
          select: expect.objectContaining({
            id: true,
            needoId: true,
            username: true,
            avatarUrl: true,
            customerProfile: expect.any(Object)
          })
        }
      })
    });
  });

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
                identityId: 2370,
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

    const result = await new RealtimeRepository(client).listConversations(1370, {
      page: 1,
      pageSize: 20
    });

    expect(result.list[0]?.participants[0]).toMatchObject({
      userId: 237,
      needoId: "u0000000237",
      username: "柴田 陽菜",
      avatarUrl: "/images/generated/profiles/cartoon-profile-03.png"
    });
    expect(client.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          participants: expect.objectContaining({
            include: expect.objectContaining({
              identity: expect.objectContaining({ select: expect.objectContaining({ type: true }) }),
              user: {
                select: expect.objectContaining({
                  id: true,
                  needoId: true,
                  username: true,
                  avatarUrl: true,
                  customerProfile: expect.any(Object)
                })
              }
            })
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
        include: expect.objectContaining({
          contactIdentity: expect.objectContaining({ select: expect.objectContaining({ type: true }) }),
          contactUser: {
            select: expect.objectContaining({
              id: true,
              needoId: true,
              username: true,
              avatarUrl: true,
              customerProfile: expect.any(Object)
            })
          }
        })
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
        ownerIdentityId: 137,
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

  it("updates auto translation only on the active identity participant row", async () => {
    const createdAt = new Date("2026-08-31T00:00:00.000Z");
    const participants = [
      { id: 4101, identityId: 410, clearedThroughMessageId: null, createdAt },
      { id: 4102, identityId: 411, clearedThroughMessageId: null, createdAt }
    ];
    const client = {
      conversationParticipant: {
        findFirst: jest.fn(
          async ({ where }: { where: { identityId: number } }) =>
            participants.find((participant) => participant.identityId === where.identityId) ?? null
        ),
        update: jest.fn(async () => ({}))
      }
    } as unknown as PrismaClient;
    const repository = new RealtimeRepository(client) as RealtimeRepository & {
      getConversationForUser: jest.Mock;
    };
    repository.getConversationForUser = jest.fn(async () => null);

    await repository.updateConversationPreferences({
      conversationId: 91,
      userId: 41,
      identityId: 410,
      autoTranslateMessages: true
    });

    expect(client.conversationParticipant.findFirst).toHaveBeenCalledWith({
      where: {
        conversationId: 91,
        identityId: 410,
        deletedAt: null,
        conversation: { deletedAt: null }
      },
      select: { id: true, clearedThroughMessageId: true, createdAt: true }
    });
    expect(client.conversationParticipant.update).toHaveBeenCalledWith({
      where: { id: 4101 },
      data: { autoTranslateMessages: true, hiddenAt: null }
    });
    expect(client.conversationParticipant.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 4102 } })
    );
    expect(client.conversationParticipant.update).toHaveBeenCalledTimes(1);
  });
});

describe("RealtimeRepository customer membership projection", () => {
  it("uses the active platform entitlement instead of the legacy customer profile level", async () => {
    const dbNow = new Date("2026-09-08T03:00:00.000Z");
    const client = {
      $queryRaw: jest.fn(async () => [{ dbNow }]),
      user: {
        findFirst: jest.fn(async () => ({
          id: 2,
          needoId: "u0000000002",
          username: "Eason",
          avatarUrl: null,
          identities: [
            {
              id: 20,
              type: "customer",
              scopeType: "customer_profile",
              scopeId: 3,
              displayName: "Eason",
              isDefault: true
            }
          ],
          platformMembershipEntitlements: [
            { tierVersion: { tier: { code: "BLACK_DIAMOND" } } }
          ],
          customerProfile: {
            id: 3,
            displayName: "Eason",
            bio: null,
            city: null,
            membershipLevel: "standard",
            isPublic: true,
            gender: "private",
            age: 99,
            heightCm: { toString: () => "199" },
            languages: ["ja"],
            visibility: "public",
            deletedAt: null,
            reviewSummary: null
          },
          technicianProfile: null
        }))
      }
    };

    const result = await new RealtimeRepository(
      client as unknown as PrismaClient
    ).getDirectoryProfile(2, 20, 2, 20);

    expect(result?.identityCard).toMatchObject({
      entityType: "user",
      identityLabel: "black_diamond"
    });
    expect(client.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          platformMembershipEntitlements: expect.objectContaining({
            take: 1
          })
        })
      })
    );
  });

  it("falls back to free when a compatibility projection omits entitlements", async () => {
    const dbNow = new Date("2026-09-08T03:00:00.000Z");
    const client = {
      $queryRaw: jest.fn(async () => [{ dbNow }]),
      user: {
        findFirst: jest.fn(async () => ({
          id: 2,
          needoId: "u0000000002",
          username: "Eason",
          avatarUrl: null,
          identities: [
            {
              id: 20,
              type: "customer",
              scopeType: "customer_profile",
              scopeId: 3,
              displayName: "Eason",
              isDefault: true
            }
          ],
          customerProfile: {
            id: 3,
            displayName: "Eason",
            bio: null,
            city: null,
            membershipLevel: "gold",
            isPublic: true,
            gender: "private",
            age: 99,
            heightCm: { toString: () => "199" },
            languages: ["ja"],
            visibility: "public",
            deletedAt: null,
            reviewSummary: null
          },
          technicianProfile: null
        }))
      }
    };

    const result = await new RealtimeRepository(
      client as unknown as PrismaClient
    ).getDirectoryProfile(2, 20, 2, 20);

    expect(result?.identityCard).toMatchObject({
      entityType: "user",
      identityLabel: "free"
    });
  });
});

describe("RealtimeRepository technician contact privacy", () => {
  const dbNow = new Date("2026-09-01T09:00:00.000Z");
  const technicianUser = {
    id: 2,
    needoId: "u0000000002",
    username: "Mika Technician",
    avatarUrl: null,
    identities: [
      {
        id: 20,
        type: "technician",
        scopeType: "technician_profile",
        scopeId: 3,
        displayName: "Mika",
        isDefault: true
      }
    ],
    customerProfile: null,
    technicianProfile: {
      id: 3,
      displayName: "Mika",
      bio: "肩颈护理",
      city: "Tokyo",
      serviceArea: "银座",
      yearsExperience: 4,
      age: 25,
      heightCm: { toString: () => "164" },
      languages: ["日本語", "中文"],
      visibility: "public",
      employmentType: "INDEPENDENT",
      status: "published",
      verifiedAt: dbNow,
      deletedAt: null,
      reviewSummary: {
        ratingAverage: { toString: () => "5.0" },
        reviewCount: 968,
        deletedAt: null
      }
    }
  };
  const technicianDetails = {
    bidBudgetMinJpy: 12_000,
    bidBudgetMaxJpy: 28_000,
    paymentMethods: ["platform", "offline"],
    profileTags: ["肩颈调理", "中文预约"],
    backofficeProfileTags: [
      { id: 1, label: "高完成率" },
      { id: 2, label: "准时" }
    ],
    performanceSummary: {
      completedOrderCount: 1_280,
      acceptanceRateBps: 9_800,
      deletedAt: null
    },
    technicianServices: [
      {
        id: 11,
        shopId: 1,
        name: "肩颈调理",
        priceAmount: 8_800,
        currency: "JPY",
        durationMinutes: 60,
        sortOrder: 0
      }
    ]
  };

  const createClient = (ownerContact: { id: number } | null) => {
    let contactRead = 0;
    return {
      $queryRaw: jest.fn(async () => [{ dbNow }]),
      user: { findFirst: jest.fn(async () => technicianUser) },
      contact: {
        findFirst: jest.fn(async () => {
          contactRead += 1;
          return contactRead === 1 ? ownerContact : ownerContact ? { id: 91 } : null;
        })
      },
      technicianProfile: {
        findFirst: jest.fn(async (input?: unknown) => {
          void input;
          return technicianDetails;
        })
      },
      friendRequest: { findFirst: jest.fn(async () => null) }
    };
  };

  it("returns expanded technician details only for an active unblocked owner contact", async () => {
    const client = createClient({ id: 90 });
    const result = await new RealtimeRepository(
      client as unknown as PrismaClient
    ).getDirectoryProfile(1, 10, 2, 20);

    expect(result).toMatchObject({
      relationship: "friend",
      identityCard: { entityType: "technician", age: 25, heightCm: "164" },
      technicianContactDetails: {
        bidBudgetMinJpy: 12_000,
        bidBudgetMaxJpy: 28_000,
        paymentMethods: ["platform", "offline"],
        specialTags: ["高完成率", "准时"],
        profileTags: ["肩颈调理", "中文预约"],
        completedOrderCount: 1_280,
        acceptanceRateBps: 9_800,
        services: [
          {
            id: 11,
            shopId: 1,
            name: "肩颈调理",
            priceAmount: 8_800,
            currency: "JPY",
            durationMinutes: 60,
            taxIncluded: true,
            sortOrder: 0
          }
        ]
      }
    });
    expect(client.contact.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        ownerIdentityId: 10,
        contactIdentityId: 20,
        deletedAt: null,
        blockedAt: null
      },
      select: { id: true }
    });
    expect(client.technicianProfile.findFirst).toHaveBeenCalledTimes(1);
    const detailQuery = JSON.stringify(client.technicianProfile.findFirst.mock.calls[0]?.[0]);
    expect(detailQuery).not.toContain("baseLatitude");
    expect(detailQuery).not.toContain("baseLongitude");
  });

  it.each(["reverse-only", "pending", "deleted", "blocked"])(
    "omits all expanded fields for %s access",
    async () => {
      const client = createClient(null);
      const result = await new RealtimeRepository(
        client as unknown as PrismaClient
      ).getDirectoryProfile(1, 10, 2, 20);

      expect(result).not.toHaveProperty("technicianContactDetails");
      expect(client.technicianProfile.findFirst).not.toHaveBeenCalled();
    }
  );

  it("omits expanded fields for self lookup without reading contacts", async () => {
    const client = createClient({ id: 90 });
    const result = await new RealtimeRepository(
      client as unknown as PrismaClient
    ).getDirectoryProfile(2, 20, 2, 20);

    expect(result).toMatchObject({ relationship: "self" });
    expect(result).not.toHaveProperty("technicianContactDetails");
    expect(client.contact.findFirst).not.toHaveBeenCalled();
    expect(client.technicianProfile.findFirst).not.toHaveBeenCalled();
  });
});
