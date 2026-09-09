import { useEffect, useState, type ReactNode } from "react";
import type { Language } from "../../i18n/translations";
import {
  UnifiedCardDetails,
  UnifiedCardImage,
  UnifiedInfoCardFrame,
  type UnifiedCardMetric,
} from "../info-card-system/UnifiedInfoCardFrame";
import { getUnifiedCardCopy } from "../info-card-system/copy";
import type { UnifiedServiceInfoCardData } from "./model";
import type { EntityFavoriteState } from "../../features/entity-engagement/api";
import {
  loadServiceFavoriteState,
  ServiceFavoriteAction,
  ServiceShareAction,
} from "./ServiceCardEngagementActions";

type UnifiedServiceInfoCardProps = {
  actionSlot?: ReactNode;
  className?: string;
  data: UnifiedServiceInfoCardData;
  detailTo?: string;
  language?: Language;
  onOpenDetails?: () => void;
};

const countLabel = (value: number | null | undefined, unavailable: string) =>
  value === null || value === undefined
    ? unavailable
    : new Intl.NumberFormat("zh-CN", {
        notation: value >= 10_000 ? "compact" : "standard",
        maximumFractionDigits: 1,
      }).format(Math.max(0, value));

const formatDistance = (value: number | null | undefined, unavailable: string) =>
  value !== null && value !== undefined && Number.isFinite(value)
    ? `${value.toFixed(value < 10 ? 1 : 0)}km`
    : unavailable;

export function UnifiedServiceInfoCard({
  actionSlot,
  className,
  data,
  detailTo,
  language = "zh",
  onOpenDetails,
}: UnifiedServiceInfoCardProps) {
  const text = getUnifiedCardCopy(language);
  const target = data.engagementTarget ?? null;
  const [favoriteState, setFavoriteState] =
    useState<EntityFavoriteState | null>(() =>
      target
        ? {
            ...target,
            isFavorited: data.isFavorited ?? false,
            favoriteCount: data.favoriteCount ?? 0,
          }
        : null,
    );
  const [shareCount, setShareCount] = useState(data.shareCount ?? null);
  useEffect(() => {
    if (!target) return;
    let active = true;
    void loadServiceFavoriteState(target)
      .then((state) => {
        if (active && state) setFavoriteState(state);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [target?.publicId, target?.targetType]);
  const metrics: UnifiedCardMetric[] = [
    {
      icon: "calendar",
      label: text.bookable,
      value:
        data.isBookable === false
          ? text.notBookable
          : data.isBookable === null || data.isBookable === undefined
            ? text.unavailable
            : text.bookable,
    },
    {
      icon: "moments",
      label: text.usage,
      value: countLabel(data.usageCount, text.unavailable),
    },
    {
      icon: "map",
      label: text.distanceToYou,
      value: formatDistance(data.distanceKm, text.distanceUnavailable),
    },
    {
      icon: "heart",
      label: text.favorite,
      value: countLabel(
        favoriteState?.favoriteCount ?? data.favoriteCount,
        text.unavailable,
      ),
      ...(favoriteState
        ? {
            action: (
              <ServiceFavoriteAction
                onChange={setFavoriteState}
                state={favoriteState}
                targetLabel={data.name}
              />
            ),
          }
        : {}),
    },
    {
      icon: "share",
      label: text.share,
      value: countLabel(shareCount, text.unavailable),
      ...(target
        ? {
            action: (
              <ServiceShareAction
                onShareCountChange={setShareCount}
                target={target}
                targetLabel={data.name}
              />
            ),
          }
        : {}),
    },
  ];
  const image = (
    <UnifiedCardImage alt={data.name} language={language} src={data.coverUrl} />
  );
  const details = (
    <UnifiedCardDetails
      description={data.description}
      language={language}
      name={data.name}
      tags={data.tags}
    />
  );
  return (
    <UnifiedInfoCardFrame
      actionSlot={actionSlot}
      ariaLabel={`${text.viewService} ${data.name}`}
      body={
        <div
          className="grid grid-cols-[minmax(110px,30%)_minmax(0,1fr)] gap-3 p-3 pt-0 sm:gap-7 sm:p-6 sm:pt-0"
          data-testid="unified-card-body"
        >
          {image}
          {details}
        </div>
      }
      className={className}
      detailTo={detailTo}
      kind="service"
      metrics={metrics}
      onOpenDetails={onOpenDetails}
    />
  );
}
