import {
  backofficeRealDataApi,
  type BackofficeTechnicianPayload,
} from "../../api/backofficeRealData";
import {
  getMerchantStaffEmploymentLabel,
  toMerchantStaffEmploymentType,
} from "../../lib/merchantStaffRoles";
import {
  realtimeApi,
  subscribeRealtimeEvents,
  type PaginatedRealtimeData,
  type FormalRealtimeEvent,
  type RealtimeContact,
  type RealtimeConversation,
  type RealtimeFriendRequest,
  type RealtimeMessage,
  type RealtimeParticipant,
} from "../realtime/api";
import type { ImApi } from "./contract";
import { buildMessagePreview } from "./model";
import type {
  ContactRelation,
  Conversation,
  ConversationMember,
  ConversationMessage,
  CreateConversationPrivacyOptions,
  DirectoryProfile,
  FriendRequest,
  ImBootstrapPayload,
  ImMessageType,
  ImProfileKind,
  ImStoreUpdate,
  ImRoleType,
  ImUser,
  MessageExt,
} from "./model";

type FormalCurrentUser = {
  avatarUrl: string | null;
  id: number;
  needoId: string;
  username: string;
};

type CreateFormalImApiOptions = {
  currentUser: FormalCurrentUser;
  scope: ImRoleType;
};

const formalRuntimeConfig = {
  allowStrangerMessaging: false,
  preserveConversationAfterDelete: true,
  syncDraftAcrossDevices: false,
  recallWindowMs: 180_000,
  separatorThresholdMs: 300_000,
} as const;

const richMessageTypes = new Set<ImMessageType>([
  "text",
  "emoji",
  "image",
  "voice",
  "video",
  "file",
  "location",
  "contact-card",
  "service-card",
  "schedule-invite",
  "system",
  "recalled",
]);

function featureUnavailable(): never {
  throw new Error("error.feature_unavailable");
}

function toNumericId(id: string) {
  const value = Number(id);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("error.validation.invalid_id");
  }

  return value;
}

