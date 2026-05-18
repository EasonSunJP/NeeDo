import { UnifiedProfileCard } from "../UnifiedProfileCard";
import type { InfoCardData } from "../../info-card";

export function CompactProfileCard({ data, dark }: { data: InfoCardData; dark?: boolean }) {
  return <UnifiedProfileCard dark={dark} data={data} variant="compact" />;
}
