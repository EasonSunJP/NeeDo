import {
  ConversationAccessPolicy,
  ConversationType,
  FriendRequestStatus,
  ImDeletionAction,
  MessageRecallMode,
  MessageType,
  NotificationType,
  PlatformMembershipTierCode,
  PlatformMembershipVersionStatus,
  Prisma,
  SocialPostVisibility
} from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { ERROR_CODES } from "../constants/error-codes";
import {
  compareMessageReactionCategories,
  getMessageReactionCategory
} from "../constants/message-reaction.constants";
import type { MESSAGE_JUDGEMENT_REACTIONS } from "../constants/message-reaction.constants";
import { prisma } from "../prisma/client";
import type { AuthRequestContext } from "../services/auth.service";
import type { EntityShareReceipt, ResolvedEntityTarget } from "./entity-engagement.repository";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";
import type { EnsureTechnicianApplicationContactInput } from "../services/technician-application-review.service";
import { AppError } from "../utils/app-error";
import { buildSocialPostShareCardMetadata } from "../utils/social-post-share-card";
import {
  ImMediaBindingError,
  imMessageInclude as messageInclude,
  persistImMessageInTransaction
} from "./im-message-send.transaction";
import {
  contactCardRequestFingerprint,
  persistImContactCardInTransaction
} from "./im-contact-card-send.transaction";

const PUBLISHED_STATUS = "published";
const PERSONAL_IDENTITY_TYPES = ["customer", "user", "u", "technician", "scout"];

export type ConversationTypePayload = "direct" | "group";
export type MessageTypePayload = "text" | "system" | "orderStatus";
export type MessageRecallModePayload = "standard" | "traceless";
export type FriendRequestStatusPayload = "pending" | "accepted" | "rejected" | "expired";
export type SocialPostVisibilityPayload = "public" | "followers";
export type NotificationTypePayload = "orderStatus" | "friendRequest" | "system" | "social";

export function toFriendshipPairKey(leftIdentityId: number, rightIdentityId: number): string {
  const [lowIdentityId, highIdentityId] = [leftIdentityId, rightIdentityId].sort(
    (left, right) => left - right
  );
  return `${lowIdentityId}:${highIdentityId}`;
}

export interface ParticipantPayload {
  userId: number;
  needoId: string;
  username: string;
  avatarUrl: string | null;
  role?: "owner" | "admin" | "member";
}

