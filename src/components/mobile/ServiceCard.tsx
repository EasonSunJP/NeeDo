import { buildServiceMiniCardData, SocialProfileMiniCard } from "../../shared/profile-card";
import type { ServiceItem } from "../../types/domain";

export function ServiceCard({ service }: { service: ServiceItem }) {
  return <SocialProfileMiniCard data={buildServiceMiniCardData(service)} detailTo={`/services/${service.id}`} />;
}
