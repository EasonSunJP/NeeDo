import type { ReactNode } from "react";
import { DetailPageBody } from "../../../components/mobile/EntityDetailPage";
import type { PersonalDetailProfile } from "../../../types/detailProfile";

export function UserBasicProfileTemplate({
  detail,
  dark,
  isFavorite,
  onToggleFavorite,
  extraContent
}: {
  detail: PersonalDetailProfile & { roleType: "user" };
  dark: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  extraContent?: ReactNode;
}) {
  return <DetailPageBody dark={dark} detail={detail} extraContent={extraContent} isFavorite={isFavorite} onToggleFavorite={onToggleFavorite} />;
}
