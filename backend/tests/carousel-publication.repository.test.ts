import { CarouselPublicationRepository } from "../src/repositories/carousel-publication.repository";
import type {
  CreateCarouselDraftMutation,
  PublishCarouselMutation
} from "../src/services/carousel-publication.service";

const now = new Date("2026-08-29T06:00:00.000Z");
const cached = {
  scene: "USER_HOME",
  releaseId: 71,
  version: 1,
  status: "draft",
  lockVersion: 1,
  publishAt: null,
  activatedAt: null,
  disabledAt: null,
  archivedAt: null,
  sourceReleaseId: null,
  slides: [],
  createdAt: now.toISOString(),
  updatedAt: now.toISOString()
};
const createInput: CreateCarouselDraftMutation = {
  scene: "USER_HOME",
  idempotencyKey: "11111111-1111-4111-8111-111111111111",
  requestFingerprint: "a".repeat(64),
  sourceLocale: "ja",
  slides: [],
  actorUserId: 41,
  actor: {
    userId: 41,
    email: "operator@example.test",
    accessTokenJti: "test",
    accessTokenExpiresAt: 1_800_000_000,
    roles: ["operator"],
    permissions: []
  },
  context: { ip: "127.0.0.1", userAgent: "carousel-repository-test" },
  validateAffiliateTask: jest.fn(async () => undefined),
  now
};

const sqlText = (query: { strings?: readonly string[] }): string => query.strings?.join(" ") ?? "";

