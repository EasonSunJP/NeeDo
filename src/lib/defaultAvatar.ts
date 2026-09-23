export const DEFAULT_AVATAR_URL = "/images/generated/profiles/dodo-default-avatar.webp";

export function resolveAvatarUrl(url: string | null | undefined) {
  return url?.trim() || DEFAULT_AVATAR_URL;
}
