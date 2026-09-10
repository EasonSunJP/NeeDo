import { buildSocialPostShareCardMetadata } from "../src/utils/social-post-share-card";

describe("social post share card metadata", () => {
  it("snapshots the first media kind and thumbnail for forwarded post rendering", () => {
    expect(
      buildSocialPostShareCardMetadata({
        authorAvatar: "/media/content/avatar.webp",
        authorName: "LifeDance",
        firstMedia: {
          thumbnailUrl: "/media/content/poster.webp",
          type: "video",
          url: "/media/content/demo.mp4",
        },
        postId: 701,
        text: "季节视频",
      }),
    ).toEqual({
      needoMessageType: "social-post-card",
      needoMessageExt: {
        socialPostCard: {
          authorAvatar: "/media/content/avatar.webp",
          authorName: "LifeDance",
          mediaThumbnailUrl: "/media/content/poster.webp",
          mediaType: "video",
          mediaUrl: "/media/content/demo.mp4",
          postId: "701",
          text: "季节视频",
        },
      },
    });
  });

  it("omits invalid optional media fields instead of inventing a preview", () => {
    expect(
      buildSocialPostShareCardMetadata({
        authorAvatar: "",
        authorName: "LifeDance",
        firstMedia: { type: "audio", url: 123 },
        postId: 702,
        text: "文字动态",
      }),
    ).toEqual({
      needoMessageType: "social-post-card",
      needoMessageExt: {
        socialPostCard: {
          authorAvatar: "",
          authorName: "LifeDance",
          postId: "702",
          text: "文字动态",
        },
      },
    });
  });
});
