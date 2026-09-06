import { ERROR_CODES } from "../src/constants/error-codes";
import type {
  UserPolicyAccountFacts,
  UserPolicyEnforcementRepositoryPort
} from "../src/domain/user-policy-enforcement";
import type { ResolvedUserGlobalPolicy } from "../src/domain/user-global-policy";
import { UserPolicyEnforcementService } from "../src/services/user-policy-enforcement.service";

const occurredAt = new Date("2026-09-01T10:00:00.000Z");

const policy = (overrides: Partial<ResolvedUserGlobalPolicy> = {}): ResolvedUserGlobalPolicy => ({
  versionPublicId: "policy-v1",
  version: 1,
  status: "published",
  lockVersion: 1,
  requirePhone: false,
  requireEmail: false,
  requireHomeServiceEkyc: false,
  requireStoreServiceEkyc: false,
  requireMerchantApplicationEkyc: false,
  requireTechnicianApplicationEkyc: false,
  ndpPerBaseExp: 100,
  baseExpUnitsPerThreshold: 10_000,
  effectiveFrom: occurredAt,
  effectiveTo: null,
  publishedAt: occurredAt,
  ...overrides
});

const facts = (overrides: Partial<UserPolicyAccountFacts> = {}): UserPolicyAccountFacts => ({
  phoneBound: true,
  emailVerified: true,
  ekycVerified: true,
  ...overrides
});

const repository = (
  value: UserPolicyAccountFacts | null = facts()
): jest.Mocked<UserPolicyEnforcementRepositoryPort> => ({
  findAccountFactsAt: jest.fn(async (userId: number, occurredAt: Date) => {
    void userId;
    void occurredAt;
    return value;
  })
});

const resolver = (value: ResolvedUserGlobalPolicy = policy()) => ({
  resolvePolicyAt: jest.fn(async () => value)
});

describe("UserPolicyEnforcementService", () => {
  it.each(["merchant", "technician"] as const)("resolves the %s application toggle independently", async type => {
    for (const required of [false, true]) for (const verified of [false, true]) {
      const effectivePolicy = policy({ requireMerchantApplicationEkyc: type === "merchant" ? required : !required, requireTechnicianApplicationEkyc: type === "technician" ? required : !required });
      const service = new UserPolicyEnforcementService(repository(facts({ ekycVerified: verified })), resolver(effectivePolicy));
      await expect(service.evaluateApplicationEkyc(41, type, occurredAt)).resolves.toEqual({ required, verified, policyVersionPublicId: "policy-v1" });
    }
  });

  it("returns only the enabled missing account-binding requirements", async () => {
    const service = new UserPolicyEnforcementService(
      repository(facts({ phoneBound: false, emailVerified: false })),
      resolver(policy({ requirePhone: true, requireEmail: false }))
    );

    await expect(service.evaluateAccountCompliance(41, occurredAt)).resolves.toEqual({
      compliant: false,
      requirements: ["phone_binding_required"],
      policyVersionPublicId: "policy-v1",
      effectiveAt: occurredAt.toISOString()
    });
  });

  it("treats an unverified email as unbound and preserves requirement order", async () => {
    const service = new UserPolicyEnforcementService(
      repository(facts({ phoneBound: false, emailVerified: false })),
      resolver(policy({ requirePhone: true, requireEmail: true }))
    );

    await expect(service.evaluateAccountCompliance(42, occurredAt)).resolves.toMatchObject({
      compliant: false,
      requirements: ["phone_binding_required", "email_binding_required"]
    });
  });

  it("rejects a deleted or missing user without exposing policy facts", async () => {
    const service = new UserPolicyEnforcementService(repository(null), resolver());

    await expect(service.evaluateAccountCompliance(43, occurredAt)).rejects.toMatchObject({
      code: ERROR_CODES.USER_NOT_FOUND,
      statusCode: 404,
      data: null
    });
  });

  it.each([
    ["home" as const, true, false],
    ["store" as const, false, true]
  ])("enforces %s eKYC independently", async (mode, requireHome, requireStore) => {
    const service = new UserPolicyEnforcementService(
      repository(facts({ ekycVerified: false })),
      resolver(
        policy({
          requireHomeServiceEkyc: requireHome,
          requireStoreServiceEkyc: requireStore
        })
      )
    );

    await expect(service.assertServiceEkyc(44, mode, occurredAt)).rejects.toMatchObject({
      code: ERROR_CODES.USER_POLICY_COMPLIANCE_REQUIRED,
      statusCode: 403,
      message: "error.user_policy.ekyc_required",
      data: {
        requiredAction: "ekyc_required",
        policyVersionPublicId: "policy-v1",
        effectiveAt: occurredAt.toISOString()
      }
    });
  });

  it("does not enforce the other service mode", async () => {
    const service = new UserPolicyEnforcementService(
      repository(facts({ ekycVerified: false })),
      resolver(policy({ requireHomeServiceEkyc: true }))
    );

    await expect(service.assertServiceEkyc(45, "store", occurredAt)).resolves.toBeUndefined();
  });

  it("uses occurrence-time repository facts for valid versus expired or rejected eKYC", async () => {
    const repo = repository(facts({ ekycVerified: true }));
    const service = new UserPolicyEnforcementService(
      repo,
      resolver(policy({ requireHomeServiceEkyc: true }))
    );

    await expect(service.assertServiceEkyc(46, "home", occurredAt)).resolves.toBeUndefined();
    expect(repo.findAccountFactsAt).toHaveBeenCalledWith(46, occurredAt);
    expect(JSON.stringify(await service.evaluateAccountCompliance(46, occurredAt))).not.toMatch(
      /document|provider|name|hash|reference/i
    );
  });
});
