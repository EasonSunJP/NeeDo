import { ExchangePostRepository } from "../src/repositories/exchange.repository";

const now = new Date("2026-08-30T03:00:00.000Z");

const demandRow = {
  id: 41,
  authorUserId: 7,
  authorIdentityId: 17,
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
        viewerUserId: 7,
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
            where: { actorUserId: 7, deletedAt: null },
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
      viewerUserId: 7,
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

    await expect(repository.findPostById(41, 7, now)).resolves.toEqual(
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

    await expect(repository.findPostById(41, 7, now)).resolves.toEqual(
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
    await expect(repository.findPostById(41, 7, now)).rejects.toThrow(
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
});
