import { translateText, type Language } from "../../i18n/translations";
import { resolveImMessageRichText, type ImMessageRichTextPart } from "./reaction-policy";
import type { ConversationMessage, MessageExt } from "./model";

export type ImMessageTranslationOptions = {
  enabled: boolean;
  language: Language;
};

export function getImMessageDisplayParts(
  content: string,
  richText: MessageExt["richText"] | undefined,
  options: ImMessageTranslationOptions,
): ImMessageRichTextPart[] {
  return resolveImMessageRichText(content, richText).map((part) => ({
    ...part,
    value: options.enabled && part.type === "text"
      ? translateText(part.value, options.language)
      : part.value
  }));
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
): string {
  const caption = message.ext?.caption ?? "";
  if (caption.trim()) {
    return caption;
  }

  if ((message.type === "text" || message.type === "emoji") && message.content) {
    return message.content;
  }

  return message.content || message.ext?.previewText || "媒体消息";
}
