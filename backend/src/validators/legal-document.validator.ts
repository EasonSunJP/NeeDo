import { z } from "zod";
import { LEGAL_DOCUMENT_LOCALES } from "../domain/legal-document";

const publicId = z.string().uuid();
const slug = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const internalPath = z.string().trim().min(1).max(500);
const displayLocations = z.array(z.string().trim().min(1).max(64)).max(30);

export const legalDocumentListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    page_size: z.coerce.number().int().positive().max(100).default(20)
  })
  .strict();

export const legalDocumentPublicIdParamSchema = z.object({ publicId }).strict();
export const legalDocumentLocaleParamSchema = z
  .object({ publicId, locale: z.enum(LEGAL_DOCUMENT_LOCALES) })
  .strict();
export const publicLegalDocumentParamSchema = z.object({ slug }).strict();
export const publicLegalDocumentQuerySchema = z
  .object({ locale: z.enum(LEGAL_DOCUMENT_LOCALES) })
  .strict();

export const legalDocumentCreateBodySchema = z
  .object({
    slug,
    name: z.string().trim().min(1).max(160),
    internalPath,
    displayLocations,
    isEnabled: z.boolean()
  })
  .strict();

export const legalDocumentMetadataBodySchema = z
  .object({
    expectedLockVersion: z.number().int().positive(),
    name: z.string().trim().min(1).max(160),
    internalPath,
    displayLocations,
    isEnabled: z.boolean()
  })
  .strict();

export const legalDocumentDraftBodySchema = z
  .object({
    expectedLockVersion: z.number().int().positive().nullable(),
    title: z.string().trim().min(1).max(240),
    body: z.string().min(1).max(2_000_000)
  })
  .strict();

export const legalDocumentPublishBodySchema = z
  .object({
    expectedDraftLockVersion: z.number().int().positive(),
    publishedAt: z.coerce.date(),
    setEnabled: z.boolean().optional()
  })
  .strict();

export type LegalDocumentListQuery = z.infer<typeof legalDocumentListQuerySchema>;
