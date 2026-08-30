import { describe, expect, it } from "vitest";
import {
  buildMessagePreview,
  type ConversationMessage,
  type MessageExt,
} from "./model";

function message(
  type: ConversationMessage["type"],
  content: string,
  ext?: MessageExt,
): ConversationMessage {
  return {
    id: "message-1",
    localId: "message-1",
    conversationId: "conversation-1",
    senderId: "user-2",
    type,
    content,
    status: "sent",
    sentAt: "2026-08-30T00:00:00.000Z",
    clientSeq: 1,
    ext,
  };
}

describe("buildMessagePreview media summaries", () => {
  it.each([
    ["image", "图片"],
    ["video", "视频"],
    ["voice", "音频"],
  ] as const)("shows %s as its media type instead of its URL", (type, expected) => {
    const preview = buildMessagePreview(
      message(type, `https://media.example.test/${type}/opaque-resource`, {
        url: `https://media.example.test/${type}/opaque-resource`,
        caption: type === "image" ? "不会覆盖图片类型摘要" : undefined,
      }),
      "user-1",
      {},
    );

    expect(preview).toBe(expected);
    expect(preview).not.toContain("https://");
  });

  it("shows the original filename for PDF and other ordinary files", () => {
    const preview = buildMessagePreview(
      message("file", "https://media.example.test/files/opaque-resource", {
        fileName: "报价单.pdf",
        mimeType: "application/pdf",
        url: "https://media.example.test/files/opaque-resource",
      }),
      "user-1",
      {},
    );

    expect(preview).toBe("报价单.pdf");
  });

  it("uses the safe file label when the original filename is absent or blank", () => {
    expect(
      buildMessagePreview(
        message("file", "https://media.example.test/files/opaque-resource", {
          fileName: "   ",
          url: "https://media.example.test/files/opaque-resource",
        }),
        "user-1",
        {},
      ),
    ).toBe("文件");
  });

  it("keeps text previews unchanged", () => {
    expect(
      buildMessagePreview(message("text", "明天下午三点可以。"), "user-1", {}),
    ).toBe("明天下午三点可以。");
  });

  it.each([
    ["contact-card", { contactCard: { userId: "2", displayName: "系统消息", avatar: "", profileKind: "person" as const } }, "[名片] 系统消息"],
    ["service-card", { serviceCard: { serviceId: "3", name: "changed 服务", cover: "", summary: "", priceLabel: "¥1" } }, "[服务] changed 服务"],
    ["schedule-invite", { scheduleInvite: { scheduleId: "4", title: "left 日程", date: "2026-09-01", timeRange: "10:00" } }, "[日程邀请] left 日程"],
  ] as const)("keeps the %s preview text unchanged", (type, ext, expected) => {
    expect(buildMessagePreview(message(type, "", ext), "user-1", {})).toBe(expected);
  });
});
