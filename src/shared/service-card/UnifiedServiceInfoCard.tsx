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

const formatPrice = (amount: number, currency: string) => {
  const value = new Intl.NumberFormat("ja-JP", {
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? Math.max(0, amount) : 0);
  return currency.toUpperCase() === "JPY"
    ? `￥${value}`
    : `${currency.toUpperCase()} ${value}`;
};

const formatDuration = (value: number | null, minute: string, unavailable: string) =>
  value !== null && Number.isFinite(value) && value > 0
    ? `${value}${minute}`
    : unavailable;
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
    <UnifiedCardImage alt={data.name} language={language} src={data.coverUrl}>
      <span
        className="absolute left-4 top-4 rounded-full bg-black/80 px-4 py-2 text-[15px] font-black text-[#f7f9f7]"
        data-testid="unified-card-duration-overlay"
      >
        {formatDuration(data.durationMinutes, text.minute, text.durationUnavailable)}
      </span>
      <strong
        className="absolute bottom-0 left-0 rounded-tr-[34px] bg-black/80 px-5 py-3 text-[clamp(24px,7vw,42px)] font-black tracking-[-0.04em] text-[#b8ff4a]"
        data-testid="unified-card-price-overlay"
      >
        {formatPrice(data.priceAmount, data.currency)}
      </strong>
    </UnifiedCardImage>
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
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
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
