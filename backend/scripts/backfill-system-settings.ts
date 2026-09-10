import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { ContentLocale, type PrismaClient } from "@prisma/client";
import { legalTermsDocuments } from "../../src/features/settings/legalTermsContent";
import { legalPrivacyDocuments } from "../../src/features/settings/legalPrivacyContent";
import {
  LEGAL_DOCUMENT_BOOTSTRAP,
  type SupportedContractLanguage
} from "../src/bootstrap/legal-document-bootstrap";
import {
  buildLegalDocumentContentHash,
  type LegalDocumentLocale
} from "../src/domain/legal-document";

type BackfillStatus = "created" | "verified" | "retired" | "conflict";

export interface SystemSettingsDatabaseTarget {
  envFile: string;
  databaseName: string;
  maskedDatabaseTarget: string;
}

export interface SystemSettingsDatabaseSafetyInput {
  envFile: string;
  nodeEnvironment?: string;
  deployEnvironment?: string;
  databaseUrl?: string;
}

export interface SystemLegalDocumentSource {
  slug: string;
  name: string;
  internalPath: string;
  displayLocations: string[];
  isEnabled: boolean;
  releases: Partial<Record<LegalDocumentLocale, {
    title: string;
    body: string;
    version?: number;
    publishedAt: Date;
  }>>;
}

const assert: (condition: unknown, message: string) => asserts condition = (
  condition,
  message
) => {
  if (!condition) throw new Error(message);
};

export const assertNonProductionLocalDatabase = (
  envFileValue: string | undefined = process.env.ENV_FILE,
  fileExists: (path: string) => boolean = existsSync
): SystemSettingsDatabaseTarget => {
  const envFile = envFileValue?.trim();
  assert(envFile, "system settings tooling requires an explicit ENV_FILE");
  assert(fileExists(envFile), `environment file was not found: ${envFile}`);
  const loaded = loadDotenv({ path: envFile, override: true });
  assert(!loaded.error, `environment file could not be loaded: ${envFile}`);

  return assertSystemSettingsDatabaseTarget({
    envFile,
    nodeEnvironment: process.env.NODE_ENV,
    deployEnvironment: process.env.DEPLOY_ENV,
    databaseUrl: process.env.DATABASE_URL
  });
};

export const assertSystemSettingsDatabaseTarget = (
  input: SystemSettingsDatabaseSafetyInput
): SystemSettingsDatabaseTarget => {
  const nodeEnvironment = (input.nodeEnvironment ?? "").trim().toLowerCase();
  const deployEnvironment = (input.deployEnvironment ?? "").trim().toLowerCase();
  assert(
    !["production", "prod", "staging"].includes(nodeEnvironment) &&
      !["production", "prod", "staging"].includes(deployEnvironment),
    "system settings tooling rejects production and staging runtimes"
  );

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(input.databaseUrl ?? "");
  } catch {
    throw new Error("system settings tooling requires a valid DATABASE_URL");
  }
  assert(databaseUrl.protocol === "mysql:", "system settings tooling only accepts MySQL");
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname),
    "system settings tooling only accepts a local MySQL host"
  );
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ""));
  assert(databaseName, "DATABASE_URL must include a database name");
  assert(
    !/(?:^|[_-])(?:prod|production|staging)(?:$|[_-])/iu.test(databaseName),
    "system settings tooling rejects production-looking database names"
  );
  const port = databaseUrl.port ? `:${databaseUrl.port}` : "";
  return {
    envFile: input.envFile,
    databaseName,
    maskedDatabaseTarget: `mysql://${databaseUrl.hostname}${port}/${databaseName}`
  };
};

const frontendLocale: Record<string, LegalDocumentLocale> = {
  zh: "zh-CN",
  "zh-Hant": "zh-TW",
  ja: "ja",
  en: "en",
  ko: "ko"
};

export const LEGAL_DOCUMENT_LOCALE_TO_DB: Record<LegalDocumentLocale, ContentLocale> = {
  "zh-CN": ContentLocale.ZH_CN,
  "zh-TW": ContentLocale.ZH_TW,
  ja: ContentLocale.JA,
  en: ContentLocale.EN,
  ko: ContentLocale.KO
};

const renderTerms = (document: {
  title: string;
  meta: string[];
  sections: Array<{ title: string; paragraphs: string[] }>;
}): string =>
  [
    document.title,
    ...document.meta,
    ...document.sections.flatMap((section) => [section.title, ...section.paragraphs])
  ].join("\n\n");

