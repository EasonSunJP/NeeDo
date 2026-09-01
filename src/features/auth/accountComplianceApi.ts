import { httpClient } from "../../api/httpClient";
import type { UserPolicyComplianceRequirement } from "../../auth/rbac";

export interface CompliancePhoneBindingResult {
  phone: string;
  complianceRequirements: UserPolicyComplianceRequirement[];
  smsVerified: false;
}

const requirementCodes = new Set<UserPolicyComplianceRequirement>([
  "phone_binding_required",
  "email_binding_required",
  "ekyc_required"
]);

function requirePhoneBindingResult(value: unknown): CompliancePhoneBindingResult {
  if (!value || typeof value !== "object") throw new Error("error.api");
  const result = value as Partial<CompliancePhoneBindingResult>;
  if (
    typeof result.phone !== "string" ||
    !/^\+[1-9]\d{7,14}$/.test(result.phone) ||
    !Array.isArray(result.complianceRequirements) ||
    !result.complianceRequirements.every((item) => requirementCodes.has(item)) ||
    result.smsVerified !== false
  ) {
    throw new Error("error.api");
  }
  return result as CompliancePhoneBindingResult;
}

export const accountComplianceApi = {
  async bindPhone(phone: string): Promise<CompliancePhoneBindingResult> {
    const result = await httpClient.request<unknown>("/auth/account-compliance/phone", {
      method: "PUT",
      body: { phone }
    });
    return requirePhoneBindingResult(result);
  }
};
