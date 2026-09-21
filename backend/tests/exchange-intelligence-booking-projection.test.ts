import { ExchangePostRepository } from "../src/repositories/exchange.repository";

const now = new Date("2026-09-05T03:00:00.000Z");

const shop = () => ({
  id: 11,
  name: "青山ケア",
  city: "港区",
  address: "港区青山1-1",
  status: "published",
  deletedAt: null,
  publicIdentifier: {
    publicId: "shop0000000011",
    kind: "SHOP",
    status: "ACTIVE",
    deletedAt: null
  },
  entitySuspensions: [],
  mediaAssets: [
    { url: "https://cdn.example.test/shop-cover.jpg", usageType: "cover", sortOrder: 1 },
    { url: "https://cdn.example.test/shop-avatar.jpg", usageType: "avatar", sortOrder: 2 }
  ],
  reviewSummary: {
    ratingAverage: { toString: () => "4.80" },
    reviewCount: 32,
    deletedAt: null
  },
  _count: { bookingOrders: 73, entityFavorites: 8, entityShareEvents: 6 }
});

const shopService = () => ({
  id: 501,
  publicId: "8cda1456-10d0-4e1e-ae9c-a24a20943614",
  shopId: 11,
  name: "訪問ヘアセット",
  description: "イベント向けの訪問ヘアセットです。",
  city: "港区",
  serviceMode: "home",
  priceAmount: { toString: () => "15000.00" },
  currency: "JPY",
  durationMinutes: 60,
  status: "published",
  deletedAt: null,
  category: { name: "ヘアセット", isActive: true, deletedAt: null },
  mediaAssets: [
    { url: "https://cdn.example.test/service-cover.jpg", usageType: "cover", sortOrder: 1 }
  ],
  reviewSummary: {
    ratingAverage: { toString: () => "4.90" },
    reviewCount: 18,
    deletedAt: null
  },
  shop: shop()
});

const basePost = () => ({
  id: 41,
  authorUserId: 7,
  authorIdentityId: 17,
  ownerIdentityId: 17,
  publisherPublicId: "b0000000017",
  publisherIdentityType: "merchant_owner",
  publisherDisplayName: "LifeDance 管理员",
  publisherAvatarUrl: "https://cdn.example.test/admin-avatar.jpg",
  type: "INTELLIGENCE",
  status: "PUBLISHED",
  title: "青山限定",
  detail: "正式サービスの空き枠をご案内します。",
  contentLocale: "JA",
  areaLabel: "港区",
  serviceStartAt: new Date("2026-09-06T00:00:00.000Z"),
  serviceEndAt: new Date("2026-09-06T01:00:00.000Z"),
  expiresAt: new Date("2026-09-05T15:00:00.000Z"),
  idempotencyKey: "publish-intelligence-0001",
  payloadFingerprint: "a".repeat(64),
  withdrawnAt: null,
  createdAt: new Date("2026-09-05T02:00:00.000Z"),
  updatedAt: new Date("2026-09-05T02:00:00.000Z"),
  deletedAt: null,
  authorIdentity: {
    type: "merchant_owner",
    scopeType: "shop",
    scopeId: 11,
    isActive: true,
    deletedAt: null
  },
  demand: null,
  intelligence: {
    id: 51,
    postId: 41,
    serviceId: 501,
    technicianServiceId: null,
    serviceNameSnapshot: "訪問ヘアセット",
    serviceDurationSnapshot: 60,
    serviceMode: "ONSITE",
    addressLabel: "港区青山1-1",
    serviceAreas: ["港区"],
    originalPriceJpy: 15_000,
    campaignPriceJpy: 10_000,
    createdAt: new Date("2026-09-05T02:00:00.000Z"),
    updatedAt: new Date("2026-09-05T02:00:00.000Z"),
    deletedAt: null,
    service: shopService(),
    technicianService: null
  },
  matchParticipants: [],
  likes: [],
  _count: { comments: 0, likes: 0, shares: 0 }
});

