import type { PrismaClient } from "@prisma/client";
import { PricingModeRepository } from "../src/repositories/pricing-mode.repository";

const missingRateColumnError = {
  code: "P2022",
  message: "The column `technician_pricing_rate_percent` does not exist in the current database.",
  meta: { column: "Shop.technician_pricing_rate_percent" }
};

const serviceRecord = (id: number, shopId: number, deletedAt: Date | null = null) => ({
  id,
  publicId: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
  shopId,
  technicianId: 3,
  sourceShopServiceId: null,
  name: `Service ${id}`,
  description: null,
  categoryId: 2,
  priceAmount: 8_800,
  currency: "JPY",
  durationMinutes: 60,
  coverImageUrl: null,
  imagesJson: [],
  tagsJson: [],
  isActive: deletedAt === null,
  isBookable: deletedAt === null,
  isRecommended: false,
  sortOrder: id,
  reviewStatus: "APPROVED",
  rejectionReason: null,
  createdBy: 8,
  updatedBy: 8,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
  deletedAt,
  shop: {
    name: `Shop ${shopId}`,
    address: `Address ${shopId}`,
    publicIdentifier: {
      publicId: `shop${String(shopId).padStart(10, "0")}`,
      kind: "SHOP",
      status: "ACTIVE",
      deletedAt: null
    }
  },
  _count: { bookingOrders: 7, entityFavorites: 11, entityShareEvents: 5 }
});

const createInput = (shopId: number) => ({
  shopId,
  technicianId: 3,
  createdBy: 8,
  name: `Shop ${shopId} service`,
  categoryId: 2,
  priceAmount: 8_800,
  currency: "JPY",
  durationMinutes: 60,
  auditLog: {
    actorId: 8,
    action: "technician.services.create",
    targetType: "technician_service",
    metadata: { technicianId: 3, shopId }
  }
});

