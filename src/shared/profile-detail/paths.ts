import type { DetailRoleType } from "../../types/detailProfile";
import type { InfoCardEntityType } from "../info-card/types";

type ScopedPortal = "user" | "merchant" | "technician";

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

export function getScopedTechnicianServiceListPath(scope: ScopedPortal, shopId: string, technicianId: string) {
  const path = `/stores/${shopId}/technicians/${technicianId}/services`;

  return scope === "user" ? path : `/${scope}${path}`;
}
