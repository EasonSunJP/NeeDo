import {
  materializeImComposerDraft,
  type ImMessageRichText,
} from "./reaction-policy";

export type ImRoleType = "user" | "merchant" | "technician";
export type ImProfileKind = "person" | "technician" | "store" | "service";
export type ImRelationStatus = "active" | "deleted";
export type ImFriendRequestStatus = "pending" | "accepted" | "rejected" | "expired";
export type ImConversationType = "single" | "group" | "system";
export type ImMessageType =
  | "text"
  | "emoji"
  | "image"
  | "voice"
  | "video"
  | "file"
  | "location"
  | "contact-card"
  | "service-card"
  | "schedule-invite"
  | "system"
  | "recalled";
export type ImMessageStatus = "sending" | "sent" | "delivered" | "failed" | "recalled";
export type ImMessageServerState = "active" | "recalled";
export type ImMessagePreviewProvenance =
  | "user-text"
  | "dynamic-value"
  | "ui-label"
  | "ui-label-with-dynamic-value";
export type ImMessagePreviewDescriptor = {
  text: string;
  provenance: ImMessagePreviewProvenance;
  uiLabel?: string;
  dynamicValue?: string;
};
export type ImRecallMode = "standard";
export type ConversationDisappearingStartMode = "sent" | "read_by_all";
export type GroupInfoEditPolicy = "owner" | "members";
export type MessageCampaignType = "marketing" | "crm" | "transactional" | "system" | "risk";

export const IM_ASSISTANT_USER_ID = "im-assistant";
export const IM_ASSISTANT_CONTACT_ID = "contact-assistant";
export const IM_ASSISTANT_CONVERSATION_ID = "conversation-assistant";
export const IM_ASSISTANT_WELCOME_MESSAGE_ID = "assistant-seed-welcome";
export const IM_ASSISTANT_GUIDE_MESSAGE_ID = "assistant-seed-guide";

export type ImUser = {
  id: string;
  accountId: string;
  nickname: string;
  avatar: string;
  remarkName?: string;
  region?: string;
  bio?: string;
  status: "active" | "inactive";
  searchableFields: string[];
  sortKey: string;
  phoneticName?: string;
  kanaName?: string;
  furigana?: string;
  romajiName?: string;
  profileKind: ImProfileKind;
  entityType?: "user" | "technician" | "shop";
  entityId?: string;
  source?: string;
  signature?: string;
  tags: string[];
  userIdLabel: string;
  serviceAccount?: boolean;
  canCall?: boolean;
  canVideoCall?: boolean;
};

export type ContactRelation = {
  id: string;
  ownerUserId: string;
  targetUserId: string;
  relationStatus: ImRelationStatus;
  source: string;
  remarkName?: string;
  tags: string[];
  isStarred: boolean;
  isBlocked: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type FriendRequest = {
  id: string;
  fromUserId: string;
  toUserId: string;
  source: string;
  requestMessage: string;
  status: ImFriendRequestStatus;
  createdAt: string;
  expiresAt: string;
  expiredAt?: string;
  handledAt?: string;
};

export type DirectoryProfile = {
  user: ImUser;
  identityCard: DirectoryIdentityCard;
  relationship: "none" | "friend" | "incoming_pending" | "outgoing_pending" | "self";
  contactId?: string;
  friendRequest?: FriendRequest;
};

export type DirectoryIdentityCard = {
  entityType: "user" | "technician" | "shop" | "account";
  profileId?: string;
  displayName: string;
  identityLabel?: string;
  verified: boolean;
  creditValue?: number;
  creditReviewCount: number;
  gender?: string;
  age?: number;
  heightCm?: number;
  languages: string[];
  city?: string;
  serviceArea?: string;
  yearsExperience?: number;
  bio?: string;
};

const generatedContactSignaturePatterns = [
  /\d+\s*单/,
  /活跃分/,
  /接单率/,
  /%\s*接单/,
  /最近下单/,
  /^(营业中|已打烊)\s*·/,
  /^(店铺所属技师|个人技师)$/
];

export function getImContactSignatureCaption(user?: Pick<ImUser, "signature">) {
  const signature = user?.signature?.trim();

  if (!signature) {
    return "";
  }

  return generatedContactSignaturePatterns.some((pattern) => pattern.test(signature)) ? "" : signature;
}

export type ConversationDisappearingCountdown = {
  months: number;
  days: number;
  hours: number;
  minutes: number;
};

export type CreateConversationPrivacyOptions = {
  forceGroup?: boolean;
  privacyModeEnabled?: boolean;
  hideMemberProfiles?: boolean;
  disappearingCountdown?: Partial<ConversationDisappearingCountdown>;
  disappearingStartMode?: ConversationDisappearingStartMode;
};

export type UpdateConversationPrivacyOptions = {
  privacyModeEnabled: boolean;
  hideMemberProfiles?: boolean;
  disappearingCountdown?: Partial<ConversationDisappearingCountdown>;
  disappearingStartMode?: ConversationDisappearingStartMode;
};

export type UpdateConversationGroupInfoOptions = {
  title?: string;
  announcement?: string;
  nicknameInGroup?: string;
  titleEditPolicy?: GroupInfoEditPolicy;
  announcementEditPolicy?: GroupInfoEditPolicy;
};

export type UpdateConversationTagsOptions = {
  tags: string[];
};

export type Conversation = {
  id: string;
  type: ImConversationType;
  title: string;
  avatar: string;
  memberIds: string[];
  contactUserId?: string;
  lastMessageId?: string;
  lastMessagePreview: string;
  lastMessageType?: ImMessageType;
  lastMessageStatus?: ImMessageStatus;
  lastMessagePreviewProvenance?: ImMessagePreviewProvenance;
  lastMessagePreviewDynamicValue?: string;
  lastMessageTime: string;
  unreadCount: number;
  isPinned: boolean;
  isMuted: boolean;
  autoTranslateMessages: boolean;
  draftText?: string;
  draftUpdatedAt?: string;
  updatedAt: string;
  mentionMe?: boolean;
  mentionAll?: boolean;
  isDeleted?: boolean;
  announcement?: string;
  nicknameInGroup?: string;
  savedToContacts?: boolean;
  tags?: string[];
  privacyModeEnabled?: boolean;
  hideMemberProfiles?: boolean;
  disappearingCountdown?: ConversationDisappearingCountdown;
  disappearingStartMode?: ConversationDisappearingStartMode;
  titleEditPolicy?: GroupInfoEditPolicy;
  announcementEditPolicy?: GroupInfoEditPolicy;
};

export type ConversationMember = {
  id: string;
  conversationId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  nicknameInGroup?: string;
  joinedAt: string;
};

export type MessageAttachment = {
  id: string;
  messageId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  url: string;
  thumbnailUrl?: string;
  duration?: number;
  width?: number;
  height?: number;
};

export type MessageExt = {
  width?: number;
  height?: number;
  duration?: number;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  url?: string;
  thumbnailUrl?: string;
  caption?: string;
  richText?: ImMessageRichText;
  captionRichText?: ImMessageRichText;
  location?: {
    title: string;
    address: string;
    latitude: number;
    longitude: number;
  };
  contactCard?: {
    userId: string;
    displayName: string;
    avatar: string;
    profileKind: ImProfileKind;
    entityType?: "user" | "technician" | "shop";
    entityId?: string;
    userIdLabel?: string;
    headline?: string;
  };
  serviceCard?: {
    serviceId: string;
    name: string;
    cover: string;
    summary: string;
    priceLabel: string;
    durationLabel?: string;
    providerName?: string;
    providerId?: string;
    providerType?: "store" | "technician";
    href?: string;
    tags?: string[];
  };
  scheduleInvite?: {
    scheduleId: string;
    title: string;
    date: string;
    timeRange: string;
    location?: string;
    hostName?: string;
    note?: string;
    attendeeLabel?: string;
    reminderLabel?: string;
    statusLabel?: string;
    href?: string;
  };
  mentions?: string[];
  mentionAll?: boolean;
  groupSenderName?: string;
  previewText?: string;
  originalType?: ImMessageType;
  disappearing?: {
    mode: ConversationDisappearingStartMode;
    countdown: ConversationDisappearingCountdown;
    startedAt?: string;
    readByAllAt?: string;
    expiresAt?: string;
  };
};

export type ConversationMessage = {
  availableRecallModes?: ImRecallMode[];
  id: string;
  localId: string;
  conversationId: string;
  senderId: string;
  type: ImMessageType;
  content: string;
  quotedMessageId?: string;
  status: ImMessageStatus;
  failureReason?: "recipient_blocked" | "not_friends" | "send_failed";
  sentAt: string;
  editedAt?: string;
  contentPurgedAt?: string;
  privacyPolicyVersionAtSend?: number;
  lifecycleVersion?: number;
  reactionVersion?: number;
  recallDeadlineAt?: string;
  recalledAt?: string;
  recallMode?: "standard" | "traceless";
  serverState?: ImMessageServerState;
  clientSeq: number;
  ext?: MessageExt;
  reactions?: Array<{
    emoji: string;
    people: Array<{
      id: string;
      name: string;
      avatar?: string;
    }>;
    reactedByMe?: boolean;
  }>;
};

export type ImRecallMessageResult = {
  conversationId: string;
  message: ConversationMessage;
  messageId: string;
  mode: ImRecallMode;
};

export type ImStoreUpdate =
  | { type: "message.created"; message: ConversationMessage }
  | { type: "message.updated"; message: ConversationMessage }
  | { type: "message.recalled"; message: ConversationMessage }
  | { type: "refresh" };

export type ReadCursor = {
  id: string;
  conversationId: string;
  userId: string;
  lastReadMessageId?: string;
  lastReadAt: string;
};

export type MessageCampaign = {
  id: string;
  type: MessageCampaignType;
  targetTags: string[];
  targetUserIds?: string[];
  content: string;
  image?: MessageCampaignImageInput;
  createdBy: string;
  createdAt: string;
  sentCount: number;
  skippedCount: number;
  status: "draft" | "sending" | "sent" | "partial";
};

export type MessageCampaignRecipient = {
  id: string;
  campaignId: string;
  targetUserId: string;
  contactId?: string;
  matchedTags: string[];
  status: "pending" | "sent" | "skipped";
  skippedReason?: string;
  conversationId?: string;
  messageId?: string;
  sentAt?: string;
};

export type MessageCampaignRecipientPreview = Pick<
  MessageCampaignRecipient,
  "contactId" | "matchedTags" | "skippedReason" | "status" | "targetUserId"
>;

export type MessageCampaignImageInput = {
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
};

export type TagMessageCampaignInput = {
  tagIds: string[];
  targetUserIds?: string[];
  content?: string;
  messageType?: MessageCampaignType;
  image?: MessageCampaignImageInput;
};

export type TagMessageCampaignEstimate = {
  targetTags: string[];
  targetUserIds: string[];
  recipientCount: number;
  skippedCount: number;
  recipients: MessageCampaignRecipientPreview[];
};

export type TagMessageCampaignResult = {
  campaign: MessageCampaign;
  recipients: MessageCampaignRecipient[];
  deliveries: Array<{
    conversation: Conversation;
    message: ConversationMessage;
  }>;
};

export type ImRuntimeConfig = {
  allowStrangerMessaging: boolean;
  preserveConversationAfterDelete: boolean;
  syncDraftAcrossDevices: boolean;
  recallWindowMs: number;
  separatorThresholdMs: number;
};

export type ImDatabase = {
  currentUserId: string;
  config: ImRuntimeConfig;
  users: ImUser[];
  contacts: ContactRelation[];
  friendRequests: FriendRequest[];
  conversations: Conversation[];
  members: ConversationMember[];
  messages: ConversationMessage[];
  attachments: MessageAttachment[];
  readCursors: ReadCursor[];
  messageCampaigns: MessageCampaign[];
  messageCampaignRecipients: MessageCampaignRecipient[];
};

export type ImBootstrapPayload = {
  currentUserId: string;
  config: ImRuntimeConfig;
  users: ImUser[];
  contacts: ContactRelation[];
  organizationContacts?: ContactRelation[];
  friendRequests: FriendRequest[];
  conversations: Conversation[];
  members: ConversationMember[];
};

export type ImSearchResult = {
  contacts: ContactRelation[];
  conversations: Conversation[];
  messages: ConversationMessage[];
};

export type ImRealtimeEvent =
  | { type: "message.created"; payload: { conversation: Conversation; message: ConversationMessage } }
  | { type: "message.updated"; payload: { conversation: Conversation; message: ConversationMessage } }
  | { type: "message.recalled"; payload: { conversation: Conversation; message: ConversationMessage } }
  | { type: "conversation.updated"; payload: { conversation: Conversation } }
  | { type: "friend_request.created"; payload: { friendRequest: FriendRequest } }
  | { type: "friend_request.updated"; payload: { friendRequest: FriendRequest; contact?: ContactRelation } }
  | { type: "contact.updated"; payload: { contact: ContactRelation } }
  | { type: "unread.updated"; payload: { conversationId: string; unreadCount: number } };

export const CONTACT_INDEX_ORDER = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  "#"
] as const;

