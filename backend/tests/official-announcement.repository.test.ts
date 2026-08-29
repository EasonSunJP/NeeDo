import { OfficialAnnouncementRepository } from "../src/repositories/official-announcement.repository";
import type {
  CreateAnnouncementDraftMutation,
  PublishAnnouncementMutation
} from "../src/services/official-announcement.service";
import { AppError } from "../src/utils/app-error";

const now = new Date("2026-08-29T03:00:00.000Z");
const input: CreateAnnouncementDraftMutation = {
  publicId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  idempotencyKey: "11111111-1111-4111-8111-111111111111",
  requestFingerprint: "a".repeat(64),
  sourceLocale: "ja",
  affiliateTaskId: null,
  visibleFrom: null,
  visibleUntil: null,
  translations: {
    "zh-CN": {
      title: "通知",
      summary: null,
      body: "正文",
      sourceLocale: "ja",
      isInitialCopy: true
    },
    "zh-TW": {
      title: "通知",
      summary: null,
      body: "正文",
      sourceLocale: "ja",
      isInitialCopy: true
    },
    en: { title: "Notice", summary: null, body: "Body", sourceLocale: "ja", isInitialCopy: true },
    ja: {
      title: "お知らせ",
      summary: null,
      body: "本文",
      sourceLocale: "ja",
      isInitialCopy: false
    },
    ko: { title: "공지", summary: null, body: "본문", sourceLocale: "ja", isInitialCopy: true }
  },
  actorUserId: 41,
  context: { ip: "203.0.113.9", userAgent: "repository-test" },
  now
};

const cachedResult = {
  publicId: input.publicId,
  releaseId: 71,
  version: 1,
  status: "draft",
  lockVersion: 1,
  announcementType: "affiliate_notice",
  visibilityScope: "all_affiliates",
  affiliateTaskId: null,
  publishAt: null,
  visibleFrom: null,
  visibleUntil: null,
  activatedAt: null,
  disabledAt: null,
  archivedAt: null,
  sourceReleaseId: null,
  translations: Object.fromEntries(
    Object.entries(input.translations).map(([locale, translation]) => [
      locale,
      { title: translation.title, summary: translation.summary, body: translation.body }
    ])
  ),
  createdAt: now.toISOString(),
  updatedAt: now.toISOString()
};

const draftRelease = (window: { visibleFrom: Date | null; visibleUntil: Date | null }) => ({
  id: 71,
  announcementId: 12,
  version: 1,
  status: "DRAFT",
  lockVersion: 1,
  visibleFrom: window.visibleFrom,
  visibleUntil: window.visibleUntil,
  announcement: {
    id: 12,
    publicId: input.publicId,
    affiliateTaskId: null
  },
  translations: ["ZH_CN", "ZH_TW", "EN", "JA", "KO"].map((locale) => ({
    locale,
    title: `${locale} title`,
    body: `${locale} body`
  }))
});

const sqlText = (query: { strings?: readonly string[] }): string => query.strings?.join(" ") ?? "";

