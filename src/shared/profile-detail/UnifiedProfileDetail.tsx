import type { ReactNode } from "react";
import { DetailPageBody, EntityDetailPage, StickyActionBar, buildDefaultDetailActions, type DetailPageAction } from "../../components/mobile/EntityDetailPage";
import type { DetailProfile } from "../../types/detailProfile";

export function UnifiedProfileDetail({
  detail,
  dark,
  onClose,
  actions,
  availabilitySection,
  priorityContent,
  extraContent
}: {
  detail: DetailProfile;
  dark: boolean;
  onClose: () => void;
  actions?: DetailPageAction[];
  availabilitySection?: ReactNode;
  priorityContent?: ReactNode;
  extraContent?: ReactNode;
}) {
  return (
    <EntityDetailPage
      actions={actions}
      availabilitySection={availabilitySection}
      dark={dark}
      detail={detail}
      extraContent={extraContent}
      onClose={onClose}
      priorityContent={priorityContent}
    />
  );
}

export { DetailPageBody as UnifiedProfileDetailBody, StickyActionBar, buildDefaultDetailActions };
export type { DetailPageAction };
