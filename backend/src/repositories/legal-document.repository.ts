import { ContentLocale, Prisma, type PrismaClient } from "@prisma/client";
import {
  buildLegalDocumentContentHash,
  type LegalDocumentCatalogRecord,
  type LegalDocumentDraftRecord,
  type LegalDocumentLocale,
  type LegalDocumentReleaseRecord
} from "../domain/legal-document";
import { prisma } from "../prisma/client";
import { toAuditLogCreateData, type AuditLogCreateInput } from "./audit-log.repository";
import {
  isRetryableTransactionConflict,
  runWithTransactionConflictRetry
} from "../utils/transaction-conflict-retry";

const ACTIVE_KEY = "active";
const localeToDb: Record<LegalDocumentLocale, ContentLocale> = {
  "zh-CN": ContentLocale.ZH_CN,
  "zh-TW": ContentLocale.ZH_TW,
  ja: ContentLocale.JA,
  en: ContentLocale.EN,
  ko: ContentLocale.KO
};
const dbToLocale: Record<ContentLocale, LegalDocumentLocale> = {
  [ContentLocale.ZH_CN]: "zh-CN",
  [ContentLocale.ZH_TW]: "zh-TW",
  [ContentLocale.JA]: "ja",
  [ContentLocale.EN]: "en",
  [ContentLocale.KO]: "ko"
};

const documentSelect = Prisma.validator<Prisma.LegalDocumentSelect>()({
  id: true,
  publicId: true,
  slug: true,
  name: true,
  internalPath: true,
  displayLocations: true,
  isEnabled: true,
  lockVersion: true,
  createdByUserId: true,
  updatedByUserId: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true
});
const draftSelect = Prisma.validator<Prisma.LegalDocumentDraftSelect>()({
  documentId: true,
  locale: true,
  title: true,
  body: true,
  lockVersion: true,
  updatedAt: true
});
const releaseSelect = Prisma.validator<Prisma.LegalDocumentReleaseSelect>()({
  publicId: true,
  documentId: true,
  locale: true,
  version: true,
  title: true,
  body: true,
  contentHash: true,
  publishedAt: true,
  publishedByUserId: true
});

type DocumentRow = Prisma.LegalDocumentGetPayload<{ select: typeof documentSelect }>;
type DraftRow = Prisma.LegalDocumentDraftGetPayload<{ select: typeof draftSelect }>;
type ReleaseRow = Prisma.LegalDocumentReleaseGetPayload<{ select: typeof releaseSelect }>;

export type LegalDocumentMutationResult<T> =
  | { kind: "ok"; value: T }
  | { kind: "not_found" }
  | { kind: "version_conflict" }
  | { kind: "slug_conflict" };

export interface LegalDocumentCreateInput {
  actorUserId: number;
  document: {
    slug: string;
    name: string;
    internalPath: string;
    displayLocations: string[];
    isEnabled: boolean;
  };
  audit: AuditLogCreateInput;
}

export interface LegalDocumentMetadataInput {
  publicId: string;
  expectedLockVersion: number;
  actorUserId: number;
  changes: {
    name: string;
    internalPath: string;
    displayLocations: string[];
    isEnabled: boolean;
  };
  audit: AuditLogCreateInput;
}

export interface LegalDocumentDraftInput {
  publicId: string;
  locale: LegalDocumentLocale;
  expectedLockVersion: number | null;
  actorUserId: number;
  title: string;
  body: string;
  audit: AuditLogCreateInput;
}

export interface LegalDocumentPublishInput {
  publicId: string;
  locale: LegalDocumentLocale;
  expectedDraftLockVersion: number;
  actorUserId: number;
  publishedAt: Date;
  setEnabled?: boolean;
  audit: AuditLogCreateInput;
}

export interface PublicLegalDocumentRecord extends LegalDocumentReleaseRecord {
  slug: string;
  internalPath: string;
  displayLocations: string[];
}