const find = async (row: ReturnType<typeof basePost>) => {
  const findFirst = jest.fn(async () => row);
  const repository = new ExchangePostRepository({ exchangePost: { findFirst } } as never);
  return {
    result: await repository.findPostById(41, 91, now),
    findFirst
  };
};

describe("Exchange Intelligence booking projection", () => {
  it("does not expose a privateAll shop card to an unrelated intelligence reader", async () => {
    const base = basePost();
    const row = {
      ...base,
      intelligence: {
        ...base.intelligence,
        service: { ...base.intelligence.service, shop: { ...base.intelligence.service.shop, visibility: "privateAll" } }
      }
    };

    const { result } = await find(row);

    expect(result?.publisher).toBeNull();
    expect(result?.intelligence?.publisherCard).toBeNull();
    expect(result?.intelligence?.serviceCard).toBeNull();
    expect(result?.intelligence?.booking.available).toBe(false);
  });

  it("projects an authoritative shop target, public publisher card, and public service card", async () => {
    const { result, findFirst } = await find(basePost());

    expect(result?.publisher).toEqual({
      publicId: "shop0000000011",
      identityType: "shop",
      displayName: "青山ケア",
      avatarUrl: "https://cdn.example.test/shop-avatar.jpg"
    });
    expect(result?.intelligence).toEqual(
      expect.objectContaining({
        booking: {
          available: true,
          unavailableReason: null,
          target: { type: "shop_service", id: 501 },
          catalogPriceJpy: 15_000,
          campaignPriceJpy: 10_000,
          serviceName: "訪問ヘアセット",
          durationMinutes: 60,
          serviceMode: "onsite",
          serviceWindow: {
            startsAt: "2026-09-06T00:00:00.000Z",
            endsAt: "2026-09-06T01:00:00.000Z"
          }
        },
        publisherCard: {
          type: "shop",
          publicId: "shop0000000011",
          name: "青山ケア",
          avatarUrl: "https://cdn.example.test/shop-avatar.jpg",
          coverUrl: "https://cdn.example.test/shop-cover.jpg",
          imageUrls: [
            "https://cdn.example.test/shop-cover.jpg",
            "https://cdn.example.test/shop-avatar.jpg"
          ],
          status: "published",
          isBookable: true,
          ratingAverage: "4.80",
          reviewCount: 32,
          completedOrderCount: 73,
          favoriteCount: 8,
          shareCount: 6,
          address: "港区青山1-1",
          serviceMode: "onsite",
          detailPath: "/profiles/shop/shop0000000011"
        },
        serviceCard: {
          targetType: "shop_service",
          publicId: "8cda1456-10d0-4e1e-ae9c-a24a20943614",
          name: "訪問ヘアセット",
          description: "イベント向けの訪問ヘアセットです。",
          coverUrl: "https://cdn.example.test/service-cover.jpg",
          imageUrls: ["https://cdn.example.test/service-cover.jpg"],
          tags: ["ヘアセット"],
          catalogPriceJpy: 15_000,
          campaignPriceJpy: 10_000,
          currency: "JPY",
          durationMinutes: 60,
          serviceMode: "onsite",
          shopPublicId: "shop0000000011",
          shopAddress: "港区青山1-1",
          detailPath: "/services/8cda1456-10d0-4e1e-ae9c-a24a20943614"
        }
      })
    );
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          authorIdentity: expect.any(Object),
          intelligence: expect.objectContaining({ include: expect.any(Object) })
        })
      })
    );

    const serialized = JSON.stringify(result?.intelligence);
    expect(serialized).not.toMatch(
      /"(?:userId|identityId|shopId|technicianProfileId|phone|email|homeAddress|kyc[^"]*)"/u
    );
    expect(JSON.stringify(result)).not.toMatch(/LifeDance 管理员|b0000000017|admin-avatar/u);
  });

  it("projects the canonical technician without falling back to the account avatar", async () => {
    const base = basePost();
    const technicianService = {
      id: 701,
      publicId: "3a4dd96e-24d9-447e-a9c2-e230b5bdc32b",
      shopId: 11,
      technicianId: 81,
      name: "着付け",
      description: "式典向け着付けです。",
      priceAmount: 18_000,
      currency: "JPY",
      durationMinutes: 90,
      coverImageUrl: "https://cdn.example.test/kitsuke-cover.jpg",
      imagesJson: ["https://cdn.example.test/kitsuke-2.jpg"],
      tagsJson: ["着物", "式典"],
      isActive: true,
      isBookable: true,
      reviewStatus: "APPROVED",
      deletedAt: null,
      category: { name: "着付け", isActive: true, deletedAt: null },
      sourceShopService: { serviceMode: "store" },
      shop: shop(),
      technicianProfile: {
        id: 81,
        displayName: "山田 花子",
        city: "港区",
        serviceArea: "東京23区",
        serviceAreasJson: ["港区", "渋谷区"],
        languages: ["ja", "zh-CN"],
        yearsExperience: 9,
        status: "published",
        visibility: "public",
        deletedAt: null,
        mediaAssets: [],
        reviewSummary: {
          ratingAverage: { toString: () => "4.70" },
          reviewCount: 27,
          deletedAt: null
        },
        performanceSummary: {
          completedOrderCount: 64,
          acceptanceRateBps: 9_600,
          deletedAt: null
        },
        technicianShopAffiliations: [
          {
            shopId: 11,
            workStatus: "ACTIVE",
            activeKey: "81:11",
            startsAt: new Date("2026-01-01T00:00:00.000Z"),
            endsAt: null,
            deletedAt: null
          }
        ],
        user: {
          isActive: true,
          deletedAt: null,
          avatarBootstrapUrl: "/account-avatar-must-not-leak.png",
          identities: [
            {
              type: "technician",
              isActive: true,
              deletedAt: null,
              publicIdentifier: {
                publicId: "s0000000081",
                kind: "S",
                status: "ACTIVE",
                deletedAt: null
              }
            }
          ]
        }
      }
    };
    const row = {
      ...base,
      publisherPublicId: "s0000000081",
      publisherIdentityType: "technician",
      publisherDisplayName: "山田 花子",
      authorIdentity: {
        type: "technician",
        scopeType: "technician_profile",
        scopeId: 81,
        isActive: true,
        deletedAt: null
      },
      intelligence: {
        ...base.intelligence,
        serviceId: null,
        technicianServiceId: 701,
        service: null,
        technicianService,
        serviceNameSnapshot: "着付け",
        serviceDurationSnapshot: 90,
        serviceMode: "STORE",
        originalPriceJpy: 18_000,
        campaignPriceJpy: 12_000
      }
    } as unknown as ReturnType<typeof basePost>;

    const { result } = await find(row);

    expect(result?.intelligence).toEqual(
      expect.objectContaining({
        booking: expect.objectContaining({
          available: true,
          unavailableReason: null,
          target: { type: "technician_service", id: 701 },
          catalogPriceJpy: 18_000,
          campaignPriceJpy: 12_000,
          serviceName: "着付け",
          durationMinutes: 90,
          serviceMode: "store"
        }),
        publisherCard: expect.objectContaining({
          type: "technician",
          publicId: "s0000000081",
          displayName: "山田 花子",
          avatarUrl: null,
          shop: { publicId: "shop0000000011", name: "青山ケア" },
          yearsExperience: 9,
          completedOrderCount: 64,
          acceptanceRatePercent: 96,
          ratingAverage: "4.71",
          reviewCount: 27,
          serviceAreas: ["港区", "渋谷区"],
          languages: ["ja", "zh-CN"],
          detailPath: "/profiles/technician/s0000000081",
          servicesPath:
            "/stores/shop0000000011/technicians/s0000000081/services"
        }),
        serviceCard: expect.objectContaining({
          targetType: "technician_service",
          publicId: "3a4dd96e-24d9-447e-a9c2-e230b5bdc32b",
          name: "着付け",
          tags: ["着物", "式典"],
          coverUrl: "https://cdn.example.test/kitsuke-cover.jpg",
          imageUrls: [
            "https://cdn.example.test/kitsuke-cover.jpg",
            "https://cdn.example.test/kitsuke-2.jpg"
          ],
          catalogPriceJpy: 18_000,
          campaignPriceJpy: 12_000,
          durationMinutes: 90,
          shopPublicId: "shop0000000011"
        })
      })
    );
    expect(JSON.stringify(result?.intelligence)).not.toMatch(
      /"(?:userId|identityId|shopId|technicianProfileId|phone|email|homeAddress|kyc[^"]*)"/u
    );

    technicianService.technicianProfile.technicianShopAffiliations[0]!.workStatus = "ENDED";
    const detached = await find(row);
    expect(detached.result?.intelligence?.booking).toEqual(
      expect.objectContaining({ available: false, unavailableReason: "publisher_unavailable" })
    );
    expect(detached.result?.intelligence?.publisherCard).toBeNull();
  });

  it("keeps legacy unbound Intelligence readable without fabricating a booking target", async () => {
    const base = basePost();
    const row = {
      ...base,
      intelligence: {
        ...base.intelligence,
        serviceId: null,
        service: null,
        serviceNameSnapshot: null,
        serviceDurationSnapshot: null
      }
    } as unknown as ReturnType<typeof basePost>;

    const { result } = await find(row);

    expect(result?.intelligence).toEqual(
      expect.objectContaining({
        booking: {
          available: false,
          unavailableReason: "legacy_unbound",
          target: null,
          catalogPriceJpy: null,
          campaignPriceJpy: 10_000,
          serviceName: null,
          durationMinutes: null,
          serviceMode: "onsite",
          serviceWindow: {
            startsAt: "2026-09-06T00:00:00.000Z",
            endsAt: "2026-09-06T01:00:00.000Z"
          }
        },
        publisherCard: null,
        serviceCard: null
      })
    );
  });

  it.each([
    ["WITHDRAWN", new Date("2026-09-05T15:00:00.000Z"), "post_unavailable"],
    ["PUBLISHED", new Date("2026-09-05T02:59:59.000Z"), "post_unavailable"]
  ] as const)(
    "fails closed when post status=%s or its validity window has ended",
    async (status, expiresAt, unavailableReason) => {
      const row = basePost();
      row.status = status;
      row.expiresAt = expiresAt;

      const { result } = await find(row);

      expect(result?.intelligence?.booking).toEqual(
        expect.objectContaining({ available: false, unavailableReason })
      );
    }
  );

  it("fails closed when the formal service is no longer published", async () => {
    const row = basePost();
    row.intelligence.service!.status = "draft";

    const { result } = await find(row);

    expect(result?.intelligence?.booking).toEqual(
      expect.objectContaining({ available: false, unavailableReason: "service_unavailable" })
    );
    expect(result?.intelligence?.serviceCard).toBeNull();
    expect(result?.intelligence?.publisherCard).toEqual(expect.objectContaining({ type: "shop" }));
  });

  it("fails closed when the service window has already ended", async () => {
    const row = basePost();
    row.serviceStartAt = new Date("2026-09-05T01:00:00.000Z");
    row.serviceEndAt = new Date("2026-09-05T02:00:00.000Z");

    const { result } = await find(row);

    expect(result?.intelligence?.booking).toEqual(
      expect.objectContaining({ available: false, unavailableReason: "post_unavailable" })
    );
  });

  it("fails closed when the loaded relation does not match the exact bound service id", async () => {
    const row = basePost();
    row.intelligence.service!.id = 502;

    const { result } = await find(row);

    expect(result?.intelligence?.booking).toEqual(
      expect.objectContaining({
        available: false,
        unavailableReason: "service_unavailable",
        target: null
      })
    );
    expect(result?.intelligence?.publisherCard).toBeNull();
    expect(result?.intelligence?.serviceCard).toBeNull();
  });

  it("fails closed when the author no longer owns the exact bound shop service", async () => {
    const row = basePost();
    row.authorIdentity.scopeId = 12;

    const { result } = await find(row);

    expect(result?.intelligence?.booking).toEqual(
      expect.objectContaining({ available: false, unavailableReason: "publisher_unavailable" })
    );
    expect(result?.intelligence?.publisherCard).toBeNull();
    expect(result?.intelligence?.serviceCard).toBeNull();
  });
});
