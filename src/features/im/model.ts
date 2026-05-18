import { customers, imageBank, stores, technicians } from "../../data/mock";
import {
  getMerchantCustomerConversationId,
  getMerchantTechnicianConversationId,
  getTechnicianCustomerConversationId,
  getTechnicianStaffConversationId,
  getTechnicianStoreConversationId,
  getTechnicianSupportConversationId
} from "../../lib/messageCenter";

export type ImRoleType = "user" | "merchant" | "technician";
export type ImProfileKind = "person" | "technician" | "store" | "service";
export type ImRelationStatus = "active" | "deleted";
export type ImFriendRequestStatus = "pending" | "accepted" | "rejected" | "expired";
export type ImConversationType = "single" | "group" | "system";
export type ImMessageType = "text" | "emoji" | "image" | "voice" | "video" | "file" | "location" | "contact-card" | "system" | "recalled";
export type ImMessageStatus = "sending" | "sent" | "delivered" | "failed" | "recalled";
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
  handledAt?: string;
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
  disappearingCountdown?: Partial<ConversationDisappearingCountdown>;
  disappearingStartMode?: ConversationDisappearingStartMode;
};

export type UpdateConversationPrivacyOptions = {
  privacyModeEnabled: boolean;
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
  lastMessageTime: string;
  unreadCount: number;
  isPinned: boolean;
  isMuted: boolean;
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
  id: string;
  localId: string;
  conversationId: string;
  senderId: string;
  type: ImMessageType;
  content: string;
  quotedMessageId?: string;
  status: ImMessageStatus;
  sentAt: string;
  editedAt?: string;
  recalledAt?: string;
  clientSeq: number;
  ext?: MessageExt;
};

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
  content: string;
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

export type TagMessageCampaignInput = {
  tagIds: string[];
  content?: string;
  messageType?: MessageCampaignType;
};

