import { OfficialAnnouncementRepository } from "../src/repositories/official-announcement.repository";
import type { CreateAnnouncementDraftMutation } from "../src/services/official-announcement.service";

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

describe("OfficialAnnouncementRepository", () => {
  it("exposes the complete announcement transaction boundary", () => {
    const repository = new OfficialAnnouncementRepository({} as never);

    expect(repository).toEqual(
      expect.objectContaining({
        createDraft: expect.any(Function),
        list: expect.any(Function),
        findDraft: expect.any(Function),
        updateLocale: expect.any(Function),
        publish: expect.any(Function),
        schedule: expect.any(Function),
        disable: expect.any(Function),
        cloneForRollback: expect.any(Function),
        listHistory: expect.any(Function),
        findPublished: expect.any(Function)
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
});
