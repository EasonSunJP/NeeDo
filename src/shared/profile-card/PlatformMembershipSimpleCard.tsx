import { useEffect, useState, type ReactNode } from "react";
import { coreReadApi } from "../../features/core-read/api";
import { useHomeLayoutStore } from "../../state/homeLayoutStore";
import { useHomeLocationPreference } from "../../state/homeLocationStore";
import type { SpecialReviewTag } from "./SpecialReviewIconRow";
import { UnifiedEntityInfoCard } from "./UnifiedEntityInfoCard";

export type PlatformMembershipSimpleCardProps = {
  actionSlot?: ReactNode;
  avatarUrl: string | null;
  bio: string;
  className?: string;
  completedOrderCount?: number | null;
  displayName: string;
  ekycVerified: boolean;
  entityKind: "customer" | "technician" | "shop" | "service";
  entityPublicId?: string | null;
  favoriteCount?: number | null;
  languages?: string[];
  level: number | null;
  needoId: string;
  onOpenDetails?: () => void;
  rating?: number | null;
  reviewCount?: number | null;
  shareCount?: number | null;
  simpleBottomColor?: string | null;
  simpleTopColor?: string | null;
  specialReviewTags?: SpecialReviewTag[];
};

function useTechnicianDistance(
  entityKind: PlatformMembershipSimpleCardProps["entityKind"],
  publicId: string | null | undefined,
) {
  const { config } = useHomeLayoutStore();
  const { state: locationPreference } = useHomeLocationPreference();
  const selectedLocation =
    config.locations.find((location) => location.id === config.selectedLocationId) ??
    config.locations[0];
  const coordinates =
    locationPreference.coordinates ?? selectedLocation?.coordinates;
  const [distanceKm, setDistanceKm] = useState<number | null>(null);

  useEffect(() => {
    if (
      entityKind !== "technician" ||
      !publicId ||
      !/^s\d{10}$/u.test(publicId) ||
      !coordinates
    ) {
      setDistanceKm(null);
      return;
    }
    let active = true;
    void coreReadApi
      .getTechnicianDetail(publicId, {
        latitude: coordinates.lat,
        longitude: coordinates.lng,
      })
      .then((detail) => {
        if (active) setDistanceKm(detail.distanceKm ?? null);
      })
      .catch(() => {
        if (active) setDistanceKm(null);
      });
    return () => {
      active = false;
    };
  }, [coordinates?.lat, coordinates?.lng, entityKind, publicId]);

  return distanceKm;
}

/**
 * Compatibility name retained because membership and IM flows already import
 * it. Theme colors and level no longer create a second card design.
 */
export function PlatformMembershipSimpleCard(
  props: PlatformMembershipSimpleCardProps,
) {
  const publicId = props.entityPublicId ?? null;
  const distanceKm = useTechnicianDistance(props.entityKind, publicId);
  const kind =
    props.entityKind === "technician"
      ? "technician"
      : props.entityKind === "shop" || props.entityKind === "service"
        ? "shop"
        : "user";
  const engagementTarget =
    kind === "technician" && publicId && /^s\d{10}$/u.test(publicId)
      ? { targetType: "technician" as const, publicId }
      : kind === "shop" && publicId && /^shop\d{10}$/u.test(publicId)
        ? { targetType: "shop" as const, publicId }
        : null;

  return (
    <UnifiedEntityInfoCard
      actionSlot={props.actionSlot}
      className={props.className}
      data={{
        kind,
        id: publicId ?? props.needoId,
        name: props.displayName,
        imageUrl: props.avatarUrl,
        description: props.bio || null,
        languages: props.languages ?? [],
        tags: [],
        rating: props.rating ?? null,
        reviewCount: props.reviewCount ?? null,
        completedOrderCount: props.completedOrderCount ?? null,
        distanceKm,
        favoriteCount: props.favoriteCount ?? null,
        shareCount: props.shareCount ?? null,
        engagementTarget,
        specialReviewTags: props.specialReviewTags ?? [],
      }}
      onOpenDetails={props.onOpenDetails}
      showLanguageTags={false}
    />
  );
}