const renderPrivacy = (document: {
  title: string;
  meta: string[];
  sections: Array<{ title: string; blocks: Array<{ text: string }> }>;
}): string =>
  [
    document.title,
    ...document.meta,
    ...document.sections.flatMap((section) => [
      section.title,
      ...section.blocks.map((block) => block.text)
    ])
  ].join("\n\n");

const frontendSources = (): SystemLegalDocumentSource[] => {
  const termsReleases: SystemLegalDocumentSource["releases"] = {};
  const privacyReleases: SystemLegalDocumentSource["releases"] = {};
  for (const [language, locale] of Object.entries(frontendLocale)) {
    const terms = legalTermsDocuments[language as keyof typeof legalTermsDocuments];
    const privacy = legalPrivacyDocuments[language as keyof typeof legalPrivacyDocuments];
    termsReleases[locale] = {
      title: terms.title,
      body: renderTerms(terms),
      publishedAt: new Date("2026-05-01T00:00:00.000Z")
    };
    privacyReleases[locale] = {
      title: privacy.title,
      body: renderPrivacy(privacy),
      publishedAt: new Date("2026-05-01T00:00:00.000Z")
    };
  }
  return [
    {
      slug: "terms-of-use",
      name: "NeeDo Terms of Use",
      internalPath: "/me/settings/terms",
      displayLocations: ["settings", "registration", "footer"],
      isEnabled: true,
      releases: termsReleases
    },
    {
      slug: "privacy-policy",
      name: "NeeDo Personal Information Protection Policy",
      internalPath: "/me/settings/privacy",
      displayLocations: ["settings", "registration", "footer"],
      isEnabled: true,
      releases: privacyReleases
    }
  ];
};

const REQUIRED_CONTRACT_SLUGS = ["merchant-agreement", "affiliate-agreement"] as const;

const contractSources = (): SystemLegalDocumentSource[] => {
  assert(
    REQUIRED_CONTRACT_SLUGS.every((slug) =>
      LEGAL_DOCUMENT_BOOTSTRAP.some((source) => source.slug === slug)
    ),
    "legal contract bootstrap is incomplete"
  );
  return LEGAL_DOCUMENT_BOOTSTRAP.map((source) => ({
    slug: source.slug,
    name: source.name,
    internalPath: source.internalPath,
    displayLocations: source.displayLocations,
    isEnabled: source.isEnabled,
    releases: Object.fromEntries(
      (Object.keys(source.bodies) as SupportedContractLanguage[]).map((locale) => [
        locale,
        {
          title: source.titles[locale],
          body: source.bodies[locale],
          version: source.version,
          publishedAt: source.publishedAt
        }
      ])
    )
  }));
};

const reviewRequiredSources: SystemLegalDocumentSource[] = [
  {
    slug: "technician-agreement",
    name: "NeeDo Technician Service Provider Agreement",
    internalPath: "/me/identity/technician/apply",
    displayLocations: ["technician-application"],
    isEnabled: false,
    releases: {}
  },
  {
    slug: "ekyc-consent",
    name: "NeeDo eKYC Consent and Identity Data Handling Notice",
    internalPath: "/me/settings/verification",
    displayLocations: ["ekyc", "merchant-application", "technician-application", "withdrawal"],
    isEnabled: false,
    releases: {}
  },
  {
    slug: "cancellation-refund-policy",
    name: "NeeDo Cancellation and Refund Policy",
    internalPath: "/orders",
    displayLocations: ["booking-checkout", "order-detail", "cancellation"],
    isEnabled: false,
    releases: {}
  },
  {
    slug: "ndp-rules",
    name: "NeeDo NDP Rules",
    internalPath: "/me/settings/ndp-guide",
    displayLocations: ["ndp-wallet", "booking-checkout", "withdrawal"],
    isEnabled: false,
    releases: {}
  },
  {
    slug: "community-guidelines",
    name: "NeeDo Community and Content Guidelines",
    internalPath: "/moments",
    displayLocations: ["social-compose", "social-report"],
    isEnabled: false,
    releases: {}
  },
  {
    slug: "specified-commercial-transactions-disclosure",
    name: "Disclosure under the Specified Commercial Transactions Act",
    internalPath: "/me/settings/about",
    displayLocations: ["paid-service", "membership-purchase", "footer"],
    isEnabled: false,
    releases: {}
  }
];

