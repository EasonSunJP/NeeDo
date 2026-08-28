import { createHash, randomInt, randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import type { PrismaClient } from "@prisma/client";
import type { CarouselPublicationRepository } from "../src/repositories/carousel-publication.repository";
import type {
  CarouselPublicationPayload,
  CreateCarouselDraftMutation
} from "../src/services/carousel-publication.service";

const enabled = process.env.RUN_CAROUSEL_PUBLICATION_INTEGRATION === "true";
const describeIntegration = enabled ? describe : describe.skip;
const marker = `carousel-it-${randomUUID()}`;
const context = { ip: "127.0.0.1", userAgent: marker };
let actorUserId = 0;
let shopId = 0;
let mediaAssetId = 0;
const extraMediaAssetIds: number[] = [];
let prisma: PrismaClient;
let repository: CarouselPublicationRepository;
let disconnectPrisma: () => Promise<void>;

const fingerprint = (value: string): string =>
  createHash("sha256").update(`${marker}:${value}`).digest("hex");

const assertSafeDatabase = (value: string | undefined): void => {
  if (!value) throw new Error("Carousel integration requires ENV_FILE DATABASE_URL");
  const url = new URL(value);
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (
    url.protocol !== "mysql:" ||
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) ||
    !["needo_dev", "needo_test"].includes(database)
  ) {
    throw new Error("Carousel integration requires a local NeeDo test database");
  }
};

const actor = () => ({
  userId: actorUserId,
  email: `${marker}@needo.local`,
  accessTokenJti: marker,
  accessTokenExpiresAt: 1_900_000_000,
  roles: ["operator"],
  permissions: []
});

const createDraft = async (label: string): Promise<CarouselPublicationPayload> => {
  const translation = (locale: "zh-CN" | "zh-TW" | "en" | "ja" | "ko") => ({
    badge: null,
    title: `${label}-${locale}`,
    caption: null,
    ctaLabel: null,
    imageAltText: `${label}-${locale}-image`,
    sourceLocale: "ja" as const,
    isInitialCopy: locale !== "ja"
  });
  const input: CreateCarouselDraftMutation = {
    scene: "USER_HOME",
    idempotencyKey: randomUUID(),
    requestFingerprint: fingerprint(`create:${label}`),
    sourceLocale: "ja",
    slides: [
      {
        publicId: randomUUID(),
        mediaAssetPublicId: fingerprint("media"),
        sortOrder: 0,
        isEnabled: true,
        visibleFrom: null,
        visibleUntil: null,
        target: { type: "shop", shopId },
        translations: {
          "zh-CN": translation("zh-CN"),
          "zh-TW": translation("zh-TW"),
          en: translation("en"),
          ja: translation("ja"),
          ko: translation("ko")
        }
      }
    ],
    actorUserId,
    actor: actor(),
    context,
    validateAffiliateTask: async () => undefined,
    now: new Date()
  };
  return repository.createDraft(input);
};

const publishInput = (draft: CarouselPublicationPayload, suffix: string) => ({
  scene: "USER_HOME" as const,
  releaseId: draft.releaseId,
  idempotencyKey: randomUUID(),
  requestFingerprint: fingerprint(`publish:${suffix}`),
  expectedLockVersion: draft.lockVersion,
  reason: suffix,
  validateAffiliateTask: async () => undefined,
  actorUserId,
  actor: actor(),
  context,
  now: new Date()
});

