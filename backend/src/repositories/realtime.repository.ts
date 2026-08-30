import {
  ConversationAccessPolicy,
  ConversationType,
  FriendRequestStatus,
  ImDeletionAction,
  MessageRecallMode,
  MessageType,
  NotificationType,
  Prisma,
  SocialPostVisibility
} from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import {
  compareMessageReactionCategories,
  getMessageReactionCategory
} from "../constants/message-reaction.constants";
import { prisma } from "../prisma/client";
import type { AuthRequestContext } from "../services/auth.service";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";
import type { EnsureTechnicianApplicationContactInput } from "../services/technician-application-review.service";
import { AppError } from "../utils/app-error";

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

export interface DirectoryProfilePayload {
  user: ParticipantPayload;
  identityCard: DirectoryIdentityCardPayload;
  relationship: "none" | "friend" | "incoming_pending" | "outgoing_pending" | "self";
  contactId: number | null;
  friendRequest: FriendRequestPayload | null;
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
  visibility: SocialPostVisibilityPayload;
  createdAt: Date;
  updatedAt: Date;
  author: SocialPostAuthorPayload;
  viewerFollowsAuthor: boolean;
  authorFollowsViewer: boolean;
  viewerIsFriend: boolean;
}

type SocialRelationshipMap = {
  follows: Set<string>;
  friendIdentityIds: Set<number>;
};

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
  | { status: "not_friends" };

export interface RecallMessageInput {
  conversationId: number;
  messageId: number;
  senderUserId: number;
  senderIdentityId?: number;
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
}

export interface CreateSocialPostResult {
  post: SocialPostPayload;
  notifications: NotificationPayload[];
}

export interface UpdateSocialPostInput extends CreateSocialPostInput {
  postId: number;
}

export type UpdateSocialPostResult = CreateSocialPostResult;

export interface SocialPostListInput extends PaginationInput {
  authorUserId?: number;
  authorIdentityId?: number;
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
  leaveConversation: (
    input: LeaveConversationInput
  ) => Promise<LeaveConversationOutcome>;
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
  listConversations: (
    userId: number,
    input: PaginationInput
  ) => Promise<PaginatedResponse<ConversationPayload>>;
  createMessage: (input: CreateMessageInput) => Promise<CreateMessageOutcome>;
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
    targetIdentityId: number
  ) => Promise<DirectoryProfilePayload | null>;
  createFriendRequest: (input: CreateFriendRequestInput) => Promise<CreateFriendRequestOutcome>;
  listFriendRequests: (
    userId: number,
    input: FriendRequestListInput
  ) => Promise<PaginatedResponse<FriendRequestPayload>>;
  respondToFriendRequest: (
    input: RespondFriendRequestInput
  ) => Promise<RespondFriendRequestOutcome>;
  expireDueFriendRequests: (input: {
    batchSize: number;
  }) => Promise<FriendRequestPayload[]>;
  createSocialPost: (input: CreateSocialPostInput) => Promise<CreateSocialPostResult>;
  updateSocialPost: (input: UpdateSocialPostInput) => Promise<UpdateSocialPostResult | null>;
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

const messageInclude = {
  reactions: {
    where: { deletedAt: null },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          avatarUrl: true
        }
      }
    },
    orderBy: { id: "asc" as const }
  }
} satisfies Prisma.MessageInclude;

const socialAuthorSelect = {
  id: true,
  username: true,
  avatarUrl: true,
  createdAt: true,
  identities: {
    where: { deletedAt: null, isActive: true },
    select: { id: true, type: true, displayName: true, isDefault: true },
    orderBy: [{ isDefault: "desc" as const }, { id: "asc" as const }]
  }
} satisfies Prisma.UserSelect;

const socialPostInclude = {
  author: {
    select: socialAuthorSelect
  },
  authorIdentity: {
    select: { id: true, type: true, displayName: true }
  }
} satisfies Prisma.SocialPostInclude;

