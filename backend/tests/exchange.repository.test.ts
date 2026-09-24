import { ExchangePostRepository } from "../src/repositories/exchange.repository";
import type { ExchangePublishRepositoryInput } from "../src/services/exchange.service";

const now = new Date("2026-08-30T03:00:00.000Z");

const demandRow = {
  id: 41,
  authorUserId: 7,
  author: { id: 7, platformMembershipEntitlements: [{ tierVersion: { tier: { code: "BLACK_DIAMOND" } } }],
    membershipAdjustments: [], customerProfile: { bio: "サービス前に連絡してください", bioLocalesJson: null,
    isPublic: true, visibility: "public", membershipLevel: "gold", membershipGrantMode: "SELF_SERVICE",
    membershipStartsAt: null, membershipExpiresAt: null,
    reviewSummary: { ratingAverage: 4.5, reviewCount: 2, deletedAt: null } } },
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
  contentTranslationsJson: { en: { title: "Hair styling in Shibuya", detail: "Please help before the event." } },
  areaLabel: "渋谷区",
  serviceStartAt: new Date("2026-08-31T00:00:00.000Z"),
  serviceEndAt: new Date("2026-08-31T01:00:00.000Z"),
  expiresAt: new Date("2026-08-31T08:30:00.000Z"),
  idempotencyKey: "publish-demand-0001",
  payloadFingerprint: "a".repeat(64),
  withdrawnAt: null,
  createdAt: new Date("2026-08-30T02:00:00.000Z"),
  updatedAt: new Date("2026-08-30T02:00:00.000Z"),
  deletedAt: null,
  demand: {
    coverMediaAsset: null,
    categoryId: 1,
    businessKeywordIdsJson: [10],
    serviceMode: "STORE",
    preferredTechnicianGender: "any",
    targetProviderCount: 1,
    targetProviderLimitSnapshot: 1,
    publisherCapacitySource: "CUSTOMER_MEMBERSHIP",
    membershipLevelSnapshot: "standard",
    matchMode: "QUICK",
    budgetMode: "TOTAL",
    budgetMinJpy: 8_000,
    budgetMaxJpy: 12_000,
    addressLine1: "渋谷区",
    addressLine1Public: false,
    addressLine2: "道玄坂1-2-3",
    addressLine3: "Prince Tower 12F",
    addressLine2Public: false,
    addressLine3Public: true,
    publisherIdentityPublic: false
  },
  intelligence: null,
  matching: {
    status: "OPEN",
    effectiveTargetProviderCount: 1,
    deletedAt: null
  },
  matchParticipants: [],
  likes: [{ id: 91 }],
  _count: { comments: 4, likes: 21, shares: 5, claims: 0 }
};

