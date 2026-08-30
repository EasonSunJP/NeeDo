import { ExchangePostRepository } from "../src/repositories/exchange.repository";

const now = new Date("2026-08-30T03:00:00.000Z");

const demandRow = {
  id: 41,
  authorUserId: 7,
  authorIdentityId: 17,
  ownerIdentityId: 17,
  publisherPublicId: "NC12345678",
  publisherIdentityType: "customer",
  publisherDisplayName: "佐藤 美咲",
  publisherAvatarUrl: "https://example.test/avatar.jpg",
  type: "DEMAND",
  status: "PUBLISHED",
  title: "渋谷でヘアセットをお願いしたい",
  detail: "イベント前にお願いします。",
  contentLocale: "JA",
  areaLabel: "渋谷区",
  serviceStartAt: new Date("2026-08-31T00:00:00.000Z"),
  serviceEndAt: new Date("2026-08-31T01:00:00.000Z"),
  expiresAt: new Date("2026-08-31T08:30:00.000Z"),
  withdrawnAt: null,
  createdAt: new Date("2026-08-30T02:00:00.000Z"),
  updatedAt: new Date("2026-08-30T02:00:00.000Z"),
  deletedAt: null,
  demand: { budgetMinJpy: 8_000, budgetMaxJpy: 12_000 },
  intelligence: null,
  likes: [{ id: 91 }],
  _count: { comments: 4, likes: 21, shares: 5 }
};

