import { BaseInfoCard } from "../info-card";
import type { InfoCardData, InfoCardVariant } from "../info-card";
import type { ExchangeIntelligencePublisherProfileProjection } from "./types";

function finiteMetric(value: string | null) {
  if (value === null) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function mapExchangeIntelligencePublisherToProfileData(
  publisher: ExchangeIntelligencePublisherProfileProjection,
  serviceModeLabel: string,
  labels: {
    entity: string;
    bookable: string;
    unavailable: string;
    rating: string;
    reviews: string;
    serviceMode: string;
    completedOrders: string;
    acceptanceRate: string;
    experience: string;
  }
): InfoCardData {
  if (publisher.type === "shop") {
    const rating = finiteMetric(publisher.ratingAverage);
    return {
      id: publisher.publicId,
      entityType: "shop",
      coverImage: publisher.coverUrl ?? publisher.imageUrls[0],
      avatar: publisher.avatarUrl ?? undefined,
      displayName: publisher.name,
      subtitle: publisher.publicId,
      region: publisher.address,
      serviceArea: publisher.address,
      status: publisher.status,
      isBookable: publisher.isBookable,
      rating,
      ratingType: "店铺评分",
      reviewCount: publisher.reviewCount,
      tags: [serviceModeLabel],
      badgeList: [
        { label: labels.entity, tone: "neutral" },
        { label: publisher.isBookable ? labels.bookable : labels.unavailable, tone: publisher.isBookable ? "success" : "warning" }
      ],
      metaLines: [`ID ${publisher.publicId}`, publisher.address],
      metricList: [
        { label: labels.rating, value: rating === undefined ? "—" : rating.toFixed(1), tone: "accent" },
        { label: labels.reviews, value: `${publisher.reviewCount}`, tone: "neutral" },
        { label: labels.serviceMode, value: serviceModeLabel, tone: "success" }
      ],
      highlightChips: [serviceModeLabel],
      detailPath: publisher.detailPath,
      addressSummary: publisher.address,
      reservable: publisher.isBookable
    };
  }

  const rating = finiteMetric(publisher.ratingAverage);
  return {
    id: publisher.publicId,
    entityType: "technician",
    avatar: publisher.avatarUrl ?? undefined,
    coverImage: publisher.avatarUrl ?? undefined,
    displayName: publisher.displayName,
    subtitle: `${publisher.publicId} · ${publisher.shop.name}`,
    region: [publisher.serviceAreas[0], labels.experience].filter(Boolean).join(" · "),
    serviceArea: publisher.serviceAreas.join("、"),
    status: publisher.status,
    isBookable: publisher.isBookable,
    rating,
    ratingType: "服务评分",
    reviewCount: publisher.reviewCount,
    tags: [...publisher.languages, ...publisher.serviceAreas],
    badgeList: [
      { label: labels.entity, tone: "neutral" },
      { label: publisher.isBookable ? labels.bookable : labels.unavailable, tone: publisher.isBookable ? "success" : "warning" }
    ],
    metaLines: [
      `ID ${publisher.publicId}`,
      `${publisher.shop.name} · ${publisher.shop.publicId}`,
      labels.experience
    ],
    metricList: [
      { label: labels.rating, value: rating === undefined ? "—" : rating.toFixed(1), tone: "accent" },
      { label: labels.completedOrders, value: publisher.completedOrderCount === null ? "—" : `${publisher.completedOrderCount}`, tone: "neutral" },
      { label: labels.acceptanceRate, value: publisher.acceptanceRatePercent === null ? "—" : `${publisher.acceptanceRatePercent}%`, tone: "success" }
    ],
    highlightChips: [...publisher.languages, ...publisher.serviceAreas],
    detailPath: publisher.detailPath,
    languages: publisher.languages,
    acceptanceRate: publisher.acceptanceRatePercent ?? undefined
  };
}

export function UnifiedProfileCard({
  data,
  variant,
  dark,
  detailTo,
  onOpenDetails
}: {
  data: InfoCardData;
  variant: InfoCardVariant;
  dark?: boolean;
  detailTo?: string;
  onOpenDetails?: () => void;
}) {
  return <BaseInfoCard dark={dark} data={data} detailTo={detailTo} onOpenDetails={onOpenDetails} variant={variant} />;
}