export type ContactIndexLetter = (typeof CONTACT_INDEX_ORDER)[number];

export type ContactIndexSource = {
  displayName?: string | null;
  phoneticName?: string | null;
  kanaName?: string | null;
  furigana?: string | null;
  romajiName?: string | null;
  sortName?: string | null;
};

export type ContactSection = {
  letter: ContactIndexLetter;
  items: ContactRelation[];
};

const seedNow = new Date("2026-04-17T19:30:00+09:00");
let idSeed = 0;
const contactIndexOrderMap = new Map(CONTACT_INDEX_ORDER.map((letter, index) => [letter, index]));
const kanaInitialGroups: Array<{ letter: ContactIndexLetter; characters: string }> = [
  { letter: "A", characters: "あぁアァ" },
  { letter: "I", characters: "いぃイィ" },
  { letter: "U", characters: "うぅウゥ" },
  { letter: "E", characters: "えぇエェ" },
  { letter: "O", characters: "おぉオォ" },
  { letter: "K", characters: "かきくけこゕゖカキクケコヵヶ" },
  { letter: "G", characters: "がぎぐげごガギグゲゴ" },
  { letter: "S", characters: "さしすせそサシスセソ" },
  { letter: "Z", characters: "ざじずぜぞザジズゼゾ" },
  { letter: "T", characters: "たちつてとっッタチツテト" },
  { letter: "D", characters: "だぢづでどダヂヅデド" },
  { letter: "N", characters: "なにぬねのんンナニヌネノ" },
  { letter: "H", characters: "はひふへほハヒフヘホ" },
  { letter: "B", characters: "ばびぶべぼバビブベボ" },
  { letter: "P", characters: "ぱぴぷぺぽパピプペポ" },
  { letter: "M", characters: "まみむめもマミムメモ" },
  { letter: "Y", characters: "やゆよゃゅょヤユヨャュョ" },
  { letter: "R", characters: "らりるれろラリルレロ" },
  { letter: "W", characters: "わをゎワヲヮ" },
  { letter: "V", characters: "ゔヴ" }
];
const hanInitialBoundaries: Array<{ letter: Exclude<ContactIndexLetter, "#">; sample: string }> = [
  { letter: "A", sample: "阿" },
  { letter: "B", sample: "芭" },
  { letter: "C", sample: "擦" },
  { letter: "D", sample: "搭" },
  { letter: "E", sample: "蛾" },
  { letter: "F", sample: "发" },
  { letter: "G", sample: "噶" },
  { letter: "H", sample: "哈" },
  { letter: "J", sample: "击" },
  { letter: "K", sample: "喀" },
  { letter: "L", sample: "垃" },
  { letter: "M", sample: "妈" },
  { letter: "N", sample: "拿" },
  { letter: "O", sample: "哦" },
  { letter: "P", sample: "啪" },
  { letter: "Q", sample: "期" },
  { letter: "R", sample: "然" },
  { letter: "S", sample: "撒" },
  { letter: "T", sample: "塌" },
  { letter: "W", sample: "挖" },
  { letter: "X", sample: "昔" },
  { letter: "Y", sample: "压" },
  { letter: "Z", sample: "匝" }
];
const hanInitialCollator = new Intl.Collator("zh-CN-u-co-pinyin", { sensitivity: "base" });

function nextId(prefix: string) {
  idSeed += 1;
  return `${prefix}-${idSeed}`;
}

function atMinutesAgo(minutes: number) {
  return new Date(seedNow.getTime() - minutes * 60_000).toISOString();
}

function atHoursAgo(hours: number) {
  return new Date(seedNow.getTime() - hours * 3_600_000).toISOString();
}

function atDaysAgo(days: number) {
  return new Date(seedNow.getTime() - days * 86_400_000).toISOString();
}

function createUser(input: Omit<ImUser, "searchableFields" | "status" | "canCall" | "canVideoCall"> & { searchableFields?: string[] }) {
  return {
    status: "active" as const,
    canCall: true,
    canVideoCall: true,
    searchableFields: input.searchableFields ?? [input.nickname, input.accountId, input.userIdLabel, input.sortKey],
    ...input
  };
}

function createContact(input: Omit<ContactRelation, "createdAt" | "updatedAt"> & { createdAt?: string; updatedAt?: string }) {
  return {
    createdAt: input.createdAt ?? atDaysAgo(12),
    updatedAt: input.updatedAt ?? atHoursAgo(6),
    ...input
  };
}

