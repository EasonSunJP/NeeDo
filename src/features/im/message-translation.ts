import { translateText, type Language } from "../../i18n/translations";
import { resolveImMessageRichText, type ImMessageRichTextPart } from "./reaction-policy";
import type { ConversationMessage, ImConversationType, MessageExt } from "./model";

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

export function getImPreviewDisplayText(
  text: string,
  options: ImMessageTranslationOptions,
): string {
  return options.enabled ? translateText(text, options.language) : text;
}

export function isImUserGeneratedPreviewText(
  text: string,
  conversationType?: ImConversationType,
): boolean {
  return conversationType !== "system"
    && !/(撤回了一条消息|changed|left\b|语音通话|视频通话|系统消息)/i.test(text);
}

export function getImMessageCopyText(
  message: ConversationMessage,
  selectedContent: string,
  options: ImMessageTranslationOptions,
): string {
  if (selectedContent) {
    return selectedContent;
  }

  const caption = message.ext?.caption?.trim() ?? "";
  if (caption) {
    return getImMessageDisplayText(caption, message.ext?.captionRichText, options);
  }

  if ((message.type === "text" || message.type === "emoji") && message.content) {
    return getImMessageDisplayText(message.content, message.ext?.richText, options);
  }

  return message.content || message.ext?.previewText || "媒体消息";
}
