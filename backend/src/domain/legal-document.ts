import { createHash } from "node:crypto";

export const LEGAL_DOCUMENT_LOCALES = ["zh-CN", "zh-TW", "ja", "en", "ko"] as const;

export type LegalDocumentLocale = (typeof LEGAL_DOCUMENT_LOCALES)[number];

export interface LegalDocumentCatalogRecord {
  id: number;
  publicId: string;
  slug: string;
  name: string;
  internalPath: string;
  displayLocations: string[];
  isEnabled: boolean;
  lockVersion: number;
  createdByUserId: number | null;
  updatedByUserId: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface LegalDocumentReleaseRecord {
  publicId: string;
  documentId: number;
  locale: LegalDocumentLocale;
  version: number;
  title: string;
  body: string;
  contentHash: string;
  publishedAt: Date;
  publishedByUserId: number | null;
}

export interface LegalDocumentDraftRecord {
  documentId: number;
  locale: LegalDocumentLocale;
  title: string;
  body: string;
  lockVersion: number;
  updatedAt: Date;
}

export const buildLegalDocumentContentHash = (
  locale: LegalDocumentLocale,
  title: string,
  body: string
): string =>
  createHash("sha256")
    .update(JSON.stringify({ locale, title, body }), "utf8")
    .digest("hex");