function createFriendRequest(input: Omit<FriendRequest, "createdAt"> & { createdAt?: string }) {
  return {
    createdAt: input.createdAt ?? atHoursAgo(4),
    ...input
  };
}

function createConversation(
  input: Omit<Conversation, "lastMessagePreview" | "lastMessageTime" | "updatedAt" | "unreadCount" | "isPinned" | "isMuted" | "autoTranslateMessages" | "avatar"> & {
    avatar?: string;
    lastMessagePreview?: string;
    lastMessageTime?: string;
    updatedAt?: string;
    unreadCount?: number;
    isPinned?: boolean;
    isMuted?: boolean;
    autoTranslateMessages?: boolean;
  }
) {
  return {
    avatar: input.avatar ?? "",
    lastMessagePreview: input.lastMessagePreview ?? "",
    lastMessageTime: input.lastMessageTime ?? atDaysAgo(3),
    unreadCount: input.unreadCount ?? 0,
    isPinned: input.isPinned ?? false,
    isMuted: input.isMuted ?? false,
    autoTranslateMessages: input.autoTranslateMessages ?? false,
    updatedAt: input.updatedAt ?? input.lastMessageTime ?? atDaysAgo(3),
    ...input
  };
}

function createMember(input: Omit<ConversationMember, "joinedAt"> & { joinedAt?: string }) {
  return {
    joinedAt: input.joinedAt ?? atDaysAgo(40),
    ...input
  };
}

function createMessage(
  input: Omit<ConversationMessage, "id" | "localId" | "clientSeq" | "status"> & {
    id?: string;
    localId?: string;
    clientSeq?: number;
    status?: ImMessageStatus;
  }
) {
  const messageId = input.id ?? nextId("msg");

  return {
    id: messageId,
    localId: input.localId ?? `${messageId}-local`,
    clientSeq: input.clientSeq ?? idSeed,
    status: input.status ?? "sent",
    ...input
  };
}

function createAttachment(input: Omit<MessageAttachment, "id">) {
  return {
    id: nextId("attachment"),
    ...input
  };
}

function toRecord<T extends { id: string }>(items: T[]) {
  return Object.fromEntries(items.map((item) => [item.id, item])) as Record<string, T>;
}

export function cloneImDatabase(database: ImDatabase): ImDatabase {
  return JSON.parse(JSON.stringify(database)) as ImDatabase;
}

export function getUserById(database: Pick<ImDatabase, "users">, userId: string) {
  return database.users.find((user) => user.id === userId);
}

export function getContactByUserId(database: Pick<ImDatabase, "contacts">, userId: string) {
  return database.contacts.find((contact) => contact.targetUserId === userId);
}

export function getConversationById(database: Pick<ImDatabase, "conversations">, conversationId: string) {
  return database.conversations.find((conversation) => conversation.id === conversationId);
}

export function getMessagesForConversation(database: Pick<ImDatabase, "messages">, conversationId: string) {
  return database.messages
    .filter((message) => message.conversationId === conversationId)
    .sort((left, right) => new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime());
}

export function getConversationMembers(database: Pick<ImDatabase, "members">, conversationId: string) {
  return database.members.filter((member) => member.conversationId === conversationId);
}

export function getConversationMember(database: Pick<ImDatabase, "members">, conversationId: string, userId: string) {
  return database.members.find((member) => member.conversationId === conversationId && member.userId === userId);
}

export function getDisplayName(user: ImUser, contact?: ContactRelation) {
  return contact?.remarkName?.trim() || user.remarkName?.trim() || user.nickname;
}

function getAnonymousGroupMemberCode(index: number) {
  let remaining = Math.max(0, Math.floor(index));
  let code = "";

  do {
    code = String.fromCharCode(65 + (remaining % 26)) + code;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);

  return code;
}

export function getAnonymousGroupMemberIdentity(
  conversation: Pick<Conversation, "memberIds">,
  userId: string
) {
  const memberIndex = conversation.memberIds.indexOf(userId);
  const code = getAnonymousGroupMemberCode(memberIndex >= 0 ? memberIndex : 0);

  return {
    code,
    displayName: `ユーザー${code}`
  };
}

export function getAnonymousGroupConversationTitle(conversation: Pick<Conversation, "memberIds">) {
  const visibleNames = conversation.memberIds
    .slice(0, 3)
    .map((userId) => getAnonymousGroupMemberIdentity(conversation, userId).displayName);

  return conversation.memberIds.length > 3 ? `${visibleNames.join("、")}、...` : visibleNames.join("、");
}

export function getConversationTitle(database: Pick<ImDatabase, "users" | "contacts">, conversation: Conversation) {
  if (conversation.type === "group" || conversation.type === "system" || !conversation.contactUserId) {
    return conversation.title;
  }

  const user = getUserById(database, conversation.contactUserId);
  const contact = getContactByUserId(database, conversation.contactUserId);

  return user ? getDisplayName(user, contact) : conversation.title;
}

function trimLeadingWhitespace(value?: string | null) {
  return value?.trimStart() ?? "";
}

function getFirstCharacter(value?: string | null) {
  const trimmed = trimLeadingWhitespace(value);
  return trimmed ? Array.from(trimmed)[0] ?? "" : "";
}

function stripDiacritics(value: string) {
  return value.normalize("NFKD").replace(/\p{Mark}+/gu, "");
}

function getLatinIndexLetter(value: string) {
  const first = Array.from(stripDiacritics(value).toUpperCase())[0] ?? "";
  return /^[A-Z]$/.test(first) ? (first as ContactIndexLetter) : null;
}

function getKanaIndexLetter(value: string) {
  const first = getFirstCharacter(value).normalize("NFKC");

  if (!first) {
    return null;
  }

  const matched = kanaInitialGroups.find((group) => group.characters.includes(first));
  return matched?.letter ?? null;
}

function isHanCharacter(value: string) {
  return /\p{Script=Han}/u.test(value);
}

function getHanIndexLetter(value: string) {
  if (!value) {
    return null;
  }

  for (let index = hanInitialBoundaries.length - 1; index >= 0; index -= 1) {
    if (hanInitialCollator.compare(value, hanInitialBoundaries[index].sample) >= 0) {
      return hanInitialBoundaries[index].letter;
    }
  }

  return null;
}

function resolveIndexLetterFromReading(value?: string | null) {
  const first = getFirstCharacter(value);

  if (!first) {
    return null;
  }

  const latinLetter = getLatinIndexLetter(first);

  if (latinLetter) {
    return latinLetter;
  }

  const kanaLetter = getKanaIndexLetter(first);

  if (kanaLetter) {
    return kanaLetter;
  }

  if (isHanCharacter(first)) {
    return getHanIndexLetter(first);
  }

  return null;
}

function getContactSortSeed(contact: ContactIndexSource) {
  const displayName = trimLeadingWhitespace(contact.displayName);
  const first = getFirstCharacter(displayName);

  if (!first) {
    return "";
  }

  if (getLatinIndexLetter(first) || getKanaIndexLetter(first)) {
    return displayName;
  }

  if (isHanCharacter(first)) {
    return trimLeadingWhitespace(contact.sortName)
      || trimLeadingWhitespace(contact.romajiName)
      || trimLeadingWhitespace(contact.kanaName)
      || trimLeadingWhitespace(contact.furigana)
      || trimLeadingWhitespace(contact.phoneticName)
      || displayName;
  }

  return displayName;
}

function compareContactSortValues(left: string, right: string) {
  return left.localeCompare(right, ["zh-CN-u-co-pinyin", "ja-JP", "en"], {
    sensitivity: "base",
    numeric: true
  });
}

function getContactIndexOrder(letter: ContactIndexLetter) {
  return contactIndexOrderMap.get(letter) ?? CONTACT_INDEX_ORDER.length;
}

export function getInitialLetter(value: string) {
  return getContactIndexLetter({ displayName: value });
}

export function getContactIndexLetter(contact: ContactIndexSource): ContactIndexLetter {
  const displayName = trimLeadingWhitespace(contact.displayName);
  const first = getFirstCharacter(displayName);

  if (!first) {
    return "#";
  }

  const latinLetter = getLatinIndexLetter(first);

  if (latinLetter) {
    return latinLetter;
  }

  const kanaLetter = getKanaIndexLetter(first);

  if (kanaLetter) {
    return kanaLetter;
  }

  if (isHanCharacter(first)) {
    const fallbackLetter = [
      contact.phoneticName,
      contact.kanaName,
      contact.furigana,
      contact.romajiName,
      contact.sortName
    ]
      .map((value) => resolveIndexLetterFromReading(value))
      .find((value): value is ContactIndexLetter => Boolean(value));

    return fallbackLetter ?? getHanIndexLetter(first) ?? "#";
  }

  return "#";
}

