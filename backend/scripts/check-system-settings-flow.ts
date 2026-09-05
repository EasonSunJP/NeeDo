import { randomUUID } from "node:crypto";
import { buildLegalDocumentContentHash } from "../src/domain/legal-document";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import { LegalDocumentService } from "../src/services/legal-document.service";
import { PlatformSettingsRepository } from "../src/repositories/platform-settings.repository";
import { PlatformSettingsResolver } from "../src/services/platform-settings.resolver";
import { PlatformSettingsService } from "../src/services/platform-settings.service";
import {
  SYSTEM_LEGAL_DOCUMENT_SOURCES,
  LEGAL_DOCUMENT_LOCALE_TO_DB,
  assertNonProductionLocalDatabase
} from "./backfill-system-settings";

const assert: (condition: unknown, message: string) => asserts condition = (
  condition,
  message
) => {
  if (!condition) throw new Error(message);
};

const expectErrorMessage = async (
  operation: () => Promise<unknown>,
  expectedMessage: string
): Promise<void> => {
  let caught: unknown;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof Error && caught.message === expectedMessage, `expected ${expectedMessage}`);
};

export class RollbackVerifiedSystemSettingsFlow extends Error {}

const globalOperator: AuthenticatedAccessContext = {
  userId: 1,
  email: "system-settings-check@needo.test",
  accessTokenJti: "system-settings-check",
  accessTokenExpiresAt: Date.now() + 60_000,
  currentIdentityId: 1,
  currentPublicId: "needo0000000001",
  currentIdentityType: "operator",
  currentIdentityScopeType: "global",
  currentIdentityScopeId: null,
  roles: ["operator"],
  permissions: [
    "backoffice:system-settings:read",
    "backoffice:legal-documents:read",
    "backoffice:legal-documents:write",
    "backoffice:legal-documents:publish"
  ]
};

const main = async (): Promise<void> => {
  const target = assertNonProductionLocalDatabase();
  process.env.ENV_FILE = target.envFile;
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");
  const marker = `system-settings-check-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const requestContext = { ip: "127.0.0.1", userAgent: marker };

  try {
    const tables = await prisma.$queryRaw<Array<{ tableName: string }>>`
      SELECT TABLE_NAME AS tableName
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (
          'platform_setting_versions',
          'legal_documents',
          'legal_document_drafts',
          'legal_document_releases'
        )
    `;
    assert(tables.length === 4, "system settings migration is not physically applied");

    const repository = new PlatformSettingsRepository(prisma);
    const resolver = new PlatformSettingsResolver(repository);
    const platformService = new PlatformSettingsService(
      repository,
      resolver,
      { createInput: () => { throw new Error("read-only checker must not create settings audit input"); } }
    );
    const publicSettings = await platformService.getPublic();
    assert(
      publicSettings.paymentMethods.every((method) => method === "cash" || method === "ndp"),
      "payment filtering exposed an unconfigured provider"
    );

    const policy = await prisma.imPolicy.findFirst({
      where: { activeKey: "active", deletedAt: null },
      select: { textRetentionSeconds: true, imageRetentionSeconds: true, videoRetentionSeconds: true }
    });
    assert(policy?.textRetentionSeconds === 30 * 86_400, "prospective message retention is not 30 days");
    assert(
      policy.imageRetentionSeconds === 3 * 86_400 && policy.videoRetentionSeconds === 3 * 86_400,
      "prospective media retention is not 3 days"
    );
    const serverRetentionAuditReason: string = "SERVER_RETENTION_EXPIRED";
    assert(serverRetentionAuditReason !== "message.deleted", "server retention must not be a device deletion command");

    const conflictService = new LegalDocumentService(
      {
        saveDraftWithAudit: async () => ({ kind: "version_conflict" })
      } as never,
      { createInput: (input: unknown) => input } as never
    );
    await expectErrorMessage(
      () =>
        conflictService.saveDraft(globalOperator, requestContext, randomUUID(), "ja", {
          expectedLockVersion: 99,
          title: "stale",
          body: "stale"
        }),
      "error.legal_document.version_conflict"
    );
    await expectErrorMessage(
      () =>
        conflictService.getLocale(
          { ...globalOperator, currentIdentityScopeType: "shop" },
          randomUUID(),
          "ja"
        ),
      "error.identity.forbidden"
    );

    try {
      await prisma.$transaction(async (transaction) => {
        const document = await transaction.legalDocument.create({
          data: {
            slug: marker,
            name: marker,
            internalPath: `/me/settings/${marker}`,
            displayLocations: ["settings-check"],
            isEnabled: false
          }
        });
        const title = `${marker} title`;
        const body = `${marker} body must not enter audit metadata`;
        const draft = await transaction.legalDocumentDraft.create({
          data: { documentId: document.id, locale: "JA", title, body }
        });
        const release = await transaction.legalDocumentRelease.create({
          data: {
            documentId: document.id,
            locale: "JA",
            version: 1,
            activeKey: "active",
            title: draft.title,
            body: draft.body,
            contentHash: buildLegalDocumentContentHash("ja", draft.title, draft.body),
            publishedAt: new Date()
          }
        });
        const audit = await transaction.auditLog.create({
          data: {
            actorId: null,
            action: "system.settings.flow.checked",
            targetType: "LegalDocument",
            targetId: document.id,
            ip: null,
            userAgent: null,
            metadata: {
              marker,
              releasePublicId: release.publicId,
              contentHash: release.contentHash
            }
          }
        });
        assert(!JSON.stringify(audit.metadata).includes(body), "legal audit metadata exposed a document body");
        throw new RollbackVerifiedSystemSettingsFlow(marker);
      });
      throw new Error("rollback sentinel was not raised");
    } catch (error) {
      if (!(error instanceof RollbackVerifiedSystemSettingsFlow)) throw error;
    }

    const residue = await prisma.legalDocument.count({ where: { slug: marker } });
    assert(residue === 0, "marker residue remained after rollback");

    for (const source of SYSTEM_LEGAL_DOCUMENT_SOURCES) {
      const document = await prisma.legalDocument.findFirst({
        where: { slug: source.slug, deletedAt: null },
        select: { id: true, isEnabled: true }
      });
      assert(document, `missing backfilled document: ${source.slug}`);
      for (const [locale, expected] of Object.entries(source.releases)) {
        if (!expected) continue;
        const release = await prisma.legalDocumentRelease.findFirst({
          where: {
            documentId: document.id,
            locale: LEGAL_DOCUMENT_LOCALE_TO_DB[locale as keyof typeof LEGAL_DOCUMENT_LOCALE_TO_DB],
            activeKey: "active",
            deletedAt: null
          }
        });
        assert(release, `missing release: ${source.slug}/${locale}`);
        assert(
          release.contentHash === buildLegalDocumentContentHash(
            locale as keyof typeof LEGAL_DOCUMENT_LOCALE_TO_DB,
            expected.title,
            expected.body
          ),
          `release hash conflict: ${source.slug}/${locale}`
        );
      }
    }

    console.log(JSON.stringify({
      databaseTarget: target.maskedDatabaseTarget,
      safety: "local-only rollback",
      paymentMethods: publicSettings.paymentMethods,
      legalSourcesVerified: SYSTEM_LEGAL_DOCUMENT_SOURCES.length,
      residue
    }, null, 2));
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
