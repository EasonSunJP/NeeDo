import { describe, expect, it } from "vitest";
import {
  getImMessageCopyText,
  getImMessageDisplayParts,
  getImMessageDisplayText,
  getImPreviewDisplayText,
  isImUserGeneratedConversationPreview
} from "./message-translation";
import type { ConversationMessage, MessageExt } from "./model";

describe("IM message display translation", () => {
  it("keeps disabled message text unchanged", () => {
    expect(getImMessageDisplayText("测试测试", undefined, {
      enabled: false,
      language: "ja"
    })).toBe("测试测试");
  });

  it("translates enabled message text without changing unknown free text or whitespace", () => {
    expect(getImMessageDisplayText("测试测试", undefined, {
      enabled: true,
      language: "ja"
    })).toBe("テストテスト");
    expect(getImMessageDisplayText("  free text  ", undefined, {
      enabled: true,
      language: "ja"
    })).toBe("  free text  ");
  });

  it("translates only rich text segments and preserves judgement tokens without mutating raw input", () => {
    const richText: MessageExt["richText"] = {
      version: 1,
      parts: [
        { type: "judgement", value: "Done" },
        { type: "text", value: "测试" },
        { type: "judgement", value: "OK" }
      ]
    };
    const originalParts = richText.parts.map((part) => ({ ...part }));

    expect(getImMessageDisplayParts("Done测试OK", richText, {
      enabled: true,
      language: "ja"
    })).toEqual([
      { type: "judgement", value: "Done" },
      { type: "text", value: "テスト" },
      { type: "judgement", value: "OK" }
    ]);
    expect(getImMessageDisplayText("Done测试OK", richText, {
      enabled: true,
      language: "ja"
    })).toBe("DoneテストOK");
    expect(richText.parts).toEqual(originalParts);
  });

  it("translates a confirmed conversation preview only when enabled", () => {
    expect(getImPreviewDisplayText("测试测试", {
      enabled: false,
      language: "ja"
    })).toBe("测试测试");
    expect(getImPreviewDisplayText("测试测试", {
      enabled: true,
      language: "ja"
    })).toBe("テストテスト");
  });

  it("uses authoritative message type instead of text patterns for preview provenance", () => {
    expect(isImUserGeneratedConversationPreview({
      lastMessageType: "text",
      lastMessageStatus: "sent",
    })).toBe(true);
    expect(isImUserGeneratedConversationPreview({
      lastMessageType: "text",
      lastMessageStatus: "sending",
    })).toBe(true);
    expect(isImUserGeneratedConversationPreview({
      lastMessageType: "text",
      lastMessageStatus: "recalled",
    })).toBe(false);
  });

  it.each([
    "image",
    "video",
    "voice",
    "file",
    "contact-card",
    "service-card",
    "schedule-invite",
    "system",
    "recalled",
  ] as const)("keeps an authoritative %s preview outside user-text translation", (lastMessageType) => {
    expect(isImUserGeneratedConversationPreview({
      lastMessageType,
      lastMessageStatus: lastMessageType === "recalled" ? "recalled" : "sent",
    })).toBe(false);
  });

  it("does not demote genuine user text that contains metadata-looking words", () => {
    const content = "系统消息 语音通话 changed left";

    expect(isImUserGeneratedConversationPreview({
      lastMessageType: "text",
      lastMessageStatus: "sent",
    })).toBe(true);
    expect(getImPreviewDisplayText(content, {
      enabled: true,
      language: "ja",
    })).toBe("システムメッセージ 音声通話 changed left");
  });

  it("copies visible text without mutating the stored message", () => {
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

    expect(getImMessageCopyText(message, "", {
      enabled: false,
      language: "ja"
    })).toBe("测试测试");
    expect(getImMessageCopyText(message, "", {
      enabled: true,
      language: "ja"
    })).toBe("テストテスト");
    expect(message).toEqual(original);
  });

  it("keeps selected visible text ahead of automatic translation", () => {
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

    expect(getImMessageCopyText(message, "選択した表示文字", {
      enabled: true,
      language: "ja"
    })).toBe("選択した表示文字");
  });

  it("copies translated media captions while preserving non-text fallbacks", () => {
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

    expect(getImMessageCopyText(captionedImage, "", {
      enabled: true,
      language: "ja"
    })).toBe("テストテスト");
    expect(getImMessageCopyText(fileMessage, "", {
      enabled: true,
      language: "ja"
    })).toBe("文件");
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

    expect(getImMessageCopyText(captionedImage, "", {
      enabled: true,
      language: "ja"
    })).toBe("  テストテスト  ");
    expect(getImMessageCopyText(blankCaptionFile, "", {
      enabled: true,
      language: "ja"
    })).toBe("文件");
  });
});
