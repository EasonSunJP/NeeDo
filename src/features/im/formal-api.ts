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
  type RealtimeTechnicianContactDetails,
} from "../realtime/api";
import type { ImApi } from "./contract";
import { buildConversationLastMessageSummary } from "./model";
import type {
  ContactRelation,
  Conversation,
  ConversationMember,
  ConversationMessage,
  CreateConversationPrivacyOptions,
  DirectoryProfile,
  FriendRequest,
  ImBootstrapPayload,
  ImContactCardCandidate,
  ImMessageType,
  ImProfileKind,
  ImStoreUpdate,
  ImRoleType,
  ImUser,
  MessageExt,
  TechnicianContactDetails,
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
const prismaIntMax = 2_147_483_647;

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
  "social-post-card",
  "schedule-invite",
  "chat-record",
  "system",
  "recalled",
]);

function featureUnavailable(): never {
  throw new Error("error.feature_unavailable");
}

function toNumericId(id: string) {
  if (!/^[1-9]\d*$/.test(id)) throw new Error("error.validation.invalid_id");
  const value = Number(id);

  if (!Number.isSafeInteger(value) || value <= 0 || value > prismaIntMax) {
    throw new Error("error.validation.invalid_id");
  }

  return value;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const checksumPattern = /^[0-9a-f]{64}$/;
function assertUuid(value: string) { if (!uuidPattern.test(value)) throw new Error("error.validation.invalid_uuid"); return value; }
function assertChecksum(value: string) { if (!checksumPattern.test(value)) throw new Error("error.validation.invalid_checksum"); return value; }
function toStringId(value: number) { if (!Number.isSafeInteger(value) || value <= 0 || value > prismaIntMax) throw new Error("error.response.invalid_id"); return String(value); }
function positive(value: number, max?: number) { if (!Number.isSafeInteger(value) || value <= 0 || (max !== undefined && value > max)) throw new Error("error.validation.invalid_id"); return value; }

const invalidChatRecord = (): never => { throw new Error("error.response.invalid_chat_record"); };
function exactRecord(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidChatRecord();
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) invalidChatRecord();
  return record;
}
function boundedString(value: unknown, minimum: number, maximum: number): string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum) invalidChatRecord();
  return value as string;
}
function responseInteger(value: unknown, minimum: number, maximum = prismaIntMax): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) invalidChatRecord();
  return value as number;
}
function isoDate(value: unknown): string {
  const text = boundedString(value, 1, 64);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/u.exec(text);
  if (!match) return invalidChatRecord();
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offsetHourText, offsetMinuteText] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  if (year === 0 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59 || (offsetHourText !== undefined && (Number(offsetHourText) > 23 || Number(offsetMinuteText) > 59))) invalidChatRecord();
  const calendar = new Date(0);
  calendar.setUTCHours(hour, minute, second, 0);
  calendar.setUTCFullYear(year, month - 1, day);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || calendar.getUTCHours() !== hour || calendar.getUTCMinutes() !== minute || calendar.getUTCSeconds() !== second) invalidChatRecord();
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().length === 0) invalidChatRecord();
  return text;
}

function readMetadata(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

const invalidContactCard = (): never => {
  throw new Error("error.response.invalid_contact_card");
};

function contactCardRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return invalidContactCard();
  }
  return value as Record<string, unknown>;
}

function exactContactCardRecord(value: unknown, keys: readonly string[]) {
  const record = contactCardRecord(value);
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    return invalidContactCard();
  }
  return record;
}

function contactCardString(value: unknown, maximum: number) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maximum
  ) {
    return invalidContactCard();
  }
  return value;
}

function isSafeContactCardUrl(value: string) {
  return /^(?:https?:\/\/[^\s]+|\/(?!\/)[^\s]*)$/iu.test(value);
}

function optionalLegacyContactCardString(value: unknown, maximum: number) {
  return typeof value === "string" && value.length <= maximum ? value : undefined;
}

