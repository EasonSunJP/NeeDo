import { createHash, randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import type { PrismaClient } from "@prisma/client";
import type { OfficialAnnouncementRepository } from "../src/repositories/official-announcement.repository";
import type {
  CreateAnnouncementDraftMutation,
  OfficialAnnouncementPayload
} from "../src/services/official-announcement.service";

const enabled = process.env.RUN_OFFICIAL_ANNOUNCEMENT_INTEGRATION === "true";
const describeIntegration = enabled ? describe : describe.skip;
const marker = `announcement-it-${randomUUID()}`;
const publicIds: string[] = [];
let actorUserId = 0;
let prisma: PrismaClient;
let repository: OfficialAnnouncementRepository;
let disconnectPrisma: () => Promise<void>;

const fingerprint = (value: string): string =>
  createHash("sha256").update(`${marker}:${value}`).digest("hex");

const assertSafeDatabase = (value: string | undefined): void => {
  if (!value) throw new Error("Official announcement integration requires ENV_FILE DATABASE_URL");
  const url = new URL(value);
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (
    url.protocol !== "mysql:" ||
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) ||
    !["needo_dev", "needo_test"].includes(database)
  ) {
    throw new Error("Official announcement integration requires a local NeeDo test database");
  }
};

const createDraft = async (label: string): Promise<OfficialAnnouncementPayload> => {
  const publicId = randomUUID();
  publicIds.push(publicId);
  const now = new Date("2026-08-29T04:00:00.000Z");
  const translations = {
    "zh-CN": {
      title: `${label} 通知`,
      summary: null,
      body: "正文",
      sourceLocale: "ja",
      isInitialCopy: true
    },
    "zh-TW": {
      title: `${label} 通知`,
      summary: null,
      body: "正文",
      sourceLocale: "ja",
      isInitialCopy: true
    },
    en: {
      title: `${label} notice`,
      summary: null,
      body: "Body",
      sourceLocale: "ja",
      isInitialCopy: true
    },
    ja: {
      title: `${label} お知らせ`,
      summary: null,
      body: "本文",
      sourceLocale: "ja",
      isInitialCopy: false
    },
    ko: {
      title: `${label} 공지`,
      summary: null,
      body: "본문",
      sourceLocale: "ja",
      isInitialCopy: true
    }
  } as const;
  const input: CreateAnnouncementDraftMutation = {
    publicId,
    idempotencyKey: randomUUID(),
    requestFingerprint: fingerprint(`create:${label}`),
    sourceLocale: "ja",
    affiliateTaskId: null,
    visibleFrom: new Date("2026-08-29T00:00:00.000Z"),
    visibleUntil: new Date("2026-09-30T00:00:00.000Z"),
    translations,
    actorUserId,
    context: { ip: "127.0.0.1", userAgent: marker },
    now
  };
  return repository.createDraft(input);
};

const publishInput = (draft: OfficialAnnouncementPayload, suffix: string) => ({
  publicId: draft.publicId,
  releaseId: draft.releaseId,
  idempotencyKey: randomUUID(),
  requestFingerprint: fingerprint(`publish:${suffix}`),
  expectedLockVersion: draft.lockVersion,
  reason: suffix,
  actorUserId,
  context: { ip: "127.0.0.1", userAgent: marker },
  now: new Date("2026-08-29T05:00:00.000Z")
});