export function groupContactsByIndex<T extends ContactIndexSource>(contacts: T[]) {
  const sorted = contacts
    .map((contact, index) => ({
      contact,
      index,
      letter: getContactIndexLetter(contact),
      sortSeed: getContactSortSeed(contact)
    }))
    .sort((left, right) => {
      const letterDiff = getContactIndexOrder(left.letter) - getContactIndexOrder(right.letter);

      if (letterDiff !== 0) {
        return letterDiff;
      }

      const sortDiff = compareContactSortValues(left.sortSeed, right.sortSeed);

      if (sortDiff !== 0) {
        return sortDiff;
      }

      return left.index - right.index;
    });

  const bucket = new Map<ContactIndexLetter, T[]>();

  sorted.forEach(({ contact, letter }) => {
    const items = bucket.get(letter) ?? [];
    items.push(contact);
    bucket.set(letter, items);
  });

  return Array.from(bucket.entries()).map(([letter, items]) => ({
    letter,
    items
  }));
}

export function getVisibleIndexLetters(
  sections: Array<{ letter: ContactIndexLetter; items: unknown[] }>,
  options: { includeSymbolFallback?: boolean } = {}
) {
  const visibleLetters: ContactIndexLetter[] = [];
  const seen = new Set<ContactIndexLetter>();

  sections.forEach((section) => {
    if (section.items.length === 0 || seen.has(section.letter)) {
      return;
    }

    seen.add(section.letter);
    visibleLetters.push(section.letter);
  });

  if (options.includeSymbolFallback && visibleLetters.length > 0 && !seen.has("#")) {
    visibleLetters.push("#");
  }

  return visibleLetters;
}

export function resolveIndexLetterFromTouchY(
  y: number,
  containerTop: number,
  itemHeight: number,
  letters: ContactIndexLetter[]
) {
  if (letters.length === 0) {
    return null;
  }

  if (!Number.isFinite(itemHeight) || itemHeight <= 0) {
    return letters[0];
  }

  const rawIndex = Math.floor((y - containerTop) / itemHeight);
  const index = Math.max(0, Math.min(rawIndex, letters.length - 1));
  return letters[index];
}

export function formatConversationTime(value: string, now = new Date()) {
  const target = new Date(value);
  const diff = now.getTime() - target.getTime();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const dayDiff = Math.round((startOfToday.getTime() - startOfTarget.getTime()) / 86_400_000);

  if (diff < 0) {
    return `${String(target.getHours()).padStart(2, "0")}:${String(target.getMinutes()).padStart(2, "0")}`;
  }

  if (dayDiff === 0) {
    return `${String(target.getHours()).padStart(2, "0")}:${String(target.getMinutes()).padStart(2, "0")}`;
  }

  if (dayDiff === 1) {
    return "昨天";
  }

  if (dayDiff < 7) {
    return new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(target).replace("周", "周");
  }

  return `${target.getFullYear()}/${target.getMonth() + 1}/${target.getDate()}`;
}

export function buildMessagePreviewDescriptor(
  message: ConversationMessage,
  currentUserId: string,
  _users: Record<string, ImUser>,
): ImMessagePreviewDescriptor {
  if (message.type === "recalled" || message.status === "recalled") {
    return {
      text: getRecallResidueLabel(message.senderId === currentUserId),
      provenance: "ui-label",
    };
  }

  if (message.type === "text" || message.type === "emoji") {
    return { text: message.content, provenance: "user-text" };
  }

  if (message.type === "image") {
    return { text: "图片", provenance: "ui-label" };
  }

  if (message.type === "voice") {
    return { text: "音频", provenance: "ui-label" };
  }

  if (message.type === "video") {
    return { text: "视频", provenance: "ui-label" };
  }

  if (message.type === "file") {
    const dynamicValue = message.ext?.fileName?.trim();
    return dynamicValue
      ? { text: dynamicValue, provenance: "dynamic-value", dynamicValue }
      : { text: "文件", provenance: "ui-label" };
  }

  if (message.type === "location") {
    return { text: "[位置]", provenance: "ui-label" };
  }

  if (message.type === "contact-card") {
    const uiLabel = "[名片]";
    const dynamicValue = message.ext?.contactCard?.displayName?.trim();
    return dynamicValue
      ? {
          text: `${uiLabel} ${dynamicValue}`,
          provenance: "ui-label-with-dynamic-value",
          uiLabel,
          dynamicValue,
        }
      : { text: uiLabel, provenance: "ui-label" };
  }

  if (message.type === "service-card") {
    const uiLabel = "[服务]";
    const dynamicValue = message.ext?.serviceCard?.name?.trim();
    return dynamicValue
      ? {
          text: `${uiLabel} ${dynamicValue}`,
          provenance: "ui-label-with-dynamic-value",
          uiLabel,
          dynamicValue,
        }
      : { text: uiLabel, provenance: "ui-label" };
  }

  if (message.type === "schedule-invite") {
    const uiLabel = "[日程邀请]";
    const dynamicValue = message.ext?.scheduleInvite?.title?.trim();
    return dynamicValue
      ? {
          text: `${uiLabel} ${dynamicValue}`,
          provenance: "ui-label-with-dynamic-value",
          uiLabel,
          dynamicValue,
        }
      : { text: uiLabel, provenance: "ui-label" };
  }

  return { text: message.content, provenance: "ui-label" };
}

export function buildMessagePreview(
  message: ConversationMessage,
  currentUserId: string,
  users: Record<string, ImUser>,
) {
  return buildMessagePreviewDescriptor(message, currentUserId, users).text;
}

export function buildConversationLastMessageSummary(
  message: ConversationMessage | undefined,
  currentUserId: string,
  users: Record<string, ImUser>,
  fallbackTime: string,
): Pick<
  Conversation,
  | "lastMessageId"
  | "lastMessagePreview"
  | "lastMessageType"
  | "lastMessageStatus"
  | "lastMessagePreviewProvenance"
  | "lastMessagePreviewDynamicValue"
  | "lastMessageTime"
> {
  const descriptor = message
    ? buildMessagePreviewDescriptor(message, currentUserId, users)
    : undefined;

  return {
    lastMessageId: message?.id,
    lastMessagePreview: descriptor?.text ?? "",
    lastMessageType: message?.type,
    lastMessageStatus: message?.status,
    lastMessagePreviewProvenance: descriptor?.provenance,
    lastMessagePreviewDynamicValue: descriptor?.dynamicValue,
    lastMessageTime: message?.sentAt ?? fallbackTime,
  };
}

export function buildConversationRowPreview(conversation: Conversation) {
  if (conversation.privacyModeEnabled) {
    return {
      text: "私密群消息已隐藏",
      isDraft: false
    };
  }

  const draftText = conversation.draftText?.trim();

  if (draftText) {
    return {
      text: materializeImComposerDraft(draftText),
      isDraft: true
    };
  }

  return {
    text: conversation.lastMessagePreview || "暂无消息",
    isDraft: false
  };
}

export function sortConversations(conversations: Conversation[]) {
  return [...conversations]
    .filter((conversation) => !conversation.isDeleted)
    .sort((left, right) => {
      if (left.isPinned !== right.isPinned) {
        return Number(right.isPinned) - Number(left.isPinned);
      }

      return new Date(right.lastMessageTime).getTime() - new Date(left.lastMessageTime).getTime();
    });
}

export function buildContactSections(database: Pick<ImDatabase, "users" | "contacts">) {
  const users = toRecord(database.users);
  const visibleContacts = database.contacts
    .filter((contact) => contact.relationStatus === "active" && !contact.isBlocked);

  return groupContactsByIndex(
    visibleContacts.map((contact) => {
      const user = users[contact.targetUserId];

      return {
        contact,
        displayName: user ? getDisplayName(user, contact) : contact.remarkName ?? "",
        phoneticName: user?.phoneticName,
        kanaName: user?.kanaName,
        furigana: user?.furigana,
        romajiName: user?.romajiName,
        sortName: user?.sortKey
      };
    })
  ).map((section) => ({
    letter: section.letter,
    items: section.items.map((item) => item.contact)
  }));
}

export function buildTimeSeparatedMessages(messages: ConversationMessage[], thresholdMs: number) {
  const rows: Array<{ kind: "divider"; id: string; label: string } | { kind: "message"; message: ConversationMessage }> = [];

  messages.forEach((message, index) => {
    const previous = messages[index - 1];
    const previousAt = previous ? new Date(previous.sentAt).getTime() : 0;
    const currentAt = new Date(message.sentAt).getTime();
    const shouldInsert = index === 0 || currentAt - previousAt >= thresholdMs;

    if (shouldInsert) {
      rows.push({
        kind: "divider",
        id: `divider-${message.id}`,
        label: formatMessageDivider(message.sentAt)
      });
    }

    rows.push({
      kind: "message",
      message
    });
  });

  return rows;
}

export function formatMessageDivider(value: string) {
  const target = new Date(value);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(target);
}