function parseLegacyContactCardMetadata(metadata: Record<string, unknown>): MessageExt {
  if (metadata.needoMessageType !== "contact-card") return invalidContactCard();
  const extension = contactCardRecord(metadata.needoMessageExt);
  const card = contactCardRecord(extension.contactCard);
  const userId = contactCardString(card.userId, 191);
  const displayName = contactCardString(card.displayName, 160);
  const profileKind = card.profileKind;
  if (
    profileKind !== "person" &&
    profileKind !== "technician" &&
    profileKind !== "store" &&
    profileKind !== "service"
  ) {
    return invalidContactCard();
  }
  const rawAvatar = optionalLegacyContactCardString(card.avatar, 2_048);
  const avatar = rawAvatar && isSafeContactCardUrl(rawAvatar) ? rawAvatar : "";
  const entityType = card.entityType;
  const safeEntityType =
    entityType === "user" || entityType === "technician" || entityType === "shop"
      ? entityType
      : undefined;

  return {
    contactCard: {
      userId,
      displayName,
      avatar,
      profileKind,
      ...(safeEntityType ? { entityType: safeEntityType } : {}),
      ...(optionalLegacyContactCardString(card.entityId, 191) !== undefined
        ? { entityId: optionalLegacyContactCardString(card.entityId, 191) }
        : {}),
      ...(optionalLegacyContactCardString(card.userIdLabel, 160) !== undefined
        ? { userIdLabel: optionalLegacyContactCardString(card.userIdLabel, 160) }
        : {}),
      ...(optionalLegacyContactCardString(card.headline, 500) !== undefined
        ? { headline: optionalLegacyContactCardString(card.headline, 500) }
        : {})
    }
  };
}

