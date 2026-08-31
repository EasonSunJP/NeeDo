export type ImChatRecordTitleKind = "single" | "pair" | "group";

export const IM_CHAT_RECORD_SNAPSHOT_TYPES = [
  "text",
  "emoji",
  "image",
  "video",
  "voice",
  "file",
  "location",
  "contact-card",
  "service-card",
  "schedule-invite",
] as const;

export type ImChatRecordSnapshotType = (typeof IM_CHAT_RECORD_SNAPSHOT_TYPES)[number];
const typedPreviewPrefix = "needo-chat-record-preview:v1:";

export type ImChatRecordItem = {
  id: string;
  position: number;
  senderDisplayName: string;
  senderAvatarUrl: string | null;
  messageType: string;
  content: string | null;
  metadata: unknown;
  sentAt: string;
};

export type ImChatRecordSummary = {
  publicId: string;
  title: string;
  titleKind?: ImChatRecordTitleKind;
  preview: string;
  senderNames: string[];
  senderCount: number;
  itemCount: number;
  createdAt: string;
};

export type ImChatRecordFavorite = {
  id: string;
  bundlePublicId: string;
  title: string;
  titleKind?: ImChatRecordTitleKind;
  preview: string;
  senderNames: string[];
  senderCount: number;
  itemCount: number;
  createdAt: string;
};

export function deriveImChatRecordTitleKind(
  senderNames: string[],
  senderCount = senderNames.length,
): ImChatRecordTitleKind {
  if (senderCount <= 1) return "single";
  if (senderCount === 2) return "pair";
  return "group";
}

export function formatLocalizedImChatRecordTitle(
  senderNames: string[],
  kind: ImChatRecordTitleKind,
  language: import("../../i18n/translations").Language,
) {
  const names = senderNames.map(compact).filter(Boolean);
  const first = names[0] ?? "NeeDo";
  const second = names[1] ?? "NeeDo";
  if (language === "en") {
    if (kind === "single") return `${first}'s chat history`;
    if (kind === "pair") return `${first} and ${second}'s chat history`;
    return "Group chat history";
  }
  if (language === "ja") {
    if (kind === "single") return `${first}のチャット履歴`;
    if (kind === "pair") return `${first}と${second}のチャット履歴`;
    return "グループチャット履歴";
  }
  if (language === "ko") {
    if (kind === "single") return `${first}의 채팅 기록`;
    if (kind === "pair") return `${first}와 ${second}의 채팅 기록`;
    return "그룹 채팅 기록";
  }
  if (language === "zh-Hant") {
    if (kind === "single") return `${first}的聊天記錄`;
    if (kind === "pair") return `${first}和${second}的聊天記錄`;
    return "群組聊天記錄";
  }
  if (kind === "single") return `${first}的聊天记录`;
  if (kind === "pair") return `${first}和${second}的聊天记录`;
  return "群聊记录";
}

export function formatLocalizedImChatRecordCount(
  itemCount: number,
  language: import("../../i18n/translations").Language,
) {
  if (language === "en") return `${itemCount} ${itemCount === 1 ? "message" : "messages"}`;
  if (language === "ja") return `${itemCount}件のメッセージ`;
  if (language === "ko") return `메시지 ${itemCount}개`;
  if (language === "zh-Hant") return `${itemCount}則訊息`;
  return `${itemCount}条信息`;
}

const previewPlaceholders: Record<ImChatRecordSnapshotType, Record<import("../../i18n/translations").Language, string>> = {
  text: { zh: "[文本]", "zh-Hant": "[文字]", ja: "[テキスト]", en: "[Text]", ko: "[텍스트]" },
  emoji: { zh: "[表情]", "zh-Hant": "[表情]", ja: "[絵文字]", en: "[Emoji]", ko: "[이모지]" },
  image: { zh: "[图片]", "zh-Hant": "[圖片]", ja: "[画像]", en: "[Image]", ko: "[이미지]" },
  video: { zh: "[视频]", "zh-Hant": "[影片]", ja: "[動画]", en: "[Video]", ko: "[동영상]" },
  voice: { zh: "[语音]", "zh-Hant": "[語音]", ja: "[音声]", en: "[Voice]", ko: "[음성]" },
  file: { zh: "[文件]", "zh-Hant": "[檔案]", ja: "[ファイル]", en: "[File]", ko: "[파일]" },
  location: { zh: "[位置]", "zh-Hant": "[位置]", ja: "[位置]", en: "[Location]", ko: "[위치]" },
  "contact-card": { zh: "[名片]", "zh-Hant": "[名片]", ja: "[連絡先]", en: "[Contact]", ko: "[연락처]" },
  "service-card": { zh: "[服务]", "zh-Hant": "[服務]", ja: "[サービス]", en: "[Service]", ko: "[서비스]" },
  "schedule-invite": { zh: "[日程邀请]", "zh-Hant": "[日程邀請]", ja: "[予定への招待]", en: "[Schedule invite]", ko: "[일정 초대]" },
};

