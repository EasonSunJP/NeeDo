import type { Store, Technician } from "../types/domain";

export type TechnicianRelatedShopEntry = {
  store: Store;
  relationType: "main" | "support";
  relationLabel: string;
  bookingEnabled: boolean;
  priority: number;
};

export function getVisibleRelatedShopsForTechnician({
  stores,
  technician
}: {
  stores: Store[];
  technician?: Technician;
}): TechnicianRelatedShopEntry[] {
  if (!technician) {
    return [];
  }

  const orderedIds = Array.from(new Set([technician.storeId, ...(technician.relatedStoreIds ?? [])].filter(Boolean)));
  const storeById = new Map(stores.map((store) => [store.id, store]));

  return orderedIds
    .map((storeId, index) => {
      const store = storeById.get(storeId);

      if (!store || store.openStatus === "closed") {
        return null;
      }

      const isMainStore = store.id === technician.storeId;

      return {
        store,
        relationType: isMainStore ? "main" as const : "support" as const,
        relationLabel: isMainStore ? "所属店铺" : "协作店铺",
        bookingEnabled: store.alwaysBookable === true || store.openStatus === "open",
        priority: index
      };
    })
    .filter((entry): entry is TechnicianRelatedShopEntry => Boolean(entry))
    .sort((left, right) => left.priority - right.priority);
}
