import type { AppDependencies } from "../app";
import { UserGlobalPolicyRepository } from "../repositories/user-global-policy.repository";
import { UserPolicyEnforcementRepository } from "../repositories/user-policy-enforcement.repository";
import { UserGlobalPolicyService } from "../services/user-global-policy.service";
import { UserPolicyEnforcementService } from "../services/user-policy-enforcement.service";

export const createApplicationEkycPolicy = (dependencies: AppDependencies) =>
  new UserPolicyEnforcementService(
    dependencies.userPolicyEnforcementRepository ?? new UserPolicyEnforcementRepository(),
    new UserGlobalPolicyService(dependencies.userGlobalPolicyRepository ?? new UserGlobalPolicyRepository())
  );
