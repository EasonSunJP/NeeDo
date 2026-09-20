import { httpClient } from "../../api/httpClient";
import { entityEngagementApi, type EntityTarget } from "../entity-engagement/api";
import { realtimeApi } from "../realtime/api";
import type {
  FavoriteItemType,
  FavoriteTab,
  UnifiedFavoritePage,
} from "./model";

export type FavoriteInteractionState = {
  itemType: FavoriteItemType;
  itemKey: string;
  pinnedAt: string | null;
  reaction: string | null;
  updatedAt: string;
};

function interactionPath(
  type: FavoriteItemType,
  itemKey: string,
  action: "pin" | "reaction",
) {
  return `/me/favorites/${encodeURIComponent(type)}/${encodeURIComponent(itemKey)}/${action}`;
}

function entityTarget(type: FavoriteItemType, itemKey: string): EntityTarget | null {
  if (!["shop", "technician", "service"].includes(type)) return null;
  const separator = itemKey.indexOf(":");
  const targetType = separator >= 0 ? itemKey.slice(0, separator) : type;
  const publicId = separator >= 0 ? itemKey.slice(separator + 1) : itemKey;
  if (
    targetType !== "shop" &&
    targetType !== "technician" &&
    targetType !== "service" &&
    targetType !== "technician_service"
  ) {
    return null;
  }
  return { targetType, publicId } as EntityTarget;
}

export const favoritesApi = {
  list(input: {
    type?: Exclude<FavoriteTab, "all">;
    query?: string;
    page?: number;
    pageSize?: number;
  } = {}) {
    return httpClient.request<UnifiedFavoritePage>("/me/favorites", {
      query: input,
    });
  },

  setPinned(type: FavoriteItemType, itemKey: string, active: boolean) {
    return httpClient.request<FavoriteInteractionState>(
      interactionPath(type, itemKey, "pin"),
      { method: active ? "PUT" : "DELETE" },
    );
  },

  setReaction(type: FavoriteItemType, itemKey: string, reaction: string | null) {
    return httpClient.request<FavoriteInteractionState>(
      interactionPath(type, itemKey, "reaction"),
      reaction === null
        ? { method: "DELETE" }
        : { method: "PUT", body: { reaction } },
    );
  },

  async removeSourceFavorite(type: FavoriteItemType, itemKey: string) {
    const target = entityTarget(type, itemKey);
    if (target) {
      await entityEngagementApi.setFavorite(target, false);
      return { deleted: true as const };
    }
    if (type === "social_post") {
      await realtimeApi.unbookmarkSocialPost(Number(itemKey));
      return { deleted: true as const };
    }
    if (type === "chat_record") {
      return realtimeApi.removeChatRecordFavorite(Number(itemKey));
    }
    throw new Error("error.favorite.unsupported_source");
  },
};
