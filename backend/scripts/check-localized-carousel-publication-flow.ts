import { hash } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const LOCAL_DATABASES = new Set(["needo_dev", "needo_test"]);
const CONTENT_LOCALES = ["zh-CN", "zh-TW", "en", "ja", "ko"] as const;
const USER_SCENE = "USER_HOME" as const;
const AFFILIATE_SCENE = "AFFILIATE_HOME_NOTICE" as const;
const TASK_BUDGET_NDP = 20_000;
const TASK_REWARD_NDP = 1_000;

const assert: (condition: unknown, message: string) => asserts condition = (
  condition,
  message
) => {
  if (!condition) throw new Error(message);
};

interface LocalizedCarouselPublicationSafetyInput {
  envFile: string;
  envFileExists: boolean;
  nodeEnv?: string;
  deployEnv?: string;
  databaseUrl?: string;
  redisUrl?: string;
}

interface SafeLocalizedCarouselPublicationTarget {
  databaseName: string;
  envFile: string;
  maskedDatabaseTarget: string;
}

export const assertSafeLocalizedCarouselPublicationEnvironment = (
  input: LocalizedCarouselPublicationSafetyInput
): SafeLocalizedCarouselPublicationTarget => {
  const envFile = input.envFile.trim();
  assert(envFile.length > 0, "localized publication check requires ENV_FILE");
  assert(input.envFileExists, `environment file was not found: ${envFile}`);

  const nodeEnv = input.nodeEnv?.trim().toLowerCase();
  const deployEnv = input.deployEnv?.trim().toLowerCase();
  assert(
    nodeEnv !== "production" && !["prod", "production", "staging"].includes(deployEnv ?? ""),
    "localized publication check rejects production and staging environments"
  );
  assert(
    nodeEnv === "development" || nodeEnv === "test",
    "localized publication check requires NODE_ENV=development or test"
  );
  assert(
    deployEnv === "local" || deployEnv === "test",
    "localized publication check requires DEPLOY_ENV=local or test"
  );

  const databaseUrl = parseRequiredUrl(input.databaseUrl, "DATABASE_URL");
  assert(databaseUrl.protocol === "mysql:", "localized publication check requires MySQL");
  assert(
    LOCAL_HOSTS.has(databaseUrl.hostname),
    "localized publication check only accepts a local MySQL host"
  );
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ""))
      .normalize("NFKC")
      .toLowerCase();
  } catch {
    throw new Error("DATABASE_URL database name must use valid URL encoding");
  }
  assert(databaseName.length > 0, "DATABASE_URL must include a database name");
  const condensedDatabaseName = databaseName.replace(/[^a-z0-9]/gu, "");
  assert(
    !/(?:production|staging|prod)/u.test(condensedDatabaseName),
    "localized publication check rejects production-looking database names"
  );
  assert(
    LOCAL_DATABASES.has(databaseName),
    "localized publication check requires database needo_dev or needo_test"
  );

  const redisUrl = parseRequiredUrl(input.redisUrl, "REDIS_URL");
  assert(redisUrl.protocol === "redis:", "localized publication check requires Redis");
  assert(
    LOCAL_HOSTS.has(redisUrl.hostname),
    "localized publication check only accepts a local Redis host"
  );

  return {
    databaseName,
    envFile,
    maskedDatabaseTarget: `mysql://${databaseUrl.hostname}${
      databaseUrl.port ? `:${databaseUrl.port}` : ""
    }/${databaseName}`
  };
};

const parseRequiredUrl = (value: string | undefined, name: string): URL => {
  assert(value, `${name} is required`);
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
};

interface ExactContentPublicationCommandDeleteClient {
  contentPublicationCommand: {
    deleteMany(input: { where: { id: { in: number[] } } }): Promise<{ count: number }>;
  };
}

export const deleteLocalizedPublicationCommandsByExactId = async (
  client: ExactContentPublicationCommandDeleteClient,
  commandIds: number[]
): Promise<number> => {
  if (commandIds.length === 0) return 0;
  const deleted = await client.contentPublicationCommand.deleteMany({
    where: { id: { in: commandIds } }
  });
  return deleted.count;
};

export const composeLocalizedPublicationCheckerError = (
  operationError: unknown,
  cleanupErrors: unknown[]
): unknown => {
  const operationFailed = operationError !== undefined;
  if (operationFailed && cleanupErrors.length > 0) {
    return new AggregateError(
      [operationError, ...cleanupErrors],
      "localized publication checker operation and cleanup failed"
    );
  }
  if (operationFailed) return operationError;
  if (cleanupErrors.length > 0) {
    return new AggregateError(cleanupErrors, "localized publication checker cleanup failed");
  }
  return undefined;
};

const storedMediaFileExists = async (
  storage: { read(fileKey: string): Promise<Buffer> },
  fileKey: string
): Promise<boolean> => {
  try {
    await storage.read(fileKey);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") return false;
    throw error;
  }
};

