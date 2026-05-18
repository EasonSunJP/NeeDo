import type { ReactNode } from "react";
import { DetailPageBody } from "../../../components/mobile/EntityDetailPage";
import type { DetailProfile } from "../../../types/detailProfile";

export function ShopBusinessProfileTemplate({
  detail,
  dark,
  isFavorite,
  onToggleFavorite,
  availabilitySection,
  priorityContent,
  extraContent
}: {
  detail: Extract<DetailProfile, { roleType: "shop" }>;
  dark: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  availabilitySection?: ReactNode;
  priorityContent?: ReactNode;
  extraContent?: ReactNode;
}) {
  return (
    <DetailPageBody
      availabilitySection={availabilitySection}
      dark={dark}
      detail={detail}
      extraContent={extraContent}
      isFavorite={isFavorite}
      onToggleFavorite={onToggleFavorite}
      priorityContent={priorityContent}
    />
  );
}