export interface LegalDocumentRepositoryPort {
  list(input: { skip: number; take: number }): Promise<{ list: LegalDocumentCatalogRecord[]; total: number }>;
  createWithAudit(input: LegalDocumentCreateInput): Promise<LegalDocumentMutationResult<LegalDocumentCatalogRecord>>;
  getByPublicId(publicId: string): Promise<LegalDocumentCatalogRecord | null>;
  updateMetadataWithAudit(input: LegalDocumentMetadataInput): Promise<LegalDocumentMutationResult<LegalDocumentCatalogRecord>>;
  getLocale(documentId: number, locale: LegalDocumentLocale): Promise<{
    draft: LegalDocumentDraftRecord | null;
    currentRelease: LegalDocumentReleaseRecord | null;
  }>;
  saveDraftWithAudit(input: LegalDocumentDraftInput): Promise<LegalDocumentMutationResult<LegalDocumentDraftRecord>>;
  publishWithAudit(input: LegalDocumentPublishInput): Promise<LegalDocumentMutationResult<LegalDocumentReleaseRecord>>;
  listReleases(input: { documentId: number; locale: LegalDocumentLocale; skip: number; take: number }): Promise<{
    list: LegalDocumentReleaseRecord[];
    total: number;
  }>;
  getCurrentBySlug(slug: string, locale: LegalDocumentLocale): Promise<PublicLegalDocumentRecord | null>;
}

