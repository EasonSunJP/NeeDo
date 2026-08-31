import { describe, expect, it } from "vitest";
import {
  formatImChatRecordPreview,
  formatImChatRecordTitle,
  formatImSelectedMessagesForClipboard,
  type ImChatRecordItem,
} from "./chat-records";

const sentAt = "2026-08-31T08:00:00.000Z";

function recordItem(
  overrides: Partial<ImChatRecordItem> = {},
): ImChatRecordItem {
  return {
    id: "11",
    position: 1,
    senderDisplayName: "最初の名前",
    senderAvatarUrl: null,
    messageType: "text",
    content: "第一行   内容",
    metadata: null,
    sentAt,
    ...overrides,
  };
}

describe("IM chat-record presentation helpers", () => {
  it("formats single, pair, and group titles from first-seen sender snapshots", () => {
    expect(formatImChatRecordTitle(["最初の名前"], "single")).toBe(
      "最初の名前",
    );
    expect(formatImChatRecordTitle(["最初", "第二"], "pair")).toBe(
      "最初、第二",
    );
    expect(formatImChatRecordTitle(["最初", "第二", "第三"], "group")).toBe(
      "最初、第二 等 3 人",
    );
  });

  it("builds a bounded two-line preview without exposing media paths", () => {
    const preview = formatImChatRecordPreview(
      [
        recordItem(),
        recordItem({
          id: "12",
          position: 2,
          senderDisplayName: "第二",
          messageType: "image",
          content: "/media/im/private-source.png",
          metadata: null,
        }),
        recordItem({ id: "13", position: 3, content: "第三行不进入摘要" }),
      ],
      {
        mediaPlaceholder: ({ mimeType }) =>
          mimeType.startsWith("image/") ? "[图片]" : "[媒体]",
      },
    );

    expect(preview).toBe("最初の名前: 第一行 内容\n第二: [图片]");
    expect(preview).not.toContain("/media/");
    expect(preview.length).toBeLessThanOrEqual(500);
  });

  it("copies chronological sender:content rows using caller-resolved display text", () => {
    expect(
      formatImSelectedMessagesForClipboard(
        [
          {
            id: "502",
            senderName: "第二",
            displayedText: "/media/im/private-source.png",
            messageType: "image",
            sentAt: "2026-08-31T08:02:00.000Z",
          },
          {
            id: "501",
            senderName: "最初",
            displayedText: "  当前显示的译文  ",
            messageType: "text",
            sentAt: "2026-08-31T08:01:00.000Z",
          },
        ],
        {
          mediaPlaceholder: (messageType) =>
            messageType === "image" ? "[图片]" : "[媒体]",
        },
      ),
    ).toBe("最初:当前显示的译文\n第二:[图片]");
  });
});