const contactInclude = {
  contactUser: {
    select: {
      id: true,
      needoId: true,
      username: true,
      avatarUrl: true
    }
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
        user: {
          select: {
            id: true;
            needoId: true;
            username: true;
            avatarUrl: true;
          };
        };
      };
    };
    messages: {
      include: typeof messageInclude;
    };
  };
}>;

type MessageRecord = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;
type ContactRecord = Prisma.ContactGetPayload<{ include: typeof contactInclude }>;
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
  customerProfile: {
    id: number;
    displayName: string;
    bio: string | null;
    city: string | null;
    membershipLevel: string;
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
    languages: unknown;
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

  public async createConversation(
    input: CreateConversationInput
  ): Promise<CreateConversationOutcome> {
    const creatorIdentityId = input.creatorIdentityId ??
      await this.findCanonicalIdentityIdForUser(input.creatorUserId);
    if (!creatorIdentityId) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_NOT_FOUND,
        message: "error.auth.identity_not_found",
        statusCode: 403
      });
    }
    const requestedUsers = Array.from(new Set([input.creatorUserId, ...input.participantUserIds]));
    const suppliedIdentities = new Map(
      input.participantIdentities?.map((participant) => [participant.userId, participant.identityId]) ?? []
    );
    suppliedIdentities.set(input.creatorUserId, creatorIdentityId);
    const participantIdentities = await Promise.all(
      requestedUsers.map(async (userId) => ({
        userId,
        identityId: suppliedIdentities.get(userId) ??
          await this.findCanonicalIdentityIdForUser(userId)
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
      .map((participant) => ({ userId: participant.userId, identityId: participant.identityId as number }))
      .sort((left, right) => left.identityId - right.identityId);
    const participantIdentityIds = resolvedParticipants.map((participant) => participant.identityId);
    if (input.type === "direct") {
      if (participantIdentityIds.length !== 2) {
        return { status: "not_friends" };
      }
      const reciprocalContactCount = await this.client.contact.count({
        where: {
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
          (await this.getConversationForUser(existingDirect.id, creatorIdentityId, input.creatorUserId)) ??
          this.mapConversation(existingDirect, creatorIdentityId)
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

  public async leaveConversation(
    input: LeaveConversationInput
  ): Promise<LeaveConversationOutcome> {
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
      const nextOwner = leaving.role === "owner" && !shouldDissolve
        ? (requestedOwner ?? null)
        : null;
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

  public async createMessage(input: CreateMessageInput): Promise<CreateMessageOutcome> {
    return this.client.$transaction(async (tx) => {
      const participant = await tx.conversationParticipant.findFirst({
        where: {
          conversationId: input.conversationId,
          identityId: input.senderIdentityId ?? input.senderUserId,
          deletedAt: null,
          conversation: { deletedAt: null }
        },
        select: {
          id: true,
          createdAt: true,
          conversation: {
            select: {
              type: true,
              privacyModeEnabled: true,
              disappearingTtlSeconds: true,
              privacyPolicyVersion: true,
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
        return { status: "not_found" };
      }
      if (
        participant.conversation.accessPolicy === ConversationAccessPolicy.FRIENDSHIP_REQUIRED
      ) {
        const identityIds = participant.conversation.participants.map(
          (item) => item.identityId
        );
        if (identityIds.length !== 2) {
          return { status: "not_friends" };
        }
        const reciprocalContactCount = await tx.contact.count({
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
        if (reciprocalContactCount !== 2) {
          return { status: "not_friends" };
        }
      }

      const policy = await tx.imPolicy.findFirst({
        where: { activeKey: "active", deletedAt: null },
        select: {
          textRetentionSeconds: true,
          recallWindowSeconds: true,
          version: true
        }
      });
      const createdAt = new Date();
      const recallWindowSeconds = policy?.recallWindowSeconds ?? 180;
      const globalExpiresAt =
        policy?.textRetentionSeconds === null || policy?.textRetentionSeconds === undefined
          ? null
          : new Date(createdAt.getTime() + policy.textRetentionSeconds * 1_000);
      const privacyTtlSeconds = participant.conversation.disappearingTtlSeconds;
      const usesPrivacyExpiry =
        participant.conversation.type === ConversationType.GROUP &&
        participant.conversation.privacyModeEnabled &&
        typeof privacyTtlSeconds === "number" &&
        Number.isInteger(privacyTtlSeconds) &&
        privacyTtlSeconds >= 60 &&
        privacyTtlSeconds <= 34_560_000;
      const expiresAt = usesPrivacyExpiry
        ? new Date(createdAt.getTime() + privacyTtlSeconds * 1_000)
        : globalExpiresAt;
      const message = await tx.message.create({
        data: {
          conversationId: input.conversationId,
          senderUserId: input.senderUserId,
          senderIdentityId: input.senderIdentityId ?? input.senderUserId,
          type: this.messageTypeToDb(input.type),
          content: input.content,
          metadata: this.toJsonValue(input.metadata),
          createdAt,
          expiresAt,
          recallDeadlineAt: new Date(createdAt.getTime() + recallWindowSeconds * 1_000),
          privacyPolicyVersionAtSend: usesPrivacyExpiry
            ? participant.conversation.privacyPolicyVersion
            : null,
          lifecycleVersion: policy?.version ?? 1
        },
        include: messageInclude
      });

      await tx.conversation.update({
        where: { id: input.conversationId },
        data: { updatedAt: new Date() }
      });
      await tx.conversationParticipant.updateMany({
        where: {
          conversationId: input.conversationId,
          identityId: input.senderIdentityId ?? input.senderUserId,
          deletedAt: null
        },
        data: {
          unreadCount: 0,
          hiddenAt: null,
          lastReadMessageId: message.id,
          lastReadAt: message.createdAt
        }
      });
      await tx.conversationParticipant.updateMany({
        where: {
          conversationId: input.conversationId,
          identityId: { not: input.senderIdentityId ?? input.senderUserId },
          deletedAt: null
        },
        data: {
          unreadCount: { increment: 1 },
          hiddenAt: null
        }
      });

      return {
        status: "created",
        message: this.mapMessage(message, input.senderIdentityId ?? input.senderUserId)
      };
    });
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

  public async recallMessage(
    input: RecallMessageInput
  ): Promise<StandardRecallRepositoryOutcome> {
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
          message: this.mapMessage(candidate, input.senderIdentityId ?? input.senderUserId, input.now)
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
          content: null,
          metadata: Prisma.DbNull,
          recalledAt: input.now,
          recallMode: MessageRecallMode.STANDARD,
          contentPurgedAt: input.now,
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
            message: this.mapMessage(latest, input.senderIdentityId ?? input.senderUserId, input.now)
          } as const;
        }
        if (latest && input.now.getTime() > latest.recallDeadlineAt.getTime()) {
          return { status: "window_expired" } as const;
        }
        return { status: "not_found" } as const;
      }

      await tx.messageReaction.updateMany({
        where: { messageId: input.messageId, deletedAt: null },
        data: { deletedAt: input.now }
      });
      await tx.imDeletionSync.upsert({
        where: {
          messageId_action: {
            messageId: input.messageId,
            action: ImDeletionAction.STANDARD_RECALL
          }
        },
        create: {
          conversationId: input.conversationId,
          messageId: input.messageId,
          action: ImDeletionAction.STANDARD_RECALL,
          mediaKind: null,
          occurredAt: input.now
        },
        update: {}
      });
      await tx.auditLog.create({
        data: {
          actorId: input.senderUserId,
          action: "im.message.standard_recall",
          targetType: "Message",
          targetId: input.messageId,
          ip: null,
          userAgent: null,
          metadata: {
            conversationId: input.conversationId,
            recallMode: "standard"
          },
          createdAt: input.now
        }
      });
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
    const participant = await this.findConversationParticipant(input.conversationId, viewerIdentityId);

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
    return this.client.$transaction(async (tx) => {
      const participant = await tx.conversationParticipant.findFirst({
        where: {
          conversationId: input.conversationId,
          identityId: input.identityId ?? input.userId,
          deletedAt: null,
          conversation: { deletedAt: null }
        },
        select: { createdAt: true }
      });
      if (!participant) return null;
      const message = await tx.message.findFirst({
        where: {
          id: input.messageId,
          conversationId: input.conversationId,
          createdAt: { gte: participant.createdAt },
          deletedAt: null,
          conversation: {
            deletedAt: null,
            participants: {
              some: { identityId: input.identityId ?? input.userId, deletedAt: null }
            }
          }
        },
        select: { id: true }
      });
      if (!message) return null;

      await tx.messageUserDeletion.upsert({
        where: {
          identityId_messageId: {
            identityId: input.identityId ?? input.userId,
            messageId: input.messageId
          }
        },
        create: {
          conversationId: input.conversationId,
          messageId: input.messageId,
          userId: input.userId,
          identityId: input.identityId ?? input.userId
        },
        update: { deletedAt: null }
      });
      await tx.auditLog.create({
        data: {
          actorId: input.userId,
          action: "im.message.deleted_for_user",
          targetType: "Message",
          targetId: input.messageId,
          ip: null,
          userAgent: null,
          metadata: { conversationId: input.conversationId }
        }
      });

      return {
        conversationId: input.conversationId,
        messageId: input.messageId,
        deleted: true
      };
    });
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
    return this.getConversationForUser(input.conversationId, input.identityId ?? input.userId, input.userId);
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
    return this.getConversationForUser(input.conversationId, input.identityId ?? input.userId, input.userId);
  }

  public async hideConversation(input: {
    conversationId: number;
    userId: number;
    identityId?: number;
  }): Promise<ConversationPayload | null> {
    const participant = await this.findConversationParticipant(
      input.conversationId,
      input.identityId ?? input.userId
    );
    if (!participant) return null;

    await this.client.conversationParticipant.update({
      where: { id: participant.id },
      data: { hiddenAt: new Date(), isPinned: false, unreadCount: 0 }
    });
    return this.getConversationForUser(input.conversationId, input.identityId ?? input.userId, input.userId);
  }

  public async clearConversationMessages(input: {
    conversationId: number;
    userId: number;
    identityId?: number;
  }): Promise<ConversationPayload | null> {
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
          clearedThroughMessageId: latestMessage?.id ?? null,
          lastReadMessageId: latestMessage?.id ?? null,
          lastReadAt: latestMessage?.createdAt ?? new Date(),
          unreadCount: 0
        }
      });
      await tx.auditLog.create({
        data: {
          actorId: input.userId,
          action: "im.conversation.messages_cleared",
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
      ? this.getConversationForUser(input.conversationId, input.identityId ?? input.userId, input.userId)
      : null;
  }

  public async listContacts(
    identityId: number,
    input: PaginationInput
  ): Promise<PaginatedResponse<ContactPayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.ContactWhereInput = {
      ownerIdentityId: identityId,
      deletedAt: null,
      contactUser: {
        deletedAt: null,
        isActive: true
      }
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
      OR: [
        { username: { contains: query } },
        { needoId: { contains: query } }
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
      id: true,
      needoId: true,
      username: true,
      avatarUrl: true
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
      list.map((user) => ({
        userId: user.id,
        needoId: user.needoId,
        username: user.username,
        avatarUrl: user.avatarUrl
      })),
      total,
      pagination
    );
  }

  public async addContact(input: AddContactInput): Promise<ContactPayload> {
    const ownerIdentityId = input.ownerIdentityId ??
      await this.findCanonicalIdentityIdForUser(input.ownerUserId);
    const contactIdentityId = await this.findCanonicalIdentityIdForUser(input.contactUserId);
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
      const actorIdentityId = input.ownerIdentityId ??
        await this.findCanonicalIdentityId(tx, input.ownerUserId);
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
    targetIdentityId: number
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
        customerProfile: {
          select: {
            id: true,
            displayName: true,
            bio: true,
            city: true,
            membershipLevel: true,
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
            languages: true,
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
    const identityCard = await this.buildDirectoryIdentityCard(user, targetIdentityId);
    if (viewerUserId === targetUserId && viewerIdentityId === targetIdentityId) {
      return {
        user: this.mapParticipant(user),
        identityCard,
        relationship: "self",
        contactId: null,
        friendRequest: null
      };
    }
    const contact = await this.client.contact.findFirst({
      where: {
        ownerIdentityId: viewerIdentityId,
        contactIdentityId: targetIdentityId,
        source: "friend_request",
        deletedAt: null
      },
      select: { id: true }
    });
    const reciprocalContact = contact
      ? await this.client.contact.findFirst({
          where: {
            ownerIdentityId: targetIdentityId,
            contactIdentityId: viewerIdentityId,
            source: "friend_request",
            deletedAt: null
          },
          select: { id: true }
        })
      : null;
    if (contact && reciprocalContact) {
      return {
        user: this.mapParticipant(user),
        identityCard,
        relationship: "friend",
        contactId: contact.id,
        friendRequest: null
      };
    }
    const friendRequest = await this.client.friendRequest.findFirst({
      where: {
        status: FriendRequestStatus.PENDING,
        expiresAt: { gt: dbNow },
        deletedAt: null,
        OR: [
          { requesterIdentityId: viewerIdentityId, targetIdentityId },
          { requesterIdentityId: targetIdentityId, targetIdentityId: viewerIdentityId }
        ]
      },
      include: friendRequestInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });

    return {
      user: this.mapParticipant(user),
      identityCard,
      relationship: friendRequest
        ? friendRequest.requesterIdentityId === viewerIdentityId
          ? "outgoing_pending"
          : "incoming_pending"
        : "none",
      contactId: null,
      friendRequest: friendRequest ? this.mapFriendRequest(friendRequest, dbNow) : null
    };
  }

  public async createFriendRequest(
    input: CreateFriendRequestInput
  ): Promise<CreateFriendRequestOutcome> {
    return this.client.$transaction(async (tx) => {
      const requesterIdentityId = input.requesterIdentityId ??
        await this.findCanonicalIdentityId(tx, input.requesterUserId);
      const targetIdentityId = input.targetIdentityId ??
        await this.findCanonicalIdentityId(tx, input.targetUserId);
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
            { id: targetIdentityId, userId: input.targetUserId }
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
      const actorIdentityId = input.actorIdentityId ??
        await this.findCanonicalIdentityId(tx, input.actorUserId);
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
      const authorIdentityId = input.authorIdentityId ??
        await this.findCanonicalIdentityId(transaction, input.authorUserId);
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

  public async updateSocialPost(input: UpdateSocialPostInput): Promise<UpdateSocialPostResult | null> {
    return this.client.$transaction(async (transaction) => {
      const authorIdentityId = input.authorIdentityId ??
        await this.findCanonicalIdentityId(transaction, input.authorUserId);
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
        { id: number; checksumSha256: string | null; url: string; entityType: string; entityId: number }
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
          if (mediaAsset.checksumSha256 && !selectedMediaByPublicId.has(mediaAsset.checksumSha256)) {
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
      const existingMentionUserIds = this.jsonPositiveIntegerArray(existingEnvelope?.mentionUserIds);
      const media = input.media
        ? {
            ...(input.media.quotePostId !== undefined ? { quotePostId: input.media.quotePostId } : {}),
            ...(input.media.replyToPostId !== undefined ? { replyToPostId: input.media.replyToPostId } : {}),
            ...(input.media.repostPostId !== undefined ? { repostPostId: input.media.repostPostId } : {}),
            ...(input.media.postType !== undefined ? { postType: input.media.postType } : {}),
            ...(input.media.locationLabel !== undefined ? { locationLabel: input.media.locationLabel } : {}),
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
      for (const recipientUserId of mentionUserIds.filter((userId) => !previousMentionUserIds.has(userId))) {
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

    const relationshipMap = await this.loadSocialRelationshipMap(
      identityId,
      list.map((socialPost) => socialPost.authorIdentityId)
    );

    return buildPaginatedResponse(
      list.map((socialPost) =>
        this.mapSocialPost(socialPost, identityId, socialPost.authorIdentityId, relationshipMap)
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

    const relationshipMap = await this.loadSocialRelationshipMap(identityId, [
      socialPost.authorIdentityId
    ]);
    return this.mapSocialPost(
      socialPost,
      identityId,
      socialPost.authorIdentityId,
      relationshipMap
    );
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
    const followerIdentityId = input.followerIdentityId ??
      await this.findCanonicalIdentityIdForUser(input.followerUserId);
    const followingIdentityId = input.followingIdentityId ??
      await this.findCanonicalIdentityIdForUser(input.followingUserId);
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
    const notification = await this.client.notification.findFirst({
      where: {
        id: notificationId,
        recipientIdentityId: identityId,
        deletedAt: null
      }
    });

    if (!notification) {
      return null;
    }

    const updated = await this.client.notification.update({
      where: { id: notification.id },
      data: { readAt: notification.readAt ?? new Date() }
    });

    return this.mapNotification(updated);
  }

  public async markAllNotificationsRead(identityId: number): Promise<{ count: number }> {
    const result = await this.client.notification.updateMany({
      where: {
        recipientIdentityId: identityId,
        readAt: null,
        deletedAt: null
      },
      data: {
        readAt: new Date()
      }
    });

    return { count: result.count };
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

    const actorIdentityId = input.actorIdentityId ??
      await this.findCanonicalIdentityIdForUser(input.actorUserId);
    const recipients = await Promise.all(
      recipientUserIds.map(async (userId) => ({
        userId,
        identityId: suppliedIdentities.get(userId) ??
          await this.findCanonicalIdentityIdForUser(userId)
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
    const resolvedOwnerIdentityId = ownerIdentityId ??
      await this.findCanonicalIdentityId(tx, ownerUserId);
    const resolvedContactIdentityId = contactIdentityId ??
      await this.findCanonicalIdentityId(tx, contactUserId);
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
            select: {
              id: true,
              needoId: true,
              username: true,
              avatarUrl: true
            }
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
        this.mapParticipant(participant.user, participant.role)
      ),
      directPeer:
        conversation.type === ConversationType.DIRECT
          ? activeDirectPeer
            ? this.mapParticipant(activeDirectPeer.user, activeDirectPeer.role)
            : (missingDirectPeer ?? null)
          : null,
      lastMessage: conversation.messages[0]
        && conversation.messages[0].id > (viewer?.clearedThroughMessageId ?? 0)
        && conversation.messages[0].createdAt.getTime() >= (viewer?.createdAt.getTime() ?? 0)
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
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
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

    const pairIdentityIds = conversation.friendshipPairKey
      .split(":")
      .map((value) => Number(value));
    if (
      pairIdentityIds.length !== 2 ||
      pairIdentityIds.some(
        (identityId) => !Number.isInteger(identityId) || identityId <= 0
      ) ||
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
      const peerIdentityId = this.getMissingDirectPeerIdentityId(
        conversation,
        viewerIdentityId
      );
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
        id: true,
        user: {
          select: { id: true, needoId: true, username: true, avatarUrl: true }
        }
      }
    });
    const participantByIdentityId = new Map(
      identities.map(
        (identity) => [identity.id, this.mapParticipant(identity.user)] as const
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
        username: reaction.user.username,
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
            (reaction) =>
              reaction.emoji === emoji && reaction.identityId === viewerIdentityId
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
      contactUser: this.mapParticipant(contact.contactUser),
      nickname: contact.nickname,
      source: contact.source,
      isBlocked: contact.blockedAt !== null,
      createdAt: contact.createdAt
    };
  }

  private mapParticipant(user: {
    id: number;
    needoId: string;
    username: string;
    avatarUrl: string | null;
  }, role?: string): ParticipantPayload {
    return {
      userId: user.id,
      needoId: user.needoId,
      username: user.username,
      avatarUrl: user.avatarUrl,
      ...(role === "owner" || role === "admin" || role === "member" ? { role } : {})
    };
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
      ) ?? user.identities[0];
    const fallback: DirectoryIdentityCardPayload = {
      entityType: "account",
      profileId: null,
      displayName: user.username,
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
      const review = profile.reviewSummary?.deletedAt === null
        ? profile.reviewSummary
        : null;
      const customerLanguages = toDirectoryLanguages(profile.languages);
      const technicianLanguages =
        customerLanguages.length === 0 &&
        user.technicianProfile?.deletedAt === null &&
        user.technicianProfile.status === "published"
          ? toDirectoryLanguages(user.technicianProfile.languages)
          : [];
      return {
        entityType: "user",
        profileId: profile.id,
        displayName: profile.displayName,
        identityLabel: profile.membershipLevel,
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
      const review = profile.reviewSummary?.deletedAt === null
        ? profile.reviewSummary
        : null;
      return {
        entityType: "technician",
        profileId: profile.id,
        displayName: profile.displayName,
        identityLabel: profile.employmentType,
        verified: profile.verifiedAt !== null,
        creditValue: review?.ratingAverage.toString() ?? null,
        creditReviewCount: review?.reviewCount ?? 0,
        gender: null,
        age: null,
        heightCm: null,
        languages: toDirectoryLanguages(profile.languages),
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
        const review = shop.reviewSummary?.deletedAt === null
          ? shop.reviewSummary
          : null;
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
        (relationship) =>
          `${relationship.followerIdentityId}:${relationship.followingIdentityId}`
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

  private mapSocialAuthor(
    author: SocialAuthorRecord,
    postIdentity?: { id: number; type: string; displayName: string | null }
  ): SocialPostAuthorPayload {
    const identity = postIdentity ??
      author.identities.find((item) =>
        ["customer", "technician", "merchant", "merchant_owner", "merchant_staff"].includes(
          item.type
        )
      ) ?? author.identities[0];
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
      displayName: identity?.displayName?.trim() || author.username,
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
    }
  ): SocialPostPayload {
    return {
      id: socialPost.id,
      authorUserId: socialPost.authorUserId,
      authorIdentityId: socialPost.authorIdentityId,
      content: socialPost.content,
      media: socialPost.media,
      visibility: this.socialPostVisibilityFromDb(socialPost.visibility),
      createdAt: socialPost.createdAt,
      updatedAt: socialPost.updatedAt,
      viewerFollowsAuthor:
        viewerIdentityId === authorIdentityId ||
        relationshipMap.follows.has(`${viewerIdentityId}:${authorIdentityId}`),
      authorFollowsViewer:
        viewerIdentityId === authorIdentityId ||
        relationshipMap.follows.has(`${authorIdentityId}:${viewerIdentityId}`),
      viewerIsFriend: relationshipMap.friendIdentityIds.has(authorIdentityId),
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

  private socialPostConflict(message: string): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message,
      statusCode: 409
    });
  }

  private jsonRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined;
  }

  private jsonCounter(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
  }

  private jsonPositiveIntegerArray(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.filter(
      (item): item is number => typeof item === "number" && Number.isSafeInteger(item) && item > 0
    )));
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined) {
      return undefined;
    }

    return value as Prisma.InputJsonValue;
  }
}
