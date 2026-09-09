import { useEffect, useState, type ReactNode } from "react";
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

const metricValue = (value: number | null | undefined, unavailable: string) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? unavailable
    : `${value}`;
const distanceValue = (value: number | null | undefined, unavailable: string) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? unavailable
    : `${value.toFixed(value < 10 ? 1 : 0)}km`;

export function UnifiedEntityInfoCard({
  actionSlot,
  className,
  data,
  detailTo,
  language = "zh",
  onOpenDetails,
}: {
  actionSlot?: ReactNode;
  className?: string;
  data: UnifiedEntityInfoCardData;
  detailTo?: string;
  language?: Language;
  onOpenDetails?: () => void;
}) {
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
    if (!target || data.isFavorited === undefined) return;
    setFavoriteState({
      ...target,
      isFavorited: data.isFavorited,
      favoriteCount: data.favoriteCount ?? 0,
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
    value: metricValue(
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
  };
  const shareMetric: UnifiedCardMetric = {
    icon: "share",
    label: text.share,
    value: metricValue(shareCount, text.unavailable),
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
              value: metricValue(data.rating, text.unavailable),
            },
            {
              icon: "moments",
              label: text.reviews,
              value: metricValue(data.reviewCount, text.unavailable),
            },
            {
              icon: "map",
              label: text.distance,
              value: distanceValue(data.distanceKm, text.distanceUnavailable),
            },
            favoriteMetric,
            shareMetric,
          ]
        : [
            {
              icon: "star",
              label: text.rating,
              value: metricValue(data.rating, text.unavailable),
            },
            {
              icon: "moments",
              label: text.completedOrders,
              value: metricValue(data.completedOrderCount, text.unavailable),
            },
            {
              icon: "map",
              label: text.distance,
              value: distanceValue(data.distanceKm, text.distanceUnavailable),
            },
            favoriteMetric,
            shareMetric,
          ];
  const detailTags = [...data.languages, ...data.tags];
  const details = (
    <UnifiedCardDetails
      description={data.description}
      language={language}
      name={data.name}
      tags={detailTags}
    >
      {data.kind === "shop" && data.address ? (
        <p className="mt-1 flex items-start gap-1 text-[9px] font-bold leading-4 text-[#9aacb5] sm:mt-2 sm:gap-2 sm:text-[13px] sm:leading-5">
          <span className="text-[#b8ff4a]">⌖</span>
          {data.address}
        </p>
      ) : null}
      {data.kind === "technician" ? (
        <SpecialReviewIconRow tags={data.specialReviewTags ?? []} />
      ) : null}
    </UnifiedCardDetails>
  );
  return (
    <UnifiedInfoCardFrame
      actionSlot={actionSlot}
      ariaLabel={`${data.kind === "shop" ? text.viewShop : data.kind === "technician" ? text.viewTechnician : text.viewUser} ${data.name}`}
      body={
        <div className="grid grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
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
