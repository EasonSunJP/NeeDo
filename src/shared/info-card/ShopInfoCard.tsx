import type { ReactNode } from "react";
import type { InfoCardVariant } from "./types";
import type { Store, Technician } from "../../types/domain";
import { UnifiedSimpleProfileCard } from "../profile-card/UnifiedSimpleProfileCard";

export function ShopInfoCard({
  store,
  technicians,
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
  store: Store;
  technicians?: Technician[];
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
      entityType="shop"
      footerSlot={footerSlot}
      maxTags={maxTags}
      onOpenDetails={onOpenDetails}
      store={store}
      technicians={technicians}
      trailingSlot={trailingSlot}
      variant={variant}
    />
  );
}