function readMetadata(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

const secondsPerMinute = 60;
const secondsPerHour = 60 * secondsPerMinute;
const secondsPerDay = 24 * secondsPerHour;
const secondsPerMonth = 30 * secondsPerDay;

function countdownToSeconds(countdown?: {
  months?: number;
  days?: number;
  hours?: number;
  minutes?: number;
}) {
  if (!countdown) return undefined;
  const seconds =
    Math.max(0, Math.floor(countdown.months ?? 0)) * secondsPerMonth +
    Math.max(0, Math.floor(countdown.days ?? 0)) * secondsPerDay +
    Math.max(0, Math.floor(countdown.hours ?? 0)) * secondsPerHour +
    Math.max(0, Math.floor(countdown.minutes ?? 0)) * secondsPerMinute;
  return seconds > 0 ? seconds : undefined;
}

function secondsToCountdown(totalSeconds?: number | null) {
  let remaining = Math.max(0, Math.floor(totalSeconds ?? 0));
  const months = Math.floor(remaining / secondsPerMonth);
  remaining -= months * secondsPerMonth;
  const days = Math.floor(remaining / secondsPerDay);
  remaining -= days * secondsPerDay;
  const hours = Math.floor(remaining / secondsPerHour);
  remaining -= hours * secondsPerHour;
  const minutes = Math.floor(remaining / secondsPerMinute);
  return totalSeconds
    ? { months, days, hours, minutes }
    : undefined;
}

function inferProfileKind(username: string): ImProfileKind {
  const normalized = username.toLowerCase();

  if (normalized.includes("technician") || normalized.includes("therapist")) {
    return "technician";
  }

  if (
    normalized.includes("shop") ||
    normalized.includes("store") ||
    normalized.includes("merchant")
  ) {
    return "store";
  }

  return "person";
}

function buildInitialAvatar(username: string, profileKind: ImProfileKind) {
  const initials =
    username
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "N";
  const safeInitials = initials
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const colors: Record<ImProfileKind, [string, string]> = {
    person: ["#203b52", "#84d8ff"],
    technician: ["#173f37", "#7ce0bd"],
    store: ["#49371d", "#ffd98b"],
    service: ["#3c2e55", "#d6b9ff"],
  };
  const [background, foreground] = colors[profileKind];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="34" fill="${background}"/><text x="64" y="74" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="38" font-weight="800" fill="${foreground}">${safeInitials}</text></svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function toImUser(participant: RealtimeParticipant): ImUser {
  const id = String(participant.userId);
  const profileKind = inferProfileKind(participant.username);

  return {
    id,
    accountId: participant.needoId,
    nickname: participant.username,
    avatar:
      participant.avatarUrl ??
      buildInitialAvatar(participant.username, profileKind),
    status: "active",
    searchableFields: [participant.username, participant.needoId],
    sortKey: participant.username,
    profileKind,
    entityType:
      profileKind === "technician"
        ? "technician"
        : profileKind === "store"
          ? "shop"
          : "user",
    source: "formal_api",
    tags: [],
    userIdLabel: participant.needoId,
    canCall: false,
    canVideoCall: false,
  };
}

function getOrganizationTechnicianTags(
  technician: BackofficeTechnicianPayload,
) {
  const employmentType = toMerchantStaffEmploymentType(
    technician.employmentType,
  );

  if (!employmentType) {
    throw new Error("error.validation.invalid_employment_type");
  }

  return [
    "员工",
    getMerchantStaffEmploymentLabel(employmentType),
    "技师",
  ];
}

function toOrganizationUser(technician: BackofficeTechnicianPayload): ImUser {
  const id = String(technician.userId);

  return {
    id,
    accountId: technician.needoId,
    nickname: technician.displayName,
    avatar:
      technician.avatarUrl ??
      buildInitialAvatar(technician.displayName, "technician"),
    region: technician.city,
    status: "active",
    searchableFields: [
      technician.displayName,
      technician.needoId,
      technician.email,
      technician.city,
      technician.serviceArea ?? "",
      id,
    ].filter(Boolean),
    sortKey: technician.displayName,
    profileKind: "technician",
    entityType: "technician",
    entityId: `tech-${technician.id}`,
    source: "merchant_technician_profile",
    tags: getOrganizationTechnicianTags(technician),
    userIdLabel: technician.needoId,
    canCall: false,
    canVideoCall: false,
  };
}

function toOrganizationContact(
  ownerUserId: number,
  technician: BackofficeTechnicianPayload,
): ContactRelation {
  return {
    id: `merchant-technician-${technician.id}`,
    ownerUserId: String(ownerUserId),
    targetUserId: String(technician.userId),
    relationStatus: "active",
    source: "merchant_technician_profile",
    tags: getOrganizationTechnicianTags(technician),
    isStarred: false,
    isBlocked: false,
    description: technician.shopName ?? undefined,
    createdAt: technician.createdAt,
    updatedAt: technician.createdAt,
  };
}

function toConversationMessage(message: RealtimeMessage): ConversationMessage {
  const isRecalled = Boolean(
    message.recalledAt || message.recallMode || message.contentPurgedAt,
  );
  const metadata = isRecalled ? {} : readMetadata(message.metadata);
  const storedType = metadata.needoMessageType;
  const type: ImMessageType = isRecalled
    ? "recalled"
    : typeof storedType === "string" &&
        richMessageTypes.has(storedType as ImMessageType)
      ? (storedType as ImMessageType)
      : message.type === "text"
        ? "text"
        : "system";
  const ext = metadata.needoMessageExt;
  const quotedMessageId = metadata.needoQuotedMessageId;

  return {
    id: String(message.id),
    localId: String(message.id),
    conversationId: String(message.conversationId),
    senderId: message.senderUserId === null ? "" : String(message.senderUserId),
    type,
    content: isRecalled ? "" : (message.content ?? ""),
    quotedMessageId:
      typeof quotedMessageId === "string" ? quotedMessageId : undefined,
    status: type === "recalled" ? "recalled" : "sent",
    sentAt: message.createdAt,
    serverState: isRecalled ? "recalled" : "active",
    recallDeadlineAt: message.recallDeadlineAt ?? undefined,
    recalledAt: message.recalledAt ?? undefined,
    recallMode: message.recallMode ?? undefined,
    contentPurgedAt: message.contentPurgedAt ?? undefined,
    lifecycleVersion: message.lifecycleVersion,
    reactionVersion: message.reactionVersion,
    availableRecallModes: isRecalled
      ? []
      : (message.availableRecallModes ?? []).filter(
          (mode): mode is "standard" => mode === "standard",
        ),
    clientSeq: message.id,
    reactions: (message.reactions ?? []).map((reaction) => ({
      emoji: reaction.emoji,
      people: reaction.people.map((person) => ({
        id: String(person.userId),
        name: person.username,
        avatar: person.avatarUrl ?? undefined,
      })),
      reactedByMe: reaction.reactedByMe,
    })),
    ext:
      ext && typeof ext === "object" && !Array.isArray(ext)
        ? (ext as MessageExt)
        : undefined,
  };
}

function isRealtimeMessagePayload(payload: unknown): payload is RealtimeMessage {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }

  const candidate = payload as Partial<RealtimeMessage>;
  return (
    typeof candidate.id === "number" &&
    typeof candidate.conversationId === "number" &&
    typeof candidate.createdAt === "string"
  );
}

export function toFormalImStoreUpdate(event: FormalRealtimeEvent): ImStoreUpdate {
  if (
    ![
      "message.created",
      "message.updated",
      "message.reaction.updated",
      "message.recalled",
    ].includes(event.type) ||
    !isRealtimeMessagePayload(event.payload)
  ) {
    return { type: "refresh" };
  }

  const message = toConversationMessage(event.payload);
  if (event.type === "message.recalled") {
    return message.serverState === "recalled"
      ? { type: "message.recalled", message }
      : { type: "refresh" };
  }

  return {
    type:
      event.type === "message.created" ? "message.created" : "message.updated",
    message,
  };
}

export function shouldForwardFormalImEvent(event: FormalRealtimeEvent) {
  return event.type !== "connected" && (
    event.type.startsWith("message.") ||
    event.type.startsWith("conversation.") ||
    event.type.startsWith("friend_request.") ||
    event.type.startsWith("contact.") ||
    event.type.startsWith("friendship.") ||
    event.type.startsWith("social.follow.")
  );
}

function getOtherParticipant(
  conversation: RealtimeConversation,
  currentUserId: number,
) {
  return conversation.participants.find(
    (participant) => participant.userId !== currentUserId,
  );
}

function toConversation(
  conversation: RealtimeConversation,
  currentUserId: number,
): Conversation {
  const otherParticipant = getOtherParticipant(conversation, currentUserId);
  const isDirect = conversation.type === "direct";
  const lastMessage = conversation.lastMessage
    ? toConversationMessage(conversation.lastMessage)
    : null;
  const title =
    conversation.title?.trim() ||
    (isDirect ? otherParticipant?.username : undefined) ||
    `群聊（${conversation.participants.length}）`;

  return {
    id: String(conversation.id),
    type: isDirect ? "single" : "group",
    title,
    avatar: isDirect ? (otherParticipant?.avatarUrl ?? "") : "",
    memberIds: conversation.participants.map((participant) =>
      String(participant.userId),
    ),
    contactUserId:
      isDirect && otherParticipant
        ? String(otherParticipant.userId)
        : undefined,
    lastMessageId: lastMessage?.id,
    lastMessagePreview: lastMessage
      ? buildMessagePreview(lastMessage, String(currentUserId), {})
      : "",
    lastMessageTime: lastMessage?.sentAt ?? conversation.updatedAt,
    unreadCount: conversation.unreadCount,
    isPinned: conversation.isPinned ?? false,
    isMuted: conversation.isMuted ?? false,
    isDeleted: conversation.isHidden || undefined,
    privacyModeEnabled: conversation.privacyModeEnabled || undefined,
    hideMemberProfiles: conversation.hideMemberProfiles || undefined,
    disappearingCountdown: secondsToCountdown(conversation.disappearingTtlSeconds),
    disappearingStartMode: conversation.privacyModeEnabled
      ? (conversation.disappearingStartMode ?? "sent")
      : undefined,
    updatedAt: conversation.updatedAt,
  };
}

function toConversationMembers(
  conversation: RealtimeConversation,
): ConversationMember[] {
  return conversation.participants.map((participant, index) => ({
    id: `${conversation.id}-${participant.userId}`,
    conversationId: String(conversation.id),
    userId: String(participant.userId),
    role: participant.role ?? (index === 0 ? "owner" : "member"),
    joinedAt: conversation.createdAt,
  }));
}

function toContact(contact: RealtimeContact): ContactRelation {
  return {
    id: String(contact.id),
    ownerUserId: String(contact.ownerUserId),
    targetUserId: String(contact.contactUserId),
    relationStatus: "active",
    source: contact.source,
    remarkName: contact.nickname ?? undefined,
    tags: [],
    isStarred: false,
    isBlocked: contact.isBlocked,
    createdAt: contact.createdAt,
    updatedAt: contact.createdAt,
  };
}

function toFriendRequest(friendRequest: RealtimeFriendRequest): FriendRequest {
  return {
    id: String(friendRequest.id),
    fromUserId: String(friendRequest.requesterUserId),
    toUserId: String(friendRequest.targetUserId),
    source: "formal_api",
    requestMessage: friendRequest.message ?? "",
    status: friendRequest.status,
    createdAt: friendRequest.createdAt,
    expiresAt: friendRequest.expiresAt,
    expiredAt: friendRequest.expiredAt ?? undefined,
    handledAt: friendRequest.respondedAt ?? undefined,
  };
}

async function loadAllPages<TItem>(
  loader: (query: {
    page: number;
    pageSize: number;
  }) => Promise<PaginatedRealtimeData<TItem>>,
) {
  const firstPage = await loader({ page: 1, pageSize: 100 });
  const pageCount = Math.ceil(firstPage.total / 100);

  if (pageCount <= 1) {
    return firstPage.list;
  }

  const remainingPages = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) =>
      loader({ page: index + 2, pageSize: 100 }),
    ),
  );

  return [firstPage, ...remainingPages].flatMap((page) => page.list);
}

