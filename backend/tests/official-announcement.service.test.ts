import { ERROR_CODES } from "../src/constants/error-codes";
import { AppError } from "../src/utils/app-error";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import {
  OfficialAnnouncementService,
  type OfficialAnnouncementPayload,
  type OfficialAnnouncementRepositoryPort,
  type PublishedAnnouncementPayload
} from "../src/services/official-announcement.service";

const actor: AuthenticatedAccessContext = {
  userId: 41,
  email: "operator@example.test",
  accessTokenJti: "announcement-test",
  accessTokenExpiresAt: 1_800_000_000,
  roles: ["operator"],
  permissions: [
    "page:backoffice-affiliate-announcement",
    "button:backoffice-affiliate-announcement-edit",
    "button:backoffice-affiliate-announcement-publish"
  ]
};

const context = { ip: "203.0.113.9", userAgent: "announcement-test-agent" };
const idempotencyKey = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-08-29T03:00:00.000Z");

const translations = {
  "zh-CN": {
    title: "重要通知",
    summary: "概要",
    body: "正文",
    sourceLocale: "ja",
    isInitialCopy: true
  },
  "zh-TW": {
    title: "重要通知",
    summary: "概要",
    body: "正文",
    sourceLocale: "ja",
    isInitialCopy: true
  },
  en: {
    title: "Important notice",
    summary: "Summary",
    body: "Body",
    sourceLocale: "en",
    isInitialCopy: false
  },
  ja: {
    title: "重要なお知らせ",
    summary: "概要",
    body: "本文",
    sourceLocale: "ja",
    isInitialCopy: false
  },
  ko: { title: "중요 공지", summary: "요약", body: "본문", sourceLocale: "ja", isInitialCopy: true }
} as const;

const payload = (
  overrides: Partial<OfficialAnnouncementPayload> = {}
): OfficialAnnouncementPayload => ({
  publicId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  releaseId: 71,
  version: 1,
  status: "draft",
  lockVersion: 1,
  announcementType: "affiliate_notice",
  visibilityScope: "all_affiliates",
  affiliateTaskId: 29,
  publishAt: null,
  visibleFrom: null,
  visibleUntil: null,
  activatedAt: null,
  disabledAt: null,
  archivedAt: null,
  sourceReleaseId: null,
  translations: { ...translations },
  createdAt: now,
  updatedAt: now,
  ...overrides
});

const published = (
  overrides: Partial<PublishedAnnouncementPayload> = {}
): PublishedAnnouncementPayload => ({
  publicId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  releaseId: 71,
  version: 1,
  locale: "ja",
  title: "重要なお知らせ",
  summary: "概要",
  body: "本文",
  visibleFrom: null,
  visibleUntil: null,
  activatedAt: now,
  affiliateTaskId: 29,
  ...overrides
});

const repository = (): jest.Mocked<OfficialAnnouncementRepositoryPort> => ({
  createDraft: jest.fn(),
  list: jest.fn(),
  findDraft: jest.fn(),
  updateLocale: jest.fn(),
  publish: jest.fn(),
  schedule: jest.fn(),
  disable: jest.fn(),
  cloneForRollback: jest.fn(),
  listHistory: jest.fn(),
  findPublished: jest.fn()
});

const marketplace = () => ({
  getTask: jest.fn().mockResolvedValue({
    id: 29,
    taskCode: "AFF-PUBLIC-29",
    name: "Visible affiliate task",
    claimable: true
  })
});