describe("ExchangePostRepository", () => {
  it("resolves only the exact active identity and public NeeDo id", async () => {
    const findFirst = jest.fn(async () => ({
      id: 17,
      userId: 7,
      type: "customer",
      scopeType: "customer_profile",
      scopeId: 27,
      displayName: "佐藤 美咲",
      publicIdentifier: { publicId: "NC12345678", status: "ACTIVE", deletedAt: null },
      user: { username: "fallback", avatarUrl: null, needoId: "NC12345678" }
    }));
    const repository = new ExchangePostRepository({
      userIdentity: { findFirst }
    } as never);

    await expect(
      repository.resolveActor({
        userId: 7,
        identityId: 17,
        identityType: "customer",
        scopeType: "customer_profile",
        scopeId: 27,
        publicId: "NC12345678"
      })
    ).resolves.toEqual({
      userId: 7,
      identityId: 17,
      identityType: "customer",
      scopeType: "customer_profile",
      scopeId: 27,
      publicId: "NC12345678",
      displayName: "佐藤 美咲",
      avatarUrl: null
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 17,
        userId: 7,
        type: "customer",
        scopeType: "customer_profile",
        scopeId: 27,
        isActive: true,
        deletedAt: null,
        user: { is: { isActive: true, deletedAt: null } },
      },
      select: {
        id: true,
        userId: true,
        type: true,
        scopeType: true,
        scopeId: true,
        displayName: true,
        publicIdentifier: { select: { publicId: true, status: true, deletedAt: true } },
        user: { select: { username: true, avatarUrl: true, needoId: true } }
      }
    });
  });

  it("accepts the authenticated shared primary NeeDo id for a customer identity", async () => {
    const findFirst = jest.fn(async () => ({
      id: 18,
      userId: 7,
      type: "customer",
      scopeType: "customer_profile",
      scopeId: 27,
      displayName: "佐藤 美咲",
      publicIdentifier: null,
      user: { username: "fallback", avatarUrl: null, needoId: "needo0000000041" }
    }));
    const repository = new ExchangePostRepository({
      userIdentity: { findFirst }
    } as never);

    await expect(
      repository.resolveActor({
        userId: 7,
        identityId: 18,
        identityType: "customer",
        scopeType: "customer_profile",
        scopeId: 27,
        publicId: "needo0000000041"
      })
    ).resolves.toEqual({
      userId: 7,
      identityId: 18,
      identityType: "customer",
      scopeType: "customer_profile",
      scopeId: 27,
      publicId: "needo0000000041",
      displayName: "佐藤 美咲",
      avatarUrl: null
    });
  });

  it("lists a filtered page with persisted counts and no internal identity ids", async () => {
    const findMany = jest.fn(async () => [demandRow]);
    const count = jest.fn(async () => 20);
    const repository = new ExchangePostRepository({
      exchangePost: { findMany, count }
    } as never);

    await expect(
      repository.listPosts({
        type: "demand",
        page: 2,
        pageSize: 10,
        viewerIdentityId: 17,
        now
      })
    ).resolves.toEqual({
      list: [
        {
          id: 41,
          type: "demand",
          status: "published",
          title: "渋谷でヘアセットをお願いしたい",
          detail: "イベント前にお願いします。",
          contentLocale: "ja",
          areaLabel: "渋谷区",
          serviceStartAt: "2026-08-31T00:00:00.000Z",
          serviceEndAt: "2026-08-31T01:00:00.000Z",
          expiresAt: "2026-08-31T08:30:00.000Z",
          publishedAt: "2026-08-30T02:00:00.000Z",
          publisher: {
            publicId: "NC12345678",
            identityType: "customer",
            displayName: "佐藤 美咲",
            avatarUrl: "https://example.test/avatar.jpg"
          },
          counts: { comments: 4, likes: 21, shares: 5 },
          viewer: { liked: true, canWithdraw: true },
          demand: { budgetMinJpy: 8_000, budgetMaxJpy: 12_000 },
          intelligence: null
        }
      ],
      total: 20,
      page: 2,
      page_size: 10
    });

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          type: "DEMAND",
          status: "PUBLISHED",
          expiresAt: { gt: now },
          deletedAt: null
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: 10,
        take: 10,
        include: expect.objectContaining({
          demand: { where: { deletedAt: null } },
          intelligence: { where: { deletedAt: null } },
          likes: {
            where: { actorIdentityId: 17, deletedAt: null },
            select: { id: true },
            take: 1
          },
          _count: {
            select: {
              comments: { where: { deletedAt: null } },
              likes: { where: { deletedAt: null } },
              shares: { where: { deletedAt: null } }
            }
          }
        })
      })
    );
    expect(count).toHaveBeenCalledWith({
      where: {
        type: "DEMAND",
        status: "PUBLISHED",
        expiresAt: { gt: now },
        deletedAt: null
      }
    });
    expect(JSON.stringify((await findMany.mock.results[0]?.value) ?? [])).toContain("authorUserId");
    const response = await repository.listPosts({
      type: "demand",
      page: 1,
      pageSize: 20,
      viewerIdentityId: 17,
      now
    });
    expect(JSON.stringify(response)).not.toContain("authorUserId");
    expect(JSON.stringify(response)).not.toContain("authorIdentityId");
  });

  it("derives an expired status at read time and disables withdrawal", async () => {
    const expiredRow = {
      ...demandRow,
      expiresAt: new Date("2026-08-30T02:59:59.000Z"),
      likes: []
    };
    const findFirst = jest.fn(async () => expiredRow);
    const repository = new ExchangePostRepository({
      exchangePost: { findFirst }
    } as never);

    await expect(repository.findPostById(41, 17, now)).resolves.toEqual(
      expect.objectContaining({
        id: 41,
        status: "expired",
        viewer: { liked: false, canWithdraw: false }
      })
    );
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 41, deletedAt: null },
        include: expect.any(Object)
      })
    );
  });

  it("maps intelligence service areas and fails closed on invalid JSON", async () => {
    const validRow = {
      ...demandRow,
      authorUserId: 8,
      type: "INTELLIGENCE",
      publisherIdentityType: "technician",
      demand: null,
      intelligence: {
        serviceMode: "ONSITE",
        addressLabel: null,
        serviceAreas: ["渋谷区", "港区"],
        originalPriceJpy: 15_000,
        campaignPriceJpy: 10_000
      },
      likes: []
    };
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(validRow)
      .mockResolvedValueOnce({
        ...validRow,
        intelligence: { ...validRow.intelligence, serviceAreas: { area: "渋谷区" } }
      });
    const repository = new ExchangePostRepository({
      exchangePost: { findFirst }
    } as never);

    await expect(repository.findPostById(41, 17, now)).resolves.toEqual(
      expect.objectContaining({
        type: "intelligence",
        demand: null,
        intelligence: {
          serviceMode: "onsite",
          addressLabel: null,
          serviceAreas: ["渋谷区", "港区"],
          originalPriceJpy: 15_000,
          campaignPriceJpy: 10_000
        }
      })
    );
    await expect(repository.findPostById(41, 17, now)).rejects.toThrow(
      "error.exchange.invalid_service_areas"
    );
  });

  it("lists comments in stable order and omits internal actor ids", async () => {
    const commentRow = {
      id: 301,
      postId: 41,
      authorUserId: 9,
      authorIdentityId: 19,
      authorPublicId: "NT87654321",
      authorIdentityType: "technician",
      authorDisplayName: "田中 彩",
      authorAvatarUrl: null,
      content: "時間の調整は可能ですか？",
      createdAt: new Date("2026-08-30T02:30:00.000Z")
    };
    const findMany = jest.fn(async () => [commentRow]);
    const count = jest.fn(async () => 4);
    const repository = new ExchangePostRepository({
      exchangeComment: { findMany, count }
    } as never);

    const result = await repository.listComments(41, { page: 1, pageSize: 10 });

    expect(result).toEqual({
      list: [
        {
          id: 301,
          postId: 41,
          author: {
            publicId: "NT87654321",
            identityType: "technician",
            displayName: "田中 彩",
            avatarUrl: null
          },
          content: "時間の調整は可能ですか？",
          createdAt: "2026-08-30T02:30:00.000Z"
        }
      ],
      total: 4,
      page: 1,
      page_size: 10
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { postId: 41, deletedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: 0,
      take: 10
    });
    expect(count).toHaveBeenCalledWith({ where: { postId: 41, deletedAt: null } });
    expect(JSON.stringify(result)).not.toContain("authorUserId");
    expect(JSON.stringify(result)).not.toContain("authorIdentityId");
  });

  it("publishes the matching subtype and audit in one transaction, then replays by key", async () => {
    const created = demandRow;
    const transaction = {
      exchangePost: {
        findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(created),
        create: jest.fn(async () => created)
      },
      auditLog: {
        create: jest.fn(async (input: { data: { targetId: number | null } }) => ({
          id: input.data.targetId ?? 1
        }))
      }
    };
    const client = {
      $transaction: jest.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
      )
    };
    const repository = new ExchangePostRepository(client as never);
    const input = {
      actor: {
        userId: 7,
        identityId: 17,
        identityType: "customer",
        scopeType: "customer_profile",
        scopeId: 27,
        publicId: "NC12345678",
        displayName: "佐藤 美咲",
        avatarUrl: null
      },
      input: {
        type: "demand" as const,
        title: demandRow.title,
        detail: demandRow.detail,
        contentLocale: "ja" as const,
        areaLabel: demandRow.areaLabel,
        serviceStartAt: demandRow.serviceStartAt,
        serviceEndAt: demandRow.serviceEndAt,
        expiresAt: demandRow.expiresAt,
        budgetMinJpy: 8_000,
        budgetMaxJpy: 12_000
      },
      idempotencyKey: "publish-demand-0001",
      audit: {
        actorId: 7,
        action: "exchange.post.publish",
        targetType: "ExchangePost"
      },
      now
    };

    await expect(repository.publishPost(input)).resolves.toEqual({
      kind: "success",
      value: expect.objectContaining({
        id: 41,
        demand:
          input.input.type === "demand"
            ? {
                budgetMinJpy: 8_000,
                budgetMaxJpy: 12_000
              }
            : null
      })
    });
    expect(transaction.exchangePost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          authorUserId: 7,
          authorIdentityId: 17,
          ownerIdentityId: 17,
          publisherPublicId: "NC12345678",
          type: "DEMAND",
          status: "PUBLISHED",
          idempotencyKey: "publish-demand-0001",
          demand: {
            create: {
              budgetMinJpy: 8_000,
              budgetMaxJpy: 12_000,
              addressLine1: "渋谷区"
            }
          }
        }),
        include: expect.any(Object)
      })
    );
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 7,
        action: "exchange.post.publish",
        targetType: "ExchangePost",
        targetId: 41
      })
    });

    await expect(repository.publishPost(input)).resolves.toEqual({
      kind: "replayed",
      value: expect.objectContaining({ id: 41 })
    });
    expect(transaction.exchangePost.create).toHaveBeenCalledTimes(1);
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("restores a soft-deleted like and returns persisted live counts atomically", async () => {
    const transaction = {
      exchangePost: {
        findFirst: jest.fn(async () => ({ id: 41 }))
      },
      exchangeLike: {
        findUnique: jest.fn(async () => ({ id: 91, deletedAt: now })),
        update: jest.fn(async () => ({ id: 91 })),
        count: jest.fn(async () => 21)
      },
      exchangeComment: { count: jest.fn(async () => 4) },
      exchangeShare: { count: jest.fn(async () => 5) },
      auditLog: {
        create: jest.fn(async (input: { data: { targetId: number | null } }) => ({
          id: input.data.targetId ?? 1
        }))
      }
    };
    const client = {
      $transaction: jest.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
      )
    };
    const repository = new ExchangePostRepository(client as never);

    await expect(
      repository.setLike({
        actor: {
          userId: 7,
          identityId: 17,
          identityType: "customer",
          scopeType: "customer_profile",
          scopeId: 27,
          publicId: "NC12345678",
          displayName: "佐藤 美咲",
          avatarUrl: null
        },
        postId: 41,
        liked: true,
        idempotencyKey: "relike-key-000001",
        audit: {
          actorId: 7,
          action: "exchange.post.like",
          targetType: "ExchangePost",
          targetId: 41
        },
        now
      })
    ).resolves.toEqual({ kind: "success", value: { comments: 4, likes: 21, shares: 5 } });
    expect(transaction.exchangeLike.update).toHaveBeenCalledWith({
      where: { id: 91 },
      data: { actorIdentityId: 17, deletedAt: null, updatedAt: now }
    });
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(1);
    expect(client.$transaction).toHaveBeenCalledTimes(1);
  });

  it("expires only claimed live rows and audits each successful transition", async () => {
    const transaction = {
      exchangePost: {
        findMany: jest.fn(async () => [{ id: 41 }, { id: 42 }, { id: 43 }]),
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 })
          .mockResolvedValueOnce({ count: 1 })
      },
      auditLog: {
        create: jest.fn(async (input: { data: { targetId: number | null } }) => ({
          id: input.data.targetId ?? 1
        }))
      }
    };
    const client = {
      $transaction: jest.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
      )
    };
    const repository = new ExchangePostRepository(client as never);

    await expect(repository.expireDue(now, 3)).resolves.toBe(2);
    expect(transaction.exchangePost.findMany).toHaveBeenCalledWith({
      where: { status: "PUBLISHED", expiresAt: { lte: now }, deletedAt: null },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take: 3,
      select: { id: true }
    });
    expect(transaction.exchangePost.updateMany).toHaveBeenCalledTimes(3);
    expect(transaction.auditLog.create.mock.calls.map(([call]) => call.data.targetId)).toEqual([
      41, 43
    ]);
  });
});
