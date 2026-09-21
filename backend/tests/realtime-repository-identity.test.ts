import type { PrismaClient } from "@prisma/client";
import { RealtimeRepository } from "../src/repositories/realtime.repository";

describe("RealtimeRepository formal identity payloads", () => {
  it("uses the current customer profile name for social post authors", async () => {
    const createdAt = new Date("2026-09-08T00:00:00.000Z");
    const client = {
      socialPost: {
        findMany: jest.fn(async () => [
          {
            id: 71237,
            authorUserId: 237,
            authorIdentityId: 2370,
            content: "测试",
            media: null,
            replyToPostId: null,
            visibility: "PUBLIC",
            createdAt,
            updatedAt: createdAt,
            author: {
              id: 237,
              username: "旧账号名",
              avatarUrl: null,
              createdAt,
              customerProfile: { displayName: "Eason", deletedAt: null },
              technicianProfile: null,
              identities: [{ id: 2370, type: "customer", displayName: "旧身份名", isDefault: true }]
            },
            authorIdentity: {
              id: 2370,
              type: "customer",
              displayName: "旧身份名",
              pinnedSocialPostId: null,
              merchantIdentityProfile: null
            },
            _count: { replies: 0, likes: 0, bookmarks: 0, views: 0, shares: 0 }
          }
        ]),
        count: jest.fn(async () => 1)
      },
      follow: { findMany: jest.fn(async () => []) },
      contact: { findMany: jest.fn(async () => []) },
      socialPostLike: { findMany: jest.fn(async () => []) },
      socialPostBookmark: { findMany: jest.fn(async () => []) },
      socialPostShare: { findMany: jest.fn(async () => []) }
    } as unknown as PrismaClient;

    const result = await new RealtimeRepository(client).listSocialPosts(1370, {
      page: 1,
      pageSize: 20
    });

    expect(result.list[0]?.author.displayName).toBe("Eason");
    expect(client.socialPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          author: {
            select: expect.objectContaining({ customerProfile: expect.any(Object) })
          },
          authorIdentity: {
            select: expect.objectContaining({ merchantIdentityProfile: expect.any(Object) })
          }
        })
      })
    );
  });

  it("uses the technician identity avatar for technician social post authors", async () => {
    const createdAt = new Date("2026-09-08T00:00:00.000Z");
    const post = {
      id: 71238,
      authorUserId: 249,
      authorIdentityId: 251,
      content: "技师动态",
      media: null,
      replyToPostId: null,
      visibility: "PUBLIC",
      createdAt,
      updatedAt: createdAt,
      author: {
        id: 249,
        username: "account fallback",
        avatarUrl: "/account-avatar-must-not-leak.jpg",
        createdAt,
        customerProfile: null,
        technicianProfile: {
          displayName: "CutGirl Tech",
          deletedAt: null,
          mediaAssets: [{ url: "/technician-identity-avatar.jpg" }]
        },
        identities: [{ id: 251, type: "technician", displayName: "CutGirl Tech", isDefault: true }]
      },
      authorIdentity: {
        id: 251,
        type: "technician",
        displayName: "CutGirl Tech",
        pinnedSocialPostId: null,
        merchantIdentityProfile: null
      },
      _count: { replies: 0, likes: 0, bookmarks: 0, views: 0, shares: 0 }
    };
    const client = {
      socialPost: { findMany: jest.fn(async () => [post]), count: jest.fn(async () => 1) },
      follow: { findMany: jest.fn(async () => []) },
      contact: { findMany: jest.fn(async () => []) },
      socialPostLike: { findMany: jest.fn(async () => []) },
      socialPostBookmark: { findMany: jest.fn(async () => []) },
      socialPostShare: { findMany: jest.fn(async () => []) }
    } as unknown as PrismaClient;

    const result = await new RealtimeRepository(client).listSocialPosts(1370, {
      page: 1,
      pageSize: 20
    });

    expect(result.list[0]?.author.avatarUrl).toBe("/technician-identity-avatar.jpg");
  });

  it("uses the current customer profile name in direct conversations", async () => {
    const createdAt = new Date("2026-09-08T00:00:00.000Z");
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

    expect(result.list[0]?.participants[0]?.username).toBe("Eason");
  });

  it("uses the current customer profile name in contacts", async () => {
    const createdAt = new Date("2026-09-08T00:00:00.000Z");
    const client = {
      conversation: { findMany: jest.fn(async () => []) },
      contact: {
        findMany: jest.fn(async () => [
          {
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
          }
        ]),
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
        findMany: jest.fn(async () => [
          {
            id: 237,
            needoId: "u0000000237",
            username: "旧账号名",
            avatarUrl: null,
            identities: [{ id: 2370, type: "customer", displayName: "旧身份名", isDefault: true }],
            customerProfile: {
              displayName: "Eason",
              visibility: "public",
              isPublic: true,
              deletedAt: null
            },
            technicianProfile: null
          }
        ]),
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
    const searchWhere = (client.user.findMany as jest.Mock).mock.calls[0]?.[0]?.where;
    expect(searchWhere).toEqual(expect.objectContaining({ id: { not: 137 } }));
    expect(searchWhere).not.toHaveProperty("NOT");
    expect(client.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                expect.objectContaining({
                  customerProfile: {
                    is: expect.objectContaining({ visibility: "public", isPublic: true })
                  },
                  OR: expect.arrayContaining([
                    {
                      customerProfile: {
                        is: expect.objectContaining({ displayName: { contains: "Eason" } })
                      }
                    }
                  ])
                })
              ])
            })
          ])
        })
      })
    );
  });

  it("uses current profile names in friend-request bootstrap users", async () => {
    const createdAt = new Date("2026-09-08T00:00:00.000Z");
    const expiresAt = new Date("2026-10-08T00:00:00.000Z");
    const participant = (id: number, displayName: string) => ({
      id,
      needoId: `u${String(id).padStart(10, "0")}`,
      username: `old-${id}`,
      avatarUrl: null,
      customerProfile: { displayName, deletedAt: null },
      technicianProfile: null,
    });
    const identity = (id: number) => ({
      id,
      type: "customer",
      displayName: `old-identity-${id}`,
      merchantIdentityProfile: null,
    });
    const client = {
      $queryRaw: jest.fn(async () => [{ dbNow: createdAt }]),
      friendRequest: {
        findMany: jest.fn(async () => [{
          id: 71,
          requesterUserId: 137,
          requesterIdentityId: 1370,
          targetUserId: 237,
          targetIdentityId: 2370,
          requester: participant(137, "Viewer"),
          requesterIdentity: identity(1370),
          target: participant(237, "CutGirl"),
          targetIdentity: identity(2370),
          status: "PENDING",
          message: null,
          respondedAt: null,
          expiresAt,
          expiredAt: null,
          createdAt,
          updatedAt: createdAt,
          deletedAt: null,
        }]),
        count: jest.fn(async () => 1),
      },
    } as unknown as PrismaClient;

    const result = await new RealtimeRepository(client).listFriendRequests(1370, {
      direction: "all", page: 1, pageSize: 20,
    });

    expect(result.list[0]?.target.username).toBe("CutGirl");
    expect(client.friendRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        target: { select: expect.objectContaining({ customerProfile: expect.any(Object) }) },
        targetIdentity: { select: expect.objectContaining({ type: true }) },
      }),
    }));
  });

  it("matches a complete NeeDo ID exactly instead of treating partial IDs as fuzzy names", async () => {
    const client = {
      user: {
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0)
      }
    } as unknown as PrismaClient;

    await new RealtimeRepository(client).searchDirectory(137, {
      ownerIdentityId: 1370,
      query: "needo0000000002",
      page: 1,
      pageSize: 20
    });

    const findMany = client.user.findMany as jest.Mock;
    const serializedWhere = JSON.stringify(findMany.mock.calls[0]?.[0]?.where);
    expect(serializedWhere).toContain('"needoId":{"equals":"needo0000000002"}');
    expect(serializedWhere).not.toContain('"needoId":{"contains":"needo0000000002"}');
  });

  it("keeps profile names on contains-based fuzzy matching", async () => {
    const client = {
      user: {
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0)
      }
    } as unknown as PrismaClient;

    await new RealtimeRepository(client).searchDirectory(137, {
      ownerIdentityId: 1370,
      query: "ason",
      page: 1,
      pageSize: 20
    });

    const findMany = client.user.findMany as jest.Mock;
    const serializedWhere = JSON.stringify(findMany.mock.calls[0]?.[0]?.where);
    expect(serializedWhere).toContain('"displayName":{"contains":"ason"}');
    expect(serializedWhere).not.toContain('"needoId":{"contains":"ason"}');
  });

  it("does not use a private customer identity to bypass a published technician identity", async () => {
    const client = {
      user: {
        findMany: jest.fn(async () => [
          {
            id: 249,
            needoId: "needo0000000002",
            username: "account fallback",
            avatarUrl: "/technician-avatar.jpg",
            identities: [
              { id: 250, type: "customer", displayName: "CutGirl", isDefault: true },
              { id: 251, type: "technician", displayName: "CutGirl Tech", isDefault: false }
            ],
            customerProfile: {
              displayName: "private customer name",
              visibility: "privateAll",
              isPublic: false,
              deletedAt: null
            },
            technicianProfile: {
              displayName: "CutGirl Tech",
              visibility: "public",
              status: "published",
              deletedAt: null,
              mediaAssets: [{ url: "/technician-identity-avatar.jpg" }]
            }
          }
        ]),
        count: jest.fn(async () => 1)
      }
    } as unknown as PrismaClient;

    const result = await new RealtimeRepository(client).searchDirectory(137, {
      ownerIdentityId: 1370,
      query: "CutGirl",
      page: 1,
      pageSize: 20
    });

    expect(result.list[0]?.username).toBe("CutGirl Tech");
    expect(result.list[0]?.avatarUrl).toBe("/technician-identity-avatar.jpg");
    expect(client.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                expect.objectContaining({
                  customerProfile: {
                    is: expect.objectContaining({ visibility: "public", isPublic: true })
                  }
                }),
                expect.objectContaining({
                  technicianProfile: {
                    is: expect.objectContaining({ visibility: "public", status: "published" })
                  }
                })
              ])
            })
          ])
        })
      })
    );
  });

  it("keeps add-friend results in personal identity scope for collation-equivalent names", async () => {
    const client = {
      user: {
        findMany: jest.fn(async () => [
          {
            id: 237,
            needoId: "u0000000237",
            username: "旧账号名",
            avatarUrl: null,
            identities: [
              {
                id: 2369,
                type: "merchant_owner",
                displayName: "Jose Merchant",
                isDefault: true,
                merchantIdentityProfile: {
                  displayName: "Jose Merchant",
                  deletedAt: null
                }
              },
              { id: 2370, type: "customer", displayName: "旧身份名", isDefault: false }
            ],
            customerProfile: {
              displayName: "José",
              visibility: "public",
              isPublic: true,
              deletedAt: null
            },
            technicianProfile: {
              displayName: "旧技师名",
              visibility: "public",
              status: "published",
              deletedAt: null
            }
          }
        ]),
        count: jest.fn(async () => 1)
      }
    } as unknown as PrismaClient;

    const result = await new RealtimeRepository(client).searchDirectory(137, {
      ownerIdentityId: 1370,
      query: "jose",
      page: 1,
      pageSize: 20
    });

    expect(result.list[0]?.username).toBe("José");
    expect(client.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          identities: {
            some: {
              type: { in: ["customer", "user", "u", "technician", "scout"] },
              isActive: true,
              deletedAt: null
            }
          }
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
          identities: [
            {
              id: 2370,
              type: "customer",
              scopeType: "customer_profile",
              scopeId: 41,
              displayName: "旧身份名",
              isDefault: true
            }
          ],
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

    const result = await new RealtimeRepository(client).getDirectoryProfile(237, 2370, 237, 2370);

    expect(result?.user.username).toBe("Eason");
  });

  it("keeps the contacted identity name when an account has multiple identity names", async () => {
    const dbNow = new Date("2026-09-08T00:00:00.000Z");
    const client = {
      $queryRaw: jest.fn(async () => [{ dbNow }]),
      user: {
        findFirst: jest.fn(async () => ({
          id: 237,
          needoId: "u0000000237",
          username: "旧账号名",
          avatarUrl: null,
          identities: [
            {
              id: 2370,
              type: "customer",
              scopeType: "customer_profile",
              scopeId: 41,
              displayName: "Eason",
              isDefault: true
            },
            {
              id: 2380,
              type: "operations",
              scopeType: null,
              scopeId: null,
              displayName: "LifeDance 管理员",
              isDefault: false
            }
          ],
          platformMembershipEntitlements: [],
          membershipAdjustments: [],
          customerProfile: {
            id: 41,
            displayName: "Eason",
            bio: null,
            city: null,
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
      },
      contact: {
        findFirst: jest.fn(async ({ where }: { where: { contactUserId?: number } }) =>
          where.contactUserId ? { id: 4056, contactIdentityId: 2380, blockedAt: null } : null
        )
      },
      friendRequest: { findFirst: jest.fn(async () => null) }
    } as unknown as PrismaClient;

    const result = await new RealtimeRepository(client).getDirectoryProfile(137, 1370, 237, null);

    expect(result?.identityCard.displayName).toBe("LifeDance 管理员");
    expect(result?.user.username).toBe("LifeDance 管理员");
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
              identity: expect.objectContaining({
                select: expect.objectContaining({ type: true })
              }),
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
      conversation: { findMany: jest.fn(async () => []) },
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
          contactIdentity: expect.objectContaining({
            select: expect.objectContaining({ type: true })
          }),
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
          platformMembershipEntitlements: [{ tierVersion: { tier: { code: "BLACK_DIAMOND" } } }],
          membershipAdjustments: [],
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
            where: expect.objectContaining({
              tierVersion: expect.objectContaining({
                status: { in: ["PUBLISHED", "ARCHIVED"] }
              })
            }),
            take: 1
          }),
          membershipAdjustments: expect.objectContaining({ take: 1 })
        })
      })
    );
  });

  it("uses the latest effective membership adjustment before an entitlement", async () => {
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
          platformMembershipEntitlements: [{ tierVersion: { tier: { code: "GOLD" } } }],
          membershipAdjustments: [{ tierVersion: { tier: { code: "FREE" } } }],
          customerProfile: {
            id: 3,
            displayName: "Eason",
            bio: null,
            city: null,
            membershipLevel: "gold",
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
    };

    const result = await new RealtimeRepository(
      client as unknown as PrismaClient
    ).getDirectoryProfile(2, 20, 2, 20);

    expect(result?.identityCard).toMatchObject({
      entityType: "user",
      identityLabel: "free"
    });
    expect(client.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          membershipAdjustments: expect.objectContaining({
            where: {
              deletedAt: null,
              supersededAt: null,
              effectiveFrom: { lte: dbNow },
              tierVersionId: { not: null }
            },
            orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
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
          membershipAdjustments: [],
          platformMembershipEntitlements: [],
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
        source: "friend_request",
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