export const SYSTEM_LEGAL_DOCUMENT_SOURCES: readonly SystemLegalDocumentSource[] = [
  ...frontendSources(),
  ...contractSources(),
  ...reviewRequiredSources
];

export const LEGACY_EMPTY_LEGAL_DOCUMENTS = [
  {
    slug: "other-rules-and-guides",
    name: "Other rules and guides",
    internalPath: "/me/settings/guides",
    displayLocations: []
  },
  {
    slug: "cancellation-policy",
    name: "Cancellation policy",
    internalPath: "/me/settings/cancellation-policy",
    displayLocations: []
  },
  {
    slug: "service-provider-guide",
    name: "Service provider guide",
    internalPath: "/me/settings/service-provider-guide",
    displayLocations: []
  }
] as const;

const sameStrings = (left: unknown, right: readonly string[]): boolean =>
  Array.isArray(left) && JSON.stringify(left) === JSON.stringify(right);

const retireLegacyEmptyLegalDocuments = async (
  client: PrismaClient
): Promise<Array<{ slug: string; locale: null; status: BackfillStatus }>> =>
  client.$transaction(async (transaction) => {
    const candidates = await transaction.legalDocument.findMany({
      where: {
        slug: { in: LEGACY_EMPTY_LEGAL_DOCUMENTS.map((document) => document.slug) },
        deletedAt: null
      },
      select: {
        id: true,
        slug: true,
        name: true,
        internalPath: true,
        displayLocations: true,
        isEnabled: true,
        _count: {
          select: {
            drafts: { where: { deletedAt: null } },
            releases: { where: { deletedAt: null } }
          }
        }
      }
    });
    const bySlug = new Map(candidates.map((document) => [document.slug, document]));
    const results: Array<{ slug: string; locale: null; status: BackfillStatus }> = [];

    for (const legacy of LEGACY_EMPTY_LEGAL_DOCUMENTS) {
      const document = bySlug.get(legacy.slug);
      if (!document) continue;
      const isExactEmptyPlaceholder =
        document.name === legacy.name &&
        document.internalPath === legacy.internalPath &&
        sameStrings(document.displayLocations, legacy.displayLocations) &&
        !document.isEnabled &&
        document._count.drafts === 0 &&
        document._count.releases === 0;
      if (!isExactEmptyPlaceholder) {
        results.push({ slug: legacy.slug, locale: null, status: "conflict" });
        continue;
      }

      const retiredAt = new Date();
      await transaction.legalDocument.update({
        where: { id: document.id },
        data: { deletedAt: retiredAt, lockVersion: { increment: 1 } }
      });
      await transaction.auditLog.create({
        data: {
          actorId: null,
          action: "system.legal_document.legacy_placeholder_retired",
          targetType: "LegalDocument",
          targetId: document.id,
          ip: null,
          userAgent: null,
          metadata: { slug: legacy.slug, retiredAt: retiredAt.toISOString() }
        }
      });
      results.push({ slug: legacy.slug, locale: null, status: "retired" });
    }

    return results;
  });

