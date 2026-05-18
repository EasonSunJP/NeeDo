import { UnifiedProfileCard } from "../UnifiedProfileCard";
import type { InfoCardData } from "../../info-card";

export function ListProfileCard({ data, dark }: { data: InfoCardData; dark?: boolean }) {
  return <UnifiedProfileCard dark={dark} data={data} variant="list" />;
}
