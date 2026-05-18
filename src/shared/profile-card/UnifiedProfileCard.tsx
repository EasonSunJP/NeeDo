import { BaseInfoCard } from "../info-card";
import type { InfoCardData, InfoCardVariant } from "../info-card";

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
