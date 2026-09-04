import { ERROR_CODES } from "../constants/error-codes";
import type {
  UserGlobalPolicyResolverPort,
  UserPolicyAccountFacts,
  UserPolicyComplianceDecision,
  UserPolicyEnforcementRepositoryPort,
  UserPolicyServiceMode
} from "../domain/user-policy-enforcement";
import type { ResolvedUserGlobalPolicy } from "../domain/user-global-policy";
import { AppError } from "../utils/app-error";

export class UserPolicyEnforcementService {
  public constructor(
    private readonly repository: UserPolicyEnforcementRepositoryPort,
    private readonly policyResolver: UserGlobalPolicyResolverPort
  ) {}

  public async evaluateAccountCompliance(
    userId: number,
    occurredAt: Date
  ): Promise<UserPolicyComplianceDecision> {
    const { facts, policy } = await this.resolveContext(userId, occurredAt);
    const requirements: UserPolicyComplianceDecision["requirements"] = [];
    if (policy.requirePhone && !facts.phoneBound) {
      requirements.push("phone_binding_required");
    }
    if (policy.requireEmail && !facts.emailVerified) {
      requirements.push("email_binding_required");
    }
    return {
      compliant: requirements.length === 0,
      requirements,
      policyVersionPublicId: policy.versionPublicId,
      effectiveAt: policy.effectiveFrom.toISOString()
    };
  }

  public async assertServiceEkyc(
    userId: number,
    mode: UserPolicyServiceMode,
    occurredAt: Date
  ): Promise<void> {
    const { facts, policy } = await this.resolveContext(userId, occurredAt);
    const required =
      mode === "home" ? policy.requireHomeServiceEkyc : policy.requireStoreServiceEkyc;
    if (!required || facts.ekycVerified) return;
    throw new AppError({
      code: ERROR_CODES.USER_POLICY_COMPLIANCE_REQUIRED,
      message: "error.user_policy.ekyc_required",
      statusCode: 403,
      data: {
        requiredAction: "ekyc_required",
        policyVersionPublicId: policy.versionPublicId,
        effectiveAt: policy.effectiveFrom.toISOString()
      }
    });
  }

  private async resolveContext(
    userId: number,
    occurredAt: Date
  ): Promise<{
    facts: UserPolicyAccountFacts;
    policy: ResolvedUserGlobalPolicy;
  }> {
    if (!Number.isInteger(userId) || userId <= 0 || Number.isNaN(occurredAt.getTime())) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.validation",
        statusCode: 400
      });
    }
    const [facts, policy] = await Promise.all([
      this.repository.findAccountFactsAt(userId, occurredAt),
      this.policyResolver.resolvePolicyAt(occurredAt)
    ]);
    if (!facts) {
      throw new AppError({
        code: ERROR_CODES.USER_NOT_FOUND,
        message: "error.user.not_found",
        statusCode: 404
      });
    }
    return { facts, policy };
  }
}