describe("CarouselPublicationRepository", () => {
  it("exposes the complete atomic lifecycle boundary", () => {
    expect(new CarouselPublicationRepository({} as never)).toEqual(
      expect.objectContaining({
        getScene: expect.any(Function),
        createDraft: expect.any(Function),
        findRelease: expect.any(Function),
        replaceDraft: expect.any(Function),
        updateLocale: expect.any(Function),
        publish: expect.any(Function),
        schedule: expect.any(Function),
        disable: expect.any(Function),
        cloneForRollback: expect.any(Function),
        listHistory: expect.any(Function),
        findPublishedScene: expect.any(Function),
        searchTargets: expect.any(Function),
        listDueScheduledReleases: expect.any(Function),
        activateDueScheduledRelease: expect.any(Function),
        recordDueScheduledReleaseFailure: expect.any(Function)
      })
    );
  });

  it("replays an exact actor-bound command before volatile target policy", async () => {
    const transaction = {
      contentPublicationCommand: {
        findUnique: jest.fn(async () => ({
          requestFingerprint: createInput.requestFingerprint,
          actorUserId: 41,
          result: cached
        }))
      }
    };
    const client = {
      $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
        operation(transaction)
      )
    };
    const validateAffiliateTask = jest.fn(async () => undefined);
    const repository = new CarouselPublicationRepository(client as never);
    const result = await repository.publish({
      scene: "USER_HOME",
      releaseId: 71,
      idempotencyKey: createInput.idempotencyKey,
      requestFingerprint: createInput.requestFingerprint,
      expectedLockVersion: 1,
      validateAffiliateTask,
      actorUserId: 41,
      actor: createInput.actor,
      context: createInput.context,
      now
    });
    expect(result).toMatchObject({ releaseId: 71 });
    expect(validateAffiliateTask).not.toHaveBeenCalled();
  });

  it("replays an exact draft creation before a changed Affiliate target policy", async () => {
    const transaction = {
      contentPublicationCommand: {
        findUnique: jest.fn(async () => ({
          requestFingerprint: createInput.requestFingerprint,
          actorUserId: 41,
          result: cached
        }))
      }
    };
    const validateAffiliateTask = jest.fn(async () => {
      throw new Error("policy changed");
    });
    const repository = new CarouselPublicationRepository({
      $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
        operation(transaction)
      )
    } as never);

    await expect(
      repository.createDraft({ ...createInput, validateAffiliateTask })
    ).resolves.toMatchObject({ releaseId: 71 });
    expect(validateAffiliateTask).not.toHaveBeenCalled();
  });

  it("rejects exact-key replay by a different actor", async () => {
    const transaction = {
      contentPublicationCommand: {
        findUnique: jest.fn(async () => ({
          requestFingerprint: createInput.requestFingerprint,
          actorUserId: 99,
          result: cached
        }))
      }
    };
    const client = {
      $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
        operation(transaction)
      )
    };
    const repository = new CarouselPublicationRepository(client as never);
    await expect(repository.createDraft(createInput)).rejects.toMatchObject({
      message: "error.idempotency_key_reused",
      statusCode: 409
    });
  });

  it("boundedly recovers the exact command after P2002, P2025, and P2034 races", async () => {
    for (const code of ["P2002", "P2025", "P2034"]) {
      const findUnique = jest.fn().mockResolvedValueOnce(null).mockResolvedValue({
        requestFingerprint: createInput.requestFingerprint,
        actorUserId: 41,
        result: cached
      });
      const repository = new CarouselPublicationRepository({
        $transaction: jest.fn().mockRejectedValue({ code }),
        contentPublicationCommand: { findUnique }
      } as never);
      await expect(repository.createDraft(createInput)).resolves.toMatchObject({ releaseId: 71 });
      expect(findUnique).toHaveBeenCalledTimes(2);
    }
  });

  it("public reads select only the actual PUBLISHED slot and never a due SCHEDULED release", async () => {
    const findFirst = jest.fn(async () => null);
    const repository = new CarouselPublicationRepository({
      carouselRelease: { findFirst }
    } as never);
    await expect(
      repository.findPublishedScene("USER_HOME", "ja", createInput.actor, now)
    ).resolves.toMatchObject({ releaseVersion: null, slides: [] });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PUBLISHED", publishedSlotKey: { not: null } })
      })
    );
    expect(JSON.stringify((findFirst.mock.calls as unknown[][])[0]?.[0])).not.toContain(
      "SCHEDULED"
    );
  });

  it("publishes a non-clickable user-home slide with the requested locale image", async () => {
    const defaultMedia = {
      id: 1,
      isActive: true,
      purgedAt: null,
      deletedAt: null,
      entityType: "content_publication_upload",
      usageType: "content_publication_public",
      url: "/media/content/default.png",
      checksumSha256: "a".repeat(64)
    };
    const japaneseMedia = {
      ...defaultMedia,
      id: 2,
      url: "/media/content/welcome-ja.png",
      checksumSha256: "b".repeat(64)
    };
    const repository = new CarouselPublicationRepository({
      carouselRelease: {
        findFirst: jest.fn(async () => ({
          version: 9,
          slides: [
            {
              publicId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              isEnabled: true,
              visibleFrom: null,
              visibleUntil: null,
              targetType: "NONE",
              shopId: null,
              technicianProfileId: null,
              serviceId: null,
              announcementId: null,
              affiliateTaskId: null,
              shop: null,
              technicianProfile: null,
              service: null,
              announcement: null,
              mediaAsset: defaultMedia,
              translations: [
                {
                  locale: "JA",
                  badge: "ようこそ",
                  title: "NeeDoへようこそ",
                  caption: null,
                  ctaLabel: null,
                  imageAltText: "NeeDoへようこそ",
                  mediaAsset: japaneseMedia
                }
              ]
            }
          ]
        }))
      }
    } as never);

    await expect(
      repository.findPublishedScene("USER_HOME", "ja", createInput.actor, now)
    ).resolves.toMatchObject({
      releaseVersion: 9,
      slides: [
        {
          imageUrl: "/media/content/welcome-ja.png",
          ctaLabel: null,
          target: { type: "none" }
        }
      ]
    });
  });

  it("falls back to the default slide image when the requested locale has no override", async () => {
    const defaultMedia = {
      id: 1,
      isActive: true,
      purgedAt: null,
      deletedAt: null,
      entityType: "content_publication_upload",
      usageType: "content_publication_public",
      url: "/media/content/default.png",
      checksumSha256: "a".repeat(64)
    };
    const repository = new CarouselPublicationRepository({
      carouselRelease: {
        findFirst: jest.fn(async () => ({
          version: 10,
          slides: [
            {
              publicId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              isEnabled: true,
              visibleFrom: null,
              visibleUntil: null,
              targetType: "NONE",
              shopId: null,
              technicianProfileId: null,
              serviceId: null,
              announcementId: null,
              affiliateTaskId: null,
              shop: null,
              technicianProfile: null,
              service: null,
              announcement: null,
              mediaAsset: defaultMedia,
              translations: [
                {
                  locale: "ZH_CN",
                  badge: "欢迎",
                  title: "欢迎进入 NeeDo",
                  caption: null,
                  ctaLabel: null,
                  imageAltText: "欢迎进入 NeeDo",
                  mediaAsset: null
                }
              ]
            }
          ]
        }))
      }
    } as never);

    await expect(
      repository.findPublishedScene("USER_HOME", "zh-CN", createInput.actor, now)
    ).resolves.toMatchObject({
      slides: [{ imageUrl: "/media/content/default.png", target: { type: "none" } }]
    });
  });

  it("enumerates due carousel releases in deterministic publishAt/id order", async () => {
    const publishAt = new Date("2026-08-29T05:00:00.000Z");
    const findMany = jest.fn(async () => [{ id: 71, scene: "USER_HOME", publishAt }]);
    const repository = new CarouselPublicationRepository({
      carouselRelease: { findMany }
    } as never);

    await expect(
      repository.listDueScheduledReleases({ now, batchSize: 25, maxAttempts: 3 })
    ).resolves.toEqual([
      {
        aggregateType: "carousel",
        aggregateKey: "USER_HOME",
        aggregateTargetId: 71,
        releaseId: 71,
        publishAt
      }
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        status: "SCHEDULED",
        scheduledSlotKey: { not: null },
        publishAt: { lte: now },
        activationAttempts: { lt: 3 },
        deletedAt: null
      },
      orderBy: [{ publishAt: "asc" }, { id: "asc" }],
      take: 25,
      select: { id: true, scene: true, publishAt: true }
    });
  });

  it("locks and activates the exact carousel release without double switching", async () => {
    const publishAt = new Date("2026-08-29T05:00:00.000Z");
    const queryRaw = jest.fn(async () => [{ id: 71 }]);
    const transaction = {
      $queryRaw: queryRaw,
      contentPublicationCommand: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async () => ({}))
      },
      carouselRelease: {
        findFirst: jest.fn(async () => ({
          id: 71,
          scene: "USER_HOME",
          status: "SCHEDULED",
          scheduledSlotKey: "carousel:USER_HOME:scheduled",
          publishAt,
          activationAttempts: 0,
          deletedAt: null
        })),
        updateMany: jest.fn(async () => ({ count: 1 }))
      }
    };
    const repository = new CarouselPublicationRepository({
      $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
        operation(transaction)
      )
    } as never);
    const commandKey = "content-publication:carousel:USER_HOME:release:71:activate";

    await expect(
      repository.activateDueScheduledRelease({
        release: {
          aggregateType: "carousel",
          aggregateKey: "USER_HOME",
          aggregateTargetId: 71,
          releaseId: 71,
          publishAt
        },
        now,
        maxAttempts: 3,
        sequence: 0,
        commandKey,
        requestFingerprint: "c".repeat(64)
      })
    ).resolves.toEqual({ activated: true, replayed: false });
    const lockedQuery = (queryRaw.mock.calls as unknown[][])[0]?.[0] as {
      strings?: readonly string[];
      values?: unknown[];
    };
    expect(sqlText(lockedQuery)).toContain(
      "SELECT id FROM carousel_releases WHERE id ="
    );
    expect(sqlText(lockedQuery)).toContain("FOR UPDATE");
    expect(lockedQuery.values).toEqual([71]);
    expect(transaction.carouselRelease.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { scene: "USER_HOME", publishedSlotKey: { not: null }, deletedAt: null },
        data: expect.objectContaining({ status: "ARCHIVED", publishedSlotKey: null })
      })
    );
    expect(transaction.carouselRelease.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: 71,
          status: "SCHEDULED",
          scheduledSlotKey: "carousel:USER_HOME:scheduled",
          activationAttempts: { lt: 3 }
        }),
        data: expect.objectContaining({
          status: "PUBLISHED",
          scheduledSlotKey: null,
          publishedSlotKey: "carousel:USER_HOME:published",
          activatedAt: now,
          lastActivationAttemptAt: now
        })
      })
    );
  });

  it("keeps a non-final failed carousel release scheduled and audits with the transaction client", async () => {
    const publishAt = new Date("2026-08-29T05:00:00.000Z");
    const transaction = {
      $queryRaw: jest.fn(async () => [{ id: 71 }]),
      carouselRelease: {
        findFirst: jest.fn(async () => ({
          id: 71,
          scene: "USER_HOME",
          status: "SCHEDULED",
          scheduledSlotKey: "carousel:USER_HOME:scheduled",
          publishAt,
          activationAttempts: 0,
          deletedAt: null
        })),
        updateMany: jest.fn(async () => ({ count: 1 }))
      }
    };
    const audit = {
      actorId: null,
      action: "content_publication.schedule_failed",
      targetType: "CarouselRelease",
      targetId: 71,
      metadata: { releaseId: 71 }
    };
    const auditLogRepository = {
      create: jest.fn(async () => undefined),
      createInTransaction: jest.fn(async () => undefined)
    };
    const repository = new CarouselPublicationRepository({
      $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
        operation(transaction)
      )
    } as never);

    await expect(
      repository.recordDueScheduledReleaseFailure({
        release: {
          aggregateType: "carousel",
          aggregateKey: "USER_HOME",
          aggregateTargetId: 71,
          releaseId: 71,
          publishAt
        },
        now,
        maxAttempts: 3,
        errorKey: "error.content.schedule_activation_failed",
        runId: "run-retry",
        audit,
        auditLogRepository
      })
    ).resolves.toEqual({ recorded: true, activationAttempts: 1, disabled: false });
    expect(transaction.carouselRelease.updateMany).toHaveBeenCalledWith({
      where: {
        id: 71,
        status: "SCHEDULED",
        scheduledSlotKey: "carousel:USER_HOME:scheduled",
        activationAttempts: 0,
        deletedAt: null
      },
      data: {
        activationAttempts: { increment: 1 },
        lastActivationAttemptAt: now,
        lastActivationError: "error.content.schedule_activation_failed",
        lockVersion: { increment: 1 },
        updatedAt: now
      }
    });
    expect(auditLogRepository.createInTransaction).toHaveBeenCalledWith(transaction, audit);
    expect(auditLogRepository.create).not.toHaveBeenCalled();
  });

  it("revalidates every slide target and media before changing publication slots", async () => {
    const validateAffiliateTask = jest.fn(async () => undefined);
    const release = {
      id: 71,
      scene: "USER_HOME",
      version: 1,
      status: "DRAFT",
      lockVersion: 1,
      slides: [
        {
          id: 1,
          mediaAssetId: 1,
          sortOrder: 0,
          isEnabled: true,
          visibleFrom: null,
          visibleUntil: null,
          targetType: "SHOP",
          shopId: 7,
          technicianProfileId: null,
          serviceId: null,
          announcementId: null,
          affiliateTaskId: null,
          mediaAsset: {
            id: 1,
            isActive: true,
            purgedAt: null,
            deletedAt: null,
            entityType: "content_publication_upload",
            usageType: "content_publication_public",
            url: "/media/content/a.png",
            checksumSha256: "a".repeat(64)
          },
          shop: {
            id: 7,
            status: "published",
            deletedAt: null,
            publicIdentifier: { publicId: "shop0000000001", status: "ACTIVE", deletedAt: null }
          },
          technicianProfile: null,
          service: null,
          announcement: null,
          translations: ["ZH_CN", "ZH_TW", "EN", "JA", "KO"].map((locale) => ({
            locale,
            title: "Title",
            imageAltText: "Image"
          }))
        }
      ]
    };
    const transaction = {
      contentPublicationCommand: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async () => ({}))
      },
      carouselRelease: {
        findFirst: jest.fn(async () => release),
        findMany: jest.fn(async () => []),
        updateMany: jest.fn(async () => ({ count: 1 }))
      },
      auditLog: { create: jest.fn(async () => ({})) }
    };
    const repository = new CarouselPublicationRepository({
      $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
        operation(transaction)
      ),
      contentPublicationCommand: { findUnique: jest.fn(async () => null) }
    } as never);
    await repository.publish({
      ...createInput,
      releaseId: 71,
      expectedLockVersion: 1,
      validateAffiliateTask
    } as PublishCarouselMutation);
    expect(transaction.carouselRelease.updateMany).toHaveBeenCalled();
  });

  it("resolves same-checksum media to the acting uploader and carries that exact asset ID", async () => {
    const defaultChecksum = "c".repeat(64);
    const japaneseChecksum = "d".repeat(64);
    const mediaFindFirst = jest.fn(async ({ where }: { where: { checksumSha256: string } }) => ({
      id: where.checksumSha256 === japaneseChecksum ? 333 : 222
    }));
    const transaction = {
      mediaAsset: { findFirst: mediaFindFirst }
    };
    const repository = new CarouselPublicationRepository({} as never);
    const resolver = repository as unknown as {
      resolveSlides: (
        tx: unknown,
        scene: "USER_HOME",
        slides: CreateCarouselDraftMutation["slides"],
        actorUserId: number,
        effectiveAt: Date,
        validateAffiliateTask: (taskId: number) => Promise<void>,
        scopeShopId: number | null
      ) => Promise<
        Array<{
          mediaAssetId: number;
          target: { type: "none" };
          translations: Record<string, { mediaAssetId: number | null }>;
        }>
      >;
    };
    const result = await resolver.resolveSlides(
      transaction,
      "USER_HOME",
      [
        {
          publicId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          defaultMediaAssetPublicId: defaultChecksum,
          sortOrder: 0,
          isEnabled: true,
          visibleFrom: null,
          visibleUntil: null,
          target: { type: "none" },
          translations: {
            "zh-CN": { mediaAssetPublicId: null },
            "zh-TW": { mediaAssetPublicId: null },
            en: { mediaAssetPublicId: null },
            ja: { mediaAssetPublicId: japaneseChecksum },
            ko: { mediaAssetPublicId: null }
          }
        }
      ] as never,
      41,
      now,
      jest.fn(async () => undefined),
      null
    );
    expect(mediaFindFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          checksumSha256: defaultChecksum,
          entityType: "content_publication_upload",
          usageType: "content_publication_public",
          ownerUserId: 41,
          isActive: true,
          purgedAt: null,
          deletedAt: null
        }),
        orderBy: { id: "desc" }
      })
    );
    expect(mediaFindFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          checksumSha256: japaneseChecksum,
          ownerUserId: 41
        })
      })
    );
    expect(result[0]).toMatchObject({
      mediaAssetId: 222,
      target: { type: "none" },
      translations: { ja: { mediaAssetId: 333 }, "zh-CN": { mediaAssetId: null } }
    });
  });

  it("stores a none target without any business target foreign key", () => {
    const repository = new CarouselPublicationRepository({} as never);
    const scalarData = (
      repository as unknown as {
        slideScalarData: (slide: unknown) => Record<string, unknown>;
      }
    ).slideScalarData({
      publicId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      defaultMediaAssetPublicId: "a".repeat(64),
      mediaAssetId: 1,
      sortOrder: 0,
      isEnabled: true,
      visibleFrom: null,
      visibleUntil: null,
      target: { type: "none" },
      translations: {}
    });

    expect(scalarData).toMatchObject({
      targetType: "NONE",
      shopId: null,
      technicianProfileId: null,
      serviceId: null,
      announcementId: null,
      affiliateTaskId: null
    });
  });

  it("preserves localized media overrides when preparing a rollback clone", () => {
    const repository = new CarouselPublicationRepository({} as never);
    const cloneSlides = (
      repository as unknown as {
        cloneSlides: (release: unknown) => CreateCarouselDraftMutation["slides"];
      }
    ).cloneSlides.bind(repository);
    const slides = cloneSlides({
      slides: [
        {
          sortOrder: 0,
          isEnabled: true,
          visibleFrom: null,
          visibleUntil: null,
          targetType: "NONE",
          shopId: null,
          technicianProfileId: null,
          serviceId: null,
          announcementId: null,
          affiliateTaskId: null,
          mediaAsset: { checksumSha256: "a".repeat(64) },
          translations: [
            {
              locale: "JA",
              mediaAsset: { checksumSha256: "b".repeat(64) },
              badge: null,
              title: "NeeDoへようこそ",
              caption: null,
              ctaLabel: null,
              imageAltText: "NeeDoへようこそ",
              sourceLocale: "JA"
            }
          ]
        }
      ]
    });

    expect(slides[0]).toMatchObject({
      defaultMediaAssetPublicId: "a".repeat(64),
      target: { type: "none" },
      translations: { ja: { mediaAssetPublicId: "b".repeat(64) } }
    });
  });

  it("searches paginated user-home targets with text, scope, live status, soft-delete, and public IDs", async () => {
    const findMany = jest.fn(async () => [
      {
        id: 7,
        name: "Scoped Shibuya Shop",
        status: "published",
        publicIdentifier: { publicId: "shop0000000007" }
      }
    ]);
    const count = jest.fn(async () => 1);
    const repository = new CarouselPublicationRepository({ shop: { findMany, count } } as never);
    const result = await repository.searchTargets({
      scene: "USER_HOME",
      type: "shop",
      q: "Shibuya",
      page: 1,
      pageSize: 10,
      scopeShopId: 7,
      actor: createInput.actor,
      now,
      validateAffiliateTask: jest.fn(async () => undefined)
    });

    expect(result).toEqual({
      list: [
        {
          type: "shop",
          publicId: "shop0000000007",
          label: "Scoped Shibuya Shop",
          status: "published",
          target: { type: "shop", publicId: "shop0000000007" }
        }
      ],
      total: 1
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 7,
          status: "published",
          deletedAt: null,
          publicIdentifier: { is: { status: "ACTIVE", deletedAt: null } },
          OR: [{ name: { contains: "Shibuya" } }, { city: { contains: "Shibuya" } }]
        }),
        take: 10
      })
    );
    expect(JSON.stringify(result)).not.toMatch(/shopId|technicianProfileId|serviceId/);
  });

  it("combines technician shop scope and text search without overwriting either predicate", async () => {
    const findMany = jest.fn(async () => []);
    const count = jest.fn(async () => 0);
    const repository = new CarouselPublicationRepository({
      technicianProfile: { findMany, count }
    } as never);

    await repository.searchTargets({
      scene: "USER_HOME",
      type: "technician",
      q: "Scoped",
      page: 1,
      pageSize: 10,
      scopeShopId: 7,
      actor: createInput.actor,
      now,
      validateAffiliateTask: jest.fn(async () => undefined)
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              OR: [
                { shopId: 7 },
                {
                  technicianShopAffiliations: {
                    some: { shopId: 7, workStatus: "ACTIVE", deletedAt: null }
                  }
                }
              ]
            },
            { OR: [{ displayName: { contains: "Scoped" } }, { city: { contains: "Scoped" } }] }
          ]
        })
      })
    );
  });

  it("enforces shop scope while resolving directly submitted picker targets", async () => {
    const shopFindFirst = jest.fn(async () => null);
    const technicianFindFirst = jest.fn(async () => null);
    const serviceFindFirst = jest.fn(async () => null);
    const repository = new CarouselPublicationRepository({} as never);
    const resolver = repository as unknown as {
      resolveTarget: (
        tx: unknown,
        scene: "USER_HOME",
        target:
          | { type: "shop"; publicId: string }
          | { type: "technician"; technicianProfileId: number }
          | { type: "service"; serviceId: number },
        scopeShopId: number | null
      ) => Promise<unknown>;
    };
    const transaction = {
      shop: { findFirst: shopFindFirst },
      technicianProfile: { findFirst: technicianFindFirst },
      service: { findFirst: serviceFindFirst }
    };

    await expect(
      resolver.resolveTarget(
        transaction,
        "USER_HOME",
        { type: "shop", publicId: "shop0000000099" },
        7
      )
    ).rejects.toMatchObject({ message: "error.content.target_unavailable" });
    await expect(
      resolver.resolveTarget(
        transaction,
        "USER_HOME",
        { type: "technician", technicianProfileId: 99 },
        7
      )
    ).rejects.toMatchObject({ message: "error.content.target_unavailable" });
    await expect(
      resolver.resolveTarget(transaction, "USER_HOME", { type: "service", serviceId: 99 }, 7)
    ).rejects.toMatchObject({ message: "error.content.target_unavailable" });

    expect(shopFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ AND: expect.arrayContaining([{ id: 7 }]) })
      })
    );
    expect(technicianFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              OR: [
                { shopId: 7 },
                {
                  technicianShopAffiliations: {
                    some: { shopId: 7, workStatus: "ACTIVE", deletedAt: null }
                  }
                }
              ]
            }
          ])
        })
      })
    );
    expect(serviceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ AND: expect.arrayContaining([{ shopId: 7 }]) })
      })
    );
  });

  it("searches only current published announcements inside shop scope", async () => {
    const findMany = jest.fn(async () => [
      {
        announcement: {
          publicId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          affiliateTask: { taskCode: "AFF-PUBLIC-29" }
        },
        translations: [{ title: "Current notice" }]
      }
    ]);
    const count = jest.fn(async () => 1);
    const repository = new CarouselPublicationRepository({
      officialAnnouncementRelease: { findMany, count }
    } as never);
    const result = await repository.searchTargets({
      scene: "AFFILIATE_HOME_NOTICE",
      type: "announcement",
      q: "Current",
      page: 1,
      pageSize: 20,
      scopeShopId: 7,
      actor: createInput.actor,
      now,
      validateAffiliateTask: jest.fn(async () => undefined)
    });
    expect(result.list[0]).toEqual({
      type: "affiliate_announcement",
      publicId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      label: "Current notice",
      status: "published",
      target: {
        type: "affiliate_announcement",
        announcementPublicId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        taskCode: "AFF-PUBLIC-29"
      }
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PUBLISHED",
          publishedSlotKey: { not: null },
          deletedAt: null,
          announcement: expect.objectContaining({
            deletedAt: null,
            affiliateTask: { is: { publisherShopId: 7, deletedAt: null } }
          })
        })
      })
    );
  });

  it("reuses Affiliate marketplace visibility and omits unavailable tasks from target search", async () => {
    const validateAffiliateTask = jest.fn(async (taskId: number) => {
      if (taskId === 30) throw new Error("not visible");
    });
    const repository = new CarouselPublicationRepository({
      affiliateTask: {
        findMany: jest.fn(async () => [
          { id: 29, taskCode: "AFF-29", name: "Visible", status: "ACTIVE" },
          { id: 30, taskCode: "AFF-30", name: "Hidden", status: "ACTIVE" }
        ])
      }
    } as never);
    const result = await repository.searchTargets({
      scene: "AFFILIATE_HOME_NOTICE",
      type: "affiliate_task",
      page: 1,
      pageSize: 20,
      scopeShopId: null,
      actor: createInput.actor,
      now,
      validateAffiliateTask
    });
    expect(result).toEqual({
      list: [{ type: "affiliate_task", taskCode: "AFF-29", label: "Visible", status: "active" }],
      total: 1
    });
    expect(validateAffiliateTask).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toMatch(/"id"|taskId|affiliateTaskId/);
  });

  it("keeps mixed user-home pagination stable in type-grouped database order", async () => {
    const shops = [
      [1, "Zulu", "shop0000000001"],
      [2, "Echo", "shop0000000002"],
      [3, "Alpha", "shop0000000003"]
    ] as const;
    const technicians = [
      [4, "Yankee", "s0000000004"],
      [5, "Foxtrot", "s0000000005"],
      [6, "Bravo", "s0000000006"]
    ] as const;
    const services = [
      [7, "Xray", "77777777-7777-4777-8777-777777777777"],
      [8, "Golf", "88888888-8888-4888-8888-888888888888"],
      [9, "Charlie", "99999999-9999-4999-8999-999999999999"]
    ] as const;
    const prefix = <T extends readonly [number, string, string]>(
      rows: readonly T[],
      args: { orderBy?: unknown; take?: number }
    ) => {
      const ordered =
        JSON.stringify(args.orderBy).includes("name") ||
        JSON.stringify(args.orderBy).includes("displayName")
          ? [...rows].sort(
              (left, right) => left[1].localeCompare(right[1]) || left[2].localeCompare(right[2])
            )
          : [...rows];
      return ordered.slice(0, args.take);
    };
    const client = {
      shop: {
        findMany: jest.fn(async (args: { orderBy?: unknown; take?: number }) =>
          prefix(shops, args).map(([id, name, publicId]) => ({
            id,
            name,
            status: "published",
            publicIdentifier: { publicId }
          }))
        ),
        count: jest.fn(async () => shops.length)
      },
      technicianProfile: {
        findMany: jest.fn(async (args: { orderBy?: unknown; take?: number }) =>
          prefix(technicians, args).map(([id, displayName, publicId]) => ({
            id,
            displayName,
            status: "published",
            user: { identities: [{ publicIdentifier: { publicId } }] }
          }))
        ),
        count: jest.fn(async () => technicians.length)
      },
      service: {
        findMany: jest.fn(async (args: { orderBy?: unknown; take?: number }) =>
          prefix(services, args).map(([id, name, publicId]) => ({
            id,
            publicId,
            name,
            status: "published"
          }))
        ),
        count: jest.fn(async () => services.length)
      }
    };
    const repository = new CarouselPublicationRepository(client as never);
    const pages = await Promise.all(
      [1, 2, 3].map((page) =>
        repository.searchTargets({
          scene: "USER_HOME",
          page,
          pageSize: 3,
          scopeShopId: null,
          actor: createInput.actor,
          now,
          validateAffiliateTask: jest.fn(async () => undefined)
        })
      )
    );
    expect(pages.map((page) => page.total)).toEqual([9, 9, 9]);
    const flattened = pages.flatMap((page) => page.list);
    expect(flattened.map((item) => item.label)).toEqual([
      "Alpha",
      "Echo",
      "Zulu",
      "Bravo",
      "Foxtrot",
      "Yankee",
      "Charlie",
      "Golf",
      "Xray"
    ]);
    expect(new Set(flattened.map((item) => `${item.type}:${item.label}`)).size).toBe(9);
    expect(JSON.stringify(flattened)).not.toMatch(/shopId|technicianProfileId|serviceId/);
  });

  it("fills three Affiliate task pages across interleaved policy-hidden rows with truthful totals", async () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      id: index + 1,
      taskCode: `AFF-${String(index + 1).padStart(2, "0")}`,
      name: `Task ${String(index + 1).padStart(2, "0")}`,
      status: "ACTIVE"
    }));
    const hidden = new Set([2, 4, 6, 8]);
    const findMany = jest.fn(async (args: { skip?: number; take?: number }) =>
      rows.slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? rows.length))
    );
    const validateAffiliateTask = jest.fn(async (taskId: number) => {
      if (hidden.has(taskId)) throw new Error("policy hidden");
    });
    const repository = new CarouselPublicationRepository({ affiliateTask: { findMany } } as never);
    const pages = [];
    for (const page of [1, 2, 3]) {
      pages.push(
        await repository.searchTargets({
          scene: "AFFILIATE_HOME_NOTICE",
          type: "affiliate_task",
          page,
          pageSize: 2,
          scopeShopId: null,
          actor: createInput.actor,
          now,
          validateAffiliateTask
        })
      );
    }
    expect(pages.map((page) => page.total)).toEqual([6, 6, 6]);
    expect(pages.flatMap((page) => page.list.map((item) => item.label))).toEqual([
      "Task 01",
      "Task 03",
      "Task 05",
      "Task 07",
      "Task 09",
      "Task 10"
    ]);
    expect(validateAffiliateTask).toHaveBeenCalledTimes(30);
  });
});
