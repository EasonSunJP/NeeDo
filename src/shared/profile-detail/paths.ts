import type { DetailRoleType } from "../../types/detailProfile";
import type { InfoCardEntityType } from "../info-card/types";

export function getScopedProfileDetailPath(
  scope: "user" | "merchant" | "technician",
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
