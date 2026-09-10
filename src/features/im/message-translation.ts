import type { Language } from "../../i18n/translations";
import { resolveImMessageRichText, type ImMessageRichTextPart } from "./reaction-policy";
import type { ConversationMessage, MessageExt } from "./model";
import type { ImMessageTranslationResult } from "./chat-records";

export type VisibleMessageTranslation = {
  content: string;
  visible: boolean;
};

export const imAutomaticTranslationRetryDelayMs = 5_000;

export type ImMessageTranslationOptions = {
  content?: string;
  enabled?: boolean;
  language: Language;
  visible?: boolean;
};

export function getImMessageDisplayParts(
  content: string,
  richText: MessageExt["richText"] | undefined,
  options: ImMessageTranslationOptions,
): ImMessageRichTextPart[] {
  void options;
  return resolveImMessageRichText(content, richText);
}

export function getImMessageDisplayText(
  content: string,
  richText: MessageExt["richText"] | undefined,
  options: ImMessageTranslationOptions,
): string {
  return getImMessageDisplayParts(content, richText, options)
    .map((part) => part.value)
    .join("");
}

export function getImMessageCopyText(
  message: ConversationMessage,
  displayedText?: string,
): string {
  if (typeof displayedText === "string" && displayedText.trim()) {
    return displayedText;
  }

  const caption = message.ext?.caption ?? "";
  if (caption.trim()) {
    return caption;
  }

  if ((message.type === "text" || message.type === "emoji") && message.content) {
    return message.content;
  }

  return message.content || message.ext?.previewText || "媒体消息";
}

export function getImTranslationTargetLanguage(language: Language): Language {
  const targets: Record<Language, Language> = {
    zh: "zh",
    "zh-Hant": "zh-Hant",
    ja: "ja",
    en: "en",
    ko: "ko",
  };
  return targets[language];
}

function hasAuthoritativeImMessageId(message: ConversationMessage) {
  if (!/^[1-9]\d*$/.test(message.id)) return false;
  const id = Number(message.id);
  return Number.isSafeInteger(id) && id <= 2_147_483_647;
}

export function getImMessageTranslationSource(message: ConversationMessage): string | null {
  if (message.type === "text") {
    return message.content.trim() ? message.content : null;
  }
  if (message.type === "image" || message.type === "video") {
    const caption = message.ext?.caption;
    return typeof caption === "string" && caption.trim() ? caption : null;
  }
  return null;
}

export function isImMessageTranslationEligible(message: ConversationMessage) {
  return (
    hasAuthoritativeImMessageId(message)
    && (message.status === "sent" || message.status === "delivered")
    && message.serverState !== "recalled"
    && getImMessageTranslationSource(message) !== null
  );
}

export function buildImMessageTranslationBatches(
  messages: readonly ConversationMessage[],
  excludedIds: ReadonlySet<string> = new Set(),
  chunkSize = 50,
) {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    if (
      !seen.has(message.id)
      && !excludedIds.has(message.id)
      && isImMessageTranslationEligible(message)
    ) {
      seen.add(message.id);
      ids.push(message.id);
    }
  }
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += chunkSize) {
    chunks.push(ids.slice(index, index + chunkSize));
  }
  return chunks;
}

export function mergeTranslatedImMessageResults(
  current: Record<string, VisibleMessageTranslation>,
  results: readonly ImMessageTranslationResult[],
) {
  const next = { ...current };
  for (const result of results) {
    if (
      result.status === "translated"
      && typeof result.translatedContent === "string"
      && result.translatedContent.trim()
    ) {
      next[result.messageId] = { content: result.translatedContent, visible: true };
    }
  }
  return next;
}

export function collectCompletedImMessageTranslationIds(
  results: readonly ImMessageTranslationResult[],
) {
  const completedIds: string[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    if (seen.has(result.messageId)) {
      continue;
    }
    seen.add(result.messageId);
    completedIds.push(result.messageId);
  }
  return completedIds;
}

export function resolveVisibleImMessageTranslation(
  automaticEnabled: boolean,
  manual: VisibleMessageTranslation | undefined,
  automatic: VisibleMessageTranslation | undefined,
) {
  const selected = automaticEnabled ? automatic : manual;
  return selected?.visible ? selected : undefined;
}