function buildBootstrap(
  currentUser: FormalCurrentUser,
  conversations: RealtimeConversation[],
  contacts: RealtimeContact[],
  friendRequests: RealtimeFriendRequest[],
  organizationTechnicians?: BackofficeTechnicianPayload[],
): ImBootstrapPayload {
  const userMap = new Map<string, ImUser>();
  const currentParticipant: RealtimeParticipant = {
    userId: currentUser.id,
    needoId: currentUser.needoId,
    username: currentUser.username,
    avatarUrl: currentUser.avatarUrl,
  };
  userMap.set(String(currentUser.id), toImUser(currentParticipant));
  conversations.forEach((conversation) => {
    conversation.participants.forEach((participant) => {
      userMap.set(String(participant.userId), toImUser(participant));
    });
  });
  contacts.forEach((contact) => {
    userMap.set(String(contact.contactUserId), toImUser(contact.contactUser));
  });
  organizationTechnicians?.forEach((technician) => {
    userMap.set(String(technician.userId), toOrganizationUser(technician));
  });
  friendRequests.forEach((friendRequest) => {
    userMap.set(
      String(friendRequest.requesterUserId),
      toImUser(friendRequest.requester),
    );
    userMap.set(
      String(friendRequest.targetUserId),
      toImUser(friendRequest.target),
    );
  });

  return {
    currentUserId: String(currentUser.id),
    config: formalRuntimeConfig,
    users: Array.from(userMap.values()),
    contacts: contacts.map(toContact),
    ...(organizationTechnicians
      ? {
          organizationContacts: organizationTechnicians.map((technician) =>
            toOrganizationContact(currentUser.id, technician),
          ),
        }
      : {}),
    friendRequests: friendRequests.map(toFriendRequest),
    conversations: conversations.map((conversation) =>
      toConversation(conversation, currentUser.id),
    ),
    members: conversations.flatMap(toConversationMembers),
  };
}

