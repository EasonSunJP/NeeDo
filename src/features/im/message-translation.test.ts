import { describe, expect, it } from "vitest";
import {
  buildImMessageTranslationBatches,
  collectCompletedImMessageTranslationIds,
  getImMessageCopyText,
  getImMessageTranslationSource,
  getImTranslationTargetLanguage,
  isImMessageTranslationEligible,
  mergeTranslatedImMessageResults,
  resolveVisibleImMessageTranslation,
} from "./message-translation";
import type { ConversationMessage, MessageExt } from "./model";

describe("IM message display translation", () => {
  const message = (overrides: Partial<ConversationMessage> = {}): ConversationMessage => ({
    id: "41",
    localId: "41",
    conversationId: "91",
    senderId: "partner",
    type: "text",
    content: "测试测试",
    status: "sent",
    sentAt: "2026-08-31T00:00:00.000Z",
    clientSeq: 1,
    ...overrides,
  });

  it("maps the exact App language union to the formal translation target", () => {
    expect((["zh", "zh-Hant", "ja", "en", "ko"] as const).map(getImTranslationTargetLanguage)).toEqual([
      "zh",
      "zh-Hant",
      "ja",
      "en",
      "ko",
    ]);
  });

  it("accepts only settled authoritative text or image/video captions", () => {
    expect(isImMessageTranslationEligible(message())).toBe(true);
    expect(isImMessageTranslationEligible(message({ type: "image", content: "/media/a.jpg", ext: { caption: "说明" } }))).toBe(true);
    expect(isImMessageTranslationEligible(message({ type: "video", content: "/media/a.mp4", ext: { caption: "  " } }))).toBe(false);
    expect(isImMessageTranslationEligible(message({ id: "local-1", localId: "local-1" }))).toBe(false);
    expect(isImMessageTranslationEligible(message({ status: "sending" }))).toBe(false);
    expect(isImMessageTranslationEligible(message({ type: "file", ext: { fileName: "x.pdf" } }))).toBe(false);
    expect(getImMessageTranslationSource(message({ type: "image", ext: { caption: " 说明 " } }))).toBe(" 说明 ");
  });

  it("deduplicates authoritative IDs and chunks automatic requests at fifty in source order", () => {
    const messages = Array.from({ length: 52 }, (_, index) => message({ id: String(index + 1), localId: String(index + 1), clientSeq: index + 1 }));
    messages.splice(10, 0, messages[0]!);
    messages.push(message({ id: "local-pending", localId: "local-pending", status: "sending" }));

    const chunks = buildImMessageTranslationBatches(messages);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(50);
    expect(chunks[1]).toEqual(["51", "52"]);
    expect(chunks.flat()).toEqual(Array.from({ length: 52 }, (_, index) => String(index + 1)));
  });

  it("keeps successful translated text, marks every returned ID completed, and gives automatic display priority", () => {
    const results = [
      { messageId: "2", status: "same_language" },
      { messageId: "1", status: "translated", translatedContent: "一" },
      { messageId: "3", status: "ineligible" },
      { messageId: "4", status: "translated", translatedContent: "  " },
    ] as const;
    const merged = mergeTranslatedImMessageResults({}, results);

    expect(merged).toEqual({ "1": { content: "一", visible: true } });
    expect(collectCompletedImMessageTranslationIds(results)).toEqual(["2", "1", "3", "4"]);
    expect(resolveVisibleImMessageTranslation(true, { content: "手动", visible: true }, { content: "自动", visible: true })).toEqual({ content: "自动", visible: true });
    expect(resolveVisibleImMessageTranslation(false, { content: "手动", visible: true }, { content: "自动", visible: true })).toEqual({ content: "手动", visible: true });
  });

  it("always copies the stored original text without mutating the message", () => {
    const message: ConversationMessage = {
      id: "message-copy-1",
      localId: "message-copy-1",
      conversationId: "conversation-copy-1",
      senderId: "user-1",
      type: "text",
      content: "测试测试",
      status: "sent",
      sentAt: "2026-08-31T00:00:00.000Z",
      clientSeq: 1
    };
    const original = structuredClone(message);

    expect(getImMessageCopyText(message)).toBe("测试测试");
    expect(getImMessageCopyText(message, "テストテスト")).toBe("テストテスト");
    expect(message).toEqual(original);
  });

  it("does not copy a translated DOM selection instead of the stored original", () => {
    const message: ConversationMessage = {
      id: "message-copy-selection-1",
      localId: "message-copy-selection-1",
      conversationId: "conversation-copy-1",
      senderId: "user-1",
      type: "text",
      content: "测试测试",
      status: "sent",
      sentAt: "2026-08-31T00:00:00.000Z",
      clientSeq: 2
    };

    expect(getImMessageCopyText(message)).toBe("测试测试");
  });

  it("copies raw media captions while preserving non-text fallbacks", () => {
    const captionedImage: ConversationMessage = {
      id: "message-copy-caption-1",
      localId: "message-copy-caption-1",
      conversationId: "conversation-copy-1",
      senderId: "user-1",
      type: "image",
      content: "/media/image.jpg",
      status: "sent",
      sentAt: "2026-08-31T00:00:00.000Z",
      clientSeq: 3,
      ext: { caption: "测试测试", previewText: "图片" }
    };
    const fileMessage: ConversationMessage = {
      ...captionedImage,
      id: "message-copy-file-1",
      localId: "message-copy-file-1",
      type: "file",
      content: "",
      ext: { previewText: "文件" }
    };

    expect(getImMessageCopyText(captionedImage)).toBe("测试测试");
    expect(getImMessageCopyText(fileMessage)).toBe("文件");
  });

  it("preserves visible caption whitespace while treating whitespace-only captions as absent", () => {
    const captionedImage: ConversationMessage = {
      id: "message-copy-caption-whitespace-1",
      localId: "message-copy-caption-whitespace-1",
      conversationId: "conversation-copy-1",
      senderId: "user-1",
      type: "image",
      content: "/media/image.jpg",
      status: "sent",
      sentAt: "2026-08-31T00:00:00.000Z",
      clientSeq: 4,
      ext: { caption: "  测试测试  ", previewText: "图片" }
    };
    const blankCaptionFile: ConversationMessage = {
      ...captionedImage,
      id: "message-copy-caption-whitespace-2",
      localId: "message-copy-caption-whitespace-2",
      type: "file",
      content: "",
      ext: { caption: "   ", previewText: "文件" }
    };

    expect(getImMessageCopyText(captionedImage)).toBe("  测试测试  ");
    expect(getImMessageCopyText(blankCaptionFile)).toBe("文件");
  });
});