export function canRecallMessage(message: ConversationMessage, currentUserId: string, config: ImRuntimeConfig, now = Date.now()) {
  if (message.senderId !== currentUserId) {
    return false;
  }

  if (message.type === "system" || message.type === "recalled" || message.status === "failed") {
    return false;
  }

  return now - new Date(message.sentAt).getTime() <= config.recallWindowMs;
}

export type StandardRecallAvailability = "available" | "expired" | "unavailable";

export function getStandardRecallAvailability(
  message: ConversationMessage,
  currentUserId: string,
  now = Date.now(),
): StandardRecallAvailability {
  if (
    message.senderId !== currentUserId ||
    message.type === "system" ||
    message.type === "recalled" ||
    message.status === "failed" ||
    message.serverState === "recalled"
  ) {
    return "unavailable";
  }

  const deadline = message.recallDeadlineAt
    ? new Date(message.recallDeadlineAt).getTime()
    : Number.NaN;

  if (!Number.isFinite(deadline)) {
    return "unavailable";
  }

  if (now > deadline) {
    return "expired";
  }

  return message.availableRecallModes?.includes("standard")
    ? "available"
    : "unavailable";
}

export function getRecallResidueLabel(isMine: boolean) {
  return isMine ? "你撤回了一条消息" : "对方撤回了一条消息";
}

export function buildSearchResults(database: ImDatabase, query: string, conversationId?: string): ImSearchResult {
  const keyword = query.trim().toLowerCase();

  if (!keyword) {
    return {
      contacts: [],
      conversations: [],
      messages: []
    };
  }

  const contacts = database.contacts.filter((contact) => {
    if (contact.relationStatus !== "active") {
      return false;
    }

    const user = getUserById(database, contact.targetUserId);

    return Boolean(
      user &&
        !contact.isBlocked &&
        [getDisplayName(user, contact), user.userIdLabel, user.signature, ...user.searchableFields, ...contact.tags, contact.description]
          .filter(Boolean)
          .some((field) => field?.toLowerCase().includes(keyword))
    );
  });

  const conversations = database.conversations.filter((conversation) => {
    if (conversation.isDeleted) {
      return false;
    }

    const title = getConversationTitle(database, conversation);
    const participantFields = conversation.memberIds.flatMap((memberId) => {
      const user = getUserById(database, memberId);
      const contact = getContactByUserId(database, memberId);

      if (!user) {
        return [];
      }

      return [
        getDisplayName(user, contact),
        user.nickname,
        user.userIdLabel,
        user.signature,
        user.region,
        user.bio,
        user.source,
        ...user.searchableFields,
        ...user.tags,
        contact?.remarkName,
        contact?.source,
        contact?.description,
        ...(contact?.tags ?? [])
      ];
    });

    return [title, conversation.title, conversation.lastMessagePreview, conversation.announcement, conversation.nicknameInGroup, ...(conversation.tags ?? []), ...participantFields]
      .filter(Boolean)
      .some((field) => field?.toLowerCase().includes(keyword));
  });

  const messages = database.messages.filter((message) => {
    if (conversationId && message.conversationId !== conversationId) {
      return false;
    }

    const conversation = getConversationById(database, message.conversationId);

    if (!conversation || conversation.isDeleted) {
      return false;
    }

    const text = [message.content, message.ext?.fileName, message.ext?.location?.title, message.ext?.contactCard?.displayName, message.ext?.previewText]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return text.includes(keyword);
  });

  return {
    contacts,
    conversations,
    messages
  };
}

export function getAttachmentForMessage(database: Pick<ImDatabase, "attachments">, messageId: string) {
  return database.attachments.find((attachment) => attachment.messageId === messageId);
}

export function buildMediaBuckets(database: ImDatabase, conversationId: string) {
  const messages = getMessagesForConversation(database, conversationId);
  const media = messages.filter((message) => message.type === "image" || message.type === "video");
  const files = messages.filter((message) => message.type === "file");
  const links = messages.filter((message) => /(https?:\/\/[^\s]+)/i.test(message.content));

  return { media, files, links };
}

export function applyConversationDraft(conversation: Conversation, draftText?: string, draftUpdatedAt?: string) {
  return {
    ...conversation,
    draftText,
    draftUpdatedAt
  };
}

function ensureReadCursor(database: ImDatabase, conversationId: string) {
  const existing = database.readCursors.find((cursor) => cursor.conversationId === conversationId && cursor.userId === database.currentUserId);

  if (existing) {
    return existing;
  }

  const created: ReadCursor = {
    id: nextId("cursor"),
    conversationId,
    userId: database.currentUserId,
    lastReadAt: atDaysAgo(1)
  };

  database.readCursors.push(created);
  return created;
}

export function recomputeConversationSummary(database: ImDatabase, conversationId: string) {
  const conversation = getConversationById(database, conversationId);

  if (!conversation) {
    return undefined;
  }

  const users = toRecord(database.users);
  const messages = getMessagesForConversation(database, conversationId);
  const lastMessage = messages.at(-1);

  if (!lastMessage) {
    Object.assign(
      conversation,
      buildConversationLastMessageSummary(
        undefined,
        database.currentUserId,
        users,
        conversation.updatedAt,
      ),
    );
    return conversation;
  }

  Object.assign(
    conversation,
    buildConversationLastMessageSummary(
      lastMessage,
      database.currentUserId,
      users,
      conversation.updatedAt,
    ),
  );
  conversation.updatedAt = lastMessage.sentAt;

  return conversation;
}

function buildGroupConversationTitle(database: Pick<ImDatabase, "users" | "contacts">, memberIds: string[]) {
  const users = memberIds
    .map((userId) => getUserById(database, userId))
    .filter((user): user is ImUser => Boolean(user))
    .map((user) => getDisplayName(user, getContactByUserId(database, user.id)));

  if (users.length <= 3) {
    return users.join("、");
  }

  return `${users.slice(0, 3).join("、")}等${users.length}人`;
}

function addDisappearingCountdown(startAt: string, countdown: ConversationDisappearingCountdown) {
  const date = new Date(startAt);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  date.setMonth(date.getMonth() + countdown.months);
  date.setDate(date.getDate() + countdown.days);
  date.setHours(date.getHours() + countdown.hours);
  date.setMinutes(date.getMinutes() + countdown.minutes);

  return date.toISOString();
}

function isPrivacyConversation(conversation?: Conversation): conversation is Conversation & {
  disappearingCountdown: ConversationDisappearingCountdown;
} {
  return Boolean(conversation?.privacyModeEnabled && conversation.disappearingCountdown);
}

export function normalizeDisappearingCountdown(input?: Partial<ConversationDisappearingCountdown>) {
  if (!input) {
    return undefined;
  }

  const countdown: ConversationDisappearingCountdown = {
    months: Math.min(12, Math.max(0, Math.floor(Number(input.months) || 0))),
    days: Math.min(30, Math.max(0, Math.floor(Number(input.days) || 0))),
    hours: Math.min(23, Math.max(0, Math.floor(Number(input.hours) || 0))),
    minutes: Math.min(59, Math.max(0, Math.floor(Number(input.minutes) || 0)))
  };

  return countdown.months + countdown.days + countdown.hours + countdown.minutes > 0 ? countdown : undefined;
}

function getDisappearingStartMode(mode?: ConversationDisappearingStartMode) {
  return mode === "read_by_all" ? "read_by_all" : "sent";
}

function normalizeGroupInfoEditPolicy(policy?: GroupInfoEditPolicy) {
  return policy === "members" ? "members" : "owner";
}

function canEditGroupInfoField(conversation: Conversation, member: ConversationMember, policy?: GroupInfoEditPolicy) {
  return member.role === "owner" || normalizeGroupInfoEditPolicy(policy) === "members";
}

function buildDisappearingMessageExt(
  conversation: Conversation,
  sentAt: string,
  ext?: MessageExt
): MessageExt | undefined {
  if (!isPrivacyConversation(conversation)) {
    return ext;
  }

  const mode = getDisappearingStartMode(conversation.disappearingStartMode);
  const startedAt = mode === "sent" ? sentAt : undefined;
  const expiresAt = startedAt ? addDisappearingCountdown(startedAt, conversation.disappearingCountdown) : undefined;

  return {
    ...ext,
    disappearing: {
      mode,
      countdown: conversation.disappearingCountdown,
      startedAt,
      expiresAt
    }
  };
}

