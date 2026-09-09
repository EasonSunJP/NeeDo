import type { ReactNode } from "react";
import { SocialProfileMiniCard } from "../profile-card/SocialProfileMiniCard";
import type { InfoCardData, InfoCardVariant } from "./types";

type BaseInfoCardProps = {
  data: InfoCardData;
  variant: InfoCardVariant;
  dark?: boolean;
  className?: string;
  detailTo?: string;
  onOpenDetails?: () => void;
  actionSlot?: ReactNode;
  trailingSlot?: ReactNode;
  footerSlot?: ReactNode;
  maxTags?: number;
};

/**
 * Compatibility entry point for legacy callers. Visual variants no longer
 * select different card designs: every simplified entity card is rendered by
 * the single unified information-card system.
 */
export function BaseInfoCard({
  actionSlot,
  className,
  data,
  detailTo,
  footerSlot,
  onOpenDetails,
}: BaseInfoCardProps) {
  return (
    <SocialProfileMiniCard
      actionSlot={actionSlot}
      className={className}
      data={data}
      detailTo={detailTo ?? data.detailPath}
      footerSlot={footerSlot}
      onOpenDetails={onOpenDetails}
    />
  );
}
