import { describe, expect, it } from "@jest/globals";
import {
  CHAT_RECORD_SNAPSHOT_MESSAGE_TYPES,
  parseChatRecordSourcePolicy
} from "../src/services/im-chat-record-source.policy";

describe("IM chat-record authoritative snapshot type contract", () => {
  it("locks every formal ordinary rich message type and excludes recursive or lifecycle rows", () => {
    expect(CHAT_RECORD_SNAPSHOT_MESSAGE_TYPES).toEqual([
      "text",
      "emoji",
      "image",
      "video",
      "voice",
      "file",
      "location",
      "contact-card",
      "service-card",
      "schedule-invite"
    ]);
    expect(CHAT_RECORD_SNAPSHOT_MESSAGE_TYPES).not.toContain("chat-record");
    expect(CHAT_RECORD_SNAPSHOT_MESSAGE_TYPES).not.toContain("system");
    expect(CHAT_RECORD_SNAPSHOT_MESSAGE_TYPES).not.toContain("recalled");
  });

  const contentCases: Array<[string, unknown]> = [
    ["text", undefined],
    ["emoji", { needoMessageType: "emoji" }],
    [
      "location",
      {
        needoMessageType: "location",
        needoMessageExt: {
          location: { title: "新宿駅", address: "東京都", latitude: 35.69, longitude: 139.7 }
        }
      }
    ],
    [
      "contact-card",
      {
        needoMessageType: "contact-card",
        needoMessageExt: {
          contactCard: { userId: "u1", displayName: "A", avatar: "/a.jpg", profileKind: "person" }
        }
      }
    ],
    [
      "service-card",
      {
        needoMessageType: "service-card",
        needoMessageExt: {
          serviceCard: { serviceId: "s1", name: "护理", cover: "/c.jpg", summary: "介绍", priceLabel: "¥1" }
        }
      }
    ],
    [
      "schedule-invite",
      {
        needoMessageType: "schedule-invite",
        needoMessageExt: {
          scheduleInvite: { scheduleId: "sc1", title: "会面", date: "2026-09-01", timeRange: "10:00" }
        }
      }
    ]
  ];

  it.each(contentCases)("accepts and sanitizes %s metadata", (expectedType, metadata) => {
    const policy = parseChatRecordSourcePolicy("text", metadata);
    expect(policy).toMatchObject({ messageType: expectedType });
    expect(JSON.stringify(policy)).not.toContain("needoMessageType");
  });

  it("copies a formal V2 contact-card snapshot into an immutable chat-record display snapshot", () => {
    const contactCard = {
      targetUserPublicId: "user-public-id",
      needoId: "u0000000041",
      nickname: "山田太郎",
      avatarUrl: "/media/avatar.jpg",
      entityKind: "customer",
      ekycVerified: true,
      level: 38,
      bio: "自己紹介",
      tierCode: "gold",
      themeVersionPublicId: "tier-version",
      simpleTopColor: "#09251F",
      simpleBottomColor: "#10242D"
    };

    expect(parseChatRecordSourcePolicy("text", {
      snapshotVersion: 2,
      type: "contact-card",
      contactCard
    })).toEqual({
      kind: "content",
      messageType: "contact-card",
      snapshotMetadata: {
        snapshotVersion: 1,
        type: "contact-card",
        display: { contactCard: { snapshotVersion: 2, ...contactCard } }
      }
    });
  });

  const mediaCases: Array<["image" | "video" | "voice" | "file", string]> = [
    ["image", "image/png"],
    ["video", "video/mp4"],
    ["voice", "audio/webm"],
    ["file", "application/pdf"]
  ];

  it.each(mediaCases)("accepts protected %s media without copying its source locator into snapshot metadata", (type, mimeType) => {
    const policy = parseChatRecordSourcePolicy("text", {
      needoMessageType: type,
      needoMessageExt: {
        caption: "说明",
        fileName: `safe-${type}`,
        fileSize: 16,
        mimeType,
        url: `/media/im/private-${type}`
      }
    });
    expect(policy).toMatchObject({ kind: "media", messageType: type, media: { mimeType, fileSize: 16 } });
    expect(JSON.stringify(policy?.snapshotMetadata)).not.toContain("/media/im/");
  });

  it.each([
    { needoMessageType: "chat-record", needoMessageExt: {} },
    { needoMessageType: "system" },
    { needoMessageType: "image", needoMessageExt: { fileSize: 16, mimeType: "application/pdf", url: "/media/im/a.png" } },
    { needoMessageType: "location", needoMessageExt: { location: { title: "x" } } }
  ])("rejects recursive, system, mismatched-media, or incomplete rich metadata", (metadata) => {
    expect(parseChatRecordSourcePolicy("text", metadata)).toBeNull();
  });
});
