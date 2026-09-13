import { useRef, useState } from "react";
import { IconMetricAction } from "../../components/client-ui/AppScaffold";
import {
  toggleFavoriteOptimistically,
  type EntityFavoriteState,
  type EntityTarget
} from "../../features/entity-engagement/api";
import type { Language } from "../../i18n/translations";

export type EntitySearchCardActionsProps = EntityTarget & {
  favoriteCount: number;
  isFavorited: boolean;
  language?: Language;
  onFavoriteChange: (state: EntityFavoriteState) => void;
  onSystemShare: () => Promise<void>;
  shareCount: number;
  size?: "cluster" | "compactLg";
  targetLabel: string;
};

const actionCopyByLanguage: Record<Language, { favorite: string; removeFavorite: string; share: string }> = {
  zh: { favorite: "收藏", removeFavorite: "取消收藏", share: "分享" },
  "zh-Hant": { favorite: "收藏", removeFavorite: "取消收藏", share: "分享" },
  ja: { favorite: "お気に入り", removeFavorite: "お気に入りから削除", share: "シェア" },
  en: { favorite: "Favorite", removeFavorite: "Remove favorite", share: "Share" },
  ko: { favorite: "즐겨찾기", removeFavorite: "즐겨찾기 해제", share: "공유" }
};

export function formatEntityEngagementCount(value: number) {
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return safeValue >= 1_000 ? `${Math.floor(safeValue / 1_000)}k` : `${safeValue}`;
}

export function EntitySearchCardActions({
  favoriteCount,
  isFavorited,
  language = "zh",
  onFavoriteChange,
  onSystemShare,
  publicId,
  shareCount,
  size = "cluster",
  targetLabel,
  targetType
}: EntitySearchCardActionsProps) {
  const [favoritePending, setFavoritePending] = useState(false);
  const [sharePending, setSharePending] = useState(false);
  const favoriteLockRef = useRef(false);
  const shareLockRef = useRef(false);
  const copy = actionCopyByLanguage[language];

  const handleFavorite = async () => {
    if (favoriteLockRef.current) return;

    favoriteLockRef.current = true;
    setFavoritePending(true);
    try {
      await toggleFavoriteOptimistically({
        authoritative: { targetType, publicId, favoriteCount, isFavorited },
        nextIsFavorited: !isFavorited,
        onState: onFavoriteChange
      });
    } catch {
      // The optimistic helper has already restored the last authoritative state.
    } finally {
      favoriteLockRef.current = false;
      setFavoritePending(false);
    }
  };

  const handleShare = async () => {
    if (shareLockRef.current) return;

    shareLockRef.current = true;
    setSharePending(true);
    try {
      await onSystemShare();
    } catch {
      // The share capability and API layer surface their own user feedback.
    } finally {
      shareLockRef.current = false;
      setSharePending(false);
    }
  };

  return (
    <div
      className="flex shrink-0 items-start -space-x-[4px]"
      data-entity-search-actions
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <IconMetricAction
        active={isFavorited}
        count={formatEntityEngagementCount(favoriteCount)}
        disabled={favoritePending}
        icon="heart"
        label={`${isFavorited ? copy.removeFavorite : copy.favorite} ${targetLabel}`}
        onClick={() => void handleFavorite()}
        size={size}
      />
      <IconMetricAction
        count={formatEntityEngagementCount(shareCount)}
        disabled={sharePending}
        icon="share"
        label={`${copy.share} ${targetLabel}`}
        onClick={() => void handleShare()}
        size={size}
      />
    </div>
  );
}