const backfillDocument = async (
  client: PrismaClient,
  source: SystemLegalDocumentSource
): Promise<Array<{ slug: string; locale: LegalDocumentLocale | null; status: BackfillStatus }>> =>
  client.$transaction(async (transaction) => {
    let document = await transaction.legalDocument.findFirst({
      where: { slug: source.slug, deletedAt: null }
    });
    let catalogStatus: BackfillStatus = "verified";
    if (!document) {
      document = await transaction.legalDocument.create({
        data: {
          slug: source.slug,
          name: source.name,
          internalPath: source.internalPath,
          displayLocations: source.displayLocations,
          isEnabled: source.isEnabled
        }
      });
      catalogStatus = "created";
      await transaction.auditLog.create({
        data: {
          actorId: null,
          action: "system.legal_document.backfilled",
          targetType: "LegalDocument",
          targetId: document.id,
          ip: null,
          userAgent: null,
          metadata: { slug: source.slug, scope: "catalog" }
        }
      });
    } else if (
      document.name !== source.name ||
      document.internalPath !== source.internalPath ||
      !sameStrings(document.displayLocations, source.displayLocations) ||
      document.isEnabled !== source.isEnabled
    ) {
      return [{ slug: source.slug, locale: null, status: "conflict" }];
    }

    const results: Array<{
      slug: string;
      locale: LegalDocumentLocale | null;
      status: BackfillStatus;
    }> = [{ slug: source.slug, locale: null, status: catalogStatus }];
    for (const [localeValue, releaseSource] of Object.entries(source.releases)) {
      if (!releaseSource) continue;
      const locale = localeValue as LegalDocumentLocale;
      const dbLocale = LEGAL_DOCUMENT_LOCALE_TO_DB[locale];
      const contentHash = buildLegalDocumentContentHash(
        locale,
        releaseSource.title,
        releaseSource.body
      );
      const releaseVersion = releaseSource.version ?? 1;
      const releases = await transaction.legalDocumentRelease.findMany({
        where: { documentId: document.id, locale: dbLocale, deletedAt: null },
        orderBy: [{ version: "asc" }, { id: "asc" }]
      });
      const exact = releases.find(
        (release) =>
          release.version === releaseVersion &&
          release.title === releaseSource.title &&
          release.body === releaseSource.body &&
          release.contentHash === contentHash &&
          release.publishedAt.getTime() === releaseSource.publishedAt.getTime()
      );
      if (exact) {
        results.push({ slug: source.slug, locale, status: "verified" });
        continue;
      }
      const latestVersion = releases.length > 0
        ? Math.max(...releases.map((release) => release.version))
        : 0;
      if (latestVersion >= releaseVersion) {
        results.push({ slug: source.slug, locale, status: "conflict" });
        continue;
      }
      const draft = await transaction.legalDocumentDraft.findFirst({
        where: { documentId: document.id, locale: dbLocale, deletedAt: null }
      });
      if (draft && (draft.title !== releaseSource.title || draft.body !== releaseSource.body)) {
        await transaction.legalDocumentDraft.update({
          where: { id: draft.id },
          data: { title: releaseSource.title, body: releaseSource.body }
        });
      }
      if (!draft) {
        await transaction.legalDocumentDraft.create({
          data: {
            documentId: document.id,
            locale: dbLocale,
            title: releaseSource.title,
            body: releaseSource.body
          }
        });
      }
      if (releases.length > 0) {
        await transaction.legalDocumentRelease.updateMany({
          where: { documentId: document.id, locale: dbLocale, activeKey: "active", deletedAt: null },
          data: { activeKey: null }
        });
      }
      const release = await transaction.legalDocumentRelease.create({
        data: {
          documentId: document.id,
          locale: dbLocale,
          version: releaseVersion,
          activeKey: "active",
          title: releaseSource.title,
          body: releaseSource.body,
          contentHash,
          publishedAt: releaseSource.publishedAt
        }
      });
      await transaction.auditLog.create({
        data: {
          actorId: null,
          action: "system.legal_document.release_backfilled",
          targetType: "LegalDocument",
          targetId: document.id,
          ip: null,
          userAgent: null,
          metadata: {
            slug: source.slug,
            locale,
            releasePublicId: release.publicId,
            version: releaseVersion,
            contentHash
          }
        }
      });
      results.push({ slug: source.slug, locale, status: "created" });
    }
    return results;
  });

export const runSystemSettingsBackfill = async (client: PrismaClient) => {
  const activeSettings = await client.platformSettingVersion.findFirst({
    where: { activeKey: "active", deletedAt: null },
    select: { id: true }
  });
  assert(activeSettings, "active platform settings are missing; apply the migration first");
  const report: Array<{
    slug: string;
    locale: LegalDocumentLocale | null;
    status: BackfillStatus;
  }> = await retireLegacyEmptyLegalDocuments(client);
  for (const source of SYSTEM_LEGAL_DOCUMENT_SOURCES) {
    report.push(...(await backfillDocument(client, source)));
  }
  return report;
};

const main = async (): Promise<void> => {
  const target = assertNonProductionLocalDatabase();
  process.env.ENV_FILE = target.envFile;
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");
  try {
    const report = await runSystemSettingsBackfill(prisma);
    console.log(JSON.stringify({ databaseTarget: target.maskedDatabaseTarget, report }, null, 2));
    assert(!report.some((item) => item.status === "conflict"), "system settings backfill found conflicts");
  } finally {
    await disconnectPrisma();
  }
};

if (require.main === module) {
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