describe("OfficialAnnouncementRepository", () => {
  it("exposes the complete announcement transaction boundary", () => {
    const repository = new OfficialAnnouncementRepository({} as never);

    expect(repository).toEqual(
      expect.objectContaining({
        createDraft: expect.any(Function),
        list: expect.any(Function),
        findDraft: expect.any(Function),
        updateLocale: expect.any(Function),
        updateMetadata: expect.any(Function),
        publish: expect.any(Function),
        schedule: expect.any(Function),
        disable: expect.any(Function),
        cloneForRollback: expect.any(Function),
        listHistory: expect.any(Function),
        findPublished: expect.any(Function),
        listDueScheduledReleases: expect.any(Function),
        activateDueScheduledRelease: expect.any(Function),
        recordDueScheduledReleaseFailure: expect.any(Function)
      })
    );
  });

  it("returns an exact cached command result before attempting any mutation", async () => {
    const transaction = {
      contentPublicationCommand: {
        findUnique: jest.fn(async () => ({
          requestFingerprint: input.requestFingerprint,
          result: cachedResult
        }))
      },
      officialAnnouncement: { create: jest.fn() }
    };
    const client = {
      $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
        operation(transaction)
      )
    };
    const repository = new OfficialAnnouncementRepository(client as never);

    const result = await repository.createDraft(input);

    expect(result).toMatchObject({ publicId: input.publicId, releaseId: 71, status: "draft" });
    expect(result.createdAt).toEqual(now);
    expect(transaction.officialAnnouncement.create).not.toHaveBeenCalled();
  });

  it("rejects reuse of an idempotency key with a different fingerprint", async () => {
    const transaction = {
      contentPublicationCommand: {
        findUnique: jest.fn(async () => ({
          requestFingerprint: "b".repeat(64),
          result: cachedResult
        }))
      }
    };
    const client = {
      $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
        operation(transaction)
      )
    };
    const repository = new OfficialAnnouncementRepository(client as never);

    await expect(repository.createDraft(input)).rejects.toMatchObject({
      message: "error.idempotency_key_reused",
      statusCode: 409
    });
  });

  it("replays an exact command that won a concurrent idempotency-key race", async () => {
    const uniqueCommandConflict = {
      code: "P2002",
      meta: { target: ["idempotency_key"] }
    };
    const client = {
      $transaction: jest.fn().mockRejectedValue(uniqueCommandConflict),
      contentPublicationCommand: {
        findUnique: jest.fn(async () => ({
          requestFingerprint: input.requestFingerprint,
          result: cachedResult
        }))
      }
    };
    const repository = new OfficialAnnouncementRepository(client as never);

    await expect(repository.createDraft(input)).resolves.toMatchObject({
      publicId: input.publicId,
      releaseId: 71
    });
    expect(client.contentPublicationCommand.findUnique).toHaveBeenCalledWith({
      where: { idempotencyKey: input.idempotencyKey }
    });
  });

  it("boundedly re-reads a command after a race-shaped domain conflict", async () => {
    const conflict = new AppError({
      code: 40001,
      message: "error.content.lock_conflict",
      statusCode: 409
    });
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        requestFingerprint: input.requestFingerprint,
        result: cachedResult
      });
    const client = {
      $transaction: jest.fn().mockRejectedValue(conflict),
      contentPublicationCommand: { findUnique }
    };
    const repository = new OfficialAnnouncementRepository(client as never);

    await expect(repository.createDraft(input)).resolves.toMatchObject({
      publicId: input.publicId,
      releaseId: 71
    });
    expect(findUnique).toHaveBeenCalledTimes(3);
  });

  it("returns idempotency reuse when a delayed race winner has a different fingerprint", async () => {
    const client = {
      $transaction: jest.fn().mockRejectedValue({ code: "P2034" }),
      contentPublicationCommand: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValue({ requestFingerprint: "b".repeat(64), result: cachedResult })
      }
    };
    const repository = new OfficialAnnouncementRepository(client as never);

    await expect(repository.createDraft(input)).rejects.toMatchObject({
      message: "error.idempotency_key_reused",
      statusCode: 409
    });
  });

  it("enumerates bounded due scheduled releases in publishAt/id order", async () => {
    const publishAt = new Date("2026-08-29T02:00:00.000Z");
    const findMany = jest.fn(async () => [
      {
        id: 71,
        publishAt,
        announcement: { id: 12, publicId: input.publicId }
      }
    ]);
    const repository = new OfficialAnnouncementRepository({
      officialAnnouncementRelease: { findMany }
    } as never);

    await expect(
      repository.listDueScheduledReleases({ now, batchSize: 25, maxAttempts: 3 })
    ).resolves.toEqual([
      {
        aggregateType: "official_announcement",
        aggregateKey: input.publicId,
        aggregateTargetId: 12,
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
        deletedAt: null,
        announcement: { deletedAt: null }
      },
      orderBy: [{ publishAt: "asc" }, { id: "asc" }],
      take: 25,
      select: {
        id: true,
        publishAt: true,
        announcement: { select: { id: true, publicId: true } }
      }
    });
  });

  it("locks the exact due release with parameterized SQL and atomically switches its slot", async () => {
    const publishAt = new Date("2026-08-29T02:00:00.000Z");
    const queryRaw = jest.fn(async () => [{ id: 71 }]);
    const transaction = {
      $queryRaw: queryRaw,
      contentPublicationCommand: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async () => ({}))
      },
      officialAnnouncementRelease: {
        findFirst: jest.fn(async () => ({
          id: 71,
          announcementId: 12,
          status: "SCHEDULED",
          scheduledSlotKey: "announcement:12:scheduled",
          publishAt,
          activationAttempts: 0,
          deletedAt: null,
          announcement: { id: 12, publicId: input.publicId, deletedAt: null }
        })),
        updateMany: jest.fn(async () => ({ count: 1 }))
      }
    };
    const repository = new OfficialAnnouncementRepository({
      $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
        operation(transaction)
      )
    } as never);
    const commandKey = `content-publication:official_announcement:${input.publicId}:release:71:activate`;

    await expect(
      repository.activateDueScheduledRelease({
        release: {
          aggregateType: "official_announcement",
          aggregateKey: input.publicId,
          aggregateTargetId: 12,
          releaseId: 71,
          publishAt
        },
        now,
        maxAttempts: 3,
        sequence: 0,
        commandKey,
        requestFingerprint: "f".repeat(64)
      })
    ).resolves.toEqual({ activated: true, replayed: false });

    const lockedQuery = (queryRaw.mock.calls as unknown[][])[0]?.[0] as {
      strings?: readonly string[];
      values?: unknown[];
    };
    expect(sqlText(lockedQuery)).toContain(
      "SELECT id FROM official_announcement_releases WHERE id ="
    );
    expect(sqlText(lockedQuery)).toContain("FOR UPDATE");
    expect(lockedQuery.values).toEqual([71]);
    expect(transaction.officialAnnouncementRelease.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { announcementId: 12, publishedSlotKey: { not: null }, deletedAt: null },
        data: expect.objectContaining({ status: "ARCHIVED", publishedSlotKey: null })
      })
    );
    expect(transaction.officialAnnouncementRelease.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: 71,
          status: "SCHEDULED",
          scheduledSlotKey: "announcement:12:scheduled",
          activationAttempts: { lt: 3 }
        }),
        data: expect.objectContaining({
          status: "PUBLISHED",
          scheduledSlotKey: null,
          publishedSlotKey: "announcement:12:published",
          activatedAt: now,
          lastActivationAttemptAt: now,
          lockVersion: { increment: 1 }
        })
      })
    );
    expect(transaction.contentPublicationCommand.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idempotencyKey: commandKey,
        aggregateType: "OFFICIAL_ANNOUNCEMENT",
        aggregateKey: input.publicId,
        releaseId: 71,
        action: "activate",
        actorUserId: null
      })
    });
  });

  it("replays a concurrent activation command after taking the release lock", async () => {
    const events: string[] = [];
    const transaction = {
      $queryRaw: jest.fn(async () => {
        events.push("lock");
        return [{ id: 71 }];
      }),
      contentPublicationCommand: {
        findUnique: jest.fn(async () => {
          events.push("replay");
          return { requestFingerprint: "f".repeat(64), result: { activated: true } };
        })
      },
      officialAnnouncementRelease: { updateMany: jest.fn() }
    };
    const repository = new OfficialAnnouncementRepository({
      $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
        operation(transaction)
      )
    } as never);

    await expect(
      repository.activateDueScheduledRelease({
        release: {
          aggregateType: "official_announcement",
          aggregateKey: input.publicId,
          aggregateTargetId: 12,
          releaseId: 71,
          publishAt: now
        },
        now,
        maxAttempts: 3,
        sequence: 0,
        commandKey: `content-publication:official_announcement:${input.publicId}:release:71:activate`,
        requestFingerprint: "f".repeat(64)
      })
    ).resolves.toEqual({ activated: true, replayed: true });
    expect(events).toEqual(["lock", "replay"]);
    expect(transaction.officialAnnouncementRelease.updateMany).not.toHaveBeenCalled();
  });

  it("atomically disables a final-attempt failure and writes its audit in the same transaction", async () => {
    const publishAt = new Date("2026-08-29T02:00:00.000Z");
    const transaction = {
      $queryRaw: jest.fn(async () => [{ id: 71 }]),
      officialAnnouncementRelease: {
        findFirst: jest.fn(async () => ({
          id: 71,
          announcementId: 12,
          status: "SCHEDULED",
          scheduledSlotKey: "announcement:12:scheduled",
          publishAt,
          activationAttempts: 2,
          deletedAt: null,
          announcement: { id: 12, publicId: input.publicId, deletedAt: null }
        })),
        updateMany: jest.fn(async () => ({ count: 1 }))
      }
    };
    const audit = {
      actorId: null,
      action: "content_publication.schedule_failed",
      targetType: "OfficialAnnouncementRelease",
      targetId: 71,
      metadata: { releaseId: 71 }
    };
    const auditLogRepository = {
      create: jest.fn(async () => undefined),
      createInTransaction: jest.fn(async () => undefined)
    };
    const repository = new OfficialAnnouncementRepository({
      $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
        operation(transaction)
      )
    } as never);

    await expect(
      repository.recordDueScheduledReleaseFailure({
        release: {
          aggregateType: "official_announcement",
          aggregateKey: input.publicId,
          aggregateTargetId: 12,
          releaseId: 71,
          publishAt
        },
        now,
        maxAttempts: 3,
        errorKey: "error.content.schedule_activation_failed",
        runId: "run-final",
        audit,
        auditLogRepository
      })
    ).resolves.toEqual({ recorded: true, activationAttempts: 3, disabled: true });
    expect(transaction.officialAnnouncementRelease.updateMany).toHaveBeenCalledWith({
      where: {
        id: 71,
        status: "SCHEDULED",
        scheduledSlotKey: "announcement:12:scheduled",
        activationAttempts: 2,
        deletedAt: null
      },
      data: {
        status: "DISABLED",
        scheduledSlotKey: null,
        disabledAt: now,
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

  it("checks replay before volatile publication policy validation", async () => {
    const validateAffiliateTask = jest.fn(async () => undefined);
    const transaction = {
      contentPublicationCommand: {
        findUnique: jest.fn(async () => ({
          requestFingerprint: input.requestFingerprint,
          result: cachedResult
        }))
      }
    };
    const client = {
      $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
        operation(transaction)
      )
    };
    const repository = new OfficialAnnouncementRepository(client as never);
    const publicationInput: PublishAnnouncementMutation = {
      publicId: input.publicId,
      releaseId: 71,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      expectedLockVersion: 1,
      actorUserId: input.actorUserId,
      context: input.context,
      now,
      validateAffiliateTask
    };

    await expect(repository.publish(publicationInput)).resolves.toMatchObject({ releaseId: 71 });
    expect(validateAffiliateTask).not.toHaveBeenCalled();
  });

  it("rejects immediate publication after the release visibility window expires", async () => {
    const transaction = {
      contentPublicationCommand: { findUnique: jest.fn(async () => null) },
      officialAnnouncementRelease: {
        findFirst: jest.fn(async () =>
          draftRelease({ visibleFrom: null, visibleUntil: new Date("2026-08-29T02:59:59.000Z") })
        ),
        updateMany: jest.fn()
      }
    };
    const client = {
      $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
        operation(transaction)
      ),
      contentPublicationCommand: { findUnique: jest.fn(async () => null) }
    };
    const repository = new OfficialAnnouncementRepository(client as never);

    await expect(
      repository.publish({
        publicId: input.publicId,
        releaseId: 71,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
        expectedLockVersion: 1,
        actorUserId: input.actorUserId,
        context: input.context,
        now
      })
    ).rejects.toMatchObject({ message: "error.content.schedule_conflict", statusCode: 409 });
    expect(transaction.officialAnnouncementRelease.updateMany).not.toHaveBeenCalled();
  });

  it("requires a scheduled activation to fall inside the release visibility window", async () => {
    const transaction = {
      contentPublicationCommand: { findUnique: jest.fn(async () => null) },
      officialAnnouncementRelease: {
        findFirst: jest.fn(async () =>
          draftRelease({
            visibleFrom: new Date("2026-08-30T04:00:00.000Z"),
            visibleUntil: new Date("2026-09-01T00:00:00.000Z")
          })
        ),
        updateMany: jest.fn()
      }
    };
    const client = {
      $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
        operation(transaction)
      ),
      contentPublicationCommand: { findUnique: jest.fn(async () => null) }
    };
    const repository = new OfficialAnnouncementRepository(client as never);

    await expect(
      repository.schedule({
        publicId: input.publicId,
        releaseId: 71,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
        expectedLockVersion: 1,
        publishAt: new Date("2026-08-30T03:00:00.000Z"),
        actorUserId: input.actorUserId,
        context: input.context,
        now
      })
    ).rejects.toMatchObject({ message: "error.content.schedule_conflict", statusCode: 409 });
    expect(transaction.officialAnnouncementRelease.updateMany).not.toHaveBeenCalled();
  });

  it("updates draft metadata with optimistic locking and audit in one transaction", async () => {
    const visibleFrom = new Date("2026-09-01T01:00:00.000Z");
    const visibleUntil = new Date("2026-09-30T01:00:00.000Z");
    const release = {
      id: 71,
      announcementId: 12,
      version: 1,
      status: "DRAFT",
      lockVersion: 1,
      publishAt: null,
      visibleFrom: null,
      visibleUntil: null,
      activatedAt: null,
      disabledAt: null,
      archivedAt: null,
      sourceReleaseId: null,
      createdAt: now,
      updatedAt: now,
      announcement: {
        id: 12,
        publicId: input.publicId,
        announcementType: "affiliate_notice",
        visibilityScope: "all_affiliates",
        affiliateTaskId: null
      },
      translations: ["ZH_CN", "ZH_TW", "EN", "JA", "KO"].map((locale) => ({
        locale,
        title: `${locale} title`,
        summary: null,
        body: `${locale} body`,
        sourceLocale: locale,
        isInitialCopy: false
      }))
    };
    const transaction = {
      officialAnnouncement: { update: jest.fn(async () => ({})) },
      officialAnnouncementRelease: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(release)
          .mockResolvedValueOnce({
            ...release,
            lockVersion: 2,
            visibleFrom,
            visibleUntil,
            announcement: { ...release.announcement, affiliateTaskId: 29 }
          }),
        updateMany: jest.fn(async () => ({ count: 1 }))
      },
      auditLog: { create: jest.fn(async () => ({})) }
    };
    const repository = new OfficialAnnouncementRepository({
      $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
        operation(transaction)
      )
    } as never);

    await expect(
      repository.updateMetadata({
        publicId: input.publicId,
        releaseId: 71,
        expectedLockVersion: 1,
        affiliateTaskId: 29,
        visibleFrom,
        visibleUntil,
        actorUserId: input.actorUserId,
        context: input.context,
        now,
        validateAffiliateTask: jest.fn(async () => undefined)
      })
    ).resolves.toMatchObject({
      affiliateTaskId: 29,
      visibleFrom,
      visibleUntil,
      lockVersion: 2
    });
    expect(transaction.officialAnnouncement.update).toHaveBeenCalledWith({
      where: { id: 12 },
      data: { affiliateTaskId: 29, updatedAt: now }
    });
    expect(transaction.officialAnnouncementRelease.updateMany).toHaveBeenCalledWith({
      where: { id: 71, status: "DRAFT", lockVersion: 1 },
      data: {
        visibleFrom,
        visibleUntil,
        lockVersion: { increment: 1 },
        updatedById: input.actorUserId,
        updatedAt: now
      }
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "content.affiliate_announcement.metadata_updated",
        targetType: "OfficialAnnouncement",
        targetId: 12,
        actorId: input.actorUserId,
        metadata: expect.objectContaining({ affiliateTaskId: 29 })
      })
    });
  });

  it("reads only the actual current PUBLISHED slot for public projection", async () => {
    const findFirst = jest.fn(async (query: unknown) => {
      expect(query).toBeDefined();
      return null;
    });
    const repository = new OfficialAnnouncementRepository({
      officialAnnouncementRelease: { findFirst }
    } as never);

    await expect(repository.findPublished(input.publicId, "ja", now)).resolves.toBeNull();

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PUBLISHED",
          publishedSlotKey: { not: null },
          AND: [
            { OR: [{ visibleFrom: null }, { visibleFrom: { lte: now } }] },
            { OR: [{ visibleUntil: null }, { visibleUntil: { gt: now } }] }
          ]
        })
      })
    );
    expect(JSON.stringify(findFirst.mock.calls[0]?.[0])).not.toContain("SCHEDULED");
  });
});
