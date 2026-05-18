import type { ReactNode } from "react";
import type { Technician } from "../../types/domain";
import type { InfoCardVariant } from "./types";
import { UnifiedSimpleProfileCard } from "../profile-card/UnifiedSimpleProfileCard";

export function TechnicianInfoCard({
  technician,
  variant,
  dark,
  className,
  detailTo,
  onOpenDetails,
  actionSlot,
  trailingSlot,
  footerSlot,
  maxTags
}: {
  technician: Technician;
  variant: InfoCardVariant;
  dark?: boolean;
  className?: string;
  detailTo?: string;
  onOpenDetails?: () => void;
  actionSlot?: ReactNode;
  trailingSlot?: ReactNode;
  footerSlot?: ReactNode;
  maxTags?: number;
}) {
  return (
    <UnifiedSimpleProfileCard
      actionSlot={actionSlot}
      className={className}
      dark={dark}
      detailTo={detailTo}
      entityType="technician"
      footerSlot={footerSlot}
      maxTags={maxTags}
      onOpenDetails={onOpenDetails}
      technician={technician}
      trailingSlot={trailingSlot}
      variant={variant}
    />
  );
}
