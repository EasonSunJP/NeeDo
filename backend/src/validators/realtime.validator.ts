import { z } from "zod";
import { IM_PRIVACY_TTL_MAX_SECONDS, IM_PRIVACY_TTL_MIN_SECONDS } from "../constants/im-privacy";
import { MESSAGE_JUDGEMENT_REACTIONS } from "../constants/message-reaction.constants";
import { messageIdsSchema, safePositiveIntegerSchema } from "./im-chat-record.validator";

const paginationQuerySchema = {
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional()
};

const booleanQuerySchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return value;
}, z.boolean());

export const conversationIdParamSchema = z.object({
  conversationId: safePositiveIntegerSchema
});

export const messageReactionParamSchema = conversationIdParamSchema.extend({
  messageId: z.coerce.number().int().positive()
});

export const messageRecallParamSchema = conversationIdParamSchema.extend({
  messageId: z.coerce.number().int().positive()
});

export const messageDeleteParamSchema = conversationIdParamSchema.extend({
  messageId: z.coerce.number().int().positive()
});

export const friendRequestIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const notificationIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const socialPostIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const socialUserIdParamSchema = z.object({
  userId: z.coerce.number().int().positive()
});

export const followTargetParamSchema = z.object({
  targetUserId: z.coerce.number().int().positive()
});

export const conversationListQuerySchema = z.object({
  ...paginationQuerySchema
});

const conversationPrivacyFields = {
  privacyModeEnabled: z.boolean().optional(),
  hideMemberProfiles: z.boolean().optional(),
  disappearingTtlSeconds: z.coerce
    .number()
    .int()
    .min(IM_PRIVACY_TTL_MIN_SECONDS)
    .max(IM_PRIVACY_TTL_MAX_SECONDS)
    .nullable()
    .optional(),
  disappearingStartMode: z.enum(["sent", "read_by_all"]).optional()
};

export const conversationCreateBodySchema = z
  .object({
    type: z.enum(["direct", "group"]).default("direct"),
    title: z.string().trim().min(1).max(120).optional(),
    participantUserIds: z.array(z.coerce.number().int().positive()).min(1).max(50),
    ...conversationPrivacyFields
  })
  .superRefine((value, context) => {
    if (value.privacyModeEnabled && value.type !== "group") {
      context.addIssue({ code: "custom", message: "Privacy mode is only available for groups" });
    }
    if (value.privacyModeEnabled && !value.disappearingTtlSeconds) {
      context.addIssue({ code: "custom", message: "A disappearing countdown is required" });
    }
  });

export const conversationPrivacyBodySchema = z
  .object({
    privacyModeEnabled: z.boolean(),
    hideMemberProfiles: z.boolean().optional(),
    disappearingTtlSeconds: conversationPrivacyFields.disappearingTtlSeconds,
    disappearingStartMode: conversationPrivacyFields.disappearingStartMode
  })
  .superRefine((value, context) => {
    if (value.privacyModeEnabled && !value.disappearingTtlSeconds) {
      context.addIssue({ code: "custom", message: "A disappearing countdown is required" });
    }
  });

export const conversationPreferencesBodySchema = z
  .object({
    isPinned: z.boolean().optional(),
    isMuted: z.boolean().optional(),
    autoTranslateMessages: z.boolean().optional()
  })
  .refine(
    (value) =>
      value.isPinned !== undefined ||
      value.isMuted !== undefined ||
      value.autoTranslateMessages !== undefined,
    { message: "At least one conversation preference is required" }
  );

export const conversationLeaveBodySchema = z.object({
  transferOwnerUserId: z.coerce.number().int().positive().optional()
});

export const messageListQuerySchema = z.object({
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  beforeId: z.coerce.number().int().positive().optional()
});

export const contactCardCandidateListQuerySchema = z
  .object({
    ...paginationQuerySchema,
    query: z.string().trim().max(100).optional()
  })
  .strict();

export const contactCardSendBodySchema = z
  .object({
    targetUserId: z
      .string()
      .trim()
      .regex(/^u[0-9]{10}$/u)
  })
  .strict();

export const contactCardIdempotencyKeySchema = z.string().trim().min(8).max(191);

export const messageCreateBodySchema = z.object({
  type: z.enum(["text", "system", "orderStatus"]).default("text"),
  content: z.string().trim().min(1).max(4000),
  metadata: z.record(z.unknown()).optional()
});

export const messageReactionBodySchema = z.object({
  emoji: z.string().trim().min(1).max(32)
});

export const messageRecallBodySchema = z.object({
  mode: z.literal("standard")
});

export const messageBatchDeleteBodySchema = z
  .object({
    messageIds: messageIdsSchema,
    idempotencyKey: z.string().uuid()
  })
  .strict();

export const contactListQuerySchema = z.object({
  ...paginationQuerySchema
});

export const directorySearchQuerySchema = z.object({
  ...paginationQuerySchema,
  query: z.string().trim().min(1).max(100)
});

