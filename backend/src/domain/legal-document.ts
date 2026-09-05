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
