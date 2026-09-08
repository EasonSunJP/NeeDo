import { getMerchantAdminPreview } from "../auth/merchantAdminPreview";
import { getAuthCredentialSnapshot } from "../auth/authCredentialCoordinator";

export const publicPersistentCacheScope = "public";

export function getAuthenticatedPersistentCacheScope() {
  const userId = getAuthCredentialSnapshot().expectedAuthUserId;
  if (!userId) return null;
  const previewShopId = getMerchantAdminPreview()?.selectedShopId ?? null;
  return previewShopId
    ? `account:${userId}:merchant-preview:${previewShopId}`
    : `account:${userId}`;
}

export function stablePersistentCacheKey(prefix: string, value: unknown) {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .filter(([, item]) => item !== undefined)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, normalize(item)])
      );
    }
    return input;
  };
  return `${prefix}:${JSON.stringify(normalize(value))}`;
}
