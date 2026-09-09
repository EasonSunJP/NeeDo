import { describe, expect, it } from "@jest/globals";
import { parseContactCardSnapshot } from "../src/domain/im-contact-card";

const validV2Metadata = {
  snapshotVersion: 2,
  type: "contact-card",
  contactCard: {
    targetUserPublicId: "user-public-id",
    needoId: "u0000000041",
    nickname: "山田太郎",
    avatarUrl: "/media/avatar.jpg",
    entityKind: "customer",
    entityPublicId: null,
    ekycVerified: true,
    level: 38,
    bio: "自己紹介",
    languages: [],
    rating: null,
    completedOrderCount: null,
    favoriteCount: null,
    shareCount: null,
    specialReviewTags: [],
    tierCode: "gold",
    themeVersionPublicId: "tier-version",
    simpleTopColor: "#09251F",
    simpleBottomColor: "#10242D"
  }
} as const;

describe("formal IM contact-card snapshots", () => {
  it("accepts the exact bounded V2 snapshot contract", () => {
    expect(parseContactCardSnapshot(validV2Metadata)).toEqual({
      kind: "v2",
      snapshot: validV2Metadata
    });
  });

  it.each([1, 100, null])("accepts customer level %s", (level) => {
    expect(
      parseContactCardSnapshot({
        ...validV2Metadata,
        contactCard: { ...validV2Metadata.contactCard, level }
      })
    ).toMatchObject({ kind: "v2" });
  });

  it("accepts nullable public display fields for non-customer identities", () => {
    expect(
      parseContactCardSnapshot({
        ...validV2Metadata,
        contactCard: {
          ...validV2Metadata.contactCard,
          avatarUrl: null,
          bio: null,
          entityKind: "technician",
          level: null,
          tierCode: null,
          themeVersionPublicId: null,
          simpleTopColor: null,
          simpleBottomColor: null
        }
      })
    ).toMatchObject({ kind: "v2" });
  });

  it.each([
    ["unknown top-level key", { ...validV2Metadata, privateEmail: "hidden@example.com" }],
    [
      "unknown card key",
      { ...validV2Metadata, contactCard: { ...validV2Metadata.contactCard, phone: "090" } }
    ],
    [
      "level below range",
      { ...validV2Metadata, contactCard: { ...validV2Metadata.contactCard, level: 0 } }
    ],
    [
      "level above range",
      { ...validV2Metadata, contactCard: { ...validV2Metadata.contactCard, level: 101 } }
    ],
    [
      "unsafe avatar URL",
      {
        ...validV2Metadata,
        contactCard: { ...validV2Metadata.contactCard, avatarUrl: "javascript:alert(1)" }
      }
    ],
    [
      "invalid top color",
      {
        ...validV2Metadata,
        contactCard: { ...validV2Metadata.contactCard, simpleTopColor: "green" }
      }
    ],
    [
      "invalid bottom color",
      {
        ...validV2Metadata,
        contactCard: { ...validV2Metadata.contactCard, simpleBottomColor: "#1234" }
      }
    ],
    [
      "oversized nickname",
      {
        ...validV2Metadata,
        contactCard: { ...validV2Metadata.contactCard, nickname: "名".repeat(161) }
      }
    ],
    [
      "oversized bio",
      { ...validV2Metadata, contactCard: { ...validV2Metadata.contactCard, bio: "自".repeat(501) } }
    ]
  ])("rejects %s", (_label, metadata) => {
    expect(parseContactCardSnapshot(metadata)).toEqual({ kind: "invalid" });
  });

  it("recognizes and sanitizes the current legacy contact-card shape", () => {
    expect(
      parseContactCardSnapshot({
        needoMessageType: "contact-card",
        needoMessageExt: {
          contactCard: {
            userId: "41",
            displayName: "旧名片",
            avatar: "/legacy.jpg",
            profileKind: "person",
            entityType: "user",
            entityId: "41",
            userIdLabel: "u0000000041",
            headline: "旧简介",
            ignored: "not copied"
          }
        }
      })
    ).toEqual({
      kind: "legacy",
      contactCard: {
        userId: "41",
        displayName: "旧名片",
        avatar: "/legacy.jpg",
        profileKind: "person",
        entityType: "user",
        entityId: "41",
        userIdLabel: "u0000000041",
        headline: "旧简介"
      }
    });
  });

  it.each([
    null,
    {},
    { snapshotVersion: 2, type: "contact-card" },
    { needoMessageType: "contact-card", needoMessageExt: { contactCard: { userId: "41" } } }
  ])("returns an invalid result for malformed metadata", (metadata) => {
    expect(parseContactCardSnapshot(metadata)).toEqual({ kind: "invalid" });
  });
});