export const directoryUserIdParamSchema = z.object({
  userId: z.coerce.number().int().positive()
});

export const contactIdParamSchema = z.object({
  contactId: z.coerce.number().int().positive()
});

export const friendRequestListQuerySchema = z.object({
  ...paginationQuerySchema,
  status: z.enum(["pending", "accepted", "rejected", "expired"]).optional(),
  direction: z.enum(["incoming", "outgoing", "all"]).default("all")
});

export const friendRequestCreateBodySchema = z.object({
  targetUserId: z.coerce.number().int().positive(),
  message: z.string().trim().max(300).optional()
});

export const socialPostListQuerySchema = z.object({
  ...paginationQuerySchema,
  authorUserId: z.coerce.number().int().positive().optional(),
  replyToPostId: z.coerce.number().int().positive().optional(),
  bookmarked: booleanQuerySchema.optional()
});

export const socialPostShareBodySchema = z
  .object({
    targetUserIds: z
      .array(z.coerce.number().int().positive())
      .min(1)
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "error.social.duplicate_share_target"
      })
  })
  .strict();

export const socialPostIdempotencyKeySchema = z.string().trim().min(8).max(191);

const socialCreateMediaItemSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    type: z.literal("image"),
    mediaAssetPublicId: z.string().regex(/^[a-f0-9]{64}$/u),
    alt: z.string().trim().max(255).optional()
  })
  .strict();

const socialRichTextPartSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), value: z.string().min(1).max(5000) }).strict(),
  z.object({ type: z.literal("judgement"), value: z.enum(MESSAGE_JUDGEMENT_REACTIONS) }).strict()
]);

const socialRichTextSchema = z
  .object({
    version: z.literal(1),
    parts: z.array(socialRichTextPartSchema).min(1).max(100)
  })
  .strict();

const socialCreateMediaEnvelopeSchema = z
  .object({
    items: z.array(socialCreateMediaItemSchema).max(9),
    quotePostId: z.coerce.number().int().positive().optional(),
    replyToPostId: z.coerce.number().int().positive().optional(),
    repostPostId: z.coerce.number().int().positive().optional(),
    postType: z
      .enum(["post", "reply", "quote", "repost", "announcement", "technician-daily"])
      .optional(),
    locationLabel: z.string().trim().max(160).optional(),
    richText: socialRichTextSchema.optional()
  })
  .strict();

export const socialPostCreateBodySchema = z
  .object({
    content: z.string().trim().max(5000),
    media: socialCreateMediaEnvelopeSchema.optional(),
    mentionUserIds: z
      .array(z.number().int().positive())
      .max(50)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "error.social.duplicate_mention_contact"
      })
      .default([]),
    visibility: z.enum(["public", "followers"]).default("public")
  })
  .strict()
  .refine((value) => value.content.length > 0 || (value.media?.items.length ?? 0) > 0, {
    message: "error.social.post_empty",
    path: ["content"]
  })
  .superRefine((value, context) => {
    if (
      value.media?.richText &&
      value.media.richText.parts.map((part) => part.value).join("") !== value.content
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "error.social.rich_text_mismatch",
        path: ["media", "richText"]
      });
    }
  });

export const socialPostUpdateBodySchema = socialPostCreateBodySchema;

export const followCreateBodySchema = z.object({
  targetUserId: z.coerce.number().int().positive()
});

export const notificationListQuerySchema = z.object({
  ...paginationQuerySchema,
  unreadOnly: booleanQuerySchema.optional()
});

export type ConversationCreateBody = z.infer<typeof conversationCreateBodySchema>;
export type ConversationPrivacyBody = z.infer<typeof conversationPrivacyBodySchema>;
export type ConversationPreferencesBody = z.infer<typeof conversationPreferencesBodySchema>;
export type ConversationLeaveBody = z.infer<typeof conversationLeaveBodySchema>;
export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;
export type MessageCreateBody = z.infer<typeof messageCreateBodySchema>;
export type MessageListQuery = z.infer<typeof messageListQuerySchema>;
export type MessageReactionBody = z.infer<typeof messageReactionBodySchema>;
export type MessageRecallBody = z.infer<typeof messageRecallBodySchema>;
export type ContactListQuery = z.infer<typeof contactListQuerySchema>;
export type DirectorySearchQuery = z.infer<typeof directorySearchQuerySchema>;
export type DirectoryUserIdParam = z.infer<typeof directoryUserIdParamSchema>;
export type FriendRequestCreateBody = z.infer<typeof friendRequestCreateBodySchema>;
export type FriendRequestListQuery = z.infer<typeof friendRequestListQuerySchema>;
export type SocialPostCreateBody = z.infer<typeof socialPostCreateBodySchema>;
export type SocialPostUpdateBody = z.infer<typeof socialPostUpdateBodySchema>;
export type SocialPostListQuery = z.infer<typeof socialPostListQuerySchema>;
export type SocialPostShareBody = z.infer<typeof socialPostShareBodySchema>;
export type FollowCreateBody = z.infer<typeof followCreateBodySchema>;
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