export function formatLocalizedImChatRecordPreview(
  preview: string,
  language: import("../../i18n/translations").Language,
): string {
  if (!preview.startsWith(typedPreviewPrefix)) return preview;
  try {
    const parsed = JSON.parse(preview.slice(typedPreviewPrefix.length)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return preview;
    const lines = (parsed as { lines?: unknown }).lines;
    if (!Array.isArray(lines) || lines.length > 2) return preview;
    return lines.map((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalid");
      const { sender, text, type } = raw as Record<string, unknown>;
      if (
        typeof sender !== "string" || sender.length > 60 ||
        typeof type !== "string" ||
        !IM_CHAT_RECORD_SNAPSHOT_TYPES.includes(type as ImChatRecordSnapshotType) ||
        (text !== undefined && (typeof text !== "string" || text.length > 100))
      ) throw new Error("invalid");
      const snapshotType = type as ImChatRecordSnapshotType;
      const exactText = typeof text === "string" ? text : "";
      const body = snapshotType === "text" || snapshotType === "emoji"
        ? exactText || previewPlaceholders[snapshotType][language]
        : `${previewPlaceholders[snapshotType][language]}${exactText ? ` ${exactText}` : ""}`;
      return `${sender}: ${body}`;
    }).join("\n");
  } catch {
    return preview;
  }
}

export type ImChatRecordItemPage = {
  list: ImChatRecordItem[];
  total: number;
  page: number;
  page_size: number;
  nextCursor: number | null;
};

export type ImChatRecordFavoritePage = {
  list: ImChatRecordFavorite[];
  total: number;
  page: number;
  page_size: number;
};

export type ImChatRecordCommand = {
  idempotencyKey: string;
  messageIds: string[];
  sourceConversationId: string;
};

export type ImChatRecordMedia = {
  blob: Blob;
  contentType: string;
  contentLength: number | null;
  etag: string | null;
  cacheControl: string | null;
};

export type ImMessageTranslationResult = {
  messageId: string;
  status: "translated" | "same_language" | "ineligible";
  translatedContent?: string;
};

const compact = (value: string) => value.trim().replace(/\s+/g, " ");

export function formatImChatRecordTitle(
  senderNames: string[],
  kind: ImChatRecordTitleKind,
): string {
  const names = senderNames.map(compact).filter(Boolean);
  if (kind === "single") return (names[0] ?? "NeeDo").slice(0, 255);
  if (kind === "pair")
    return `${names[0] ?? "NeeDo"}、${names[1] ?? "NeeDo"}`.slice(0, 255);
  return `${names[0] ?? "NeeDo"}、${names[1] ?? "NeeDo"} 等 ${Math.max(names.length, 3)} 人`.slice(
    0,
    255,
  );
}

function mediaMetadata(value: unknown): { mimeType: string } | null {
  if (!value || typeof value !== "object") return null;
  const media = (value as { media?: unknown }).media;
  if (!media || typeof media !== "object") return null;
  const mimeType = (media as { mimeType?: unknown }).mimeType;
  return typeof mimeType === "string" ? { mimeType } : null;
}

export function formatImChatRecordPreview(
  items: ImChatRecordItem[],
  options: { mediaPlaceholder: (media: { mimeType: string }) => string },
): string {
  return [...items]
    .sort((left, right) => left.position - right.position)
    .slice(0, 2)
    .map((item) => {
      const media =
        mediaMetadata(item.metadata) ??
        (["image", "voice", "video", "file"].includes(item.messageType)
          ? {
              mimeType:
                item.messageType === "image"
                  ? "image/*"
                  : `application/x-needo-${item.messageType}`,
            }
          : null);
      const content = media
        ? options.mediaPlaceholder(media)
        : compact(item.content ?? "");
      return `${compact(item.senderDisplayName) || "NeeDo"}: ${compact(content)}`.slice(
        0,
        248,
      );
    })
    .join("\n")
    .slice(0, 500);
}

export function formatImSelectedMessagesForClipboard(
  selections: Array<{
    id: string;
    senderName: string;
    displayedText: string;
    messageType: string;
    sentAt: string;
  }>,
  options: { mediaPlaceholder: (messageType: string) => string },
): string {
  const mediaTypes = new Set(["image", "voice", "video", "file"]);
  return selections
    .map((selection, index) => ({ selection, index }))
    .sort(
      (left, right) =>
        left.selection.sentAt.localeCompare(right.selection.sentAt) ||
        left.index - right.index,
    )
    .map(({ selection }) => {
      const content = mediaTypes.has(selection.messageType)
        ? options.mediaPlaceholder(selection.messageType)
        : compact(selection.displayedText);
      return `${compact(selection.senderName) || "NeeDo"}:${compact(content)}`;
    })
    .join("\n");
}
