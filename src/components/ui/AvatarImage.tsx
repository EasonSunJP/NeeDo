import type { ImgHTMLAttributes } from "react";
import { getGeneratedImageThumbnailUrl } from "../../lib/imageThumbnails";
import { cn } from "../../lib/utils";

type AvatarImageProps = ImgHTMLAttributes<HTMLImageElement>;

export function AvatarImage({ className, alt, src, ...props }: AvatarImageProps) {
  return <img alt={alt} className={cn("avatar-shape object-cover", className)} src={typeof src === "string" ? getGeneratedImageThumbnailUrl(src) : src} {...props} />;
}
