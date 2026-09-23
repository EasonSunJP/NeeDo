import { useState, type ImgHTMLAttributes } from "react";
import { DEFAULT_AVATAR_URL, resolveAvatarUrl } from "../../lib/defaultAvatar";
import { getGeneratedImageThumbnailUrl } from "../../lib/imageThumbnails";
import { cn } from "../../lib/utils";

type AvatarImageProps = ImgHTMLAttributes<HTMLImageElement>;

export function AvatarImage({ className, alt, src, onError, ...props }: AvatarImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const resolvedSrc = resolveAvatarUrl(src);
  const thumbnailSrc = getGeneratedImageThumbnailUrl(resolvedSrc);
  const imageSrc = failedSrc === resolvedSrc
    ? DEFAULT_AVATAR_URL
    : failedSrc === thumbnailSrc ? resolvedSrc : thumbnailSrc;

  return (
    <img
      alt={alt}
      className={cn("avatar-shape object-cover", className)}
      onError={(event) => {
        if (imageSrc !== DEFAULT_AVATAR_URL) setFailedSrc(imageSrc);
        onError?.(event);
      }}
      src={imageSrc}
      {...props}
    />
  );
}
