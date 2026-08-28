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
        searchTargets: expect.any(Function)
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
          status: "published"
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

  it("searches only current published announcements inside shop scope", async () => {
    const findMany = jest.fn(async () => [
      {
        announcement: { publicId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
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
      status: "published"
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
});