describe("PricingModeRepository", () => {
  it("updates one service language under technician scope and preserves other translations", async () => {
    const current = { ...serviceRecord(41, 10), localizedContentJson: { ja: { name: "整体" }, en: { name: "Massage" } } };
    const update = jest.fn();
    const transaction = {
      $queryRaw: jest.fn(async () => [{ id: 41 }]),
      technicianService: {
        findFirst: jest.fn(async () => current), update,
        findUniqueOrThrow: jest.fn(async () => ({ ...current, localizedContentJson: { ja: { name: "整体" }, en: { name: "Body massage", description: "One hour" } } }))
      }
    };
    const client = { $transaction: jest.fn(async (callback) => callback(transaction)) } as unknown as PrismaClient;
    const result = await new PricingModeRepository(client).updateTechnicianService({
      technicianId: 3, serviceId: 41, updatedBy: 8,
      localizedContent: { locale: "en", name: "Body massage", description: "One hour" }
    });
    expect(transaction.$queryRaw).toHaveBeenCalled();
    expect(transaction.technicianService.findFirst).toHaveBeenCalledWith({ where: { id: 41, technicianId: 3, deletedAt: null } });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      localizedContentJson: { ja: { name: "整体" }, en: { name: "Body massage", description: "One hour" } }
    }) }));
    expect(result?.localizedContent).toEqual({ ja: { name: "整体" }, en: { name: "Body massage", description: "One hour" } });
  });
  it("authorizes technician shop scope through the active affiliation relation", async () => {
    const findFirst = jest.fn(async () => ({ id: 3 }));
    const repository = new PricingModeRepository({
      technicianProfile: { findFirst }
    } as unknown as PrismaClient);

    await expect(repository.findTechnicianShopScope(3, 22)).resolves.toEqual({
      technicianId: 3,
      shopId: 22
    });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 3,
        OR: expect.arrayContaining([
          { shopId: 22 },
          expect.objectContaining({ technicianShopAffiliations: expect.any(Object) })
        ])
      })
    }));
  });

  it("lists one technician portfolio through any active affiliated shop", async () => {
    const findMany = jest.fn(async () => [{ ...serviceRecord(1, 10), _count: { bookingOrders: 4 } }]);
    const count = jest.fn(async () => 1);
    const repository = new PricingModeRepository({
      technicianService: { findMany, count }
    } as unknown as PrismaClient);

    await expect(repository.listPublicTechnicianServices({
      shopId: 22,
      technicianId: 3,
      page: 1,
      pageSize: 20
    })).resolves.toMatchObject({ list: [{ id: 1, shopId: 10, usageCount: 4 }] });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        technicianId: 3,
        technicianProfile: expect.objectContaining({
          OR: expect.arrayContaining([
            { shopId: 22 },
            expect.objectContaining({ technicianShopAffiliations: expect.any(Object) })
          ])
        })
      })
    }));
    const query = (findMany as jest.Mock).mock.calls[0]?.[0] as { where: object };
    expect(query.where).not.toHaveProperty("shopId");
  });

  it("publishes only active approved services backed by the exact active shop affiliation", async () => {
    const valid = {
      ...serviceRecord(1, 10),
      sourceShopServiceId: 101,
      category: { isActive: true, deletedAt: null },
      sourceShopService: { id: 101, shopId: 10, status: "published", deletedAt: null },
      technicianProfile: {
        id: 3,
        shopId: null,
        status: "published",
        visibility: "public",
        deletedAt: null,
        user: {
          isActive: true,
          deletedAt: null,
          identities: [
            {
              isActive: true,
              deletedAt: null,
              publicIdentifier: { kind: "S", status: "ACTIVE", deletedAt: null }
            }
          ]
        },
        technicianShopAffiliations: [
          {
            shopId: 10,
            activeKey: "technician:3:shop:10",
            workStatus: "ACTIVE",
            startsAt: new Date("2026-01-01T00:00:00.000Z"),
            endsAt: null,
            deletedAt: null
          }
        ]
      }
    };
    const findMany = jest.fn(async () => [valid]);
    const count = jest.fn(async () => 1);
    const technicianFindFirst = jest.fn(async () => ({
      shopId: null,
      technicianShopAffiliations: [{ shopId: 10 }]
    }));
    const repository = new PricingModeRepository({
      technicianProfile: { findFirst: technicianFindFirst },
      technicianService: { findMany, count }
    } as unknown as PrismaClient);

    await expect(
      repository.listPublicTechnicianProfileServices({
        technicianId: 3,
        page: 1,
        pageSize: 20
      })
    ).resolves.toMatchObject({
      list: [{ id: 1, shopId: 10 }],
      total: 1
    });

    expect(technicianFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 3, status: "published", visibility: "public" })
      })
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          technicianId: 3,
          shopId: { in: [10] },
          deletedAt: null,
          isActive: true,
          isBookable: true,
          reviewStatus: "APPROVED",
          category: { is: { isActive: true, deletedAt: null } },
          shop: expect.objectContaining({
            is: expect.objectContaining({ status: "published", deletedAt: null })
          }),
          technicianProfile: expect.objectContaining({
            is: expect.objectContaining({
              status: "published",
              visibility: "public",
              deletedAt: null
            })
          })
        })
      })
    );
    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ technicianId: 3, shopId: { in: [10] } })
      })
    );
  });

  it("keeps a directly attached technician shop eligible and fails closed without any active shop", async () => {
    const findMany = jest.fn(async () => [serviceRecord(4, 10)]);
    const count = jest.fn(async () => 1);
    const technicianFindFirst = jest
      .fn()
      .mockResolvedValueOnce({ shopId: 10, technicianShopAffiliations: [] })
      .mockResolvedValueOnce({ shopId: null, technicianShopAffiliations: [] });
    const repository = new PricingModeRepository({
      technicianProfile: { findFirst: technicianFindFirst },
      technicianService: { findMany, count }
    } as unknown as PrismaClient);

    await expect(
      repository.listPublicTechnicianProfileServices({
        technicianId: 3,
        page: 1,
        pageSize: 20
      })
    ).resolves.toMatchObject({ list: [{ id: 4, shopId: 10 }], total: 1 });
    await expect(
      repository.listPublicTechnicianProfileServices({
        technicianId: 3,
        page: 1,
        pageSize: 20
      })
    ).resolves.toMatchObject({ list: [], total: 0 });
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledTimes(1);
  });

  it("versions the shop-wide compensation rule with the selected technician settlement share", async () => {
    const updatedAt = new Date("2026-09-08T00:00:00.000Z");
    const currentRule = {
      id: 41,
      shopId: 1,
      name: "Global compensation",
      status: "active",
      wageMode: "base_plus_commission",
      baseSalaryJpy: 10_000,
      hourlyRateJpy: 0,
      dailyRateJpy: 0,
      fixedOrderPayJpy: 500,
      commissionRateBps: 6_000,
      extensionCommissionRateBps: 6_000,
      nominationFeeJpy: 1_000,
      guaranteedMinimumJpy: 0,
      ndpFeeBearer: "shop",
      technicianNdpShareBps: 0,
      bonusRulesJson: [],
      deductionRulesJson: [],
      effectiveFrom: null,
      effectiveTo: null,
      createdById: 7,
      updatedById: 7,
      createdAt: updatedAt,
      updatedAt,
      deletedAt: null
    };
    const transactionClient = {
      shop: {
        update: jest.fn(async () => ({
          id: 1,
          pricingMode: "TECHNICIAN",
          technicianPricingRatePercent: 30,
          pricingModeUpdatedAt: updatedAt,
          pricingModeUpdatedBy: 7
        }))
      },
      shopFinanceRuleSet: {
        findFirst: jest.fn(async () => currentRule),
        updateMany: jest.fn(async () => ({ count: 1 })),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          ...currentRule,
          ...data,
          id: 42,
          commissionRateBps: 3_000,
          extensionCommissionRateBps: 3_000
        }))
      }
    };
    const client = {
      $transaction: jest.fn((callback: (tx: typeof transactionClient) => unknown) => callback(transactionClient))
    };
    const repository = new PricingModeRepository(client as unknown as PrismaClient);

    await expect(repository.updateShopPricingMode(1, "technician", 30, 7)).resolves.toMatchObject({
      shopId: 1,
      pricingMode: "technician",
      technicianPricingRatePercent: 30
    });
    expect(transactionClient.shopFinanceRuleSet.updateMany).toHaveBeenCalledWith({
      where: { shopId: 1, status: "active", deletedAt: null },
      data: { status: "archived", updatedById: 7 }
    });
    expect(transactionClient.shopFinanceRuleSet.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        shopId: 1,
        wageMode: "base_plus_commission",
        baseSalaryJpy: 10_000,
        commissionRateBps: 3_000,
        extensionCommissionRateBps: 3_000,
        createdById: 7,
        updatedById: 7
      })
    });
  });

  it("keeps pricing-mode reads and updates usable when the rate column has not been migrated yet", async () => {
    const updatedAt = new Date("2026-06-02T12:00:00.000Z");
    const shop = {
      findFirst: jest.fn().mockRejectedValueOnce(missingRateColumnError).mockResolvedValueOnce({
        id: 1,
        pricingMode: "MERCHANT",
        pricingModeUpdatedAt: null,
        pricingModeUpdatedBy: null
      }),
      update: jest.fn().mockRejectedValueOnce(missingRateColumnError).mockResolvedValueOnce({
        id: 1,
        pricingMode: "TECHNICIAN",
        pricingModeUpdatedAt: updatedAt,
        pricingModeUpdatedBy: 7
      })
    };
    const shopFinanceRuleSet = {
      findFirst: jest.fn(async () => null),
      updateMany: jest.fn(async () => ({ count: 0 })),
      create: jest.fn(async () => ({}))
    };
    const repository = new PricingModeRepository({
      shop,
      shopFinanceRuleSet,
      $transaction: jest.fn((callback: (transaction: { shop: typeof shop; shopFinanceRuleSet: typeof shopFinanceRuleSet }) => unknown) =>
        callback({ shop, shopFinanceRuleSet }))
    } as unknown as PrismaClient);

    await expect(repository.findShopPricingMode(1)).resolves.toMatchObject({
      shopId: 1,
      pricingMode: "merchant",
      technicianPricingRatePercent: 100
    });
    expect(shop.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        select: expect.not.objectContaining({ technicianPricingRatePercent: true })
      })
    );

    await expect(repository.updateShopPricingMode(1, "technician", 100, 7)).resolves.toMatchObject({
      shopId: 1,
      pricingMode: "technician",
      technicianPricingRatePercent: 100,
      updatedBy: 7
    });
    expect(shop.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.not.objectContaining({ technicianPricingRatePercent: 100 }),
        select: expect.not.objectContaining({ technicianPricingRatePercent: true })
      })
    );

    shop.findFirst.mockRejectedValueOnce(missingRateColumnError).mockResolvedValueOnce({
      id: 1,
      pricingMode: "TECHNICIAN",
      pricingModeUpdatedAt: updatedAt,
      pricingModeUpdatedBy: 7
    });
    await expect(repository.findShopPricingMode(1)).resolves.toMatchObject({
      shopId: 1,
      pricingMode: "technician",
      technicianPricingRatePercent: 100
    });
  });

  it("serializes profile-wide quota checks and writes the service with its audit atomically", async () => {
    const rows = [
      serviceRecord(1, 1),
      serviceRecord(2, 1),
      serviceRecord(3, 2),
      serviceRecord(4, 2)
    ];
    const transactionClient = {
      $queryRaw: jest.fn(async () => [{ id: 3 }]),
      technicianService: {
        count: jest.fn(async () => rows.filter((row) => row.deletedAt === null).length),
        create: jest.fn(async ({ data }: { data: { shopId: number } }) => {
          const created = serviceRecord(rows.length + 1, data.shopId);
          rows.push(created);
          return created;
        })
      },
      auditLog: { create: jest.fn(async () => ({})) }
    };
    let serialization = Promise.resolve();
    const client = {
      $transaction: jest.fn(
        <T>(callback: (transaction: typeof transactionClient) => Promise<T>) => {
          const result = serialization.then(() => callback(transactionClient));
          serialization = result.then(
            () => undefined,
            () => undefined
          );
          return result;
        }
      )
    };
    const repository = new PricingModeRepository(client as unknown as PrismaClient);

    const results = await Promise.allSettled([
      repository.createTechnicianService(createInput(1)),
      repository.createTechnicianService(createInput(2))
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toEqual([
      expect.objectContaining({
        reason: expect.objectContaining({ message: "error.technician_service.limit_reached" })
      })
    ]);
    expect(transactionClient.$queryRaw).toHaveBeenCalledTimes(2);
    expect(transactionClient.technicianService.count).toHaveBeenCalledWith({
      where: { technicianId: 3, deletedAt: null }
    });
    expect(transactionClient.technicianService.create).toHaveBeenCalledTimes(1);
    expect(transactionClient.auditLog.create).toHaveBeenCalledTimes(1);
    expect(transactionClient.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "technician.services.create",
        targetType: "technician_service",
        targetId: 5
      })
    });
  });

  it("ignores soft-deleted services for quota and resolves the eligible primary service", async () => {
    const created = serviceRecord(6, 2);
    const transactionClient = {
      $queryRaw: jest.fn(async () => [{ id: 3 }]),
      technicianService: {
        count: jest.fn(async () => 4),
        create: jest.fn(async () => created)
      },
      auditLog: { create: jest.fn(async () => ({})) }
    };
    const technicianService = {
      findFirst: jest.fn(async () => serviceRecord(2, 2))
    };
    const client = {
      $transaction: jest.fn(async (callback: (transaction: typeof transactionClient) => unknown) =>
        callback(transactionClient)
      ),
      technicianService
    };
    const repository = new PricingModeRepository(client as unknown as PrismaClient);

    await expect(repository.createTechnicianService(createInput(2))).resolves.toMatchObject({
      id: 6,
      taxIncluded: true
    });
    await expect(repository.findPrimaryTechnicianService(3)).resolves.toMatchObject({
      id: 2,
      taxIncluded: true
    });
    expect(technicianService.findFirst).toHaveBeenCalledWith({
      where: {
        technicianId: 3,
        deletedAt: null,
        isActive: true,
        reviewStatus: "APPROVED"
      },
      include: expect.objectContaining({
        shop: expect.any(Object),
        _count: {
          select: {
            bookingOrders: {
              where: { status: "COMPLETED", deletedAt: null }
            },
            entityFavorites: { where: { deletedAt: null } },
            entityShareEvents: { where: { deletedAt: null } }
          }
        }
      }),
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
    });
  });

  it("returns formal service utilization and active public shop metadata in one reusable include", async () => {
    const findMany = jest.fn(async () => [serviceRecord(21, 9)]);
    const repository = new PricingModeRepository({
      technicianService: {
        findMany,
        count: jest.fn(async () => 1)
      }
    } as unknown as PrismaClient);

    await expect(
      repository.listTechnicianServices({
        shopId: 9,
        technicianId: 3,
        page: 1,
        pageSize: 20
      })
    ).resolves.toMatchObject({
      list: [
        {
          id: 21,
          publicId: "00000000-0000-4000-8000-000000000021",
          usageCount: 7,
          favoriteCount: 11,
          shareCount: 5,
          shop: {
            publicId: "shop0000000009",
            name: "Shop 9",
            address: "Address 9"
          }
        }
      ]
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          shop: {
            select: expect.objectContaining({
              name: true,
              address: true,
              publicIdentifier: expect.any(Object)
            })
          },
          _count: {
            select: {
              bookingOrders: {
                where: { status: "COMPLETED", deletedAt: null }
              },
              entityFavorites: { where: { deletedAt: null } },
              entityShareEvents: { where: { deletedAt: null } }
            }
          }
        }
      })
    );

    findMany.mockResolvedValueOnce([
      {
        ...serviceRecord(22, 9),
        shop: {
          ...serviceRecord(22, 9).shop,
          publicIdentifier: {
            ...serviceRecord(22, 9).shop.publicIdentifier,
            status: "RETIRED"
          }
        }
      }
    ]);
    await expect(
      repository.listTechnicianServices({
        shopId: 9,
        technicianId: 3,
        page: 1,
        pageSize: 20
      })
    ).resolves.toMatchObject({
      list: [{ shop: { publicId: null } }]
    });
  });

  it("reorders the complete portfolio once and rejects conflicting idempotency replay", async () => {
    const rows = [serviceRecord(11, 1), serviceRecord(12, 2), serviceRecord(13, 1)];
    let storedAudit: { metadata: unknown } | null = null;
    const transactionClient = {
      $queryRaw: jest.fn(async () => [{ id: 3 }]),
      technicianService: {
        findMany: jest.fn(async () =>
          [...rows].sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id)
        ),
        updateMany: jest.fn(
          async ({ where, data }: { where: { id: number }; data: { sortOrder: number } }) => {
            const row = rows.find(({ id }) => id === where.id);
            if (row) row.sortOrder = data.sortOrder;
            return { count: row ? 1 : 0 };
          }
        )
      },
      auditLog: {
        findFirst: jest.fn(async () => storedAudit),
        create: jest.fn(async ({ data }: { data: { metadata?: unknown } }) => {
          storedAudit = { metadata: data.metadata };
          return {};
        })
      }
    };
    const client = {
      $transaction: jest.fn(async (callback: (transaction: typeof transactionClient) => unknown) =>
        callback(transactionClient)
      )
    };
    const repository = new PricingModeRepository(client as unknown as PrismaClient);
    const input = {
      technicianId: 3,
      orderedServiceIds: [13, 11, 12],
      actorUserId: 8,
      idempotencyKey: "technician-order-0001",
      requestFingerprint: "fingerprint-a",
      auditLog: {
        actorId: 8,
        action: "technician.services.reorder",
        targetType: "technician_profile",
        targetId: 3
      }
    };

    await expect(repository.reorderTechnicianServices(input)).resolves.toEqual([
      expect.objectContaining({ id: 13, sortOrder: 0 }),
      expect.objectContaining({ id: 11, sortOrder: 1 }),
      expect.objectContaining({ id: 12, sortOrder: 2 })
    ]);
    await expect(repository.reorderTechnicianServices(input)).resolves.toHaveLength(3);
    expect(transactionClient.technicianService.updateMany).toHaveBeenCalledTimes(3);
    expect(transactionClient.auditLog.create).toHaveBeenCalledTimes(1);

    await expect(
      repository.reorderTechnicianServices({
        ...input,
        orderedServiceIds: [11, 12, 13],
        requestFingerprint: "fingerprint-b"
      })
    ).rejects.toMatchObject({ message: "error.idempotency_key_reused", statusCode: 409 });
    expect(transactionClient.technicianService.updateMany).toHaveBeenCalledTimes(3);
    expect(transactionClient.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("finds the owned service with only its active cover media", async () => {
    const service = {
      ...serviceRecord(11, 1),
      coverImageUrl: "/media/content/cover.jpg"
    };
    const technicianService = { findFirst: jest.fn(async () => service) };
    const mediaAsset = {
      findFirst: jest.fn(async () => ({
        id: 101,
        checksumSha256: "a".repeat(64),
        mimeType: "image/jpeg"
      }))
    };
    const repository = new PricingModeRepository({
      technicianService,
      mediaAsset
    } as unknown as PrismaClient);

    await expect(
      repository.findTechnicianServiceCoverTarget({ shopId: 1, technicianId: 3, serviceId: 11 })
    ).resolves.toMatchObject({
      service: { id: 11, coverImageUrl: "/media/content/cover.jpg" },
      activeMediaAssetId: 101,
      checksumSha256: "a".repeat(64),
      mimeType: "image/jpeg"
    });
    expect(technicianService.findFirst).toHaveBeenCalledWith({
      where: { id: 11, shopId: 1, technicianId: 3, deletedAt: null },
      include: expect.any(Object)
    });
    expect(mediaAsset.findFirst).toHaveBeenCalledWith({
      where: {
        entityType: "technician_service",
        entityId: 11,
        usageType: "cover",
        isActive: true,
        deletedAt: null,
        purgedAt: null
      },
      select: { id: true, checksumSha256: true, mimeType: true }
    });
  });

  it("replaces the owned service cover and audit in one transaction", async () => {
    const now = new Date("2026-09-04T00:00:00.000Z");
    const updated = {
      ...serviceRecord(11, 1),
      coverImageUrl: "/media/content/cover.jpg"
    };
    const transaction = {
      $queryRaw: jest.fn(async () => [{ id: 11 }]),
      mediaAsset: {
        findFirst: jest.fn(async () => ({
          id: 101,
          checksumSha256: "b".repeat(64),
          mimeType: "image/png"
        })),
        updateMany: jest.fn(async () => ({ count: 1 })),
        create: jest.fn(async () => ({
          id: 102,
          checksumSha256: "a".repeat(64),
          mimeType: "image/jpeg"
        }))
      },
      technicianService: { update: jest.fn(async () => updated) },
      auditLog: {
        findFirst: jest.fn(async () => ({ metadata: { newByteCount: 321 } })),
        create: jest.fn(async () => ({}))
      }
    };
    const client = {
      $transaction: jest.fn(async (callback: (transactionClient: typeof transaction) => unknown) =>
        callback(transaction)
      )
    };
    const repository = new PricingModeRepository(client as unknown as PrismaClient);

    await expect(
      repository.replaceTechnicianServiceCover({
        shopId: 1,
        technicianId: 3,
        serviceId: 11,
        ownerUserId: 8,
        ownerIdentityId: 18,
        url: "/media/content/cover.jpg",
        fileKey: "cover.jpg",
        mimeType: "image/jpeg",
        checksumSha256: "a".repeat(64),
        fileSize: 4,
        width: 1200,
        height: 800,
        now,
        action: "technician.service.cover.updated",
        context: { ip: "127.0.0.1", userAgent: "jest" }
      })
    ).resolves.toMatchObject({ id: 11, coverImageUrl: "/media/content/cover.jpg" });
    expect(client.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mediaAsset.updateMany).toHaveBeenCalledWith({
      where: {
        entityType: "technician_service",
        entityId: 11,
        usageType: "cover",
        isActive: true,
        deletedAt: null
      },
      data: { isActive: false, deletedAt: now }
    });
    expect(transaction.mediaAsset.findFirst).toHaveBeenCalledWith({
      where: {
        entityType: "technician_service",
        entityId: 11,
        usageType: "cover",
        isActive: true,
        deletedAt: null,
        purgedAt: null
      },
      select: { id: true, checksumSha256: true, mimeType: true }
    });
    expect(transaction.auditLog.findFirst).toHaveBeenCalledWith({
      where: {
        action: "technician.service.cover.updated",
        targetType: "technician_service",
        targetId: 11,
        OR: [
          { metadata: { path: "$.newMediaAssetId", equals: 101 } },
          { metadata: { path: "$.checksumSha256", equals: "b".repeat(64) } }
        ]
      },
      orderBy: { id: "desc" },
      select: { metadata: true }
    });
    expect(transaction.mediaAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "technician_service",
        entityId: 11,
        shopId: 1,
        technicianProfileId: 3,
        ownerUserId: 8,
        ownerIdentityId: 18,
        usageType: "cover",
        checksumSha256: "a".repeat(64),
        isActive: true
      })
    });
    expect(transaction.technicianService.update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: { coverImageUrl: "/media/content/cover.jpg", updatedBy: 8 },
      include: expect.any(Object)
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 8,
        action: "technician.service.cover.updated",
        targetType: "technician_service",
        targetId: 11,
        ip: "127.0.0.1",
        userAgent: "jest",
        metadata: {
          shopId: 1,
          technicianProfileId: 3,
          oldMediaAssetId: 101,
          newMediaAssetId: 102,
          oldChecksumSha256: "b".repeat(64),
          newChecksumSha256: "a".repeat(64),
          oldMimeType: "image/png",
          newMimeType: "image/jpeg",
          oldByteCount: 321,
          newByteCount: 4
        }
      }
    });
  });

  it.each([
    ["missing", null],
    ["malformed", { metadata: { newByteCount: "321" } }]
  ])(
    "fails closed before replacement mutations when prior cover audit metadata is %s",
    async (_case, priorAudit) => {
      const transaction = {
        $queryRaw: jest.fn(async () => [{ id: 11 }]),
        mediaAsset: {
          findFirst: jest.fn(async () => ({
            id: 101,
            checksumSha256: "b".repeat(64),
            mimeType: "image/png"
          })),
          updateMany: jest.fn(),
          create: jest.fn()
        },
        technicianService: { update: jest.fn() },
        auditLog: {
          findFirst: jest.fn(async () => priorAudit),
          create: jest.fn()
        }
      };
      const client = {
        $transaction: jest.fn(
          async (callback: (transactionClient: typeof transaction) => unknown) =>
            callback(transaction)
        )
      };
      const repository = new PricingModeRepository(client as unknown as PrismaClient);

      await expect(
        repository.replaceTechnicianServiceCover({
          shopId: 1,
          technicianId: 3,
          serviceId: 11,
          ownerUserId: 8,
          ownerIdentityId: 18,
          url: "/media/content/cover.jpg",
          fileKey: "cover.jpg",
          mimeType: "image/jpeg",
          checksumSha256: "a".repeat(64),
          fileSize: 225,
          width: 1200,
          height: 800,
          now: new Date("2026-09-04T00:00:00.000Z"),
          action: "technician.service.cover.updated",
          context: { ip: "127.0.0.1", userAgent: "jest" }
        })
      ).rejects.toThrow("error.technician_service.cover_lifecycle_incomplete");
      expect(transaction.mediaAsset.updateMany).not.toHaveBeenCalled();
      expect(transaction.mediaAsset.create).not.toHaveBeenCalled();
      expect(transaction.technicianService.update).not.toHaveBeenCalled();
      expect(transaction.auditLog.create).not.toHaveBeenCalled();
    }
  );

  it("removes active cover rows, clears the service cover, and audits atomically", async () => {
    const now = new Date("2026-09-04T01:00:00.000Z");
    const transaction = {
      $queryRaw: jest.fn(async () => [{ id: 11 }]),
      mediaAsset: {
        findFirst: jest.fn(async () => ({
          id: 101,
          checksumSha256: "a".repeat(64),
          mimeType: "image/jpeg"
        })),
        updateMany: jest.fn(async () => ({ count: 1 }))
      },
      technicianService: {
        update: jest.fn(async () => ({ ...serviceRecord(11, 1), coverImageUrl: null }))
      },
      auditLog: {
        findFirst: jest.fn(async () => ({ metadata: { fileSize: 4 } })),
        create: jest.fn(async () => ({}))
      }
    };
    const client = {
      $transaction: jest.fn(async (callback: (transactionClient: typeof transaction) => unknown) =>
        callback(transaction)
      )
    };
    const repository = new PricingModeRepository(client as unknown as PrismaClient);

    await expect(
      repository.removeTechnicianServiceCover({
        shopId: 1,
        technicianId: 3,
        serviceId: 11,
        ownerUserId: 8,
        ownerIdentityId: 18,
        now,
        action: "technician.service.cover.removed",
        context: { ip: "127.0.0.1", userAgent: "jest" }
      })
    ).resolves.toMatchObject({ id: 11, coverImageUrl: null });
    expect(transaction.auditLog.findFirst).toHaveBeenCalledWith({
      where: {
        action: "technician.service.cover.updated",
        targetType: "technician_service",
        targetId: 11,
        OR: [
          { metadata: { path: "$.newMediaAssetId", equals: 101 } },
          { metadata: { path: "$.checksumSha256", equals: "a".repeat(64) } }
        ]
      },
      orderBy: { id: "desc" },
      select: { metadata: true }
    });
    expect(transaction.mediaAsset.updateMany).toHaveBeenCalledWith({
      where: {
        entityType: "technician_service",
        entityId: 11,
        usageType: "cover",
        isActive: true,
        deletedAt: null
      },
      data: { isActive: false, deletedAt: now }
    });
    expect(transaction.technicianService.update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: { coverImageUrl: null, updatedBy: 8 },
      include: expect.any(Object)
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 8,
        action: "technician.service.cover.removed",
        targetType: "technician_service",
        targetId: 11,
        ip: "127.0.0.1",
        userAgent: "jest",
        metadata: {
          shopId: 1,
          technicianProfileId: 3,
          oldMediaAssetId: 101,
          newMediaAssetId: null,
          oldChecksumSha256: "a".repeat(64),
          newChecksumSha256: null,
          oldMimeType: "image/jpeg",
          newMimeType: null,
          oldByteCount: 4,
          newByteCount: null
        }
      }
    });
  });

  it.each([
    ["with an active cover", 1],
    ["without an active cover", 0]
  ])("soft-deletes an owned service %s in one audited transaction", async (_case, coverCount) => {
    const now = new Date("2026-09-04T02:00:00.000Z");
    const transaction = {
      $queryRaw: jest.fn(async () => [{ id: 11 }]),
      mediaAsset: { updateMany: jest.fn(async () => ({ count: coverCount })) },
      technicianService: { update: jest.fn(async () => serviceRecord(11, 1, now)) },
      auditLog: { create: jest.fn(async () => ({})) }
    };
    const client = {
      technicianService: { updateMany: jest.fn(async () => ({ count: 1 })) },
      $transaction: jest.fn(async (callback: (transactionClient: typeof transaction) => unknown) =>
        callback(transaction)
      )
    };
    const repository = new PricingModeRepository(client as unknown as PrismaClient);
    const auditLog = {
      actorId: 8,
      action: "technician.services.delete",
      targetType: "shop",
      targetId: 1,
      ip: "127.0.0.1",
      userAgent: "jest",
      metadata: { technicianId: 3, serviceId: 11 }
    };

    await expect(
      repository.deleteTechnicianService({
        shopId: 1,
        technicianId: 3,
        serviceId: 11,
        updatedBy: 8,
        now,
        auditLog
      })
    ).resolves.toBe(true);

    expect(client.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.mediaAsset.updateMany).toHaveBeenCalledWith({
      where: {
        entityType: "technician_service",
        entityId: 11,
        usageType: "cover",
        isActive: true,
        deletedAt: null
      },
      data: { isActive: false, deletedAt: now }
    });
    expect(transaction.technicianService.update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: {
        coverImageUrl: null,
        isActive: false,
        isBookable: false,
        updatedBy: 8,
        deletedAt: now
      }
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: auditLog
    });
  });

  it("rejects a wrong-scope service deletion before media, service, or audit mutation", async () => {
    const transaction = {
      $queryRaw: jest.fn(async () => []),
      mediaAsset: { updateMany: jest.fn() },
      technicianService: { update: jest.fn() },
      auditLog: { create: jest.fn() }
    };
    const client = {
      technicianService: { updateMany: jest.fn(async () => ({ count: 0 })) },
      $transaction: jest.fn(async (callback: (transactionClient: typeof transaction) => unknown) =>
        callback(transaction)
      )
    };
    const repository = new PricingModeRepository(client as unknown as PrismaClient);

    await expect(
      repository.deleteTechnicianService({
        shopId: 2,
        technicianId: 3,
        serviceId: 11,
        updatedBy: 8,
        now: new Date("2026-09-04T02:00:00.000Z"),
        auditLog: {
          actorId: 8,
          action: "technician.services.delete",
          targetType: "shop",
          targetId: 2
        }
      })
    ).resolves.toBe(false);
    expect(transaction.mediaAsset.updateMany).not.toHaveBeenCalled();
    expect(transaction.technicianService.update).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it("propagates an audit failure so the service and cover cleanup transaction rolls back", async () => {
    const transaction = {
      $queryRaw: jest.fn(async () => [{ id: 11 }]),
      mediaAsset: { updateMany: jest.fn(async () => ({ count: 1 })) },
      technicianService: { update: jest.fn(async () => serviceRecord(11, 1)) },
      auditLog: { create: jest.fn(async () => Promise.reject(new Error("audit failed"))) }
    };
    const client = {
      technicianService: { updateMany: jest.fn(async () => ({ count: 1 })) },
      $transaction: jest.fn(async (callback: (transactionClient: typeof transaction) => unknown) =>
        callback(transaction)
      )
    };
    const repository = new PricingModeRepository(client as unknown as PrismaClient);

    await expect(
      repository.deleteTechnicianService({
        shopId: 1,
        technicianId: 3,
        serviceId: 11,
        updatedBy: 8,
        now: new Date("2026-09-04T02:00:00.000Z"),
        auditLog: {
          actorId: 8,
          action: "technician.services.delete",
          targetType: "shop",
          targetId: 1
        }
      })
    ).rejects.toThrow("audit failed");
    expect(client.$transaction).toHaveBeenCalledTimes(1);
  });

  it("returns null for cross-scope cover writes without media, service, or audit mutations", async () => {
    const transaction = {
      $queryRaw: jest.fn(async () => []),
      mediaAsset: {
        updateMany: jest.fn(),
        create: jest.fn()
      },
      technicianService: { update: jest.fn() },
      auditLog: { create: jest.fn() }
    };
    const client = {
      $transaction: jest.fn(async (callback: (transactionClient: typeof transaction) => unknown) =>
        callback(transaction)
      )
    };
    const repository = new PricingModeRepository(client as unknown as PrismaClient);

    await expect(
      repository.replaceTechnicianServiceCover({
        shopId: 2,
        technicianId: 3,
        serviceId: 11,
        ownerUserId: 8,
        ownerIdentityId: 18,
        url: "/media/content/cover.jpg",
        fileKey: "cover.jpg",
        mimeType: "image/jpeg",
        checksumSha256: "a".repeat(64),
        fileSize: 4,
        width: 1200,
        height: 800,
        now: new Date("2026-09-04T00:00:00.000Z"),
        action: "technician.service.cover.updated",
        context: { ip: "127.0.0.1", userAgent: "jest" }
      })
    ).resolves.toBeNull();
    await expect(
      repository.removeTechnicianServiceCover({
        shopId: 1,
        technicianId: 4,
        serviceId: 11,
        ownerUserId: 8,
        ownerIdentityId: 18,
        now: new Date("2026-09-04T00:00:00.000Z"),
        action: "technician.service.cover.removed",
        context: { ip: "127.0.0.1", userAgent: "jest" }
      })
    ).resolves.toBeNull();
    expect(transaction.mediaAsset.updateMany).not.toHaveBeenCalled();
    expect(transaction.mediaAsset.create).not.toHaveBeenCalled();
    expect(transaction.technicianService.update).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it("checks active non-deleted and non-purged media references by URL", async () => {
    const findFirst = jest.fn(async () => ({ id: 101 }));
    const repository = new PricingModeRepository({
      mediaAsset: { findFirst }
    } as unknown as PrismaClient);

    await expect(repository.hasActiveMediaUrl("/media/content/cover.jpg")).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        url: "/media/content/cover.jpg",
        isActive: true,
        deletedAt: null,
        purgedAt: null
      },
      select: { id: true }
    });
  });
});
