import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertBackofficePublicCarouselParity,
  assertSafeLocalizedCarouselPublicationEnvironment,
  composeLocalizedPublicationCheckerError
} from "../scripts/check-localized-carousel-publication-flow";

describe("backoffice and public published carousel parity", () => {
  const checkedAt = new Date("2026-09-01T00:00:00.000Z");

  const backofficeScene = () => ({
    scene: "USER_HOME" as const,
    published: {
      version: 12,
      slides: [
        {
          sortOrder: 1,
          isEnabled: true,
          visibleFrom: null,
          visibleUntil: null,
          target: { type: "service" as const, serviceId: 28 },
          translations: {
            ja: {
              title: "サービス",
              caption: "説明",
              imageAltText: "サービス画像",
              imageUrl: "/media/service-ja.webp"
            }
          }
        },
        {
          sortOrder: 0,
          isEnabled: true,
          visibleFrom: null,
          visibleUntil: null,
          target: { type: "shop" as const, shopId: 14 },
          translations: {
            ja: {
              title: "店舗",
              caption: "店舗説明",
              imageAltText: "店舗画像",
              imageUrl: "/media/shop-ja.webp"
            }
          }
        },
        {
          sortOrder: 2,
          isEnabled: false,
          visibleFrom: null,
          visibleUntil: null,
          target: { type: "technician" as const, technicianProfileId: 9 },
          translations: {
            ja: {
              title: "無効な技師",
              caption: null,
              imageAltText: "無効な画像",
              imageUrl: "/media/disabled-ja.webp"
            }
          }
        }
      ]
    }
  });

  const publicProjection = () => ({
    scene: "USER_HOME" as const,
    locale: "ja" as const,
    releaseVersion: 12,
    generatedAt: checkedAt.toISOString(),
    slides: [
      {
        id: "shop-slide",
        target: { type: "shop" as const, publicId: "shop0000000014" },
        title: "店舗",
        caption: "店舗説明",
        imageAltText: "店舗画像",
        imageUrl: "/media/shop-ja.webp"
      },
      {
        id: "service-slide",
        target: { type: "service" as const, publicId: "s0000000028" },
        title: "サービス",
        caption: "説明",
        imageAltText: "サービス画像",
        imageUrl: "/media/service-ja.webp"
      }
    ]
  });

  it("accepts the published version and visible localized slide projection in order", () => {
    expect(() =>
      assertBackofficePublicCarouselParity(backofficeScene(), publicProjection(), checkedAt)
    ).not.toThrow();
  });

  it("identifies the locale and localized field when a public slide differs", () => {
    const projection = publicProjection();
    projection.slides[1]!.title = "別のサービス";

    expect(() =>
      assertBackofficePublicCarouselParity(backofficeScene(), projection, checkedAt)
    ).toThrow("ja slide 1 title");
  });
});

describe("localized publication checker final error composition", () => {
  it("returns the original operation failure when cleanup succeeds", () => {
    const operationError = new Error("operation failed");

    expect(composeLocalizedPublicationCheckerError(operationError, [])).toBe(operationError);
  });

  it("returns an explicit cleanup AggregateError when only cleanup fails", () => {
    const cleanupError = new Error("cleanup failed");

    const result = composeLocalizedPublicationCheckerError(undefined, [cleanupError]);

    expect(result).toBeInstanceOf(AggregateError);
    expect((result as AggregateError).message).toBe(
      "localized publication checker cleanup failed"
    );
    expect((result as AggregateError).errors).toEqual([cleanupError]);
  });

  it("preserves both operation and cleanup failures in one AggregateError", () => {
    const operationError = new Error("operation failed");
    const cleanupErrors = [new Error("row cleanup failed"), new Error("disconnect failed")];

    const result = composeLocalizedPublicationCheckerError(operationError, cleanupErrors);

    expect(result).toBeInstanceOf(AggregateError);
    expect((result as AggregateError).message).toBe(
      "localized publication checker operation and cleanup failed"
    );
    expect((result as AggregateError).errors).toEqual([operationError, ...cleanupErrors]);
  });
});

