import type { Store, Technician } from "../../types/domain";
import { ShopInfoCard } from "../../shared/profile-card";

export function StoreCard({
  store,
  technicians,
  variant = "list"
}: {
  store: Store;
  technicians?: Technician[];
  variant?: "nearby" | "list";
}) {
  return <ShopInfoCard detailTo={`/stores/${store.id}`} store={store} technicians={technicians} variant={variant} />;
}