describe("OfficialAnnouncementService", () => {
  it("initializes exactly five translation rows on first save and records the audit context", async () => {
    const repo = repository();
    const tasks = marketplace();
    repo.createDraft.mockImplementation(async (input) => {
      await input.validateAffiliateTask?.();
      return payload({ affiliateTaskId: input.affiliateTaskId, translations: input.translations });
    });
    const service = new OfficialAnnouncementService(repo, tasks, {
      now: () => now,
      createPublicId: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    });

    const draft = await service.createDraft(actor, context, {
      idempotencyKey,
      sourceLocale: "ja",
      affiliateTaskId: 29,
      visibleFrom: null,
      visibleUntil: null,
      translation: { title: "重要なお知らせ", summary: "概要", body: "本文" }
    });

    expect(Object.keys(draft.translations).sort()).toEqual(
      ["en", "ja", "ko", "zh-CN", "zh-TW"].sort()
    );
    expect(tasks.getTask).toHaveBeenCalledWith(actor, 29);
    expect(repo.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        publicId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        actorUserId: 41,
        context,
        translations: {
          "zh-CN": {
            title: "重要なお知らせ",
            summary: "概要",
            body: "本文",
            sourceLocale: "ja",
            isInitialCopy: true
          },
          "zh-TW": expect.objectContaining({ title: "重要なお知らせ", isInitialCopy: true }),
          en: expect.objectContaining({ title: "重要なお知らせ", isInitialCopy: true }),
          ja: expect.objectContaining({ title: "重要なお知らせ", isInitialCopy: false }),
          ko: expect.objectContaining({ title: "重要なお知らせ", isInitialCopy: true })
        },
        requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/)
      })
    );
  });

  it("preserves the one-current-draft conflict", async () => {
    const repo = repository();
    const conflict = new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.content.draft_exists",
      statusCode: 409
    });
    repo.createDraft.mockRejectedValue(conflict);
    const service = new OfficialAnnouncementService(repo, marketplace());

    await expect(
      service.createDraft(actor, context, {
        idempotencyKey,
        sourceLocale: "ja",
        affiliateTaskId: null,
        visibleFrom: null,
        visibleUntil: null,
        translation: { title: "Title", summary: null, body: "Body" }
      })
    ).rejects.toBe(conflict);
  });

  it("lets the repository replay an exact create command before rechecking a changed task policy", async () => {
    const repo = repository();
    repo.createDraft.mockResolvedValue(payload());
    const tasks = marketplace();
    tasks.getTask.mockRejectedValue(
      new AppError({
        code: ERROR_CODES.AFFILIATE_TASK_NOT_FOUND,
        message: "error.affiliate.task_not_found",
        statusCode: 404
      })
    );
    const service = new OfficialAnnouncementService(repo, tasks);

    await expect(
      service.createDraft(actor, context, {
        idempotencyKey,
        sourceLocale: "ja",
        affiliateTaskId: 29,
        visibleFrom: null,
        visibleUntil: null,
        translation: { title: "Title", summary: null, body: "Body" }
      })
    ).resolves.toMatchObject({ publicId: payload().publicId });
    expect(tasks.getTask).not.toHaveBeenCalled();
    expect(repo.createDraft.mock.calls[0]?.[0].validateAffiliateTask).toEqual(expect.any(Function));
  });

  it("updates one locale independently", async () => {
    const repo = repository();
    repo.updateLocale.mockResolvedValue(
      payload({
        lockVersion: 2,
        translations: {
          ...translations,
          en: {
            title: "Changed",
            summary: null,
            body: "Changed",
            sourceLocale: "en",
            isInitialCopy: false
          }
        }
      })
    );
    const service = new OfficialAnnouncementService(repo, marketplace());

    const edited = await service.updateLocale(
      actor,
      context,
      payload().publicId,
      payload().releaseId,
      {
        expectedLockVersion: 1,
        locale: "en",
        title: "Changed",
        summary: null,
        body: "Changed"
      }
    );

    expect(edited.translations.ja.title).toBe("重要なお知らせ");
    expect(edited.translations.en).toMatchObject({ sourceLocale: "en", isInitialCopy: false });
    expect(repo.updateLocale).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "en", copyToAll: false, actorUserId: 41, context })
    );
  });

  it("returns the standard paginated response while accepting pageSize input", async () => {
    const repo = repository();
    repo.list.mockResolvedValue({ list: [payload()], total: 1, page: 2, pageSize: 10 });
    const service = new OfficialAnnouncementService(repo, marketplace());

    const result = await service.list(actor, { page: 2, pageSize: 10 });

    expect(result).toMatchObject({ list: [expect.any(Object)], total: 1, page: 2, page_size: 10 });
    expect(result).not.toHaveProperty("pageSize");
  });

  it("copies an explicitly selected locale to all five rows in one mutation", async () => {
    const repo = repository();
    const copied = Object.fromEntries(
      Object.keys(translations).map((locale) => [
        locale,
        {
          title: "Important notice",
          summary: "Summary",
          body: "Body",
          sourceLocale: "en",
          isInitialCopy: false
        }
      ])
    ) as OfficialAnnouncementPayload["translations"];
    repo.updateLocale.mockResolvedValue(payload({ lockVersion: 3, translations: copied }));
    const service = new OfficialAnnouncementService(repo, marketplace());

    const result = await service.copyLocaleToAll(
      actor,
      context,
      payload().publicId,
      payload().releaseId,
      { expectedLockVersion: 2, locale: "en" }
    );

    expect(new Set(Object.values(result.translations).map((value) => value.title))).toEqual(
      new Set(["Important notice"])
    );
    expect(
      Object.values(result.translations).every(
        (value) => value.sourceLocale === "en" && value.isInitialCopy === false
      )
    ).toBe(true);
    expect(repo.updateLocale).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "en", copyToAll: true, expectedLockVersion: 2 })
    );
  });

  it.each([
    { title: " ", body: "Body" },
    { title: "Title", body: "   " }
  ])("rejects a missing required translation field", async ({ title, body }) => {
    const repo = repository();
    const service = new OfficialAnnouncementService(repo, marketplace());

    await expect(
      service.updateLocale(actor, context, payload().publicId, payload().releaseId, {
        expectedLockVersion: 1,
        locale: "en",
        title,
        summary: null,
        body
      })
    ).rejects.toMatchObject({ message: "error.content.incomplete_translations", statusCode: 409 });
    expect(repo.updateLocale).not.toHaveBeenCalled();
  });

  it("propagates optimistic lock conflicts", async () => {
    const repo = repository();
    repo.updateLocale.mockRejectedValue(
      new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.content.lock_conflict",
        statusCode: 409
      })
    );
    const service = new OfficialAnnouncementService(repo, marketplace());

    await expect(
      service.updateLocale(actor, context, payload().publicId, payload().releaseId, {
        expectedLockVersion: 99,
        locale: "en",
        title: "Title",
        summary: null,
        body: "Body"
      })
    ).rejects.toMatchObject({ message: "error.content.lock_conflict" });
  });

  it("publishes immediately with an idempotency fingerprint and audit input", async () => {
    const repo = repository();
    const tasks = marketplace();
    repo.publish.mockImplementation(async (input) => {
      await input.validateAffiliateTask?.(29);
      return payload({ status: "published", lockVersion: 2, activatedAt: now });
    });
    const service = new OfficialAnnouncementService(repo, tasks, { now: () => now });

    const result = await service.publish(actor, context, payload().publicId, payload().releaseId, {
      idempotencyKey,
      expectedLockVersion: 1,
      reason: "Ready"
    });

    expect(result.status).toBe("published");
    expect(repo.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 41,
        context,
        now,
        reason: "Ready",
        requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/)
      })
    );
    expect(tasks.getTask).toHaveBeenCalledWith(actor, 29);
  });

  it("revalidates the canonical affiliate task before scheduling", async () => {
    const repo = repository();
    const tasks = marketplace();
    repo.schedule.mockImplementation(async (input) => {
      await input.validateAffiliateTask?.(29);
      return payload({ status: "scheduled", publishAt: input.publishAt });
    });
    const service = new OfficialAnnouncementService(repo, tasks, { now: () => now });

    await service.schedule(actor, context, payload().publicId, payload().releaseId, {
      idempotencyKey,
      expectedLockVersion: 1,
      publishAt: "2026-08-30T03:00:00.000Z"
    });

    expect(tasks.getTask).toHaveBeenCalledWith(actor, 29);
    expect(repo.schedule).toHaveBeenCalledWith(
      expect.objectContaining({ validateAffiliateTask: expect.any(Function) })
    );
  });

  it("changes the idempotency fingerprint when the command payload changes", async () => {
    const repo = repository();
    repo.publish.mockResolvedValue(payload({ status: "published" }));
    const service = new OfficialAnnouncementService(repo, marketplace(), { now: () => now });

    await service.publish(actor, context, payload().publicId, payload().releaseId, {
      idempotencyKey,
      expectedLockVersion: 1,
      reason: "First reason"
    });
    await service.publish(actor, context, payload().publicId, payload().releaseId, {
      idempotencyKey,
      expectedLockVersion: 1,
      reason: "Different reason"
    });

    expect(repo.publish.mock.calls[0]?.[0].requestFingerprint).not.toBe(
      repo.publish.mock.calls[1]?.[0].requestFingerprint
    );
  });

  it("binds an idempotency fingerprint to the authenticated actor", async () => {
    const repo = repository();
    repo.publish.mockResolvedValue(payload({ status: "published" }));
    const service = new OfficialAnnouncementService(repo, marketplace(), { now: () => now });
    const otherActor = { ...actor, userId: 42, email: "other-operator@example.test" };
    const command = { idempotencyKey, expectedLockVersion: 1, reason: "Ready" };

    await service.publish(actor, context, payload().publicId, payload().releaseId, command);
    await service.publish(otherActor, context, payload().publicId, payload().releaseId, command);

    expect(repo.publish.mock.calls[0]?.[0].requestFingerprint).not.toBe(
      repo.publish.mock.calls[1]?.[0].requestFingerprint
    );
  });

  it("preserves scheduled slot conflicts", async () => {
    const repo = repository();
    repo.schedule.mockRejectedValue(
      new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.content.schedule_conflict",
        statusCode: 409
      })
    );
    const service = new OfficialAnnouncementService(repo, marketplace(), { now: () => now });

    await expect(
      service.schedule(actor, context, payload().publicId, payload().releaseId, {
        idempotencyKey,
        expectedLockVersion: 1,
        publishAt: "2026-08-30T03:00:00.000Z"
      })
    ).rejects.toMatchObject({ message: "error.content.schedule_conflict" });
  });

  it("disables a release transactionally", async () => {
    const repo = repository();
    repo.disable.mockResolvedValue(
      payload({ status: "disabled", lockVersion: 2, disabledAt: now })
    );
    const service = new OfficialAnnouncementService(repo, marketplace(), { now: () => now });

    const result = await service.disable(actor, context, payload().publicId, payload().releaseId, {
      idempotencyKey,
      expectedLockVersion: 1,
      reason: "Expired"
    });

    expect(result.status).toBe("disabled");
    expect(repo.disable).toHaveBeenCalledWith(expect.objectContaining({ reason: "Expired", now }));
  });

  it("clones an immutable historical release for rollback", async () => {
    const repo = repository();
    repo.cloneForRollback.mockResolvedValue(
      payload({ releaseId: 74, version: 4, sourceReleaseId: 71, lockVersion: 1 })
    );
    const service = new OfficialAnnouncementService(repo, marketplace(), { now: () => now });

    const result = await service.rollback(actor, context, payload().publicId, 71, {
      idempotencyKey,
      expectedCurrentVersion: 3,
      reason: "Restore approved wording"
    });

    expect(result).toMatchObject({
      releaseId: 74,
      version: 4,
      sourceReleaseId: 71,
      status: "draft"
    });
    expect(repo.cloneForRollback).toHaveBeenCalledWith(
      expect.objectContaining({ sourceReleaseId: 71, expectedCurrentVersion: 3 })
    );
  });

  it("redacts a linked task when the existing marketplace policy says it is inaccessible", async () => {
    const repo = repository();
    repo.findPublished.mockResolvedValue(published());
    const tasks = marketplace();
    tasks.getTask.mockRejectedValue(
      new AppError({
        code: ERROR_CODES.AFFILIATE_TASK_NOT_FOUND,
        message: "error.affiliate.task_not_found",
        statusCode: 404
      })
    );
    const service = new OfficialAnnouncementService(repo, tasks, { now: () => now });

    const result = await service.getPublishedForAffiliate(actor, payload().publicId, "ja");

    expect(result.taskAction).toBeNull();
    expect(result).not.toHaveProperty("affiliateTaskId");
    expect(result).not.toHaveProperty("releaseId");
    expect(JSON.stringify(result)).not.toContain('"id"');
  });

  it("projects only the requested locale and a redacted visible task action", async () => {
    const repo = repository();
    repo.findPublished.mockResolvedValue(published({ locale: "en", title: "Important notice" }));
    const service = new OfficialAnnouncementService(repo, marketplace(), { now: () => now });

    const result = await service.getPublishedForAffiliate(actor, payload().publicId, "en");

    expect(result).toMatchObject({
      publicId: payload().publicId,
      locale: "en",
      title: "Important notice",
      taskAction: { taskCode: "AFF-PUBLIC-29", label: "Visible affiliate task", claimable: true }
    });
    expect(result).not.toHaveProperty("translations");
    expect(result).not.toHaveProperty("releaseId");
    expect(result.taskAction).not.toHaveProperty("id");
  });
});
