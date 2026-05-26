function normalizeRouteId(value: string) {
  return value.trim();
}

function buildCandidateIds(routeTechnicianId: string) {
  const normalized = normalizeRouteId(routeTechnicianId);
  const candidates = [normalized];

  if (/^[1-9]\d*$/.test(normalized)) {
    candidates.push(`tech-${normalized}`);
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

export function resolveTechnicianScheduleRouteId(routeTechnicianId: string, availableTechnicianIds: Iterable<string>) {
  const availableIds = new Set(availableTechnicianIds);

  return buildCandidateIds(routeTechnicianId).find((id) => availableIds.has(id)) ?? normalizeRouteId(routeTechnicianId);
}
