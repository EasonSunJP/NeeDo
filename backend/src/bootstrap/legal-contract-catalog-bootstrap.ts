import { ContentLocale, type Prisma } from "@prisma/client";
import {
  LEGAL_DOCUMENT_BOOTSTRAP,
  type SupportedContractLanguage
} from "./legal-document-bootstrap";
import { buildLegalDocumentContentHash } from "../domain/legal-document";

const localeToDb: Record<SupportedContractLanguage, ContentLocale> = {
  "zh-CN": ContentLocale.ZH_CN,
  ja: ContentLocale.JA,
  en: ContentLocale.EN
};

const sameStrings = (left: Prisma.JsonValue, right: readonly string[]) =>
  Array.isArray(left) && JSON.stringify(left) === JSON.stringify(right);

const assertExact: (condition: unknown, message: string) => void = (condition, message) => {
  if (!condition) throw new Error(message);
};

export interface LegalContractProvisioningResult {
  documents: number;
  releases: number;
  createdDocuments: number;
  createdReleases: number;
}

export const provisionLegalContractCatalog = async (
  tx: Prisma.TransactionClient,
  actorId: number
): Promise<LegalContractProvisioningResult> => {
  let createdDocuments = 0;
  let createdReleases = 0;

  for (const source of LEGAL_DOCUMENT_BOOTSTRAP) {
    let document = await tx.legalDocument.findFirst({
      where: { slug: source.slug, deletedAt: null }
    });
    if (!document) {
      document = await tx.legalDocument.create({
        data: {
          slug: source.slug,
          name: source.name,
          internalPath: source.internalPath,
          displayLocations: [...source.displayLocations],
          isEnabled: source.isEnabled,
          createdByUserId: actorId,
          updatedByUserId: actorId
        }
      });
      createdDocuments += 1;
      await tx.auditLog.create({
        data: {
          actorId,
          action: "staging.legal_contract_document.provision",
          targetType: "LegalDocument",
          targetId: document.id,
          metadata: { slug: source.slug }
        }
      });
    } else {
      assertExact(
        document.name === source.name &&
          document.internalPath === source.internalPath &&
          document.isEnabled === source.isEnabled &&
          sameStrings(document.displayLocations, source.displayLocations),
        `STAGING_LEGAL_CONTRACT_DOCUMENT_CONFLICT:${source.slug}`
      );
    }

    for (const locale of Object.keys(source.bodies) as SupportedContractLanguage[]) {
      const dbLocale = localeToDb[locale];
      const title = source.titles[locale];
      const body = source.bodies[locale];
      const contentHash = buildLegalDocumentContentHash(locale, title, body);
      const draft = await tx.legalDocumentDraft.findFirst({
        where: { documentId: document.id, locale: dbLocale, deletedAt: null }
      });
      if (!draft) {
        await tx.legalDocumentDraft.create({
          data: {
            documentId: document.id,
            locale: dbLocale,
            title,
            body,
            updatedByUserId: actorId
          }
        });
      } else {
        assertExact(
          draft.title === title && draft.body === body,
          `STAGING_LEGAL_CONTRACT_DRAFT_CONFLICT:${source.slug}:${locale}`
        );
      }

      const releases = await tx.legalDocumentRelease.findMany({
        where: { documentId: document.id, locale: dbLocale, deletedAt: null },
        orderBy: [{ version: "asc" }, { id: "asc" }]
      });
      if (releases.length === 0) {
        const release = await tx.legalDocumentRelease.create({
          data: {
            documentId: document.id,
            locale: dbLocale,
            version: 1,
            activeKey: "active",
            title,
            body,
            contentHash,
            publishedAt: source.publishedAt,
            publishedByUserId: actorId
          }
        });
        createdReleases += 1;
        await tx.auditLog.create({
          data: {
            actorId,
            action: "staging.legal_contract_release.provision",
            targetType: "LegalDocument",
            targetId: document.id,
            metadata: {
              slug: source.slug,
              locale,
              releasePublicId: release.publicId,
              version: 1,
              contentHash
            }
          }
        });
      } else {
        const active = releases.find((release) => release.activeKey === "active");
        assertExact(
          releases.length === 1 &&
            active?.version === 1 &&
            active.title === title &&
            active.body === body &&
            active.contentHash === contentHash &&
            active.publishedAt.getTime() === source.publishedAt.getTime(),
          `STAGING_LEGAL_CONTRACT_RELEASE_CONFLICT:${source.slug}:${locale}`
        );
      }
    }
  }

  return {
    documents: LEGAL_DOCUMENT_BOOTSTRAP.length,
    releases: LEGAL_DOCUMENT_BOOTSTRAP.reduce(
      (total, source) => total + Object.keys(source.bodies).length,
      0
    ),
    createdDocuments,
    createdReleases
  };
};
