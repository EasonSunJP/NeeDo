import { describe, expect, it } from "vitest";
import type { RealtimeSocialPost } from "../realtime/api";
import {
  buildFormalSocialCreateMediaEnvelope,
  mapFormalSocialPost,
  mapFormalSocialProfiles
} from "./formal-adapter";

const formalPost: RealtimeSocialPost = {
  id: 81,
  authorUserId: 22,
  author: {
    userId: 22,
    username: "Mika Technician",
    displayName: "美香",
    avatarUrl: "/images/generated/profiles/ai-profile-01.jpg",
    entityType: "technician",
    joinedAt: "2025-02-03T04:05:06.000Z"
  },
  content: "肩颈护理前会先确认力度。#服务日常",
  createdAt: "2026-08-25T02:00:00.000Z",
  replyToPostId: null,
  replyCount: 4,
  media: {
    items: [
      {
        id: "media-video-1",
        type: "video",
        url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
        thumbnailUrl: "/images/generated/services/service-wellness-care.jpg",
        durationLabel: "0:30"
      }
    ],
    quotePostId: 42,
    postType: "quote",
    locationLabel: "东京 银座",
    counters: { likes: 28, replies: 4, reposts: 3, views: 918, bookmarks: 12 }
  },
  visibility: "public",
  viewerFollowsAuthor: true,
  authorFollowsViewer: true
};

describe("formal social adapter", () => {
  it("maps formal media envelopes and quote metadata into the complete social post model", () => {
    expect(mapFormalSocialPost(formalPost)).toEqual(
      expect.objectContaining({
        id: "81",
        authorId: "22",
        authorType: "technician",
        hashtags: ["服务日常"],
        quotePostId: "42",
        postType: "quote",
        locationLabel: "东京 银座",
        likeCount: 28,
        replyCount: 4,
        repostCount: 3,
        viewCount: 918,
        bookmarkCount: 12,
        media: [expect.objectContaining({ id: "media-video-1", type: "video" })]
      })
    );
  });

  it("prefers server-authoritative interaction counters and viewer state over legacy media snapshots", () => {
    const mapped = mapFormalSocialPost({
      ...formalPost,
      counters: { likes: 31, reposts: 7, views: 922, bookmarks: 15 },
      viewerInteraction: {
        liked: true,
        bookmarked: true,
        shared: true
      }
    });

    expect(mapped).toMatchObject({
      likeCount: 31,
      repostCount: 7,
      viewCount: 922,
      bookmarkCount: 15
    });
  });

  it("maps authoritative reply fields and valid rich text while safely dropping malformed metadata", () => {
    const mapped = mapFormalSocialPost({
      id: 701,
      authorUserId: 41,
      content: "确认Pending",
      createdAt: "2026-08-30T03:00:00.000Z",
      media: {
        items: [],
        richText: {
          version: 1,
          parts: [
            { type: "text", value: "确认" },
            { type: "judgement", value: "Pending" }
          ]
        }
      },
      replyToPostId: 700,
      replyCount: 2,
      visibility: "public"
    } as RealtimeSocialPost);

    expect(mapped).toMatchObject({
      replyToPostId: "700",
      replyCount: 2,
      richText: {
        version: 1,
        parts: [
          { type: "text", value: "确认" },
          { type: "judgement", value: "Pending" }
        ]
      }
    });
    expect(mapFormalSocialPost({
      ...formalPost,
      content: "确认Pending",
      media: { items: [], richText: { version: 1, parts: [{ type: "text", value: "确认Pending" }] } }
    }).richText).toBeUndefined();
  });

  it("keeps legacy array media readable and builds safe public author profiles", () => {
    const arrayMediaPost: RealtimeSocialPost = {
      ...formalPost,
      id: 82,
      media: [{ id: "image-1", type: "image", url: "/images/generated/stores/store-calm-body-room.jpg" }]
    };

    expect(mapFormalSocialPost(arrayMediaPost).media).toHaveLength(1);
    expect(mapFormalSocialProfiles([arrayMediaPost])).toEqual({
      "technician:22": expect.objectContaining({
        id: "22",
        entityType: "technician",
        displayName: "美香",
        avatar: "/images/generated/profiles/ai-profile-01.jpg",
        joinedAt: "2025-02-03T04:05:06.000Z"
      })
    });
  });

  it("restores editable asset references and reminder contacts from a persisted post", () => {
    const checksum = "c".repeat(64);
    const mapped = mapFormalSocialPost({
      ...formalPost,
      media: {
        items: [{ id: "image-1", type: "image", url: `/media/content/${checksum}.webp` }],
        mentionUserIds: [52, 74]
      }
    });

    expect(mapped.media).toEqual([
      expect.objectContaining({ id: "image-1", mediaAssetPublicId: checksum })
    ]);
    expect(mapped.mentionUserIds).toEqual([52, 74]);
  });

  it("builds a request-only image envelope from uploaded asset references", () => {
    const checksum = "a".repeat(64);

    expect(buildFormalSocialCreateMediaEnvelope({
      media: [
        {
          id: "m1",
          type: "image",
          url: `/media/content/${checksum}.png`,
          mediaAssetPublicId: checksum,
          alt: "Quiet room"
        }
      ],
      quotePostId: "42",
      postType: "quote",
      locationLabel: "东京 银座"
    })).toEqual({
      items: [{ id: "m1", type: "image", mediaAssetPublicId: checksum, alt: "Quiet room" }],
      quotePostId: 42,
      postType: "quote",
      locationLabel: "东京 银座"
    });
  });

  it("preserves valid structured rich text in formal create envelopes", () => {
    expect(buildFormalSocialCreateMediaEnvelope({
      media: [],
      richText: {
        version: 1,
        parts: [
          { type: "text", value: "确认" },
          { type: "judgement", value: "Pending" }
        ]
      }
    })).toEqual({
      items: [],
      richText: {
        version: 1,
        parts: [
          { type: "text", value: "确认" },
          { type: "judgement", value: "Pending" }
        ]
      }
    });
  });

  it("rejects previews and video items that do not have a formal image asset", () => {
    expect(() => buildFormalSocialCreateMediaEnvelope({
      media: [{ id: "m1", type: "image", url: "blob:preview" }]
    })).toThrow("error.social.media_upload_unavailable");
    expect(() => buildFormalSocialCreateMediaEnvelope({
      media: [{
        id: "v1",
        type: "video",
        url: "/media/content/video.mp4",
        mediaAssetPublicId: "a".repeat(64)
      }]
    })).toThrow("error.social.media_upload_unavailable");
  });
});