export function createConversationMutation(database: ImDatabase, memberIds: string[], title?: string, privacyOptions?: CreateConversationPrivacyOptions) {
  const normalizedMemberIds = Array.from(new Set([database.currentUserId, ...memberIds]));
  const isGroupConversation = privacyOptions?.forceGroup === true || normalizedMemberIds.length > 2;
  const disappearingCountdown = isGroupConversation && privacyOptions?.privacyModeEnabled
    ? normalizeDisappearingCountdown(privacyOptions.disappearingCountdown)
    : undefined;

  if (!isGroupConversation && normalizedMemberIds.length === 2) {
    const targetUserId = normalizedMemberIds.find((userId) => userId !== database.currentUserId);
    const existing = database.conversations.find(
      (conversation) =>
        conversation.type === "single" &&
        conversation.contactUserId === targetUserId &&
        conversation.memberIds.length === normalizedMemberIds.length &&
        normalizedMemberIds.every((userId) => conversation.memberIds.includes(userId))
    );

    if (existing) {
      existing.isDeleted = false;
      return existing;
    }
  }

  const conversationId = nextId("conversation");
  const conversation = createConversation({
    id: conversationId,
    type: isGroupConversation ? "group" : "single",
    title: title?.trim() || buildGroupConversationTitle(database, normalizedMemberIds.filter((item) => item !== database.currentUserId)),
    avatar: isGroupConversation ? "" : getUserById(database, normalizedMemberIds.find((id) => id !== database.currentUserId) ?? "")?.avatar ?? "",
    memberIds: normalizedMemberIds,
    contactUserId: isGroupConversation ? undefined : normalizedMemberIds.find((id) => id !== database.currentUserId),
    lastMessagePreview: "",
    lastMessageTime: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    announcement: undefined,
    nicknameInGroup: undefined,
    savedToContacts: isGroupConversation,
    privacyModeEnabled: Boolean(disappearingCountdown),
    hideMemberProfiles: isGroupConversation ? Boolean(privacyOptions?.hideMemberProfiles) : undefined,
    disappearingCountdown,
    disappearingStartMode: disappearingCountdown ? getDisappearingStartMode(privacyOptions?.disappearingStartMode) : undefined,
    titleEditPolicy: isGroupConversation ? "owner" : undefined,
    announcementEditPolicy: isGroupConversation ? "owner" : undefined
  });

  database.conversations.unshift(conversation);

  normalizedMemberIds.forEach((userId, index) => {
    database.members.push(
      createMember({
        id: nextId("member"),
        conversationId,
        userId,
        role: index === 0 ? "owner" : "member"
      })
    );
  });

  ensureReadCursor(database, conversationId);

  return conversation;
}

export function updateConversationGroupInfoMutation(database: ImDatabase, conversationId: string, options: UpdateConversationGroupInfoOptions) {
  const conversation = getConversationById(database, conversationId);

  if (!conversation || conversation.type !== "group") {
    return undefined;
  }

  const currentMember = getConversationMember(database, conversationId, database.currentUserId);

  if (!currentMember) {
    return undefined;
  }

  if (options.titleEditPolicy !== undefined || options.announcementEditPolicy !== undefined) {
    if (currentMember.role !== "owner") {
      return undefined;
    }

    if (options.titleEditPolicy !== undefined) {
      conversation.titleEditPolicy = normalizeGroupInfoEditPolicy(options.titleEditPolicy);
    }

    if (options.announcementEditPolicy !== undefined) {
      conversation.announcementEditPolicy = normalizeGroupInfoEditPolicy(options.announcementEditPolicy);
    }
  }

  if (options.title !== undefined) {
    if (!canEditGroupInfoField(conversation, currentMember, conversation.titleEditPolicy)) {
      return undefined;
    }

    const nextTitle = options.title.trim();
    if (!nextTitle) {
      return undefined;
    }

    conversation.title = nextTitle;
  }

  if (options.announcement !== undefined) {
    if (!canEditGroupInfoField(conversation, currentMember, conversation.announcementEditPolicy)) {
      return undefined;
    }

    conversation.announcement = options.announcement.trim() || undefined;
  }

  if (options.nicknameInGroup !== undefined) {
    currentMember.nicknameInGroup = options.nicknameInGroup.trim() || undefined;
    conversation.nicknameInGroup = currentMember.nicknameInGroup;
  }

  conversation.updatedAt = new Date().toISOString();
  return conversation;
}

export function markConversationReadMutation(database: ImDatabase, conversationId: string) {
  const conversation = getConversationById(database, conversationId);

  if (!conversation) {
    return undefined;
  }

  const messages = getMessagesForConversation(database, conversationId);
  const lastMessage = messages.at(-1);
  const cursor = ensureReadCursor(database, conversationId);

  conversation.unreadCount = 0;
  cursor.lastReadMessageId = lastMessage?.id;
  cursor.lastReadAt = new Date().toISOString();

  expireDisappearingMessagesMutation(database, conversationId);

  return getConversationById(database, conversationId) ?? conversation;
}

export function markConversationUnreadMutation(database: ImDatabase, conversationId: string) {
  const conversation = getConversationById(database, conversationId);
  if (!conversation) return undefined;

  conversation.unreadCount = Math.max(1, conversation.unreadCount);
  return conversation;
}

export function toggleConversationPinMutation(database: ImDatabase, conversationId: string, isPinned: boolean) {
  const conversation = getConversationById(database, conversationId);

  if (!conversation) {
    return undefined;
  }

  conversation.isPinned = isPinned;
  return conversation;
}

export function toggleConversationMuteMutation(database: ImDatabase, conversationId: string, isMuted: boolean) {
  const conversation = getConversationById(database, conversationId);

  if (!conversation) {
    return undefined;
  }

  conversation.isMuted = isMuted;
  return conversation;
}

export function updateConversationPrivacyMutation(database: ImDatabase, conversationId: string, options: UpdateConversationPrivacyOptions) {
  const conversation = getConversationById(database, conversationId);

  if (!conversation || conversation.type !== "group") {
    return undefined;
  }

  const currentMember = getConversationMember(database, conversationId, database.currentUserId);

  if (currentMember?.role !== "owner") {
    return undefined;
  }

  if (typeof options.hideMemberProfiles === "boolean") {
    conversation.hideMemberProfiles = options.hideMemberProfiles;
  }

  if (!options.privacyModeEnabled) {
    conversation.privacyModeEnabled = false;
    conversation.disappearingCountdown = undefined;
    conversation.disappearingStartMode = undefined;
    return conversation;
  }

  const disappearingCountdown = normalizeDisappearingCountdown(options.disappearingCountdown);

  if (!disappearingCountdown) {
    return undefined;
  }

  conversation.privacyModeEnabled = true;
  conversation.disappearingCountdown = disappearingCountdown;
  conversation.disappearingStartMode = getDisappearingStartMode(options.disappearingStartMode);
  return conversation;
}

export function deleteConversationMutation(database: ImDatabase, conversationId: string) {
  const conversation = getConversationById(database, conversationId);

  if (!conversation) {
    return undefined;
  }

  conversation.isDeleted = true;
  conversation.unreadCount = 0;

  return conversation;
}

export function clearConversationMutation(database: ImDatabase, conversationId: string) {
  const removedMessageIds = new Set(database.messages.filter((message) => message.conversationId === conversationId).map((message) => message.id));
  database.messages = database.messages.filter((message) => message.conversationId !== conversationId);
  database.attachments = database.attachments.filter((attachment) => !removedMessageIds.has(attachment.messageId));
  return recomputeConversationSummary(database, conversationId);
}

function messageIndexById(messages: ConversationMessage[], messageId?: string) {
  if (!messageId) {
    return -1;
  }

  return messages.findIndex((message) => message.id === messageId);
}

function resolveMemberReadAt(database: ImDatabase, conversation: Conversation, message: ConversationMessage, memberId: string) {
  if (memberId === message.senderId) {
    return message.sentAt;
  }

  const cursor = database.readCursors.find((item) => item.conversationId === conversation.id && item.userId === memberId);

  if (!cursor) {
    return undefined;
  }

  const conversationMessages = getMessagesForConversation(database, conversation.id);
  const readIndex = messageIndexById(conversationMessages, cursor.lastReadMessageId);
  const messageIndex = messageIndexById(conversationMessages, message.id);
  const readByMessageId = readIndex >= 0 && messageIndex >= 0 && readIndex >= messageIndex;
  const readByTime = cursor.lastReadAt ? new Date(cursor.lastReadAt).getTime() >= new Date(message.sentAt).getTime() : false;

  return readByMessageId || readByTime ? cursor.lastReadAt : undefined;
}

function resolveReadByAllAt(database: ImDatabase, conversation: Conversation, message: ConversationMessage) {
  const readTimes = conversation.memberIds.map((memberId) => resolveMemberReadAt(database, conversation, message, memberId));

  if (readTimes.some((time) => !time)) {
    return undefined;
  }

  const latestReadTime = Math.max(...readTimes.map((time) => new Date(time ?? message.sentAt).getTime()));
  return Number.isFinite(latestReadTime) ? new Date(latestReadTime).toISOString() : undefined;
}