describeIntegration("CarouselPublicationRepository MySQL transactions", () => {
  beforeAll(async () => {
    const envFile = process.env.ENV_FILE?.trim();
    if (!envFile) throw new Error("Carousel integration requires ENV_FILE");
    const loaded = loadDotenv({ path: envFile, override: true });
    if (loaded.error) throw new Error("Unable to load carousel integration ENV_FILE");
    assertSafeDatabase(loaded.parsed?.DATABASE_URL);
    process.env.NODE_ENV = "development";
    process.env.DEPLOY_ENV = "local";
    const [repositoryModule, prismaModule] = await Promise.all([
      import("../src/repositories/carousel-publication.repository"),
      import("../src/prisma/client")
    ]);
    prisma = prismaModule.prisma;
    disconnectPrisma = prismaModule.disconnectPrisma;
    repository = new repositoryModule.CarouselPublicationRepository(prisma);
    const numberPart = String(randomInt(1_000_000_000, 10_000_000_000));
    const user = await prisma.user.create({
      data: { needoId: `u${numberPart}`, email: `${marker}@needo.local`, username: marker }
    });
    actorUserId = user.id;
    const shop = await prisma.shop.create({
      data: { name: marker, city: "Tokyo", address: marker, status: "published" }
    });
    shopId = shop.id;
    await prisma.publicIdentifier.create({
      data: { publicId: `shop${numberPart}`, numberPart, kind: "SHOP", shopId, status: "ACTIVE" }
    });
    const media = await prisma.mediaAsset.create({
      data: {
        entityType: "content_publication_upload",
        entityId: actorUserId,
        ownerUserId: actorUserId,
        url: `/media/content/${fingerprint("media")}.png`,
        mimeType: "image/png",
        usageType: "content_publication",
        isActive: true,
        checksumSha256: fingerprint("media")
      }
    });
    mediaAssetId = media.id;
  }, 30_000);

  afterAll(async () => {
    if (prisma && actorUserId) {
      const releases = await prisma.carouselRelease.findMany({
        where: { createdById: actorUserId },
        select: { id: true }
      });
      const releaseIds = releases.map((release) => release.id);
      const slides = await prisma.carouselSlide.findMany({
        where: { releaseId: { in: releaseIds } },
        select: { id: true }
      });
      await prisma.contentPublicationCommand.deleteMany({ where: { actorUserId } });
      await prisma.auditLog.deleteMany({
        where: { actorId: actorUserId, targetType: "CarouselRelease" }
      });
      await prisma.carouselSlideTranslation.deleteMany({
        where: { slideId: { in: slides.map((slide) => slide.id) } }
      });
      await prisma.carouselSlide.deleteMany({ where: { releaseId: { in: releaseIds } } });
      await prisma.carouselRelease.deleteMany({
        where: { id: { in: releaseIds }, sourceReleaseId: { not: null } }
      });
      await prisma.carouselRelease.deleteMany({ where: { id: { in: releaseIds } } });
      await prisma.mediaAsset.deleteMany({ where: { id: mediaAssetId } });
      await prisma.mediaAsset.deleteMany({ where: { id: { in: extraMediaAssetIds } } });
      await prisma.publicIdentifier.deleteMany({ where: { shopId } });
      await prisma.shop.deleteMany({ where: { id: shopId } });
      await prisma.user.deleteMany({ where: { id: actorUserId } });
    }
    await disconnectPrisma?.();
  }, 30_000);

  it("atomically replaces a draft media reference and preserves five translation provenance rows", async () => {
    const draft = await createDraft("replace");
    const checksum = fingerprint("replacement-media");
    const media = await prisma.mediaAsset.create({
      data: {
        entityType: "content_publication_upload",
        entityId: actorUserId,
        ownerUserId: actorUserId,
        url: `/media/content/${checksum}.png`,
        mimeType: "image/png",
        usageType: "content_publication",
        isActive: true,
        checksumSha256: checksum
      }
    });
    extraMediaAssetIds.push(media.id);
    const replaced = await repository.replaceDraft({
      scene: "USER_HOME",
      releaseId: draft.releaseId,
      expectedLockVersion: draft.lockVersion,
      sourceLocale: "ja",
      slides: [
        {
          publicId: draft.slides[0].id,
          mediaAssetPublicId: checksum,
          sortOrder: 0,
          isEnabled: true,
          visibleFrom: null,
          visibleUntil: null,
          target: draft.slides[0].target,
          translations: draft.slides[0].translations
        }
      ],
      actorUserId,
      actor: actor(),
      context,
      validateAffiliateTask: async () => undefined,
      now: new Date()
    });
    expect(replaced).toMatchObject({ lockVersion: draft.lockVersion + 1 });
    expect(replaced.slides[0].mediaAssetPublicId).toBe(checksum);
    expect(Object.keys(replaced.slides[0].translations)).toHaveLength(5);
    const published = await repository.publish(publishInput(replaced, "replace-cleanup"));
    await repository.disable({
      ...publishInput(published, "replace-disable"),
      expectedLockVersion: published.lockVersion,
      reason: "cleanup"
    });
  }, 30_000);

  it("replays simultaneous identical publication and commits one command and audit", async () => {
    const draft = await createDraft("identical");
    const command = publishInput(draft, "identical");
    const [left, right] = await Promise.all([
      repository.publish(command),
      repository.publish(command)
    ]);
    expect(left).toEqual(right);
    expect(left.status).toBe("published");
    await expect(
      prisma.contentPublicationCommand.count({
        where: {
          aggregateKey: "carousel:USER_HOME",
          action: "publish",
          releaseId: draft.releaseId,
          actorUserId
        }
      })
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: {
          action: "content.carousel.publish",
          targetId: draft.releaseId,
          actorId: actorUserId
        }
      })
    ).resolves.toBe(1);
    await repository.disable({
      ...publishInput(left, "cleanup-identical"),
      expectedLockVersion: left.lockVersion,
      reason: "next scenario"
    });
  }, 30_000);

  it("keeps exactly one scheduled slot for the fixed scene", async () => {
    const first = await createDraft("scheduled-first");
    const scheduled = await repository.schedule({
      ...publishInput(first, "scheduled-first"),
      publishAt: new Date(Date.now() + 86_400_000)
    });
    const second = await createDraft("scheduled-second");
    await expect(
      repository.schedule({
        ...publishInput(second, "scheduled-second"),
        publishAt: new Date(Date.now() + 172_800_000)
      })
    ).rejects.toMatchObject({ message: "error.content.schedule_conflict" });
    await expect(
      prisma.carouselRelease.count({
        where: { scene: "USER_HOME", scheduledSlotKey: { not: null }, deletedAt: null }
      })
    ).resolves.toBe(1);
    const published = await repository.publish(publishInput(second, "scheduled-second-cleanup"));
    await repository.disable({
      ...publishInput(published, "scheduled-published-cleanup"),
      expectedLockVersion: published.lockVersion,
      reason: "cleanup"
    });
    await repository.disable({
      ...publishInput(scheduled, "scheduled-cleanup"),
      expectedLockVersion: scheduled.lockVersion,
      reason: "cleanup"
    });
  }, 30_000);

  it("allows one competing publisher, preserves one slot, and keeps the published release immutable", async () => {
    const draft = await createDraft("competing");
    const [left, right] = await Promise.allSettled([
      repository.publish(publishInput(draft, "left")),
      repository.publish(publishInput(draft, "right"))
    ]);
    expect([left.status, right.status].sort()).toEqual(["fulfilled", "rejected"]);
    const winner =
      left.status === "fulfilled"
        ? left.value
        : (right as PromiseFulfilledResult<CarouselPublicationPayload>).value;
    await expect(
      prisma.carouselRelease.count({
        where: { scene: "USER_HOME", publishedSlotKey: { not: null }, deletedAt: null }
      })
    ).resolves.toBe(1);
    const before = await prisma.carouselSlideTranslation.findFirstOrThrow({
      where: { slide: { releaseId: winner.releaseId }, locale: "JA" }
    });
    await expect(
      repository.updateLocale({
        scene: "USER_HOME",
        releaseId: winner.releaseId,
        slidePublicId: winner.slides[0].id,
        expectedLockVersion: winner.lockVersion,
        locale: "ja",
        copyToAll: false,
        translation: {
          badge: null,
          title: "must not persist",
          caption: null,
          ctaLabel: null,
          imageAltText: "must not persist"
        },
        actorUserId,
        actor: actor(),
        context,
        now: new Date()
      })
    ).rejects.toMatchObject({ message: "error.content.invalid_state_transition" });
    const after = await prisma.carouselSlideTranslation.findUniqueOrThrow({
      where: { slideId_locale: { slideId: before.slideId, locale: "JA" } }
    });
    expect(after.title).toBe(before.title);
  }, 30_000);

  it("clones rollback lineage into the next version without mutating the current published source", async () => {
    const current = (await repository.getScene("USER_HOME")).published;
    expect(current).not.toBeNull();
    const source = current as CarouselPublicationPayload;
    const clone = await repository.cloneForRollback({
      scene: "USER_HOME",
      releaseId: source.releaseId,
      sourceReleaseId: source.releaseId,
      expectedCurrentVersion: source.version,
      idempotencyKey: randomUUID(),
      requestFingerprint: fingerprint("rollback"),
      reason: "Restore editable copy",
      validateAffiliateTask: async () => undefined,
      actorUserId,
      actor: actor(),
      context,
      now: new Date()
    });
    expect(clone).toMatchObject({
      version: source.version + 1,
      status: "draft",
      sourceReleaseId: source.releaseId
    });
    await expect(
      prisma.carouselRelease.findUniqueOrThrow({ where: { id: source.releaseId } })
    ).resolves.toMatchObject({ status: "PUBLISHED", publishedSlotKey: expect.any(String) });
  }, 30_000);
});
