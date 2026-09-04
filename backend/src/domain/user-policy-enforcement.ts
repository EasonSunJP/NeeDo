import type { ResolvedUserGlobalPolicy } from "./user-global-policy";

export const USER_POLICY_COMPLIANCE_REQUIREMENTS = [
  "phone_binding_required",
  "email_binding_required",
  "ekyc_required"
] as const;

export type UserPolicyComplianceRequirement = (typeof USER_POLICY_COMPLIANCE_REQUIREMENTS)[number];
export type UserPolicyServiceMode = "home" | "store";

export interface UserPolicyAccountFacts {
  phoneBound: boolean;
  emailVerified: boolean;
  ekycVerified: boolean;
}

export interface UserPolicyComplianceDecision {
  compliant: boolean;
  requirements: Exclude<UserPolicyComplianceRequirement, "ekyc_required">[];
  policyVersionPublicId: string;
  effectiveAt: string;
}

export interface UserPolicyEnforcementRepositoryPort {
  findAccountFactsAt: (userId: number, occurredAt: Date) => Promise<UserPolicyAccountFacts | null>;
}

export interface UserGlobalPolicyResolverPort {
  resolvePolicyAt: (occurredAt: Date) => Promise<ResolvedUserGlobalPolicy>;
}
