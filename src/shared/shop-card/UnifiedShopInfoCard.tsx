import type { ComponentProps } from "react";
import { UnifiedEntityInfoCard } from "../profile-card/UnifiedEntityInfoCard";
import type { UnifiedShopInfoCardData } from "./model";

export function UnifiedShopInfoCard(
  props: Omit<ComponentProps<typeof UnifiedEntityInfoCard>, "data"> & {
    data: UnifiedShopInfoCardData;
  },
) {
  return <UnifiedEntityInfoCard {...props} />;
}
