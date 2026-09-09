import { useEffect, useState, type ReactNode } from "react";
import { AppIcon } from "../../components/client-ui/AppScaffold";
import type { Language } from "../../i18n/translations";
import type {
  EntityFavoriteState,
  EntityTarget,
} from "../../features/entity-engagement/api";
import {
  UnifiedCardDetails,
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
    : `${value}`;
const distanceValue = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "-"
    : `${value.toFixed(value < 10 ? 1 : 0)}km`;

export function UnifiedEntityInfoCard({
  actionSlot,
  className,
  data,
  detailTo,
  language = "zh",
  onOpenDetails,
  showLanguageTags = true,
}: {
  actionSlot?: ReactNode;
  className?: string;
  data: UnifiedEntityInfoCardData;
  detailTo?: string;
  language?: Language;
  onOpenDetails?: () => void;
  showLanguageTags?: boolean;
}) {
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
              value: metricValue(data.rating),
            },
            {
              icon: "moments",
              label: text.reviews,
              value: metricValue(data.reviewCount),
            },
            {
              icon: "map",
              label: text.distance,
              value: distanceValue(data.distanceKm),
            },
            favoriteMetric,
            shareMetric,
          ]
        : [
            {
              icon: "star",
              label: text.rating,
              value: metricValue(data.rating),
            },
            {
              icon: "completed",
              label: text.completedOrders,
              value: metricValue(data.completedOrderCount),
            },
            {
              icon: "map",
              label: text.distance,
              value: distanceValue(data.distanceKm),
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
      language={language}
      name={data.name}
      showEmptyTags={showLanguageTags}
      tags={detailTags}
    >
      {data.kind === "shop" && data.address ? (
        <p className="mt-1 flex items-center gap-1.5 text-[10px] font-bold leading-4 text-[#9aacb5] sm:mt-2 sm:gap-2 sm:text-[14px] sm:leading-5">
          <span
            className="shrink-0 text-[#b8ff4a]"
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
          className={`grid grid-cols-[minmax(132px,38%)_minmax(0,1fr)] gap-3 p-3 sm:gap-7 sm:p-6 ${data.kind === "user" ? "" : "pt-0 sm:pt-0"}`}
          data-testid="unified-card-body"
        >
          <UnifiedCardImage alt={data.name} language={language} src={data.imageUrl} />
          {details}
        </div>
      }
      className={className}
      detailTo={detailTo}
      kind={data.kind}
      metrics={metrics}
      onOpenDetails={onOpenDetails}
    />
  );
}