export type TagMessageCampaignEstimate = {
  targetTags: string[];
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
  input: Omit<Conversation, "lastMessagePreview" | "lastMessageTime" | "updatedAt" | "unreadCount" | "isPinned" | "isMuted" | "avatar"> & {
    avatar?: string;
    lastMessagePreview?: string;
    lastMessageTime?: string;
    updatedAt?: string;
    unreadCount?: number;
    isPinned?: boolean;
    isMuted?: boolean;
  }
) {
  return {
    avatar: input.avatar ?? imageBank.home,
    lastMessagePreview: input.lastMessagePreview ?? "",
    lastMessageTime: input.lastMessageTime ?? atDaysAgo(3),
    unreadCount: input.unreadCount ?? 0,
    isPinned: input.isPinned ?? false,
    isMuted: input.isMuted ?? false,
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

export function buildMessagePreview(message: ConversationMessage, currentUserId: string, users: Record<string, ImUser>) {
  if (message.type === "recalled" || message.status === "recalled") {
    return message.senderId === currentUserId ? "你撤回了一条消息" : `${users[message.senderId]?.nickname ?? "对方"}撤回了一条消息`;
  }

  if (message.type === "text" || message.type === "emoji") {
    return message.content;
  }

  if (message.type === "image") {
    return "[图片]";
  }

  if (message.type === "voice") {
    return "[语音]";
  }

  if (message.type === "video") {
    return "[视频]";
  }

  if (message.type === "file") {
    return "[文件]";
  }

  if (message.type === "location") {
    return "[位置]";
  }

  if (message.type === "contact-card") {
    return message.ext?.contactCard?.displayName ? `[名片] ${message.ext.contactCard.displayName}` : "[名片]";
  }

  return message.content;
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
      text: draftText,
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
    conversation.lastMessageId = undefined;
    conversation.lastMessagePreview = "";
    conversation.lastMessageTime = conversation.updatedAt;
    return conversation;
  }

  conversation.lastMessageId = lastMessage.id;
  conversation.lastMessageTime = lastMessage.sentAt;
  conversation.updatedAt = lastMessage.sentAt;
  conversation.lastMessagePreview = buildMessagePreview(lastMessage, database.currentUserId, users);

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
    avatar: isGroupConversation ? imageBank.restaurant : getUserById(database, normalizedMemberIds.find((id) => id !== database.currentUserId) ?? "")?.avatar ?? imageBank.home,
    memberIds: normalizedMemberIds,
    contactUserId: isGroupConversation ? undefined : normalizedMemberIds.find((id) => id !== database.currentUserId),
    lastMessagePreview: "",
    lastMessageTime: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    announcement: isGroupConversation ? "欢迎来到新群聊，先把今天要对齐的事情说清楚。" : undefined,
    nicknameInGroup: isGroupConversation ? "NeeDo 用户" : undefined,
    savedToContacts: isGroupConversation,
    privacyModeEnabled: Boolean(disappearingCountdown),
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
  const type = isTagMessageCampaignType(input.messageType) ? input.messageType : "crm";
  const seenUserIds = new Set<string>();
  const recipients: MessageCampaignRecipientPreview[] = [];

  if (targetTagSet.size === 0) {
    return {
      targetTags,
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

    if (matchedTags.length === 0) {
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
  const content = input.content?.trim();

  if (!content) {
    throw new Error("Message content is required");
  }

  const type = isTagMessageCampaignType(input.messageType) ? input.messageType : "crm";
  const estimate = buildTagMessageCampaignRecipients(database, input);
  const createdAt = new Date().toISOString();
  const campaign: MessageCampaign = {
    id: nextId("campaign"),
    type,
    targetTags: estimate.targetTags,
    content,
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
    const result = sendMessageMutation(database, {
      conversationId: conversation.id,
      senderId: database.currentUserId,
      type: "text",
      content,
      ext: {
        previewText: `标签群发 · ${estimate.targetTags.join(" / ")}`
      }
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

export function makeSeedImDatabase(): ImDatabase {
  const selfUserId = "im-user-self";
  const selfCustomer = customers[0];
  const selfDisplayName = selfCustomer?.nickname?.trim() || selfCustomer?.name || "Mia";
  const primaryTechnician = technicians[0];
  const primaryTechnicianDisplayName = primaryTechnician?.nickname?.trim() || primaryTechnician?.name || "佐藤 美咲";
  const users: ImUser[] = [
    createUser({
      id: selfUserId,
      accountId: selfCustomer?.accountUsername ?? "acc-needo-self",
      nickname: selfDisplayName,
      avatar: selfCustomer?.avatar ?? imageBank.home,
      region: "东京都 新宿区",
      bio: selfCustomer?.bio ?? "常用 NeeDo 处理预约、售后和门店沟通。",
      signature: selfCustomer?.bio ?? "今天也把事情说清楚",
      sortKey: `${selfDisplayName} ${selfCustomer?.id ?? "self"}`.toLowerCase(),
      profileKind: "person",
      source: "当前登录账号",
      tags: ["本人"],
      userIdLabel: selfCustomer?.systemId ?? "ND10001",
      entityType: "user",
      entityId: selfCustomer?.id
    }),
    createUser({
      id: "im-tech-1",
      accountId: "acc-tech-1",
      nickname: primaryTechnicianDisplayName,
      avatar: primaryTechnician?.avatar ?? imageBank.massage,
      region: "东京 银座",
      bio: primaryTechnician?.bio ?? "擅长肩颈调理和深层放松。",
      signature: "有空档会第一时间回复",
      sortKey: `${primaryTechnicianDisplayName} tech-1`.toLowerCase(),
      profileKind: "technician",
      source: "门店预约后常用联系",
      tags: ["技师", "肩颈调理", "中文 OK"],
      userIdLabel: primaryTechnician?.systemId ?? "B0001"
    }),
    createUser({
      id: "im-store-1",
      accountId: "acc-store-1",
      nickname: stores[0]?.name ?? "GINZA Calm Body Lab",
      avatar: stores[0]?.cover ?? imageBank.salon,
      region: stores[0]?.area ?? "银座",
      bio: stores[0]?.description ?? "门店预约、售后和服务确认统一在这里沟通。",
      signature: "营业中，消息一般 5 分钟内回复",
      sortKey: "ginza calm body lab",
      profileKind: "store",
      source: "收藏门店",
      tags: ["店铺", "预约门店"],
      userIdLabel: stores[0]?.systemId ?? "S0001"
    }),
    createUser({
      id: "im-support",
      accountId: "acc-support",
      nickname: "NeeDo 客服",
      avatar: imageBank.home,
      region: "平台服务中心",
      bio: "处理退款、改期、投诉与风控问题。",
      signature: "售后和平台协助都可以直接说",
      sortKey: "needo support",
      profileKind: "service",
      source: "官方服务号",
      tags: ["服务号", "官方"],
      userIdLabel: "SV0001",
      serviceAccount: true
    }),
    createUser({
      id: IM_ASSISTANT_USER_ID,
      accountId: "acc-assistant",
      nickname: "小咚 AI 助理",
      avatar: imageBank.cafe,
      region: "平台协作中心",
      bio: "专门陪你做聊天联调，能顺着上下文自然接话，也能演预约、改期、问价等场景。",
      signature: "你随便发一句，我都会尽量像真人一样接住",
      sortKey: "xiaodong ai zhuli",
      profileKind: "service",
      source: "系统服务账号",
      tags: ["服务号", "聊天测试", "AI 助理"],
      userIdLabel: "SV0012",
      serviceAccount: true
    }),
    createUser({
      id: "im-friend-amy",
      accountId: "acc-amy",
      nickname: "Amy Chen",
      avatar: customers[1]?.avatar ?? imageBank.cafe,
      region: "东京 涩谷",
      bio: "最近一起拼单过两次的朋友。",
      signature: "有空一起去做护理",
      sortKey: "amy chen",
      profileKind: "person",
      source: "手机号搜索",
      tags: ["朋友", "英语"],
      userIdLabel: customers[1]?.systemId ?? "U1011"
    }),
    createUser({
      id: "im-friend-brian",
      accountId: "acc-brian",
      nickname: "Brian Lee",
      avatar: customers[2]?.avatar ?? imageBank.restaurant,
      region: "横滨",
      bio: "偶尔一起约门店服务。",
      signature: "周末再约",
      sortKey: "brian lee",
      profileKind: "person",
      source: "群聊添加",
      tags: ["朋友", "拼单"],
      userIdLabel: customers[2]?.systemId ?? "U1012"
    }),
    createUser({
      id: "im-friend-coco",
      accountId: "acc-coco",
      nickname: "陈可可",
      avatar: customers[3]?.avatar ?? imageBank.nail,
      region: "东京 池袋",
      bio: "常分享靠谱门店和技师。",
      signature: "好用的服务都会记下来",
      sortKey: "chen keke",
      profileKind: "person",
      source: "系统推荐",
      tags: ["朋友", "中文"],
      userIdLabel: customers[3]?.systemId ?? "U1013"
    }),
    createUser({
      id: "im-friend-daisuke",
      accountId: "acc-daisuke",
      nickname: "大辅",
      avatar: customers[4]?.avatar ?? imageBank.repair,
      region: "东京 品川",
      bio: "常一起拼保洁和维修。",
      signature: "有需要直接喊我",
      sortKey: "daisuke",
      profileKind: "person",
      source: "扫码添加",
      tags: ["朋友", "维修"],
      userIdLabel: customers[4]?.systemId ?? "U1014"
    }),
    createUser({
      id: "im-friend-emi",
      accountId: "acc-emi",
      nickname: "えみ",
      avatar: customers[5]?.avatar ?? imageBank.salon,
      region: "东京 目黑",
      bio: "经常交换门店预约体验。",
      signature: "下次约到再发你",
      sortKey: "emi",
      profileKind: "person",
      source: "群聊添加",
      tags: ["朋友", "日语"],
      userIdLabel: customers[5]?.systemId ?? "U1015"
    }),
    createUser({
      id: "im-friend-fiona",
      accountId: "acc-fiona",
      nickname: "Fiona Wang",
      avatar: customers[6]?.avatar ?? imageBank.pet,
      region: "东京 世田谷",
      bio: "最近刚一起约过上门护理。",
      signature: "有新店告诉我",
      sortKey: "fiona wang",
      profileKind: "person",
      source: "手机号搜索",
      tags: ["朋友", "护理"],
      userIdLabel: customers[6]?.systemId ?? "U1016"
    }),
    createUser({
      id: "im-tech-2",
      accountId: "acc-tech-2",
      nickname: technicians[1]?.name ?? "田中 翔太",
      avatar: technicians[1]?.avatar ?? imageBank.cleaning,
      region: "东京 港区",
      bio: technicians[1]?.bio ?? "空调清洗和修水管维修响应很快。",
      signature: "今天晚间仍可接单",
      sortKey: "tanaka shouta",
      profileKind: "technician",
      source: "服务后联系",
      tags: ["技师", "空调清洗"],
      userIdLabel: technicians[1]?.systemId ?? "B0002"
    }),
    createUser({
      id: "im-store-2",
      accountId: "acc-store-2",
      nickname: stores[1]?.name ?? "Shibuya Nail Atelier",
      avatar: stores[1]?.cover ?? imageBank.nail,
      region: stores[1]?.area ?? "涩谷",
      bio: stores[1]?.description ?? "门店活动和改期确认会从这里发出。",
      signature: "预约确认请看店铺公告",
      sortKey: "shibuya nail atelier",
      profileKind: "store",
      source: "最近预约门店",
      tags: ["店铺", "收藏"],
      userIdLabel: stores[1]?.systemId ?? "S0002"
    }),
    createUser({
      id: "im-service-feed",
      accountId: "acc-feed",
      nickname: "售后顾问",
      avatar: imageBank.moving,
      region: "平台回访中心",
      bio: "处理评价、回访和售后升级。",
      signature: "有问题可以直接回我",
      sortKey: "shouhou guwen",
      profileKind: "service",
      source: "系统服务账号",
      tags: ["服务号", "售后"],
      userIdLabel: "SV0036",
      serviceAccount: true
    }),
    createUser({
      id: "im-blocked-1",
      accountId: "acc-blocked-1",
      nickname: "深夜营销号",
      avatar: imageBank.restaurant,
      region: "未知",
      bio: "多次群发无关广告。",
      signature: "广告推广",
      sortKey: "shenye yingxiaohao",
      profileKind: "service",
      source: "陌生人会话",
      tags: ["黑名单"],
      userIdLabel: "BK1001",
      serviceAccount: true
    }),
    createUser({
      id: "im-request-riko",
      accountId: "acc-request-riko",
      nickname: "高桥 莉子",
      avatar: technicians[3]?.avatar ?? technicians[0]?.avatar ?? imageBank.massage,
      region: "东京 六本木",
      bio: "最近想建立常用联系的技师。",
      signature: "如果需要可直接找我",
      sortKey: "takahashi riko",
      profileKind: "technician",
      source: "最近预约",
      tags: ["技师", "新朋友"],
      userIdLabel: "B0191"
    }),
    createUser({
      id: "im-request-luna",
      accountId: "acc-request-luna",
      nickname: "Luna Park",
      avatar: customers[7]?.avatar ?? imageBank.salon,
      region: "东京 表参道",
      bio: "群聊里互动过，想单独加你。",
      signature: "上次谢谢推荐",
      sortKey: "luna park",
      profileKind: "person",
      source: "群聊添加",
      tags: ["新朋友"],
      userIdLabel: "U1090"
    }),
    createUser({
      id: "im-request-mercury",
      accountId: "acc-request-mercury",
      nickname: "Mercury Lab",
      avatar: stores[2]?.cover ?? imageBank.home,
      region: "东京 中央区",
      bio: "刚收藏你的店铺并发来联系申请。",
      signature: "欢迎随时沟通档期",
      sortKey: "mercury lab",
      profileKind: "store",
      source: "系统推荐",
      tags: ["新朋友", "店铺"],
      userIdLabel: "S0102"
    })
  ];

  const contacts: ContactRelation[] = [
    createContact({
      id: "contact-tech-1",
      ownerUserId: selfUserId,
      targetUserId: "im-tech-1",
      relationStatus: "active",
      source: "门店预约后添加",
      remarkName: "今日预约担当",
      tags: ["技师", "肩颈调理", "中文 OK"],
      isStarred: true,
      isBlocked: false,
      description: "最近预约与售后沟通都在这里。"
    }),
    createContact({
      id: "contact-store-1",
      ownerUserId: selfUserId,
      targetUserId: "im-store-1",
      relationStatus: "active",
      source: "收藏门店",
      remarkName: "最近预约门店",
      tags: ["店铺", "收藏"],
      isStarred: true,
      isBlocked: false,
      description: "最近预约和服务确认。"
    }),
    createContact({
      id: "contact-support",
      ownerUserId: selfUserId,
      targetUserId: "im-support",
      relationStatus: "active",
      source: "官方服务号",
      tags: ["服务号", "官方"],
      isStarred: true,
      isBlocked: false,
      description: "退款、改期和投诉处理。"
    }),
    createContact({
      id: IM_ASSISTANT_CONTACT_ID,
      ownerUserId: selfUserId,
      targetUserId: IM_ASSISTANT_USER_ID,
      relationStatus: "active",
      source: "系统服务账号",
      tags: ["服务号", "聊天测试", "AI 助理"],
      isStarred: true,
      isBlocked: false,
      description: "专门用于聊天联调，发闲聊、改期、问价、图片都能继续接。"
    }),
    createContact({
      id: "contact-amy",
      ownerUserId: selfUserId,
      targetUserId: "im-friend-amy",
      relationStatus: "active",
      source: "手机号搜索",
      tags: ["朋友", "英语"],
      isStarred: false,
      isBlocked: false,
      description: "最近常一起约门店。"
    }),
    createContact({
      id: "contact-brian",
      ownerUserId: selfUserId,
      targetUserId: "im-friend-brian",
      relationStatus: "active",
      source: "群聊添加",
      tags: ["朋友", "拼单"],
      isStarred: false,
      isBlocked: false,
      description: "一起拼单过两次。"
    }),
    createContact({
      id: "contact-coco",
      ownerUserId: selfUserId,
      targetUserId: "im-friend-coco",
      relationStatus: "active",
      source: "系统推荐",
      tags: ["朋友", "中文"],
      isStarred: false,
      isBlocked: false,
      description: "经常分享技师。"
    }),
    createContact({
      id: "contact-daisuke",
      ownerUserId: selfUserId,
      targetUserId: "im-friend-daisuke",
      relationStatus: "active",
      source: "扫码添加",
      tags: ["朋友", "维修"],
      isStarred: false,
      isBlocked: false,
      description: "会一起约保洁和维修。"
    }),
    createContact({
      id: "contact-emi",
      ownerUserId: selfUserId,
      targetUserId: "im-friend-emi",
      relationStatus: "active",
      source: "群聊添加",
      tags: ["朋友", "日语"],
      isStarred: false,
      isBlocked: false,
      description: "经常交换门店信息。"
    }),
    createContact({
      id: "contact-fiona",
      ownerUserId: selfUserId,
      targetUserId: "im-friend-fiona",
      relationStatus: "active",
      source: "手机号搜索",
      tags: ["朋友", "护理"],
      isStarred: false,
      isBlocked: false,
      description: "最近一起约上门护理。"
    }),
    createContact({
      id: "contact-tech-2",
      ownerUserId: selfUserId,
      targetUserId: "im-tech-2",
      relationStatus: "active",
      source: "服务完成后联系",
      tags: ["技师", "空调清洗"],
      isStarred: false,
      isBlocked: false,
      description: "偶尔联系的维修技师。"
    }),
    createContact({
      id: "contact-store-2",
      ownerUserId: selfUserId,
      targetUserId: "im-store-2",
      relationStatus: "active",
      source: "最近预约门店",
      tags: ["店铺"],
      isStarred: false,
      isBlocked: false,
      description: "最近体验过的美甲门店。"
    }),
    createContact({
      id: "contact-service-feed",
      ownerUserId: selfUserId,
      targetUserId: "im-service-feed",
      relationStatus: "active",
      source: "系统服务账号",
      tags: ["服务号", "售后"],
      isStarred: false,
      isBlocked: false,
      description: "售后回访与评价提醒。"
    }),
    createContact({
      id: "contact-blocked-1",
      ownerUserId: selfUserId,
      targetUserId: "im-blocked-1",
      relationStatus: "active",
      source: "陌生人会话",
      tags: ["黑名单"],
      isStarred: false,
      isBlocked: true,
      description: "营销骚扰，已加入黑名单。"
    })
  ];

  const friendRequests: FriendRequest[] = [
    createFriendRequest({
      id: "request-riko",
      fromUserId: "im-request-riko",
      toUserId: selfUserId,
      source: "最近预约",
      requestMessage: "这边后续如果要约我的档期，可以直接在这里说。",
      status: "pending",
      createdAt: atHoursAgo(2)
    }),
    createFriendRequest({
      id: "request-luna",
      fromUserId: "im-request-luna",
      toUserId: selfUserId,
      source: "群聊添加",
      requestMessage: "上次群里你发的门店清单很有用，想继续交流。",
      status: "pending",
      createdAt: atHoursAgo(8)
    }),
    createFriendRequest({
      id: "request-mercury",
      fromUserId: "im-request-mercury",
      toUserId: selfUserId,
      source: "系统推荐",
      requestMessage: "想和你建立常用联系，方便后续发送门店活动。",
      status: "pending",
      createdAt: atDaysAgo(1)
    }),
    createFriendRequest({
      id: "request-old-accepted",
      fromUserId: "im-friend-fiona",
      toUserId: selfUserId,
      source: "手机号搜索",
      requestMessage: "上次一起约护理，方便继续联系。",
      status: "accepted",
      createdAt: atDaysAgo(3),
      handledAt: atDaysAgo(3)
    }),
    createFriendRequest({
      id: "request-old-rejected",
      fromUserId: "im-blocked-1",
      toUserId: selfUserId,
      source: "陌生人会话",
      requestMessage: "加个好友，给你发最新活动。",
      status: "rejected",
      createdAt: atDaysAgo(5),
      handledAt: atDaysAgo(5)
    })
  ];

  const conversations: Conversation[] = [
    createConversation({
      id: "conversation-tech-1",
      type: "single",
      title: "佐藤 美咲",
      avatar: technicians[0]?.avatar ?? imageBank.massage,
      memberIds: [selfUserId, "im-tech-1"],
      contactUserId: "im-tech-1",
      unreadCount: 2,
      isPinned: true,
      mentionMe: false
    }),
    createConversation({
      id: "conversation-store-1",
      type: "single",
      title: stores[0]?.name ?? "GINZA Calm Body Lab",
      avatar: stores[0]?.cover ?? imageBank.salon,
      memberIds: [selfUserId, "im-store-1"],
      contactUserId: "im-store-1",
      unreadCount: 0,
      draftText: "我周六想改到 18:30，可以吗？",
      draftUpdatedAt: atMinutesAgo(18)
    }),
    createConversation({
      id: "conversation-support",
      type: "system",
      title: "NeeDo 客服",
      avatar: imageBank.home,
      memberIds: [selfUserId, "im-support"],
      contactUserId: "im-support",
      unreadCount: 1,
      isPinned: true,
      isMuted: false
    }),
    createConversation({
      id: "conversation-group-life",
      type: "group",
      title: "东京生活服务沟通群",
      avatar: imageBank.restaurant,
      memberIds: [selfUserId, "im-friend-amy", "im-friend-coco", "im-tech-1", "im-store-1"],
      unreadCount: 6,
      mentionMe: true,
      announcement: "群里主要同步门店、技师和近期优惠信息。",
      nicknameInGroup: selfDisplayName
    }),
    createConversation({
      id: "conversation-amy",
      type: "single",
      title: "Amy Chen",
      avatar: customers[1]?.avatar ?? imageBank.cafe,
      memberIds: [selfUserId, "im-friend-amy"],
      contactUserId: "im-friend-amy",
      unreadCount: 0,
      isMuted: true
    }),
    createConversation({
      id: "conversation-brian",
      type: "single",
      title: "Brian Lee",
      avatar: customers[2]?.avatar ?? imageBank.restaurant,
      memberIds: [selfUserId, "im-friend-brian"],
      contactUserId: "im-friend-brian",
      unreadCount: 1
    }),
    createConversation({
      id: "conversation-coco",
      type: "single",
      title: "陈可可",
      avatar: customers[3]?.avatar ?? imageBank.nail,
      memberIds: [selfUserId, "im-friend-coco"],
      contactUserId: "im-friend-coco",
      unreadCount: 1
    }),
    createConversation({
      id: "conversation-daisuke",
      type: "single",
      title: "大辅",
      avatar: customers[4]?.avatar ?? imageBank.repair,
      memberIds: [selfUserId, "im-friend-daisuke"],
      contactUserId: "im-friend-daisuke",
      unreadCount: 0
    }),
    createConversation({
      id: "conversation-emi",
      type: "single",
      title: "えみ",
      avatar: customers[5]?.avatar ?? imageBank.salon,
      memberIds: [selfUserId, "im-friend-emi"],
      contactUserId: "im-friend-emi",
      unreadCount: 0
    }),
    createConversation({
      id: "conversation-fiona",
      type: "single",
      title: "Fiona Wang",
      avatar: customers[6]?.avatar ?? imageBank.pet,
      memberIds: [selfUserId, "im-friend-fiona"],
      contactUserId: "im-friend-fiona",
      unreadCount: 0
    }),
    createConversation({
      id: "conversation-service-feed",
      type: "system",
      title: "售后顾问",
      avatar: imageBank.moving,
      memberIds: [selfUserId, "im-service-feed"],
      contactUserId: "im-service-feed",
      unreadCount: 1
    }),
    createConversation({
      id: IM_ASSISTANT_CONVERSATION_ID,
      type: "system",
      title: "小咚 AI 助理",
      avatar: imageBank.cafe,
      memberIds: [selfUserId, IM_ASSISTANT_USER_ID],
      contactUserId: IM_ASSISTANT_USER_ID,
      unreadCount: 1,
      isPinned: true
    }),
    createConversation({
      id: "conversation-tech-2",
      type: "single",
      title: technicians[1]?.name ?? "田中 翔太",
      avatar: technicians[1]?.avatar ?? imageBank.cleaning,
      memberIds: [selfUserId, "im-tech-2"],
      contactUserId: "im-tech-2",
      unreadCount: 0
    }),
    createConversation({
      id: "conversation-store-2",
      type: "single",
      title: stores[1]?.name ?? "Shibuya Nail Atelier",
      avatar: stores[1]?.cover ?? imageBank.nail,
      memberIds: [selfUserId, "im-store-2"],
      contactUserId: "im-store-2",
      unreadCount: 0
    }),
    createConversation({
      id: "conversation-non-owner-test",
      type: "group",
      title: "非群主权限测试群",
      avatar: imageBank.cafe,
      memberIds: ["im-friend-amy", selfUserId, "im-friend-brian", "im-friend-coco"],
      unreadCount: 2,
      announcement: "这个群用于测试普通成员视角，群名和公告默认只有群主可编辑。",
      nicknameInGroup: "NeeDo 用户",
      titleEditPolicy: "owner",
      announcementEditPolicy: "owner"
    })
  ];

  const members: ConversationMember[] = conversations.flatMap((conversation) =>
    conversation.memberIds.map((userId, index) =>
      createMember({
        id: nextId("member"),
        conversationId: conversation.id,
        userId,
        role: conversation.type === "group" && index === 0 ? "owner" : "member",
        nicknameInGroup: conversation.type === "group" ? getUserById({ users }, userId)?.nickname : undefined
      })
    )
  );

  const messages: ConversationMessage[] = [
    createMessage({
      conversationId: "conversation-tech-1",
      senderId: "im-tech-1",
      type: "text",
      content: "明天 17:30 的到店预约我这边已经预留好了。",
      sentAt: atHoursAgo(5)
    }),
    createMessage({
      conversationId: "conversation-tech-1",
      senderId: selfUserId,
      type: "text",
      content: "好的，我会提前 10 分钟到。",
      sentAt: atHoursAgo(4.8)
    }),
    createMessage({
      conversationId: "conversation-tech-1",
      senderId: "im-tech-1",
      type: "location",
      content: "门店位置",
      sentAt: atHoursAgo(4.7),
      ext: {
        location: {
          title: "GINZA Calm Body Lab",
          address: "东京都中央区银座 4-2-11",
          latitude: 35.6721,
          longitude: 139.7649
        }
      }
    }),
    createMessage({
      conversationId: "conversation-tech-1",
      senderId: "im-tech-1",
      type: "voice",
      content: "https://example.com/audio/voice-1.m4a",
      sentAt: atMinutesAgo(28),
      ext: {
        duration: 12,
        fileName: "voice-1.m4a",
        fileSize: 182_000,
        mimeType: "audio/mp4",
        url: "https://example.com/audio/voice-1.m4a"
      }
    }),
    createMessage({
      conversationId: "conversation-tech-1",
      senderId: "im-tech-1",
      type: "text",
      content: "如果需要改时间，直接在这里跟我说。",
      sentAt: atMinutesAgo(8)
    }),
    createMessage({
      conversationId: "conversation-store-1",
      senderId: "im-store-1",
      type: "system",
      content: "订单已确认，门店将在服务开始前 30 分钟再次提醒。",
      sentAt: atHoursAgo(12)
    }),
    createMessage({
      conversationId: "conversation-store-1",
      senderId: selfUserId,
      type: "image",
      content: imageBank.massageAlt,
      sentAt: atHoursAgo(11.5),
      ext: {
        width: 456,
        height: 260,
        fileName: "style-ref.jpg",
        fileSize: 420_000,
        mimeType: "image/jpeg",
        url: imageBank.massageAlt,
        thumbnailUrl: imageBank.massageAlt
      }
    }),
    createMessage({
      conversationId: "conversation-store-1",
      senderId: "im-store-1",
      type: "file",
      content: "https://example.com/files/pre-booking-guide.pdf",
      sentAt: atHoursAgo(11.2),
      ext: {
        fileName: "到店前说明.pdf",
        fileSize: 1_820_000,
        mimeType: "application/pdf",
        url: "https://example.com/files/pre-booking-guide.pdf"
      }
    }),
    createMessage({
      conversationId: "conversation-support",
      senderId: selfUserId,
      type: "text",
      content: "这笔订单我想改期到下周一。",
      sentAt: atHoursAgo(7)
    }),
    createMessage({
      conversationId: "conversation-support",
      senderId: "im-support",
      type: "text",
      content: "可以的，我先帮你确认门店的新空档。",
      sentAt: atHoursAgo(6.8)
    }),
    createMessage({
      conversationId: "conversation-support",
      senderId: "im-support",
      type: "text",
      content: "门店刚刚回复，周一 15:00 和 18:00 都可以。",
      sentAt: atMinutesAgo(16)
    }),
    createMessage({
      conversationId: "conversation-group-life",
      senderId: "im-friend-coco",
      type: "text",
      content: "我这周试了银座那家门店，肩颈放松不错。",
      sentAt: atHoursAgo(26),
      ext: {
        groupSenderName: "陈可可"
      }
    }),
    createMessage({
      conversationId: "conversation-group-life",
      senderId: "im-tech-1",
      type: "image",
      content: imageBank.massage,
      sentAt: atHoursAgo(24),
      ext: {
        width: 2520,
        height: 1500,
        fileName: "room.webp",
        fileSize: 512_000,
        mimeType: "image/webp",
        url: imageBank.massage,
        thumbnailUrl: imageBank.massageAlt,
        groupSenderName: "佐藤 美咲"
      }
    }),
    createMessage({
      conversationId: "conversation-group-life",
      senderId: "im-store-1",
      type: "text",
      content: `@${selfDisplayName} 周末档期刚放出来了，要不要先锁一个时段？`,
      sentAt: atHoursAgo(6),
      ext: {
        mentions: [selfUserId],
        groupSenderName: stores[0]?.name ?? "GINZA Calm Body Lab"
      }
    }),
    createMessage({
      conversationId: "conversation-group-life",
      senderId: selfUserId,
      type: "emoji",
      content: "👌",
      sentAt: atHoursAgo(5.8),
      ext: {
        groupSenderName: selfDisplayName
      }
    }),
    createMessage({
      conversationId: "conversation-group-life",
      senderId: "im-friend-amy",
      type: "text",
      content: "我也想约，下班后一起过去。",
      sentAt: atMinutesAgo(11),
      ext: {
        groupSenderName: "Amy Chen"
      }
    }),
    createMessage({
      conversationId: "conversation-amy",
      senderId: "im-friend-amy",
      type: "text",
      content: "上次你发的那家店我也收藏了。",
      sentAt: atDaysAgo(1.2)
    }),
    createMessage({
      conversationId: "conversation-amy",
      senderId: selfUserId,
      type: "contact-card",
      content: "推荐联系人",
      sentAt: atDaysAgo(1.19),
      ext: {
        contactCard: {
          userId: "im-tech-1",
          displayName: technicians[0]?.name ?? "佐藤 美咲",
          avatar: technicians[0]?.avatar ?? imageBank.massage,
          profileKind: "technician"
        }
      }
    }),
    createMessage({
      conversationId: "conversation-brian",
      senderId: "im-friend-brian",
      type: "text",
      content: "我看你上次收藏的那家店这周末还有双人档，要不要一起去？",
      sentAt: atHoursAgo(18)
    }),
    createMessage({
      conversationId: "conversation-coco",
      senderId: "im-friend-coco",
      type: "text",
      content: "我整理了三个比较稳的技师，如果你要测试问价或改期，我也可以陪你顺着聊。",
      sentAt: atHoursAgo(10)
    }),
    createMessage({
      conversationId: "conversation-daisuke",
      senderId: "im-friend-daisuke",
      type: "text",
      content: "周末如果你还要约保洁或者空调，我这边可以一起帮你拼个时段。",
      sentAt: atHoursAgo(20)
    }),
    createMessage({
      conversationId: "conversation-emi",
      senderId: "im-friend-emi",
      type: "text",
      content: "目黑那家店我这周去过，环境比上次更好了，你要不要听听体验？",
      sentAt: atHoursAgo(14)
    }),
    createMessage({
      conversationId: "conversation-fiona",
      senderId: "im-friend-fiona",
      type: "text",
      content: "我刚看到一家新的上门护理店，感觉挺适合你，下次要不要一起研究下？",
      sentAt: atHoursAgo(9)
    }),
    createMessage({
      id: IM_ASSISTANT_WELCOME_MESSAGE_ID,
      conversationId: IM_ASSISTANT_CONVERSATION_ID,
      senderId: IM_ASSISTANT_USER_ID,
      type: "system",
      content: "你的订单将在明天 15:00 自动提醒到店。",
      sentAt: atDaysAgo(2)
    }),
    createMessage({
      id: IM_ASSISTANT_GUIDE_MESSAGE_ID,
      conversationId: IM_ASSISTANT_CONVERSATION_ID,
      senderId: IM_ASSISTANT_USER_ID,
      type: "text",
      content: "我现在会尽量按上下文接话。你随便发一句试试，闲聊、改期、问价、发图我都能继续往下聊。",
      sentAt: atMinutesAgo(6)
    }),
    createMessage({
      conversationId: "conversation-tech-2",
      senderId: selfUserId,
      type: "text",
      content: "上次空调清洗的报价单我这边收到了。",
      sentAt: atDaysAgo(4)
    }),
    createMessage({
      conversationId: "conversation-tech-2",
      senderId: "im-tech-2",
      type: "recalled",
      content: "",
      sentAt: atDaysAgo(4),
      recalledAt: atDaysAgo(4)
    }),
    createMessage({
      conversationId: "conversation-store-2",
      senderId: "im-store-2",
      type: "video",
      content: "https://example.com/videos/salon.mp4",
      sentAt: atDaysAgo(6),
      ext: {
        width: 720,
        height: 960,
        duration: 18,
        fileName: "salon.mp4",
        fileSize: 2_480_000,
        mimeType: "video/mp4",
        url: "https://example.com/videos/salon.mp4",
        thumbnailUrl: imageBank.cleaningPortrait
      }
    }),
    createMessage({
      conversationId: "conversation-service-feed",
      senderId: "im-service-feed",
      type: "text",
      content: "这边是售后回访号，如果你想测试投诉、回访、改评这些对话，也可以直接和我聊。",
      sentAt: atHoursAgo(3)
    }),
    createMessage({
      conversationId: "conversation-non-owner-test",
      senderId: "im-friend-amy",
      type: "text",
      content: "我建了一个测试群，你现在是普通成员，可以试试群资料权限。",
      sentAt: atHoursAgo(2.4),
      ext: {
        groupSenderName: "Amy Chen"
      }
    }),
    createMessage({
      conversationId: "conversation-non-owner-test",
      senderId: selfUserId,
      type: "text",
      content: "好，我来确认非群主视角。",
      sentAt: atHoursAgo(2.2),
      ext: {
        groupSenderName: "NeeDo 用户"
      }
    }),
    createMessage({
      conversationId: "conversation-non-owner-test",
      senderId: "im-friend-brian",
      type: "text",
      content: "群名和公告先让 Amy 控制，你可以只改自己的群昵称。",
      sentAt: atMinutesAgo(34),
      ext: {
        groupSenderName: "Brian Lee"
      }
    })
  ];

  const attachments = messages
    .filter((message) => message.type === "image" || message.type === "video" || message.type === "file" || message.type === "voice")
    .map((message) =>
      createAttachment({
        messageId: message.id,
        fileName: message.ext?.fileName ?? `${message.type}-${message.id}`,
        mimeType: message.ext?.mimeType ?? "application/octet-stream",
        fileSize: message.ext?.fileSize ?? 0,
        url: message.ext?.url ?? message.content,
        thumbnailUrl: message.ext?.thumbnailUrl,
        duration: message.ext?.duration,
        width: message.ext?.width,
        height: message.ext?.height
      })
    );

  const readCursors: ReadCursor[] = conversations.map((conversation) => ({
    id: nextId("cursor"),
    conversationId: conversation.id,
    userId: selfUserId,
    lastReadMessageId: getMessagesForConversation({ messages }, conversation.id).at(-1)?.id,
    lastReadAt: atHoursAgo(1)
  }));

  const database: ImDatabase = {
    currentUserId: selfUserId,
    config: {
      allowStrangerMessaging: true,
      preserveConversationAfterDelete: true,
      syncDraftAcrossDevices: false,
      recallWindowMs: 2 * 60_000,
      separatorThresholdMs: 5 * 60_000
    },
    users,
    contacts,
    friendRequests,
    conversations,
    members,
    messages,
    attachments,
    readCursors,
    messageCampaigns: [],
    messageCampaignRecipients: []
  };

  database.conversations.forEach((conversation) => {
    recomputeConversationSummary(database, conversation.id);
  });

  const summaryOverrides: Record<string, Partial<Conversation>> = {
    "conversation-tech-1": { unreadCount: 2, isPinned: true },
    "conversation-store-1": { draftText: "我周六想改到 18:30，可以吗？", draftUpdatedAt: atMinutesAgo(18) },
    "conversation-support": { unreadCount: 1, isPinned: true },
    "conversation-group-life": { unreadCount: 6, mentionMe: true },
    "conversation-non-owner-test": { unreadCount: 2 },
    "conversation-brian": { unreadCount: 1 },
    "conversation-coco": { unreadCount: 1 },
    "conversation-service-feed": { unreadCount: 1 },
    [IM_ASSISTANT_CONVERSATION_ID]: { unreadCount: 1, isPinned: true },
    "conversation-amy": { isMuted: true }
  };

  database.conversations = database.conversations.map((conversation) => ({
    ...conversation,
    ...summaryOverrides[conversation.id]
  }));

  return database;
}
