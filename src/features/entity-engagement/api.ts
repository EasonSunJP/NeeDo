import { httpClient } from "../../api/httpClient";

export type EntityTarget =
  | { targetType: "shop"; publicId: string }
  | { targetType: "technician"; publicId: string };

export type EntityFavoriteState = EntityTarget & {
  isFavorited: boolean;
  favoriteCount: number;
};

export type EntityFavoriteListItem = EntityFavoriteState & {
  favoritedAt: string;
};

export type EntityShareReceipt = EntityTarget & {
  eventId: number;
  messageId: number | null;
  shareCount: number;
  replayed: boolean;
};

type EntityFavoritePage = {
  list: EntityFavoriteListItem[];
  total: number;
  page: number;
  page_size: number;
};

const targetPath = (prefix: string, target: EntityTarget) =>
  `${prefix}/${encodeURIComponent(target.targetType)}/${encodeURIComponent(target.publicId)}`;

function createIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi) {
    throw new Error("error.share.capability_unavailable");
  }
  if (typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export const entityEngagementApi = {
  setFavorite(target: EntityTarget, isFavorited: boolean) {
    return httpClient.request<EntityFavoriteState>(
      targetPath("/me/entity-favorites", target),
      { method: isFavorited ? "PUT" : "DELETE" },
    );
  },

  getFavoriteStatuses(targets: readonly EntityTarget[]) {
    if (targets.length < 1 || targets.length > 100) {
      return Promise.reject(
        new RangeError(
          "Favorite status batches must contain 1 to 100 targets.",
        ),
      );
    }
    return httpClient.request<{ list: EntityFavoriteState[] }>(
      "/me/entity-favorites/statuses",
      { method: "POST", body: { targets } },
    );
  },

  listFavorites(
    query: {
      page?: number;
      pageSize?: number;
      targetType?: EntityTarget["targetType"];
    } = {},
  ) {
    return httpClient.request<EntityFavoritePage>("/me/entity-favorites", {
      query,
    });
  },

  shareThroughNeedo(
    target: EntityTarget,
    input: {
      conversationId: number;
      recipientIdentityId: number;
      idempotencyKey: string;
    },
  ) {
    return httpClient.request<EntityShareReceipt>(
      `${targetPath("/entities", target)}/shares/needo`,
      { method: "POST", body: input },
    );
  },

  reportSuccessfulSystemShare(target: EntityTarget, idempotencyKey: string) {
    return httpClient.request<EntityShareReceipt>(
      `${targetPath("/entities", target)}/shares/system`,
      { method: "POST", body: { idempotencyKey } },
    );
  },
};

export async function toggleFavoriteOptimistically({
  authoritative,
  nextIsFavorited,
  onState,
}: {
  authoritative: EntityFavoriteState;
  nextIsFavorited: boolean;
  onState: (state: EntityFavoriteState) => void;
}): Promise<EntityFavoriteState> {
  const countDelta =
    authoritative.isFavorited === nextIsFavorited
      ? 0
      : nextIsFavorited
        ? 1
        : -1;
  onState({
    ...authoritative,
    isFavorited: nextIsFavorited,
    favoriteCount: Math.max(0, authoritative.favoriteCount + countDelta),
  });

  try {
    const result = await entityEngagementApi.setFavorite(
      authoritative,
      nextIsFavorited,
    );
    onState(result);
    return result;
  } catch (error) {
    onState(authoritative);
    throw error;
  }
}

export function createSystemShareAttempt({
  target,
  invokeCapability,
  idempotencyKey = createIdempotencyKey(),
}: {
  target: EntityTarget;
  invokeCapability: () => Promise<boolean>;
  idempotencyKey?: string;
}) {
  let capabilityState: "pending" | "succeeded" | "cancelled" = "pending";

  return {
    idempotencyKey,
    async execute(): Promise<EntityShareReceipt | null> {
      if (capabilityState === "cancelled") {
        return null;
      }
      if (capabilityState === "pending") {
        const succeeded = await invokeCapability();
        capabilityState = succeeded ? "succeeded" : "cancelled";
        if (!succeeded) {
          return null;
        }
      }
      return entityEngagementApi.reportSuccessfulSystemShare(
        target,
        idempotencyKey,
      );
    },
  };
}
