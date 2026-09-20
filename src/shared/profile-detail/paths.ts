import type { DetailRoleType } from "../../types/detailProfile";
import type { InfoCardEntityType } from "../info-card/types";

type ScopedPortal = "user" | "merchant" | "technician";

type TechnicianServiceListSelection = {
  date?: string | null;
  people?: string | null;
  time?: string | null;
};

function appendSelectionParam(
  params: URLSearchParams,
  key: keyof TechnicianServiceListSelection,
  value: string | null | undefined
) {
  const normalized = value?.trim();
  if (normalized) params.set(key, normalized);
}

export function getScopedProfileDetailPath(
  scope: ScopedPortal,
  entityType: InfoCardEntityType | DetailRoleType,
  id: string
) {
  if (entityType === "shop") {
    if (scope === "merchant") {
      return `/merchant/profiles/shop/${id}`;
    }

    if (scope === "technician") {
      return `/technician/profiles/shop/${id}`;
    }

    return `/profiles/shop/${id}`;
  }

  if (entityType === "technician") {
    return scope === "user" ? `/profiles/technician/${id}` : `/${scope}/profiles/technician/${id}`;
  }

  return scope === "user" ? `/profiles/user/${id}` : `/${scope}/profiles/user/${id}`;
}

export function getProfileDetailPath(entityType: InfoCardEntityType | DetailRoleType, id: string) {
  return getScopedProfileDetailPath("user", entityType, id);
}

export function getScopedTechnicianServiceListPath(
  scope: ScopedPortal,
  shopId: string,
  technicianId: string,
  selection: TechnicianServiceListSelection = {}
) {
  const path = `/stores/${encodeURIComponent(shopId)}/technicians/${encodeURIComponent(technicianId)}/services`;
  const params = new URLSearchParams();
  appendSelectionParam(params, "date", selection.date);
  appendSelectionParam(params, "people", selection.people);
  appendSelectionParam(params, "time", selection.time);
  const query = params.toString();
  const scopedPath = scope === "user" ? path : `/${scope}${path}`;

  return `${scopedPath}${query ? `?${query}` : ""}`;
}
