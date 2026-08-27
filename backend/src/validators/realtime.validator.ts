import { z } from "zod";

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
  conversationId: z.coerce.number().int().positive()
});

export const messageReactionParamSchema = conversationIdParamSchema.extend({
  messageId: z.coerce.number().int().positive()
});

export const messageRecallParamSchema = conversationIdParamSchema.extend({
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

export const conversationCreateBodySchema = z.object({
  type: z.enum(["direct", "group"]).default("direct"),
  title: z.string().trim().min(1).max(120).optional(),
  participantUserIds: z.array(z.coerce.number().int().positive()).min(1).max(50)
});

export const conversationPreferencesBodySchema = z
  .object({
    isPinned: z.boolean().optional(),
    isMuted: z.boolean().optional()
  })
  .refine((value) => value.isPinned !== undefined || value.isMuted !== undefined, {
    message: "At least one conversation preference is required"
  });

export const messageListQuerySchema = z.object({
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  beforeId: z.coerce.number().int().positive().optional()
});

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

export const contactListQuerySchema = z.object({
  ...paginationQuerySchema
});

export const contactIdParamSchema = z.object({
  contactId: z.coerce.number().int().positive()
});

export const friendRequestListQuerySchema = z.object({
  ...paginationQuerySchema,
  status: z.enum(["pending", "accepted", "rejected"]).optional(),
  direction: z.enum(["incoming", "outgoing", "all"]).default("all")
});

export const friendRequestCreateBodySchema = z.object({
  targetUserId: z.coerce.number().int().positive(),
  message: z.string().trim().max(300).optional()
});

export const socialPostListQuerySchema = z.object({
  ...paginationQuerySchema,
  authorUserId: z.coerce.number().int().positive().optional()
});

const socialMediaItemSchema = z.object({
  id: z.string().trim().min(1).max(160),
  type: z.enum(["image", "video"]),
  url: z.string().trim().min(1).max(2_000).refine((value) => !value.startsWith("blob:")),
  thumbnailUrl: z.string().trim().min(1).max(2_000).optional(),
  alt: z.string().trim().max(500).optional(),
  aspectRatio: z.number().positive().max(10).optional(),
  durationLabel: z.string().trim().max(30).optional()
});

const socialMediaEnvelopeSchema = z.object({
  items: z.array(socialMediaItemSchema).max(9),
  quotePostId: z.coerce.number().int().positive().optional(),
  replyToPostId: z.coerce.number().int().positive().optional(),
  repostPostId: z.coerce.number().int().positive().optional(),
  postType: z.enum(["post", "reply", "quote", "repost", "announcement", "technician-daily"]).optional(),
  locationLabel: z.string().trim().max(160).optional(),
  counters: z.object({
    likes: z.number().int().nonnegative().optional(),
    replies: z.number().int().nonnegative().optional(),
    reposts: z.number().int().nonnegative().optional(),
    views: z.number().int().nonnegative().optional(),
    bookmarks: z.number().int().nonnegative().optional()
  }).optional()
});

export const socialPostCreateBodySchema = z.object({
  content: z.string().trim().min(1).max(5000),
  media: z.union([z.array(socialMediaItemSchema).max(9), socialMediaEnvelopeSchema]).optional(),
  visibility: z.enum(["public", "followers"]).default("public")
});

export const followCreateBodySchema = z.object({
  targetUserId: z.coerce.number().int().positive()
});

export const notificationListQuerySchema = z.object({
  ...paginationQuerySchema,
  unreadOnly: booleanQuerySchema.optional()
});

export type ConversationCreateBody = z.infer<typeof conversationCreateBodySchema>;
export type ConversationPreferencesBody = z.infer<typeof conversationPreferencesBodySchema>;
export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;
export type MessageCreateBody = z.infer<typeof messageCreateBodySchema>;
export type MessageListQuery = z.infer<typeof messageListQuerySchema>;
export type MessageReactionBody = z.infer<typeof messageReactionBodySchema>;
export type MessageRecallBody = z.infer<typeof messageRecallBodySchema>;
export type ContactListQuery = z.infer<typeof contactListQuerySchema>;
export type FriendRequestCreateBody = z.infer<typeof friendRequestCreateBodySchema>;
export type FriendRequestListQuery = z.infer<typeof friendRequestListQuerySchema>;
export type SocialPostCreateBody = z.infer<typeof socialPostCreateBodySchema>;
export type SocialPostListQuery = z.infer<typeof socialPostListQuerySchema>;
export type FollowCreateBody = z.infer<typeof followCreateBodySchema>;
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
