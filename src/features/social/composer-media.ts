import type { SocialMediaItem } from "./types";

export const socialImageUploadMaxBytes = 8 * 1024 * 1024;

const supportedSocialImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function getSocialImageValidationError(file: File) {
  if (!supportedSocialImageTypes.has(file.type)) {
    return "图片格式无效，请选择 JPEG、PNG 或 WebP。";
  }

  if (file.size > socialImageUploadMaxBytes) {
    return "图片不能超过 8 MiB。";
  }

  return null;
}

export function isSocialComposerPublishReady({
  text,
  media
}: {
  text: string;
  media: SocialMediaItem[];
}) {
  return text.trim().length > 0 || media.length > 0;
}

export function areSocialComposerMediaUploadsComplete(media: SocialMediaItem[]) {
  return media.every(hasFormalSocialMediaAsset);
}

export async function resolveSocialComposerMediaUploads(
  media: SocialMediaItem[],
  uploadTasks: ReadonlyMap<string, Promise<SocialMediaItem>>
) {
  const resolvedMedia = await Promise.all(media.map(async (item) => {
    if (hasFormalSocialMediaAsset(item)) {
      return item;
    }

    const uploadTask = uploadTasks.get(item.id);
    if (!uploadTask) {
      throw new Error("error.social.media_upload_unavailable");
    }

    return uploadTask;
  }));

  if (!areSocialComposerMediaUploadsComplete(resolvedMedia)) {
    throw new Error("error.social.media_upload_unavailable");
  }

  return resolvedMedia;
}

function hasFormalSocialMediaAsset(item: SocialMediaItem) {
  return item.type === "image" && /^[a-f0-9]{64}$/u.test(item.mediaAssetPublicId ?? "");
}

export function getSocialComposerErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes("error.social.media_upload_unavailable") ||
    message.includes("error.social.media_not_owned") ||
    message.includes("error.social.media_invalid")
  ) {
    return "图片上传失败，请重试。";
  }

  if (message.includes("error.social.media_too_large")) {
    return "图片不能超过 8 MiB。";
  }

  if (message.includes("error.social.invalid_mention_contact")) {
    return "联系人状态已变化，请刷新后重试。";
  }

  return "发布失败，请重试。";
}
