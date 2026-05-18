const generatedImagePrefix = "/images/generated/";
const generatedThumbnailPrefix = "/images/generated/thumbnails/";
const thumbnailExtensionPattern = /\.(?:jpe?g|png|webp)$/i;

export function getGeneratedImageThumbnailUrl(url?: string) {
  if (
    !url ||
    url.startsWith("data:") ||
    url.startsWith("blob:") ||
    !url.startsWith(generatedImagePrefix) ||
    url.startsWith(generatedThumbnailPrefix) ||
    !thumbnailExtensionPattern.test(url)
  ) {
    return url ?? "";
  }

  return `${generatedThumbnailPrefix}${url.slice(generatedImagePrefix.length).replace(thumbnailExtensionPattern, ".jpg")}`;
}
