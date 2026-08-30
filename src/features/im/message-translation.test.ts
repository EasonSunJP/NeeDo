import { describe, expect, it } from "vitest";
import {
  getImMessageCopyText,
  getImMessageDisplayParts,
  getImMessageDisplayText,
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
