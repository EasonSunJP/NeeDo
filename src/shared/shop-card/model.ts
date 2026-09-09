import type { UnifiedEntityInfoCardData } from "../profile-card/UnifiedEntityInfoCard";

export type UnifiedShopInfoCardData = UnifiedEntityInfoCardData & {
  kind: "shop";
};