export class LegalDocumentRepository implements LegalDocumentRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async list(input: { skip: number; take: number }) {
    const where = { deletedAt: null } satisfies Prisma.LegalDocumentWhereInput;
    const [rows, total] = await Promise.all([
      this.client.legalDocument.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: input.skip,
        take: input.take,
        select: documentSelect
      }),
      this.client.legalDocument.count({ where })
    ]);
    return { list: rows.map((row) => this.mapDocument(row)), total };
  }

  public async createWithAudit(input: LegalDocumentCreateInput) {
    try {
      return await this.client.$transaction(async (transaction) => {
        const created = await transaction.legalDocument.create({
          data: {
            ...input.document,
            displayLocations: input.document.displayLocations,
            createdByUserId: input.actorUserId,
            updatedByUserId: input.actorUserId
          },
          select: documentSelect
        });
        await transaction.auditLog.create({
          data: toAuditLogCreateData({ ...input.audit, targetId: created.id })
        });
        return { kind: "ok" as const, value: this.mapDocument(created) };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { kind: "slug_conflict" as const };
      }
      throw error;
    }
  }

  public async getByPublicId(publicId: string): Promise<LegalDocumentCatalogRecord | null> {
    const row = await this.client.legalDocument.findFirst({
      where: { publicId, deletedAt: null },
      select: documentSelect
    });
    return row ? this.mapDocument(row) : null;
  }

  public async updateMetadataWithAudit(input: LegalDocumentMetadataInput) {
    try {
      return await runWithTransactionConflictRetry(() =>
        this.client.$transaction(async (transaction) => {
          const current = await transaction.legalDocument.findFirst({
            where: { publicId: input.publicId, deletedAt: null },
            select: { id: true }
          });
          if (!current) return { kind: "not_found" as const };
          const updated = await transaction.legalDocument.updateMany({
            where: {
              id: current.id,
              lockVersion: input.expectedLockVersion,
              deletedAt: null
            },
            data: {
              ...input.changes,
              displayLocations: input.changes.displayLocations,
              updatedByUserId: input.actorUserId,
              lockVersion: { increment: 1 }
            }
          });
          if (updated.count !== 1) return { kind: "version_conflict" as const };
          const row = await transaction.legalDocument.findUniqueOrThrow({
            where: { id: current.id },
            select: documentSelect
          });
          await transaction.auditLog.create({
            data: toAuditLogCreateData({ ...input.audit, targetId: current.id })
          });
          return { kind: "ok" as const, value: this.mapDocument(row) };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      );
    } catch (error) {
      if (
        isRetryableTransactionConflict(error) ||
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      ) {
        return { kind: "version_conflict" as const };
      }
      throw error;
    }
  }

  public async getLocale(documentId: number, locale: LegalDocumentLocale) {
    const dbLocale = localeToDb[locale];
    const [draft, release] = await Promise.all([
      this.client.legalDocumentDraft.findFirst({
        where: { documentId, locale: dbLocale, deletedAt: null },
        select: draftSelect
      }),
      this.client.legalDocumentRelease.findFirst({
        where: { documentId, locale: dbLocale, activeKey: ACTIVE_KEY, deletedAt: null },
        select: releaseSelect
      })
    ]);
    return {
      draft: draft ? this.mapDraft(draft) : null,
      currentRelease: release ? this.mapRelease(release) : null
    };
  }

  public async saveDraftWithAudit(input: LegalDocumentDraftInput) {
    try {
      return await runWithTransactionConflictRetry(() =>
        this.client.$transaction(async (transaction) => {
          const document = await transaction.legalDocument.findFirst({
            where: { publicId: input.publicId, deletedAt: null },
            select: { id: true }
          });
          if (!document) return { kind: "not_found" as const };
          const dbLocale = localeToDb[input.locale];
          await transaction.$queryRaw(
            Prisma.sql`SELECT id FROM legal_document_drafts WHERE document_id = ${document.id} AND locale = ${input.locale} FOR UPDATE`
          );
          const current = await transaction.legalDocumentDraft.findFirst({
            where: { documentId: document.id, locale: dbLocale, deletedAt: null },
            select: { id: true, lockVersion: true }
          });
          let row: DraftRow;
          if (!current) {
            if (input.expectedLockVersion !== null) return { kind: "version_conflict" as const };
            row = await transaction.legalDocumentDraft.create({
              data: {
                documentId: document.id,
                locale: dbLocale,
                title: input.title,
                body: input.body,
                updatedByUserId: input.actorUserId
              },
              select: draftSelect
            });
          } else {
            if (current.lockVersion !== input.expectedLockVersion) {
              return { kind: "version_conflict" as const };
            }
            row = await transaction.legalDocumentDraft.update({
              where: { id: current.id },
              data: {
                title: input.title,
                body: input.body,
                updatedByUserId: input.actorUserId,
                lockVersion: { increment: 1 }
              },
              select: draftSelect
            });
          }
          await transaction.auditLog.create({
            data: toAuditLogCreateData({
              ...input.audit,
              targetId: document.id,
              metadata: {
                ...(input.audit.metadata as Record<string, unknown> | undefined),
                draftLockVersion: row.lockVersion
              }
            })
          });
          return { kind: "ok" as const, value: this.mapDraft(row) };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      );
    } catch (error) {
      if (
        isRetryableTransactionConflict(error) ||
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      ) {
        return { kind: "version_conflict" as const };
      }
      throw error;
    }
  }

  public async publishWithAudit(input: LegalDocumentPublishInput) {
    try {
      return await runWithTransactionConflictRetry(() =>
        this.client.$transaction(async (transaction) => {
          const document = await transaction.legalDocument.findFirst({
            where: { publicId: input.publicId, deletedAt: null },
            select: { id: true }
          });
          if (!document) return { kind: "not_found" as const };
          const dbLocale = localeToDb[input.locale];
          await transaction.$queryRaw(
            Prisma.sql`SELECT id FROM legal_document_drafts WHERE document_id = ${document.id} AND locale = ${input.locale} FOR UPDATE`
          );
          const draft = await transaction.legalDocumentDraft.findFirst({
            where: { documentId: document.id, locale: dbLocale, deletedAt: null },
            select: draftSelect
          });
          if (!draft) return { kind: "not_found" as const };
          if (draft.lockVersion !== input.expectedDraftLockVersion) {
            return { kind: "version_conflict" as const };
          }
          const latest = await transaction.legalDocumentRelease.findFirst({
            where: { documentId: document.id, locale: dbLocale, deletedAt: null },
            orderBy: [{ version: "desc" }, { id: "desc" }],
            select: { version: true }
          });
          await transaction.legalDocumentRelease.updateMany({
            where: {
              documentId: document.id,
              locale: dbLocale,
              activeKey: ACTIVE_KEY,
              deletedAt: null
            },
            data: { activeKey: null }
          });
          const release = await transaction.legalDocumentRelease.create({
            data: {
              documentId: document.id,
              locale: dbLocale,
              version: (latest?.version ?? 0) + 1,
              activeKey: ACTIVE_KEY,
              title: draft.title,
              body: draft.body,
              contentHash: buildLegalDocumentContentHash(input.locale, draft.title, draft.body),
              publishedAt: input.publishedAt,
              publishedByUserId: input.actorUserId
            },
            select: releaseSelect
          });
          if (input.setEnabled !== undefined) {
            await transaction.legalDocument.update({
              where: { id: document.id },
              data: {
                isEnabled: input.setEnabled,
                updatedByUserId: input.actorUserId,
                lockVersion: { increment: 1 }
              }
            });
          }
          await transaction.auditLog.create({
            data: toAuditLogCreateData({
              ...input.audit,
              targetId: document.id,
              metadata: {
                ...(input.audit.metadata as Record<string, unknown> | undefined),
                releasePublicId: release.publicId,
                releaseVersion: release.version,
                contentHash: release.contentHash
              }
            })
          });
          return { kind: "ok" as const, value: this.mapRelease(release) };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      );
    } catch (error) {
      if (
        isRetryableTransactionConflict(error) ||
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      ) {
        return { kind: "version_conflict" as const };
      }
      throw error;
    }
  }

  public async listReleases(input: {
    documentId: number;
    locale: LegalDocumentLocale;
    skip: number;
    take: number;
  }) {
    const where = {
      documentId: input.documentId,
      locale: localeToDb[input.locale],
      deletedAt: null
    } satisfies Prisma.LegalDocumentReleaseWhereInput;
    const [rows, total] = await Promise.all([
      this.client.legalDocumentRelease.findMany({
        where,
        orderBy: [{ version: "desc" }, { id: "desc" }],
        skip: input.skip,
        take: input.take,
        select: releaseSelect
      }),
      this.client.legalDocumentRelease.count({ where })
    ]);
    return { list: rows.map((row) => this.mapRelease(row)), total };
  }

  public async getCurrentBySlug(
    slug: string,
    locale: LegalDocumentLocale
  ): Promise<PublicLegalDocumentRecord | null> {
    const row = await this.client.legalDocument.findFirst({
      where: { slug, isEnabled: true, deletedAt: null },
      select: {
        slug: true,
        internalPath: true,
        displayLocations: true,
        releases: {
          where: { locale: localeToDb[locale], activeKey: ACTIVE_KEY, deletedAt: null },
          take: 1,
          select: releaseSelect
        }
      }
    });
    const release = row?.releases[0];
    if (!row || !release) return null;
    return {
      ...this.mapRelease(release),
      slug: row.slug,
      internalPath: row.internalPath,
      displayLocations: this.stringArray(row.displayLocations)
    };
  }

  private mapDocument(row: DocumentRow): LegalDocumentCatalogRecord {
    return { ...row, displayLocations: this.stringArray(row.displayLocations) };
  }

  private mapDraft(row: DraftRow): LegalDocumentDraftRecord {
    return { ...row, locale: dbToLocale[row.locale] };
  }

  private mapRelease(row: ReleaseRow): LegalDocumentReleaseRecord {
    return { ...row, locale: dbToLocale[row.locale] };
  }

  private stringArray(value: Prisma.JsonValue): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  }
}