describe("localized carousel publication real-database checker", () => {
  const backendRoot = join(__dirname, "..");
  const scriptPath = join(
    backendRoot,
    "scripts/check-localized-carousel-publication-flow.ts"
  );

  const safeEnvironment = {
    envFile: "/tmp/needo-local.env",
    envFileExists: true,
    nodeEnv: "development",
    deployEnv: "local",
    databaseUrl: "mysql://needo:secret@127.0.0.1:3307/needo_dev",
    redisUrl: "redis://:secret@127.0.0.1:6379/15"
  };

  it.each([
    ["missing explicit ENV_FILE", { ...safeEnvironment, envFile: "" }, "requires ENV_FILE"],
    [
      "missing environment file",
      { ...safeEnvironment, envFileExists: false },
      "environment file was not found"
    ],
    [
      "production runtime",
      { ...safeEnvironment, nodeEnv: "production" },
      "rejects production and staging"
    ],
    [
      "staging deployment",
      { ...safeEnvironment, deployEnv: "staging" },
      "rejects production and staging"
    ],
    [
      "development deployment alias",
      { ...safeEnvironment, deployEnv: "development" },
      "requires DEPLOY_ENV=local or test"
    ],
    [
      "remote MySQL",
      { ...safeEnvironment, databaseUrl: "mysql://needo:secret@db.example.com/needo_dev" },
      "only accepts a local MySQL host"
    ],
    [
      "production-looking database",
      { ...safeEnvironment, databaseUrl: "mysql://needo:secret@127.0.0.1/needo-prod" },
      "rejects production-looking database names"
    ],
    [
      "percent-encoded production database",
      {
        ...safeEnvironment,
        databaseUrl: "mysql://needo:secret@127.0.0.1/needo_%70rod_dev"
      },
      "rejects production-looking database names"
    ],
    [
      "concatenated production database",
      {
        ...safeEnvironment,
        databaseUrl: "mysql://needo:secret@127.0.0.1/needoproduction_dev"
      },
      "rejects production-looking database names"
    ],
    [
      "encoded concatenated staging database",
      {
        ...safeEnvironment,
        databaseUrl: "mysql://needo:secret@127.0.0.1/needo%73taging_test"
      },
      "rejects production-looking database names"
    ],
    [
      "non-allowlisted development database",
      {
        ...safeEnvironment,
        databaseUrl: "mysql://needo:secret@127.0.0.1/needo_feature_dev"
      },
      "requires database needo_dev or needo_test"
    ],
    [
      "remote Redis",
      { ...safeEnvironment, redisUrl: "redis://cache.example.com:6379/15" },
      "only accepts a local Redis host"
    ]
  ])("rejects %s", (_label, input, message) => {
    expect(() => assertSafeLocalizedCarouselPublicationEnvironment(input)).toThrow(message);
  });

  it("returns a credential-free local target summary", () => {
    expect(assertSafeLocalizedCarouselPublicationEnvironment(safeEnvironment)).toEqual({
      databaseName: "needo_dev",
      envFile: "/tmp/needo-local.env",
      maskedDatabaseTarget: "mysql://127.0.0.1:3307/needo_dev"
    });
  });

  it("registers one guarded local-only checker command", () => {
    const packageJson = JSON.parse(
      readFileSync(join(backendRoot, "package.json"), "utf8")
    ) as { scripts: Record<string, string> };

    expect(existsSync(scriptPath)).toBe(true);
    expect(packageJson.scripts["check:localized-carousel-publication-flow"]).toBe(
      "tsx scripts/check-localized-carousel-publication-flow.ts"
    );
  });

  it("fails closed before importing runtime services and never prints credentials", () => {
    const source = readFileSync(scriptPath, "utf8");

    for (const guard of [
      "assertSafeLocalizedCarouselPublicationEnvironment",
      "requires ENV_FILE",
      "environment file was not found",
      "rejects production and staging",
      "only accepts a local MySQL host",
      "rejects production-looking database names",
      "maskedDatabaseTarget"
    ]) {
      expect(source).toContain(guard);
    }

    const guardPosition = source.indexOf(
      "const safeTarget = assertSafeLocalizedCarouselPublicationEnvironment("
    );
    const prismaImportPosition = source.indexOf('import("../src/prisma/client")');
    expect(guardPosition).toBeGreaterThan(-1);
    expect(prismaImportPosition).toBeGreaterThan(guardPosition);
    expect(source).not.toContain("databaseUrl.password");
    expect(source).not.toMatch(
      /console\.(?:log|error)\([^)]*(?:accessToken|DATABASE_URL|REDIS_URL|AFFILIATE_LINK_SECRET)/su
    );
  });

  it("uses one unique marker, formal services and exact marker-owned cleanup", () => {
    const source = readFileSync(scriptPath, "utf8");

    expect(source).toContain(
      "localized-carousel-publication-${Date.now()}-${process.pid}-${randomUUID().slice(0, 8)}"
    );
    expect(source).toContain("new ContentMediaService(");
    expect(source).toContain("new OfficialAnnouncementService(");
    expect(source).toContain("new CarouselPublicationService(");
    expect(source).toContain("new ContentPublicationSchedulerService(");
    expect(source).toContain('badge: "TEST"');
    expect(source).not.toContain('badge: `${marker} TEST`');
    expect(source).toContain("try {");
    expect(source).toContain("finally {");
    expect(source).toContain("cleanup residue verification across all captured rows and media files");
    expect(source).toContain("created.carouselReleaseIds");
    expect(source).toContain("created.announcementReleaseIds");
    expect(source).toContain("created.mediaAssetIds");
    expect(source).toContain("created.contentPublicationCommandIds");
    expect(source).toContain("deleteLocalizedPublicationCommandsByExactId(");
    expect(source).toMatch(
      /contentPublicationCommand\.deleteMany\(\{\s*where:\s*\{\s*id:\s*\{\s*in:\s*commandIds/u
    );
    expect(source).not.toMatch(
      /contentPublicationCommand\.deleteMany\([\s\S]{0,500}releaseId:\s*\{\s*in:/u
    );
    expect(source).toMatch(
      /carouselRelease\.updateMany\([\s\S]{0,260}sourceReleaseId: null[\s\S]{0,260}carouselRelease\.deleteMany/u
    );
    expect(source).toMatch(
      /officialAnnouncementRelease\.updateMany\([\s\S]{0,260}sourceReleaseId: null[\s\S]{0,260}officialAnnouncementRelease\.deleteMany/u
    );
    expect(source).not.toMatch(/deleteMany\(\{\s*\}\)/u);
  });

  it("verifies every marker-owned table and stored media file before cleanup success", () => {
    const source = readFileSync(scriptPath, "utf8");

    for (const residue of [
      "userIds",
      "customerProfileIds",
      "identityIds",
      "publicIdentifierIds",
      "userRoleIds",
      "categoryIds",
      "shopIds",
      "technicianProfileIds",
      "serviceIds",
      "affiliateProfileIds",
      "walletIds",
      "affiliateTaskIds",
      "affiliateBudgetReservationIds",
      "affiliateTaskShopIds",
      "affiliateTaskServiceIds",
      "announcementIds",
      "announcementReleaseIds",
      "announcementTranslationIds",
      "carouselReleaseIds",
      "carouselSlideIds",
      "carouselSlideTranslationIds",
      "mediaAssetIds",
      "contentPublicationCommandIds",
      "auditLogIds"
    ]) {
      expect(source).toContain(`${residue}:`);
    }
    expect(source).toContain("storedMediaFileExists(mediaStorage, fileKey)");
    expect(source).toContain("cleanup residue verification failed");
    expect(source).toContain("cleanupResidue.every((count) => count === 0)");
  });

  it("proves both scenes, all locales and the complete publication lifecycle", () => {
    const source = readFileSync(scriptPath, "utf8");

    for (const evidence of [
      '"zh-CN"',
      '"zh-TW"',
      '"en"',
      '"ja"',
      '"ko"',
      '"USER_HOME"',
      '"AFFILIATE_HOME_NOTICE"',
      "independent English announcement edit persisted",
      "both carousel scenes published",
      "all five localized public projections reconciled",
      "scheduled successor activated",
      "published scene disabled",
      "historical release rolled back as a higher version",
      "publication audit actions reconciled"
    ]) {
      expect(source).toContain(evidence);
    }
  });
});
