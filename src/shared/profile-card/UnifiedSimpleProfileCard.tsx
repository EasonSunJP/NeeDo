import type { ReactNode } from "react";
import type { Customer, Store, Technician } from "../../types/domain";
import type { InfoCardData, InfoCardVariant } from "../info-card/types";
import { SocialProfileMiniCard } from "./SocialProfileMiniCard";

type CommonCardProps = {
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

type UnifiedSimpleProfileCardProps =
  | ({ data: InfoCardData } & CommonCardProps)
  | ({ entityType: "shop"; store: Store; technicians?: Technician[] } & CommonCardProps)
  | ({ entityType: "technician"; technician: Technician } & CommonCardProps)
  | ({ entityType: "user"; customer: Customer } & CommonCardProps);

export function UnifiedSimpleProfileCard(props: UnifiedSimpleProfileCardProps) {
  const { dark, className, detailTo, onOpenDetails, actionSlot } = props;
  const sharedProps = { actionSlot, className, dark, detailTo, onOpenDetails };

  if ("data" in props) {
    return <SocialProfileMiniCard data={props.data} {...sharedProps} />;
  }

  if (props.entityType === "shop") {
    return <SocialProfileMiniCard store={props.store} {...sharedProps} />;
  }

  if (props.entityType === "technician") {
    return <SocialProfileMiniCard technician={props.technician} {...sharedProps} />;
  }

  return <SocialProfileMiniCard customer={props.customer} {...sharedProps} />;
}
