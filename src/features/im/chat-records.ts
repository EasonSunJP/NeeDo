export type ImChatRecordTitleKind = "single" | "pair" | "group";

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