function parseV2ContactCardMetadata(metadata: Record<string, unknown>): MessageExt {
  const snapshot = exactContactCardRecord(metadata, [
    "snapshotVersion",
    "type",
    "contactCard"
  ]);
  if (snapshot.snapshotVersion !== 2 || snapshot.type !== "contact-card") {
    return invalidContactCard();
  }
  const card = exactContactCardRecord(snapshot.contactCard, [
    "targetUserPublicId",
    "needoId",
    "nickname",
    "avatarUrl",
    "entityKind",
    "ekycVerified",
    "level",
    "bio",
    "tierCode",
    "themeVersionPublicId",
    "simpleTopColor",
    "simpleBottomColor"
  ]);
  const targetUserPublicId = contactCardString(card.targetUserPublicId, 191);
  const needoId = contactCardString(card.needoId, 160);
  const nickname = contactCardString(card.nickname, 160);
  const avatarUrl = card.avatarUrl;
  if (
    avatarUrl !== null &&
    (typeof avatarUrl !== "string" ||
      avatarUrl.length > 2_048 ||
      !isSafeContactCardUrl(avatarUrl))
  ) {
    return invalidContactCard();
  }
  const entityKind = card.entityKind;
  if (
    entityKind !== "customer" &&
    entityKind !== "technician" &&
    entityKind !== "shop" &&
    entityKind !== "service"
  ) {
    return invalidContactCard();
  }
  if (typeof card.ekycVerified !== "boolean") return invalidContactCard();
  if (
    card.level !== null &&
    (typeof card.level !== "number" ||
      !Number.isInteger(card.level) ||
      card.level < 1 ||
      card.level > 100)
  ) {
    return invalidContactCard();
  }
  if (card.bio !== null && (typeof card.bio !== "string" || card.bio.length > 500)) {
    return invalidContactCard();
  }
  const tierCode = card.tierCode;
  if (
    tierCode !== null &&
    tierCode !== "free" &&
    tierCode !== "silver" &&
    tierCode !== "gold" &&
    tierCode !== "black_diamond"
  ) {
    return invalidContactCard();
  }
  if (
    card.themeVersionPublicId !== null &&
    (typeof card.themeVersionPublicId !== "string" ||
      card.themeVersionPublicId.trim().length === 0 ||
      card.themeVersionPublicId.length > 191)
  ) {
    return invalidContactCard();
  }
  for (const color of [card.simpleTopColor, card.simpleBottomColor]) {
    if (color !== null && (typeof color !== "string" || !/^#[0-9a-f]{6}$/iu.test(color))) {
      return invalidContactCard();
    }
  }
  const profileKind =
    entityKind === "customer"
      ? "person"
      : entityKind === "shop"
        ? "store"
        : entityKind;
  const entityType =
    entityKind === "customer"
      ? "user"
      : entityKind === "technician" || entityKind === "shop"
        ? entityKind
        : undefined;

  return {
    contactCard: {
      snapshotVersion: 2,
      userId: targetUserPublicId,
      needoId,
      displayName: nickname,
      avatar: avatarUrl ?? "",
      profileKind,
      ...(entityType ? { entityType } : {}),
      userIdLabel: needoId,
      ...(card.bio === null ? {} : { headline: card.bio }),
      entityKind,
      ekycVerified: card.ekycVerified,
      level: card.level as number | null,
      tierCode,
      themeVersionPublicId: card.themeVersionPublicId as string | null,
      simpleTopColor: card.simpleTopColor as string | null,
      simpleBottomColor: card.simpleBottomColor as string | null
    }
  };
}

function toContactCardMessageExt(metadata: Record<string, unknown>): MessageExt {
  return metadata.snapshotVersion === 2 || metadata.type === "contact-card"
    ? parseV2ContactCardMetadata(metadata)
    : parseLegacyContactCardMetadata(metadata);
}

function toContactCardCandidate(value: unknown): ImContactCardCandidate {
  const candidate = exactContactCardRecord(value, [
    "targetUserId",
    "needoId",
    "nickname",
    "avatarUrl",
    "relationship"
  ]);
  const targetUserId = contactCardString(candidate.targetUserId, 160);
  const needoId = contactCardString(candidate.needoId, 160);
  if (!/^u[0-9]{10}$/u.test(targetUserId) || !/^u[0-9]{10}$/u.test(needoId)) {
    return invalidContactCard();
  }
  const nickname = contactCardString(candidate.nickname, 160);
  if (
    candidate.avatarUrl !== null &&
    (typeof candidate.avatarUrl !== "string" ||
      candidate.avatarUrl.length > 2_048 ||
      !isSafeContactCardUrl(candidate.avatarUrl))
  ) {
    return invalidContactCard();
  }
  if (candidate.relationship !== "self" && candidate.relationship !== "friend") {
    return invalidContactCard();
  }

  return {
    targetUserId,
    needoId,
    nickname,
    avatarUrl: candidate.avatarUrl as string | null,
    relationship: candidate.relationship
  };
}

function toContactCardCandidatePage(
  value: unknown,
  requestedPage: number,
  requestedPageSize: number
) {
  const page = exactContactCardRecord(value, ["list", "total", "page", "page_size"]);
  if (!Array.isArray(page.list)) return invalidContactCard();
  const total = responseInteger(page.total, 0);
  const pageNumber = responseInteger(page.page, 1);
  const pageSize = responseInteger(page.page_size, 1, 100);
  if (
    pageNumber !== requestedPage ||
    pageSize !== requestedPageSize ||
    page.list.length > pageSize ||
    page.list.length > total
  ) {
    return invalidContactCard();
  }
  return {
    list: page.list.map(toContactCardCandidate),
    total,
    page: pageNumber,
    page_size: pageSize
  };
}

function toChatRecordSummary(value: import("../realtime/api").RealtimeChatRecordSummary): import("./chat-records").ImChatRecordSummary {
  const summary = exactRecord(value, ["publicId", "title", "preview", "senderNames", "senderCount", "itemCount", "createdAt"]);
  if (typeof summary.publicId !== "string" || !uuidPattern.test(summary.publicId)) invalidChatRecord();
  if (!Array.isArray(summary.senderNames) || summary.senderNames.length < 1 || summary.senderNames.length > 100) invalidChatRecord();
  const senderNames = (summary.senderNames as unknown[]).map((name) => boundedString(name, 1, 120));
  const senderCount = responseInteger(summary.senderCount, 1, 100);
  if (senderCount !== senderNames.length) invalidChatRecord();
  return { publicId: summary.publicId as string, title: boundedString(summary.title, 1, 255), preview: boundedString(summary.preview, 0, 500), senderNames, senderCount, itemCount: responseInteger(summary.itemCount, 1, 100), createdAt: isoDate(summary.createdAt) };
}

function toChatRecordFavorite(favorite: import("../realtime/api").RealtimeChatRecordFavorite): import("./chat-records").ImChatRecordFavorite {
  const exact = exactRecord(favorite, ["id", "bundlePublicId", "title", "preview", "senderNames", "senderCount", "itemCount", "createdAt"]);
  const summary = toChatRecordSummary({ publicId: exact.bundlePublicId, title: exact.title, preview: exact.preview, senderNames: exact.senderNames, senderCount: exact.senderCount, itemCount: exact.itemCount, createdAt: exact.createdAt } as never);
  return { id: String(responseInteger(exact.id, 1)), bundlePublicId: summary.publicId, title: summary.title, preview: summary.preview, senderNames: summary.senderNames, senderCount: summary.senderCount, itemCount: summary.itemCount, createdAt: summary.createdAt };
}

function toChatRecordItem(value: import("../realtime/api").RealtimeChatRecordItem): import("./chat-records").ImChatRecordItem {
  const item = exactRecord(value, ["id", "position", "senderDisplayName", "senderAvatarUrl", "messageType", "content", "metadata", "sentAt"]);
  if (item.senderAvatarUrl !== null && (typeof item.senderAvatarUrl !== "string" || item.senderAvatarUrl.length > 2048)) invalidChatRecord();
  if (item.content !== null && (typeof item.content !== "string" || item.content.length > 4000)) invalidChatRecord();
  if (item.metadata !== null && (typeof item.metadata !== "object" || Array.isArray(item.metadata))) invalidChatRecord();
  return { id: String(responseInteger(item.id, 1)), position: responseInteger(item.position, 1, 100), senderDisplayName: boundedString(item.senderDisplayName, 1, 120), senderAvatarUrl: item.senderAvatarUrl as string | null, messageType: boundedString(item.messageType, 1, 64), content: item.content as string | null, metadata: item.metadata, sentAt: isoDate(item.sentAt) };
}

function rawChatRecordPage(value: unknown, withCursor: boolean) {
  const keys = ["list", "total", "page", "page_size", ...(withCursor ? ["nextCursor"] : [])];
  const page = exactRecord(value, keys);
  if (!Array.isArray(page.list)) invalidChatRecord();
  const list = page.list as unknown[];
  const pageSize = responseInteger(page.page_size, 1, 100);
  const total = responseInteger(page.total, 0);
  const pageNumber = responseInteger(page.page, 1);
  const nextCursor = withCursor ? page.nextCursor : undefined;
  return { list, total, page: pageNumber, page_size: pageSize, ...(withCursor ? { nextCursor: nextCursor as number | null } : {}) };
}

function chatRecordFavoritePage(value: unknown, requestedPage: number, requestedPageSize: number) {
  const page = rawChatRecordPage(value, false);
  const offset = (requestedPage - 1) * requestedPageSize;
  const expectedLength = Math.min(requestedPageSize, Math.max(page.total - offset, 0));
  if (page.page !== requestedPage || page.page_size !== requestedPageSize || page.list.length !== expectedLength) invalidChatRecord();
  return page;
}

function chatRecordItemPage(value: unknown, beforePosition: number | undefined, requestedPageSize: number) {
  const rawPage = rawChatRecordPage(value, true);
  const list = rawPage.list.map((item) => toChatRecordItem(item as import("../realtime/api").RealtimeChatRecordItem));
  const page = { ...rawPage, list };
  if (page.page_size !== requestedPageSize || (beforePosition === undefined && page.page !== 1) || list.length > requestedPageSize || list.length > page.total) invalidChatRecord();
  const positions = list.map((item) => item.position);
  if (positions.some((position, index) => (index > 0 && position <= positions[index - 1]) || (beforePosition !== undefined && position >= beforePosition))) invalidChatRecord();
  const minimumPosition = positions[0];
  if (beforePosition === undefined) {
    const expectedLength = Math.min(requestedPageSize, page.total);
    if (list.length !== expectedLength) invalidChatRecord();
    if (page.total > list.length) {
      if (minimumPosition === undefined || responseInteger(page.nextCursor, 1) !== minimumPosition) invalidChatRecord();
    } else if (page.nextCursor !== null) {
      invalidChatRecord();
    }
  } else if (list.length < requestedPageSize) {
    if (page.nextCursor !== null) invalidChatRecord();
  } else if (page.nextCursor !== null && (minimumPosition === undefined || responseInteger(page.nextCursor, 1) !== minimumPosition)) {
    invalidChatRecord();
  }
  return page;
}

function toRealtimeChatRecordCommand(command: import("./chat-records").ImChatRecordCommand) {
  assertUuid(command.idempotencyKey);
  const messageIds = command.messageIds.map(toNumericId);
  if (messageIds.length < 1 || messageIds.length > 100 || new Set(messageIds).size !== messageIds.length) throw new Error("error.validation.invalid_message_ids");
  return { idempotencyKey: command.idempotencyKey, messageIds, sourceConversationId: toNumericId(command.sourceConversationId) };
}

function parseChatRecordMessageMetadata(value: unknown) {
  const metadata = exactRecord(value, ["needoMessageType", "needoMessageExt"]);
  if (metadata.needoMessageType !== "chat-record") invalidChatRecord();
  const ext = exactRecord(metadata.needoMessageExt, ["bundlePublicId", "itemCount", "preview", "senderNames", "senderCount", "title", "titleKind"]);
  if (typeof ext.bundlePublicId !== "string" || !uuidPattern.test(ext.bundlePublicId)) invalidChatRecord();
  if (!Array.isArray(ext.senderNames) || ext.senderNames.length < 1 || ext.senderNames.length > 100) invalidChatRecord();
  const senderNames = (ext.senderNames as unknown[]).map((name) => boundedString(name, 1, 120));
  const senderCount = responseInteger(ext.senderCount, 1, 100);
  if (senderCount !== senderNames.length) invalidChatRecord();
  const titleKind = ext.titleKind as "single" | "pair" | "group";
  if (titleKind !== "single" && titleKind !== "pair" && titleKind !== "group") invalidChatRecord();
  return { chatRecord: { publicId: ext.bundlePublicId as string, itemCount: responseInteger(ext.itemCount, 1, 100), preview: boundedString(ext.preview, 0, 500), senderNames, titleKind }, senderCount, title: boundedString(ext.title, 1, 255) };
}

function toChatRecordMessageExt(value: unknown): MessageExt {
  return { chatRecord: parseChatRecordMessageMetadata(value).chatRecord };
}

function assertChatRecordDeliveryConsistency(bundle: import("./chat-records").ImChatRecordSummary, message: import("../realtime/api").RealtimeMessage) {
  const metadata = parseChatRecordMessageMetadata(message.metadata);
  const expectedTitleKind = bundle.senderCount === 1 ? "single" : bundle.senderCount === 2 ? "pair" : "group";
  if (metadata.chatRecord.publicId !== bundle.publicId || metadata.chatRecord.itemCount !== bundle.itemCount || metadata.chatRecord.preview !== bundle.preview || metadata.senderCount !== bundle.senderCount || metadata.title !== bundle.title || metadata.chatRecord.titleKind !== expectedTitleKind || metadata.chatRecord.senderNames.length !== bundle.senderNames.length || metadata.chatRecord.senderNames.some((name: string, index: number) => name !== bundle.senderNames[index]) || message.content !== bundle.title) invalidChatRecord();
}

function parseChatRecordDeliveryMessage(value: unknown, targetConversationId: number): import("../realtime/api").RealtimeMessage {
  const message = exactRecord(value, [
    "availableRecallModes", "content", "contentPurgedAt", "conversationId", "createdAt", "expiresAt",
    "id", "lifecycleVersion", "metadata", "privacyPolicyVersionAtSend", "reactionVersion", "reactions",
    "recallDeadlineAt", "recalledAt", "recallMode", "senderUserId", "type",
  ]);
  responseInteger(message.id, 1);
  if (responseInteger(message.conversationId, 1) !== targetConversationId) invalidChatRecord();
  responseInteger(message.senderUserId, 1);
  if (message.type !== "text" || typeof message.content !== "string") invalidChatRecord();
  boundedString(message.content, 1, 255);
  isoDate(message.createdAt);
  isoDate(message.recallDeadlineAt);
  for (const field of ["contentPurgedAt", "expiresAt", "recalledAt"] as const) {
    const fieldValue = message[field];
    if (fieldValue !== null) isoDate(fieldValue);
  }
  if (message.recallMode !== null && message.recallMode !== "standard" && message.recallMode !== "traceless") invalidChatRecord();
  if (message.privacyPolicyVersionAtSend !== null) responseInteger(message.privacyPolicyVersionAtSend, 0);
  responseInteger(message.lifecycleVersion, 0);
  responseInteger(message.reactionVersion, 0);
  if (!Array.isArray(message.availableRecallModes) || message.availableRecallModes.some((mode) => mode !== "standard")) invalidChatRecord();
  const reactions = message.reactions;
  if (!Array.isArray(reactions)) return invalidChatRecord();
  for (const reactionValue of reactions) {
    const reaction = exactRecord(reactionValue, ["emoji", "people", "reactedByMe"]);
    boundedString(reaction.emoji, 1, 32);
    const people = reaction.people;
    if (!Array.isArray(people) || typeof reaction.reactedByMe !== "boolean") return invalidChatRecord();
    for (const personValue of people) {
      if (!personValue || typeof personValue !== "object" || Array.isArray(personValue)) invalidChatRecord();
      const person = personValue as Record<string, unknown>;
      const keys = Object.keys(person);
      if (!keys.includes("userId") || !keys.includes("needoId") || !keys.includes("username") || !keys.includes("avatarUrl") || keys.some((key) => !["userId", "needoId", "username", "avatarUrl", "role"].includes(key))) invalidChatRecord();
      responseInteger(person.userId, 1);
      if (typeof person.needoId !== "string" || !/^(?:u|s|b|o|needo)[0-9]{10}$/u.test(person.needoId) || typeof person.username !== "string" || (person.avatarUrl !== null && typeof person.avatarUrl !== "string")) invalidChatRecord();
      if (person.role !== undefined && person.role !== "owner" && person.role !== "admin" && person.role !== "member") invalidChatRecord();
    }
  }
  parseChatRecordMessageMetadata(message.metadata);
  return message as unknown as import("../realtime/api").RealtimeMessage;
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

function toTechnicianContactDetails(
  details: RealtimeTechnicianContactDetails,
): TechnicianContactDetails {
  return {
    bidBudgetMinJpy: details.bidBudgetMinJpy,
    bidBudgetMaxJpy: details.bidBudgetMaxJpy,
    paymentMethods: [...details.paymentMethods],
    specialTags: [...details.specialTags],
    profileTags: [...details.profileTags],
    services: details.services.map((service) => ({
      id: service.id,
      shopId: service.shopId,
      name: service.name,
      priceAmount: service.priceAmount,
      currency: service.currency,
      durationMinutes: service.durationMinutes,
      taxIncluded: service.taxIncluded,
      sortOrder: service.sortOrder,
    })),
    completedOrderCount: details.completedOrderCount,
    acceptanceRateBps: details.acceptanceRateBps,
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
  const hasV2ContactCardMarker =
    metadata.snapshotVersion === 2 || metadata.type === "contact-card";
  const type: ImMessageType = isRecalled
    ? "recalled"
    : hasV2ContactCardMarker
      ? "contact-card"
    : typeof storedType === "string" &&
        richMessageTypes.has(storedType as ImMessageType)
      ? (storedType as ImMessageType)
      : message.type === "text"
        ? "text"
        : "system";
  const ext = metadata.needoMessageExt;
  const quotedMessageId = metadata.needoQuotedMessageId;
  const rawExt =
    ext && typeof ext === "object" && !Array.isArray(ext)
      ? (ext as MessageExt)
      : undefined;
  const { disappearing: _untrustedDisappearing, mediaState: _untrustedMediaState, ...safeRawExt } = rawExt ?? {};
  const safeExt =
    type === "chat-record"
      ? toChatRecordMessageExt(metadata)
      : type === "contact-card"
        ? toContactCardMessageExt(metadata)
        : safeRawExt;
  const privacyPolicyVersionAtSend = message.privacyPolicyVersionAtSend;
  const createdAtMs = Date.parse(message.createdAt);
  const expiresAtMs = message.expiresAt ? Date.parse(message.expiresAt) : Number.NaN;
  const hasPrivacyCountdown =
    Number.isInteger(privacyPolicyVersionAtSend) &&
    (privacyPolicyVersionAtSend ?? -1) >= 0 &&
    Number.isFinite(createdAtMs) &&
    Number.isFinite(expiresAtMs) &&
    expiresAtMs > createdAtMs;
  const disappearingCountdown = hasPrivacyCountdown
    ? secondsToCountdown(Math.floor((expiresAtMs - createdAtMs) / 1_000))
    : undefined;
  const normalizedExt: MessageExt = disappearingCountdown
    ? {
        ...safeExt,
        disappearing: {
          mode: "sent",
          countdown: disappearingCountdown,
          startedAt: message.createdAt,
          expiresAt: message.expiresAt ?? undefined,
        },
      }
    : safeExt;

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
    privacyPolicyVersionAtSend:
      typeof privacyPolicyVersionAtSend === "number"
        ? privacyPolicyVersionAtSend
        : undefined,
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
    ext: Object.keys(normalizedExt).length > 0 ? normalizedExt : undefined,
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
  return (
    conversation.participants.find(
      (participant) => participant.userId !== currentUserId,
    ) ?? conversation.directPeer ?? undefined
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
  const lastMessageSummary = buildConversationLastMessageSummary(
    lastMessage ?? undefined,
    String(currentUserId),
    {},
    conversation.updatedAt,
  );
  const title =
    conversation.title?.trim() ||
    (isDirect ? otherParticipant?.username : undefined) ||
    `群聊（${conversation.participants.length}）`;

  return {
    id: String(conversation.id),
    type: isDirect ? "single" : "group",
    title,
    avatar: isDirect ? (otherParticipant?.avatarUrl ?? "") : "",
    memberIds: Array.from(
      new Set([
        ...conversation.participants.map((participant) => String(participant.userId)),
        ...(isDirect && otherParticipant ? [String(otherParticipant.userId)] : []),
      ]),
    ),
    contactUserId:
      isDirect && otherParticipant
        ? String(otherParticipant.userId)
        : undefined,
    ...lastMessageSummary,
    unreadCount: conversation.unreadCount,
    isPinned: conversation.isPinned ?? false,
    isMuted: conversation.isMuted ?? false,
    autoTranslateMessages: conversation.autoTranslateMessages ?? false,
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
    if (conversation.directPeer) {
      userMap.set(
        String(conversation.directPeer.userId),
        toImUser(conversation.directPeer),
      );
    }
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
    const users = [
      ...conversation.participants,
      ...(conversation.directPeer ? [conversation.directPeer] : []),
    ].map(toImUser);

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
      const identityCard = {
        entityType: profile.identityCard.entityType,
        profileId: profile.identityCard.profileId === null
          ? undefined
          : String(profile.identityCard.profileId),
        displayName: profile.identityCard.displayName,
        identityLabel: profile.identityCard.identityLabel ?? undefined,
        verified: profile.identityCard.verified,
        creditValue: profile.identityCard.creditValue === null
          ? undefined
          : Number(profile.identityCard.creditValue),
        creditReviewCount: profile.identityCard.creditReviewCount,
        gender: profile.identityCard.gender ?? undefined,
        age: profile.identityCard.age ?? undefined,
        heightCm: profile.identityCard.heightCm === null
          ? undefined
          : Number(profile.identityCard.heightCm),
        languages: profile.identityCard.languages,
        city: profile.identityCard.city ?? undefined,
        serviceArea: profile.identityCard.serviceArea ?? undefined,
        yearsExperience: profile.identityCard.yearsExperience ?? undefined,
        bio: profile.identityCard.bio ?? undefined,
      };
      const baseProfile = {
        user: toImUser(profile.user),
        relationship: profile.relationship,
        contactId: profile.contactId === null ? undefined : String(profile.contactId),
        friendRequest: profile.friendRequest
          ? toFriendRequest(profile.friendRequest)
          : undefined,
      };

      if (profile.identityCard.entityType === "technician") {
        return {
          ...baseProfile,
          identityCard: {
            ...identityCard,
            entityType: "technician",
          },
          ...(profile.technicianContactDetails
            ? {
                technicianContactDetails: toTechnicianContactDetails(
                  profile.technicianContactDetails,
                ),
              }
            : {}),
        };
      }

      return {
        ...baseProfile,
        identityCard: {
          ...identityCard,
          entityType: profile.identityCard.entityType,
        },
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
          [
            ...conversation.participants,
            ...(conversation.directPeer ? [conversation.directPeer] : []),
          ].map(toImUser),
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
    async listContactCardCandidates(
      conversationId: string,
      query: { page?: number; pageSize?: number; query?: string } = {},
    ) {
      const page = query.page === undefined ? 1 : positive(query.page);
      const pageSize = query.pageSize === undefined ? 20 : positive(query.pageSize, 100);
      const normalizedQuery = query.query?.trim();
      if (normalizedQuery && normalizedQuery.length > 100) {
        throw new Error("error.validation");
      }
      const response = await realtimeApi.listContactCardCandidates(
        toNumericId(conversationId),
        {
          page,
          pageSize,
          ...(normalizedQuery ? { query: normalizedQuery } : {})
        },
      );
      return toContactCardCandidatePage(response, page, pageSize);
    },
    async sendContactCard(
      conversationId: string,
      targetUserId: string,
      idempotencyKey: string,
    ) {
      const normalizedTargetUserId = targetUserId.trim();
      const normalizedIdempotencyKey = idempotencyKey.trim();
      if (
        !/^u[0-9]{10}$/u.test(normalizedTargetUserId) ||
        normalizedIdempotencyKey.length < 8 ||
        normalizedIdempotencyKey.length > 191
      ) {
        throw new Error("error.validation");
      }
      const rawResult = await realtimeApi.sendContactCard(
        toNumericId(conversationId),
        normalizedTargetUserId,
        normalizedIdempotencyKey,
      );
      const result = exactContactCardRecord(rawResult, ["message", "replayed"]);
      if (typeof result.replayed !== "boolean") return invalidContactCard();
      const mappedMessage = toConversationMessage(result.message as RealtimeMessage);
      if (
        mappedMessage.type !== "contact-card" ||
        mappedMessage.conversationId !== conversationId ||
        mappedMessage.ext?.contactCard?.userId !== normalizedTargetUserId
      ) {
        return invalidContactCard();
      }
      return { message: mappedMessage, replayed: result.replayed };
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
    async setConversationAutoTranslateMessages(conversationId: string, enabled: boolean) {
      const conversation = await realtimeApi.updateConversationPreferences(
        toNumericId(conversationId),
        { autoTranslateMessages: enabled },
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
    async batchDeleteMessages(conversationId, input) {
      assertUuid(input.idempotencyKey);
      const messageIds = input.messageIds.map(toNumericId);
      if (messageIds.length < 1 || messageIds.length > 100 || new Set(messageIds).size !== messageIds.length) throw new Error("error.validation.invalid_message_ids");
      const result = await realtimeApi.batchDeleteMessagesForMe(toNumericId(conversationId), { idempotencyKey: input.idempotencyKey, messageIds });
      return { ...result, conversationId: toStringId(result.conversationId), messageIds: result.messageIds.map(toStringId) };
    },
    async translateMessages(conversationId, input) {
      if (input.messageIds.length < 1 || input.messageIds.length > 50 || new Set(input.messageIds).size !== input.messageIds.length) throw new Error("error.validation.invalid_message_ids");
      const results = await realtimeApi.translateMessages(toNumericId(conversationId), { messageIds: input.messageIds.map(toNumericId), targetLanguage: input.targetLanguage });
      return results.map((result) => ({ messageId: toStringId(result.messageId), status: result.status, ...(result.status === "translated" && typeof result.translatedContent === "string" ? { translatedContent: result.translatedContent } : {}) }));
    },
    async createChatRecordDelivery(targetConversationId, command) {
      const rawResult = await realtimeApi.createChatRecordDelivery(toNumericId(targetConversationId), toRealtimeChatRecordCommand(command));
      const result = exactRecord(rawResult, ["replayed", "bundle", "message"]);
      if (typeof result.replayed !== "boolean") invalidChatRecord();
      const bundle = toChatRecordSummary(result.bundle as import("../realtime/api").RealtimeChatRecordSummary);
      const rawMessage = parseChatRecordDeliveryMessage(result.message, toNumericId(targetConversationId));
      assertChatRecordDeliveryConsistency(bundle, rawMessage);
      return { replayed: result.replayed as boolean, bundle, message: toConversationMessage(rawMessage) };
    },
    async getChatRecord(publicId) { return toChatRecordSummary(await realtimeApi.getChatRecord(assertUuid(publicId))); },
    async listChatRecordItems(publicId, query = {}) {
      const safeQuery = { ...(query.beforePosition === undefined ? {} : { beforePosition: positive(query.beforePosition) }), ...(query.pageSize === undefined ? {} : { pageSize: positive(query.pageSize, 50) }) };
      const result = await realtimeApi.listChatRecordItems(assertUuid(publicId), safeQuery);
      const page = chatRecordItemPage(result, safeQuery.beforePosition, safeQuery.pageSize ?? 20);
      return { ...page, nextCursor: page.nextCursor! };
    },
    getChatRecordMedia(publicId, checksumSha256) { return realtimeApi.getChatRecordMedia(assertUuid(publicId), assertChecksum(checksumSha256)); },
    async createChatRecordFavorite(command) {
      const rawResult = await realtimeApi.createChatRecordFavorite(toRealtimeChatRecordCommand(command));
      const result = exactRecord(rawResult, ["replayed", "favorite"]);
      if (typeof result.replayed !== "boolean") invalidChatRecord();
      return { replayed: result.replayed as boolean, favorite: toChatRecordFavorite(result.favorite as import("../realtime/api").RealtimeChatRecordFavorite) };
    },
    async listChatRecordFavorites(query = {}) {
      const safeQuery = { ...(query.page === undefined ? {} : { page: positive(query.page) }), ...(query.pageSize === undefined ? {} : { pageSize: positive(query.pageSize, 100) }) };
      const result = await realtimeApi.listChatRecordFavorites(safeQuery);
      const page = chatRecordFavoritePage(result, safeQuery.page ?? 1, safeQuery.pageSize ?? 20);
      return { ...page, list: page.list.map((item) => toChatRecordFavorite(item as import("../realtime/api").RealtimeChatRecordFavorite)) };
    },
    removeChatRecordFavorite(favoriteId) { return realtimeApi.removeChatRecordFavorite(toNumericId(favoriteId)); },
    async sendMessage(
      type: ImMessageType,
      payload: {
        conversationId: string;
        content: string;
        quotedMessageId?: string;
        ext?: MessageExt;
      },
    ) {
      if (type === "chat-record") {
        throw new Error("error.im.chat_record_requires_server_snapshot");
      }
      if (type === "contact-card") {
        throw new Error("error.im.contact_card_requires_server_snapshot");
      }
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
    async sendVoiceMessage(conversationId, voice, metadata) {
      const message = await realtimeApi.createVoiceMessage(
        toNumericId(conversationId),
        voice,
        metadata,
      );
      return { message: toConversationMessage(message) };
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
