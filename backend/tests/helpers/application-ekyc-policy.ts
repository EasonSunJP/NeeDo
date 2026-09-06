import type { ApplicationEkycPolicyPort } from "../../src/domain/user-policy-enforcement";
export const applicationEkycPolicy = (required = true, verified = true): ApplicationEkycPolicyPort => ({
  evaluateApplicationEkyc: jest.fn(async () => ({ required, verified, policyVersionPublicId: "policy-test" }))
});
