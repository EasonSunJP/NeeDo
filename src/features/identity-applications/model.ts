import type { IdentityApplication } from "./api";
import type { PortalScope } from "../../auth/AuthProvider";

export type IdentityKind = "customer" | "technician" | "merchant" | "affiliate";
export type IdentityAvailabilityState =
  | "active"
  | "available_to_apply"
  | "draft"
  | "pending"
  | "rejected";

export type IdentityAvailability = {
  kind: IdentityKind;
  state: IdentityAvailabilityState;
  identityId: number | null;
  applicationId: number | null;
  rejectionReason: string | null;
};

export type IdentityRowAction = "current" | "switch" | "apply" | "continue" | "pending" | "retry";

export type IdentitySettingsRow = IdentityAvailability & {
  active: boolean;
  action: IdentityRowAction;
  portal: Exclude<PortalScope, "admin">;
};

const portalByKind: Record<IdentityKind, Exclude<PortalScope, "admin">> = {
  customer: "user",
  technician: "technician",
  merchant: "merchant",
  affiliate: "business"
};

export const getIdentityPortal = (kind: IdentityKind) => portalByKind[kind];

export const buildIdentityRows = (
  availability: readonly IdentityAvailability[],
  currentPortal: PortalScope
): IdentitySettingsRow[] =>
  availability.map((item) => {
    const portal = getIdentityPortal(item.kind);
    const active = item.state === "active" && portal === currentPortal;
    const action: IdentityRowAction =
      item.state === "active"
        ? active
          ? "current"
          : "switch"
        : item.state === "draft"
          ? "continue"
          : item.state === "pending"
            ? "pending"
            : item.state === "rejected"
              ? "retry"
              : "apply";
    return { ...item, active, action, portal };
  });

export const defaultIdentityAvailability = (): IdentityAvailability[] => [
  { kind: "customer", state: "active", identityId: null, applicationId: null, rejectionReason: null },
  { kind: "technician", state: "available_to_apply", identityId: null, applicationId: null, rejectionReason: null },
  { kind: "merchant", state: "available_to_apply", identityId: null, applicationId: null, rejectionReason: null },
  { kind: "affiliate", state: "available_to_apply", identityId: null, applicationId: null, rejectionReason: null }
];

export function selectLatestApplication(list: IdentityApplication[]): IdentityApplication | null {
  const candidates = list.filter(item => item.status !== "withdrawn");
  const active = candidates.filter(item => ["draft", "submitted", "under_review"].includes(item.status));
  return (active.length ? active : candidates).sort((a, b) => (Date.parse(b.createdAt ?? "") || b.id) - (Date.parse(a.createdAt ?? "") || a.id))[0] ?? null;
}