function startReadByAllDisappearingMessages(database: ImDatabase, conversation: Conversation) {
  let changed = false;

  getMessagesForConversation(database, conversation.id).forEach((message) => {
    const disappearing = message.ext?.disappearing;

    if (message.status === "recalled" || !disappearing || disappearing.mode !== "read_by_all" || disappearing.expiresAt) {
      return;
    }

    const countdown = normalizeDisappearingCountdown(disappearing.countdown);

    if (!countdown) {
      return;
    }

    const readByAllAt = resolveReadByAllAt(database, conversation, message);

    if (!readByAllAt) {
      return;
    }

    message.ext = {
      ...message.ext,
      disappearing: {
        ...disappearing,
        mode: "read_by_all",
        countdown,
        startedAt: readByAllAt,
        readByAllAt,
        expiresAt: addDisappearingCountdown(readByAllAt, countdown)
      }
    };
    changed = true;
  });

  return changed;
}

export function getMessageDisappearingExpiresAt(message: ConversationMessage) {
  return message.ext?.disappearing?.expiresAt;
}

export function expireDisappearingMessagesMutation(database: ImDatabase, conversationId?: string, now = Date.now()) {
  const targetConversations = database.conversations.filter((conversation) =>
    conversationId ? conversation.id === conversationId : true
  );
  const removedMessageIds = new Set<string>();
  const touchedConversationIds = new Set<string>();
  let changed = false;

  targetConversations.forEach((conversation) => {
    if (startReadByAllDisappearingMessages(database, conversation)) {
      changed = true;
      touchedConversationIds.add(conversation.id);
    }

    getMessagesForConversation(database, conversation.id).forEach((message) => {
      const expiresAt = getMessageDisappearingExpiresAt(message);

      if (!expiresAt) {
        return;
      }

      const expiresAtMs = new Date(expiresAt).getTime();

      if (Number.isFinite(expiresAtMs) && expiresAtMs <= now) {
        removedMessageIds.add(message.id);
        touchedConversationIds.add(conversation.id);
      }
    });
  });

  if (removedMessageIds.size > 0) {
    database.messages = database.messages.filter((message) => !removedMessageIds.has(message.id));
    database.attachments = database.attachments.filter((attachment) => !removedMessageIds.has(attachment.messageId));
    changed = true;
  }

  touchedConversationIds.forEach((id) => {
    recomputeConversationSummary(database, id);
  });

  return {
    changed,
    removedMessageIds: Array.from(removedMessageIds),
    conversations: Array.from(touchedConversationIds)
      .map((id) => getConversationById(database, id))
      .filter((conversation): conversation is Conversation => Boolean(conversation))
  };
}

export function updateContactRemarkMutation(database: ImDatabase, contactId: string, remarkName: string) {
  const contact = database.contacts.find((item) => item.id === contactId);

  if (!contact) {
    return undefined;
  }

  contact.remarkName = remarkName.trim() || undefined;
  contact.updatedAt = new Date().toISOString();
  return contact;
}

export function updateContactTagsMutation(database: ImDatabase, contactId: string, tags: string[]) {
  const contact = database.contacts.find((item) => item.id === contactId);

  if (!contact) {
    return undefined;
  }

  contact.tags = Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
  contact.updatedAt = new Date().toISOString();
  return contact;
}

export function updateConversationTagsMutation(database: ImDatabase, conversationId: string, tags: string[]) {
  const conversation = getConversationById(database, conversationId);

  if (!conversation) {
    return undefined;
  }

  conversation.tags = Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
  conversation.updatedAt = new Date().toISOString();
  return conversation;
}

function normalizeCampaignTag(value: string) {
  return value.trim().toLowerCase();
}

function normalizeCampaignTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
}

function normalizeCampaignTargetUserIds(userIds?: string[]) {
  return Array.from(new Set((userIds ?? []).map((userId) => userId.trim()).filter(Boolean)));
}

function isTagMessageCampaignType(value?: MessageCampaignType): value is MessageCampaignType {
  return value === "marketing" || value === "crm" || value === "transactional" || value === "system" || value === "risk";
}

function shouldRespectOptOut(type: MessageCampaignType) {
  return type === "marketing" || type === "crm";
}

function isOptOutTagged(tags: string[]) {
  return tags.some((tag) => /退订|拒收|免打扰|勿扰|不接收|opt[\s-]?out/i.test(tag));
}

function getContactCampaignTags(contact: ContactRelation, user?: ImUser) {
  return Array.from(new Set([...contact.tags, ...(user?.tags ?? [])].map((tag) => tag.trim()).filter(Boolean)));
}

function buildTagMessageCampaignRecipients(
  database: ImDatabase,
  input: TagMessageCampaignInput
): TagMessageCampaignEstimate {
  const targetTags = normalizeCampaignTags(input.tagIds);
  const targetTagSet = new Set(targetTags.map(normalizeCampaignTag));
  const targetUserIds = normalizeCampaignTargetUserIds(input.targetUserIds);
  const targetUserIdSet = new Set(targetUserIds);
  const type = isTagMessageCampaignType(input.messageType) ? input.messageType : "crm";
  const seenUserIds = new Set<string>();
  const recipients: MessageCampaignRecipientPreview[] = [];

  if (targetTagSet.size === 0 && targetUserIdSet.size === 0) {
    return {
      targetTags,
      targetUserIds,
      recipientCount: 0,
      skippedCount: 0,
      recipients: []
    };
  }

  database.contacts.forEach((contact) => {
    if (contact.relationStatus !== "active" || contact.isBlocked || contact.targetUserId === database.currentUserId || seenUserIds.has(contact.targetUserId)) {
      return;
    }

    const user = getUserById(database, contact.targetUserId);

    if (!user || user.status !== "active") {
      return;
    }

    const candidateTags = getContactCampaignTags(contact, user);
    const matchedTags = candidateTags.filter((tag) => targetTagSet.has(normalizeCampaignTag(tag)));
    const selectedDirectly = targetUserIdSet.has(contact.targetUserId);

    if (!selectedDirectly && matchedTags.length === 0) {
      return;
    }

    seenUserIds.add(contact.targetUserId);

    const skippedReason = shouldRespectOptOut(type) && isOptOutTagged(candidateTags) ? "已设置拒收营销/运营消息" : undefined;
    recipients.push({
      targetUserId: contact.targetUserId,
      contactId: contact.id,
      matchedTags,
      status: skippedReason ? "skipped" : "pending",
      skippedReason
    });
  });

  return {
    targetTags,
    targetUserIds,
    recipientCount: recipients.filter((recipient) => recipient.status !== "skipped").length,
    skippedCount: recipients.filter((recipient) => recipient.status === "skipped").length,
    recipients
  };
}

export function ensureMessageCampaignCollections(database: ImDatabase) {
  const mutableDatabase = database as ImDatabase & Partial<Pick<ImDatabase, "messageCampaignRecipients" | "messageCampaigns">>;
  let changed = false;

  if (!Array.isArray(mutableDatabase.messageCampaigns)) {
    mutableDatabase.messageCampaigns = [];
    changed = true;
  }

  if (!Array.isArray(mutableDatabase.messageCampaignRecipients)) {
    mutableDatabase.messageCampaignRecipients = [];
    changed = true;
  }

  return changed;
}

export function estimateTagMessageCampaign(database: ImDatabase, input: TagMessageCampaignInput): TagMessageCampaignEstimate {
  ensureMessageCampaignCollections(database);
  return buildTagMessageCampaignRecipients(database, input);
}

