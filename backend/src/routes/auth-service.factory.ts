import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { AuthRepository } from "../repositories/auth.repository";
import { WebhookOtpDeliveryClient } from "../services/auth-otp-delivery.service";
import { RedisAuthSessionStore } from "../services/auth-session.store";
import { AuthService } from "../services/auth.service";
import { RedisVerificationChallengeStore } from "../services/auth-verification-challenge.store";
import { GoogleCredentialVerifierService } from "../services/google-credential-verifier.service";
import { MerchantShopContextRepository } from "../repositories/merchant-shop-context.repository";
import { createUserExperienceServiceForRoutes } from "./user-experience-service.factory";
import { UserPolicyEnforcementRepository } from "../repositories/user-policy-enforcement.repository";
import { UserGlobalPolicyRepository } from "../repositories/user-global-policy.repository";
import { UserGlobalPolicyService } from "../services/user-global-policy.service";
import { UserPolicyEnforcementService } from "../services/user-policy-enforcement.service";

export const createAuthServiceForRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): AuthService => {
  const policyEnforcement = dependencies.userPolicyEnforcementService ?? (
    dependencies.userPolicyEnforcementRepository || dependencies.userGlobalPolicyRepository
      ? new UserPolicyEnforcementService(
          dependencies.userPolicyEnforcementRepository ?? new UserPolicyEnforcementRepository(),
          new UserGlobalPolicyService(
            dependencies.userGlobalPolicyRepository ?? new UserGlobalPolicyRepository()
          )
        )
      : undefined
  );
  return new AuthService(
    config,
    dependencies.authRepository ?? new AuthRepository(),
    dependencies.authSessionStore ?? new RedisAuthSessionStore(),
    dependencies.otpDeliveryClient ?? new WebhookOtpDeliveryClient(config),
    dependencies.verificationChallengeStore ?? new RedisVerificationChallengeStore(),
    dependencies.testOnlyAllowLegacyAuthAdapters ?? false,
    dependencies.googleCredentialVerifier ?? new GoogleCredentialVerifierService(undefined, config),
    dependencies.merchantShopContextRepository ?? new MerchantShopContextRepository(),
    dependencies.merchantShopAuditOutboxTrigger,
    createUserExperienceServiceForRoutes(dependencies),
    policyEnforcement
  );
};