describeIntegration("OfficialAnnouncementRepository MySQL transactions", () => {
  beforeAll(async () => {
    const envFile = process.env.ENV_FILE?.trim();
    if (!envFile) throw new Error("Official announcement integration requires ENV_FILE");
    const loaded = loadDotenv({ path: envFile, override: true });
    if (loaded.error) throw new Error("Unable to load official announcement integration ENV_FILE");
    assertSafeDatabase(loaded.parsed?.DATABASE_URL);
    process.env.NODE_ENV = "development";
    process.env.DEPLOY_ENV = "local";

    const [repositoryModule, prismaModule] = await Promise.all([
      import("../src/repositories/official-announcement.repository"),
      import("../src/prisma/client")
    ]);
    prisma = prismaModule.prisma;
    disconnectPrisma = prismaModule.disconnectPrisma;
    repository = new repositoryModule.OfficialAnnouncementRepository(prisma);
    const user = await prisma.user.create({
      data: {
        needoId: `it${randomUUID().replaceAll("-", "").slice(0, 20)}`,
        email: `${marker}@needo.local`,
        username: marker
      }
    });
    actorUserId = user.id;
  }, 30_000);

  afterAll(async () => {
    if (prisma && actorUserId) {
      const announcements = await prisma.officialAnnouncement.findMany({
        where: { publicId: { in: publicIds } },
        select: { id: true, releases: { select: { id: true, sourceReleaseId: true } } }
      });
      const announcementIds = announcements.map((item) => item.id);
      const releaseIds = announcements.flatMap((item) =>
        item.releases.map((release) => release.id)
      );
      await prisma.contentPublicationCommand.deleteMany({ where: { actorUserId } });
      await prisma.auditLog.deleteMany({
        where: { actorId: actorUserId, targetType: "OfficialAnnouncement" }
      });
      await prisma.officialAnnouncementTranslation.deleteMany({
        where: { releaseId: { in: releaseIds } }
      });
      await prisma.officialAnnouncementRelease.deleteMany({
        where: { id: { in: releaseIds }, sourceReleaseId: { not: null } }
      });
      await prisma.officialAnnouncementRelease.deleteMany({ where: { id: { in: releaseIds } } });
      await prisma.officialAnnouncement.deleteMany({ where: { id: { in: announcementIds } } });
      await prisma.user.deleteMany({ where: { id: actorUserId } });
    }
    await disconnectPrisma?.();
  }, 30_000);

  it("replays two simultaneous identical publication commands and commits one audit-command pair", async () => {
    const draft = await createDraft("identical");
    const command = publishInput(draft, "identical");

    const [left, right] = await Promise.all([
      repository.publish(command),
      repository.publish(command)
    ]);

    expect(left).toEqual(right);
    expect(left).toMatchObject({ status: "published", lockVersion: 2 });
    const announcement = await prisma.officialAnnouncement.findUniqueOrThrow({
      where: { publicId: draft.publicId },
      select: { id: true }
    });
    await expect(
      prisma.auditLog.count({
        where: {
          actorId: actorUserId,
          action: "content.affiliate_announcement.publish",
          targetId: announcement.id
        }
      })
    ).resolves.toBe(1);
    await expect(
      prisma.contentPublicationCommand.count({
        where: { aggregateKey: `announcement:${draft.publicId}`, action: "publish" }
      })
    ).resolves.toBe(1);
  }, 30_000);

  it("allows one of two distinct publishers, preserves the current slot, and keeps published translations immutable", async () => {
    const draft = await createDraft("competing");
    const [left, right] = await Promise.allSettled([
      repository.publish(publishInput(draft, "left")),
      repository.publish(publishInput(draft, "right"))
    ]);

    expect([left.status, right.status].sort()).toEqual(["fulfilled", "rejected"]);
    const winner =
      left.status === "fulfilled"
        ? left.value
        : (right as PromiseFulfilledResult<OfficialAnnouncementPayload>).value;
    const loser =
      left.status === "rejected" ? left.reason : (right as PromiseRejectedResult).reason;
    expect(loser).toMatchObject({ statusCode: 409 });
    const current = await prisma.officialAnnouncementRelease.findMany({
      where: {
        announcement: { publicId: draft.publicId },
        publishedSlotKey: { not: null },
        deletedAt: null
      }
    });
    expect(current).toHaveLength(1);
    expect(current[0]).toMatchObject({ id: winner.releaseId, status: "PUBLISHED" });

    const before = await prisma.officialAnnouncementTranslation.findFirstOrThrow({
      where: { releaseId: winner.releaseId, locale: "JA" }
    });
    await expect(
      repository.updateLocale({
        publicId: winner.publicId,
        releaseId: winner.releaseId,
        expectedLockVersion: winner.lockVersion,
        locale: "ja",
        copyToAll: false,
        translation: { title: "must not persist", summary: null, body: "must not persist" },
        actorUserId,
        context: { ip: "127.0.0.1", userAgent: marker },
        now: new Date("2026-08-29T05:01:00.000Z")
      })
    ).rejects.toMatchObject({ message: "error.content.invalid_state_transition" });
    const after = await prisma.officialAnnouncementTranslation.findUniqueOrThrow({
      where: { releaseId_locale: { releaseId: winner.releaseId, locale: "JA" } }
    });
    expect(after.title).toBe(before.title);
    expect(after.body).toBe(before.body);
  }, 30_000);

  it("clones rollback lineage into the next version without changing the published source", async () => {
    const draft = await createDraft("rollback");
    const source = await repository.publish(publishInput(draft, "source"));

    const clone = await repository.cloneForRollback({
      publicId: source.publicId,
      releaseId: source.releaseId,
      sourceReleaseId: source.releaseId,
      expectedCurrentVersion: source.version,
      idempotencyKey: randomUUID(),
      requestFingerprint: fingerprint("rollback"),
      reason: "Restore editable copy",
      actorUserId,
      context: { ip: "127.0.0.1", userAgent: marker },
      now: new Date("2026-08-29T06:00:00.000Z")
    });

    expect(clone).toMatchObject({
      version: source.version + 1,
      status: "draft",
      lockVersion: 1,
      sourceReleaseId: source.releaseId
    });
    await expect(
      prisma.officialAnnouncementRelease.findUniqueOrThrow({ where: { id: source.releaseId } })
    ).resolves.toMatchObject({ status: "PUBLISHED", publishedSlotKey: expect.any(String) });
  }, 30_000);
});