export function sendTagMessageCampaignMutation(database: ImDatabase, input: TagMessageCampaignInput): TagMessageCampaignResult {
  ensureMessageCampaignCollections(database);
  const content = input.content?.trim() ?? "";
  const image = input.image?.url ? input.image : undefined;

  if (!content && !image) {
    throw new Error("Message content or image is required");
  }

  const type = isTagMessageCampaignType(input.messageType) ? input.messageType : "crm";
  const estimate = buildTagMessageCampaignRecipients(database, input);
  const directRecipientCount = estimate.targetUserIds.length;
  const targetLabel = [
    ...estimate.targetTags,
    ...(directRecipientCount > 0 ? [`${directRecipientCount} 位朋友`] : [])
  ].join(" / ");
  const createdAt = new Date().toISOString();
  const campaign: MessageCampaign = {
    id: nextId("campaign"),
    type,
    targetTags: estimate.targetTags,
    targetUserIds: estimate.targetUserIds,
    content,
    image,
    createdBy: database.currentUserId,
    createdAt,
    sentCount: 0,
    skippedCount: estimate.skippedCount,
    status: "sending"
  };
  const recipients: MessageCampaignRecipient[] = [];
  const deliveries: TagMessageCampaignResult["deliveries"] = [];

  estimate.recipients.forEach((recipient) => {
    if (recipient.status === "skipped") {
      recipients.push({
        id: nextId("campaign-recipient"),
        campaignId: campaign.id,
        targetUserId: recipient.targetUserId,
        contactId: recipient.contactId,
        matchedTags: recipient.matchedTags,
        status: "skipped",
        skippedReason: recipient.skippedReason
      });
      return;
    }

    const conversation = createConversationMutation(database, [recipient.targetUserId]);
    const messageType: ImMessageType = image ? "image" : "text";
    const messageContent = image?.url ?? content;
    const messageExt: MessageExt = image
      ? {
          url: image.url,
          thumbnailUrl: image.thumbnailUrl ?? image.url,
          fileName: image.fileName,
          fileSize: image.fileSize,
          mimeType: image.mimeType,
          width: image.width,
          height: image.height,
          caption: content || undefined,
          previewText: content ? `群发 · ${content}` : `群发 · 图片${targetLabel ? ` · ${targetLabel}` : ""}`
        }
      : {
          previewText: `群发${targetLabel ? ` · ${targetLabel}` : ""}`
        };
    const result = sendMessageMutation(database, {
      conversationId: conversation.id,
      senderId: database.currentUserId,
      type: messageType,
      content: messageContent,
      ext: messageExt
    });

    campaign.sentCount += 1;
    recipients.push({
      id: nextId("campaign-recipient"),
      campaignId: campaign.id,
      targetUserId: recipient.targetUserId,
      contactId: recipient.contactId,
      matchedTags: recipient.matchedTags,
      status: "sent",
      conversationId: result.conversation.id,
      messageId: result.message.id,
      sentAt: result.message.sentAt
    });
    deliveries.push(result);
  });

  campaign.skippedCount = recipients.filter((recipient) => recipient.status === "skipped").length;
  campaign.status = campaign.sentCount > 0 && campaign.skippedCount > 0 ? "partial" : "sent";
  database.messageCampaigns.unshift(campaign);
  database.messageCampaignRecipients.unshift(...recipients);

  return {
    campaign,
    recipients,
    deliveries
  };
}

export function setContactBlockedMutation(database: ImDatabase, contactId: string, isBlocked: boolean) {
  const contact = database.contacts.find((item) => item.id === contactId);

  if (!contact) {
    return undefined;
  }

  contact.isBlocked = isBlocked;
  contact.updatedAt = new Date().toISOString();
  return contact;
}

export function deleteContactMutation(database: ImDatabase, contactId: string) {
  const contact = database.contacts.find((item) => item.id === contactId);

  if (!contact) {
    return undefined;
  }

  contact.relationStatus = "deleted";
  contact.updatedAt = new Date().toISOString();
  return contact;
}

export function acceptFriendRequestMutation(database: ImDatabase, requestId: string) {
  const request = database.friendRequests.find((item) => item.id === requestId);

  if (!request) {
    return {};
  }

  request.status = "accepted";
  request.handledAt = new Date().toISOString();

  let contact = getContactByUserId(database, request.fromUserId);

  if (!contact) {
    contact = createContact({
      id: nextId("contact"),
      ownerUserId: database.currentUserId,
      targetUserId: request.fromUserId,
      relationStatus: "active",
      source: request.source,
      tags: ["新朋友"],
      isStarred: false,
      isBlocked: false,
      description: "通过好友申请建立联系"
    });
    database.contacts.push(contact);
  } else {
    contact.relationStatus = "active";
    contact.isBlocked = false;
    contact.updatedAt = new Date().toISOString();
  }

  return { request, contact };
}

export function addContactMutation(
  database: ImDatabase,
  targetUserId: string,
  source: string,
  description = "通过聊天页手动添加"
) {
  const user = getUserById(database, targetUserId);

  if (!user || targetUserId === database.currentUserId) {
    return undefined;
  }

  let contact = getContactByUserId(database, targetUserId);

  if (!contact) {
    contact = createContact({
      id: nextId("contact"),
      ownerUserId: database.currentUserId,
      targetUserId,
      relationStatus: "active",
      source,
      tags: ["新朋友"],
      isStarred: false,
      isBlocked: false,
      description
    });
    database.contacts.push(contact);
    return contact;
  }

  contact.relationStatus = "active";
  contact.isBlocked = false;
  contact.source = source;
  contact.description = description;
  contact.updatedAt = new Date().toISOString();
  return contact;
}

export function rejectFriendRequestMutation(database: ImDatabase, requestId: string) {
  const request = database.friendRequests.find((item) => item.id === requestId);

  if (!request) {
    return undefined;
  }

  request.status = "rejected";
  request.handledAt = new Date().toISOString();
  return request;
}

export function recallMessageMutation(database: ImDatabase, messageId: string) {
  const message = database.messages.find((item) => item.id === messageId);

  if (!message) {
    return undefined;
  }

  message.status = "recalled";
  message.recalledAt = new Date().toISOString();
  message.ext = {
    ...message.ext,
    originalType: message.type
  };
  message.type = "recalled";
  message.content = "";

  const conversation = recomputeConversationSummary(database, message.conversationId);
  return conversation ? { conversation, message } : undefined;
}

export function resendMessageMutation(database: ImDatabase, messageId: string) {
  const message = database.messages.find((item) => item.id === messageId);

  if (!message) {
    return undefined;
  }

  message.status = "sent";
  message.sentAt = new Date().toISOString();
  const conversation = recomputeConversationSummary(database, message.conversationId);
  return conversation ? { conversation, message } : undefined;
}

export function sendMessageMutation(
  database: ImDatabase,
  input: {
    conversationId: string;
    senderId: string;
    type: ImMessageType;
    content: string;
    quotedMessageId?: string;
    ext?: MessageExt;
  }
) {
  const conversation = getConversationById(database, input.conversationId);

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  expireDisappearingMessagesMutation(database, input.conversationId);
  const sentAt = new Date().toISOString();
  const message = createMessage({
    conversationId: input.conversationId,
    senderId: input.senderId,
    type: input.type,
    content: input.content,
    quotedMessageId: input.quotedMessageId,
    sentAt,
    ext: buildDisappearingMessageExt(conversation, sentAt, input.ext)
  });

  database.messages.push(message);

  if (input.type === "image" || input.type === "video" || input.type === "file" || input.type === "voice") {
    database.attachments.push(
      createAttachment({
        messageId: message.id,
        fileName: input.ext?.fileName ?? `${input.type}-${message.id}`,
        mimeType: input.ext?.mimeType ?? "application/octet-stream",
        fileSize: input.ext?.fileSize ?? 0,
        url: input.ext?.url ?? input.content,
        thumbnailUrl: input.ext?.thumbnailUrl,
        duration: input.ext?.duration,
        width: input.ext?.width,
        height: input.ext?.height
      })
    );
  }

  if (message.senderId !== database.currentUserId) {
    conversation.unreadCount += 1;
    conversation.mentionMe = Boolean(message.ext?.mentions?.includes(database.currentUserId));
    conversation.mentionAll = Boolean(message.ext?.mentionAll);
  }

  recomputeConversationSummary(database, input.conversationId);

  return {
    message,
    conversation
  };
}

export function forwardMessageMutation(database: ImDatabase, messageId: string, conversationId: string) {
  const source = database.messages.find((message) => message.id === messageId);

  if (!source) {
    throw new Error("Source message not found");
  }

  return sendMessageMutation(database, {
    conversationId,
    senderId: database.currentUserId,
    type: source.type === "recalled" ? "text" : source.type,
    content: source.type === "recalled" ? "转发了一条已撤回消息" : source.content,
    ext: source.ext ? { ...source.ext, mentions: undefined, mentionAll: undefined } : undefined
  });
}

export function buildBootstrapPayload(database: ImDatabase): ImBootstrapPayload {
  return {
    currentUserId: database.currentUserId,
    config: database.config,
    users: database.users,
    contacts: database.contacts,
    friendRequests: database.friendRequests,
    conversations: database.conversations,
    members: database.members
  };
}

export function paginateMessages(messages: ConversationMessage[], limit = 30, cursor?: string | null) {
  if (messages.length === 0) {
    return {
      messages: [] as ConversationMessage[],
      nextCursor: null as string | null,
      hasMore: false
    };
  }

  const sorted = [...messages].sort((left, right) => new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime());

  if (!cursor) {
    const slice = sorted.slice(-limit);
    return {
      messages: slice,
      nextCursor: slice[0]?.id && slice[0].id !== sorted[0]?.id ? slice[0].id : null,
      hasMore: slice[0]?.id !== sorted[0]?.id
    };
  }

  const cursorIndex = sorted.findIndex((message) => message.id === cursor);

  if (cursorIndex <= 0) {
    return {
      messages: sorted.slice(0, Math.min(limit, sorted.length)),
      nextCursor: null,
      hasMore: false
    };
  }

  const start = Math.max(0, cursorIndex - limit);
  const slice = sorted.slice(start, cursorIndex);

  return {
    messages: slice,
    nextCursor: start > 0 ? slice[0]?.id ?? null : null,
    hasMore: start > 0
  };
}
