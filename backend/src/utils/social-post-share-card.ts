type SocialPostShareCardInput = {
  authorAvatar: string;
  authorName: string;
  firstMedia?: unknown;
  postId: number;
  text: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function buildSocialPostShareCardMetadata(
  input: SocialPostShareCardInput,
) {
  const media = isRecord(input.firstMedia) ? input.firstMedia : undefined;
  const mediaUrl = typeof media?.url === "string" ? media.url : undefined;
  const mediaType =
    media?.type === "image" || media?.type === "video"
      ? media.type
      : undefined;
  const mediaThumbnailUrl =
    typeof media?.thumbnailUrl === "string" ? media.thumbnailUrl : undefined;

  return {
    needoMessageType: "social-post-card" as const,
    needoMessageExt: {
      socialPostCard: {
        postId: String(input.postId),
        authorName: input.authorName,
        authorAvatar: input.authorAvatar,
        text: input.text,
        ...(mediaUrl ? { mediaUrl } : {}),
        ...(mediaType ? { mediaType } : {}),
        ...(mediaThumbnailUrl ? { mediaThumbnailUrl } : {}),
      },
    },
  };
}
