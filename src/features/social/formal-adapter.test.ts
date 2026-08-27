import { describe, expect, it } from "vitest";
import type { RealtimeSocialPost } from "../realtime/api";
import { mapFormalSocialPost, mapFormalSocialProfiles } from "./formal-adapter";

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
});
