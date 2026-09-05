export type SimulationIdentityAccountKind = "customer" | "technician" | "merchant";

export interface SimulationIdentityScopeInput {
  userId: number;
  accountKind: SimulationIdentityAccountKind;
  displayName: string;
  customerProfileId: number;
  technicianProfileId?: number;
  shopId?: number;
}

export interface SimulationIdentityGrant {
  identityType: "customer" | "technician" | "merchant_owner" | "scout";
  roleCode: "customer" | "technician" | "merchant_owner" | "scout";
  scopeType: "customer_profile" | "technician_profile" | "shop" | "global";
  scopeId: number | null;
  displayName: string;
  isDefault: boolean;
}

const positive = (value: number | undefined, label: string): number => {
  if (!value || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Simulation identity matrix requires ${label}.`);
  }
  return value;
};

export const buildSimulationIdentityGrants = (
  input: SimulationIdentityScopeInput
): SimulationIdentityGrant[] => {
  positive(input.userId, "userId");
  const customerProfileId = positive(input.customerProfileId, "customerProfileId");
  const grants: SimulationIdentityGrant[] = [
    {
      identityType: "customer",
      roleCode: "customer",
      scopeType: "customer_profile",
      scopeId: customerProfileId,
      displayName: input.displayName,
      isDefault: true
    }
  ];

  if (input.accountKind === "technician" || input.accountKind === "merchant") {
    grants.push({
      identityType: "technician",
      roleCode: "technician",
      scopeType: "technician_profile",
      scopeId: positive(input.technicianProfileId, "technicianProfileId"),
      displayName: input.displayName,
      isDefault: false
    });
  }
  if (input.accountKind === "merchant") {
    grants.push({
      identityType: "merchant_owner",
      roleCode: "merchant_owner",
      scopeType: "shop",
      scopeId: positive(input.shopId, "shopId"),
      displayName: input.displayName,
      isDefault: false
    });
  }
  if (input.accountKind !== "customer") {
    grants.push({
      identityType: "scout",
      roleCode: "scout",
      scopeType: "global",
      scopeId: null,
      displayName: input.displayName,
      isDefault: false
    });
  }
  return grants;
};

export const simulationIdentityActiveKey = (
  userId: number,
  grant: Pick<SimulationIdentityGrant, "identityType" | "scopeType" | "scopeId">
): string =>
  [
    "simulation-identity",
    userId,
    grant.identityType,
    grant.scopeType,
    grant.scopeId ?? "global"
  ].join(":");
