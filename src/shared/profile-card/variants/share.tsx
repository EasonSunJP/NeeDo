import { UnifiedProfileCard } from "../UnifiedProfileCard";
import type { InfoCardData } from "../../info-card";

export function ShareProfileCard({ data, dark }: { data: InfoCardData; dark?: boolean }) {
  return <UnifiedProfileCard dark={dark} data={data} variant="share" />;
}
