import { z } from "zod";

export const officialNoticeLocales = ["zh-CN", "zh-TW", "en", "ja", "ko"] as const;
export const officialNoticeLevels = ["general", "important", "urgent"] as const;
export const officialNoticeStatuses = [
  "draft",
  "pending_review",
  "approved",
  "scheduled",
  "sending",
  "sent",
  "cancelled",
  "archived"
] as const;
export const officialNoticeIdentityTypes = [
  "customer",
  "technician",
  "merchant_owner",
  "merchant_staff",
  "platform",
  "platform_admin",
  "scout"
] as const;

const blockTypes = [
  "paragraph",
  "heading",
  "subheading",
  "bullet",
  "numbered",
  "quote",
  "callout",
  "divider",
  "image",
  "video",
  "file"
] as const;
const mediaBlockTypes = new Set<string>(["image", "video", "file"]);
const safeResourceUrl = /^(?:https:\/\/[^\s]+|\/media\/content\/[a-f0-9]{64}\.(?:jpg|png|webp))$/u;

export const officialNoticeBlockSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[A-Za-z0-9._:-]+$/u),
    type: z.enum(blockTypes),
    content: z.string().max(20_000),
    caption: z.string().trim().max(255).optional(),
    fileName: z.string().trim().max(255).optional(),
    fileSize: z
      .number()
      .int()
      .positive()
      .max(50 * 1024 * 1024)
      .optional(),
    mimeType: z.string().trim().max(100).optional(),
    source: z.enum(["url", "media"]).optional(),
    mediaAssetId: z.number().int().positive().optional()
  })
  .strict()
  .superRefine((block, context) => {
    if (block.type === "divider") {
      if (block.content !== "") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "error.official_notice.block_invalid"
        });
      }
      return;
    }
    if (!block.content.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "error.official_notice.block_invalid"
      });
      return;
    }
    if (mediaBlockTypes.has(block.type)) {
      if (!safeResourceUrl.test(block.content.trim())) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "error.official_notice.media_invalid"
        });
      }
      if (block.source === "media" && !block.mediaAssetId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "error.official_notice.media_invalid"
        });
      }
      if (block.source === "url" && block.mediaAssetId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "error.official_notice.media_invalid"
        });
      }
    } else if (
      block.source ||
      block.mediaAssetId ||
      block.fileName ||
      block.fileSize ||
      block.mimeType
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "error.official_notice.block_invalid"
      });
    }
  });

const audienceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("all") }).strict(),
  z
    .object({
      type: z.literal("identity_types"),
      identityTypes: z.array(z.enum(officialNoticeIdentityTypes)).min(1).max(7)
    })
    .strict(),
  z
    .object({
      type: z.literal("exact_users"),
      userIds: z.array(z.number().int().positive()).min(1).max(500)
    })
    .strict()
]);

export const merchantNoticeAudienceTypes = ["shop_card_holders", "shop_employees", "shop_technicians"] as const;
const merchantAudienceSchema = z.object({ type: z.enum(merchantNoticeAudienceTypes) }).strict();

const noticeCreateBaseSchema = z
  .object({
    sourceLocale: z.enum(officialNoticeLocales),
    level: z.enum(officialNoticeLevels),
    title: z.string().trim().min(1).max(160),
    summary: z.string().trim().min(1).max(500),
    blocks: z.array(officialNoticeBlockSchema).min(1).max(80),
    audience: audienceSchema,
    sendMode: z.enum(["now", "scheduled"]),
    scheduledAt: z.string().datetime({ offset: true }).nullable(),
    idempotencyKey: z
      .string()
      .trim()
      .min(8)
      .max(191)
      .regex(/^[A-Za-z0-9._:-]+$/u)
  })
  .strict();
const validateSendMode = (value: { sendMode: string; scheduledAt: string | null }, context: z.RefinementCtx) => {
    if (value.sendMode === "scheduled" && !value.scheduledAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduledAt"],
        message: "error.official_notice.schedule_required"
      });
    }
    if (value.sendMode === "now" && value.scheduledAt !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduledAt"],
        message: "error.official_notice.schedule_forbidden"
      });
    }
  };
export const officialNoticeCreateBodySchema = noticeCreateBaseSchema.superRefine(validateSendMode);
export const merchantNoticeCreateBodySchema = noticeCreateBaseSchema
  .extend({ audience: merchantAudienceSchema }).superRefine(validateSendMode);

const paginationShape = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
};

export const officialNoticeListQuerySchema = z
  .object({
    ...paginationShape,
    search: z.string().trim().min(1).max(100).optional(),
    status: z.enum(officialNoticeStatuses).optional(),
    level: z.enum(officialNoticeLevels).optional()
  })
  .strict();

export const officialNoticeReadQuerySchema = z
  .object({
    ...paginationShape,
    locale: z.enum(officialNoticeLocales),
    unreadOnly: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .default("false")
  })
  .strict();

export const officialNoticePublicIdParamSchema = z.object({ publicId: z.string().uuid() }).strict();

export const officialNoticeLifecycleBodySchema = z
  .object({
    expectedLockVersion: z.number().int().positive(),
    reason: z.string().trim().min(2).max(500),
    idempotencyKey: z
      .string()
      .trim()
      .min(8)
      .max(191)
      .regex(/^[A-Za-z0-9._:-]+$/u)
  })
  .strict();

export type OfficialNoticeBlockInput = z.infer<typeof officialNoticeBlockSchema>;
export type OfficialNoticeAudienceInput = z.infer<typeof audienceSchema>;
export type MerchantNoticeAudienceInput = z.infer<typeof merchantAudienceSchema>;
export type NoticeAudienceInput = OfficialNoticeAudienceInput | MerchantNoticeAudienceInput;
export type MerchantNoticeCreateBody = z.infer<typeof merchantNoticeCreateBodySchema>;
export type OfficialNoticeCreateBody = z.infer<typeof officialNoticeCreateBodySchema>;
export type OfficialNoticeListQuery = z.infer<typeof officialNoticeListQuerySchema>;
export type OfficialNoticeReadQuery = z.infer<typeof officialNoticeReadQuerySchema>;
export type OfficialNoticeLifecycleBody = z.infer<typeof officialNoticeLifecycleBodySchema>;