const markerUuid = (marker: string, salt: string): string => {
  const hex = createHash("sha256").update(`${marker}:${salt}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(
    17,
    20
  )}-${hex.slice(20)}`;
};

const markerNumberPart = (marker: string, salt: string): string => {
  const hex = createHash("sha256").update(`${marker}:${salt}`).digest("hex").slice(0, 12);
  return (BigInt(`0x${hex}`) % 10_000_000_000n).toString().padStart(10, "0");
};

const main = async (): Promise<void> => {
  const requestedEnvFile = process.env.ENV_FILE?.trim() ?? "";
  assert(requestedEnvFile.length > 0, "localized publication check requires ENV_FILE");
  assert(existsSync(requestedEnvFile), `environment file was not found: ${requestedEnvFile}`);
  process.env.ENV_FILE = requestedEnvFile;
  loadDotenv({ path: requestedEnvFile });
  const safeTarget = assertSafeLocalizedCarouselPublicationEnvironment({
    envFile: requestedEnvFile,
    envFileExists: existsSync(requestedEnvFile),
    nodeEnv: process.env.NODE_ENV,
    deployEnv: process.env.DEPLOY_ENV,
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL
  });

  const [
    { env },
    { prisma, disconnectPrisma },
    { AuditLogRepository },
    { ContentMediaRepository },
    { OfficialAnnouncementRepository },
    { CarouselPublicationRepository },
    { AffiliateMarketplaceRepository },
    { ContentMediaFileStorage },
    { ContentMediaService },
    { OfficialAnnouncementService },
    { CarouselPublicationService },
    { ContentPublicationSchedulerService },
    { AffiliateMarketplaceService },
    { AffiliateLinkTokenService },
    { createFormalTestUser, deleteFormalTestUserFoundations }
  ] = await Promise.all([
    import("../src/config/env"),
    import("../src/prisma/client"),
    import("../src/repositories/audit-log.repository"),
    import("../src/repositories/content-media.repository"),
    import("../src/repositories/official-announcement.repository"),
    import("../src/repositories/carousel-publication.repository"),
    import("../src/repositories/affiliate-marketplace.repository"),
    import("../src/services/content-media.storage"),
    import("../src/services/content-media.service"),
    import("../src/services/official-announcement.service"),
    import("../src/services/carousel-publication.service"),
    import("../src/services/content-publication-scheduler.service"),
    import("../src/services/affiliate-marketplace.service"),
    import("../src/services/affiliate-link-token.service"),
    import("./support/formal-test-user")
  ]);

  const marker = `localized-carousel-publication-${Date.now()}-${process.pid}-${randomUUID().slice(0, 8)}`;
  const context = { ip: "127.0.0.1", userAgent: "localized-carousel-publication-check" };
  const created = {
    userIds: [] as number[],
    customerProfileIds: [] as number[],
    identityIds: [] as number[],
    publicIdentifierIds: [] as number[],
    userRoleIds: [] as number[],
    categoryIds: [] as number[],
    shopIds: [] as number[],
    technicianProfileIds: [] as number[],
    serviceIds: [] as number[],
    affiliateProfileIds: [] as number[],
    walletIds: [] as number[],
    affiliateTaskIds: [] as number[],
    affiliateBudgetReservationIds: [] as number[],
    affiliateTaskShopIds: [] as number[],
    affiliateTaskServiceIds: [] as number[],
    announcementIds: [] as number[],
    announcementReleaseIds: [] as number[],
    announcementTranslationIds: [] as number[],
    carouselReleaseIds: [] as number[],
    carouselSlideIds: [] as number[],
    carouselSlideTranslationIds: [] as number[],
    mediaAssetIds: [] as number[],
    mediaFileKeys: [] as string[],
    contentPublicationCommandKeys: [] as string[],
    contentPublicationCommandIds: [] as number[],
    auditLogIds: [] as number[]
  };
  const cleanupErrors: unknown[] = [];
  const captureIds = (target: number[], ids: number[]): void => {
    const seen = new Set(target);
    for (const id of ids) {
      if (!seen.has(id)) {
        target.push(id);
        seen.add(id);
      }
    }
  };
  let operationError: unknown;
  let evidence: Record<string, unknown> | undefined;
  let clock = new Date();

  const mediaStorage = new ContentMediaFileStorage(env.CONTENT_MEDIA_STORAGE_DIR, {
    identityStorageDirectory: env.IDENTITY_APPLICATION_MEDIA_STORAGE_DIR
  });

  try {
    const existingSceneRows = await prisma.carouselRelease.count({
      where: { scene: { in: [USER_SCENE, AFFILIATE_SCENE] }, deletedAt: null }
    });
    assert(
      existingSceneRows === 0,
      "localized publication check requires empty local carousel scenes to avoid mutating existing content"
    );

    const passwordHash = await hash(`${marker}.Password!`, 12);
    const operator = await createFormalTestUser(prisma, {
      email: `${marker}-operator@needo.test`,
      passwordHash,
      username: `${marker} operator`
    });
    created.userIds.push(operator.id);
    const technician = await createFormalTestUser(prisma, {
      email: `${marker}-technician@needo.test`,
      passwordHash,
      username: `${marker} technician`
    });
    created.userIds.push(technician.id);
    for (const user of [operator, technician]) {
      created.identityIds.push(...user.identities.map((identity) => identity.id));
      created.publicIdentifierIds.push(
        ...user.identities.flatMap((identity) =>
          identity.publicIdentifier ? [identity.publicIdentifier.id] : []
        )
      );
      created.customerProfileIds.push(
        ...user.identities.flatMap((identity) =>
          identity.scopeType === "customer_profile" && identity.scopeId !== null
            ? [identity.scopeId]
            : []
        )
      );
      created.userRoleIds.push(...user.userRoles.map((role) => role.id));
    }

    const scoutIdentity = await prisma.userIdentity.create({
      data: {
        userId: operator.id,
        type: "scout",
        activeKey: `${operator.id}:scout`,
        scopeType: "global",
        displayName: `${marker} affiliate`,
        isActive: true
      }
    });
    const technicianIdentity = await prisma.userIdentity.create({
      data: {
        userId: technician.id,
        type: "technician",
        activeKey: `${technician.id}:technician`,
        scopeType: "global",
        displayName: `${marker} technician`,
        isActive: true
      }
    });
    created.identityIds.push(scoutIdentity.id, technicianIdentity.id);

    const technicianNumberPart = markerNumberPart(marker, "technician");
    const technicianPublicIdentifier = await prisma.publicIdentifier.create({
      data: {
        publicId: `s${technicianNumberPart}`,
        numberPart: technicianNumberPart,
        kind: "S",
        userIdentityId: technicianIdentity.id,
        searchable: true,
        status: "ACTIVE"
      }
    });
    created.publicIdentifierIds.push(technicianPublicIdentifier.id);

    const affiliateProfile = await prisma.affiliateProfile.create({
      data: {
        userId: operator.id,
        bio: `${marker} local checker affiliate`,
        status: "ACTIVE",
        cooperationStatus: "AVAILABLE"
      }
    });
    created.affiliateProfileIds.push(affiliateProfile.id);

    const category = await prisma.category.create({
      data: { code: `${marker}-category`, name: `${marker} category` }
    });
    created.categoryIds.push(category.id);
    const shop = await prisma.shop.create({
      data: {
        ownerUserId: operator.id,
        name: `${marker} shop`,
        city: "Tokyo",
        address: `${marker} local address`,
        status: "published"
      }
    });
    created.shopIds.push(shop.id);
    const shopNumberPart = markerNumberPart(marker, "shop");
    const shopPublicIdentifier = await prisma.publicIdentifier.create({
      data: {
        publicId: `shop${shopNumberPart}`,
        numberPart: shopNumberPart,
        kind: "SHOP",
        shopId: shop.id,
        searchable: true,
        status: "ACTIVE"
      }
    });
    created.publicIdentifierIds.push(shopPublicIdentifier.id);
    await prisma.shop.update({ where: { id: shop.id }, data: { shopNo: shopNumberPart } });

    const technicianProfile = await prisma.technicianProfile.create({
      data: {
        userId: technician.id,
        shopId: shop.id,
        displayName: `${marker} technician`,
        city: "Tokyo",
        status: "published"
      }
    });
    created.technicianProfileIds.push(technicianProfile.id);
    const serviceRecord = await prisma.service.create({
      data: {
        categoryId: category.id,
        shopId: shop.id,
        technicianProfileId: technicianProfile.id,
        name: `${marker} service`,
        city: "Tokyo",
        priceAmount: 8_800,
        durationMinutes: 60,
        status: "published"
      }
    });
    created.serviceIds.push(serviceRecord.id);

    const wallet = await prisma.wallet.create({
      data: {
        ownerType: "SHOP",
        ownerId: shop.id,
        availableBalance: 100_000,
        frozenBalance: TASK_BUDGET_NDP
      }
    });
    created.walletIds.push(wallet.id);
    const claimStartsAt = new Date(clock.getTime() - 60_000);
    const claimEndsAt = new Date(clock.getTime() + 7 * 86_400_000);
    const taskEndsAt = new Date(clock.getTime() + 14 * 86_400_000);
    const affiliateTask = await prisma.affiliateTask.create({
      data: {
        taskCode: `${marker}-task`,
        lineageKey: `${marker}-task`,
        publisherType: "SHOP",
        publisherShopId: shop.id,
        name: `${marker} affiliate task`,
        description: `${marker} formal target fixture`,
        rewardNdpPerCompletedOrder: TASK_REWARD_NDP,
        totalBudgetNdp: TASK_BUDGET_NDP,
        reservedBudgetNdp: TASK_BUDGET_NDP,
        claimStartsAt,
        claimEndsAt,
        taskStartsAt: claimStartsAt,
        taskEndsAt,
        attributionWindowDays: 30,
        maxCompletedOrdersPerClaim: 20,
        maxCompletedOrdersPerCustomer: 1,
        serviceScopeMode: "SELECTED_SERVICES",
        status: "ACTIVE",
        reviewedById: operator.id,
        reviewedAt: clock,
        submittedAt: clock,
        activatedAt: clock,
        shops: { create: { shopId: shop.id, shopNameSnapshot: shop.name } },
        services: {
          create: {
            shopId: shop.id,
            serviceId: serviceRecord.id,
            serviceNameSnapshot: serviceRecord.name,
            servicePriceJpySnapshot: 8_800
          }
        },
        budgetReservation: {
          create: {
            walletId: wallet.id,
            totalFrozenNdp: TASK_BUDGET_NDP,
            status: "ACTIVE",
            idempotencyKey: `${marker}-task-budget`
          }
        }
      }
    });
    created.affiliateTaskIds.push(affiliateTask.id);
    const [budgetReservation, taskShops, taskServices] = await Promise.all([
      prisma.affiliateBudgetReservation.findUniqueOrThrow({
        where: { taskId: affiliateTask.id },
        select: { id: true }
      }),
      prisma.affiliateTaskShop.findMany({
        where: { taskId: affiliateTask.id },
        select: { id: true }
      }),
      prisma.affiliateTaskService.findMany({
        where: { taskId: affiliateTask.id },
        select: { id: true }
      })
    ]);
    created.affiliateBudgetReservationIds.push(budgetReservation.id);
    created.affiliateTaskShopIds.push(...taskShops.map((row) => row.id));
    created.affiliateTaskServiceIds.push(...taskServices.map((row) => row.id));

    const operatorActor = {
      userId: operator.id,
      email: operator.email,
      accessTokenJti: markerUuid(marker, "operator-token"),
      accessTokenExpiresAt: Math.floor(Date.now() / 1_000) + 900,
      currentIdentityId: operator.identities[0]!.id,
      currentIdentityType: "platform",
      currentIdentityScopeType: "global",
      currentIdentityScopeId: null,
      roles: ["super_admin"],
      permissions: [
        "page:backoffice-user-home-carousel",
        "button:backoffice-user-home-carousel-edit",
        "button:backoffice-user-home-carousel-publish",
        "page:backoffice-affiliate-announcement",
        "button:backoffice-affiliate-announcement-edit",
        "button:backoffice-affiliate-announcement-publish"
      ]
    };
    const affiliateActor = {
      ...operatorActor,
      currentIdentityId: scoutIdentity.id,
      currentIdentityType: "scout"
    };
    const commandIdempotencyKey = (salt: string): string => {
      const key = markerUuid(marker, salt);
      created.contentPublicationCommandKeys.push(key);
      return key;
    };

    const marketplaceRepository = new AffiliateMarketplaceRepository(prisma);
    const marketplace = new AffiliateMarketplaceService(
      marketplaceRepository,
      new AffiliateLinkTokenService({
        secret: env.AFFILIATE_LINK_SECRET,
        publicBaseUrl: env.AFFILIATE_PUBLIC_BASE_URL
      }),
      { now: () => clock }
    );
    const mediaRepository = new ContentMediaRepository(prisma);
    const mediaService = new ContentMediaService(mediaRepository, mediaStorage);
    const announcementRepository = new OfficialAnnouncementRepository(prisma);
    let announcementPublicIdCounter = 0;
    const announcementService = new OfficialAnnouncementService(
      announcementRepository,
      marketplace,
      {
        now: () => clock,
        createPublicId: () =>
          markerUuid(marker, `announcement-${announcementPublicIdCounter++}`)
      }
    );
    const carouselRepository = new CarouselPublicationRepository(prisma);
    let carouselPublicIdCounter = 0;
    const carouselService = new CarouselPublicationService(carouselRepository, marketplace, {
      now: () => clock,
      createPublicId: () => markerUuid(marker, `carousel-${carouselPublicIdCounter++}`)
    });

    const pngBytes = Buffer.concat([
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64"
      ),
      Buffer.from(marker, "utf8")
    ]);
    const media = await mediaService.upload(operatorActor, context, {
      bytes: pngBytes,
      mimeType: "image/png",
      altText: `${marker} publication image`,
      now: clock
    });
    created.mediaAssetIds.push(media.mediaAssetId);
    created.mediaFileKeys.push(media.url.split("/").at(-1)!);

    const announcementDraft = await announcementService.createDraft(operatorActor, context, {
      idempotencyKey: commandIdempotencyKey("announcement-create"),
      sourceLocale: "ja",
      affiliateTaskId: affiliateTask.id,
      visibleFrom: null,
      visibleUntil: null,
      translation: {
        title: `${marker} 日本語公告`,
        summary: `${marker} 日本語概要`,
        body: `${marker} 日本語本文`
      }
    });
    created.announcementReleaseIds.push(announcementDraft.releaseId);
    const announcementRow = await prisma.officialAnnouncement.findUniqueOrThrow({
      where: { publicId: announcementDraft.publicId },
      select: { id: true }
    });
    created.announcementIds.push(announcementRow.id);
    const announcementEnglish = await announcementService.updateLocale(
      operatorActor,
      context,
      announcementDraft.publicId,
      announcementDraft.releaseId,
      {
        expectedLockVersion: announcementDraft.lockVersion,
        locale: "en",
        title: `${marker} English announcement`,
        summary: `${marker} English summary`,
        body: `${marker} English body`
      }
    );
    assert(
      announcementEnglish.translations.en.title === `${marker} English announcement` &&
        announcementEnglish.translations.ja.title === `${marker} 日本語公告` &&
        announcementEnglish.translations.en.sourceLocale === "en" &&
        !announcementEnglish.translations.en.isInitialCopy,
      "independent English announcement edit persisted"
    );
    console.log("PASS independent English announcement edit persisted");
    const publishedAnnouncement = await announcementService.publish(
      operatorActor,
      context,
      announcementDraft.publicId,
      announcementDraft.releaseId,
      {
        idempotencyKey: commandIdempotencyKey("announcement-publish"),
        expectedLockVersion: announcementEnglish.lockVersion,
        reason: `${marker} immediate publish`
      }
    );

    const slideTranslation = (title: string) => [
      {
        locale: "ja" as const,
        badge: "TEST",
        title: `${marker} ${title}`,
        caption: `${marker} caption`,
        ctaLabel: "詳細",
        imageAltText: `${marker} image`
      }
    ];
    const userDraft = await carouselService.createDraft(
      USER_SCENE,
      operatorActor,
      context,
      {
        idempotencyKey: commandIdempotencyKey("user-carousel-create"),
        sourceLocale: "ja",
        slides: [
          {
            mediaAssetPublicId: media.checksumSha256,
            sortOrder: 0,
            isEnabled: true,
            visibleFrom: null,
            visibleUntil: null,
            target: { type: "shop", publicId: shopPublicIdentifier.publicId },
            translations: slideTranslation("shop")
          },
          {
            mediaAssetPublicId: media.checksumSha256,
            sortOrder: 1,
            isEnabled: true,
            visibleFrom: null,
            visibleUntil: null,
            target: { type: "technician", publicId: technicianPublicIdentifier.publicId },
            translations: slideTranslation("technician")
          },
          {
            mediaAssetPublicId: media.checksumSha256,
            sortOrder: 2,
            isEnabled: true,
            visibleFrom: null,
            visibleUntil: null,
            target: { type: "service", publicId: serviceRecord.publicId },
            translations: slideTranslation("service")
          }
        ]
      }
    );
    created.carouselReleaseIds.push(userDraft.releaseId);
    const publishedUser = await carouselService.publish(
      USER_SCENE,
      operatorActor,
      context,
      userDraft.releaseId,
      {
        idempotencyKey: commandIdempotencyKey("user-carousel-publish"),
        expectedLockVersion: userDraft.lockVersion,
        reason: `${marker} immediate publish`
      }
    );

    const affiliateDraft = await carouselService.createDraft(
      AFFILIATE_SCENE,
      operatorActor,
      context,
      {
        idempotencyKey: commandIdempotencyKey("affiliate-carousel-create"),
        sourceLocale: "ja",
        slides: [
          {
            mediaAssetPublicId: media.checksumSha256,
            sortOrder: 0,
            isEnabled: true,
            visibleFrom: null,
            visibleUntil: null,
            target: {
              type: "affiliate_announcement",
              announcementPublicId: publishedAnnouncement.publicId,
              taskCode: affiliateTask.taskCode
            },
            translations: slideTranslation("affiliate announcement")
          }
        ]
      }
    );
    created.carouselReleaseIds.push(affiliateDraft.releaseId);
    const publishedAffiliate = await carouselService.publish(
      AFFILIATE_SCENE,
      operatorActor,
      context,
      affiliateDraft.releaseId,
      {
        idempotencyKey: commandIdempotencyKey("affiliate-carousel-publish"),
        expectedLockVersion: affiliateDraft.lockVersion,
        reason: `${marker} immediate publish`
      }
    );
    assert(
      publishedUser.status === "published" && publishedAffiliate.status === "published",
      "both carousel scenes published"
    );
    console.log("PASS both carousel scenes published");

    const scheduledAnnouncementDraft = await announcementService.rollback(
      operatorActor,
      context,
      publishedAnnouncement.publicId,
      publishedAnnouncement.releaseId,
      {
        idempotencyKey: commandIdempotencyKey("announcement-rollback"),
        expectedCurrentVersion: publishedAnnouncement.version,
        reason: `${marker} scheduled successor source`
      }
    );
    created.announcementReleaseIds.push(scheduledAnnouncementDraft.releaseId);
    assert(
      scheduledAnnouncementDraft.version > publishedAnnouncement.version &&
        scheduledAnnouncementDraft.sourceReleaseId === publishedAnnouncement.releaseId,
      "historical release rolled back as a higher version"
    );
    console.log("PASS historical release rolled back as a higher version");
    const publishAt = new Date(clock.getTime() + 60_000);
    const scheduledAnnouncement = await announcementService.schedule(
      operatorActor,
      context,
      publishedAnnouncement.publicId,
      scheduledAnnouncementDraft.releaseId,
      {
        idempotencyKey: commandIdempotencyKey("announcement-schedule"),
        expectedLockVersion: scheduledAnnouncementDraft.lockVersion,
        publishAt: publishAt.toISOString(),
        reason: `${marker} scheduled activation`
      }
    );
    clock = new Date(publishAt.getTime() + 1_000);
    const [dueAnnouncements, dueCarousels] = await Promise.all([
      announcementRepository.listDueScheduledReleases({
        now: clock,
        batchSize: 500,
        maxAttempts: env.CONTENT_PUBLICATION_MAX_ACTIVATION_ATTEMPTS
      }),
      carouselRepository.listDueScheduledReleases({
        now: clock,
        batchSize: 500,
        maxAttempts: env.CONTENT_PUBLICATION_MAX_ACTIVATION_ATTEMPTS
      })
    ]);
    assert(
      dueAnnouncements.length < 500 && dueCarousels.length < 500,
      "localized publication check refuses an ambiguous scheduled-release backlog"
    );
    const unexpectedDue = [...dueAnnouncements, ...dueCarousels].filter(
      (release) =>
        !created.announcementReleaseIds.includes(release.releaseId) &&
        !created.carouselReleaseIds.includes(release.releaseId)
    );
    assert(
      unexpectedDue.length === 0,
      "localized publication check refuses to activate unrelated scheduled content"
    );
    const scheduler = new ContentPublicationSchedulerService(
      announcementRepository,
      carouselRepository,
      new AuditLogRepository(prisma),
      env.CONTENT_PUBLICATION_MAX_ACTIVATION_ATTEMPTS
    );
    created.contentPublicationCommandKeys.push(
      `content-publication:official_announcement:${scheduledAnnouncement.publicId}:release:${scheduledAnnouncement.releaseId}:activate`
    );
    const activation = await scheduler.activateDue({ now: clock, batchSize: 1 });
    const activatedAnnouncement = await announcementService.getRelease(
      operatorActor,
      scheduledAnnouncement.publicId,
      scheduledAnnouncement.releaseId
    );
    assert(
      activation.scanned === 1 &&
        activation.activated === 1 &&
        activatedAnnouncement.status === "published",
      "scheduled successor activated"
    );
    console.log("PASS scheduled successor activated");

    const disabledUser = await carouselService.disable(
      USER_SCENE,
      operatorActor,
      context,
      publishedUser.releaseId,
      {
        idempotencyKey: commandIdempotencyKey("user-carousel-disable"),
        expectedLockVersion: publishedUser.lockVersion,
        reason: `${marker} disable verification`
      }
    );
    assert(disabledUser.status === "disabled", "published scene disabled");
    console.log("PASS published scene disabled");
    const rollbackUser = await carouselService.rollback(
      USER_SCENE,
      operatorActor,
      context,
      publishedUser.releaseId,
      {
        idempotencyKey: commandIdempotencyKey("user-carousel-rollback"),
        expectedCurrentVersion: disabledUser.version,
        reason: `${marker} rollback verification`
      }
    );
    created.carouselReleaseIds.push(rollbackUser.releaseId);
    assert(
      rollbackUser.version > disabledUser.version &&
        rollbackUser.sourceReleaseId === publishedUser.releaseId,
      "historical release rolled back as a higher version"
    );
    const republishedUser = await carouselService.publish(
      USER_SCENE,
      operatorActor,
      context,
      rollbackUser.releaseId,
      {
        idempotencyKey: commandIdempotencyKey("user-carousel-republish"),
        expectedLockVersion: rollbackUser.lockVersion,
        reason: `${marker} publish rollback`
      }
    );

    for (const locale of CONTENT_LOCALES) {
      const userProjection = await carouselService.getPublishedScene(
        USER_SCENE,
        locale,
        affiliateActor,
        clock
      );
      const affiliateProjection = await carouselService.getPublishedScene(
        AFFILIATE_SCENE,
        locale,
        affiliateActor,
        clock
      );
      const announcementProjection = await announcementService.getPublishedForAffiliate(
        affiliateActor,
        publishedAnnouncement.publicId,
        locale
      );
      assert(
        userProjection.slides.length === 3 &&
          new Set(userProjection.slides.map((slide) => slide.target.type)).size === 3,
        `USER_HOME target reconciliation failed for ${locale}`
      );
      assert(
        affiliateProjection.slides.length === 1 &&
          affiliateProjection.slides[0]?.target.type === "affiliate_announcement",
        `AFFILIATE_HOME_NOTICE target reconciliation failed for ${locale}`
      );
      assert(
        announcementProjection.title.includes(marker) &&
          announcementProjection.taskAction?.taskCode === affiliateTask.taskCode,
        `announcement projection failed for ${locale}`
      );
      if (locale === "en") {
        assert(
          announcementProjection.title === `${marker} English announcement`,
          "independent English announcement projection was lost"
        );
      }
    }
    console.log("PASS all five localized public projections reconciled");

    const auditRows = await prisma.auditLog.findMany({
      where: { actorId: operator.id },
      select: { action: true }
    });
    const auditActions = new Set(auditRows.map((row) => row.action));
    for (const action of [
      "content.media.uploaded",
      "content.affiliate_announcement.draft_created",
      "content.affiliate_announcement.locale_updated",
      "content.affiliate_announcement.publish",
      "content.affiliate_announcement.rollback_cloned",
      "content.affiliate_announcement.schedule",
      "content.carousel.draft_created",
      "content.carousel.publish",
      "content.carousel.disable",
      "content.carousel.rollback_cloned"
    ]) {
      assert(auditActions.has(action), `missing publication audit action: ${action}`);
    }
    const commandRows = await prisma.contentPublicationCommand.findMany({
      where: { idempotencyKey: { in: created.contentPublicationCommandKeys } },
      select: { id: true, action: true }
    });
    created.contentPublicationCommandIds.push(...commandRows.map((row) => row.id));
    const commandActions = new Set(commandRows.map((row) => row.action));
    for (const action of ["publish", "schedule", "activate", "disable", "rollback"]) {
      assert(commandActions.has(action), `missing publication command action: ${action}`);
    }
    console.log("PASS publication audit actions reconciled");

    evidence = {
      database: safeTarget.maskedDatabaseTarget,
      marker,
      locales: [...CONTENT_LOCALES],
      scenes: [USER_SCENE, AFFILIATE_SCENE],
      announcement: {
        publicId: publishedAnnouncement.publicId,
        scheduledVersion: activatedAnnouncement.version
      },
      userCarousel: { releaseVersion: republishedUser.version },
      lifecycle: {
        immediatePublish: true,
        scheduledActivation: true,
        disable: true,
        rollback: true
      },
      auditReconciled: true,
      cleanup: "pending",
      status: "ok"
    };
  } catch (error) {
    operationError = error;
  } finally {
    try {
      await prisma.$transaction(async (transaction) => {
        if (created.userIds.length > 0) {
          const [identities, customerProfiles, userRoles] = await Promise.all([
            transaction.userIdentity.findMany({
              where: { userId: { in: created.userIds } },
              select: { id: true }
            }),
            transaction.customerProfile.findMany({
              where: { userId: { in: created.userIds } },
              select: { id: true }
            }),
            transaction.userRole.findMany({
              where: { userId: { in: created.userIds } },
              select: { id: true }
            })
          ]);
          captureIds(
            created.identityIds,
            identities.map((row) => row.id)
          );
          captureIds(
            created.customerProfileIds,
            customerProfiles.map((row) => row.id)
          );
          captureIds(
            created.userRoleIds,
            userRoles.map((row) => row.id)
          );
          const identityPublicIdentifiers = await transaction.publicIdentifier.findMany({
            where: { userIdentityId: { in: created.identityIds } },
            select: { id: true }
          });
          captureIds(
            created.publicIdentifierIds,
            identityPublicIdentifiers.map((row) => row.id)
          );
        }
        if (created.shopIds.length > 0) {
          const shopPublicIdentifiers = await transaction.publicIdentifier.findMany({
            where: { shopId: { in: created.shopIds } },
            select: { id: true }
          });
          captureIds(
            created.publicIdentifierIds,
            shopPublicIdentifiers.map((row) => row.id)
          );
        }
        if (created.affiliateTaskIds.length > 0) {
          const [budgetReservations, taskShops, taskServices] = await Promise.all([
            transaction.affiliateBudgetReservation.findMany({
              where: { taskId: { in: created.affiliateTaskIds } },
              select: { id: true }
            }),
            transaction.affiliateTaskShop.findMany({
              where: { taskId: { in: created.affiliateTaskIds } },
              select: { id: true }
            }),
            transaction.affiliateTaskService.findMany({
              where: { taskId: { in: created.affiliateTaskIds } },
              select: { id: true }
            })
          ]);
          captureIds(
            created.affiliateBudgetReservationIds,
            budgetReservations.map((row) => row.id)
          );
          captureIds(
            created.affiliateTaskShopIds,
            taskShops.map((row) => row.id)
          );
          captureIds(
            created.affiliateTaskServiceIds,
            taskServices.map((row) => row.id)
          );
        }
        if (created.carouselReleaseIds.length > 0) {
          const slideRows = await transaction.carouselSlide.findMany({
            where: { releaseId: { in: created.carouselReleaseIds } },
            select: { id: true, translations: { select: { id: true } } }
          });
          captureIds(
            created.carouselSlideIds,
            slideRows.map((row) => row.id)
          );
          captureIds(
            created.carouselSlideTranslationIds,
            slideRows.flatMap((row) => row.translations.map((translation) => translation.id))
          );
          if (created.carouselSlideTranslationIds.length > 0) {
            await transaction.carouselSlideTranslation.deleteMany({
              where: { id: { in: created.carouselSlideTranslationIds } }
            });
          }
          if (created.carouselSlideIds.length > 0) {
            await transaction.carouselSlide.deleteMany({
              where: { id: { in: created.carouselSlideIds } }
            });
          }
        }
        if (created.announcementReleaseIds.length > 0) {
          const translationRows = await transaction.officialAnnouncementTranslation.findMany({
            where: { releaseId: { in: created.announcementReleaseIds } },
            select: { id: true }
          });
          captureIds(
            created.announcementTranslationIds,
            translationRows.map((row) => row.id)
          );
          if (created.announcementTranslationIds.length > 0) {
            await transaction.officialAnnouncementTranslation.deleteMany({
              where: { id: { in: created.announcementTranslationIds } }
            });
          }
        }
        if (created.contentPublicationCommandKeys.length > 0) {
          const commandRows = await transaction.contentPublicationCommand.findMany({
            where: { idempotencyKey: { in: created.contentPublicationCommandKeys } },
            select: { id: true }
          });
          captureIds(
            created.contentPublicationCommandIds,
            commandRows.map((row) => row.id)
          );
        }
        await deleteLocalizedPublicationCommandsByExactId(
          transaction,
          created.contentPublicationCommandIds
        );
        const auditRows = await transaction.auditLog.findMany({
          where: {
            OR: [
              ...(created.userIds.length > 0 ? [{ actorId: { in: created.userIds } }] : []),
              ...(created.announcementReleaseIds.length > 0
                ? [
                    {
                      actorId: null,
                      action: "content_publication.schedule_failed",
                      targetType: "OfficialAnnouncementRelease",
                      targetId: { in: created.announcementReleaseIds }
                    }
                  ]
                : []),
              ...(created.carouselReleaseIds.length > 0
                ? [
                    {
                      actorId: null,
                      action: "content_publication.schedule_failed",
                      targetType: "CarouselRelease",
                      targetId: { in: created.carouselReleaseIds }
                    }
                  ]
                : [])
            ]
          },
          select: { id: true }
        });
        captureIds(
          created.auditLogIds,
          auditRows.map((row) => row.id)
        );
        if (created.auditLogIds.length > 0) {
          await transaction.auditLog.deleteMany({
            where: { id: { in: created.auditLogIds } }
          });
        }
        if (created.carouselReleaseIds.length > 0) {
          await transaction.carouselRelease.updateMany({
            where: { id: { in: created.carouselReleaseIds } },
            data: { sourceReleaseId: null }
          });
          await transaction.carouselRelease.deleteMany({
            where: { id: { in: created.carouselReleaseIds } }
          });
        }
        if (created.announcementReleaseIds.length > 0) {
          await transaction.officialAnnouncementRelease.updateMany({
            where: { id: { in: created.announcementReleaseIds } },
            data: { sourceReleaseId: null }
          });
          await transaction.officialAnnouncementRelease.deleteMany({
            where: { id: { in: created.announcementReleaseIds } }
          });
        }
        if (created.announcementIds.length > 0) {
          await transaction.officialAnnouncement.deleteMany({
            where: { id: { in: created.announcementIds } }
          });
        }
        if (created.mediaAssetIds.length > 0) {
          await transaction.mediaAsset.deleteMany({ where: { id: { in: created.mediaAssetIds } } });
        }
        if (created.affiliateTaskIds.length > 0) {
          if (created.affiliateBudgetReservationIds.length > 0) {
            await transaction.affiliateBudgetReservation.deleteMany({
              where: { id: { in: created.affiliateBudgetReservationIds } }
            });
          }
          if (created.affiliateTaskServiceIds.length > 0) {
            await transaction.affiliateTaskService.deleteMany({
              where: { id: { in: created.affiliateTaskServiceIds } }
            });
          }
          if (created.affiliateTaskShopIds.length > 0) {
            await transaction.affiliateTaskShop.deleteMany({
              where: { id: { in: created.affiliateTaskShopIds } }
            });
          }
          await transaction.affiliateTaskTranslation.deleteMany({
            where: { taskId: { in: created.affiliateTaskIds } }
          });
          await transaction.affiliateTask.deleteMany({
            where: { id: { in: created.affiliateTaskIds } }
          });
        }
        if (created.walletIds.length > 0) {
          await transaction.wallet.deleteMany({ where: { id: { in: created.walletIds } } });
        }
        if (created.serviceIds.length > 0) {
          await transaction.service.deleteMany({ where: { id: { in: created.serviceIds } } });
        }
        if (created.technicianProfileIds.length > 0) {
          await transaction.technicianProfile.deleteMany({
            where: { id: { in: created.technicianProfileIds } }
          });
        }
        if (created.publicIdentifierIds.length > 0) {
          await transaction.publicIdentifier.deleteMany({
            where: { id: { in: created.publicIdentifierIds } }
          });
        }
        if (created.shopIds.length > 0) {
          await transaction.shop.deleteMany({ where: { id: { in: created.shopIds } } });
        }
        if (created.categoryIds.length > 0) {
          await transaction.category.deleteMany({ where: { id: { in: created.categoryIds } } });
        }
        if (created.affiliateProfileIds.length > 0) {
          await transaction.affiliateProfile.deleteMany({
            where: { id: { in: created.affiliateProfileIds } }
          });
        }
        if (created.userIds.length > 0) {
          await deleteFormalTestUserFoundations(transaction, created.userIds);
          await transaction.user.deleteMany({ where: { id: { in: created.userIds } } });
        }
      });
    } catch (error) {
      cleanupErrors.push(error);
    }
    for (const fileKey of created.mediaFileKeys) {
      try {
        await mediaStorage.delete(fileKey);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      const cleanupResidue = await Promise.all([
        prisma.user.count({ where: { id: { in: created.userIds } } }),
        prisma.customerProfile.count({ where: { id: { in: created.customerProfileIds } } }),
        prisma.userIdentity.count({ where: { id: { in: created.identityIds } } }),
        prisma.publicIdentifier.count({ where: { id: { in: created.publicIdentifierIds } } }),
        prisma.userRole.count({ where: { id: { in: created.userRoleIds } } }),
        prisma.category.count({ where: { id: { in: created.categoryIds } } }),
        prisma.shop.count({ where: { id: { in: created.shopIds } } }),
        prisma.technicianProfile.count({
          where: { id: { in: created.technicianProfileIds } }
        }),
        prisma.service.count({ where: { id: { in: created.serviceIds } } }),
        prisma.affiliateProfile.count({ where: { id: { in: created.affiliateProfileIds } } }),
        prisma.wallet.count({ where: { id: { in: created.walletIds } } }),
        prisma.affiliateTask.count({ where: { id: { in: created.affiliateTaskIds } } }),
        prisma.affiliateBudgetReservation.count({
          where: { id: { in: created.affiliateBudgetReservationIds } }
        }),
        prisma.affiliateTaskShop.count({
          where: { id: { in: created.affiliateTaskShopIds } }
        }),
        prisma.affiliateTaskService.count({
          where: { id: { in: created.affiliateTaskServiceIds } }
        }),
        prisma.mediaAsset.count({ where: { id: { in: created.mediaAssetIds } } }),
        prisma.officialAnnouncement.count({ where: { id: { in: created.announcementIds } } }),
        prisma.officialAnnouncementRelease.count({
          where: { id: { in: created.announcementReleaseIds } }
        }),
        prisma.officialAnnouncementTranslation.count({
          where: { id: { in: created.announcementTranslationIds } }
        }),
        prisma.carouselRelease.count({ where: { id: { in: created.carouselReleaseIds } } }),
        prisma.carouselSlide.count({ where: { id: { in: created.carouselSlideIds } } }),
        prisma.carouselSlideTranslation.count({
          where: { id: { in: created.carouselSlideTranslationIds } }
        }),
        prisma.contentPublicationCommand.count({
          where: { id: { in: created.contentPublicationCommandIds } }
        }),
        prisma.auditLog.count({ where: { id: { in: created.auditLogIds } } }),
        Promise.all(
          created.mediaFileKeys.map((fileKey) => storedMediaFileExists(mediaStorage, fileKey))
        ).then((exists) => exists.filter(Boolean).length)
      ]);
      assert(
        cleanupResidue.every((count) => count === 0),
        "cleanup residue verification failed"
      );
      console.log("PASS cleanup residue verification across all captured rows and media files: 0");
    } catch (error) {
      cleanupErrors.push(error);
    }
    await disconnectPrisma().catch((error: unknown) => cleanupErrors.push(error));
  }

  const finalError = composeLocalizedPublicationCheckerError(operationError, cleanupErrors);
  if (finalError !== undefined) throw finalError;
  assert(evidence, "localized publication checker produced no evidence");
  console.log(JSON.stringify({ ...evidence, cleanup: "complete" }, null, 2));
};

if (process.env.JEST_WORKER_ID === undefined && require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