export function createFormalImApi({
  currentUser,
  scope,
}: CreateFormalImApiOptions): ImApi {
  const loadConversations = () =>
    loadAllPages((query) => realtimeApi.listConversations(query));
  const loadContacts = () =>
    loadAllPages((query) => realtimeApi.listContacts(query));
  const loadFriendRequests = () =>
    loadAllPages((query) =>
      realtimeApi.listFriendRequests({ ...query, direction: "all" }),
    );
  const loadOrganizationTechnicians = () =>
    loadAllPages((query) =>
      backofficeRealDataApi.technicians("merchant-admin", {
        ...query,
        status: "published",
      }),
    );

  const bootstrap = async () => {
    const [
      conversations,
      contacts,
      friendRequests,
      organizationTechnicians,
    ] = await Promise.all([
      loadConversations(),
      loadContacts(),
      loadFriendRequests(),
      scope === "merchant"
        ? loadOrganizationTechnicians()
        : Promise.resolve(undefined),
    ]);

    return buildBootstrap(
      currentUser,
      conversations,
      contacts,
      friendRequests,
      organizationTechnicians,
    );
  };

  const findConversation = async (conversationId: string) => {
    const conversation = (await loadConversations()).find(
      (item) => item.id === toNumericId(conversationId),
    );

    if (!conversation) {
      throw new Error("error.realtime.conversation_not_found");
    }

    return conversation;
  };

  const getConversation = async (conversationId: string) => {
    const conversation = await findConversation(conversationId);
    const users = conversation.participants.map(toImUser);

    return {
      conversation: toConversation(conversation, currentUser.id),
      members: toConversationMembers(conversation),
      users,
    };
  };

  const api = {
    bootstrap,
    async listContacts() {
      const contacts = await loadContacts();
      const bootstrapPayload = await bootstrap();
      return {
        contacts: contacts.map(toContact),
        users: bootstrapPayload.users,
      };
    },
    async searchDirectory(query: string) {
      const normalizedQuery = query.trim();
      if (!normalizedQuery) return { users: [] };
      const response = await realtimeApi.searchDirectory({
        query: normalizedQuery,
        page: 1,
        pageSize: 50,
      });
      return { users: response.list.map(toImUser) };
    },
    async getDirectoryProfile(userId: string): Promise<DirectoryProfile> {
      const profile = await realtimeApi.getDirectoryProfile(toNumericId(userId));
      return {
        user: toImUser(profile.user),
        relationship: profile.relationship,
        contactId: profile.contactId === null ? undefined : String(profile.contactId),
        friendRequest: profile.friendRequest
          ? toFriendRequest(profile.friendRequest)
          : undefined,
      };
    },
    async sendFriendRequest(targetUserId: string, message?: string) {
      const result = await realtimeApi.createFriendRequest({
        targetUserId: toNumericId(targetUserId),
        ...(message?.trim() ? { message: message.trim() } : {}),
      });
      return {
        friendRequest: toFriendRequest(result.friendRequest),
        created: result.created,
      };
    },
    async getContact(contactId: string) {
      const contacts = await loadContacts();
      const contact = contacts.find(
        (item) => item.id === toNumericId(contactId),
      );
      if (!contact) throw new Error("error.realtime.contact_not_found");
      const bootstrapPayload = await bootstrap();
      return {
        contact: toContact(contact),
        user: bootstrapPayload.users.find(
          (user) => user.id === String(contact.contactUserId),
        ),
      };
    },
    updateRemark: featureUnavailable,
    updateContactTags: featureUnavailable,
    async blockContact(contactId: string) {
      return {
        contact: toContact(
          await realtimeApi.blockContact(toNumericId(contactId)),
        ),
      };
    },
    async unblockContact(contactId: string) {
      return {
        contact: toContact(
          await realtimeApi.unblockContact(toNumericId(contactId)),
        ),
      };
    },
    async deleteContact(contactId: string) {
      const deleted = await realtimeApi.deleteContact(toNumericId(contactId));
      return {
        contactId,
        counterpartUserId: String(deleted.counterpartUserId),
        deletedConversationId:
          deleted.deletedConversationId === null
            ? undefined
            : String(deleted.deletedConversationId),
      };
    },
    async listFriendRequests() {
      const friendRequests = await loadFriendRequests();
      const bootstrapPayload = await bootstrap();
      return {
        friendRequests: friendRequests.map(toFriendRequest),
        users: bootstrapPayload.users,
      };
    },
    async acceptFriendRequest(requestId: string) {
      const request = await realtimeApi.acceptFriendRequest(
        toNumericId(requestId),
      );
      const contactUserId =
        request.requesterUserId === currentUser.id
          ? request.targetUserId
          : request.requesterUserId;
      const contact = (await loadContacts()).find(
        (item) => item.contactUserId === contactUserId,
      );
      return {
        request: toFriendRequest(request),
        contact: contact ? toContact(contact) : undefined,
      };
    },
    async rejectFriendRequest(requestId: string) {
      return {
        friendRequest: toFriendRequest(
          await realtimeApi.rejectFriendRequest(toNumericId(requestId)),
        ),
      };
    },
    async listConversations() {
      const conversations = await loadConversations();
      return {
        conversations: conversations.map((conversation) =>
          toConversation(conversation, currentUser.id),
        ),
        users: conversations.flatMap((conversation) =>
          conversation.participants.map(toImUser),
        ),
      };
    },
    getConversation,
    async listMessages(
      conversationId: string,
      cursor?: string | null,
      limit = 30,
    ) {
      const response = await realtimeApi.listMessages(
        toNumericId(conversationId),
        {
          beforeId: cursor ? toNumericId(cursor) : undefined,
          pageSize: limit,
        },
      );
      return {
        messages: response.list.map(toConversationMessage),
        nextCursor:
          response.nextCursor === null ? null : String(response.nextCursor),
        hasMore: response.nextCursor !== null,
      };
    },
    async createConversation(
      memberIds: string[],
      title?: string,
      privacyOptions?: CreateConversationPrivacyOptions,
    ) {
      const type =
        privacyOptions?.forceGroup || memberIds.length > 1 ? "group" : "direct";
      const conversation = await realtimeApi.createConversation({
        participantUserIds: memberIds.map(toNumericId),
        ...(title?.trim() ? { title: title.trim() } : {}),
        type,
        ...(type === "group"
          ? {
              privacyModeEnabled: Boolean(privacyOptions?.privacyModeEnabled),
              hideMemberProfiles: Boolean(privacyOptions?.hideMemberProfiles),
              disappearingTtlSeconds: countdownToSeconds(
                privacyOptions?.disappearingCountdown,
              ),
              disappearingStartMode:
                privacyOptions?.disappearingStartMode ?? "sent",
            }
          : {}),
      });
      return { conversation: toConversation(conversation, currentUser.id) };
    },
    async updateConversationPrivacy(conversationId, privacyOptions) {
      const conversation = await realtimeApi.updateConversationPrivacy(
        toNumericId(conversationId),
        {
          privacyModeEnabled: privacyOptions.privacyModeEnabled,
          hideMemberProfiles: privacyOptions.hideMemberProfiles,
          disappearingTtlSeconds: privacyOptions.privacyModeEnabled
            ? countdownToSeconds(privacyOptions.disappearingCountdown)
            : null,
          disappearingStartMode:
            privacyOptions.disappearingStartMode ?? "sent",
        },
      );
      return { conversation: toConversation(conversation, currentUser.id) };
    },
    updateConversationGroupInfo: featureUnavailable,
    updateConversationTags: featureUnavailable,
    addConversationMembers: featureUnavailable,
    async removeConversationMember(conversationId, userId, transferOwnerUserId) {
      if (toNumericId(userId) !== currentUser.id) {
        throw new Error("error.feature_unavailable");
      }
      const result = await realtimeApi.leaveConversation(
        toNumericId(conversationId),
        transferOwnerUserId ? toNumericId(transferOwnerUserId) : undefined,
      );
      return {
        conversationId: String(result.conversationId),
        removedUserId: String(result.removedUserId),
        dissolved: result.dissolved,
      };
    },
    async dissolveConversation(conversationId) {
      const result = await realtimeApi.dissolveConversation(toNumericId(conversationId));
      return {
        conversationId: String(result.conversationId),
        dissolved: true as const,
      };
    },
    async pinConversation(conversationId: string, isPinned: boolean) {
      const conversation = await realtimeApi.updateConversationPreferences(
        toNumericId(conversationId),
        { isPinned },
      );
      return { conversation: toConversation(conversation, currentUser.id) };
    },
    async muteConversation(conversationId: string, isMuted: boolean) {
      const conversation = await realtimeApi.updateConversationPreferences(
        toNumericId(conversationId),
        { isMuted },
      );
      return { conversation: toConversation(conversation, currentUser.id) };
    },
    async markConversationRead(conversationId: string, markUnread = false) {
      if (markUnread) {
        const conversation = await realtimeApi.markConversationUnread(
          toNumericId(conversationId),
        );
        return { conversation: toConversation(conversation, currentUser.id) };
      }
      await realtimeApi.markConversationRead(toNumericId(conversationId));
      const response = await getConversation(conversationId);
      return { conversation: { ...response.conversation, unreadCount: 0 } };
    },
    async deleteConversation(conversationId: string) {
      const conversation = await realtimeApi.deleteConversation(toNumericId(conversationId));
      return { conversation: toConversation(conversation, currentUser.id) };
    },
    async clearConversation(conversationId: string) {
      const conversation = await realtimeApi.clearConversationMessages(
        toNumericId(conversationId),
      );
      return { conversation: toConversation(conversation, currentUser.id) };
    },
    async deleteMessage(conversationId: string, messageId: string) {
      const response = await realtimeApi.deleteMessageForMe(
        toNumericId(conversationId),
        toNumericId(messageId),
      );
      return {
        conversationId: String(response.conversationId),
        messageId: String(response.messageId),
        deleted: response.deleted,
      };
    },
    async sendMessage(
      type: ImMessageType,
      payload: {
        conversationId: string;
        content: string;
        quotedMessageId?: string;
        ext?: MessageExt;
      },
    ) {
      const storedType = type === "system" ? "system" : "text";
      const metadata = {
        needoMessageType: type,
        ...(payload.quotedMessageId
          ? { needoQuotedMessageId: payload.quotedMessageId }
          : {}),
        ...(payload.ext ? { needoMessageExt: payload.ext } : {}),
      };
      const message = await realtimeApi.createMessage(
        toNumericId(payload.conversationId),
        {
          content: payload.content,
          metadata,
          type: storedType,
        },
      );
      return {
        message: toConversationMessage(message),
      };
    },
    async setMessageReaction(
      conversationId: string,
      messageId: string,
      emoji: string,
      reacted: boolean,
    ) {
      const message = reacted
        ? await realtimeApi.setMessageReaction(
            toNumericId(conversationId),
            toNumericId(messageId),
            emoji,
          )
        : await realtimeApi.removeMessageReaction(
            toNumericId(conversationId),
            toNumericId(messageId),
            emoji,
          );
      return { message: toConversationMessage(message) };
    },
    estimateTagMessageCampaign: featureUnavailable,
    sendTagMessageCampaign: featureUnavailable,
    async recallMessage(
      conversationId: string,
      messageId: string,
      mode: "standard",
    ) {
      const response = await realtimeApi.recallMessage(
        toNumericId(conversationId),
        toNumericId(messageId),
        mode,
      );
      const message = toConversationMessage(response.message);

      if (
        response.action !== "standard_recall" ||
        String(response.conversationId) !== conversationId ||
        String(response.messageId) !== messageId ||
        message.serverState !== "recalled"
      ) {
        throw new Error("error.response.invalid_recall_result");
      }

      return { conversationId, messageId, message, mode };
    },
    resendMessage: featureUnavailable,
    forwardMessage: featureUnavailable,
    async uploadImage(conversationId: string, file: File) {
      return realtimeApi.uploadConversationImage(toNumericId(conversationId), file);
    },
  } satisfies ImApi;

  return api;
}

export function subscribeFormalImUpdates(onUpdate: (update: ImStoreUpdate) => void) {
  return subscribeRealtimeEvents({
    onEvent(event) {
      if (shouldForwardFormalImEvent(event)) {
        onUpdate(toFormalImStoreUpdate(event));
      }
    },
  });
}
