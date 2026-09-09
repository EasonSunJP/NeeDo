import { useEffect, useState, type ReactNode } from "react";
import type { Language } from "../../i18n/translations";
import {
  UnifiedCardDetails,
  UnifiedDistanceMetricValue,
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

const countLabel = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "-"
    : new Intl.NumberFormat("zh-CN", {
        notation: value >= 10_000 ? "compact" : "standard",
        maximumFractionDigits: 1,
      }).format(Math.max(0, value));

const formatDuration = (
  value: number | null | undefined,
  minuteLabel: string,
) =>
  value !== null && value !== undefined && Number.isFinite(value)
    ? `${Math.max(0, value)}${minuteLabel}`
    : "-";

const formatPrice = (amount: number, currency: string) => {
  const normalizedAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  if (currency.toUpperCase() === "JPY") {
    return `￥${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(normalizedAmount)}`;
  }
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(normalizedAmount);
};

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
      target && data.favoriteCount !== null && data.favoriteCount !== undefined
        ? {
            ...target,
            isFavorited: data.isFavorited ?? false,
            favoriteCount: data.favoriteCount,
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
            ? "-"
            : text.bookable,
    },
    {
      icon: "moments",
      label: text.usage,
      value: countLabel(data.usageCount),
    },
    {
      icon: "map",
      label: text.distanceToYou,
      value: <UnifiedDistanceMetricValue value={data.distanceKm} />,
    },
    {
      icon: "heart",
      label: text.favorite,
      value: countLabel(favoriteState?.favoriteCount ?? data.favoriteCount),
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
      value: countLabel(shareCount),
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
        className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/80 px-2 py-1 text-[10px] font-black text-white backdrop-blur-sm sm:left-4 sm:top-4 sm:gap-2 sm:px-4 sm:py-2 sm:text-[16px]"
        data-testid="unified-card-duration-overlay"
      >
        <svg
          aria-hidden="true"
          className="h-3.5 w-3.5 text-[#b8ff4a] sm:h-6 sm:w-6"
          data-app-icon="clock"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.9" />
          <path d="M12 8v4.3l2.8 1.7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
        </svg>
        {formatDuration(data.durationMinutes, text.minute)}
      </span>
      <strong
        className="absolute bottom-0 left-0 rounded-bl-[18px] rounded-tr-[18px] bg-black/80 px-3 py-2 text-[17px] font-black text-[#b8ff4a] backdrop-blur-sm sm:rounded-bl-[24px] sm:rounded-tr-[28px] sm:px-6 sm:py-4 sm:text-[30px]"
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
        <div
          className="grid grid-cols-[minmax(132px,38%)_minmax(0,1fr)] gap-3 p-3 pt-0 sm:gap-7 sm:p-6 sm:pt-0"
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
      size="tall"
    />
  );
}
