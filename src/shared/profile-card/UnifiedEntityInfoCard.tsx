import { useEffect, useState, type ReactNode } from "react";
import { AppIcon } from "../../components/client-ui/AppScaffold";
import type { Language } from "../../i18n/translations";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { cn } from "../../lib/utils";
import type {
  EntityFavoriteState,
  EntityTarget,
} from "../../features/entity-engagement/api";
import {
  UnifiedCardDetails,
  UnifiedDistanceMetricValue,
  UnifiedCardImage,
  UnifiedInfoCardFrame,
  type UnifiedCardMetric,
} from "../info-card-system/UnifiedInfoCardFrame";
import { getUnifiedCardCopy } from "../info-card-system/copy";
import {
  SpecialReviewIconRow,
  type SpecialReviewTag,
} from "./SpecialReviewIconRow";
import {
  loadServiceFavoriteState,
  ServiceFavoriteAction,
  ServiceShareAction,
} from "../service-card/ServiceCardEngagementActions";
import { formatCompactCount } from "../engagement/formatCompactCount";

export type UnifiedEntityInfoCardData = {
  kind: "shop" | "technician" | "user";
  id: string;
  name: string;
  imageUrl: string | null;
  description: string | null;
  address?: string | null;
  languages: string[];
  tags: string[];
  rating?: number | null;
  reviewCount?: number | null;
  completedOrderCount?: number | null;
  distanceKm?: number | null;
  favoriteCount?: number | null;
  shareCount?: number | null;
  engagementTarget?: EntityTarget | null;
  isFavorited?: boolean;
  specialReviewTags?: SpecialReviewTag[];
};

const metricValue = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "-"
    : formatCompactCount(value);
const ratingValue = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "-"
    : value.toFixed(1);

export function UnifiedEntityInfoCard({
  actionSlot,
  className,
  data,
  density = "default",
  detailTo,
  nameSuffix,
  language: languageOverride,
  onOpenDetails,
  showMetrics = true,
  showLanguageTags = true,
}: {
  actionSlot?: ReactNode;
  className?: string;
  data: UnifiedEntityInfoCardData;
  density?: "default" | "compact";
  detailTo?: string;
  nameSuffix?: ReactNode;
  language?: Language;
  onOpenDetails?: () => void;
  showMetrics?: boolean;
  showLanguageTags?: boolean;
}) {
  const { language: currentLanguage } = useOptionalI18n();
  const language = languageOverride ?? currentLanguage;
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
    if (
      !target ||
      data.isFavorited === undefined ||
      data.favoriteCount === null ||
      data.favoriteCount === undefined
    ) return;
    setFavoriteState({
      ...target,
      isFavorited: data.isFavorited,
      favoriteCount: data.favoriteCount,
    });
  }, [
    data.favoriteCount,
    data.isFavorited,
    target?.publicId,
    target?.targetType,
  ]);
  useEffect(() => {
    if (!target || data.isFavorited !== undefined) return;
    let active = true;
    void loadServiceFavoriteState(target)
      .then((state) => {
        if (active && state) setFavoriteState(state);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [data.isFavorited, target?.publicId, target?.targetType]);
  const favoriteMetric: UnifiedCardMetric = {
    icon: "heart",
    label: text.favorite,
    value: metricValue(favoriteState?.favoriteCount ?? data.favoriteCount),
    ...(favoriteState
      ? {
          action: (
            <ServiceFavoriteAction
              language={language}
              onChange={setFavoriteState}
              state={favoriteState}
              targetLabel={data.name}
            />
          ),
        }
      : {}),
  };
  const shareMetric: UnifiedCardMetric = {
    icon: "share",
    label: text.share,
    value: metricValue(shareCount),
    ...(target
      ? {
          action: (
            <ServiceShareAction
              language={language}
              onShareCountChange={setShareCount}
              target={target}
              targetLabel={data.name}
            />
          ),
        }
      : {}),
  };
  const metrics: UnifiedCardMetric[] =
    data.kind === "user"
      ? []
      : data.kind === "shop"
        ? [
            {
              icon: "star",
              label: text.rating,
              value: ratingValue(data.rating),
            },
            {
              icon: "completed",
              label: text.completedOrders,
              value: metricValue(data.completedOrderCount),
            },
            {
              icon: "map",
              label: text.distance,
              value: <UnifiedDistanceMetricValue value={data.distanceKm} />,
            },
            favoriteMetric,
            shareMetric,
          ]
        : [
            {
              icon: "star",
              label: text.rating,
              value: ratingValue(data.rating),
            },
            {
              icon: "completed",
              label: text.completedOrders,
              value: metricValue(data.completedOrderCount),
            },
            {
              icon: "map",
              label: text.distance,
              value: <UnifiedDistanceMetricValue value={data.distanceKm} />,
            },
            favoriteMetric,
            shareMetric,
          ];
  const detailTags = [
    ...(showLanguageTags ? data.languages : []),
    ...data.tags,
  ];
  const details = (
    <UnifiedCardDetails
      afterDescription={data.kind === "technician" ? (
        <SpecialReviewIconRow tags={data.specialReviewTags ?? []} />
      ) : undefined}
      description={data.description}
      density={density === "compact" || data.kind === "user" ? "name-card" : "default"}
      language={language}
      name={data.name}
      showEmptyTags={showLanguageTags}
      tags={detailTags}
    >
      {nameSuffix}
      {data.kind === "shop" && data.address ? (
        <p className="mt-1 flex items-center gap-1.5 text-[10px] font-bold leading-4 text-[color:var(--client-muted)] sm:mt-2 sm:gap-2 sm:text-[14px] sm:leading-5">
          <span
            className="shrink-0 text-[color:var(--client-primary)]"
            data-testid="unified-card-location-icon"
          >
            <AppIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" name="map" />
          </span>
          {data.address}
        </p>
      ) : null}
    </UnifiedCardDetails>
  );
  return (
    <UnifiedInfoCardFrame
      actionSlot={actionSlot}
      ariaLabel={`${data.kind === "shop" ? text.viewShop : data.kind === "technician" ? text.viewTechnician : text.viewUser} ${data.name}`}
      body={
        <div
          className={cn(
            "grid",
            density === "compact"
              ? "grid-cols-[72px_minmax(0,1fr)] gap-3 p-3 pr-11"
              : `grid-cols-[minmax(132px,38%)_minmax(0,1fr)] gap-3 p-3 sm:gap-7 sm:p-6 ${data.kind === "user" ? "" : "pt-0 sm:pt-0"}`,
          )}
          data-testid="unified-card-body"
        >
          <UnifiedCardImage alt={data.name} avatar={data.kind === "user" || data.kind === "technician"} language={language} src={data.imageUrl} />
          {details}
        </div>
      }
      className={className}
      density={density}
      detailTo={detailTo}
      kind={data.kind}
      metrics={showMetrics ? metrics : []}
      onOpenDetails={onOpenDetails}
    />
  );
}