describe("ExchangePostRepository", () => {
  it("returns at most thirty recent written technician reviews for the Request customer", async () => {
    const findUnique = jest.fn(async () => ({ author: { customerProfile: { id: 27 } } }));
    const findMany = jest.fn(async () => [{ id: 501, rating: 5, comment: "丁寧なお客様", createdAt: now }]);
    const repository = new ExchangePostRepository({
      exchangePost: { findUnique }, orderReview: { findMany }
    } as never);
    await expect(repository.listRecentPublisherReviews(41, new Date("2026-07-31T03:00:00.000Z"))).resolves.toEqual([
      { id: 501, rating: 5, comment: "丁寧なお客様", createdAt: now.toISOString() }
    ]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ customerProfileId: 27, targetType: "CUSTOMER", authorType: "USER", deletedAt: null }),
      take: 30,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    }));
  });

  it("projects only an active confirmed Request service prepayment as paid", async () => {
    const findFirst = jest.fn(async () => ({
      ...demandRow,
      servicePrepayment: { percent: 35, paymentMethod: "NDP", status: "CONFIRMED", deletedAt: null }
    }));
    const repository = new ExchangePostRepository({ exchangePost: { findFirst } } as never);
    const paid = await repository.findPostById(41, 17, now);
    expect(paid?.demand?.payment).toEqual({ prepaidPercent: 35, selectedMethod: "ndp" });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        servicePrepayment: { select: { percent: true, paymentMethod: true, status: true, deletedAt: true } }
      })
    }));

    findFirst.mockResolvedValueOnce({
      ...demandRow,
      servicePrepayment: { percent: 35, paymentMethod: "NDP", status: "REFUNDED", deletedAt: null }
    });
    const refunded = await repository.findPostById(41, 17, now);
    expect(refunded?.demand?.payment).toEqual({ prepaidPercent: 0, selectedMethod: null });
  });

  it("accepts only active keywords in the selected Request category", async () => {
    const findMany = jest.fn(async () => [{ id: 10 }]);
    const repository = new ExchangePostRepository({ businessKeyword: { findMany } } as never);
    await expect(repository.assertDemandTaxonomy(1, [10])).resolves.toBeUndefined();
    expect(findMany).toHaveBeenCalledWith({ where: expect.objectContaining({
      id: { in: [10] }, categoryId: 1, isActive: true, deletedAt: null
    }), select: { id: true } });
    findMany.mockResolvedValueOnce([]);
    await expect(repository.assertDemandTaxonomy(1, [10])).rejects.toMatchObject({ statusCode: 400 });
  });

  const coverPublication = (): ExchangePublishRepositoryInput => ({
    actor: {
      userId: 7, identityId: 17, ownerIdentityId: 99, identityType: "customer",
      scopeType: "customer_profile", scopeId: 27, publicId: "NC12345678",
      displayName: "佐藤 美咲", avatarUrl: null, isTestAccount: true,
      customerMembership: null, shopScope: null
    },
    input: {
      type: "demand", categoryId: 1, businessKeywordIds: [10], serviceMode: "store", preferredTechnicianGender: "any", title: demandRow.title, detail: demandRow.detail,
      contentLocale: "ja", contentTranslations: { en: { title: "Hair styling in Shibuya", detail: "Please help before the event." } }, serviceStartAt: demandRow.serviceStartAt, serviceEndAt: demandRow.serviceEndAt,
      expiresAt: demandRow.expiresAt, targetProviderCount: 1, matchMode: "quick", budgetMode: "total",
      budgetMinJpy: null, budgetMaxJpy: 12000, addressLine1: "渋谷区", addressLine1Public: false, addressLine2: null,
      addressLine3: null, addressLine2Public: false, addressLine3Public: false,
      publisherIdentityPublic: false, coverMediaAssetPublicId: "a".repeat(64)
    },
    capacity: { source: "customer_membership", membershipLevel: "standard", targetProviderLimit: 1,
      payerOwnerType: "user", payerOwnerId: 7, currency: "TEST_NDP" },
    idempotencyKey: "publish-cover-0001", payloadFingerprint: "c".repeat(64), now
  });

  it("binds the exact actor's pending cover in the publication transaction", async () => {
    const transaction = {
      mediaAsset: { findFirst: jest.fn(async () => ({ id: 81 })), updateMany: jest.fn(async () => ({ count: 1 })), update: jest.fn(async () => ({ id: 81 })) },
      exchangePost: { create: jest.fn(async () => ({ id: 41, demand: { id: 51 } })) }
    };
    const client = { $transaction: jest.fn(async (handler: (tx: typeof transaction) => Promise<unknown>) => handler(transaction)) };
    const repository = new ExchangePostRepository(client as never);
    await repository.runInTransaction((tx) => tx.createPost(coverPublication()));
    expect(transaction.mediaAsset.findFirst).toHaveBeenCalledWith({
      where: { checksumSha256: "a".repeat(64), ownerUserId: 7, ownerIdentityId: 17,
        entityType: "exchange_demand_cover_pending", usageType: "exchange_demand_cover_pending", isActive: true, deletedAt: null,
        purgedAt: null, exchangeDemandCover: null, mimeType: { in: ["image/jpeg", "image/png", "image/webp"] } },
      select: { id: true }
    });
    expect(transaction.exchangePost.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ contentTranslationsJson: { en: { title: "Hair styling in Shibuya", detail: "Please help before the event." } }, demand: { create: expect.objectContaining({ coverMediaAssetId: 81 }) } })
    }));
    expect(transaction.mediaAsset.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 81, checksumSha256: "a".repeat(64), ownerUserId: 7, ownerIdentityId: 17,
        entityType: "exchange_demand_cover_pending", usageType: "exchange_demand_cover_pending", isActive: true,
        deletedAt: null, purgedAt: null, exchangeDemandCover: null }),
      data: { entityType: "exchange_demand", purgeAt: null, updatedAt: now }
    });
    expect(transaction.mediaAsset.updateMany.mock.invocationCallOrder[0]).toBeLessThan(transaction.exchangePost.create.mock.invocationCallOrder[0]!);
    expect(transaction.mediaAsset.update).toHaveBeenCalledWith({ where: { id: 81 },
      data: { entityType: "exchange_demand", entityId: 51, purgeAt: null, updatedAt: now } });
  });

  it("rejects publication when cleanup wins the pending-cover conditional claim", async () => {
    const client = {
      mediaAsset: { findFirst: jest.fn(async () => ({ id: 81 })), updateMany: jest.fn(async () => ({ count: 0 })), update: jest.fn() },
      exchangePost: { create: jest.fn(async () => ({ id: 41, demand: { id: 51 } })) }
    };
    await expect(new ExchangePostRepository(client as never).createPost(coverPublication())).rejects.toMatchObject({
      message: "error.exchange.demand_cover_not_owned", statusCode: 403
    });
    expect(client.exchangePost.create).not.toHaveBeenCalled();
    expect(client.mediaAsset.update).not.toHaveBeenCalled();
  });

  it("rejects a checksum outside the active owned pending scope before creating a post", async () => {
    const client = { mediaAsset: { findFirst: jest.fn(async () => null), update: jest.fn() },
      exchangePost: { create: jest.fn(async () => ({ id: 41 })) } };
    await expect(new ExchangePostRepository(client as never).createPost(coverPublication())).rejects.toMatchObject({
      message: "error.exchange.demand_cover_not_owned", statusCode: 403
    });
    expect(client.exchangePost.create).not.toHaveBeenCalled();
    expect(client.mediaAsset.update).not.toHaveBeenCalled();
  });

  it.each([null, { url: "/media/content/exchange/aa.webp" }])("projects the same cover in list and detail: %j", async (coverMediaAsset) => {
    const row = { ...demandRow, demand: { ...demandRow.demand, coverMediaAsset } };
    const findMany = jest.fn(async () => [row]);
    const findFirst = jest.fn(async () => row);
    const repository = new ExchangePostRepository({ exchangePost: { findMany, findFirst, count: jest.fn(async () => 1) } } as never);
    const list = await repository.listPosts({ type: "demand", page: 1, pageSize: 20, viewerIdentityId: 17, authorIdentityId: 17, now });
    const detail = await repository.findPostById(41, 17, now);
    const expected = coverMediaAsset ? { url: coverMediaAsset.url, isDefault: false }
      : { url: "/images/exchange-demand-default-cover.svg", isDefault: true };
    expect(list.list[0].demand).toMatchObject({ cover: expected });
    expect(detail?.demand).toMatchObject({ cover: expected });
    for (const query of [findMany, findFirst]) expect(query).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({ demand: expect.objectContaining({ include: { coverMediaAsset: { select: { url: true } } } }) })
    }));
  });

  it("filters Intelligence rows and totals by the linked shop's current audience before pagination", async () => {
    const findMany = jest.fn(async () => []);
    const count = jest.fn(async () => 0);
    const shopWhere = { OR: [{ visibility: "public" }, { id: 11, visibility: "limited" }] };
    const buildVisibilityWhere = jest.fn(async () => shopWhere);
    const viewer = { userId: 7, identityId: 17, identityType: "customer", identityScopeType: "customer_profile", identityScopeId: 27 };
    const repository = Reflect.construct(ExchangePostRepository, [
      { exchangePost: { findMany, count } },
      { buildVisibilityWhere }
    ]) as ExchangePostRepository;

    await repository.listPosts({ type: "intelligence", page: 2, pageSize: 10, viewerIdentityId: 17, now, shopViewer: viewer } as never);

    const visibleService = expect.objectContaining({ shop: expect.objectContaining({ is: expect.objectContaining({
      ...shopWhere,
      status: "published",
      deletedAt: null,
      publicIdentifier: { is: { kind: "SHOP", status: "ACTIVE", deletedAt: null } }
    }) }) });
    const where = expect.objectContaining({
      intelligence: expect.objectContaining({
        is: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ service: expect.objectContaining({ is: visibleService }) }),
            expect.objectContaining({ technicianService: expect.objectContaining({ is: visibleService }) })
          ])
        })
      })
    });
    expect(buildVisibilityWhere).toHaveBeenCalledWith(viewer);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 10, take: 10 }));
    expect(count).toHaveBeenCalledWith(expect.objectContaining({ where }));
  });

  it("filters a direct Intelligence read by the same linked-shop audience", async () => {
    const findFirst = jest.fn(async () => null);
    const shopWhere = { visibility: "public" };
    const repository = Reflect.construct(ExchangePostRepository, [
      { exchangePost: { findFirst } },
      { buildVisibilityWhere: jest.fn(async () => shopWhere) }
    ]) as ExchangePostRepository;

    await expect(repository.findPostById(41, 17, now)).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          expect.objectContaining({ type: "DEMAND" }),
          expect.objectContaining({
            type: "INTELLIGENCE",
            intelligence: expect.objectContaining({ is: expect.objectContaining({
              OR: expect.arrayContaining([
                expect.objectContaining({ service: expect.objectContaining({ is: expect.objectContaining({
                  shop: { is: expect.objectContaining(shopWhere) }
                }) }) }),
                expect.objectContaining({ technicianService: expect.objectContaining({ is: expect.objectContaining({
                  shop: { is: expect.objectContaining(shopWhere) }
                }) }) })
              ])
            }) })
          })
        ])
      })
    }));
  });

  it("resolves a merchant Intelligence service from the active shop authority", async () => {
    const findUnique = jest.fn(async () => ({
      id: 501,
      shopId: 11,
      name: "訪問ヘアセット",
      durationMinutes: 60,
      priceAmount: { toString: () => "15000.00" },
      currency: "JPY",
      serviceMode: "home",
      status: "published",
      deletedAt: null,
      category: { isActive: true, deletedAt: null },
      shop: {
        name: "StagingTest",
        city: "港区",
        address: "港区青山1-1",
        status: "published",
        deletedAt: null,
        mediaAssets: [
          {
            url: "https://example.test/staging-test-avatar.jpg",
            usageType: "avatar",
            sortOrder: 0
          }
        ],
        publicIdentifier: {
          publicId: "shop00000011",
          kind: "SHOP",
          status: "ACTIVE",
          deletedAt: null
        },
        entitySuspensions: []
      }
    }));
    const repository = new ExchangePostRepository({ service: { findUnique } } as never);

    await expect(
      repository.resolveIntelligencePublicationService({
        actor: {
          userId: 7,
          identityId: 17,
          identityType: "merchant_owner",
          scopeType: "shop",
          scopeId: 11,
          publicId: "b0000000017",
          displayName: "青山ケア",
          avatarUrl: null,
          isTestAccount: true,
          customerMembership: null,
          shopScope: { shopId: 11, status: "published" }
        },
        serviceRef: "shop:501",
        now
      })
    ).resolves.toEqual({
      kind: "success",
      value: {
        serviceRef: "shop:501",
        serviceId: 501,
        technicianServiceId: null,
        serviceName: "訪問ヘアセット",
        serviceDurationMinutes: 60,
        catalogPriceJpy: 15_000,
        serviceMode: "onsite",
        areaLabel: "港区",
        addressLabel: "港区青山1-1",
        serviceAreas: ["港区"],
        publisher: {
          publicId: "shop00000011",
          identityType: "shop",
          displayName: "StagingTest",
          avatarUrl: "https://example.test/staging-test-avatar.jpg"
        }
      }
    });

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 501 }, include: expect.any(Object) })
    );
  });

  it("requires a technician service to share the active technician and shop affiliation", async () => {
    const technicianServiceFindUnique = jest.fn(async () => ({
      id: 701,
      shopId: 11,
      technicianId: 81,
      name: "着付け",
      durationMinutes: 90,
      priceAmount: 18_000,
      currency: "JPY",
      isActive: true,
      isBookable: true,
      reviewStatus: "APPROVED",
      deletedAt: null,
      category: { isActive: true, deletedAt: null },
      sourceShopService: { serviceMode: "store" },
      shop: {
        city: "港区",
        address: "港区青山1-1",
        status: "published",
        deletedAt: null,
        publicIdentifier: {
          publicId: "shop00000011",
          kind: "SHOP",
          status: "ACTIVE",
          deletedAt: null
        },
        entitySuspensions: []
      },
      technicianProfile: {
        status: "published",
        visibility: "public",
        deletedAt: null,
        serviceArea: "東京23区",
        serviceAreasJson: ["港区", "渋谷区"],
        user: { isActive: true, deletedAt: null }
      }
    }));
    const affiliationFindFirst = jest.fn(async () => ({ id: 91 }));
    const repository = new ExchangePostRepository({
      technicianService: { findUnique: technicianServiceFindUnique },
      technicianShopAffiliation: { findFirst: affiliationFindFirst }
    } as never);

    await expect(
      repository.resolveIntelligencePublicationService({
        actor: {
          userId: 8,
          identityId: 18,
          identityType: "technician",
          scopeType: "technician_profile",
          scopeId: 81,
          publicId: "s0000000081",
          displayName: "山田 花子",
          avatarUrl: null,
          isTestAccount: true,
          customerMembership: null,
          shopScope: null
        },
        serviceRef: "technician:701",
        now
      })
    ).resolves.toEqual({
      kind: "success",
      value: expect.objectContaining({
        serviceRef: "technician:701",
        serviceId: null,
        technicianServiceId: 701,
        serviceMode: "store",
        serviceAreas: ["港区", "渋谷区"],
        publisher: {
          publicId: "s0000000081",
          identityType: "technician",
          displayName: "山田 花子",
          avatarUrl: null
        }
      })
    });
    expect(affiliationFindFirst).toHaveBeenCalledWith({
      where: {
        technicianProfileId: 81,
        shopId: 11,
        workStatus: "ACTIVE",
        activeKey: { not: null },
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        deletedAt: null
      },
      select: { id: true }
    });
  });

  it("persists only the server-resolved Intelligence service fields", async () => {
    const create = jest.fn(async () => ({ id: 41 }));
    const repository = new ExchangePostRepository({ exchangePost: { create } } as never);
    const intelligenceService = {
      serviceRef: "shop:501" as const,
      serviceId: 501,
      technicianServiceId: null,
      serviceName: "訪問ヘアセット",
      serviceDurationMinutes: 60,
      catalogPriceJpy: 15_000,
      serviceMode: "onsite" as const,
      areaLabel: "港区",
      addressLabel: "港区青山1-1",
      serviceAreas: ["港区"],
      publisher: {
        publicId: "shop00000011",
        identityType: "shop",
        displayName: "StagingTest",
        avatarUrl: "https://example.test/staging-test-avatar.jpg"
      }
    };

    await repository.createPost({
      actor: {
        userId: 7,
        identityId: 17,
        identityType: "merchant_owner",
        scopeType: "shop",
        scopeId: 11,
        publicId: "b0000000017",
        displayName: "LifeDance 管理员",
        avatarUrl: "https://example.test/admin-avatar.jpg",
        isTestAccount: true,
        customerMembership: null,
        shopScope: { shopId: 11, status: "published" }
      },
      input: {
        type: "intelligence",
        serviceRef: "shop:501",
        title: "青山限定",
        detail: "正式サービスです。",
        contentLocale: "ja",
        serviceStartAt: new Date("2026-08-31T00:00:00.000Z"),
        serviceEndAt: new Date("2026-08-31T01:00:00.000Z"),
        expiresAt: new Date("2026-08-31T08:30:00.000Z"),
        campaignPriceJpy: 10_000,
        areaLabel: "forged area",
        serviceMode: "flexible",
        addressLabel: "forged address",
        serviceAreas: ["forged"],
        originalPriceJpy: 1
      },
      intelligenceService,
      idempotencyKey: "publish-intel-0001",
      payloadFingerprint: "a".repeat(64),
      now
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        areaLabel: "港区",
        publisherPublicId: "shop00000011",
        publisherIdentityType: "shop",
        publisherDisplayName: "StagingTest",
        publisherAvatarUrl: "https://example.test/staging-test-avatar.jpg",
        intelligence: {
          create: {
            serviceId: 501,
            technicianServiceId: null,
            serviceNameSnapshot: "訪問ヘアセット",
            serviceDurationSnapshot: 60,
            serviceMode: "ONSITE",
            addressLabel: "港区青山1-1",
            serviceAreas: ["港区"],
            originalPriceJpy: 15_000,
            campaignPriceJpy: 10_000
          }
        }
      }),
      select: { id: true, demand: { select: { id: true } } }
    });
  });

  it("resolves only the exact active identity and public NeeDo id", async () => {
    const findFirst = jest.fn(async () => ({
      id: 17,
      userId: 7,
      type: "customer",
      scopeType: "customer_profile",
      scopeId: 27,
      displayName: "佐藤 美咲",
      publicIdentifier: { publicId: "NC12345678", status: "ACTIVE", deletedAt: null },
      user: {
        username: "fallback",
        avatarUrl: null,
        needoId: "NC12345678",
        isTestAccount: true,
        customerProfile: {
          id: 27,
          membershipLevel: "gold",
          membershipGrantMode: "SELF_SERVICE",
          membershipStartsAt: null,
          membershipExpiresAt: null,
          deletedAt: null
        }
      }
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
      avatarUrl: null,
      isTestAccount: true,
      customerMembership: {
        profileId: 27,
        membershipLevel: "gold",
        membershipGrantMode: "SELF_SERVICE",
        membershipStartsAt: null,
        membershipExpiresAt: null
      },
      shopScope: null
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
        user: { is: { isActive: true, deletedAt: null } }
      },
      select: {
        id: true,
        userId: true,
        type: true,
        scopeType: true,
        scopeId: true,
        displayName: true,
        publicIdentifier: { select: { publicId: true, status: true, deletedAt: true } },
        user: {
          select: {
            username: true,
            avatarUrl: true,
            needoId: true,
            isTestAccount: true,
            customerProfile: {
              select: {
                id: true,
                membershipLevel: true,
                membershipGrantMode: true,
                membershipStartsAt: true,
                membershipExpiresAt: true,
                deletedAt: true
              }
            }
          }
        }
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
      user: {
        username: "fallback",
        avatarUrl: null,
        needoId: "needo0000000041",
        isTestAccount: true,
        customerProfile: {
          id: 27,
          membershipLevel: "standard",
          membershipGrantMode: "SELF_SERVICE",
          membershipStartsAt: null,
          membershipExpiresAt: null,
          deletedAt: null
        }
      }
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
      avatarUrl: null,
      isTestAccount: true,
      customerMembership: {
        profileId: 27,
        membershipLevel: "standard",
        membershipGrantMode: "SELF_SERVICE",
        membershipStartsAt: null,
        membershipExpiresAt: null
      },
      shopScope: null
    });
  });

  it("resolves an exact active shop scope for a merchant identity", async () => {
    const identityFindFirst = jest.fn(async () => ({
      id: 71,
      userId: 7,
      type: "merchant_owner",
      scopeType: "shop",
      scopeId: 81,
      displayName: "NeeDo Salon",
      publicIdentifier: { publicId: "NS12345678", status: "ACTIVE", deletedAt: null },
      user: {
        username: "fallback",
        avatarUrl: null,
        needoId: "needo0000000041",
        isTestAccount: true,
        customerProfile: null
      }
    }));
    const shopFindFirst = jest.fn(async () => ({ id: 81, status: "published" }));
    const repository = new ExchangePostRepository({
      userIdentity: { findFirst: identityFindFirst },
      shop: { findFirst: shopFindFirst },
      merchantIdentityProfile: { findFirst: jest.fn(async () => null) }
    } as never);

    await expect(
      repository.resolveActor({
        userId: 7,
        identityId: 71,
        identityType: "merchant_owner",
        scopeType: "shop",
        scopeId: 81,
        publicId: "NS12345678"
      })
    ).resolves.toEqual({
      userId: 7,
      identityId: 71,
      identityType: "merchant_owner",
      scopeType: "shop",
      scopeId: 81,
      publicId: "NS12345678",
      displayName: "NeeDo Salon",
      avatarUrl: null,
      isTestAccount: true,
      customerMembership: null,
      shopScope: { shopId: 81, status: "published" }
    });
    expect(shopFindFirst).toHaveBeenCalledWith({
      where: { id: 81, status: "published", deletedAt: null },
      select: { id: true, status: true }
    });
  });

  it("resolves a technician comment author avatar from that technician profile, not the account", async () => {
    const repository = new ExchangePostRepository({
      userIdentity: { findFirst: jest.fn(async () => ({
        id: 19, userId: 7, type: "technician", scopeType: "technician_profile", scopeId: 81,
        displayName: "Eason", publicIdentifier: { publicId: "s0000000001", status: "ACTIVE", deletedAt: null },
        user: { username: "customer", avatarUrl: "https://example.test/customer.jpg", needoId: "u0000000001", isTestAccount: false, customerProfile: null }
      })) },
      technicianProfile: { findFirst: jest.fn(async () => ({ id: 81 })) },
      mediaAsset: { findFirst: jest.fn(async () => ({ url: "https://example.test/technician.jpg" })) }
    } as never);

    const actor = await repository.resolveActor({ userId: 7, identityId: 19, identityType: "technician", scopeType: "technician_profile", scopeId: 81, publicId: "s0000000001" });
    expect(actor).toMatchObject({ publicId: "s0000000001", displayName: "Eason", avatarUrl: "https://example.test/technician.jpg" });
  });

  it("resolves the merchant identity avatar without borrowing the account avatar", async () => {
    const repository = new ExchangePostRepository({
      userIdentity: { findFirst: jest.fn(async () => ({
        id: 71, userId: 7, type: "merchant_owner", scopeType: "shop", scopeId: 81,
        displayName: "Merchant Eason", publicIdentifier: { publicId: "m0000000001", status: "ACTIVE", deletedAt: null },
        user: { username: "customer", avatarUrl: "https://example.test/customer.jpg", needoId: "u0000000001", isTestAccount: false, customerProfile: null }
      })) },
      shop: { findFirst: jest.fn(async () => ({ id: 81, status: "published" })) },
      merchantIdentityProfile: { findFirst: jest.fn(async () => ({ id: 91 })) },
      mediaAsset: { findFirst: jest.fn(async () => ({ url: "https://example.test/merchant.jpg" })) }
    } as never);

    const actor = await repository.resolveActor({ userId: 7, identityId: 71, identityType: "merchant_owner", scopeType: "shop", scopeId: 81, publicId: "m0000000001" });
    expect(actor).toMatchObject({ publicId: "m0000000001", displayName: "Merchant Eason", avatarUrl: "https://example.test/merchant.jpg" });
  });

  it("does not fall back to the account avatar for a non-personal identity without a role avatar", async () => {
    const repository = new ExchangePostRepository({
      userIdentity: { findFirst: jest.fn(async () => ({
        id: 25, userId: 7, type: "merchant_organization", scopeType: "shop", scopeId: 81,
        displayName: "Shop", publicIdentifier: { publicId: "b0000000001", status: "ACTIVE", deletedAt: null },
        user: { username: "customer", avatarUrl: "https://example.test/customer.jpg", needoId: "u0000000001", isTestAccount: false, customerProfile: null }
      })) }
    } as never);
    await expect(repository.resolveActor({ userId: 7, identityId: 25, identityType: "merchant_organization", scopeType: "shop", scopeId: 81, publicId: "b0000000001" })).resolves.toMatchObject({ avatarUrl: null });
  });

  it("rejects deleted customer profiles and inactive shop scopes", async () => {
    const customerIdentity = {
      id: 17,
      userId: 7,
      type: "customer",
      scopeType: "customer_profile",
      scopeId: 27,
      displayName: "佐藤 美咲",
      publicIdentifier: { publicId: "NC12345678", status: "ACTIVE", deletedAt: null },
      user: {
        username: "fallback",
        avatarUrl: null,
        needoId: "NC12345678",
        isTestAccount: true,
        customerProfile: {
          id: 27,
          membershipLevel: "standard",
          membershipGrantMode: "SELF_SERVICE",
          membershipStartsAt: null,
          membershipExpiresAt: null,
          deletedAt: now
        }
      }
    };
    const customerRepository = new ExchangePostRepository({
      userIdentity: { findFirst: jest.fn(async () => customerIdentity) }
    } as never);
    await expect(
      customerRepository.resolveActor({
        userId: 7,
        identityId: 17,
        identityType: "customer",
        scopeType: "customer_profile",
        scopeId: 27,
        publicId: "NC12345678"
      })
    ).resolves.toBeNull();

    const shopRepository = new ExchangePostRepository({
      userIdentity: {
        findFirst: jest.fn(async () => ({
          ...customerIdentity,
          id: 71,
          type: "merchant_owner",
          scopeType: "shop",
          scopeId: 81,
          publicIdentifier: { publicId: "NS12345678", status: "ACTIVE", deletedAt: null },
          user: { ...customerIdentity.user, customerProfile: null }
        }))
      },
      shop: { findFirst: jest.fn(async () => null) }
    } as never);
    await expect(
      shopRepository.resolveActor({
        userId: 7,
        identityId: 71,
        identityType: "merchant_owner",
        scopeType: "shop",
        scopeId: 81,
        publicId: "NS12345678"
      })
    ).resolves.toBeNull();
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
        authorIdentityId: 17,
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
          contentTranslations: { en: { title: "Hair styling in Shibuya", detail: "Please help before the event." } },
          areaLabel: "渋谷区",
          serviceStartAt: "2026-08-31T00:00:00.000Z",
          serviceEndAt: "2026-08-31T01:00:00.000Z",
          expiresAt: "2026-08-31T08:30:00.000Z",
          publishedAt: "2026-08-30T02:00:00.000Z",
          publisher: {
            publicId: "NC12345678",
            identityType: "customer",
            displayName: "佐藤 美咲",
            avatarUrl: "https://example.test/avatar.jpg",
            contactUserId: 7,
            bio: "サービス前に連絡してください",
            bioLocales: {},
            membershipLevel: "black_diamond",
            credit: { ratingAverage: "4.5", reviewCount: 2 }
          },
          counts: { comments: 4, likes: 21, shares: 5 },
          viewer: {
            liked: true,
            canWithdraw: true,
            canClaim: false,
            canViewClaims: true,
            canViewMatching: true,
            claimUnavailableReason: null
          },
          demand: {
            cover: { url: "/images/exchange-demand-default-cover.svg", isDefault: true },
            categoryId: 1,
            businessKeywordIds: [10],
            serviceMode: "store",
            preferredTechnicianGender: "any",
            targetProviderCount: 1,
            targetProviderLimitSnapshot: 1,
            publisherCapacitySource: "customer_membership",
            membershipLevelSnapshot: "standard",
            matchMode: "quick",
            budgetMode: "total",
            budgetMinJpy: 8_000,
            budgetMaxJpy: 12_000,
            payment: { prepaidPercent: 0, selectedMethod: null },
            address: {
              line1: "渋谷区",
              line2: "道玄坂1-2-3",
              line3: "Prince Tower 12F",
              line1GenerallyVisible: false,
              line2GenerallyVisible: false,
              line3GenerallyVisible: true,
              disclosure: "owner"
            }
          },
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
          ownerIdentityId: 17,
          deletedAt: null
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: 10,
        take: 10,
        include: expect.objectContaining({
          demand: {
            where: { deletedAt: null },
            include: { coverMediaAsset: { select: { url: true } } }
          },
            intelligence: expect.objectContaining({
              where: { deletedAt: null },
              include: expect.any(Object)
            }),
          likes: {
            where: { actorIdentityId: 17, deletedAt: null },
            select: { id: true },
            take: 1
          },
          _count: {
            select: {
              comments: { where: { deletedAt: null } },
              likes: { where: { deletedAt: null } },
              shares: { where: { deletedAt: null } },
              claims: { where: { status: "ACTIVE", deletedAt: null } }
            }
          },
          matching: {
            select: {
              status: true,
              effectiveTargetProviderCount: true,
              deletedAt: true
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
        ownerIdentityId: 17,
        deletedAt: null
      }
    });
    expect(JSON.stringify((await findMany.mock.results[0]?.value) ?? [])).toContain("authorUserId");
    const response = await repository.listPosts({
      type: "demand",
      page: 1,
      pageSize: 20,
      viewerIdentityId: 17,
      authorIdentityId: 17,
      now
    });
    expect(JSON.stringify(response)).not.toContain("authorUserId");
    expect(JSON.stringify(response)).not.toContain("authorIdentityId");
  });

  it("redacts a precise Request address for unmatched viewers even when legacy public flags are set", async () => {
    const preciseAddressRow = {
      ...demandRow,
      areaLabel: "東京都渋谷区道玄坂1-12-1",
      demand: {
        ...demandRow.demand,
        addressLine1: "東京都渋谷区道玄坂1-12-1",
        addressLine2: "渋谷マークシティ 12F",
        addressLine3: "受付で田中を呼び出してください",
        addressLine2Public: true,
        addressLine3Public: true
      },
      matchParticipants: []
    };
    const findFirst = jest.fn(async () => preciseAddressRow);
    const repository = new ExchangePostRepository({
      exchangePost: { findFirst }
    } as never);

    const result = await repository.findPostById(41, 999, now);

    expect(result).toEqual(
      expect.objectContaining({
        areaLabel: "東京都渋谷区",
        demand: expect.objectContaining({
          address: {
            line1: null,
            line2: null,
            line3: null,
            line1GenerallyVisible: false,
            line2GenerallyVisible: false,
            line3GenerallyVisible: false,
            disclosure: "general"
          }
        })
      })
    );
    expect(JSON.stringify(result)).not.toContain("道玄坂1-12-1");
    expect(JSON.stringify(result)).not.toContain("渋谷マークシティ");
    expect(JSON.stringify(result)).not.toContain("田中");
  });

  it("projects a newly consented address line 1 while keeping building and room private", async () => {
    const findFirst = jest.fn(async () => ({
      ...demandRow,
      areaLabel: "東京都新宿区新宿1-1-1",
      demand: {
        ...demandRow.demand,
        addressLine1: "東京都新宿区新宿1-1-1",
        addressLine1Public: true,
        addressLine2: "新宿ビル 5階 501号室",
        addressLine3: "受付で連絡"
      },
      matchParticipants: []
    }));
    const repository = new ExchangePostRepository({ exchangePost: { findFirst } } as never);

    const result = await repository.findPostById(41, 999, now);

    expect(result?.areaLabel).toBe("東京都新宿区");
    expect(result?.demand?.address).toEqual(expect.objectContaining({
      line1: "東京都新宿区新宿1-1-1",
      line2: null,
      line3: null,
      line1GenerallyVisible: true,
      disclosure: "general"
    }));
    expect(JSON.stringify(result)).not.toContain("新宿ビル");
    expect(JSON.stringify(result)).not.toContain("受付で連絡");
  });

  it("returns the complete Request address only to the publisher and exact matched identity", async () => {
    const preciseAddressRow = {
      ...demandRow,
      areaLabel: "東京都渋谷区道玄坂1-12-1",
      demand: {
        ...demandRow.demand,
        addressLine1: "東京都渋谷区道玄坂1-12-1",
        addressLine2: "渋谷マークシティ 12F",
        addressLine3: "受付で田中を呼び出してください",
        addressLine2Public: false,
        addressLine3Public: false
      }
    };
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({ ...preciseAddressRow, matchParticipants: [] })
      .mockResolvedValueOnce({
        ...preciseAddressRow,
        status: "MATCHED",
        matching: {
          status: "MATCHED",
          effectiveTargetProviderCount: 1,
          deletedAt: null
        },
        matchParticipants: [{ id: 501 }]
      })
      .mockResolvedValueOnce({ ...preciseAddressRow, matchParticipants: [] });
    const repository = new ExchangePostRepository({
      exchangePost: { findFirst }
    } as never);

    const publisher = await repository.findPostById(41, demandRow.ownerIdentityId, now);
    const matchedParticipant = await repository.findPostById(41, 88, now);
    const introducerButNotParticipant = await repository.findPostById(41, 77, now);

    for (const authorized of [publisher, matchedParticipant]) {
      expect(authorized?.areaLabel).toBe("東京都渋谷区道玄坂1-12-1");
      expect(authorized?.demand?.address).toEqual(
        expect.objectContaining({
          line1: "東京都渋谷区道玄坂1-12-1",
          line2: "渋谷マークシティ 12F",
          line3: "受付で田中を呼び出してください"
        })
      );
    }
    expect(introducerButNotParticipant?.areaLabel).toBe("東京都渋谷区");
    expect(introducerButNotParticipant?.demand?.address).toEqual(
      expect.objectContaining({
        line1: null,
        line2: null,
        line3: null,
        disclosure: "general"
      })
    );
  });

  it("keeps the address private when a participant relation exists before matching is complete", async () => {
    const findFirst = jest.fn(async () => ({
      ...demandRow,
      areaLabel: "東京都渋谷区道玄坂1-12-1",
      demand: {
        ...demandRow.demand,
        addressLine1: "東京都渋谷区道玄坂1-12-1",
        addressLine2: "渋谷マークシティ 12F"
      },
      status: "PUBLISHED",
      matching: {
        status: "OPEN",
        effectiveTargetProviderCount: 1,
        deletedAt: null
      },
      matchParticipants: [{ id: 501 }]
    }));
    const repository = new ExchangePostRepository({ exchangePost: { findFirst } } as never);

    const result = await repository.findPostById(41, 88, now);

    expect(result?.areaLabel).toBe("東京都渋谷区");
    expect(result?.demand?.address).toEqual(
      expect.objectContaining({ line1: null, line2: null, disclosure: "general" })
    );
  });

  it("orders the public Request marketplace by the live priority benefit without N+1 membership reads", async () => {
    const blackDiamond = {
      ...demandRow,
      id: 42,
      createdAt: new Date("2026-08-30T02:30:00.000Z")
    };
    const queryRaw = jest.fn(async (queryInput: unknown) => {
      void queryInput;
      return [
        { id: 42, priorityActive: 1, tierRank: 3, tierCode: "black_diamond" },
        { id: 41, priorityActive: 0, tierRank: 0, tierCode: "free" }
      ];
    });
    const findMany = jest.fn(async () => [demandRow, blackDiamond]);
    const count = jest.fn(async () => 2);
    const repository = new ExchangePostRepository({
      $queryRaw: queryRaw,
      exchangePost: { findMany, count }
    } as never);

    const result = await repository.listPosts({
      type: "demand",
      page: 1,
      pageSize: 20,
      viewerIdentityId: 99,
      now
    });

    expect(result.list.map((post) => post.id)).toEqual([42, 41]);
    expect(result.list.map((post) => post.priority)).toEqual([
      { active: true, tierCode: "black_diamond" },
      { active: false, tierCode: "free" }
    ]);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [42, 41] }, deletedAt: null }
      })
    );
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const query = queryRaw.mock.calls[0]?.[0] as { strings: string[]; values: unknown[] };
    const sql = query.strings.join("?");
    expect(sql).toContain("platform_membership_entitlements");
    expect(sql).toContain("platform_membership_tier_benefits");
    expect(sql).toContain("platform_membership_benefits");
    expect(sql).toMatch(/ORDER BY\s+priorityActive DESC/);
    expect(sql).toContain("entitlement.expires_at >");
    expect(sql).toContain("benefit.is_globally_enabled = TRUE");
    expect(sql).toContain("tierBenefit.is_enabled = TRUE");
    expect(sql).not.toContain("membership_level_snapshot");
    expect(query.values).toContain("priority_request");
    expect(query.values).toContain(now);
  });

  it("redacts private Request address and publisher identity for a general provider view", async () => {
    const findFirst = jest.fn(async () => demandRow);
    const repository = new ExchangePostRepository({
      exchangePost: { findFirst }
    } as never);

    const result = await repository.findPostById(41, 99, now);

    expect(result).toEqual(
      expect.objectContaining({
        publisher: null,
        viewer: {
          liked: true,
          canWithdraw: false,
          canClaim: false,
          canViewClaims: false,
          canViewMatching: false,
          claimUnavailableReason: null
        },
        demand: expect.objectContaining({
          address: {
            line1: null,
            line2: null,
            line3: null,
            line1GenerallyVisible: false,
            line2GenerallyVisible: false,
            line3GenerallyVisible: false,
            disclosure: "general"
          }
        })
      })
    );
    expect(JSON.stringify(result)).not.toContain("道玄坂1-2-3");
    expect(JSON.stringify(result)).not.toContain("Prince Tower 12F");
    expect(JSON.stringify(result)).not.toMatch(/phone|email|phoneNumber/i);
  });

  it("reveals the full publisher and entered address only to a selected participant", async () => {
    const findFirst = jest.fn(async () => ({
      ...demandRow,
      status: "MATCHED",
      matching: {
        status: "MATCHED",
        effectiveTargetProviderCount: 1,
        deletedAt: null
      },
      matchParticipants: [{ id: 71 }]
    }));
    const repository = new ExchangePostRepository({ exchangePost: { findFirst } } as never);

    await expect(repository.findPostById(41, 18, now, 8, 88)).resolves.toMatchObject({
      status: "matched",
      publisher: {
        publicId: "NC12345678",
        displayName: "佐藤 美咲"
      },
      demand: {
        address: {
          line1: "渋谷区",
          line2: "道玄坂1-2-3",
          line3: "Prince Tower 12F",
          disclosure: "matched_participant"
        }
      },
      viewer: {
        canWithdraw: false,
        canClaim: false,
        canViewClaims: false,
        canViewMatching: true,
        claimUnavailableReason: null
      }
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          matchParticipants: {
            where: {
              participantIdentityId: 88,
              deletedAt: null,
              matching: { is: { status: "MATCHED", deletedAt: null } }
            },
            select: { id: true },
            take: 1
          }
        })
      })
    );
  });

  it("never grants claim capability to another provider identity of the author user", async () => {
    const selectiveRow = {
      ...demandRow,
      demand: { ...demandRow.demand, matchMode: "SELECTIVE" }
    };
    const findFirst = jest.fn(async () => selectiveRow);
    const repository = new ExchangePostRepository({
      exchangePost: { findFirst }
    } as never);

    await expect(repository.findPostById(41, 99, now, 7)).resolves.toMatchObject({
      viewer: { canClaim: false, claimUnavailableReason: "self_published" }
    });
    await expect(repository.findPostById(41, 99, now, 8)).resolves.toMatchObject({
      viewer: { canClaim: true, claimUnavailableReason: null }
    });
  });

  it("publishes capacity-aware Quick claim and owner claim-list capabilities", async () => {
    const quickBelowTarget = {
      ...demandRow,
      matching: {
        status: "OPEN",
        effectiveTargetProviderCount: 2,
        deletedAt: null
      },
      _count: { ...demandRow._count, claims: 1 }
    };
    const quickAtTarget = {
      ...quickBelowTarget,
      _count: { ...demandRow._count, claims: 2 }
    };
    const selective = {
      ...quickAtTarget,
      demand: { ...demandRow.demand, matchMode: "SELECTIVE" }
    };
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(quickBelowTarget)
      .mockResolvedValueOnce(quickAtTarget)
      .mockResolvedValueOnce(selective)
      .mockResolvedValueOnce(quickAtTarget)
      .mockResolvedValueOnce(quickAtTarget);
    const repository = new ExchangePostRepository({ exchangePost: { findFirst } } as never);

    await expect(repository.findPostById(41, 99, now, 8)).resolves.toMatchObject({
      viewer: { canClaim: true, canViewClaims: false }
    });
    await expect(repository.findPostById(41, 99, now, 8)).resolves.toMatchObject({
      viewer: { canClaim: false, canViewClaims: false }
    });
    await expect(repository.findPostById(41, 99, now, 8)).resolves.toMatchObject({
      viewer: { canClaim: true, canViewClaims: false }
    });
    await expect(repository.findPostById(41, 17, now, 7)).resolves.toMatchObject({
      viewer: { canClaim: false, canViewClaims: true }
    });
    await expect(repository.findPostById(41, 99, now, 7)).resolves.toMatchObject({
      viewer: { canClaim: false, claimUnavailableReason: null }
    });
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
        viewer: {
          liked: false,
          canWithdraw: false,
          canClaim: false,
          canViewClaims: false,
          canViewMatching: true,
          claimUnavailableReason: null
        }
      })
    );
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 41, deletedAt: null }),
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
      authorIdentity: {
        type: "technician",
        scopeType: "technician_profile",
        scopeId: 81,
        isActive: true,
        deletedAt: null
      },
      demand: null,
      intelligence: {
        serviceId: null,
        technicianServiceId: null,
        serviceNameSnapshot: null,
        serviceDurationSnapshot: null,
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
        intelligence: expect.objectContaining({
          serviceMode: "onsite",
          addressLabel: null,
          serviceAreas: ["渋谷区", "港区"],
          originalPriceJpy: 15_000,
          campaignPriceJpy: 10_000,
          booking: expect.objectContaining({
            available: false,
            unavailableReason: "legacy_unbound",
            target: null
          }),
          publisherCard: null,
          serviceCard: null
        })
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
      authorIdentity: { id: 19, userId: 9, type: "technician", scopeType: "technician_profile", scopeId: 81, isActive: true, deletedAt: null, merchantIdentityProfile: null, user: { technicianProfile: { id: 81, deletedAt: null } } },
      content: "時間の調整は可能ですか？",
      createdAt: new Date("2026-08-30T02:30:00.000Z")
    };
    const findMany = jest.fn(async () => [commentRow]);
    const count = jest.fn(async () => 4);
    const avatarFindMany = jest.fn(async () => [{ technicianProfileId: 81, entityType: "technician_profile", entityId: 81, url: "https://example.test/technician.jpg" }]);
    const repository = new ExchangePostRepository({
      exchangeComment: { findMany, count },
      mediaAsset: { findMany: avatarFindMany }
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
            avatarUrl: "https://example.test/technician.jpg"
          },
          authorProfilePath: "/moments/users/9?identityId=19",
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
      take: 10,
      include: expect.any(Object)
    });
    expect(count).toHaveBeenCalledWith({ where: { postId: 41, deletedAt: null } });
    expect(JSON.stringify(result)).not.toContain("authorUserId");
    expect(JSON.stringify(result)).not.toContain("authorIdentityId");
  });

  it("does not show another role's persisted avatar for an archived technician comment", async () => {
    const repository = new ExchangePostRepository({
      exchangeComment: {
        findMany: jest.fn(async () => [{ id: 302, postId: 41, authorUserId: 9, authorIdentityId: 19, authorPublicId: "s0000000001", authorIdentityType: "technician", authorDisplayName: "Eason", authorAvatarUrl: "https://example.test/customer.jpg", content: "旧评论", createdAt: now, authorIdentity: { id: 19, userId: 9, type: "technician", scopeType: "technician_profile", scopeId: 81, isActive: false, deletedAt: now, merchantIdentityProfile: null, user: { technicianProfile: null } } }]),
        count: jest.fn(async () => 1)
      }
    } as never);
    const result = await repository.listComments(41, { page: 1, pageSize: 20 });
    expect(result.list[0]).toMatchObject({ author: { avatarUrl: null }, authorProfilePath: null });
  });

  it("projects a historical merchant comment from its exact merchant identity", async () => {
    const repository = new ExchangePostRepository({
      exchangeComment: {
        findMany: jest.fn(async () => [{ id: 303, postId: 41, authorUserId: 9, authorIdentityId: 71, authorPublicId: "m0000000001", authorIdentityType: "merchant_owner", authorDisplayName: "Merchant Eason", authorAvatarUrl: "https://example.test/customer.jpg", content: "商户评论", createdAt: now, authorIdentity: { id: 71, userId: 9, type: "merchant_owner", scopeType: "shop", scopeId: 81, isActive: true, deletedAt: null, merchantIdentityProfile: { id: 91, deletedAt: null }, user: { technicianProfile: null } } }]),
        count: jest.fn(async () => 1)
      },
      mediaAsset: { findMany: jest.fn(async () => [{ entityType: "merchant_identity_profile", entityId: 91, ownerIdentityId: 71, ownerUserId: 9, url: "https://example.test/merchant.jpg" }]) }
    } as never);
    const result = await repository.listComments(41, { page: 1, pageSize: 20 });
    expect(result.list[0]).toMatchObject({ author: { publicId: "m0000000001", avatarUrl: "https://example.test/merchant.jpg" }, authorProfilePath: "/moments/users/9?identityId=71" });
  });

  it("persists and returns the resolved technician identity snapshot on comment creation", async () => {
    const create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 304, ...data }));
    const transaction = {
      exchangeComment: { findUnique: jest.fn(async () => null), create },
      exchangePost: { findFirst: jest.fn(async () => ({ id: 41 })) },
      auditLog: { create: jest.fn(async () => ({})) }
    };
    const repository = new ExchangePostRepository({ $transaction: (run: (client: typeof transaction) => Promise<unknown>) => run(transaction) } as never);
    const result = await repository.createComment({
      actor: { userId: 9, identityId: 19, identityType: "technician", scopeType: "technician_profile", scopeId: 81, publicId: "s0000000001", displayName: "Eason", avatarUrl: "https://example.test/technician.jpg", isTestAccount: false, customerMembership: null, shopScope: null },
      postId: 41, input: { content: "可调整时间" }, idempotencyKey: "comment-identity-304", now,
      audit: { actorUserId: 9, actorIdentityId: 19, action: "exchange.post.comment", targetType: "exchange_post", targetId: 41 } as never
    });
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ authorUserId: 9, authorIdentityId: 19, authorPublicId: "s0000000001", authorDisplayName: "Eason", authorAvatarUrl: "https://example.test/technician.jpg" }) });
    expect(result).toMatchObject({ kind: "success", value: { author: { publicId: "s0000000001", avatarUrl: "https://example.test/technician.jpg" }, authorProfilePath: "/moments/users/9?identityId=19" } });
  });

  it("replays one comment key without a second row and lists its persisted public identity", async () => {
    let stored: Record<string, unknown> | null = null;
    const transaction = {
      exchangeComment: {
        findUnique: jest.fn(async () => stored),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          stored = { id: 305, ...data, authorIdentity: null };
          return stored;
        }),
        findMany: jest.fn(async () => stored ? [stored] : []),
        count: jest.fn(async () => Number(stored !== null))
      },
      exchangePost: { findFirst: jest.fn(async () => ({ id: 41 })) },
      auditLog: { create: jest.fn(async () => ({})) }
    };
    const repository = new ExchangePostRepository({
      ...transaction,
      $transaction: (run: (tx: typeof transaction) => Promise<unknown>) => run(transaction)
    } as never);
    const input = {
      actor: { userId: 7, identityId: 17, identityType: "customer", scopeType: "customer_profile", scopeId: 27, publicId: "u0000000007", displayName: "佐藤 美咲", avatarUrl: "https://example.test/customer.jpg", isTestAccount: false, customerMembership: null, shopScope: null },
      postId: 41, input: { content: "時間を教えてください" }, idempotencyKey: "comment-identity-305", now,
      audit: { actorId: 7, action: "exchange.post.comment", targetType: "ExchangePost", targetId: 41 }
    } as const;

    await expect(repository.createComment(input)).resolves.toMatchObject({ kind: "success", value: { author: { publicId: "u0000000007", identityType: "customer", displayName: "佐藤 美咲", avatarUrl: "https://example.test/customer.jpg" } } });
    await expect(repository.createComment(input)).resolves.toMatchObject({ kind: "replayed", value: { id: 305, author: { publicId: "u0000000007" } } });
    await expect(repository.listComments(41, { page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 1, list: [{ id: 305, content: "時間を教えてください", author: { publicId: "u0000000007" } }] });
    expect(transaction.exchangeComment.create).toHaveBeenCalledTimes(1);
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("exposes transaction-bound publication primitives with persisted fingerprint and audit", async () => {
    const transaction = {
      exchangePost: {
        findFirst: jest.fn(async () => demandRow),
        findFirstOrThrow: jest.fn(async () => demandRow),
        create: jest.fn(async () => ({ id: demandRow.id }))
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
        avatarUrl: null,
        isTestAccount: true,
        customerMembership: {
          profileId: 27,
          membershipLevel: "standard",
          membershipGrantMode: "SELF_SERVICE",
          membershipStartsAt: null,
          membershipExpiresAt: null
        },
        shopScope: null
      },
      capacity: {
        source: "customer_membership" as const,
        membershipLevel: "standard" as const,
        targetProviderLimit: 1,
        payerOwnerType: "user" as const,
        payerOwnerId: 7,
        currency: "TEST_NDP" as const
      },
      input: {
        type: "demand" as const,
        categoryId: 1,
        businessKeywordIds: [10],
        serviceMode: "store" as const,
        preferredTechnicianGender: "any" as const,
        title: demandRow.title,
        detail: demandRow.detail,
        contentLocale: "ja" as const,
        serviceStartAt: demandRow.serviceStartAt,
        serviceEndAt: demandRow.serviceEndAt,
        expiresAt: demandRow.expiresAt,
        targetProviderCount: 1,
        matchMode: "quick" as const,
        budgetMode: "total" as const,
        budgetMinJpy: 8_000,
        budgetMaxJpy: 12_000,
        addressLine1: "渋谷区",
        addressLine1Public: false,
        addressLine2: "道玄坂1-2-3",
        addressLine3: "Prince Tower 12F",
        addressLine2Public: false,
        addressLine3Public: true,
        publisherIdentityPublic: false
      },
      idempotencyKey: "publish-demand-0001",
      payloadFingerprint: "a".repeat(64),
      now
    };

    await expect(
      repository.runInTransaction(async (transactionRepository, transactionClient) => {
        expect(transactionClient).toBe(transaction);
        const created = await transactionRepository.createPost(input);
        await transactionRepository.createAudit({
          actorId: 7,
          action: "exchange.post.publish",
          targetType: "ExchangePost",
          targetId: created.id
        });
        const value = await transactionRepository.findPostByIdOrThrow(created.id, 17, now);
        const replay = await transactionRepository.findPostByIdempotencyKey(
          input.idempotencyKey,
          17,
          now
        );
        return { created, value, replay };
      })
    ).resolves.toEqual({
      created: { id: 41 },
      value: expect.objectContaining({ id: 41 }),
      replay: {
        ownerIdentityId: 17,
        payloadFingerprint: "a".repeat(64),
        value: expect.objectContaining({ id: 41 })
      }
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
          payloadFingerprint: "a".repeat(64),
          demand: {
            create: {
              coverMediaAssetId: null,
              categoryId: 1,
              businessKeywordIdsJson: [10],
              serviceMode: "STORE",
              preferredTechnicianGender: "any",
              targetProviderCount: 1,
              targetProviderLimitSnapshot: 1,
              publisherCapacitySource: "CUSTOMER_MEMBERSHIP",
              membershipLevelSnapshot: "standard",
              matchMode: "QUICK",
              budgetMode: "TOTAL",
              budgetMinJpy: 8_000,
              budgetMaxJpy: 12_000,
              addressLine1: "渋谷区",
              addressLine1Public: false,
              addressLine2: "道玄坂1-2-3",
              addressLine3: "Prince Tower 12F",
              addressLine2Public: false,
              addressLine3Public: true,
              publisherIdentityPublic: false
            }
          },
          matching: {
            create: {
              status: "OPEN",
              effectiveTargetProviderCount: 1,
              effectiveBudgetMaxJpy: 12_000,
              selectedQuoteTotalJpy: 0,
              version: 1,
              createdAt: now,
              updatedAt: now,
              events: {
                create: {
                  sequence: 1,
                  type: "OPENED",
                  versionBefore: 0,
                  versionAfter: 1,
                  payload: {
                    effectiveTargetProviderCount: 1,
                    effectiveBudgetMaxJpy: 12_000
                  },
                  createdAt: now,
                  updatedAt: now
                }
              }
            }
          }
        }),
        select: { id: true, demand: { select: { id: true } } }
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
    expect(transaction.exchangePost.findFirst).toHaveBeenCalledWith({
      where: {
        idempotencyKey: "publish-demand-0001",
        ownerIdentityId: 17,
        deletedAt: null
      },
      include: expect.any(Object)
    });
    expect(transaction.exchangePost.create).toHaveBeenCalledTimes(1);
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(1);
    expect(client.$transaction).toHaveBeenCalledTimes(1);
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
          avatarUrl: null,
          isTestAccount: true,
          customerMembership: {
            profileId: 27,
            membershipLevel: "standard",
            membershipGrantMode: "SELF_SERVICE",
            membershipStartsAt: null,
            membershipExpiresAt: null
          },
          shopScope: null
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

  it("keeps like state separate for two identities of one account and returns transaction counts", async () => {
    const likes = new Map<number, { id: number; deletedAt: Date | null }>();
    const transaction = {
      exchangePost: { findFirst: jest.fn(async () => ({ id: 41 })) },
      exchangeLike: {
        findUnique: jest.fn(async ({ where }: { where: { postId_actorIdentityId: { actorIdentityId: number } } }) => likes.get(where.postId_actorIdentityId.actorIdentityId) ?? null),
        create: jest.fn(async ({ data }: { data: { actorIdentityId: number } }) => { likes.set(data.actorIdentityId, { id: data.actorIdentityId, deletedAt: null }); }),
        update: jest.fn(async ({ where, data }: { where: { id: number }; data: { deletedAt: Date | null } }) => { likes.set(where.id, { id: where.id, deletedAt: data.deletedAt }); }),
        count: jest.fn(async () => 29 + [...likes.values()].filter((like) => like.deletedAt === null).length)
      },
      exchangeComment: { count: jest.fn(async () => 6) },
      exchangeShare: { count: jest.fn(async () => 6) },
      auditLog: { create: jest.fn(async () => ({})) }
    };
    const repository = new ExchangePostRepository({ $transaction: (run: (tx: typeof transaction) => Promise<unknown>) => run(transaction) } as never);
    const actor = { userId: 7, identityId: 17, identityType: "customer", scopeType: "customer_profile", scopeId: 27, publicId: "u0000000007", displayName: "顧客", avatarUrl: null, isTestAccount: false, customerMembership: null, shopScope: null } as const;
    const input = { actor, postId: 41, liked: true, idempotencyKey: "like-identity-17", now, audit: { actorId: 7, action: "exchange.post.like", targetType: "ExchangePost", targetId: 41 } };

    await expect(repository.setLike(input)).resolves.toEqual({ kind: "success", value: { comments: 6, likes: 30, shares: 6 } });
    await expect(repository.setLike(input)).resolves.toEqual({ kind: "replayed", value: { comments: 6, likes: 30, shares: 6 } });
    await expect(repository.setLike({ ...input, actor: { ...actor, identityId: 18, identityType: "scout", publicId: "a0000000007" }, idempotencyKey: "like-identity-18" })).resolves.toEqual({ kind: "success", value: { comments: 6, likes: 31, shares: 6 } });
    expect(likes.size).toBe(2);
    expect(transaction.exchangeLike.create).toHaveBeenCalledTimes(2);
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(2);
  });

  it("records one share per identity and returns counts from the same transaction", async () => {
    const shares = new Map<number, { id: number; idempotencyKey: string }>();
    const transaction = {
      exchangePost: { findFirst: jest.fn(async () => ({ id: 41 })) },
      exchangeShare: {
        findFirst: jest.fn(async ({ where }: { where: { OR: [{ idempotencyKey: string }, { actorIdentityId: number }] } }) => [...shares.values()].find((share) => share.idempotencyKey === where.OR[0].idempotencyKey || share.id === where.OR[1].actorIdentityId) ?? null),
        create: jest.fn(async ({ data }: { data: { actorIdentityId: number; idempotencyKey: string } }) => { shares.set(data.actorIdentityId, { id: data.actorIdentityId, idempotencyKey: data.idempotencyKey }); }),
        count: jest.fn(async () => 6 + shares.size)
      },
      exchangeComment: { count: jest.fn(async () => 7) },
      exchangeLike: { count: jest.fn(async () => 30) },
      auditLog: { create: jest.fn(async () => ({})) }
    };
    const repository = new ExchangePostRepository({ $transaction: (run: (tx: typeof transaction) => Promise<unknown>) => run(transaction) } as never);
    const actor = { userId: 7, identityId: 17, identityType: "customer", scopeType: "customer_profile", scopeId: 27, publicId: "u0000000007", displayName: "顧客", avatarUrl: null, isTestAccount: false, customerMembership: null, shopScope: null } as const;
    const input = { actor, postId: 41, idempotencyKey: "share-identity-17", now, audit: { actorId: 7, action: "exchange.post.share", targetType: "ExchangePost", targetId: 41 } };

    await expect(repository.recordShare(input)).resolves.toEqual({ kind: "success", value: { comments: 7, likes: 30, shares: 7 } });
    await expect(repository.recordShare(input)).resolves.toEqual({ kind: "replayed", value: { comments: 7, likes: 30, shares: 7 } });
    expect(shares.size).toBe(1);
    expect(transaction.exchangeShare.create).toHaveBeenCalledTimes(1);
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("locks a live post before exposing its terminal financial state", async () => {
    const transaction = {
      $queryRaw: jest.fn(async () => [{ id: 41 }]),
      exchangePost: {
        findFirst: jest.fn(async () => ({
          id: 41,
          authorUserId: 7,
          ownerIdentityId: 17,
          type: "DEMAND",
          status: "PUBLISHED",
          expiresAt: demandRow.expiresAt,
          deletedAt: null,
          requestFinancial: { state: "HELD" }
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
      repository.runInTransaction((transactionRepository) =>
        transactionRepository.lockPostForMutation(41)
      )
    ).resolves.toEqual({
      id: 41,
      authorUserId: 7,
      ownerIdentityId: 17,
      type: "demand",
      status: "published",
      expiresAt: demandRow.expiresAt,
      requestFinancial: { state: "held" }
    });
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.exchangePost.findFirst).toHaveBeenCalledWith({
      where: { id: 41, deletedAt: null },
      select: expect.objectContaining({ requestFinancial: { select: { state: true } } })
    });
  });

  it("lists bounded due ids and guards each terminal status update", async () => {
    const findMany = jest.fn(async () => [{ id: 41 }, { id: 42 }, { id: 43 }]);
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const claimUpdateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 1 });
    const repository = new ExchangePostRepository({
      exchangePost: { findMany, updateMany },
      exchangeClaim: { updateMany: claimUpdateMany }
    } as never);

    await expect(repository.listDuePostIds(now, 3)).resolves.toEqual([41, 42, 43]);
    await expect(repository.markWithdrawnIfPublished(41, now)).resolves.toBe(true);
    await expect(repository.markExpiredIfPublished(42, now)).resolves.toBe(true);
    await expect(repository.cancelActiveClaimsByPost(41, "request_withdrawn", now)).resolves.toBe(
      2
    );
    await expect(repository.cancelActiveClaimsByPost(42, "request_expired", now)).resolves.toBe(1);

    expect(findMany).toHaveBeenCalledWith({
      where: { status: "PUBLISHED", expiresAt: { lte: now }, deletedAt: null },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take: 3,
      select: { id: true }
    });
    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 41, status: "PUBLISHED", deletedAt: null },
      data: { status: "WITHDRAWN", withdrawnAt: now, updatedAt: now }
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 42,
        status: "PUBLISHED",
        expiresAt: { lte: now },
        deletedAt: null
      },
      data: { status: "EXPIRED", updatedAt: now }
    });
    expect(claimUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { exchangePostId: 41, status: "ACTIVE", deletedAt: null },
      data: {
        status: "REQUEST_WITHDRAWN",
        activeKey: null,
        terminalAt: now,
        updatedAt: now
      }
    });
    expect(claimUpdateMany).toHaveBeenNthCalledWith(2, {
      where: { exchangePostId: 42, status: "ACTIVE", deletedAt: null },
      data: {
        status: "REQUEST_EXPIRED",
        activeKey: null,
        terminalAt: now,
        updatedAt: now
      }
    });
  });

  it("closes an open matching aggregate with an append-only terminal event", async () => {
    const queryRaw = jest.fn(async () => [{ id: 51 }]);
    const findUnique = jest.fn(async () => ({ id: 51, status: "OPEN", version: 4 }));
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const createEvent = jest.fn(async () => ({ id: 61 }));
    const repository = new ExchangePostRepository({
      $queryRaw: queryRaw,
      exchangeRequestMatching: { findUnique, updateMany },
      exchangeMatchEvent: { create: createEvent }
    } as never);

    await expect(
      repository.closeOpenMatchingForTerminalPost({
        exchangePostId: 41,
        reason: "request_expired",
        actorUserId: null,
        actorIdentityId: null,
        at: now
      })
    ).resolves.toBe(true);

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledWith({
      where: { exchangePostId: 41 },
      select: { id: true, status: true, version: true }
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 51,
        exchangePostId: 41,
        status: "OPEN",
        version: 4,
        deletedAt: null
      },
      data: {
        status: "CLOSED",
        version: 5,
        closedAt: now,
        updatedAt: now
      }
    });
    expect(createEvent).toHaveBeenCalledWith({
      data: {
        matchingId: 51,
        sequence: 5,
        type: "CLOSED",
        actorUserId: null,
        actorIdentityId: null,
        versionBefore: 4,
        versionAfter: 5,
        payload: { exchangePostId: 41, reason: "request_expired" },
        createdAt: now,
        updatedAt: now
      }
    });
  });
});