export interface ConversationPayload {
  id: number;
  type: ConversationTypePayload;
  title: string | null;
  participants: ParticipantPayload[];
  directPeer?: ParticipantPayload | null;
  lastMessage: MessagePayload | null;
  unreadCount: number;
  isPinned: boolean;
  isMuted: boolean;
  autoTranslateMessages: boolean;
  isHidden: boolean;
  privacyModeEnabled: boolean;
  hideMemberProfiles: boolean;
  disappearingTtlSeconds: number | null;
  disappearingStartMode: "sent" | "read_by_all";
  privacyPolicyVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessagePayload {
  id: number;
  conversationId: number;
  senderUserId: number | null;
  type: MessageTypePayload;
  content: string | null;
  metadata: unknown;
  reactions: MessageReactionSummaryPayload[];
  expiresAt: Date | null;
  createdAt: Date;
  recallDeadlineAt: Date;
  recalledAt: Date | null;
  recallMode: MessageRecallModePayload | null;
  contentPurgedAt: Date | null;
  privacyPolicyVersionAtSend: number | null;
  lifecycleVersion: number;
  reactionVersion: number;
  availableRecallModes: MessageRecallModePayload[];
}

export interface MessageReactionPersonPayload {
  userId: number;
  username: string;
  avatarUrl: string | null;
}

export interface MessageReactionSummaryPayload {
  emoji: string;
  people: MessageReactionPersonPayload[];
  reactedByMe: boolean;
}

export interface MessageHistoryPayload extends PaginatedResponse<MessagePayload> {
  nextCursor: number | null;
}

export interface ContactPayload {
  id: number;
  ownerUserId: number;
  ownerIdentityId: number;
  contactUserId: number;
  contactIdentityId: number;
  contactUser: ParticipantPayload;
  nickname: string | null;
  source: string;
  isBlocked: boolean;
  createdAt: Date;
}

export interface SetContactBlockedInput {
  contactId: number;
  ownerUserId: number;
  ownerIdentityId?: number;
  isBlocked: boolean;
}

export interface DeleteContactInput {
  contactId: number;
  ownerUserId: number;
  ownerIdentityId?: number;
}

export interface DeleteFriendshipResult {
  actorUserId: number;
  actorIdentityId: number;
  counterpartUserId: number;
  counterpartIdentityId: number;
  contactIds: number[];
  deletedContactCount: number;
  deletedFollowCount: number;
  deletedConversationId: number | null;
  deleted: true;
  deletedAt: Date;
}

export type DeletedContactPayload = DeleteFriendshipResult;

export interface DirectorySearchInput extends PaginationInput {
  query: string;
  ownerIdentityId?: number;
}

export interface ContactCardCandidateListInput extends PaginationInput {
  query?: string;
}

export interface ContactCardCandidatePayload {
  targetUserId: string;
  needoId: string;
  nickname: string;
  avatarUrl: string | null;
  relationship: "self" | "friend";
}

export interface AddContactInput {
  contactUserId: number;
  ownerUserId: number;
  ownerIdentityId?: number;
  source: "manual";
}

export interface FriendRequestPayload {
  id: number;
  requesterUserId: number;
  requesterIdentityId: number;
  targetUserId: number;
  targetIdentityId: number;
  requester: ParticipantPayload;
  target: ParticipantPayload;
  status: FriendRequestStatusPayload;
  message: string | null;
  respondedAt: Date | null;
  expiresAt: Date;
  expiredAt: Date | null;
  createdAt: Date;
}

export interface CreateFriendRequestResult {
  friendRequest: FriendRequestPayload;
  created: boolean;
}

export type CreateFriendRequestOutcome =
  | { status: "ready"; result: CreateFriendRequestResult }
  | { status: "already_friends" }
  | { status: "target_unavailable" };

export interface TechnicianContactServicePayload {
  id: number;
  shopId: number | null;
  name: string;
  priceAmount: number;
  currency: string;
  durationMinutes: number;
  taxIncluded: true;
  sortOrder: number;
}

export interface TechnicianContactDetailsPayload {
  bidBudgetMinJpy: number | null;
  bidBudgetMaxJpy: number | null;
  paymentMethods: string[];
  specialTags: string[];
  profileTags: string[];
  services: TechnicianContactServicePayload[];
  completedOrderCount: number;
  acceptanceRateBps: number;
}

export interface DirectoryProfilePayload {
  user: ParticipantPayload;
  identityCard: DirectoryIdentityCardPayload;
  relationship: "none" | "friend" | "incoming_pending" | "outgoing_pending" | "self";
  contactId: number | null;
  friendRequest: FriendRequestPayload | null;
  technicianContactDetails?: TechnicianContactDetailsPayload;
}

export interface DirectoryIdentityCardPayload {
  entityType: "user" | "technician" | "shop" | "account";
  profileId: number | null;
  displayName: string;
  identityLabel: string | null;
  verified: boolean;
  creditValue: string | null;
  creditReviewCount: number;
  gender: string | null;
  age: number | null;
  heightCm: string | null;
  languages: string[];
  city: string | null;
  serviceArea: string | null;
  yearsExperience: number | null;
  bio: string | null;
}

export interface RespondFriendRequestResult {
  friendRequest: FriendRequestPayload;
  recipientUserIds: number[];
}

export type RespondFriendRequestOutcome =
  | { status: "responded"; result: RespondFriendRequestResult }
  | { status: "expired"; friendRequest: FriendRequestPayload }
  | { status: "not_found" };

export interface SocialPostAuthorPayload {
  userId: number;
  identityId: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  entityType: "user" | "technician" | "shop";
  joinedAt: Date;
}

export type SocialActivityStatus = "recent_posts" | "no_recent_posts";

export interface SocialActivityStatusPayload {
  status: SocialActivityStatus;
  profile: SocialPostAuthorPayload;
  latestVisiblePostAt: Date | null;
}

export interface SocialPostPayload {
  id: number;
  authorUserId: number;
  authorIdentityId: number;
  content: string;
  media: unknown;
  replyToPostId: number | null;
  replyCount: number;
  visibility: SocialPostVisibilityPayload;
  createdAt: Date;
  updatedAt: Date;
  isPinned: boolean;
  author: SocialPostAuthorPayload;
  viewerFollowsAuthor: boolean;
  authorFollowsViewer: boolean;
  viewerIsFriend: boolean;
  counters: {
    likes: number;
    reposts: number;
    views: number;
    bookmarks: number;
  };
  viewerInteraction: {
    liked: boolean;
    bookmarked: boolean;
    shared: boolean;
  };
}

type SocialRelationshipMap = {
  follows: Set<string>;
  friendIdentityIds: Set<number>;
};

type SocialInteractionMap = {
  likedPostIds: Set<number>;
  bookmarkedPostIds: Set<number>;
  sharedPostIds: Set<number>;
};

export interface SocialPostInteractionMutationInput {
  postId: number;
  actorUserId: number;
  actorIdentityId?: number;
  active: boolean;
  context: AuthRequestContext;
  onActiveLike?: (context: SocialPostLikeExperienceContext) => Promise<void>;
}

export interface SocialPostLikeExperienceContext {
  transactionClient: unknown;
  postId: number;
  authorUserId: number;
  actorUserId: number;
}

export interface RecordSocialPostViewInput {
  postId: number;
  actorUserId: number;
  actorIdentityId?: number;
  context: AuthRequestContext;
}

export interface ShareSocialPostInput {
  postId: number;
  actorUserId: number;
  actorIdentityId?: number;
  targetUserIds: number[];
  idempotencyKey: string;
  context: AuthRequestContext;
}

export interface SocialPostInteractionMutationResult {
  changed: boolean;
  post: SocialPostPayload;
}

export interface SocialPostShareDelivery {
  recipientUserId: number;
  recipientIdentityId: number;
  message: MessagePayload;
  created: boolean;
}

export interface ShareSocialPostResult extends SocialPostInteractionMutationResult {
  deliveries: SocialPostShareDelivery[];
}

export interface FollowPayload {
  id: number;
  followerUserId: number;
  followerIdentityId: number;
  followingUserId: number;
  followingIdentityId: number;
  createdAt: Date;
}

export interface NotificationPayload {
  id: number;
  recipientUserId: number;
  recipientIdentityId: number;
  actorUserId: number | null;
  actorIdentityId: number | null;
  type: NotificationTypePayload;
  title: string;
  body: string;
  payload: unknown;
  readAt: Date | null;
  createdAt: Date;
}

export interface UnreadCountsPayload {
  conversations: number;
  notifications: number;
  friendRequests: number;
  total: number;
}

export interface CreateConversationInput {
  creatorUserId: number;
  creatorIdentityId?: number;
  type: ConversationTypePayload;
  title?: string | null;
  participantUserIds: number[];
  participantIdentities?: Array<{ userId: number; identityId: number }>;
  privacyModeEnabled?: boolean;
  hideMemberProfiles?: boolean;
  disappearingTtlSeconds?: number | null;
  disappearingStartMode?: "sent" | "read_by_all";
}

export type CreateConversationOutcome =
  | { status: "ready"; conversation: ConversationPayload }
  | { status: "not_friends" };

export interface UpdateConversationPrivacyInput {
  actorUserId: number;
  actorIdentityId?: number;
  conversationId: number;
  privacyModeEnabled: boolean;
  hideMemberProfiles?: boolean;
  disappearingTtlSeconds?: number | null;
  disappearingStartMode?: "sent" | "read_by_all";
}

export interface LeaveConversationInput {
  conversationId: number;
  userId: number;
  identityId?: number;
  transferOwnerUserId?: number;
}

export interface LeaveConversationPayload {
  conversationId: number;
  removedUserId: number;
  newOwnerUserId: number | null;
  dissolved: boolean;
  recipientUserIds: number[];
}

export type LeaveConversationOutcome =
  | { status: "left"; result: LeaveConversationPayload }
  | { status: "not_found" }
  | { status: "transfer_required" }
  | { status: "invalid_transfer" };

export interface ListMessagesInput {
  conversationId: number;
  userId: number;
  identityId?: number;
  beforeId?: number;
  pageSize?: number;
}

export interface CreateMessageInput {
  conversationId: number;
  senderUserId: number;
  senderIdentityId?: number;
  type: MessageTypePayload;
  content: string;
  metadata?: unknown;
}

export type CreateMessageOutcome =
  | { status: "created"; message: MessagePayload }
  | { status: "not_found" }
  | { status: "recipient_blocked" }
  | { status: "not_friends" }
  | { status: "media_invalid" };

export interface CreateNeedoEntityShareInput {
  actorUserId: number;
  actorIdentityId: number;
  conversationId: number;
  target: ResolvedEntityTarget;
  idempotencyKey: string;
  requestFingerprint: string;
}

export type CreateNeedoEntityShareOutcome =
  | {
      status: "created" | "replayed";
      message: MessagePayload;
      receipt: EntityShareReceipt;
    }
  | {
      status:
        | "idempotency_conflict"
        | "recipient_not_found"
        | "not_found"
        | "recipient_blocked"
        | "not_friends";
    };

export interface SendContactCardInput {
  conversationId: number;
  senderUserId: number;
  senderIdentityId: number;
  targetUserPublicId: string;
  idempotencyKey: string;
}

export type SendContactCardOutcome =
  | { status: "created"; message: MessagePayload }
  | { status: "replayed"; message: MessagePayload }
  | { status: "target_not_found" }
  | { status: "target_not_allowed" }
  | { status: "idempotency_conflict" }
  | { status: "not_found" }
  | { status: "recipient_blocked" }
  | { status: "not_friends" };

export type MessageSendEligibility = "allowed" | "not_found" | "recipient_blocked" | "not_friends";

export interface CheckMessageSendEligibilityInput {
  conversationId: number;
  senderUserId: number;
  senderIdentityId?: number;
}

export interface RecallMessageInput {
  conversationId: number;
  messageId: number;
  senderUserId: number;
  senderIdentityId?: number;
  mode: "standard" | "traceless";
  now: Date;
}

export type StandardRecallRepositoryOutcome =
  | { status: "recalled" | "already_recalled"; message: MessagePayload }
  | { status: "not_found" | "window_expired" };

export interface MessageReactionMutationInput {
  conversationId: number;
  messageId: number;
  userId: number;
  identityId?: number;
  emoji: string;
}

export type MessageReactionMutationOutcome =
  | { status: "updated"; message: MessagePayload }
  | { status: "unchanged"; message: MessagePayload }
  | { status: "slot_occupied"; message: MessagePayload; activeEmoji: string }
  | { status: "not_found" };

export interface DeleteMessageForUserInput {
  conversationId: number;
  messageId: number;
  userId: number;
  identityId?: number;
}

export interface DeleteMessageForUserPayload {
  conversationId: number;
  messageId: number;
  deleted: true;
}

export interface DeleteMessagesForUserInput {
  conversationId: number;
  messageIds: number[];
  idempotencyKey: string;
  userId: number;
  identityId?: number;
}

export interface DeleteMessagesForUserPayload {
  conversationId: number;
  messageIds: number[];
  count: number;
  deleted: true;
  replayed: boolean;
}

export interface UpdateConversationPreferencesInput {
  conversationId: number;
  userId: number;
  identityId?: number;
  isPinned?: boolean;
  isMuted?: boolean;
  autoTranslateMessages?: boolean;
}

export interface FriendRequestListInput extends PaginationInput {
  status?: FriendRequestStatusPayload;
  direction?: "incoming" | "outgoing" | "all";
}

export interface CreateFriendRequestInput {
  requesterUserId: number;
  requesterIdentityId?: number;
  targetUserId: number;
  targetIdentityId?: number;
  message?: string | null;
}

export interface RespondFriendRequestInput {
  id: number;
  actorUserId: number;
  actorIdentityId?: number;
  action: "accept" | "reject";
}

export interface CreateSocialPostInput {
  authorUserId: number;
  authorIdentityId?: number;
  content: string;
  media?: CreateSocialPostMediaEnvelope;
  mentionUserIds: number[];
  visibility: SocialPostVisibilityPayload;
  context: AuthRequestContext;
}

export interface CreateSocialPostMediaItem {
  id: string;
  type: "image";
  mediaAssetPublicId: string;
  alt?: string;
}

export interface CreateSocialPostMediaEnvelope {
  items: CreateSocialPostMediaItem[];
  quotePostId?: number;
  replyToPostId?: number;
  repostPostId?: number;
  postType?: "post" | "reply" | "quote" | "repost" | "announcement" | "technician-daily";
  locationLabel?: string;
  richText?: {
    version: 1;
    parts: Array<
      | { type: "text"; value: string }
      | { type: "judgement"; value: (typeof MESSAGE_JUDGEMENT_REACTIONS)[number] }
    >;
  };
}

export interface CreateSocialPostResult {
  post: SocialPostPayload;
  notifications: NotificationPayload[];
}

export interface UpdateSocialPostInput extends CreateSocialPostInput {
  postId: number;
}

export interface SetSocialPostPinInput {
  postId: number;
  authorUserId: number;
  authorIdentityId?: number;
  active: boolean;
  context: AuthRequestContext;
}

export type UpdateSocialPostResult = CreateSocialPostResult;

export interface SocialPostListInput extends PaginationInput {
  authorUserId?: number;
  authorIdentityId?: number;
  replyToPostId?: number;
  bookmarked?: boolean;
}

export interface SocialActivityStatusInput {
  viewerUserId: number;
  viewerIdentityId?: number;
  targetUserId: number;
  targetIdentityId?: number;
  since: Date;
}

export interface CreateFollowInput {
  followerUserId: number;
  followerIdentityId?: number;
  followingUserId: number;
  followingIdentityId?: number;
}

export interface NotificationListInput extends PaginationInput {
  unreadOnly?: boolean;
}

export interface CreateOrderStatusNotificationInput {
  recipientUserIds: number[];
  recipientIdentities?: Array<{ userId: number; identityId: number }>;
  actorUserId: number;
  actorIdentityId?: number;
  orderId: number;
  orderNo: string;
  fromStatus: string;
  toStatus: string;
  serviceName: string;
}

export interface RealtimeRepositoryPort {
  findActiveUserIds: (ids: number[]) => Promise<number[]>;
  findCanonicalIdentityIdForUser: (userId: number) => Promise<number | null>;
  createConversation: (input: CreateConversationInput) => Promise<CreateConversationOutcome>;
  updateConversationPrivacy: (
    input: UpdateConversationPrivacyInput
  ) => Promise<ConversationPayload | null>;
  leaveConversation: (input: LeaveConversationInput) => Promise<LeaveConversationOutcome>;
  dissolveConversation: (input: {
    conversationId: number;
    ownerUserId: number;
    ownerIdentityId?: number;
  }) => Promise<LeaveConversationPayload | null>;
  getConversationForUser: (
    conversationId: number,
    identityId: number,
    viewerUserId?: number
  ) => Promise<ConversationPayload | null>;
  listConversationRecipients?: (
    conversationId: number
  ) => Promise<Array<{ userId: number; identityId: number }>>;
  listProfileUpdateRecipients?: (
    identityId: number
  ) => Promise<Array<{ userId: number; identityId: number }>>;
  listConversations: (
    userId: number,
    input: PaginationInput
  ) => Promise<PaginatedResponse<ConversationPayload>>;
  checkMessageSendEligibility: (
    input: CheckMessageSendEligibilityInput
  ) => Promise<MessageSendEligibility>;
  createMessage: (input: CreateMessageInput) => Promise<CreateMessageOutcome>;
  createNeedoEntityShare: (
    input: CreateNeedoEntityShareInput
  ) => Promise<CreateNeedoEntityShareOutcome>;
  sendContactCard: (input: SendContactCardInput) => Promise<SendContactCardOutcome>;
  isMessageSenderBlocked: (
    conversationId: number,
    senderUserId: number,
    senderIdentityId?: number
  ) => Promise<boolean>;
  recallMessage: (input: RecallMessageInput) => Promise<StandardRecallRepositoryOutcome>;
  listMessages: (input: ListMessagesInput) => Promise<MessageHistoryPayload | null>;
  deleteMessageForUser: (
    input: DeleteMessageForUserInput
  ) => Promise<DeleteMessageForUserPayload | null>;
  deleteMessagesForUser: (
    input: DeleteMessagesForUserInput
  ) => Promise<DeleteMessagesForUserPayload | null>;
  setMessageReaction: (
    input: MessageReactionMutationInput
  ) => Promise<MessageReactionMutationOutcome>;
  removeMessageReaction: (
    input: MessageReactionMutationInput
  ) => Promise<MessageReactionMutationOutcome>;
  markConversationRead: (input: {
    conversationId: number;
    userId: number;
    identityId?: number;
  }) => Promise<{ conversationId: number; unreadCount: number } | null>;
  markConversationUnread: (input: {
    conversationId: number;
    userId: number;
    identityId?: number;
  }) => Promise<ConversationPayload | null>;
  updateConversationPreferences: (
    input: UpdateConversationPreferencesInput
  ) => Promise<ConversationPayload | null>;
  hideConversation: (input: {
    conversationId: number;
    userId: number;
    identityId?: number;
  }) => Promise<ConversationPayload | null>;
  clearConversationMessages: (input: {
    conversationId: number;
    userId: number;
    identityId?: number;
  }) => Promise<ConversationPayload | null>;
  listContacts: (
    userId: number,
    input: PaginationInput
  ) => Promise<PaginatedResponse<ContactPayload>>;
  listContactCardCandidates: (
    userId: number,
    identityId: number,
    input: ContactCardCandidateListInput
  ) => Promise<PaginatedResponse<ContactCardCandidatePayload>>;
  searchDirectory: (
    userId: number,
    input: DirectorySearchInput
  ) => Promise<PaginatedResponse<ParticipantPayload>>;
  addContact: (input: AddContactInput) => Promise<ContactPayload>;
  setContactBlocked: (input: SetContactBlockedInput) => Promise<ContactPayload | null>;
  deleteContact: (input: DeleteContactInput) => Promise<DeletedContactPayload | null>;
  ensureDirectContactConversation: (
    input: EnsureTechnicianApplicationContactInput
  ) => Promise<{ conversationId: number }>;
  getDirectoryProfile: (
    viewerUserId: number,
    viewerIdentityId: number,
    targetUserId: number,
    targetIdentityId: number | null
  ) => Promise<DirectoryProfilePayload | null>;
  createFriendRequest: (input: CreateFriendRequestInput) => Promise<CreateFriendRequestOutcome>;
  listFriendRequests: (
    userId: number,
    input: FriendRequestListInput
  ) => Promise<PaginatedResponse<FriendRequestPayload>>;
  respondToFriendRequest: (
    input: RespondFriendRequestInput
  ) => Promise<RespondFriendRequestOutcome>;
  expireDueFriendRequests: (input: { batchSize: number }) => Promise<FriendRequestPayload[]>;
  createSocialPost: (input: CreateSocialPostInput) => Promise<CreateSocialPostResult>;
  updateSocialPost: (input: UpdateSocialPostInput) => Promise<UpdateSocialPostResult | null>;
  setSocialPostPin: (input: SetSocialPostPinInput) => Promise<SocialPostPayload | null>;
  listSocialPosts: (
    identityId: number,
    input: SocialPostListInput,
    userId?: number
  ) => Promise<PaginatedResponse<SocialPostPayload>>;
  getSocialPost: (
    identityId: number,
    postId: number,
    userId?: number
  ) => Promise<SocialPostPayload | null>;
  setSocialPostLike: (
    input: SocialPostInteractionMutationInput
  ) => Promise<SocialPostInteractionMutationResult | null>;
  setSocialPostBookmark: (
    input: SocialPostInteractionMutationInput
  ) => Promise<SocialPostInteractionMutationResult | null>;
  recordSocialPostView: (
    input: RecordSocialPostViewInput
  ) => Promise<SocialPostInteractionMutationResult | null>;
  shareSocialPost: (input: ShareSocialPostInput) => Promise<ShareSocialPostResult | null>;
  getSocialActivityStatus: (
    input: SocialActivityStatusInput
  ) => Promise<SocialActivityStatusPayload | null>;
  listFollowerUserIds: (followingUserId: number) => Promise<number[]>;
  listFollowerRecipients?: (
    followingIdentityId: number
  ) => Promise<Array<{ userId: number; identityId: number }>>;
  createFollow: (input: CreateFollowInput) => Promise<FollowPayload>;
  deleteFollow: (
    followerIdentityId: number,
    followingIdentityId: number
  ) => Promise<{ deleted: boolean }>;
  listNotifications: (
    identityId: number,
    input: NotificationListInput
  ) => Promise<PaginatedResponse<NotificationPayload>>;
  markNotificationRead: (
    identityId: number,
    notificationId: number
  ) => Promise<NotificationPayload | null>;
  markAllNotificationsRead: (identityId: number) => Promise<{ count: number }>;
  getUnreadCounts: (identityId: number) => Promise<UnreadCountsPayload>;
  createOrderStatusNotifications: (
    input: CreateOrderStatusNotificationInput
  ) => Promise<NotificationPayload[]>;
}

const socialAuthorSelect = {
  id: true,
  username: true,
  avatarUrl: true,
  createdAt: true,
  customerProfile: {
    select: { displayName: true, deletedAt: true }
  },
  technicianProfile: {
    select: { displayName: true, deletedAt: true }
  },
  identities: {
    where: { deletedAt: null, isActive: true },
    select: {
      id: true,
      type: true,
      displayName: true,
      isDefault: true,
      merchantIdentityProfile: {
        select: { displayName: true, deletedAt: true }
      }
    },
    orderBy: [{ isDefault: "desc" as const }, { id: "asc" as const }]
  }
} satisfies Prisma.UserSelect;

const socialPostInclude = {
  author: {
    select: socialAuthorSelect
  },
  authorIdentity: {
    select: {
      id: true,
      type: true,
      displayName: true,
      pinnedSocialPostId: true,
      merchantIdentityProfile: {
        select: { displayName: true, deletedAt: true }
      }
    }
  },
  _count: {
    select: {
      replies: { where: { deletedAt: null } },
      likes: { where: { deletedAt: null } },
      bookmarks: { where: { deletedAt: null } },
      views: { where: { deletedAt: null } },
      shares: { where: { deletedAt: null } }
    }
  }
} satisfies Prisma.SocialPostInclude;

const imParticipantUserSelect = {
  id: true,
  needoId: true,
  username: true,
  avatarUrl: true,
  customerProfile: {
    select: { displayName: true, deletedAt: true }
  },
  technicianProfile: {
    select: { displayName: true, deletedAt: true }
  }
} satisfies Prisma.UserSelect;

const imParticipantIdentitySelect = {
  id: true,
  type: true,
  displayName: true,
  merchantIdentityProfile: {
    select: { displayName: true, deletedAt: true }
  }
} satisfies Prisma.UserIdentitySelect;

const contactInclude = {
  contactUser: {
    select: imParticipantUserSelect
  },
  contactIdentity: {
    select: imParticipantIdentitySelect
  }
} satisfies Prisma.ContactInclude;

const friendRequestInclude = {
  requester: {
    select: {
      id: true,
      needoId: true,
      username: true,
      avatarUrl: true
    }
  },
  target: {
    select: {
      id: true,
      needoId: true,
      username: true,
      avatarUrl: true
    }
  }
} satisfies Prisma.FriendRequestInclude;

type ConversationRecord = Prisma.ConversationGetPayload<{
  include: {
    participants: {
      include: {
        user: { select: typeof imParticipantUserSelect };
        identity: { select: typeof imParticipantIdentitySelect };
      };
    };
    messages: {
      include: typeof messageInclude;
    };
  };
}>;

type MessageRecord = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;
type ContactRecord = Prisma.ContactGetPayload<{ include: typeof contactInclude }>;
type ImParticipantUserRecord = Prisma.UserGetPayload<{
  select: typeof imParticipantUserSelect;
}>;
type ImParticipantIdentityRecord = Prisma.UserIdentityGetPayload<{
  select: typeof imParticipantIdentitySelect;
}>;
type FriendRequestRecord = Prisma.FriendRequestGetPayload<{
  include: typeof friendRequestInclude;
}>;
type SocialAuthorRecord = Prisma.UserGetPayload<{ select: typeof socialAuthorSelect }>;
type SocialPostRecord = Prisma.SocialPostGetPayload<{ include: typeof socialPostInclude }>;
type FollowRecord = Prisma.FollowGetPayload<Record<string, never>>;
type NotificationRecord = Prisma.NotificationGetPayload<Record<string, never>>;

type DirectoryReviewRecord = {
  ratingAverage: { toString: () => string };
  reviewCount: number;
  deletedAt: Date | null;
} | null;

type DirectoryProfileUserRecord = {
  id: number;
  needoId: string;
  username: string;
  avatarUrl: string | null;
  identities: Array<{
    id: number;
    type: string;
    scopeType: string | null;
    scopeId: number | null;
    displayName: string | null;
    isDefault: boolean;
  }>;
  platformMembershipEntitlements: Array<{
    tierVersion: {
      tier: { code: PlatformMembershipTierCode };
    };
  }>;
  membershipAdjustments: Array<{
    tierVersion: {
      tier: { code: PlatformMembershipTierCode };
    } | null;
  }>;
  customerProfile: {
    id: number;
    displayName: string;
    bio: string | null;
    city: string | null;
    isPublic: boolean;
    gender: string;
    age: number | null;
    heightCm: { toString: () => string } | null;
    languages: unknown;
    visibility: string;
    deletedAt: Date | null;
    reviewSummary: DirectoryReviewRecord;
  } | null;
  technicianProfile: {
    id: number;
    displayName: string;
    bio: string | null;
    city: string;
    serviceArea: string | null;
    yearsExperience: number;
    age?: number | null;
    heightCm?: { toString: () => string } | null;
    languages: unknown;
    visibility: string;
    employmentType: string;
    status: string;
    verifiedAt: Date | null;
    deletedAt: Date | null;
    reviewSummary: DirectoryReviewRecord;
  } | null;
};

function toDirectoryLanguages(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

export class RealtimeRepository implements RealtimeRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findActiveUserIds(ids: number[]): Promise<number[]> {
    const uniqueIds = Array.from(new Set(ids));
    const users = await this.client.user.findMany({
      where: {
        id: { in: uniqueIds },
        isActive: true,
        deletedAt: null
      },
      select: { id: true }
    });

    return users.map((user) => user.id);
  }

  public findCanonicalIdentityIdForUser(userId: number): Promise<number | null> {
    return this.findCanonicalIdentityId(this.client, userId);
  }

  public listConversationRecipients(
    conversationId: number
  ): Promise<Array<{ userId: number; identityId: number }>> {
    return this.client.conversationParticipant.findMany({
      where: {
        conversationId,
        deletedAt: null,
        conversation: { deletedAt: null }
      },
      select: { userId: true, identityId: true }
    });
  }

  public listProfileUpdateRecipients(
    identityId: number
  ): Promise<Array<{ userId: number; identityId: number }>> {
    return this.client.conversationParticipant.findMany({
      where: {
        deletedAt: null,
        conversation: {
          deletedAt: null,
          participants: { some: { identityId, deletedAt: null } }
        }
      },
      distinct: ["identityId"],
      select: { userId: true, identityId: true }
    });
  }

  public async createConversation(
    input: CreateConversationInput
  ): Promise<CreateConversationOutcome> {
    const creatorIdentityId =
      input.creatorIdentityId ?? (await this.findCanonicalIdentityIdForUser(input.creatorUserId));
    if (!creatorIdentityId) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_NOT_FOUND,
        message: "error.auth.identity_not_found",
        statusCode: 403
      });
    }
    const requestedUsers = Array.from(new Set([input.creatorUserId, ...input.participantUserIds]));
    const suppliedIdentities = new Map(
      input.participantIdentities?.map((participant) => [
        participant.userId,
        participant.identityId
      ]) ?? []
    );
    suppliedIdentities.set(input.creatorUserId, creatorIdentityId);
    const participantIdentities = await Promise.all(
      requestedUsers.map(async (userId) => ({
        userId,
        identityId:
          suppliedIdentities.get(userId) ?? (await this.findCanonicalIdentityIdForUser(userId))
      }))
    );
    if (participantIdentities.some((participant) => !participant.identityId)) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_NOT_FOUND,
        message: "error.auth.identity_not_found",
        statusCode: 403
      });
    }
    const resolvedParticipants = participantIdentities
      .map((participant) => ({
        userId: participant.userId,
        identityId: participant.identityId as number
      }))
      .sort((left, right) => left.identityId - right.identityId);
    const participantIdentityIds = resolvedParticipants.map(
      (participant) => participant.identityId
    );
    if (input.type === "direct") {
      if (participantIdentityIds.length !== 2) {
        return { status: "not_friends" };
      }
      const reciprocalContactCount = await this.client.contact.count({
        where: {
          source: "friend_request",
          deletedAt: null,
          OR: [
            {
              ownerIdentityId: participantIdentityIds[0],
              contactIdentityId: participantIdentityIds[1]
            },
            {
              ownerIdentityId: participantIdentityIds[1],
              contactIdentityId: participantIdentityIds[0]
            }
          ]
        }
      });
      if (reciprocalContactCount !== 2) {
        return { status: "not_friends" };
      }
    }
    const existingDirect =
      input.type === "direct"
        ? await this.findExistingDirectConversation(participantIdentityIds)
        : null;

    if (existingDirect) {
      await this.client.conversationParticipant.updateMany({
        where: {
          conversationId: existingDirect.id,
          identityId: creatorIdentityId,
          deletedAt: null
        },
        data: { hiddenAt: null }
      });
      return {
        status: "ready",
        conversation:
          (await this.getConversationForUser(
            existingDirect.id,
            creatorIdentityId,
            input.creatorUserId
          )) ?? this.mapConversation(existingDirect, creatorIdentityId)
      };
    }

    const conversation = await this.client.conversation.create({
      data: {
        type: this.conversationTypeToDb(input.type),
        accessPolicy:
          input.type === "group"
            ? ConversationAccessPolicy.GROUP_MEMBERSHIP
            : ConversationAccessPolicy.FRIENDSHIP_REQUIRED,
        friendshipPairKey:
          input.type === "direct"
            ? toFriendshipPairKey(participantIdentityIds[0]!, participantIdentityIds[1]!)
            : null,
        title: input.title?.trim() || null,
        createdByUserId: input.creatorUserId,
        createdByIdentityId: creatorIdentityId,
        privacyModeEnabled: input.type === "group" && Boolean(input.privacyModeEnabled),
        hideMemberProfiles: input.type === "group" && Boolean(input.hideMemberProfiles),
        disappearingTtlSeconds:
          input.type === "group" && input.privacyModeEnabled
            ? (input.disappearingTtlSeconds ?? null)
            : null,
        disappearingStartMode:
          input.type === "group" && input.privacyModeEnabled
            ? (input.disappearingStartMode ?? "sent")
            : "sent",
        privacyPolicyVersion: input.type === "group" && input.privacyModeEnabled ? 1 : 0,
        privacyUpdatedAt: input.type === "group" && input.privacyModeEnabled ? new Date() : null,
        privacyUpdatedByUserId:
          input.type === "group" && input.privacyModeEnabled ? input.creatorUserId : null,
        participants: {
          create: resolvedParticipants.map((participant) => ({
            userId: participant.userId,
            identityId: participant.identityId,
            role: participant.identityId === creatorIdentityId ? "owner" : "member"
          }))
        }
      },
      include: this.conversationInclude(creatorIdentityId)
    });

    return {
      status: "ready",
      conversation: this.mapConversation(conversation, creatorIdentityId)
    };
  }

  public async updateConversationPrivacy(
    input: UpdateConversationPrivacyInput
  ): Promise<ConversationPayload | null> {
    return this.client.$transaction(async (tx) => {
      const actor = await tx.conversationParticipant.findFirst({
        where: {
          conversationId: input.conversationId,
          identityId: input.actorIdentityId ?? input.actorUserId,
          role: "owner",
          deletedAt: null,
          conversation: {
            type: ConversationType.GROUP,
            deletedAt: null
          }
        },
        select: { id: true }
      });

      if (!actor) {
        return null;
      }

      const updated = await tx.conversation.update({
        where: { id: input.conversationId },
        data: {
          privacyModeEnabled: input.privacyModeEnabled,
          hideMemberProfiles: input.hideMemberProfiles ?? false,
          disappearingTtlSeconds: input.privacyModeEnabled
            ? (input.disappearingTtlSeconds ?? null)
            : null,
          disappearingStartMode: input.privacyModeEnabled
            ? (input.disappearingStartMode ?? "sent")
            : "sent",
          privacyPolicyVersion: { increment: 1 },
          privacyUpdatedAt: new Date(),
          privacyUpdatedByUserId: input.actorUserId
        },
        include: this.conversationInclude(input.actorIdentityId ?? input.actorUserId)
      });

      await tx.auditLog.create({
        data: {
          actorId: input.actorUserId,
          action: "im.conversation.privacy_updated",
          targetType: "Conversation",
          targetId: input.conversationId,
          ip: null,
          userAgent: null,
          metadata: {
            privacyModeEnabled: input.privacyModeEnabled,
            hideMemberProfiles: input.hideMemberProfiles ?? false,
            disappearingTtlSeconds: input.privacyModeEnabled
              ? (input.disappearingTtlSeconds ?? null)
              : null,
            disappearingStartMode: input.privacyModeEnabled
              ? (input.disappearingStartMode ?? "sent")
              : "sent"
          }
        }
      });

      return this.mapConversation(updated, input.actorIdentityId ?? input.actorUserId);
    });
  }

  public async leaveConversation(input: LeaveConversationInput): Promise<LeaveConversationOutcome> {
    return this.client.$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: {
          id: input.conversationId,
          type: ConversationType.GROUP,
          deletedAt: null,
          participants: {
            some: { identityId: input.identityId ?? input.userId, deletedAt: null }
          }
        },
        include: {
          participants: {
            where: { deletedAt: null },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { id: true, userId: true, identityId: true, role: true }
          }
        }
      });

      if (!conversation) {
        return { status: "not_found" } as const;
      }

      const leaving = conversation.participants.find(
        (participant) => participant.identityId === (input.identityId ?? input.userId)
      );
      if (!leaving) {
        return { status: "not_found" } as const;
      }

      const remaining = conversation.participants.filter(
        (participant) => participant.identityId !== (input.identityId ?? input.userId)
      );
      const requestedOwner = input.transferOwnerUserId
        ? remaining.find((participant) => participant.userId === input.transferOwnerUserId)
        : undefined;
      if (leaving.role === "owner" && !input.transferOwnerUserId) {
        return { status: "transfer_required" } as const;
      }
      if (leaving.role === "owner" && !requestedOwner) {
        return { status: "invalid_transfer" } as const;
      }

      const shouldDissolve = remaining.length < 2;
      const nextOwner =
        leaving.role === "owner" && !shouldDissolve ? (requestedOwner ?? null) : null;
      const now = new Date();

      if (nextOwner) {
        await tx.conversationParticipant.update({
          where: { id: nextOwner.id },
          data: { role: "owner" }
        });
      }

      if (shouldDissolve) {
        await tx.conversationParticipant.updateMany({
          where: { conversationId: input.conversationId, deletedAt: null },
          data: {
            deletedAt: now,
            hiddenAt: now,
            unreadCount: 0,
            isPinned: false
          }
        });
        await tx.conversation.update({
          where: { id: input.conversationId },
          data: { deletedAt: now }
        });
      } else {
        await tx.conversationParticipant.update({
          where: { id: leaving.id },
          data: {
            deletedAt: now,
            hiddenAt: now,
            unreadCount: 0,
            isPinned: false
          }
        });
        await tx.conversation.update({
          where: { id: input.conversationId },
          data: { updatedAt: now }
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: input.userId,
          action: "im.conversation.member_left",
          targetType: "Conversation",
          targetId: input.conversationId,
          ip: null,
          userAgent: null,
          metadata: {
            newOwnerUserId: nextOwner?.userId ?? null,
            dissolved: shouldDissolve
          }
        }
      });

      return {
        status: "left" as const,
        result: {
          conversationId: input.conversationId,
          removedUserId: input.userId,
          newOwnerUserId: nextOwner?.userId ?? null,
          dissolved: shouldDissolve,
          recipientUserIds: conversation.participants.map((participant) => participant.userId)
        }
      };
    });
  }

  public async dissolveConversation(input: {
    conversationId: number;
    ownerUserId: number;
    ownerIdentityId?: number;
  }): Promise<LeaveConversationPayload | null> {
    return this.client.$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: {
          id: input.conversationId,
          type: ConversationType.GROUP,
          deletedAt: null,
          participants: {
            some: {
              identityId: input.ownerIdentityId ?? input.ownerUserId,
              role: "owner",
              deletedAt: null
            }
          }
        },
        include: {
          participants: {
            where: { deletedAt: null },
            select: { userId: true }
          }
        }
      });
      if (!conversation) return null;

      const now = new Date();
      await tx.conversationParticipant.updateMany({
        where: { conversationId: input.conversationId, deletedAt: null },
        data: {
          deletedAt: now,
          hiddenAt: now,
          unreadCount: 0,
          isPinned: false
        }
      });
      await tx.conversation.update({
        where: { id: input.conversationId },
        data: { deletedAt: now }
      });
      await tx.auditLog.create({
        data: {
          actorId: input.ownerUserId,
          action: "im.conversation.dissolved",
          targetType: "Conversation",
          targetId: input.conversationId,
          ip: null,
          userAgent: null,
          metadata: { memberCount: conversation.participants.length }
        }
      });

      return {
        conversationId: input.conversationId,
        removedUserId: input.ownerUserId,
        newOwnerUserId: null,
        dissolved: true,
        recipientUserIds: conversation.participants.map((participant) => participant.userId)
      };
    });
  }

  public async getConversationForUser(
    conversationId: number,
    identityId: number,
    viewerUserId?: number
  ): Promise<ConversationPayload | null> {
    void viewerUserId;
    const conversation = await this.client.conversation.findFirst({
      where: {
        id: conversationId,
        deletedAt: null,
        participants: {
          some: {
            identityId,
            deletedAt: null
          }
        }
      },
      include: this.conversationInclude(identityId)
    });

    if (!conversation) return null;
    const directPeers = await this.loadMissingDirectPeers([conversation], identityId);
    return this.mapConversation(conversation, identityId, directPeers.get(conversation.id));
  }

  public async listConversations(
    identityId: number,
    input: PaginationInput
  ): Promise<PaginatedResponse<ConversationPayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.ConversationWhereInput = {
      deletedAt: null,
      participants: {
        some: {
          identityId,
          hiddenAt: null,
          deletedAt: null
        }
      }
    };
    const [list, total] = await Promise.all([
      this.client.conversation.findMany({
        where,
        include: this.conversationInclude(identityId),
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
      }),
      this.client.conversation.count({ where })
    ]);

    const directPeers = await this.loadMissingDirectPeers(list, identityId);

    return buildPaginatedResponse(
      list.map((conversation) =>
        this.mapConversation(conversation, identityId, directPeers.get(conversation.id))
      ),
      total,
      pagination
    );
  }

  public async checkMessageSendEligibility(
    input: CheckMessageSendEligibilityInput
  ): Promise<MessageSendEligibility> {
    const senderIdentityId = input.senderIdentityId ?? input.senderUserId;
    const participant = await this.client.conversationParticipant.findFirst({
      where: {
        conversationId: input.conversationId,
        identityId: senderIdentityId,
        deletedAt: null,
        conversation: { deletedAt: null }
      },
      select: {
        conversation: {
          select: {
            accessPolicy: true,
            participants: {
              where: { deletedAt: null },
              select: { identityId: true }
            }
          }
        }
      }
    });
    if (!participant) {
      return "not_found";
    }
    if (
      await this.isMessageSenderBlocked(input.conversationId, input.senderUserId, senderIdentityId)
    ) {
      return "recipient_blocked";
    }
    if (participant.conversation.accessPolicy === ConversationAccessPolicy.FRIENDSHIP_REQUIRED) {
      const identityIds = participant.conversation.participants.map(({ identityId }) => identityId);
      if (identityIds.length !== 2) {
        return "not_friends";
      }
      const reciprocalCount = await this.client.contact.count({
        where: {
          deletedAt: null,
          OR: [
            {
              ownerIdentityId: identityIds[0],
              contactIdentityId: identityIds[1]
            },
            {
              ownerIdentityId: identityIds[1],
              contactIdentityId: identityIds[0]
            }
          ]
        }
      });
      if (reciprocalCount !== 2) {
        return "not_friends";
      }
    }
    return "allowed";
  }

  public async createMessage(input: CreateMessageInput): Promise<CreateMessageOutcome> {
    try {
      return await this.client.$transaction(async (tx) => {
        const transactionNow = new Date();
        const senderIdentityId = input.senderIdentityId ?? input.senderUserId;
        const outcome = await persistImMessageInTransaction(tx, {
          conversationId: input.conversationId,
          senderUserId: input.senderUserId,
          senderIdentityId,
          type: this.messageTypeToDb(input.type),
          content: input.content,
          metadata: input.metadata,
          transactionNow
        });
        if (outcome.status !== "created") return outcome;
        return {
          status: "created" as const,
          message: this.mapMessage(outcome.message, senderIdentityId)
        };
      });
    } catch (error) {
      if (error instanceof ImMediaBindingError) return { status: "media_invalid" };
      throw error;
    }
  }

  public async createNeedoEntityShare(
    input: CreateNeedoEntityShareInput
  ): Promise<CreateNeedoEntityShareOutcome> {
    const execute = async (): Promise<CreateNeedoEntityShareOutcome> =>
      this.client.$transaction(async (tx) => {
        const existing = await tx.entityShareEvent.findUnique({
          where: {
            actorUserId_idempotencyKey: {
              actorUserId: input.actorUserId,
              idempotencyKey: input.idempotencyKey
            }
          },
          include: { message: { include: messageInclude } }
        });
        if (existing) {
          if (
            existing.requestFingerprint !== input.requestFingerprint ||
            existing.message === null
          ) {
            return { status: "idempotency_conflict" };
          }
          const shareCount = await tx.entityShareEvent.count({
            where: { ...this.entityShareTargetWhere(input.target), deletedAt: null }
          });
          return {
            status: "replayed",
            message: this.mapMessage(existing.message, input.actorIdentityId),
            receipt: this.entityShareReceipt(
              input.target,
              existing.id,
              existing.messageId,
              shareCount,
              true
            )
          };
        }

        const actorParticipant = await tx.conversationParticipant.findFirst({
          where: {
            conversationId: input.conversationId,
            identityId: input.actorIdentityId,
            deletedAt: null,
            conversation: { deletedAt: null }
          },
          select: {
            conversation: {
              select: {
                type: true,
                participants: {
                  where: { deletedAt: null },
                  select: { userId: true, identityId: true }
                }
              }
            }
          }
        });
        if (!actorParticipant) return { status: "not_found" };
        const isDirect = actorParticipant.conversation.type === ConversationType.DIRECT;
        const recipient = isDirect
          ? actorParticipant.conversation.participants.find(
              (participant) => participant.identityId !== input.actorIdentityId
            )
          : null;
        if (isDirect && !recipient) {
          return { status: "recipient_not_found" };
        }

        const snapshot = await this.buildEntityShareMetadata(tx, input.target);

        const messageOutcome = await persistImMessageInTransaction(tx, {
          conversationId: input.conversationId,
          senderUserId: input.actorUserId,
          senderIdentityId: input.actorIdentityId,
          type: MessageType.SYSTEM,
          content: input.target.publicId,
          metadata: snapshot,
          transactionNow: new Date()
        });
        if (messageOutcome.status !== "created") {
          return messageOutcome;
        }

        const event = await tx.entityShareEvent.create({
          data: {
            actorUserId: input.actorUserId,
            actorIdentityId: input.actorIdentityId,
            shopId: input.target.shopId,
            technicianProfileId: input.target.technicianProfileId,
            serviceId: input.target.serviceId,
            technicianServiceId: input.target.technicianServiceId,
            channel: "NEEDO_MESSAGE",
            recipientUserId: recipient?.userId ?? null,
            recipientIdentityId: recipient?.identityId ?? null,
            conversationId: input.conversationId,
            messageId: messageOutcome.message.id,
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: input.requestFingerprint
          }
        });
        const shareCount = await tx.entityShareEvent.count({
          where: { ...this.entityShareTargetWhere(input.target), deletedAt: null }
        });
        return {
          status: "created",
          message: this.mapMessage(messageOutcome.message, input.actorIdentityId),
          receipt: this.entityShareReceipt(
            input.target,
            event.id,
            messageOutcome.message.id,
            shareCount,
            false
          )
        };
      });

    try {
      return await execute();
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }
      const existing = await this.client.entityShareEvent.findUnique({
        where: {
          actorUserId_idempotencyKey: {
            actorUserId: input.actorUserId,
            idempotencyKey: input.idempotencyKey
          }
        },
        include: { message: { include: messageInclude } }
      });
      if (
        !existing ||
        existing.requestFingerprint !== input.requestFingerprint ||
        existing.message === null
      ) {
        return { status: "idempotency_conflict" };
      }
      const shareCount = await this.client.entityShareEvent.count({
        where: { ...this.entityShareTargetWhere(input.target), deletedAt: null }
      });
      return {
        status: "replayed",
        message: this.mapMessage(existing.message, input.actorIdentityId),
        receipt: this.entityShareReceipt(
          input.target,
          existing.id,
          existing.messageId,
          shareCount,
          true
        )
      };
    }
  }

  public async sendContactCard(input: SendContactCardInput): Promise<SendContactCardOutcome> {
    const requestFingerprint = contactCardRequestFingerprint(input);
    try {
      const outcome = await this.client.$transaction((tx) =>
        persistImContactCardInTransaction(tx, {
          ...input,
          requestFingerprint,
          transactionNow: new Date()
        })
      );
      if (outcome.status === "created" || outcome.status === "replayed") {
        return {
          status: outcome.status,
          message: this.mapMessage(outcome.message, input.senderIdentityId)
        };
      }
      return outcome;
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;
      const replay = await this.client.imContactCardSendCommand.findUnique({
        where: {
          actorIdentityId_idempotencyKey: {
            actorIdentityId: input.senderIdentityId,
            idempotencyKey: input.idempotencyKey
          }
        },
        include: { message: { include: messageInclude } }
      });
      if (!replay) throw error;
      if (replay.requestFingerprint !== requestFingerprint) {
        return { status: "idempotency_conflict" };
      }
      return {
        status: "replayed",
        message: this.mapMessage(replay.message, input.senderIdentityId)
      };
    }
  }

  public async isMessageSenderBlocked(
    conversationId: number,
    senderUserId: number,
    senderIdentityId?: number
  ): Promise<boolean> {
    const blockingRecipient = await this.client.conversationParticipant.findFirst({
      where: {
        conversationId,
        userId: { not: senderUserId },
        deletedAt: null,
        conversation: {
          type: ConversationType.DIRECT,
          deletedAt: null,
          participants: {
            some: {
              identityId: senderIdentityId ?? senderUserId,
              deletedAt: null
            }
          }
        },
        identity: {
          ownedContacts: {
            some: {
              contactIdentityId: senderIdentityId ?? senderUserId,
              blockedAt: { not: null },
              deletedAt: null
            }
          }
        }
      },
      select: { id: true }
    });

    return Boolean(blockingRecipient);
  }

  public async recallMessage(input: RecallMessageInput): Promise<StandardRecallRepositoryOutcome> {
    return this.client.$transaction(async (tx) => {
      const participant = await tx.conversationParticipant.findFirst({
        where: {
          conversationId: input.conversationId,
          identityId: input.senderIdentityId ?? input.senderUserId,
          deletedAt: null,
          conversation: { deletedAt: null }
        },
        select: { createdAt: true }
      });
      if (!participant) {
        return { status: "not_found" } as const;
      }
      const scope = {
        id: input.messageId,
        conversationId: input.conversationId,
        senderUserId: input.senderUserId,
        senderIdentityId: input.senderIdentityId ?? input.senderUserId,
        createdAt: { gte: participant.createdAt },
        deletedAt: null,
        conversation: {
          deletedAt: null,
          participants: {
            some: {
              identityId: input.senderIdentityId ?? input.senderUserId,
              deletedAt: null
            }
          }
        }
      } satisfies Prisma.MessageWhereInput;
      const candidate = await tx.message.findFirst({
        where: scope,
        include: messageInclude
      });

      if (!candidate) {
        return { status: "not_found" } as const;
      }

      if (candidate.recalledAt !== null || candidate.recallMode !== null) {
        return {
          status: "already_recalled",
          message: this.mapMessage(
            candidate,
            input.senderIdentityId ?? input.senderUserId,
            input.now
          )
        } as const;
      }

      if (input.now.getTime() > candidate.recallDeadlineAt.getTime()) {
        return { status: "window_expired" } as const;
      }

      const claimed = await tx.message.updateMany({
        where: {
          id: input.messageId,
          conversationId: input.conversationId,
          senderUserId: input.senderUserId,
          senderIdentityId: input.senderIdentityId ?? input.senderUserId,
          createdAt: { gte: participant.createdAt },
          recalledAt: null,
          recallMode: null,
          deletedAt: null,
          recallDeadlineAt: { gte: input.now }
        },
        data: {
          lifecycleVersion: { increment: 1 }
        }
      });

      if (claimed.count !== 1) {
        const latest = await tx.message.findFirst({
          where: scope,
          include: messageInclude
        });

        if (latest?.recalledAt !== null && latest?.recalledAt !== undefined) {
          return {
            status: "already_recalled",
            message: this.mapMessage(
              latest,
              input.senderIdentityId ?? input.senderUserId,
              input.now
            )
          } as const;
        }
        if (latest && input.now.getTime() > latest.recallDeadlineAt.getTime()) {
          return { status: "window_expired" } as const;
        }
        return { status: "not_found" } as const;
      }

      const recallMode =
        input.mode === "traceless" ? MessageRecallMode.TRACELESS : MessageRecallMode.STANDARD;
      const deletionAction =
        input.mode === "traceless"
          ? ImDeletionAction.TRACELESS_RECALL
          : ImDeletionAction.STANDARD_RECALL;
      const auditAction =
        input.mode === "traceless" ? "im.message.traceless_recall" : "im.message.standard_recall";
      await tx.imMessageTranslation.deleteMany({ where: { messageId: input.messageId } });
      await tx.message.update({
        where: { id: input.messageId },
        data: {
          content: null,
          metadata: Prisma.DbNull,
          recalledAt: input.now,
          recallMode,
          contentPurgedAt: input.now
        }
      });

      await tx.messageReaction.updateMany({
        where: { messageId: input.messageId, deletedAt: null },
        data: { deletedAt: input.now }
      });
      await tx.imDeletionSync.upsert({
        where: {
          messageId_action: {
            messageId: input.messageId,
            action: deletionAction
          }
        },
        create: {
          conversationId: input.conversationId,
          messageId: input.messageId,
          action: deletionAction,
          mediaKind: null,
          occurredAt: input.now
        },
        update: {}
      });
      await tx.auditLog.create({
        data: {
          actorId: input.senderUserId,
          action: auditAction,
          targetType: "Message",
          targetId: input.messageId,
          ip: null,
          userAgent: null,
          metadata: {
            conversationId: input.conversationId,
            recallMode: input.mode
          },
          createdAt: input.now
        }
      });
      if (input.mode === "traceless") {
        await tx.conversationParticipant.updateMany({
          where: {
            conversationId: input.conversationId,
            identityId: { not: input.senderIdentityId ?? input.senderUserId },
            deletedAt: null,
            createdAt: { lte: candidate.createdAt },
            unreadCount: { gt: 0 },
            OR: [{ lastReadMessageId: null }, { lastReadMessageId: { lt: input.messageId } }]
          },
          data: { unreadCount: { decrement: 1 } }
        });
      }
      await tx.conversation.update({
        where: { id: input.conversationId },
        data: { updatedAt: input.now }
      });

      const updated = await tx.message.findUnique({
        where: { id: input.messageId },
        include: messageInclude
      });

      if (!updated) {
        return { status: "not_found" } as const;
      }

      return {
        status: "recalled",
        message: this.mapMessage(updated, input.senderIdentityId ?? input.senderUserId, input.now)
      } as const;
    });
  }

  public async listMessages(input: ListMessagesInput): Promise<MessageHistoryPayload | null> {
    const viewerIdentityId = input.identityId ?? input.userId;
    const participant = await this.findConversationParticipant(
      input.conversationId,
      viewerIdentityId
    );

    if (!participant) {
      return null;
    }

    const pageSize = Math.min(Math.max(input.pageSize ?? 20, 1), 100);
    const where: Prisma.MessageWhereInput = {
      conversationId: input.conversationId,
      ...this.availableMessageWhere(new Date()),
      createdAt: { gte: participant.createdAt },
      userDeletions: {
        none: { identityId: viewerIdentityId, deletedAt: null }
      },
      ...(input.beforeId || participant.clearedThroughMessageId
        ? {
            id: {
              ...(input.beforeId ? { lt: input.beforeId } : {}),
              ...(participant.clearedThroughMessageId
                ? { gt: participant.clearedThroughMessageId }
                : {})
            }
          }
        : {})
    };
    const [list, total] = await Promise.all([
      this.client.message.findMany({
        where,
        include: messageInclude,
        take: pageSize,
        orderBy: [{ id: "desc" }]
      }),
      this.client.message.count({ where })
    ]);

    return {
      list: list.map((message) => this.mapMessage(message, viewerIdentityId)),
      total,
      page: 1,
      page_size: pageSize,
      nextCursor: total > list.length ? (list[list.length - 1]?.id ?? null) : null
    };
  }

  public async deleteMessageForUser(
    input: DeleteMessageForUserInput
  ): Promise<DeleteMessageForUserPayload | null> {
    const result = await this.deleteMessagesForUser({
      ...input,
      messageIds: [input.messageId],
      idempotencyKey: randomUUID()
    });
    if (!result) return null;
    return {
      conversationId: result.conversationId,
      messageId: input.messageId,
      deleted: true
    };
  }

  public async deleteMessagesForUser(
    input: DeleteMessagesForUserInput
  ): Promise<DeleteMessagesForUserPayload | null> {
    const identityId = input.identityId ?? input.userId;
    const messageIds = [...new Set(input.messageIds)].sort((left, right) => left - right);
    const requestFingerprint = createHash("sha256")
      .update(JSON.stringify({ conversationId: input.conversationId, messageIds }))
      .digest("hex");

    try {
      return await this.client.$transaction(async (tx) => {
        const participant = await tx.conversationParticipant.findFirst({
          where: {
            conversationId: input.conversationId,
            identityId,
            deletedAt: null,
            conversation: { deletedAt: null }
          },
          select: { createdAt: true, clearedThroughMessageId: true }
        });
        if (!participant) return null;
        const messages = await tx.message.findMany({
          where: {
            id: {
              in: messageIds,
              ...(participant.clearedThroughMessageId
                ? { gt: participant.clearedThroughMessageId }
                : {})
            },
            conversationId: input.conversationId,
            createdAt: { gte: participant.createdAt },
            deletedAt: null,
            conversation: {
              deletedAt: null,
              participants: {
                some: { identityId, deletedAt: null }
              }
            }
          },
          select: { id: true }
        });
        if (messages.length !== messageIds.length) return null;

        const existing = await tx.imMessageBatchDeleteCommand.findUnique({
          where: {
            ownerIdentityId_idempotencyKey: {
              ownerIdentityId: identityId,
              idempotencyKey: input.idempotencyKey
            }
          }
        });
        if (existing) {
          return this.resolveBatchDeleteReplay(existing, requestFingerprint);
        }

        for (const messageId of messageIds) {
          await tx.messageUserDeletion.upsert({
            where: { identityId_messageId: { identityId, messageId } },
            create: {
              conversationId: input.conversationId,
              messageId,
              userId: input.userId,
              identityId
            },
            update: { deletedAt: null }
          });
        }

        const storedResult = {
          conversationId: input.conversationId,
          messageIds,
          count: messageIds.length,
          deleted: true as const
        };
        await tx.imMessageBatchDeleteCommand.create({
          data: {
            conversationId: input.conversationId,
            ownerUserId: input.userId,
            ownerIdentityId: identityId,
            idempotencyKey: input.idempotencyKey,
            requestFingerprint,
            resultJson: storedResult
          }
        });
        await tx.auditLog.create({
          data: {
            actorId: input.userId,
            action: "im.messages.deleted_for_user",
            targetType: "Conversation",
            targetId: input.conversationId,
            ip: null,
            userAgent: null,
            metadata: {
              conversationId: input.conversationId,
              count: messageIds.length,
              messageIds
            }
          }
        });

        return { ...storedResult, replayed: false };
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;
      const existing = await this.client.imMessageBatchDeleteCommand.findUnique({
        where: {
          ownerIdentityId_idempotencyKey: {
            ownerIdentityId: identityId,
            idempotencyKey: input.idempotencyKey
          }
        }
      });
      if (!existing) throw error;
      return this.resolveBatchDeleteReplay(existing, requestFingerprint);
    }
  }

  public async setMessageReaction(
    input: MessageReactionMutationInput
  ): Promise<MessageReactionMutationOutcome> {
    return this.client.$transaction(async (tx) => {
      const messageLocked = await this.lockMessageForParticipant(tx, input);
      if (!messageLocked) return { status: "not_found" };

      const activeReactions = await tx.messageReaction.findMany({
        where: {
          messageId: input.messageId,
          identityId: input.identityId ?? input.userId,
          deletedAt: null
        },
        select: { emoji: true },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
      });
      const category = getMessageReactionCategory(input.emoji);
      const activeInSlot = activeReactions.find(
        (reaction) => getMessageReactionCategory(reaction.emoji) === category
      );

      if (activeInSlot) {
        const current = await tx.message.findUnique({
          where: { id: input.messageId },
          include: messageInclude
        });
        if (!current) return { status: "not_found" };

        const message = this.mapMessage(current, input.identityId ?? input.userId);
        if (activeInSlot.emoji === input.emoji) {
          return { status: "unchanged", message };
        }

        return {
          status: "slot_occupied",
          message,
          activeEmoji: activeInSlot.emoji
        };
      }

      await tx.messageReaction.upsert({
        where: {
          messageId_identityId_emoji: {
            messageId: input.messageId,
            identityId: input.identityId ?? input.userId,
            emoji: input.emoji
          }
        },
        create: {
          messageId: input.messageId,
          userId: input.userId,
          identityId: input.identityId ?? input.userId,
          emoji: input.emoji
        },
        update: { deletedAt: null }
      });

      const updated = await tx.message.update({
        where: { id: input.messageId },
        data: { reactionVersion: { increment: 1 } },
        include: messageInclude
      });
      return {
        status: "updated",
        message: this.mapMessage(updated, input.identityId ?? input.userId)
      };
    });
  }

  public async removeMessageReaction(
    input: MessageReactionMutationInput
  ): Promise<MessageReactionMutationOutcome> {
    return this.client.$transaction(async (tx) => {
      const messageLocked = await this.lockMessageForParticipant(tx, input);
      if (!messageLocked) return { status: "not_found" };

      const removed = await tx.messageReaction.updateMany({
        where: {
          messageId: input.messageId,
          identityId: input.identityId ?? input.userId,
          emoji: input.emoji,
          deletedAt: null
        },
        data: { deletedAt: new Date() }
      });

      if (removed.count === 0) {
        const current = await tx.message.findUnique({
          where: { id: input.messageId },
          include: messageInclude
        });
        if (!current) return { status: "not_found" };
        return {
          status: "unchanged",
          message: this.mapMessage(current, input.identityId ?? input.userId)
        };
      }

      const updated = await tx.message.update({
        where: { id: input.messageId },
        data: { reactionVersion: { increment: 1 } },
        include: messageInclude
      });
      return {
        status: "updated",
        message: this.mapMessage(updated, input.identityId ?? input.userId)
      };
    });
  }

  public async markConversationRead(input: {
    conversationId: number;
    userId: number;
    identityId?: number;
  }): Promise<{ conversationId: number; unreadCount: number } | null> {
    const participant = await this.findConversationParticipant(
      input.conversationId,
      input.identityId ?? input.userId
    );

    if (!participant) {
      return null;
    }

    const latestMessage = await this.client.message.findFirst({
      where: {
        conversationId: input.conversationId,
        createdAt: { gte: participant.createdAt },
        deletedAt: null
      },
      orderBy: { id: "desc" },
      select: { id: true, createdAt: true }
    });

    await this.client.conversationParticipant.updateMany({
      where: {
        conversationId: input.conversationId,
        identityId: input.identityId ?? input.userId,
        deletedAt: null
      },
      data: {
        unreadCount: 0,
        lastReadMessageId: latestMessage?.id ?? null,
        lastReadAt: latestMessage?.createdAt ?? new Date()
      }
    });

    return {
      conversationId: input.conversationId,
      unreadCount: 0
    };
  }

  public async markConversationUnread(input: {
    conversationId: number;
    userId: number;
    identityId?: number;
  }): Promise<ConversationPayload | null> {
    const participant = await this.client.conversationParticipant.findFirst({
      where: {
        conversationId: input.conversationId,
        identityId: input.identityId ?? input.userId,
        deletedAt: null,
        conversation: { deletedAt: null }
      },
      select: { id: true, unreadCount: true }
    });
    if (!participant) return null;

    await this.client.conversationParticipant.update({
      where: { id: participant.id },
      data: { unreadCount: Math.max(1, participant.unreadCount), hiddenAt: null }
    });
    return this.getConversationForUser(
      input.conversationId,
      input.identityId ?? input.userId,
      input.userId
    );
  }

  public async updateConversationPreferences(
    input: UpdateConversationPreferencesInput
  ): Promise<ConversationPayload | null> {
    const participant = await this.findConversationParticipant(
      input.conversationId,
      input.identityId ?? input.userId
    );
    if (!participant) return null;

    await this.client.conversationParticipant.update({
      where: { id: participant.id },
      data: {
        ...(input.isPinned === undefined ? {} : { isPinned: input.isPinned }),
        ...(input.isMuted === undefined ? {} : { isMuted: input.isMuted }),
        ...(input.autoTranslateMessages === undefined
          ? {}
          : { autoTranslateMessages: input.autoTranslateMessages }),
        hiddenAt: null
      }
    });
    return this.getConversationForUser(
      input.conversationId,
      input.identityId ?? input.userId,
      input.userId
    );
  }

  public async hideConversation(input: {
    conversationId: number;
    userId: number;
    identityId?: number;
  }): Promise<ConversationPayload | null> {
    return this.clearConversationHistory(input, true);
  }

  public async clearConversationMessages(input: {
    conversationId: number;
    userId: number;
    identityId?: number;
  }): Promise<ConversationPayload | null> {
    return this.clearConversationHistory(input, false);
  }

  private async clearConversationHistory(
    input: {
      conversationId: number;
      userId: number;
      identityId?: number;
    },
    hide: boolean
  ): Promise<ConversationPayload | null> {
    const cleared = await this.client.$transaction(async (tx) => {
      const participant = await tx.conversationParticipant.findFirst({
        where: {
          conversationId: input.conversationId,
          identityId: input.identityId ?? input.userId,
          deletedAt: null,
          conversation: { deletedAt: null }
        },
        select: { id: true, createdAt: true }
      });
      if (!participant) return false;

      const latestMessage = await tx.message.findFirst({
        where: {
          conversationId: input.conversationId,
          createdAt: { gte: participant.createdAt },
          deletedAt: null
        },
        orderBy: { id: "desc" },
        select: { id: true, createdAt: true }
      });

      await tx.conversationParticipant.update({
        where: { id: participant.id },
        data: {
          ...(hide ? { hiddenAt: new Date(), isPinned: false } : {}),
          clearedThroughMessageId: latestMessage?.id ?? null,
          lastReadMessageId: latestMessage?.id ?? null,
          lastReadAt: latestMessage?.createdAt ?? new Date(),
          unreadCount: 0
        }
      });
      await tx.auditLog.create({
        data: {
          actorId: input.userId,
          action: hide ? "im.conversation.deleted_for_user" : "im.conversation.messages_cleared",
          targetType: "Conversation",
          targetId: input.conversationId,
          ip: null,
          userAgent: null,
          metadata: { clearedThroughMessageId: latestMessage?.id ?? null }
        }
      });
      return true;
    });

    return cleared
      ? this.getConversationForUser(
          input.conversationId,
          input.identityId ?? input.userId,
          input.userId
        )
      : null;
  }

  public async listContacts(
    identityId: number,
    input: PaginationInput
  ): Promise<PaginatedResponse<ContactPayload>> {
    const pagination = toPrismaPagination(input);
    const directConversations = await this.client.conversation.findMany({
      where: {
        type: ConversationType.DIRECT,
        deletedAt: null,
        participants: {
          some: { identityId, hiddenAt: null, deletedAt: null }
        }
      },
      select: {
        participants: {
          where: { deletedAt: null },
          select: {
            identityId: true,
            identity: { select: { isActive: true, deletedAt: true } }
          }
        }
      }
    });
    const directPeerIdentityIds = Array.from(
      new Set(
        directConversations.flatMap((conversation) => {
          if (
            conversation.participants.length !== 2 ||
            conversation.participants.some(
              (participant) => !participant.identity.isActive || participant.identity.deletedAt
            )
          ) {
            return [];
          }
          return conversation.participants
            .filter((participant) => participant.identityId !== identityId)
            .map((participant) => participant.identityId);
        })
      )
    );
    const where: Prisma.ContactWhereInput = {
      ownerIdentityId: identityId,
      deletedAt: null,
      contactUser: {
        deletedAt: null,
        isActive: true
      },
      contactIdentity: {
        deletedAt: null,
        isActive: true
      },
      OR: [
        {
          source: "friend_request",
          contactIdentity: {
            ownedContacts: {
              some: {
                contactIdentityId: identityId,
                source: "friend_request",
                deletedAt: null
              }
            }
          }
        },
        {
          contactIdentityId: { in: directPeerIdentityIds }
        }
      ]
    };
    const [list, total] = await Promise.all([
      this.client.contact.findMany({
        where,
        include: contactInclude,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      }),
      this.client.contact.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((contact) => this.mapContact(contact)),
      total,
      pagination
    );
  }

  public async listContactCardCandidates(
    userId: number,
    identityId: number,
    input: ContactCardCandidateListInput
  ): Promise<PaginatedResponse<ContactCardCandidatePayload>> {
    const pagination = toPrismaPagination(input);
    const query = input.query?.trim() ?? "";
    const searchWhere: Prisma.UserWhereInput = query
      ? {
          OR: [{ username: { contains: query } }, { needoId: { contains: query } }]
        }
      : {};
    const projection = {
      id: true,
      needoId: true,
      username: true,
      avatarUrl: true
    } as const;

    const self = await this.client.user.findFirst({
      where: {
        id: userId,
        isActive: true,
        deletedAt: null,
        ...searchWhere
      },
      select: projection
    });
    const selfCount = self ? 1 : 0;
    const friendWhere: Prisma.UserWhereInput = {
      id: { not: userId },
      isActive: true,
      deletedAt: null,
      contactEntries: {
        some: {
          ownerIdentityId: identityId,
          blockedAt: null,
          deletedAt: null,
          contactIdentity: {
            isActive: true,
            deletedAt: null,
            ownedContacts: {
              some: {
                contactIdentityId: identityId,
                blockedAt: null,
                deletedAt: null
              }
            }
          }
        }
      },
      ...searchWhere
    };

    const includeSelfOnPage = Boolean(self && pagination.skip === 0);
    const friendSkip = Math.max(0, pagination.skip - selfCount);
    const friendTake = Math.max(0, pagination.take - (includeSelfOnPage ? 1 : 0));
    const [friends, friendCount] = await Promise.all([
      friendTake > 0
        ? this.client.user.findMany({
            where: friendWhere,
            select: projection,
            skip: friendSkip,
            take: friendTake,
            orderBy: [{ username: "asc" }, { needoId: "asc" }, { id: "asc" }]
          })
        : Promise.resolve([]),
      this.client.user.count({ where: friendWhere })
    ]);

    const list: ContactCardCandidatePayload[] = [];
    if (includeSelfOnPage && self) {
      list.push({
        targetUserId: self.needoId,
        needoId: self.needoId,
        nickname: self.username,
        avatarUrl: self.avatarUrl,
        relationship: "self"
      });
    }
    list.push(
      ...friends.map((candidate) => ({
        targetUserId: candidate.needoId,
        needoId: candidate.needoId,
        nickname: candidate.username,
        avatarUrl: candidate.avatarUrl,
        relationship: "friend" as const
      }))
    );

    return buildPaginatedResponse(list, selfCount + friendCount, pagination);
  }

  public async searchDirectory(
    userId: number,
    input: DirectorySearchInput
  ): Promise<PaginatedResponse<ParticipantPayload>> {
    const pagination = toPrismaPagination(input);
    const query = input.query.trim();
    const where: Prisma.UserWhereInput = {
      id: { not: userId },
      isActive: true,
      deletedAt: null,
      identities: {
        some: {
          type: { in: PERSONAL_IDENTITY_TYPES },
          isActive: true,
          deletedAt: null
        }
      },
      OR: [
        { username: { contains: query } },
        { needoId: { contains: query } },
        {
          customerProfile: {
            is: { displayName: { contains: query }, deletedAt: null }
          }
        },
        {
          technicianProfile: {
            is: { displayName: { contains: query }, deletedAt: null }
          }
        },
        {
          identities: {
            some: {
              displayName: { contains: query },
              type: { in: PERSONAL_IDENTITY_TYPES },
              isActive: true,
              deletedAt: null
            }
          }
        }
      ],
      NOT: {
        contactEntries: {
          some: {
            ownerIdentityId: input.ownerIdentityId ?? userId,
            deletedAt: null
          }
        }
      }
    };
    const select = {
      ...imParticipantUserSelect,
      identities: {
        where: {
          type: { in: PERSONAL_IDENTITY_TYPES },
          isActive: true,
          deletedAt: null
        },
        select: imParticipantIdentitySelect,
        orderBy: [{ isDefault: "desc" as const }, { id: "asc" as const }]
      }
    } satisfies Prisma.UserSelect;
    const [list, total] = await Promise.all([
      this.client.user.findMany({
        where,
        select,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ username: "asc" }, { id: "asc" }]
      }),
      this.client.user.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((user) =>
        this.mapParticipant(
          user,
          undefined,
          this.findCanonicalParticipantIdentity(user.identities)
        )
      ),
      total,
      pagination
    );
  }

  public async addContact(input: AddContactInput): Promise<ContactPayload> {
    const ownerIdentityId =
      input.ownerIdentityId ?? (await this.findCanonicalIdentityIdForUser(input.ownerUserId));
    const contactIdentityId = await this.findCanonicalPersonalIdentityId(
      this.client,
      input.contactUserId
    );
    if (!ownerIdentityId || !contactIdentityId) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_NOT_FOUND,
        message: "error.auth.identity_not_found",
        statusCode: 403
      });
    }
    const contact = await this.client.contact.upsert({
      where: {
        ownerIdentityId_contactIdentityId: {
          ownerIdentityId,
          contactIdentityId
        }
      },
      create: {
        ownerUserId: input.ownerUserId,
        ownerIdentityId,
        contactUserId: input.contactUserId,
        contactIdentityId,
        source: input.source
      },
      update: {
        blockedAt: null,
        deletedAt: null,
        source: input.source
      },
      include: contactInclude
    });

    return this.mapContact(contact);
  }

  public async setContactBlocked(input: SetContactBlockedInput): Promise<ContactPayload | null> {
    const contact = await this.client.contact.findFirst({
      where: {
        id: input.contactId,
        ownerIdentityId: input.ownerIdentityId ?? input.ownerUserId,
        deletedAt: null,
        contactUser: {
          deletedAt: null,
          isActive: true
        }
      },
      select: { id: true, blockedAt: true }
    });
    if (!contact) return null;

    const updated = await this.client.contact.update({
      where: { id: contact.id },
      data: {
        blockedAt: input.isBlocked ? (contact.blockedAt ?? new Date()) : null
      },
      include: contactInclude
    });
    return this.mapContact(updated);
  }

  public async deleteContact(input: DeleteContactInput): Promise<DeletedContactPayload | null> {
    return this.client.$transaction(async (tx) => {
      const actorIdentityId =
        input.ownerIdentityId ?? (await this.findCanonicalIdentityId(tx, input.ownerUserId));
      if (!actorIdentityId) return null;
      const locked = await tx.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`
          SELECT id
          FROM contacts
          WHERE id = ${input.contactId}
            AND owner_user_id = ${input.ownerUserId}
            AND owner_identity_id = ${actorIdentityId}
            AND deleted_at IS NULL
          FOR UPDATE
        `
      );
      if (locked.length !== 1) return null;

      const ownedContact = await tx.contact.findFirst({
        where: {
          id: input.contactId,
          ownerIdentityId: actorIdentityId,
          deletedAt: null,
          contactUser: {
            deletedAt: null,
            isActive: true
          }
        },
        select: { id: true, contactUserId: true, contactIdentityId: true }
      });
      if (!ownedContact) return null;

      const actorUserId = input.ownerUserId;
      const counterpartUserId = ownedContact.contactUserId;
      const counterpartIdentityId = ownedContact.contactIdentityId;
      const bilateralContactWhere: Prisma.ContactWhereInput = {
        OR: [
          { ownerIdentityId: actorIdentityId, contactIdentityId: counterpartIdentityId },
          { ownerIdentityId: counterpartIdentityId, contactIdentityId: actorIdentityId }
        ]
      };
      const bilateralFollowWhere: Prisma.FollowWhereInput = {
        OR: [
          { followerIdentityId: actorIdentityId, followingIdentityId: counterpartIdentityId },
          { followerIdentityId: counterpartIdentityId, followingIdentityId: actorIdentityId }
        ]
      };
      const contacts = await tx.contact.findMany({
        where: bilateralContactWhere,
        select: { id: true },
        orderBy: { id: "asc" }
      });
      const contactIds = contacts.map((contact) => contact.id);
      const deletedContacts = await tx.contact.deleteMany({ where: bilateralContactWhere });
      const deletedFollows = await tx.follow.deleteMany({ where: bilateralFollowWhere });
      const conversation = await tx.conversation.findFirst({
        where: {
          accessPolicy: ConversationAccessPolicy.FRIENDSHIP_REQUIRED,
          friendshipPairKey: toFriendshipPairKey(actorIdentityId, counterpartIdentityId),
          deletedAt: null
        },
        select: { id: true }
      });
      if (conversation) {
        await tx.conversationParticipant.deleteMany({
          where: { conversationId: conversation.id, identityId: actorIdentityId }
        });
      }
      const deletedAt = new Date();
      await tx.auditLog.create({
        data: {
          actorId: actorUserId,
          action: "im.friendship.deleted",
          targetType: "User",
          targetId: counterpartUserId,
          ip: null,
          userAgent: null,
          metadata: {
            actorIdentityId,
            counterpartIdentityId,
            contactIds,
            conversationId: conversation?.id ?? null
          }
        }
      });

      return {
        actorUserId,
        actorIdentityId,
        counterpartUserId,
        counterpartIdentityId,
        contactIds,
        deletedContactCount: deletedContacts.count,
        deletedFollowCount: deletedFollows.count,
        deletedConversationId: conversation?.id ?? null,
        deleted: true,
        deletedAt
      };
    });
  }

  public ensureDirectContactConversation(
    input: EnsureTechnicianApplicationContactInput
  ): Promise<{ conversationId: number }> {
    return this.client.$transaction(async (transaction) => {
      const serviceIdentityId = await this.findCanonicalIdentityId(
        transaction,
        input.serviceUserId
      );
      const applicantIdentityId = await this.findCanonicalIdentityId(
        transaction,
        input.applicantUserId
      );
      const creatorIdentityId = await this.findCanonicalIdentityId(
        transaction,
        input.createdByUserId
      );
      if (!serviceIdentityId || !applicantIdentityId || !creatorIdentityId) {
        throw new AppError({
          code: ERROR_CODES.IDENTITY_NOT_FOUND,
          message: "error.auth.identity_not_found",
          statusCode: 403
        });
      }
      await Promise.all([
        this.upsertTechnicianApplicationContact(
          transaction,
          input.serviceUserId,
          input.applicantUserId,
          serviceIdentityId,
          applicantIdentityId
        ),
        this.upsertTechnicianApplicationContact(
          transaction,
          input.applicantUserId,
          input.serviceUserId,
          applicantIdentityId,
          serviceIdentityId
        )
      ]);

      const candidates = await transaction.conversation.findMany({
        where: {
          type: ConversationType.DIRECT,
          accessPolicy: ConversationAccessPolicy.BUSINESS_CONTEXT,
          deletedAt: null,
          participants: {
            some: {
              identityId: { in: [serviceIdentityId, applicantIdentityId] },
              deletedAt: null
            }
          }
        },
        select: {
          id: true,
          participants: {
            where: { deletedAt: null },
            select: { identityId: true }
          }
        }
      });
      const exact = candidates.find((conversation) => {
        const participants = new Set(conversation.participants.map((item) => item.identityId));
        return (
          participants.size === 2 &&
          participants.has(serviceIdentityId) &&
          participants.has(applicantIdentityId)
        );
      });
      if (exact) {
        return { conversationId: exact.id };
      }

      const created = await transaction.conversation.create({
        data: {
          type: ConversationType.DIRECT,
          accessPolicy: ConversationAccessPolicy.BUSINESS_CONTEXT,
          friendshipPairKey: null,
          createdByUserId: input.createdByUserId,
          createdByIdentityId: creatorIdentityId,
          participants: {
            create: [
              { userId: input.serviceUserId, identityId: serviceIdentityId, role: "member" },
              { userId: input.applicantUserId, identityId: applicantIdentityId, role: "member" }
            ]
          }
        },
        select: { id: true }
      });
      return { conversationId: created.id };
    });
  }

  public async getDirectoryProfile(
    viewerUserId: number,
    viewerIdentityId: number,
    targetUserId: number,
    targetIdentityId: number | null
  ): Promise<DirectoryProfilePayload | null> {
    const databaseClock = await this.client.$queryRaw<Array<{ dbNow: Date }>>(
      Prisma.sql`SELECT CURRENT_TIMESTAMP(3) AS dbNow`
    );
    const dbNow = databaseClock[0]?.dbNow;
    if (!dbNow) {
      throw new Error("Database clock query returned no row");
    }
    const user = await this.client.user.findFirst({
      where: { id: targetUserId, isActive: true, deletedAt: null },
      select: {
        id: true,
        needoId: true,
        username: true,
        avatarUrl: true,
        identities: {
          where: { deletedAt: null, isActive: true },
          select: {
            id: true,
            type: true,
            scopeType: true,
            scopeId: true,
            displayName: true,
            isDefault: true
          },
          orderBy: [{ isDefault: "desc" }, { id: "asc" }]
        },
        platformMembershipEntitlements: {
          where: {
            deletedAt: null,
            startsAt: { lte: dbNow },
            supersededAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: dbNow } }],
            tierVersion: {
              status: {
                in: [
                  PlatformMembershipVersionStatus.PUBLISHED,
                  PlatformMembershipVersionStatus.ARCHIVED
                ]
              },
              deletedAt: null,
              tier: { deletedAt: null }
            }
          },
          orderBy: [{ startsAt: "desc" }, { id: "desc" }],
          take: 1,
          select: {
            tierVersion: {
              select: { tier: { select: { code: true } } }
            }
          }
        },
        membershipAdjustments: {
          where: {
            deletedAt: null,
            supersededAt: null,
            effectiveFrom: { lte: dbNow },
            tierVersionId: { not: null }
          },
          orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
          take: 1,
          select: {
            tierVersion: {
              select: { tier: { select: { code: true } } }
            }
          }
        },
        customerProfile: {
          select: {
            id: true,
            displayName: true,
            bio: true,
            city: true,
            isPublic: true,
            gender: true,
            age: true,
            heightCm: true,
            languages: true,
            visibility: true,
            deletedAt: true,
            reviewSummary: {
              select: {
                ratingAverage: true,
                reviewCount: true,
                deletedAt: true
              }
            }
          }
        },
        technicianProfile: {
          select: {
            id: true,
            displayName: true,
            bio: true,
            city: true,
            serviceArea: true,
            yearsExperience: true,
            age: true,
            heightCm: true,
            languages: true,
            visibility: true,
            employmentType: true,
            status: true,
            verifiedAt: true,
            deletedAt: true,
            reviewSummary: {
              select: {
                ratingAverage: true,
                reviewCount: true,
                deletedAt: true
              }
            }
          }
        }
      }
    });
    if (!user) {
      return null;
    }
    const contextContact =
      targetIdentityId === null
        ? await this.client.contact.findFirst({
            where: {
              ownerIdentityId: viewerIdentityId,
              contactUserId: targetUserId,
              deletedAt: null
            },
            select: { id: true, contactIdentityId: true, blockedAt: true },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
          })
        : null;
    const resolvedTargetIdentityId =
      targetIdentityId ??
      contextContact?.contactIdentityId ??
      this.findCanonicalParticipantIdentity(user.identities)?.id;
    if (!resolvedTargetIdentityId) {
      return null;
    }
    const identityCard = await this.buildDirectoryIdentityCard(user, resolvedTargetIdentityId);
    const directoryParticipant = this.mapParticipant({
      ...user,
      username: identityCard.displayName
    });
    if (viewerUserId === targetUserId && viewerIdentityId === resolvedTargetIdentityId) {
      return {
        user: directoryParticipant,
        identityCard,
        relationship: "self",
        contactId: null,
        friendRequest: null
      };
    }
    const contact =
      contextContact?.contactIdentityId === resolvedTargetIdentityId &&
      contextContact.blockedAt === null
        ? { id: contextContact.id }
        : await this.client.contact.findFirst({
            where: {
              ownerIdentityId: viewerIdentityId,
              contactIdentityId: resolvedTargetIdentityId,
              deletedAt: null,
              blockedAt: null
            },
            select: { id: true }
          });
    const technicianContactDetails =
      contact && identityCard.entityType === "technician" && user.technicianProfile
        ? await this.loadTechnicianContactDetails(user.technicianProfile.id, dbNow)
        : undefined;
    const reciprocalContact = contact
      ? await this.client.contact.findFirst({
          where: {
            ownerIdentityId: resolvedTargetIdentityId,
            contactIdentityId: viewerIdentityId,
            source: "friend_request",
            deletedAt: null,
            blockedAt: null
          },
          select: { id: true }
        })
      : null;
    if (contact && reciprocalContact) {
      return {
        user: directoryParticipant,
        identityCard,
        relationship: "friend",
        contactId: contact.id,
        friendRequest: null,
        ...(technicianContactDetails ? { technicianContactDetails } : {})
      };
    }
    const friendRequest = await this.client.friendRequest.findFirst({
      where: {
        status: FriendRequestStatus.PENDING,
        expiresAt: { gt: dbNow },
        deletedAt: null,
        OR: [
          { requesterIdentityId: viewerIdentityId, targetIdentityId: resolvedTargetIdentityId },
          { requesterIdentityId: resolvedTargetIdentityId, targetIdentityId: viewerIdentityId }
        ]
      },
      include: friendRequestInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });

    return {
      user: directoryParticipant,
      identityCard,
      relationship: friendRequest
        ? friendRequest.requesterIdentityId === viewerIdentityId
          ? "outgoing_pending"
          : "incoming_pending"
        : "none",
      contactId: null,
      friendRequest: friendRequest ? this.mapFriendRequest(friendRequest, dbNow) : null,
      ...(technicianContactDetails ? { technicianContactDetails } : {})
    };
  }

  public async createFriendRequest(
    input: CreateFriendRequestInput
  ): Promise<CreateFriendRequestOutcome> {
    return this.client.$transaction(async (tx) => {
      const requesterIdentityId =
        input.requesterIdentityId ??
        (await this.findCanonicalIdentityId(tx, input.requesterUserId));
      const targetIdentityId =
        input.targetIdentityId ??
        (await this.findCanonicalPersonalIdentityId(tx, input.targetUserId));
      if (!requesterIdentityId || !targetIdentityId) {
        throw new AppError({
          code: ERROR_CODES.IDENTITY_NOT_FOUND,
          message: "error.auth.identity_not_found",
          statusCode: 403
        });
      }
      const databaseClock = await tx.$queryRaw<Array<{ dbNow: Date }>>(
        Prisma.sql`SELECT CURRENT_TIMESTAMP(3) AS dbNow`
      );
      const dbNow = databaseClock[0]?.dbNow;
      if (!dbNow) {
        throw new Error("Database clock query returned no row");
      }
      const orderedUserIds = [input.requesterUserId, input.targetUserId].sort(
        (left, right) => left - right
      );
      const lockedUsers = await tx.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`
          SELECT id
          FROM users
          WHERE id IN (${Prisma.join(orderedUserIds)})
            AND is_active = 1
            AND deleted_at IS NULL
          ORDER BY id
          FOR UPDATE
        `
      );
      if (lockedUsers.length !== 2) {
        return { status: "target_unavailable" };
      }
      const activeIdentityCount = await tx.userIdentity.count({
        where: {
          deletedAt: null,
          isActive: true,
          OR: [
            { id: requesterIdentityId, userId: input.requesterUserId },
            {
              id: targetIdentityId,
              userId: input.targetUserId,
              type: { in: PERSONAL_IDENTITY_TYPES }
            }
          ]
        }
      });
      if (activeIdentityCount !== 2) {
        return { status: "target_unavailable" };
      }
      const reciprocalContactCount = await tx.contact.count({
        where: {
          source: "friend_request",
          deletedAt: null,
          OR: [
            { ownerIdentityId: requesterIdentityId, contactIdentityId: targetIdentityId },
            { ownerIdentityId: targetIdentityId, contactIdentityId: requesterIdentityId }
          ]
        }
      });
      if (reciprocalContactCount === 2) {
        return { status: "already_friends" };
      }
      await this.expireDuePendingForPair(
        tx,
        input.requesterUserId,
        requesterIdentityId,
        targetIdentityId,
        dbNow
      );
      const activePending = await tx.friendRequest.findFirst({
        where: {
          status: FriendRequestStatus.PENDING,
          expiresAt: { gt: dbNow },
          deletedAt: null,
          OR: [
            {
              requesterIdentityId,
              targetIdentityId
            },
            {
              requesterIdentityId: targetIdentityId,
              targetIdentityId: requesterIdentityId
            }
          ]
        },
        include: friendRequestInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      });
      if (activePending) {
        return {
          status: "ready",
          result: {
            friendRequest: this.mapFriendRequest(activePending, dbNow),
            created: false
          }
        };
      }
      const expiresAt = new Date(dbNow.getTime() + 72 * 60 * 60 * 1_000);
      const friendRequest = await tx.friendRequest.create({
        data: {
          requesterUserId: input.requesterUserId,
          requesterIdentityId,
          targetUserId: input.targetUserId,
          targetIdentityId,
          message: input.message?.trim() || null,
          expiresAt
        },
        include: friendRequestInclude
      });
      await tx.notification.create({
        data: {
          recipientUserId: input.targetUserId,
          recipientIdentityId: targetIdentityId,
          actorUserId: input.requesterUserId,
          actorIdentityId: requesterIdentityId,
          type: NotificationType.FRIEND_REQUEST,
          title: "New friend request",
          body: "You have a new friend request.",
          payload: { friendRequestId: friendRequest.id }
        }
      });
      await tx.auditLog.create({
        data: {
          actorId: input.requesterUserId,
          action: "im.friend_request.created",
          targetType: "FriendRequest",
          targetId: friendRequest.id,
          ip: null,
          userAgent: null,
          metadata: {
            targetUserId: input.targetUserId,
            expiresAt: friendRequest.expiresAt.toISOString()
          }
        }
      });

      return {
        status: "ready",
        result: { friendRequest: this.mapFriendRequest(friendRequest, dbNow), created: true }
      };
    });
  }

  public async listFriendRequests(
    identityId: number,
    input: FriendRequestListInput
  ): Promise<PaginatedResponse<FriendRequestPayload>> {
    const pagination = toPrismaPagination(input);
    const databaseClock = await this.client.$queryRaw<Array<{ dbNow: Date }>>(
      Prisma.sql`SELECT CURRENT_TIMESTAMP(3) AS dbNow`
    );
    const dbNow = databaseClock[0]?.dbNow;
    if (!dbNow) {
      throw new Error("Database clock query returned no row");
    }
    const statusWhere: Prisma.FriendRequestWhereInput | undefined =
      input.status === "pending"
        ? { status: FriendRequestStatus.PENDING, expiresAt: { gt: dbNow } }
        : input.status === "expired"
          ? {
              OR: [
                { status: FriendRequestStatus.EXPIRED },
                { status: FriendRequestStatus.PENDING, expiresAt: { lte: dbNow } }
              ]
            }
          : input.status
            ? { status: this.friendRequestStatusToDb(input.status) }
            : undefined;
    const where: Prisma.FriendRequestWhereInput = {
      AND: [
        { deletedAt: null },
        this.friendRequestDirectionWhere(identityId, input.direction ?? "all"),
        ...(statusWhere ? [statusWhere] : [])
      ]
    };
    const [list, total] = await Promise.all([
      this.client.friendRequest.findMany({
        where,
        include: friendRequestInclude,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      }),
      this.client.friendRequest.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((friendRequest) => this.mapFriendRequest(friendRequest, dbNow)),
      total,
      pagination
    );
  }

  public async respondToFriendRequest(
    input: RespondFriendRequestInput
  ): Promise<RespondFriendRequestOutcome> {
    return this.client.$transaction(async (tx) => {
      const actorIdentityId =
        input.actorIdentityId ?? (await this.findCanonicalIdentityId(tx, input.actorUserId));
      if (!actorIdentityId) {
        return { status: "not_found" };
      }
      const databaseClock = await tx.$queryRaw<Array<{ dbNow: Date }>>(
        Prisma.sql`SELECT CURRENT_TIMESTAMP(3) AS dbNow`
      );
      const dbNow = databaseClock[0]?.dbNow;
      if (!dbNow) {
        throw new Error("Database clock query returned no row");
      }
      await tx.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`
          SELECT id
          FROM friend_requests
          WHERE id = ${input.id}
          FOR UPDATE
        `
      );
      const friendRequest = await tx.friendRequest.findFirst({
        where: {
          id: input.id,
          targetIdentityId: actorIdentityId,
          status: FriendRequestStatus.PENDING,
          deletedAt: null
        },
        include: friendRequestInclude
      });

      if (!friendRequest) {
        return { status: "not_found" };
      }
      if (friendRequest.expiresAt.getTime() <= dbNow.getTime()) {
        const expired = await tx.friendRequest.update({
          where: { id: friendRequest.id },
          data: { status: FriendRequestStatus.EXPIRED, expiredAt: dbNow },
          include: friendRequestInclude
        });
        await tx.auditLog.create({
          data: {
            actorId: input.actorUserId,
            action: "im.friend_request.expired",
            targetType: "FriendRequest",
            targetId: friendRequest.id,
            ip: null,
            userAgent: null,
            metadata: { source: "response_guard" }
          }
        });
        return { status: "expired", friendRequest: this.mapFriendRequest(expired, dbNow) };
      }

      const status =
        input.action === "accept" ? FriendRequestStatus.ACCEPTED : FriendRequestStatus.REJECTED;
      const updated = await tx.friendRequest.update({
        where: { id: friendRequest.id },
        data: {
          status,
          respondedAt: dbNow
        },
        include: friendRequestInclude
      });

      if (input.action === "accept") {
        await Promise.all([
          this.upsertContact(
            tx,
            friendRequest.requesterUserId,
            friendRequest.targetUserId,
            friendRequest.requesterIdentityId,
            friendRequest.targetIdentityId
          ),
          this.upsertContact(
            tx,
            friendRequest.targetUserId,
            friendRequest.requesterUserId,
            friendRequest.targetIdentityId,
            friendRequest.requesterIdentityId
          ),
          this.upsertFollow(
            tx,
            friendRequest.requesterUserId,
            friendRequest.targetUserId,
            friendRequest.requesterIdentityId,
            friendRequest.targetIdentityId
          ),
          this.upsertFollow(
            tx,
            friendRequest.targetUserId,
            friendRequest.requesterUserId,
            friendRequest.targetIdentityId,
            friendRequest.requesterIdentityId
          )
        ]);
        await this.restoreFriendshipConversationParticipants(
          tx,
          friendRequest.requesterUserId,
          friendRequest.targetUserId,
          friendRequest.requesterIdentityId,
          friendRequest.targetIdentityId,
          dbNow
        );
      }
      await tx.auditLog.create({
        data: {
          actorId: input.actorUserId,
          action:
            input.action === "accept" ? "im.friend_request.accepted" : "im.friend_request.rejected",
          targetType: "FriendRequest",
          targetId: friendRequest.id,
          ip: null,
          userAgent: null,
          metadata: { requesterUserId: friendRequest.requesterUserId }
        }
      });

      return {
        status: "responded",
        result: {
          friendRequest: this.mapFriendRequest(updated, dbNow),
          recipientUserIds: [friendRequest.requesterUserId, friendRequest.targetUserId]
        }
      };
    });
  }

  public async expireDueFriendRequests(input: {
    batchSize: number;
  }): Promise<FriendRequestPayload[]> {
    return this.client.$transaction(async (tx) => {
      const candidates = await tx.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`
          SELECT id
          FROM friend_requests
          WHERE status = 'pending'
            AND expires_at <= CURRENT_TIMESTAMP(3)
            AND deleted_at IS NULL
          ORDER BY expires_at, id
          LIMIT ${input.batchSize}
          FOR UPDATE SKIP LOCKED
        `
      );
      const ids = candidates.map((candidate) => candidate.id);
      if (ids.length === 0) {
        return [];
      }
      const databaseClock = await tx.$queryRaw<Array<{ dbNow: Date }>>(
        Prisma.sql`SELECT CURRENT_TIMESTAMP(3) AS dbNow`
      );
      const dbNow = databaseClock[0]?.dbNow;
      if (!dbNow) {
        throw new Error("Database clock query returned no row");
      }
      await tx.friendRequest.updateMany({
        where: {
          id: { in: ids },
          status: FriendRequestStatus.PENDING,
          expiresAt: { lte: dbNow },
          deletedAt: null
        },
        data: { status: FriendRequestStatus.EXPIRED, expiredAt: dbNow }
      });
      await tx.auditLog.createMany({
        data: ids.map((id) => ({
          actorId: null,
          action: "im.friend_request.expired",
          targetType: "FriendRequest",
          targetId: id,
          ip: null,
          userAgent: null,
          metadata: { source: "expiry_worker" }
        }))
      });
      const expired = await tx.friendRequest.findMany({
        where: { id: { in: ids }, status: FriendRequestStatus.EXPIRED },
        include: friendRequestInclude,
        orderBy: [{ expiresAt: "asc" }, { id: "asc" }]
      });
      return expired.map((request) => this.mapFriendRequest(request, dbNow));
    });
  }

  public async createSocialPost(input: CreateSocialPostInput): Promise<CreateSocialPostResult> {
    return this.client.$transaction(async (transaction) => {
      const authorIdentityId =
        input.authorIdentityId ??
        (await this.findCanonicalIdentityId(transaction, input.authorUserId));
      if (!authorIdentityId) {
        throw new AppError({
          code: ERROR_CODES.IDENTITY_NOT_FOUND,
          message: "error.auth.identity_not_found",
          statusCode: 403
        });
      }
      const mentionUserIds = Array.from(new Set(input.mentionUserIds));
      const mentionIdentityByUser = new Map<number, number>();
      if (
        mentionUserIds.length !== input.mentionUserIds.length ||
        mentionUserIds.length > 50 ||
        mentionUserIds.includes(input.authorUserId)
      ) {
        throw this.socialPostConflict("error.social.invalid_mention_contact");
      }

      if (mentionUserIds.length > 0) {
        const contacts = await transaction.contact.findMany({
          where: {
            ownerIdentityId: authorIdentityId,
            contactUserId: { in: mentionUserIds },
            blockedAt: null,
            deletedAt: null,
            contactUser: { isActive: true, deletedAt: null }
          },
          select: { contactUserId: true, contactIdentityId: true },
          orderBy: { contactIdentityId: "asc" }
        });
        for (const contact of contacts) {
          if (!mentionIdentityByUser.has(contact.contactUserId)) {
            mentionIdentityByUser.set(contact.contactUserId, contact.contactIdentityId);
          }
        }
        const matchedContactIds = new Set(contacts.map((contact) => contact.contactUserId));
        if (
          matchedContactIds.size !== mentionUserIds.length ||
          mentionUserIds.some((userId) => !matchedContactIds.has(userId))
        ) {
          throw this.socialPostConflict("error.social.invalid_mention_contact");
        }
      }

      const replyToPostId = input.media?.replyToPostId;
      if (replyToPostId !== undefined) {
        const replyTarget = await transaction.socialPost.findFirst({
          where: { id: replyToPostId, deletedAt: null },
          select: { id: true }
        });
        if (!replyTarget) {
          throw this.socialPostConflict("error.social.reply_target_not_found");
        }
      }

      const requestedMediaItems = input.media?.items ?? [];
      const mediaPublicIds = requestedMediaItems.map((item) => item.mediaAssetPublicId);
      if (new Set(mediaPublicIds).size !== mediaPublicIds.length) {
        throw this.socialPostConflict("error.social.media_not_owned");
      }

      const selectedMediaByPublicId = new Map<
        string,
        { id: number; checksumSha256: string | null; url: string }
      >();
      if (mediaPublicIds.length > 0) {
        const mediaAssets = await transaction.mediaAsset.findMany({
          where: {
            ownerUserId: input.authorUserId,
            ownerIdentityId: authorIdentityId,
            entityType: "social_post_upload",
            usageType: "social_post_public",
            isActive: true,
            deletedAt: null,
            purgedAt: null,
            checksumSha256: { in: mediaPublicIds }
          },
          select: {
            id: true,
            checksumSha256: true,
            url: true,
            createdAt: true
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }]
        });
        for (const mediaAsset of mediaAssets) {
          if (
            mediaAsset.checksumSha256 &&
            !selectedMediaByPublicId.has(mediaAsset.checksumSha256)
          ) {
            selectedMediaByPublicId.set(mediaAsset.checksumSha256, mediaAsset);
          }
        }
        if (
          selectedMediaByPublicId.size !== mediaPublicIds.length ||
          mediaPublicIds.some((publicId) => !selectedMediaByPublicId.has(publicId))
        ) {
          throw this.socialPostConflict("error.social.media_not_owned");
        }
      }

      const media = input.media
        ? {
            ...(input.media.quotePostId !== undefined
              ? { quotePostId: input.media.quotePostId }
              : {}),
            ...(input.media.replyToPostId !== undefined
              ? { replyToPostId: input.media.replyToPostId }
              : {}),
            ...(input.media.repostPostId !== undefined
              ? { repostPostId: input.media.repostPostId }
              : {}),
            ...(input.media.postType !== undefined ? { postType: input.media.postType } : {}),
            ...(input.media.locationLabel !== undefined
              ? { locationLabel: input.media.locationLabel }
              : {}),
            ...(input.media.richText !== undefined ? { richText: input.media.richText } : {}),
            items: requestedMediaItems.map((item) => {
              const mediaAsset = selectedMediaByPublicId.get(item.mediaAssetPublicId);
              if (!mediaAsset) {
                throw this.socialPostConflict("error.social.media_not_owned");
              }
              return {
                id: item.id,
                type: item.type,
                url: mediaAsset.url,
                mediaAssetPublicId: item.mediaAssetPublicId,
                ...(item.alt ? { alt: item.alt } : {})
              };
            }),
            mentionUserIds,
            counters: { likes: 0, replies: 0, reposts: 0, views: 1, bookmarks: 0 }
          }
        : undefined;

      const socialPost = await transaction.socialPost.create({
        data: {
          authorUserId: input.authorUserId,
          authorIdentityId,
          content: input.content,
          media: this.toJsonValue(media),
          replyToPostId: replyToPostId ?? null,
          visibility: this.socialPostVisibilityToDb(input.visibility)
        },
        include: socialPostInclude
      });

      const selectedMediaAssetIds = mediaPublicIds.map(
        (publicId) => selectedMediaByPublicId.get(publicId)!.id
      );
      if (selectedMediaAssetIds.length > 0) {
        const updateResult = await transaction.mediaAsset.updateMany({
          where: {
            id: { in: selectedMediaAssetIds },
            ownerUserId: input.authorUserId,
            ownerIdentityId: authorIdentityId,
            entityType: "social_post_upload",
            usageType: "social_post_public",
            isActive: true,
            deletedAt: null,
            purgedAt: null
          },
          data: { entityType: "social_post", entityId: socialPost.id }
        });
        if (updateResult.count !== selectedMediaAssetIds.length) {
          throw this.socialPostConflict("error.social.media_not_owned");
        }
      }

      const notifications: NotificationPayload[] = [];
      for (const recipientUserId of mentionUserIds) {
        const notification = await transaction.notification.create({
          data: {
            recipientUserId,
            recipientIdentityId: mentionIdentityByUser.get(recipientUserId)!,
            actorUserId: input.authorUserId,
            actorIdentityId: authorIdentityId,
            type: NotificationType.SOCIAL,
            title: "动态提醒",
            body: "提醒你查看一条新动态。",
            payload: { kind: "post_mention", postId: socialPost.id }
          }
        });
        notifications.push(this.mapNotification(notification));
      }

      await transaction.auditLog.create({
        data: {
          actorId: input.authorUserId,
          action: "social.post.created",
          targetType: "SocialPost",
          targetId: socialPost.id,
          ip: input.context.ip,
          userAgent: input.context.userAgent ?? null,
          metadata: {
            mentionUserIds,
            mediaAssetPublicIds: mediaPublicIds,
            visibility: input.visibility
          } satisfies Prisma.InputJsonValue
        }
      });

      return {
        post: this.mapSocialPost(socialPost, authorIdentityId, authorIdentityId),
        notifications
      };
    });
  }

  public async updateSocialPost(
    input: UpdateSocialPostInput
  ): Promise<UpdateSocialPostResult | null> {
    return this.client.$transaction(async (transaction) => {
      const authorIdentityId =
        input.authorIdentityId ??
        (await this.findCanonicalIdentityId(transaction, input.authorUserId));
      if (!authorIdentityId) {
        throw new AppError({
          code: ERROR_CODES.IDENTITY_NOT_FOUND,
          message: "error.auth.identity_not_found",
          statusCode: 403
        });
      }
      const existingPost = await transaction.socialPost.findFirst({
        where: {
          id: input.postId,
          authorIdentityId,
          deletedAt: null
        },
        include: socialPostInclude
      });
      if (!existingPost) {
        return null;
      }

      if (
        input.media?.replyToPostId !== undefined &&
        input.media.replyToPostId !== existingPost.replyToPostId
      ) {
        throw this.socialPostConflict("error.social.reply_relation_immutable");
      }

      const mentionUserIds = Array.from(new Set(input.mentionUserIds));
      const mentionIdentityByUser = new Map<number, number>();
      if (
        mentionUserIds.length !== input.mentionUserIds.length ||
        mentionUserIds.length > 50 ||
        mentionUserIds.includes(input.authorUserId)
      ) {
        throw this.socialPostConflict("error.social.invalid_mention_contact");
      }

      if (mentionUserIds.length > 0) {
        const contacts = await transaction.contact.findMany({
          where: {
            ownerIdentityId: authorIdentityId,
            contactUserId: { in: mentionUserIds },
            blockedAt: null,
            deletedAt: null,
            contactUser: { isActive: true, deletedAt: null }
          },
          select: { contactUserId: true, contactIdentityId: true },
          orderBy: { contactIdentityId: "asc" }
        });
        for (const contact of contacts) {
          if (!mentionIdentityByUser.has(contact.contactUserId)) {
            mentionIdentityByUser.set(contact.contactUserId, contact.contactIdentityId);
          }
        }
        const matchedContactIds = new Set(contacts.map((contact) => contact.contactUserId));
        if (
          matchedContactIds.size !== mentionUserIds.length ||
          mentionUserIds.some((userId) => !matchedContactIds.has(userId))
        ) {
          throw this.socialPostConflict("error.social.invalid_mention_contact");
        }
      }

      const requestedMediaItems = input.media?.items ?? [];
      const mediaPublicIds = requestedMediaItems.map((item) => item.mediaAssetPublicId);
      if (new Set(mediaPublicIds).size !== mediaPublicIds.length) {
        throw this.socialPostConflict("error.social.media_not_owned");
      }

      const selectedMediaByPublicId = new Map<
        string,
        {
          id: number;
          checksumSha256: string | null;
          url: string;
          entityType: string;
          entityId: number;
        }
      >();
      if (mediaPublicIds.length > 0) {
        const mediaAssets = await transaction.mediaAsset.findMany({
          where: {
            ownerUserId: input.authorUserId,
            ownerIdentityId: authorIdentityId,
            usageType: "social_post_public",
            isActive: true,
            deletedAt: null,
            purgedAt: null,
            checksumSha256: { in: mediaPublicIds },
            OR: [
              { entityType: "social_post_upload" },
              { entityType: "social_post", entityId: input.postId }
            ]
          },
          select: {
            id: true,
            checksumSha256: true,
            url: true,
            entityType: true,
            entityId: true,
            createdAt: true
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }]
        });
        for (const mediaAsset of mediaAssets) {
          if (
            mediaAsset.checksumSha256 &&
            !selectedMediaByPublicId.has(mediaAsset.checksumSha256)
          ) {
            selectedMediaByPublicId.set(mediaAsset.checksumSha256, mediaAsset);
          }
        }
        if (
          selectedMediaByPublicId.size !== mediaPublicIds.length ||
          mediaPublicIds.some((publicId) => !selectedMediaByPublicId.has(publicId))
        ) {
          throw this.socialPostConflict("error.social.media_not_owned");
        }
      }

      const existingEnvelope = this.jsonRecord(existingPost.media);
      const existingCounters = this.jsonRecord(existingEnvelope?.counters);
      const counters = {
        likes: this.jsonCounter(existingCounters?.likes, 0),
        replies: this.jsonCounter(existingCounters?.replies, 0),
        reposts: this.jsonCounter(existingCounters?.reposts, 0),
        views: this.jsonCounter(existingCounters?.views, 1),
        bookmarks: this.jsonCounter(existingCounters?.bookmarks, 0)
      };
      const existingMentionUserIds = this.jsonPositiveIntegerArray(
        existingEnvelope?.mentionUserIds
      );
      const media = input.media
        ? {
            ...(input.media.quotePostId !== undefined
              ? { quotePostId: input.media.quotePostId }
              : {}),
            ...(input.media.replyToPostId !== undefined
              ? { replyToPostId: input.media.replyToPostId }
              : {}),
            ...(input.media.repostPostId !== undefined
              ? { repostPostId: input.media.repostPostId }
              : {}),
            ...(input.media.postType !== undefined ? { postType: input.media.postType } : {}),
            ...(input.media.locationLabel !== undefined
              ? { locationLabel: input.media.locationLabel }
              : {}),
            ...(input.media.richText !== undefined ? { richText: input.media.richText } : {}),
            items: requestedMediaItems.map((item) => {
              const mediaAsset = selectedMediaByPublicId.get(item.mediaAssetPublicId);
              if (!mediaAsset) {
                throw this.socialPostConflict("error.social.media_not_owned");
              }
              return {
                id: item.id,
                type: item.type,
                url: mediaAsset.url,
                mediaAssetPublicId: item.mediaAssetPublicId,
                ...(item.alt ? { alt: item.alt } : {})
              };
            }),
            mentionUserIds,
            counters
          }
        : undefined;

      const updatedPost = await transaction.socialPost.update({
        where: { id: existingPost.id },
        data: {
          content: input.content,
          media: this.toJsonValue(media),
          visibility: this.socialPostVisibilityToDb(input.visibility)
        },
        include: socialPostInclude
      });

      const pendingMediaAssetIds = mediaPublicIds
        .map((publicId) => selectedMediaByPublicId.get(publicId)!)
        .filter((mediaAsset) => mediaAsset.entityType === "social_post_upload")
        .map((mediaAsset) => mediaAsset.id);
      if (pendingMediaAssetIds.length > 0) {
        const updateResult = await transaction.mediaAsset.updateMany({
          where: {
            id: { in: pendingMediaAssetIds },
            ownerUserId: input.authorUserId,
            ownerIdentityId: authorIdentityId,
            entityType: "social_post_upload",
            usageType: "social_post_public",
            isActive: true,
            deletedAt: null,
            purgedAt: null
          },
          data: { entityType: "social_post", entityId: existingPost.id }
        });
        if (updateResult.count !== pendingMediaAssetIds.length) {
          throw this.socialPostConflict("error.social.media_not_owned");
        }
      }

      const previousMentionUserIds = new Set(existingMentionUserIds);
      const notifications: NotificationPayload[] = [];
      for (const recipientUserId of mentionUserIds.filter(
        (userId) => !previousMentionUserIds.has(userId)
      )) {
        const notification = await transaction.notification.create({
          data: {
            recipientUserId,
            recipientIdentityId: mentionIdentityByUser.get(recipientUserId)!,
            actorUserId: input.authorUserId,
            actorIdentityId: authorIdentityId,
            type: NotificationType.SOCIAL,
            title: "动态提醒",
            body: "提醒你查看一条动态。",
            payload: { kind: "post_mention", postId: updatedPost.id }
          }
        });
        notifications.push(this.mapNotification(notification));
      }

      await transaction.auditLog.create({
        data: {
          actorId: input.authorUserId,
          action: "social.post.updated",
          targetType: "SocialPost",
          targetId: updatedPost.id,
          ip: input.context.ip,
          userAgent: input.context.userAgent ?? null,
          metadata: {
            previousMentionUserIds: existingMentionUserIds,
            mentionUserIds,
            mediaAssetPublicIds: mediaPublicIds,
            visibility: input.visibility
          } satisfies Prisma.InputJsonValue
        }
      });

      return {
        post: this.mapSocialPost(updatedPost, authorIdentityId, authorIdentityId),
        notifications
      };
    });
  }

  public async setSocialPostPin(input: SetSocialPostPinInput): Promise<SocialPostPayload | null> {
    return this.client.$transaction(async (transaction) => {
      const authorIdentityId =
        input.authorIdentityId ??
        (await this.findCanonicalIdentityId(transaction, input.authorUserId));
      if (!authorIdentityId) {
        throw new AppError({
          code: ERROR_CODES.IDENTITY_NOT_FOUND,
          message: "error.auth.identity_not_found",
          statusCode: 403
        });
      }

      const post = await transaction.socialPost.findFirst({
        where: {
          id: input.postId,
          authorUserId: input.authorUserId,
          authorIdentityId,
          replyToPostId: null,
          deletedAt: null
        },
        include: socialPostInclude
      });
      if (!post) return null;

      const previousPinnedPostId = post.authorIdentity.pinnedSocialPostId;
      if (input.active) {
        await transaction.userIdentity.update({
          where: { id: authorIdentityId },
          data: { pinnedSocialPostId: post.id }
        });
      } else {
        await transaction.userIdentity.updateMany({
          where: { id: authorIdentityId, pinnedSocialPostId: post.id },
          data: { pinnedSocialPostId: null }
        });
      }

      await transaction.auditLog.create({
        data: {
          actorId: input.authorUserId,
          action: input.active ? "social.post.pinned" : "social.post.unpinned",
          targetType: "SocialPost",
          targetId: post.id,
          ip: input.context.ip,
          userAgent: input.context.userAgent ?? null,
          metadata: { previousPinnedPostId } satisfies Prisma.InputJsonValue
        }
      });

      const updatedPost = await transaction.socialPost.findUniqueOrThrow({
        where: { id: post.id },
        include: socialPostInclude
      });
      return this.mapSocialPost(updatedPost, authorIdentityId, authorIdentityId);
    });
  }

  public async listSocialPosts(
    identityId: number,
    input: SocialPostListInput,
    userId: number = identityId
  ): Promise<PaginatedResponse<SocialPostPayload>> {
    void userId;
    const pagination = toPrismaPagination(input);
    const where: Prisma.SocialPostWhereInput = {
      deletedAt: null,
      ...(input.authorUserId ? { authorUserId: input.authorUserId } : {}),
      ...(input.authorIdentityId ? { authorIdentityId: input.authorIdentityId } : {}),
      ...(input.replyToPostId ? { replyToPostId: input.replyToPostId } : {}),
      ...(input.bookmarked
        ? {
            bookmarks: {
              some: { actorIdentityId: identityId, deletedAt: null }
            }
          }
        : {}),
      OR: [
        { visibility: SocialPostVisibility.PUBLIC },
        { authorIdentityId: identityId },
        {
          authorIdentity: {
            followers: {
              some: {
                followerIdentityId: identityId,
                deletedAt: null
              }
            }
          }
        }
      ]
    };
    const [list, total] = await Promise.all([
      this.client.socialPost.findMany({
        where,
        include: socialPostInclude,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      }),
      this.client.socialPost.count({ where })
    ]);

    const [relationshipMap, interactionMap] = await Promise.all([
      this.loadSocialRelationshipMap(
        identityId,
        list.map((socialPost) => socialPost.authorIdentityId)
      ),
      this.loadSocialInteractionMap(
        identityId,
        list.map((socialPost) => socialPost.id)
      )
    ]);

    return buildPaginatedResponse(
      list.map((socialPost) =>
        this.mapSocialPost(
          socialPost,
          identityId,
          socialPost.authorIdentityId,
          relationshipMap,
          interactionMap
        )
      ),
      total,
      pagination
    );
  }

  public async getSocialPost(
    identityId: number,
    postId: number,
    userId: number = identityId
  ): Promise<SocialPostPayload | null> {
    void userId;
    const socialPost = await this.client.socialPost.findFirst({
      where: {
        id: postId,
        deletedAt: null,
        OR: [
          { visibility: SocialPostVisibility.PUBLIC },
          { authorIdentityId: identityId },
          {
            authorIdentity: {
              followers: {
                some: {
                  followerIdentityId: identityId,
                  deletedAt: null
                }
              }
            }
          }
        ]
      },
      include: socialPostInclude
    });

    if (!socialPost) {
      return null;
    }

    const [relationshipMap, interactionMap] = await Promise.all([
      this.loadSocialRelationshipMap(identityId, [socialPost.authorIdentityId]),
      this.loadSocialInteractionMap(identityId, [socialPost.id])
    ]);
    return this.mapSocialPost(
      socialPost,
      identityId,
      socialPost.authorIdentityId,
      relationshipMap,
      interactionMap
    );
  }

  public async setSocialPostLike(
    input: SocialPostInteractionMutationInput
  ): Promise<SocialPostInteractionMutationResult | null> {
    const mutation = await this.client.$transaction(async (transaction) => {
      const actorIdentityId =
        input.actorIdentityId ??
        (await this.findCanonicalIdentityId(transaction, input.actorUserId));
      if (!actorIdentityId) {
        throw new AppError({
          code: ERROR_CODES.IDENTITY_NOT_FOUND,
          message: "error.auth.identity_not_found",
          statusCode: 403
        });
      }
      const socialPost = await transaction.socialPost.findFirst({
        where: this.socialPostVisibleWhere(actorIdentityId, input.postId),
        include: socialPostInclude
      });
      if (!socialPost) return null;

      const existing = await transaction.socialPostLike.findUnique({
        where: {
          postId_actorIdentityId: { postId: socialPost.id, actorIdentityId }
        }
      });
      const changed = input.active
        ? existing?.deletedAt !== null
        : Boolean(existing && !existing.deletedAt);
      if (input.active && !existing) {
        await transaction.socialPostLike.create({
          data: {
            postId: socialPost.id,
            actorUserId: input.actorUserId,
            actorIdentityId
          }
        });
      } else if (input.active && existing?.deletedAt) {
        await transaction.socialPostLike.update({
          where: { id: existing.id },
          data: { actorUserId: input.actorUserId, deletedAt: null }
        });
      } else if (!input.active && existing && !existing.deletedAt) {
        await transaction.socialPostLike.update({
          where: { id: existing.id },
          data: { deletedAt: new Date() }
        });
      }

      if (
        input.active &&
        changed &&
        input.actorUserId !== socialPost.authorUserId &&
        input.onActiveLike
      ) {
        await input.onActiveLike({
          transactionClient: transaction,
          postId: socialPost.id,
          authorUserId: socialPost.authorUserId,
          actorUserId: input.actorUserId
        });
      }

      if (changed) {
        await transaction.auditLog.create({
          data: {
            actorId: input.actorUserId,
            action: input.active ? "social.post.liked" : "social.post.unliked",
            targetType: "SocialPost",
            targetId: socialPost.id,
            ip: input.context.ip,
            userAgent: input.context.userAgent ?? null,
            metadata: { actorIdentityId }
          }
        });
      }
      const updated = await transaction.socialPost.findUniqueOrThrow({
        where: { id: socialPost.id },
        include: socialPostInclude
      });
      return { actorIdentityId, changed, socialPost: updated };
    });
    if (!mutation) return null;

    const [relationshipMap, interactionMap] = await Promise.all([
      this.loadSocialRelationshipMap(mutation.actorIdentityId, [
        mutation.socialPost.authorIdentityId
      ]),
      this.loadSocialInteractionMap(mutation.actorIdentityId, [mutation.socialPost.id])
    ]);
    return {
      changed: mutation.changed,
      post: this.mapSocialPost(
        mutation.socialPost,
        mutation.actorIdentityId,
        mutation.socialPost.authorIdentityId,
        relationshipMap,
        interactionMap
      )
    };
  }

  public async setSocialPostBookmark(
    input: SocialPostInteractionMutationInput
  ): Promise<SocialPostInteractionMutationResult | null> {
    const mutation = await this.client.$transaction(async (transaction) => {
      const actorIdentityId =
        input.actorIdentityId ??
        (await this.findCanonicalIdentityId(transaction, input.actorUserId));
      if (!actorIdentityId) {
        throw new AppError({
          code: ERROR_CODES.IDENTITY_NOT_FOUND,
          message: "error.auth.identity_not_found",
          statusCode: 403
        });
      }
      const socialPost = await transaction.socialPost.findFirst({
        where: this.socialPostVisibleWhere(actorIdentityId, input.postId),
        include: socialPostInclude
      });
      if (!socialPost) return null;

      const existing = await transaction.socialPostBookmark.findUnique({
        where: {
          postId_actorIdentityId: { postId: socialPost.id, actorIdentityId }
        }
      });
      const changed = input.active
        ? existing?.deletedAt !== null
        : Boolean(existing && !existing.deletedAt);
      if (input.active && !existing) {
        await transaction.socialPostBookmark.create({
          data: {
            postId: socialPost.id,
            actorUserId: input.actorUserId,
            actorIdentityId
          }
        });
      } else if (input.active && existing?.deletedAt) {
        await transaction.socialPostBookmark.update({
          where: { id: existing.id },
          data: { actorUserId: input.actorUserId, deletedAt: null }
        });
      } else if (!input.active && existing && !existing.deletedAt) {
        await transaction.socialPostBookmark.update({
          where: { id: existing.id },
          data: { deletedAt: new Date() }
        });
      }

      if (changed) {
        await transaction.auditLog.create({
          data: {
            actorId: input.actorUserId,
            action: input.active ? "social.post.bookmarked" : "social.post.unbookmarked",
            targetType: "SocialPost",
            targetId: socialPost.id,
            ip: input.context.ip,
            userAgent: input.context.userAgent ?? null,
            metadata: { actorIdentityId }
          }
        });
      }
      const updated = await transaction.socialPost.findUniqueOrThrow({
        where: { id: socialPost.id },
        include: socialPostInclude
      });
      return { actorIdentityId, changed, socialPost: updated };
    });
    if (!mutation) return null;

    const [relationshipMap, interactionMap] = await Promise.all([
      this.loadSocialRelationshipMap(mutation.actorIdentityId, [
        mutation.socialPost.authorIdentityId
      ]),
      this.loadSocialInteractionMap(mutation.actorIdentityId, [mutation.socialPost.id])
    ]);
    return {
      changed: mutation.changed,
      post: this.mapSocialPost(
        mutation.socialPost,
        mutation.actorIdentityId,
        mutation.socialPost.authorIdentityId,
        relationshipMap,
        interactionMap
      )
    };
  }

  public async recordSocialPostView(
    input: RecordSocialPostViewInput
  ): Promise<SocialPostInteractionMutationResult | null> {
    const mutation = await this.client.$transaction(async (transaction) => {
      const actorIdentityId =
        input.actorIdentityId ??
        (await this.findCanonicalIdentityId(transaction, input.actorUserId));
      if (!actorIdentityId) {
        throw new AppError({
          code: ERROR_CODES.IDENTITY_NOT_FOUND,
          message: "error.auth.identity_not_found",
          statusCode: 403
        });
      }
      const socialPost = await transaction.socialPost.findFirst({
        where: this.socialPostVisibleWhere(actorIdentityId, input.postId),
        include: socialPostInclude
      });
      if (!socialPost) return null;
      const existing = await transaction.socialPostView.findUnique({
        where: {
          postId_actorIdentityId: { postId: socialPost.id, actorIdentityId }
        }
      });
      const changed = !existing || Boolean(existing.deletedAt);
      if (!existing) {
        await transaction.socialPostView.create({
          data: {
            postId: socialPost.id,
            actorUserId: input.actorUserId,
            actorIdentityId
          }
        });
      } else if (existing.deletedAt) {
        await transaction.socialPostView.update({
          where: { id: existing.id },
          data: { actorUserId: input.actorUserId, deletedAt: null }
        });
      }
      if (changed) {
        await transaction.auditLog.create({
          data: {
            actorId: input.actorUserId,
            action: "social.post.viewed",
            targetType: "SocialPost",
            targetId: socialPost.id,
            ip: input.context.ip,
            userAgent: input.context.userAgent ?? null,
            metadata: { actorIdentityId }
          }
        });
      }
      const updated = await transaction.socialPost.findUniqueOrThrow({
        where: { id: socialPost.id },
        include: socialPostInclude
      });
      return { actorIdentityId, changed, socialPost: updated };
    });
    if (!mutation) return null;

    const [relationshipMap, interactionMap] = await Promise.all([
      this.loadSocialRelationshipMap(mutation.actorIdentityId, [
        mutation.socialPost.authorIdentityId
      ]),
      this.loadSocialInteractionMap(mutation.actorIdentityId, [mutation.socialPost.id])
    ]);
    return {
      changed: mutation.changed,
      post: this.mapSocialPost(
        mutation.socialPost,
        mutation.actorIdentityId,
        mutation.socialPost.authorIdentityId,
        relationshipMap,
        interactionMap
      )
    };
  }

  public async shareSocialPost(input: ShareSocialPostInput): Promise<ShareSocialPostResult | null> {
    const mutation = await this.client.$transaction(async (transaction) => {
      const actorIdentityId =
        input.actorIdentityId ??
        (await this.findCanonicalIdentityId(transaction, input.actorUserId));
      if (!actorIdentityId) {
        throw new AppError({
          code: ERROR_CODES.IDENTITY_NOT_FOUND,
          message: "error.auth.identity_not_found",
          statusCode: 403
        });
      }
      const socialPost = await transaction.socialPost.findFirst({
        where: this.socialPostVisibleWhere(actorIdentityId, input.postId),
        include: socialPostInclude
      });
      if (!socialPost) return null;

      const targetUserIds = [...new Set(input.targetUserIds)];
      if (
        targetUserIds.length !== input.targetUserIds.length ||
        targetUserIds.length === 0 ||
        targetUserIds.length > 20 ||
        targetUserIds.includes(input.actorUserId)
      ) {
        throw this.socialPostConflict("error.social.invalid_share_target");
      }
      const outgoingContacts = await transaction.contact.findMany({
        where: {
          ownerIdentityId: actorIdentityId,
          contactUserId: { in: targetUserIds },
          blockedAt: null,
          deletedAt: null,
          contactUser: { isActive: true, deletedAt: null }
        },
        select: { contactUserId: true, contactIdentityId: true },
        orderBy: { contactIdentityId: "asc" }
      });
      const targetIdentityByUser = new Map(
        outgoingContacts.map((contact) => [contact.contactUserId, contact.contactIdentityId])
      );
      if (targetUserIds.some((userId) => !targetIdentityByUser.has(userId))) {
        throw this.socialPostConflict("error.social.share_target_not_friend");
      }
      const targetIdentityIds = targetUserIds.map((userId) => targetIdentityByUser.get(userId)!);
      const reciprocalContacts = await transaction.contact.findMany({
        where: {
          ownerIdentityId: { in: targetIdentityIds },
          contactIdentityId: actorIdentityId,
          blockedAt: null,
          deletedAt: null
        },
        select: { ownerIdentityId: true }
      });
      const reciprocalIdentityIds = new Set(
        reciprocalContacts.map((contact) => contact.ownerIdentityId)
      );
      if (targetIdentityIds.some((identityId) => !reciprocalIdentityIds.has(identityId))) {
        throw this.socialPostConflict("error.social.share_target_not_friend");
      }
      if (socialPost.visibility === SocialPostVisibility.FOLLOWERS) {
        const visibleTargetFollows = await transaction.follow.findMany({
          where: {
            followerIdentityId: { in: targetIdentityIds },
            followingIdentityId: socialPost.authorIdentityId,
            deletedAt: null
          },
          select: { followerIdentityId: true }
        });
        const visibleIdentityIds = new Set(
          visibleTargetFollows.map((follow) => follow.followerIdentityId)
        );
        if (targetIdentityIds.some((identityId) => !visibleIdentityIds.has(identityId))) {
          throw this.socialPostConflict("error.social.share_target_cannot_view");
        }
      }

      const idempotentShares = await transaction.socialPostShare.findMany({
        where: { actorIdentityId, idempotencyKey: input.idempotencyKey },
        include: { message: { include: messageInclude } },
        orderBy: { id: "asc" }
      });
      if (idempotentShares.some((share) => share.postId !== socialPost.id)) {
        throw this.socialPostConflict("error.social.idempotency_conflict");
      }
      const existingShareByRecipient = new Map(
        idempotentShares.map((share) => [share.recipientIdentityId, share])
      );
      const policy = await transaction.imPolicy.findFirst({
        where: { activeKey: "active", deletedAt: null },
        select: { textRetentionSeconds: true, recallWindowSeconds: true, version: true }
      });
      const mediaEnvelope = this.jsonRecord(socialPost.media);
      const mediaItems = Array.isArray(mediaEnvelope?.items) ? mediaEnvelope.items : [];
      const firstMedia = this.jsonRecord(mediaItems[0]);
      const author = this.mapSocialAuthor(socialPost.author, socialPost.authorIdentity);
      const deliveries: Array<{
        recipientUserId: number;
        recipientIdentityId: number;
        message: MessageRecord;
        created: boolean;
      }> = [];

      for (const recipientUserId of targetUserIds) {
        const recipientIdentityId = targetIdentityByUser.get(recipientUserId)!;
        const existingShare = existingShareByRecipient.get(recipientIdentityId);
        if (existingShare) {
          deliveries.push({
            recipientUserId,
            recipientIdentityId,
            message: existingShare.message,
            created: false
          });
          continue;
        }

        const friendshipPairKey = toFriendshipPairKey(actorIdentityId, recipientIdentityId);
        const conversation = await transaction.conversation.upsert({
          where: { friendshipPairKey },
          create: {
            type: ConversationType.DIRECT,
            accessPolicy: ConversationAccessPolicy.FRIENDSHIP_REQUIRED,
            friendshipPairKey,
            createdByUserId: input.actorUserId,
            createdByIdentityId: actorIdentityId,
            participants: {
              create: [
                { userId: input.actorUserId, identityId: actorIdentityId, role: "owner" },
                { userId: recipientUserId, identityId: recipientIdentityId, role: "member" }
              ]
            }
          },
          update: { deletedAt: null },
          select: { id: true }
        });
        const createdAt = new Date();
        for (const participant of [
          { userId: input.actorUserId, identityId: actorIdentityId },
          { userId: recipientUserId, identityId: recipientIdentityId }
        ]) {
          await transaction.conversationParticipant.upsert({
            where: {
              conversationId_identityId: {
                conversationId: conversation.id,
                identityId: participant.identityId
              }
            },
            create: {
              conversationId: conversation.id,
              userId: participant.userId,
              identityId: participant.identityId,
              role: participant.identityId === actorIdentityId ? "owner" : "member"
            },
            update: { deletedAt: null, hiddenAt: null }
          });
        }
        const globalExpiresAt =
          policy?.textRetentionSeconds === null || policy?.textRetentionSeconds === undefined
            ? null
            : new Date(createdAt.getTime() + policy.textRetentionSeconds * 1_000);
        const message = await transaction.message.create({
          data: {
            conversationId: conversation.id,
            senderUserId: input.actorUserId,
            senderIdentityId: actorIdentityId,
            type: MessageType.TEXT,
            content: "转发了一条动态",
            metadata: buildSocialPostShareCardMetadata({
              authorAvatar: author.avatarUrl ?? "",
              authorName: author.displayName,
              firstMedia,
              postId: socialPost.id,
              text: socialPost.content
            }),
            createdAt,
            expiresAt: globalExpiresAt,
            recallDeadlineAt: new Date(
              createdAt.getTime() + (policy?.recallWindowSeconds ?? 180) * 1_000
            ),
            lifecycleVersion: policy?.version ?? 1
          },
          include: messageInclude
        });
        await transaction.conversation.update({
          where: { id: conversation.id },
          data: { updatedAt: createdAt }
        });
        await transaction.conversationParticipant.updateMany({
          where: { conversationId: conversation.id, identityId: actorIdentityId, deletedAt: null },
          data: {
            unreadCount: 0,
            hiddenAt: null,
            lastReadMessageId: message.id,
            lastReadAt: message.createdAt
          }
        });
        await transaction.conversationParticipant.updateMany({
          where: {
            conversationId: conversation.id,
            identityId: recipientIdentityId,
            deletedAt: null
          },
          data: { unreadCount: { increment: 1 }, hiddenAt: null }
        });
        await transaction.socialPostShare.create({
          data: {
            postId: socialPost.id,
            actorUserId: input.actorUserId,
            actorIdentityId,
            recipientUserId,
            recipientIdentityId,
            conversationId: conversation.id,
            messageId: message.id,
            idempotencyKey: input.idempotencyKey
          }
        });
        deliveries.push({ recipientUserId, recipientIdentityId, message, created: true });
      }

      const createdRecipientUserIds = deliveries
        .filter((delivery) => delivery.created)
        .map((delivery) => delivery.recipientUserId);
      if (createdRecipientUserIds.length > 0) {
        await transaction.auditLog.create({
          data: {
            actorId: input.actorUserId,
            action: "social.post.shared_to_friends",
            targetType: "SocialPost",
            targetId: socialPost.id,
            ip: input.context.ip,
            userAgent: input.context.userAgent ?? null,
            metadata: {
              actorIdentityId,
              recipientUserIds: createdRecipientUserIds,
              idempotencyKey: input.idempotencyKey
            }
          }
        });
      }
      const updated = await transaction.socialPost.findUniqueOrThrow({
        where: { id: socialPost.id },
        include: socialPostInclude
      });
      return {
        actorIdentityId,
        changed: createdRecipientUserIds.length > 0,
        deliveries,
        socialPost: updated
      };
    });
    if (!mutation) return null;

    const [relationshipMap, interactionMap] = await Promise.all([
      this.loadSocialRelationshipMap(mutation.actorIdentityId, [
        mutation.socialPost.authorIdentityId
      ]),
      this.loadSocialInteractionMap(mutation.actorIdentityId, [mutation.socialPost.id])
    ]);
    return {
      changed: mutation.changed,
      post: this.mapSocialPost(
        mutation.socialPost,
        mutation.actorIdentityId,
        mutation.socialPost.authorIdentityId,
        relationshipMap,
        interactionMap
      ),
      deliveries: mutation.deliveries.map((delivery) => ({
        recipientUserId: delivery.recipientUserId,
        recipientIdentityId: delivery.recipientIdentityId,
        message: this.mapMessage(delivery.message, mutation.actorIdentityId),
        created: delivery.created
      }))
    };
  }

  public async getSocialActivityStatus(
    input: SocialActivityStatusInput
  ): Promise<SocialActivityStatusPayload | null> {
    const profile = await this.client.user.findFirst({
      where: {
        id: input.targetUserId,
        isActive: true,
        deletedAt: null
      },
      select: socialAuthorSelect
    });

    if (!profile) {
      return null;
    }

    const latestVisiblePost = await this.client.socialPost.findFirst({
      where: {
        authorIdentityId: input.targetIdentityId ?? input.targetUserId,
        createdAt: { gte: input.since },
        deletedAt: null,
        OR: [
          { visibility: SocialPostVisibility.PUBLIC },
          { authorIdentityId: input.viewerIdentityId ?? input.viewerUserId },
          {
            authorIdentity: {
              followers: {
                some: {
                  followerIdentityId: input.viewerIdentityId ?? input.viewerUserId,
                  deletedAt: null
                }
              }
            }
          }
        ]
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { createdAt: true, id: true }
    });

    return {
      status: latestVisiblePost ? "recent_posts" : "no_recent_posts",
      profile: this.mapSocialAuthor(profile),
      latestVisiblePostAt: latestVisiblePost?.createdAt ?? null
    };
  }

  public async listFollowerUserIds(followingUserId: number): Promise<number[]> {
    const follows = await this.client.follow.findMany({
      where: {
        followingUserId,
        deletedAt: null
      },
      select: {
        followerUserId: true
      }
    });

    return follows.map((follow) => follow.followerUserId);
  }

  public async listFollowerRecipients(
    followingIdentityId: number
  ): Promise<Array<{ userId: number; identityId: number }>> {
    const follows = await this.client.follow.findMany({
      where: { followingIdentityId, deletedAt: null },
      select: { followerUserId: true, followerIdentityId: true }
    });
    return follows.map((follow) => ({
      userId: follow.followerUserId,
      identityId: follow.followerIdentityId
    }));
  }

  public async createFollow(input: CreateFollowInput): Promise<FollowPayload> {
    const followerIdentityId =
      input.followerIdentityId ?? (await this.findCanonicalIdentityIdForUser(input.followerUserId));
    const followingIdentityId =
      input.followingIdentityId ??
      (await this.findCanonicalIdentityIdForUser(input.followingUserId));
    if (!followerIdentityId || !followingIdentityId) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_NOT_FOUND,
        message: "error.auth.identity_not_found",
        statusCode: 403
      });
    }
    const follow = await this.client.follow.upsert({
      where: {
        followerIdentityId_followingIdentityId: {
          followerIdentityId,
          followingIdentityId
        }
      },
      create: {
        followerUserId: input.followerUserId,
        followerIdentityId,
        followingUserId: input.followingUserId,
        followingIdentityId
      },
      update: {
        deletedAt: null
      }
    });

    return this.mapFollow(follow);
  }

  public async deleteFollow(
    followerIdentityId: number,
    followingIdentityId: number
  ): Promise<{ deleted: boolean }> {
    const result = await this.client.follow.updateMany({
      where: {
        followerIdentityId,
        followingIdentityId,
        deletedAt: null
      },
      data: {
        deletedAt: new Date()
      }
    });

    return { deleted: result.count > 0 };
  }

  public async listNotifications(
    identityId: number,
    input: NotificationListInput
  ): Promise<PaginatedResponse<NotificationPayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.NotificationWhereInput = {
      recipientIdentityId: identityId,
      deletedAt: null,
      ...(input.unreadOnly ? { readAt: null } : {})
    };
    const [list, total] = await Promise.all([
      this.client.notification.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      }),
      this.client.notification.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((notification) => this.mapNotification(notification)),
      total,
      pagination
    );
  }

  public async markNotificationRead(
    identityId: number,
    notificationId: number
  ): Promise<NotificationPayload | null> {
    const candidate = await this.client.noticeDelivery.findFirst({
      where: { notificationId, recipientIdentityId: identityId, deletedAt: null },
      select: { id: true }
    });
    return this.client.$transaction(async (transaction) => {
      // All notice read entry points lock the delivery before its notification.
      const receipts = candidate
        ? await transaction.$queryRaw<Array<{ id: number; noticeId: number }>>(
            Prisma.sql`SELECT id, notice_id AS noticeId FROM notice_deliveries
        WHERE id = ${candidate.id} AND recipient_identity_id = ${identityId}
        AND deleted_at IS NULL FOR UPDATE`
          )
        : [];
      await transaction.$queryRaw(Prisma.sql`SELECT id FROM notifications
      WHERE id = ${notificationId} AND recipient_identity_id = ${identityId}
      AND deleted_at IS NULL FOR UPDATE`);
      const notification = await transaction.notification.findFirst({
        where: {
          id: notificationId,
          recipientIdentityId: identityId,
          deletedAt: null
        }
      });

      if (!notification) {
        return null;
      }

      const now = new Date();
      const readAt = notification.readAt ?? now;
      const updated = await transaction.notification.update({
        where: { id: notification.id },
        data: { readAt }
      });
      const read = await transaction.noticeDelivery.updateMany({
        where: {
          notificationId,
          recipientIdentityId: identityId,
          readAt: null,
          status: "DELIVERED",
          deletedAt: null
        },
        data: { readAt, updatedAt: now }
      });
      if (read.count > 0 && receipts[0]) {
        await transaction.auditLog.create({
          data: {
            actorId: notification.recipientUserId,
            action: "official_notice.read",
            targetType: "OfficialNotice",
            targetId: receipts[0].noticeId,
            metadata: { recipientIdentityId: identityId, source: "notification_inbox" },
            createdAt: now
          }
        });
      }

      return this.mapNotification(updated);
    });
  }

  public async markAllNotificationsRead(identityId: number): Promise<{ count: number }> {
    return this.client.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`SELECT id FROM notice_deliveries
      WHERE recipient_identity_id = ${identityId} AND read_at IS NULL
      AND deleted_at IS NULL ORDER BY id FOR UPDATE`);
      const now = new Date();
      const read = await transaction.noticeDelivery.updateMany({
        where: {
          recipientIdentityId: identityId,
          readAt: null,
          status: "DELIVERED",
          deletedAt: null,
          notification: { recipientIdentityId: identityId, readAt: null, deletedAt: null }
        },
        data: { readAt: now, updatedAt: now }
      });
      const result = await transaction.notification.updateMany({
        where: {
          recipientIdentityId: identityId,
          readAt: null,
          deletedAt: null
        },
        data: {
          readAt: now
        }
      });
      if (read.count > 0) {
        const identity = await transaction.userIdentity.findUniqueOrThrow({
          where: { id: identityId },
          select: { userId: true }
        });
        await transaction.auditLog.create({
          data: {
            actorId: identity.userId,
            action: "official_notice.read_all",
            targetType: "UserIdentity",
            targetId: identityId,
            metadata: { count: read.count, source: "notification_inbox" },
            createdAt: now
          }
        });
      }

      return { count: result.count };
    });
  }

  public async getUnreadCounts(identityId: number): Promise<UnreadCountsPayload> {
    const databaseClock = await this.client.$queryRaw<Array<{ dbNow: Date }>>(
      Prisma.sql`SELECT CURRENT_TIMESTAMP(3) AS dbNow`
    );
    const dbNow = databaseClock[0]?.dbNow;
    if (!dbNow) {
      throw new Error("Database clock query returned no row");
    }
    const [conversationUnread, notifications, friendRequests] = await Promise.all([
      this.client.conversationParticipant.aggregate({
        where: {
          identityId,
          deletedAt: null,
          conversation: { deletedAt: null }
        },
        _sum: { unreadCount: true }
      }),
      this.client.notification.count({
        where: {
          recipientIdentityId: identityId,
          readAt: null,
          deletedAt: null
        }
      }),
      this.client.friendRequest.count({
        where: {
          targetIdentityId: identityId,
          status: FriendRequestStatus.PENDING,
          expiresAt: { gt: dbNow },
          deletedAt: null
        }
      })
    ]);
    const conversations = conversationUnread._sum.unreadCount ?? 0;

    return {
      conversations,
      notifications,
      friendRequests,
      total: conversations + notifications + friendRequests
    };
  }

  public async createOrderStatusNotifications(
    input: CreateOrderStatusNotificationInput
  ): Promise<NotificationPayload[]> {
    const suppliedIdentities = new Map(
      input.recipientIdentities?.map((recipient) => [recipient.userId, recipient.identityId]) ?? []
    );
    const recipientUserIds = Array.from(new Set(input.recipientUserIds)).filter(
      (recipientUserId) => recipientUserId !== input.actorUserId
    );

    if (recipientUserIds.length === 0) {
      return [];
    }

    const actorIdentityId =
      input.actorIdentityId ?? (await this.findCanonicalIdentityIdForUser(input.actorUserId));
    const recipients = await Promise.all(
      recipientUserIds.map(async (userId) => ({
        userId,
        identityId:
          suppliedIdentities.get(userId) ?? (await this.findCanonicalIdentityIdForUser(userId))
      }))
    );
    if (!actorIdentityId || recipients.some((recipient) => !recipient.identityId)) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_NOT_FOUND,
        message: "error.auth.identity_not_found",
        statusCode: 403
      });
    }

    const notifications = await this.client.$transaction(
      recipients.map((recipient) =>
        this.client.notification.create({
          data: {
            recipientUserId: recipient.userId,
            recipientIdentityId: recipient.identityId!,
            actorUserId: input.actorUserId,
            actorIdentityId,
            type: NotificationType.ORDER_STATUS,
            title: "Order status updated",
            body: `${input.serviceName} changed from ${input.fromStatus} to ${input.toStatus}.`,
            payload: {
              orderId: input.orderId,
              orderNo: input.orderNo,
              fromStatus: input.fromStatus,
              toStatus: input.toStatus
            }
          }
        })
      )
    );

    return notifications.map((notification) => this.mapNotification(notification));
  }

  private async findCanonicalIdentityId(
    client: Pick<PrismaClient, "userIdentity"> | Pick<Prisma.TransactionClient, "userIdentity">,
    userId: number
  ): Promise<number | null> {
    const customer = await client.userIdentity.findFirst({
      where: {
        userId,
        type: { in: ["customer", "user", "u"] },
        isActive: true,
        deletedAt: null
      },
      orderBy: [{ isDefault: "desc" }, { id: "asc" }],
      select: { id: true }
    });
    if (customer) return customer.id;

    const fallback = await client.userIdentity.findFirst({
      where: { userId, isActive: true, deletedAt: null },
      orderBy: [{ isDefault: "desc" }, { id: "asc" }],
      select: { id: true }
    });
    return fallback?.id ?? null;
  }

  private async findCanonicalPersonalIdentityId(
    client: Pick<PrismaClient, "userIdentity"> | Pick<Prisma.TransactionClient, "userIdentity">,
    userId: number
  ): Promise<number | null> {
    const customer = await client.userIdentity.findFirst({
      where: {
        userId,
        type: { in: ["customer", "user", "u"] },
        isActive: true,
        deletedAt: null
      },
      orderBy: [{ isDefault: "desc" }, { id: "asc" }],
      select: { id: true }
    });
    if (customer) return customer.id;

    const fallback = await client.userIdentity.findFirst({
      where: {
        userId,
        type: { in: ["technician", "scout"] },
        isActive: true,
        deletedAt: null
      },
      orderBy: [{ isDefault: "desc" }, { id: "asc" }],
      select: { id: true }
    });
    return fallback?.id ?? null;
  }

  private async findExistingDirectConversation(
    participantIdentityIds: number[]
  ): Promise<ConversationRecord | null> {
    if (participantIdentityIds.length !== 2) {
      return null;
    }

    return this.client.conversation.findFirst({
      where: {
        type: ConversationType.DIRECT,
        accessPolicy: ConversationAccessPolicy.FRIENDSHIP_REQUIRED,
        friendshipPairKey: toFriendshipPairKey(
          participantIdentityIds[0]!,
          participantIdentityIds[1]!
        ),
        deletedAt: null
      },
      include: this.conversationInclude(participantIdentityIds[0])
    });
  }

  private async findConversationParticipant(conversationId: number, identityId: number) {
    return this.client.conversationParticipant.findFirst({
      where: {
        conversationId,
        identityId,
        deletedAt: null,
        conversation: { deletedAt: null }
      },
      select: { id: true, clearedThroughMessageId: true, createdAt: true }
    });
  }

  private async lockMessageForParticipant(
    tx: Prisma.TransactionClient,
    input: MessageReactionMutationInput
  ): Promise<boolean> {
    const rows = await tx.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`
        SELECT m.id
        FROM messages AS m
        INNER JOIN conversations AS c
          ON c.id = m.conversation_id
          AND c.deleted_at IS NULL
        WHERE m.id = ${input.messageId}
          AND m.conversation_id = ${input.conversationId}
          AND m.deleted_at IS NULL
          AND EXISTS (
            SELECT 1
            FROM conversation_participants AS cp
            WHERE cp.conversation_id = m.conversation_id
              AND cp.identity_id = ${input.identityId ?? input.userId}
              AND cp.deleted_at IS NULL
              AND m.created_at >= cp.created_at
          )
        FOR UPDATE
      `
    );

    return rows.length > 0;
  }

  private async upsertContact(
    tx: Prisma.TransactionClient,
    ownerUserId: number,
    contactUserId: number,
    ownerIdentityId?: number,
    contactIdentityId?: number
  ) {
    const resolvedOwnerIdentityId =
      ownerIdentityId ?? (await this.findCanonicalIdentityId(tx, ownerUserId));
    const resolvedContactIdentityId =
      contactIdentityId ?? (await this.findCanonicalIdentityId(tx, contactUserId));
    if (!resolvedOwnerIdentityId || !resolvedContactIdentityId) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_NOT_FOUND,
        message: "error.auth.identity_not_found",
        statusCode: 403
      });
    }
    return tx.contact.upsert({
      where: {
        ownerIdentityId_contactIdentityId: {
          ownerIdentityId: resolvedOwnerIdentityId,
          contactIdentityId: resolvedContactIdentityId
        }
      },
      create: {
        ownerUserId,
        ownerIdentityId: resolvedOwnerIdentityId,
        contactUserId,
        contactIdentityId: resolvedContactIdentityId,
        source: "friend_request"
      },
      update: {
        source: "friend_request",
        deletedAt: null
      }
    });
  }

  private upsertFollow(
    tx: Prisma.TransactionClient,
    followerUserId: number,
    followingUserId: number,
    followerIdentityId: number,
    followingIdentityId: number
  ) {
    return tx.follow.upsert({
      where: {
        followerIdentityId_followingIdentityId: {
          followerIdentityId,
          followingIdentityId
        }
      },
      create: {
        followerUserId,
        followerIdentityId,
        followingUserId,
        followingIdentityId
      },
      update: { deletedAt: null }
    });
  }

  private async restoreFriendshipConversationParticipants(
    tx: Prisma.TransactionClient,
    leftUserId: number,
    rightUserId: number,
    leftIdentityId: number,
    rightIdentityId: number,
    joinedAt: Date
  ): Promise<void> {
    const conversation = await tx.conversation.findFirst({
      where: {
        accessPolicy: ConversationAccessPolicy.FRIENDSHIP_REQUIRED,
        friendshipPairKey: toFriendshipPairKey(leftIdentityId, rightIdentityId),
        deletedAt: null
      },
      select: { id: true }
    });
    if (!conversation) return;

    const activeParticipants = await tx.conversationParticipant.findMany({
      where: {
        conversationId: conversation.id,
        identityId: { in: [leftIdentityId, rightIdentityId] },
        deletedAt: null
      },
      select: { identityId: true }
    });
    const activeIdentityIds = new Set(
      activeParticipants.map((participant) => participant.identityId)
    );
    for (const participant of [
      { userId: leftUserId, identityId: leftIdentityId },
      { userId: rightUserId, identityId: rightIdentityId }
    ]) {
      if (activeIdentityIds.has(participant.identityId)) continue;
      await tx.conversationParticipant.upsert({
        where: {
          conversationId_identityId: {
            conversationId: conversation.id,
            identityId: participant.identityId
          }
        },
        create: {
          conversationId: conversation.id,
          userId: participant.userId,
          identityId: participant.identityId,
          role: "member",
          createdAt: joinedAt
        },
        update: {
          deletedAt: null,
          createdAt: joinedAt,
          hiddenAt: null,
          clearedThroughMessageId: null,
          lastReadMessageId: null,
          lastReadAt: joinedAt,
          unreadCount: 0,
          isPinned: false,
          isMuted: false
        }
      });
    }
  }

  private async expireDuePendingForPair(
    tx: Prisma.TransactionClient,
    requesterUserId: number,
    requesterIdentityId: number,
    targetIdentityId: number,
    dbNow: Date
  ): Promise<void> {
    const due = await tx.friendRequest.findMany({
      where: {
        status: FriendRequestStatus.PENDING,
        expiresAt: { lte: dbNow },
        deletedAt: null,
        OR: [
          { requesterIdentityId, targetIdentityId },
          {
            requesterIdentityId: targetIdentityId,
            targetIdentityId: requesterIdentityId
          }
        ]
      },
      select: { id: true }
    });
    const dueIds = due.map((request) => request.id);
    if (dueIds.length === 0) {
      return;
    }
    await tx.friendRequest.updateMany({
      where: {
        id: { in: dueIds },
        status: FriendRequestStatus.PENDING,
        expiresAt: { lte: dbNow },
        deletedAt: null
      },
      data: { status: FriendRequestStatus.EXPIRED, expiredAt: dbNow }
    });
    await tx.auditLog.createMany({
      data: dueIds.map((id) => ({
        actorId: requesterUserId,
        action: "im.friend_request.expired",
        targetType: "FriendRequest",
        targetId: id,
        ip: null,
        userAgent: null,
        metadata: { source: "new_request_guard" }
      }))
    });
  }

  private upsertTechnicianApplicationContact(
    transaction: Prisma.TransactionClient,
    ownerUserId: number,
    contactUserId: number,
    ownerIdentityId: number,
    contactIdentityId: number
  ) {
    return transaction.contact.upsert({
      where: {
        ownerIdentityId_contactIdentityId: { ownerIdentityId, contactIdentityId }
      },
      create: {
        ownerUserId,
        ownerIdentityId,
        contactUserId,
        contactIdentityId,
        source: "technician_application"
      },
      update: {
        source: "technician_application",
        deletedAt: null
      }
    });
  }

  private conversationInclude(viewerIdentityId?: number) {
    return {
      participants: {
        where: { deletedAt: null },
        include: {
          user: {
            select: imParticipantUserSelect
          },
          identity: {
            select: imParticipantIdentitySelect
          }
        }
      },
      messages: {
        where: {
          ...this.availableMessageWhere(new Date()),
          ...(viewerIdentityId
            ? {
                userDeletions: {
                  none: { identityId: viewerIdentityId, deletedAt: null }
                }
              }
            : {})
        },
        include: messageInclude,
        orderBy: { id: "desc" as const },
        take: 1
      }
    };
  }

  private mapConversation(
    conversation: ConversationRecord,
    viewerIdentityId: number,
    missingDirectPeer?: ParticipantPayload
  ): ConversationPayload {
    const viewer = conversation.participants.find(
      (participant) => participant.identityId === viewerIdentityId
    );
    const activeDirectPeer =
      conversation.type === ConversationType.DIRECT
        ? conversation.participants.find(
            (participant) => participant.identityId !== viewerIdentityId
          )
        : undefined;

    return {
      id: conversation.id,
      type: this.conversationTypeFromDb(conversation.type),
      title: conversation.title,
      participants: conversation.participants.map((participant) =>
        this.mapParticipant(participant.user, participant.role, participant.identity)
      ),
      directPeer:
        conversation.type === ConversationType.DIRECT
          ? activeDirectPeer
            ? this.mapParticipant(
                activeDirectPeer.user,
                activeDirectPeer.role,
                activeDirectPeer.identity
              )
            : (missingDirectPeer ?? null)
          : null,
      lastMessage:
        conversation.messages[0] &&
        conversation.messages[0].id > (viewer?.clearedThroughMessageId ?? 0) &&
        conversation.messages[0].createdAt.getTime() >= (viewer?.createdAt.getTime() ?? 0)
          ? this.mapMessage(conversation.messages[0], viewerIdentityId)
          : null,
      unreadCount: viewer?.unreadCount ?? 0,
      isPinned: viewer?.isPinned ?? false,
      isMuted: viewer?.isMuted ?? false,
      autoTranslateMessages: viewer?.autoTranslateMessages ?? false,
      isHidden: viewer?.hiddenAt !== null && viewer?.hiddenAt !== undefined,
      privacyModeEnabled: conversation.privacyModeEnabled,
      hideMemberProfiles: conversation.hideMemberProfiles,
      disappearingTtlSeconds: conversation.disappearingTtlSeconds,
      disappearingStartMode:
        conversation.disappearingStartMode === "read_by_all" ? "read_by_all" : "sent",
      privacyPolicyVersion: conversation.privacyPolicyVersion,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt
    };
  }

  private availableMessageWhere(now: Date): Prisma.MessageWhereInput {
    return {
      deletedAt: null,
      expiredAt: null,
      AND: [
        {
          OR: [{ recallMode: null }, { recallMode: MessageRecallMode.STANDARD }]
        },
        {
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
        }
      ]
    };
  }

  private getMissingDirectPeerIdentityId(
    conversation: ConversationRecord,
    viewerIdentityId: number
  ): number | null {
    if (
      conversation.type !== ConversationType.DIRECT ||
      conversation.participants.some(
        (participant) => participant.identityId !== viewerIdentityId
      ) ||
      !conversation.friendshipPairKey
    ) {
      return null;
    }

    const pairIdentityIds = conversation.friendshipPairKey.split(":").map((value) => Number(value));
    if (
      pairIdentityIds.length !== 2 ||
      pairIdentityIds.some((identityId) => !Number.isInteger(identityId) || identityId <= 0) ||
      !pairIdentityIds.includes(viewerIdentityId)
    ) {
      return null;
    }

    return pairIdentityIds.find((identityId) => identityId !== viewerIdentityId) ?? null;
  }

  private async loadMissingDirectPeers(
    conversations: ConversationRecord[],
    viewerIdentityId: number
  ): Promise<Map<number, ParticipantPayload>> {
    const missingPeerIdentityIdByConversationId = new Map<number, number>();
    for (const conversation of conversations) {
      const peerIdentityId = this.getMissingDirectPeerIdentityId(conversation, viewerIdentityId);
      if (peerIdentityId) {
        missingPeerIdentityIdByConversationId.set(conversation.id, peerIdentityId);
      }
    }
    if (missingPeerIdentityIdByConversationId.size === 0) return new Map();

    const identities = await this.client.userIdentity.findMany({
      where: {
        id: {
          in: Array.from(new Set(missingPeerIdentityIdByConversationId.values()))
        },
        isActive: true,
        deletedAt: null,
        user: { isActive: true, deletedAt: null }
      },
      select: {
        ...imParticipantIdentitySelect,
        user: {
          select: imParticipantUserSelect
        }
      }
    });
    const participantByIdentityId = new Map(
      identities.map(
        (identity) =>
          [identity.id, this.mapParticipant(identity.user, undefined, identity)] as const
      )
    );
    const peerByConversationId = new Map<number, ParticipantPayload>();
    for (const [conversationId, peerIdentityId] of missingPeerIdentityIdByConversationId) {
      const participant = participantByIdentityId.get(peerIdentityId);
      if (participant) peerByConversationId.set(conversationId, participant);
    }
    return peerByConversationId;
  }

  private mapMessage(
    message: MessageRecord,
    viewerIdentityId: number,
    now: Date = new Date()
  ): MessagePayload {
    const reactions = new Map<string, MessageReactionPersonPayload[]>();
    for (const reaction of message.reactions) {
      const people = reactions.get(reaction.emoji) ?? [];
      people.push({
        userId: reaction.user.id,
        username: this.resolveParticipantDisplayName(reaction.user, reaction.identity),
        avatarUrl: reaction.user.avatarUrl
      });
      reactions.set(reaction.emoji, people);
    }

    const recallMode =
      message.recallMode === MessageRecallMode.STANDARD
        ? "standard"
        : message.recallMode === MessageRecallMode.TRACELESS
          ? "traceless"
          : null;
    const canRecall =
      message.senderIdentityId === viewerIdentityId &&
      message.recalledAt === null &&
      message.recallMode === null &&
      message.contentPurgedAt === null &&
      now.getTime() <= message.recallDeadlineAt.getTime() &&
      (message.expiresAt === null || now.getTime() < message.expiresAt.getTime());

    return {
      id: message.id,
      conversationId: message.conversationId,
      senderUserId: message.senderUserId,
      type: this.messageTypeFromDb(message.type),
      content: message.content,
      metadata: message.metadata,
      reactions: Array.from(reactions.entries())
        .sort(([left], [right]) => compareMessageReactionCategories(left, right))
        .map(([emoji, people]) => ({
          emoji,
          people,
          reactedByMe: message.reactions.some(
            (reaction) => reaction.emoji === emoji && reaction.identityId === viewerIdentityId
          )
        })),
      expiresAt: message.expiresAt,
      createdAt: message.createdAt,
      recallDeadlineAt: message.recallDeadlineAt,
      recalledAt: message.recalledAt,
      recallMode,
      contentPurgedAt: message.contentPurgedAt,
      privacyPolicyVersionAtSend: message.privacyPolicyVersionAtSend,
      lifecycleVersion: message.lifecycleVersion,
      reactionVersion: message.reactionVersion,
      availableRecallModes: canRecall ? ["standard"] : []
    };
  }

  private mapContact(contact: ContactRecord): ContactPayload {
    return {
      id: contact.id,
      ownerUserId: contact.ownerUserId,
      ownerIdentityId: contact.ownerIdentityId,
      contactUserId: contact.contactUserId,
      contactIdentityId: contact.contactIdentityId,
      contactUser: this.mapParticipant(contact.contactUser, undefined, contact.contactIdentity),
      nickname: contact.nickname,
      source: contact.source,
      isBlocked: contact.blockedAt !== null,
      createdAt: contact.createdAt
    };
  }

  private mapParticipant(
    user: Pick<ImParticipantUserRecord, "id" | "needoId" | "username" | "avatarUrl"> &
      Partial<Pick<ImParticipantUserRecord, "customerProfile" | "technicianProfile">>,
    role?: string,
    identity?: ImParticipantIdentityRecord | null
  ): ParticipantPayload {
    return {
      userId: user.id,
      needoId: user.needoId,
      username: this.resolveParticipantDisplayName(user, identity),
      avatarUrl: user.avatarUrl,
      ...(role === "owner" || role === "admin" || role === "member" ? { role } : {})
    };
  }

  private resolveParticipantDisplayName(
    user: Pick<ImParticipantUserRecord, "username"> &
      Partial<Pick<ImParticipantUserRecord, "customerProfile" | "technicianProfile">>,
    identity?: ImParticipantIdentityRecord | null
  ): string {
    const identityType = identity?.type?.toLowerCase();
    if (
      ["customer", "user", "u"].includes(identityType ?? "") &&
      user.customerProfile?.deletedAt === null
    ) {
      return user.customerProfile.displayName.trim() || user.username;
    }
    if (identityType === "technician" && user.technicianProfile?.deletedAt === null) {
      return user.technicianProfile.displayName.trim() || user.username;
    }
    if (
      ["merchant", "merchant_owner", "merchant_staff"].includes(identityType ?? "") &&
      identity?.merchantIdentityProfile?.deletedAt === null
    ) {
      return identity.merchantIdentityProfile.displayName.trim() || user.username;
    }
    return identity?.displayName?.trim() || user.username;
  }

  private findCanonicalParticipantIdentity<T extends { type: string }>(
    identities: T[]
  ): T | undefined {
    return (
      identities.find((identity) =>
        ["customer", "user", "u"].includes(identity.type.toLowerCase())
      ) ?? identities[0]
    );
  }

  private async buildDirectoryIdentityCard(
    user: DirectoryProfileUserRecord,
    targetIdentityId: number
  ): Promise<DirectoryIdentityCardPayload> {
    const identity =
      user.identities.find((item) => item.id === targetIdentityId) ??
      user.identities.find((item) =>
        ["customer", "technician", "merchant", "merchant_owner", "merchant_staff"].includes(
          item.type
        )
      ) ??
      user.identities[0];
    const profileBackedIdentityTypes = [
      "customer",
      "user",
      "u",
      "technician",
      "merchant",
      "merchant_owner",
      "merchant_staff"
    ];
    const fallback: DirectoryIdentityCardPayload = {
      entityType: "account",
      profileId: null,
      displayName:
        identity && !profileBackedIdentityTypes.includes(identity.type)
          ? identity.displayName?.trim() || user.username
          : user.username,
      identityLabel: identity?.type ?? null,
      verified: false,
      creditValue: null,
      creditReviewCount: 0,
      gender: null,
      age: null,
      heightCm: null,
      languages: [],
      city: null,
      serviceArea: null,
      yearsExperience: null,
      bio: null
    };

    if (identity?.type === "customer") {
      const profile = user.customerProfile;
      if (
        !profile ||
        profile.deletedAt !== null ||
        !profile.isPublic ||
        profile.visibility !== "public"
      ) {
        return fallback;
      }
      const review = profile.reviewSummary?.deletedAt === null ? profile.reviewSummary : null;
      const customerLanguages = toDirectoryLanguages(profile.languages);
      const technicianLanguages =
        customerLanguages.length === 0 &&
        user.technicianProfile?.deletedAt === null &&
        user.technicianProfile.status === "published" &&
        user.technicianProfile.visibility === "public"
          ? toDirectoryLanguages(user.technicianProfile.languages)
          : [];
      return {
        entityType: "user",
        profileId: profile.id,
        displayName: profile.displayName,
        identityLabel: this.directoryMembershipTierCode(user),
        verified: false,
        creditValue: review?.ratingAverage.toString() ?? null,
        creditReviewCount: review?.reviewCount ?? 0,
        gender: profile.gender === "private" ? null : profile.gender,
        age: profile.age,
        heightCm: profile.heightCm?.toString() ?? null,
        languages: customerLanguages.length > 0 ? customerLanguages : technicianLanguages,
        city: profile.city,
        serviceArea: null,
        yearsExperience: null,
        bio: profile.bio
      };
    }

    if (identity?.type === "technician") {
      const profile = user.technicianProfile;
      if (!profile || profile.deletedAt !== null || profile.status !== "published") {
        return fallback;
      }
      const review = profile.reviewSummary?.deletedAt === null ? profile.reviewSummary : null;
      return {
        entityType: "technician",
        profileId: profile.id,
        displayName: profile.displayName,
        identityLabel: profile.employmentType,
        verified: profile.verifiedAt !== null,
        creditValue: review?.ratingAverage.toString() ?? null,
        creditReviewCount: review?.reviewCount ?? 0,
        gender: null,
        age: profile.age ?? null,
        heightCm: profile.heightCm?.toString() ?? null,
        languages: profile.visibility === "public" ? toDirectoryLanguages(profile.languages) : [],
        city: profile.city,
        serviceArea: profile.serviceArea,
        yearsExperience: profile.yearsExperience,
        bio: profile.bio
      };
    }

    if (
      identity &&
      ["merchant", "merchant_owner", "merchant_staff"].includes(identity.type) &&
      identity.scopeType === "shop" &&
      identity.scopeId !== null
    ) {
      const shop = await this.client.shop.findFirst({
        where: {
          id: identity.scopeId,
          status: "published",
          deletedAt: null
        },
        select: {
          id: true,
          name: true,
          description: true,
          city: true,
          address: true,
          reviewSummary: {
            select: {
              ratingAverage: true,
              reviewCount: true,
              deletedAt: true
            }
          }
        }
      });
      if (shop) {
        const review = shop.reviewSummary?.deletedAt === null ? shop.reviewSummary : null;
        return {
          entityType: "shop",
          profileId: shop.id,
          displayName: shop.name,
          identityLabel: identity.type,
          verified: true,
          creditValue: review?.ratingAverage.toString() ?? null,
          creditReviewCount: review?.reviewCount ?? 0,
          gender: null,
          age: null,
          heightCm: null,
          languages: [],
          city: shop.city,
          serviceArea: shop.address,
          yearsExperience: null,
          bio: shop.description
        };
      }
    }

    return fallback;
  }

  private directoryMembershipTierCode(user: DirectoryProfileUserRecord): string {
    const code =
      user.membershipAdjustments?.[0]?.tierVersion?.tier.code ??
      user.platformMembershipEntitlements?.[0]?.tierVersion.tier.code;
    if (code === PlatformMembershipTierCode.SILVER) return "silver";
    if (code === PlatformMembershipTierCode.GOLD) return "gold";
    if (code === PlatformMembershipTierCode.BLACK_DIAMOND) return "black_diamond";
    return "free";
  }

  private async loadTechnicianContactDetails(
    technicianProfileId: number,
    dbNow: Date
  ): Promise<TechnicianContactDetailsPayload | undefined> {
    const profile = await this.client.technicianProfile.findFirst({
      where: {
        id: technicianProfileId,
        status: "published",
        deletedAt: null
      },
      select: {
        bidBudgetMinJpy: true,
        bidBudgetMaxJpy: true,
        paymentMethods: true,
        profileTags: true,
        backofficeProfileTags: {
          where: {
            isActive: true,
            deletedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: dbNow } }]
          },
          select: { id: true, label: true },
          orderBy: [{ id: "asc" }]
        },
        performanceSummary: {
          select: {
            completedOrderCount: true,
            acceptanceRateBps: true,
            deletedAt: true
          }
        },
        technicianServices: {
          where: {
            deletedAt: null,
            isActive: true,
            reviewStatus: "APPROVED"
          },
          select: {
            id: true,
            shopId: true,
            name: true,
            priceAmount: true,
            currency: true,
            durationMinutes: true,
            sortOrder: true
          },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          take: 5
        }
      }
    });
    if (!profile) {
      return undefined;
    }
    const summary =
      profile.performanceSummary?.deletedAt === null ? profile.performanceSummary : null;

    return {
      bidBudgetMinJpy: profile.bidBudgetMinJpy,
      bidBudgetMaxJpy: profile.bidBudgetMaxJpy,
      paymentMethods: toDirectoryLanguages(profile.paymentMethods),
      specialTags: profile.backofficeProfileTags.map(({ label }) => label),
      profileTags: toDirectoryLanguages(profile.profileTags),
      services: profile.technicianServices.map((service) => ({
        ...service,
        taxIncluded: true
      })),
      completedOrderCount: summary?.completedOrderCount ?? 0,
      acceptanceRateBps: summary?.acceptanceRateBps ?? 10_000
    };
  }

  private mapFriendRequest(friendRequest: FriendRequestRecord, dbNow?: Date): FriendRequestPayload {
    const effectivelyExpired =
      friendRequest.status === FriendRequestStatus.PENDING &&
      dbNow !== undefined &&
      friendRequest.expiresAt.getTime() <= dbNow.getTime();
    return {
      id: friendRequest.id,
      requesterUserId: friendRequest.requesterUserId,
      requesterIdentityId: friendRequest.requesterIdentityId,
      targetUserId: friendRequest.targetUserId,
      targetIdentityId: friendRequest.targetIdentityId,
      requester: this.mapParticipant(friendRequest.requester),
      target: this.mapParticipant(friendRequest.target),
      status: effectivelyExpired ? "expired" : this.friendRequestStatusFromDb(friendRequest.status),
      message: friendRequest.message,
      respondedAt: friendRequest.respondedAt,
      expiresAt: friendRequest.expiresAt,
      expiredAt: effectivelyExpired
        ? (friendRequest.expiredAt ?? friendRequest.expiresAt)
        : friendRequest.expiredAt,
      createdAt: friendRequest.createdAt
    };
  }

  private async loadSocialRelationshipMap(
    viewerIdentityId: number,
    authorIdentityIds: number[]
  ): Promise<SocialRelationshipMap> {
    const uniqueAuthorIdentityIds = [...new Set(authorIdentityIds)];
    if (uniqueAuthorIdentityIds.length === 0) {
      return { follows: new Set(), friendIdentityIds: new Set() };
    }

    const [relationships, contacts] = await Promise.all([
      this.client.follow.findMany({
        where: {
          deletedAt: null,
          OR: [
            {
              followerIdentityId: viewerIdentityId,
              followingIdentityId: { in: uniqueAuthorIdentityIds }
            },
            {
              followerIdentityId: { in: uniqueAuthorIdentityIds },
              followingIdentityId: viewerIdentityId
            }
          ]
        },
        select: {
          followerIdentityId: true,
          followingIdentityId: true
        }
      }),
      this.client.contact.findMany({
        where: {
          blockedAt: null,
          deletedAt: null,
          OR: [
            {
              ownerIdentityId: viewerIdentityId,
              contactIdentityId: { in: uniqueAuthorIdentityIds }
            },
            {
              ownerIdentityId: { in: uniqueAuthorIdentityIds },
              contactIdentityId: viewerIdentityId
            }
          ]
        },
        select: { ownerIdentityId: true, contactIdentityId: true }
      })
    ]);
    const follows = new Set(
      relationships.map(
        (relationship) => `${relationship.followerIdentityId}:${relationship.followingIdentityId}`
      )
    );
    const contactPairs = new Set(
      contacts.map((contact) => `${contact.ownerIdentityId}:${contact.contactIdentityId}`)
    );
    const friendIdentityIds = new Set(
      uniqueAuthorIdentityIds.filter(
        (authorIdentityId) =>
          authorIdentityId !== viewerIdentityId &&
          contactPairs.has(`${viewerIdentityId}:${authorIdentityId}`) &&
          contactPairs.has(`${authorIdentityId}:${viewerIdentityId}`)
      )
    );

    return { follows, friendIdentityIds };
  }

  private socialPostVisibleWhere(
    viewerIdentityId: number,
    postId?: number
  ): Prisma.SocialPostWhereInput {
    return {
      ...(postId !== undefined ? { id: postId } : {}),
      deletedAt: null,
      OR: [
        { visibility: SocialPostVisibility.PUBLIC },
        { authorIdentityId: viewerIdentityId },
        {
          authorIdentity: {
            followers: {
              some: { followerIdentityId: viewerIdentityId, deletedAt: null }
            }
          }
        }
      ]
    };
  }

  private async loadSocialInteractionMap(
    viewerIdentityId: number,
    postIds: number[]
  ): Promise<SocialInteractionMap> {
    const uniquePostIds = [...new Set(postIds)];
    if (uniquePostIds.length === 0) {
      return {
        likedPostIds: new Set(),
        bookmarkedPostIds: new Set(),
        sharedPostIds: new Set()
      };
    }

    const [likes, bookmarks, shares] = await Promise.all([
      this.client.socialPostLike.findMany({
        where: {
          postId: { in: uniquePostIds },
          actorIdentityId: viewerIdentityId,
          deletedAt: null
        },
        select: { postId: true }
      }),
      this.client.socialPostBookmark.findMany({
        where: {
          postId: { in: uniquePostIds },
          actorIdentityId: viewerIdentityId,
          deletedAt: null
        },
        select: { postId: true }
      }),
      this.client.socialPostShare.findMany({
        where: {
          postId: { in: uniquePostIds },
          actorIdentityId: viewerIdentityId,
          deletedAt: null
        },
        select: { postId: true },
        distinct: ["postId"]
      })
    ]);

    return {
      likedPostIds: new Set(likes.map((item) => item.postId)),
      bookmarkedPostIds: new Set(bookmarks.map((item) => item.postId)),
      sharedPostIds: new Set(shares.map((item) => item.postId))
    };
  }

  private mapSocialAuthor(
    author: SocialAuthorRecord,
    postIdentity?: ImParticipantIdentityRecord
  ): SocialPostAuthorPayload {
    const identity =
      postIdentity ??
      author.identities.find((item) =>
        ["customer", "technician", "merchant", "merchant_owner", "merchant_staff"].includes(
          item.type
        )
      ) ??
      author.identities[0];
    const entityType: SocialPostAuthorPayload["entityType"] =
      identity?.type === "technician"
        ? "technician"
        : identity?.type === "merchant" ||
            identity?.type === "merchant_owner" ||
            identity?.type === "merchant_staff"
          ? "shop"
          : "user";

    return {
      userId: author.id,
      identityId: identity?.id ?? author.id,
      username: author.username,
      displayName: this.resolveParticipantDisplayName(author, identity),
      avatarUrl: author.avatarUrl,
      entityType,
      joinedAt: author.createdAt
    };
  }

  private mapSocialPost(
    socialPost: SocialPostRecord,
    viewerIdentityId: number,
    authorIdentityId: number,
    relationshipMap: SocialRelationshipMap = {
      follows: new Set(),
      friendIdentityIds: new Set()
    },
    interactionMap: SocialInteractionMap = {
      likedPostIds: new Set(),
      bookmarkedPostIds: new Set(),
      sharedPostIds: new Set()
    }
  ): SocialPostPayload {
    const envelope = this.jsonRecord(socialPost.media);
    const legacyCounters = this.jsonRecord(envelope?.counters);
    return {
      id: socialPost.id,
      authorUserId: socialPost.authorUserId,
      authorIdentityId: socialPost.authorIdentityId,
      content: socialPost.content,
      media: socialPost.media,
      replyToPostId: socialPost.replyToPostId,
      replyCount: socialPost._count.replies,
      visibility: this.socialPostVisibilityFromDb(socialPost.visibility),
      createdAt: socialPost.createdAt,
      updatedAt: socialPost.updatedAt,
      isPinned: socialPost.authorIdentity.pinnedSocialPostId === socialPost.id,
      viewerFollowsAuthor:
        viewerIdentityId === authorIdentityId ||
        relationshipMap.follows.has(`${viewerIdentityId}:${authorIdentityId}`),
      authorFollowsViewer:
        viewerIdentityId === authorIdentityId ||
        relationshipMap.follows.has(`${authorIdentityId}:${viewerIdentityId}`),
      viewerIsFriend: relationshipMap.friendIdentityIds.has(authorIdentityId),
      counters: {
        likes: this.jsonCounter(legacyCounters?.likes, 0) + socialPost._count.likes,
        reposts: this.jsonCounter(legacyCounters?.reposts, 0) + socialPost._count.shares,
        views: this.jsonCounter(legacyCounters?.views, 1) + socialPost._count.views,
        bookmarks: this.jsonCounter(legacyCounters?.bookmarks, 0) + socialPost._count.bookmarks
      },
      viewerInteraction: {
        liked: interactionMap.likedPostIds.has(socialPost.id),
        bookmarked: interactionMap.bookmarkedPostIds.has(socialPost.id),
        shared: interactionMap.sharedPostIds.has(socialPost.id)
      },
      author: this.mapSocialAuthor(socialPost.author, socialPost.authorIdentity)
    };
  }

  private mapFollow(follow: FollowRecord): FollowPayload {
    return {
      id: follow.id,
      followerUserId: follow.followerUserId,
      followerIdentityId: follow.followerIdentityId,
      followingUserId: follow.followingUserId,
      followingIdentityId: follow.followingIdentityId,
      createdAt: follow.createdAt
    };
  }

  private mapNotification(notification: NotificationRecord): NotificationPayload {
    return {
      id: notification.id,
      recipientUserId: notification.recipientUserId,
      recipientIdentityId: notification.recipientIdentityId,
      actorUserId: notification.actorUserId,
      actorIdentityId: notification.actorIdentityId,
      type: this.notificationTypeFromDb(notification.type),
      title: notification.title,
      body: notification.body,
      payload: notification.payload,
      readAt: notification.readAt,
      createdAt: notification.createdAt
    };
  }

  private friendRequestDirectionWhere(
    identityId: number,
    direction: "incoming" | "outgoing" | "all"
  ): Prisma.FriendRequestWhereInput {
    if (direction === "incoming") {
      return { targetIdentityId: identityId };
    }
    if (direction === "outgoing") {
      return { requesterIdentityId: identityId };
    }

    return {
      OR: [{ requesterIdentityId: identityId }, { targetIdentityId: identityId }]
    };
  }

  private conversationTypeToDb(type: ConversationTypePayload): ConversationType {
    return type === "group" ? ConversationType.GROUP : ConversationType.DIRECT;
  }

  private conversationTypeFromDb(type: ConversationType): ConversationTypePayload {
    return type === ConversationType.GROUP ? "group" : "direct";
  }

  private messageTypeToDb(type: MessageTypePayload): MessageType {
    if (type === "system") {
      return MessageType.SYSTEM;
    }
    if (type === "orderStatus") {
      return MessageType.ORDER_STATUS;
    }

    return MessageType.TEXT;
  }

  private messageTypeFromDb(type: MessageType): MessageTypePayload {
    if (type === MessageType.SYSTEM) {
      return "system";
    }
    if (type === MessageType.ORDER_STATUS) {
      return "orderStatus";
    }

    return "text";
  }

  private entityShareTargetWhere(target: ResolvedEntityTarget): Prisma.EntityShareEventWhereInput {
    if (target.targetType === "shop") return { shopId: target.shopId };
    if (target.targetType === "technician") {
      return { technicianProfileId: target.technicianProfileId };
    }
    if (target.targetType === "service") return { serviceId: target.serviceId };
    return { technicianServiceId: target.technicianServiceId };
  }

  private async buildEntityShareMetadata(
    tx: Prisma.TransactionClient,
    target: ResolvedEntityTarget
  ): Promise<Prisma.InputJsonValue> {
    if (target.targetType === "service") {
      const service = await tx.service.findFirstOrThrow({
        where: { id: target.serviceId as number, deletedAt: null, status: PUBLISHED_STATUS },
        select: {
          publicId: true,
          name: true,
          description: true,
          priceAmount: true,
          currency: true,
          durationMinutes: true,
          city: true,
          category: { select: { name: true } },
          shop: {
            select: { name: true, address: true, publicIdentifier: { select: { publicId: true } } }
          },
          mediaAssets: {
            where: { deletedAt: null, isActive: true, usageType: "cover" },
            select: { url: true },
            take: 1
          },
          _count: {
            select: {
              bookingOrders: { where: { status: "COMPLETED", deletedAt: null } },
              entityFavorites: { where: { deletedAt: null } },
              entityShareEvents: { where: { deletedAt: null } }
            }
          }
        }
      });
      return {
        needoMessageType: "service-card",
        needoMessageExt: {
          serviceCard: {
            serviceId: service.publicId,
            name: service.name,
            cover: service.mediaAssets[0]?.url ?? "",
            summary: service.description ?? "",
            priceLabel: `${service.currency} ${service.priceAmount}`,
            durationLabel: `${service.durationMinutes}分钟`,
            providerName: service.shop.name,
            providerId: service.shop.publicIdentifier?.publicId ?? undefined,
            providerType: "store",
            href: `/services/${service.publicId}`,
            tags: [service.category.name, service.city],
            priceAmount: Number(service.priceAmount),
            currency: service.currency,
            durationMinutes: service.durationMinutes,
            usageCount: service._count.bookingOrders,
            favoriteCount: service._count.entityFavorites,
            shareCount: service._count.entityShareEvents + 1,
            isBookable: true,
            shopAddress: service.shop.address,
            targetType: "service"
          }
        }
      } as Prisma.InputJsonValue;
    }
    if (target.targetType === "technician_service") {
      const service = await tx.technicianService.findFirstOrThrow({
        where: {
          id: target.technicianServiceId as number,
          deletedAt: null,
          isActive: true,
          reviewStatus: "APPROVED"
        },
        select: {
          publicId: true,
          name: true,
          description: true,
          priceAmount: true,
          currency: true,
          durationMinutes: true,
          coverImageUrl: true,
          tagsJson: true,
          isBookable: true,
          shop: {
            select: { name: true, address: true, publicIdentifier: { select: { publicId: true } } }
          },
          technicianProfile: { select: { displayName: true } },
          _count: {
            select: {
              bookingOrders: { where: { status: "COMPLETED", deletedAt: null } },
              entityFavorites: { where: { deletedAt: null } },
              entityShareEvents: { where: { deletedAt: null } }
            }
          }
        }
      });
      return {
        needoMessageType: "service-card",
        needoMessageExt: {
          serviceCard: {
            serviceId: service.publicId,
            name: service.name,
            cover: service.coverImageUrl ?? "",
            summary: service.description ?? "",
            priceLabel: `${service.currency} ${service.priceAmount}`,
            durationLabel: `${service.durationMinutes}分钟`,
            providerName: service.technicianProfile.displayName,
            providerId: service.shop?.publicIdentifier?.publicId ?? undefined,
            providerType: "technician",
            href: `/technician-services/${service.publicId}`,
            tags: this.jsonStringArray(service.tagsJson),
            priceAmount: service.priceAmount,
            currency: service.currency,
            durationMinutes: service.durationMinutes,
            usageCount: service._count.bookingOrders,
            favoriteCount: service._count.entityFavorites,
            shareCount: service._count.entityShareEvents + 1,
            isBookable: service.isBookable,
            shopAddress: service.shop?.address ?? null,
            targetType: "technician_service"
          }
        }
      } as Prisma.InputJsonValue;
    }
    if (target.targetType === "shop") {
      const shop = await tx.shop.findFirstOrThrow({
        where: { id: target.shopId as number, deletedAt: null, status: PUBLISHED_STATUS },
        select: {
          name: true,
          address: true,
          description: true,
          mediaAssets: {
            where: { deletedAt: null, isActive: true, usageType: "cover" },
            select: { url: true },
            take: 1
          },
          reviewSummary: { select: { ratingAverage: true, reviewCount: true } },
          _count: {
            select: {
              bookingOrders: { where: { status: "COMPLETED", deletedAt: null } },
              entityFavorites: { where: { deletedAt: null } },
              entityShareEvents: { where: { deletedAt: null } }
            }
          }
        }
      });
      return {
        needoMessageType: "shop-card",
        needoMessageExt: {
          shopCard: {
            publicId: target.publicId,
            name: shop.name,
            imageUrl: shop.mediaAssets[0]?.url ?? null,
            description: shop.description,
            address: shop.address,
            rating: Number(shop.reviewSummary?.ratingAverage ?? 0),
            reviewCount: shop.reviewSummary?.reviewCount ?? 0,
            completedOrderCount: shop._count.bookingOrders,
            favoriteCount: shop._count.entityFavorites,
            shareCount: shop._count.entityShareEvents + 1,
            tags: []
          }
        }
      } as Prisma.InputJsonValue;
    }
    const technician = await tx.technicianProfile.findFirstOrThrow({
      where: {
        id: target.technicianProfileId as number,
        deletedAt: null,
        status: PUBLISHED_STATUS,
        visibility: "public"
      },
      select: {
        displayName: true,
        bio: true,
        languages: true,
        mediaAssets: {
          where: { deletedAt: null, isActive: true, usageType: "avatar" },
          select: { url: true },
          take: 1
        },
        reviewSummary: { select: { ratingAverage: true } },
        performanceSummary: { select: { completedOrderCount: true } },
        _count: {
          select: {
            entityFavorites: { where: { deletedAt: null } },
            entityShareEvents: { where: { deletedAt: null } }
          }
        }
      }
    });
    return {
      needoMessageType: "technician-card",
      needoMessageExt: {
        technicianCard: {
          publicId: target.publicId,
          name: technician.displayName,
          imageUrl: technician.mediaAssets[0]?.url ?? null,
          description: technician.bio,
          languages: this.jsonStringArray(technician.languages),
          rating: Number(technician.reviewSummary?.ratingAverage ?? 0),
          completedOrderCount: technician.performanceSummary?.completedOrderCount ?? 0,
          favoriteCount: technician._count.entityFavorites,
          shareCount: technician._count.entityShareEvents + 1,
          tags: [],
          specialReviewTags: []
        }
      }
    } as Prisma.InputJsonValue;
  }

  private jsonStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .slice(0, 8)
      : [];
  }

  private entityShareReceipt(
    target: ResolvedEntityTarget,
    eventId: number,
    messageId: number | null,
    shareCount: number,
    replayed: boolean
  ): EntityShareReceipt {
    return {
      targetType: target.targetType,
      publicId: target.publicId,
      eventId,
      messageId,
      shareCount,
      replayed
    };
  }

  private friendRequestStatusToDb(status: FriendRequestStatusPayload): FriendRequestStatus {
    if (status === "accepted") {
      return FriendRequestStatus.ACCEPTED;
    }
    if (status === "rejected") {
      return FriendRequestStatus.REJECTED;
    }
    if (status === "expired") {
      return FriendRequestStatus.EXPIRED;
    }

    return FriendRequestStatus.PENDING;
  }

  private friendRequestStatusFromDb(status: FriendRequestStatus): FriendRequestStatusPayload {
    if (status === FriendRequestStatus.ACCEPTED) {
      return "accepted";
    }
    if (status === FriendRequestStatus.REJECTED) {
      return "rejected";
    }
    if (status === FriendRequestStatus.EXPIRED) {
      return "expired";
    }

    return "pending";
  }

  private socialPostVisibilityToDb(visibility: SocialPostVisibilityPayload): SocialPostVisibility {
    return visibility === "followers"
      ? SocialPostVisibility.FOLLOWERS
      : SocialPostVisibility.PUBLIC;
  }

  private socialPostVisibilityFromDb(
    visibility: SocialPostVisibility
  ): SocialPostVisibilityPayload {
    return visibility === SocialPostVisibility.FOLLOWERS ? "followers" : "public";
  }

  private notificationTypeFromDb(type: NotificationType): NotificationTypePayload {
    if (type === NotificationType.ORDER_STATUS) {
      return "orderStatus";
    }
    if (type === NotificationType.FRIEND_REQUEST) {
      return "friendRequest";
    }
    if (type === NotificationType.SOCIAL) {
      return "social";
    }

    return "system";
  }

  private resolveBatchDeleteReplay(
    command: { requestFingerprint: string; resultJson: unknown },
    requestFingerprint: string
  ): DeleteMessagesForUserPayload {
    if (command.requestFingerprint !== requestFingerprint) {
      throw new AppError({
        code: ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
        message: "error.idempotency_key_reused",
        statusCode: 409
      });
    }
    const result = this.jsonRecord(command.resultJson);
    const conversationId = result?.conversationId;
    const messageIds = this.jsonPositiveIntegerArray(result?.messageIds);
    const count = result?.count;
    if (
      !Number.isSafeInteger(conversationId) ||
      (conversationId as number) <= 0 ||
      messageIds.length === 0 ||
      count !== messageIds.length ||
      result?.deleted !== true
    ) {
      throw new AppError({
        code: ERROR_CODES.INTERNAL,
        message: "error.internal",
        statusCode: 500
      });
    }
    return {
      conversationId: conversationId as number,
      messageIds,
      count: messageIds.length,
      deleted: true,
      replayed: true
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
  }

  private socialPostConflict(message: string): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message,
      statusCode: 409
    });
  }

  private jsonRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private jsonCounter(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
  }

  private jsonPositiveIntegerArray(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    return Array.from(
      new Set(
        value.filter(
          (item): item is number =>
            typeof item === "number" && Number.isSafeInteger(item) && item > 0
        )
      )
    );
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined) {
      return undefined;
    }

    return value as Prisma.InputJsonValue;
  }
}
