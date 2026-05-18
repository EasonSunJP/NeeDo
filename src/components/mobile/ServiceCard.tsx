import { buildServiceMiniCardData, SocialProfileMiniCard } from "../../shared/profile-card";
import { useEntityStore } from "../../state/entityStore";
import type { ServiceItem, Store, Technician } from "../../types/domain";

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

function overlapScore(values: string[], targets: string[]) {
  const normalizedValues = values.filter(Boolean).map(normalizeText);
  const normalizedTargets = targets.filter(Boolean).map(normalizeText);

  return normalizedValues.reduce((total, value) => {
    const matched = normalizedTargets.some((target) => value.includes(target) || target.includes(value));
    return matched ? total + 1 : total;
  }, 0);
}

function resolveProvider(service: ServiceItem, stores: Store[], technicians: Technician[]): Store | Technician | undefined {
  const targets = [service.name, service.summary, ...service.tags, ...service.serviceAreas];

  if (service.mode === "store") {
    return [...stores]
      .sort((left, right) => {
        const rightScore = overlapScore([right.name, right.area, right.address, right.description, ...right.tags], targets);
        const leftScore = overlapScore([left.name, left.area, left.address, left.description, ...left.tags], targets);
        return rightScore - leftScore;
      })[0];
  }

  return [...technicians]
    .sort((left, right) => {
      const rightScore = overlapScore([right.name, right.nickname ?? "", right.bio ?? "", ...right.skills, ...right.serviceAreas, ...right.languages], targets);
      const leftScore = overlapScore([left.name, left.nickname ?? "", left.bio ?? "", ...left.skills, ...left.serviceAreas, ...left.languages], targets);
      return rightScore - leftScore;
    })[0];
}

export function ServiceCard({ service }: { service: ServiceItem }) {
  const { stores, technicians } = useEntityStore();

  return <SocialProfileMiniCard data={buildServiceMiniCardData(service, resolveProvider(service, stores, technicians))} detailTo={`/services/${service.id}`} />;
}
