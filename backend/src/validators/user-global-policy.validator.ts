import { z } from "zod";

const japanOffsetTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?\+09:00$/;

const japanTimestampSchema = z
  .union([z.string().regex(japanOffsetTimestampPattern), z.date()])
  .transform((value, context) => {
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid Japan timestamp" });
      return z.NEVER;
    }
    return parsed;
  });

export const userGlobalPolicyDraftBodySchema = z
  .object({
    expectedCurrentVersion: z.number().int().positive(),
    expectedDraftLockVersion: z.number().int().positive().nullable(),
    requirePhone: z.boolean(),
    requireEmail: z.boolean(),
    requireHomeServiceEkyc: z.boolean(),
    requireStoreServiceEkyc: z.boolean(),
    requireMerchantApplicationEkyc: z.boolean(),
    requireTechnicianApplicationEkyc: z.boolean(),
    ndpPerBaseExp: z.number().int().positive().max(1_000_000),
    baseExpUnitsPerThreshold: z.number().int().positive().max(1_000_000_000),
    effectiveFrom: japanTimestampSchema
  })
  .strict();

export const versionPublishBodySchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    expectedLockVersion: z.number().int().positive()
  })
  .strict();

export const userGlobalPolicyPublishBodySchema = versionPublishBodySchema.extend({
  effectiveImmediately: z.boolean().optional()
});

export const ndpExperienceCampaignListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20)
  })
  .strict();

export const ndpExperienceCampaignDraftBodySchema = z
  .object({
    expectedPublishedVersion: z.number().int().min(0),
    expectedDraftLockVersion: z.number().int().positive().nullable(),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).nullable(),
    factorBps: z.number().int().positive().max(1_000_000),
    effectiveFrom: japanTimestampSchema,
    effectiveTo: japanTimestampSchema
  })
  .strict()
  .superRefine((value, context) => {
    if (value.effectiveFrom.getTime() >= value.effectiveTo.getTime()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["effectiveTo"],
        message: "Campaign end must be after start"
      });
    }
  });

export const ndpExperienceCampaignParamSchema = z.object({
  versionPublicId: z.string().trim().min(1).max(64)
});

export const ndpExperienceCampaignArchiveBodySchema = versionPublishBodySchema.extend({
  reason: z.string().trim().min(1).max(500)
});
