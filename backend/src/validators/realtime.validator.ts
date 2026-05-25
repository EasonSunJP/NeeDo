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

export const friendRequestIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const notificationIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
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

export const messageListQuerySchema = z.object({
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  beforeId: z.coerce.number().int().positive().optional()
});

export const messageCreateBodySchema = z.object({
  type: z.enum(["text", "system", "orderStatus"]).default("text"),
  content: z.string().trim().min(1).max(4000),
  metadata: z.record(z.unknown()).optional()
});

export const contactListQuerySchema = z.object({
  ...paginationQuerySchema
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

export const socialPostCreateBodySchema = z.object({
  content: z.string().trim().min(1).max(5000),
  media: z.array(z.record(z.unknown())).max(12).optional(),
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
export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;
export type MessageCreateBody = z.infer<typeof messageCreateBodySchema>;
export type MessageListQuery = z.infer<typeof messageListQuerySchema>;
export type ContactListQuery = z.infer<typeof contactListQuerySchema>;
export type FriendRequestCreateBody = z.infer<typeof friendRequestCreateBodySchema>;
export type FriendRequestListQuery = z.infer<typeof friendRequestListQuerySchema>;
export type SocialPostCreateBody = z.infer<typeof socialPostCreateBodySchema>;
export type SocialPostListQuery = z.infer<typeof socialPostListQuerySchema>;
export type FollowCreateBody = z.infer<typeof followCreateBodySchema>;
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
