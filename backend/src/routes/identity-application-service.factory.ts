import { createApplicationEkycPolicy } from "./application-ekyc-policy.factory";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { IdentityApplicationRepository } from "../repositories/identity-application.repository";
import { ProtectedBankAccountRepository } from "../repositories/protected-bank-account.repository";
import { IdentityApplicationService } from "../services/identity-application.service";
import { ProtectedBankAccountService } from "../services/protected-bank-account.service";
import { SensitiveFieldCipherService } from "../services/sensitive-field-cipher.service";

export const createIdentityApplicationServiceForRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): IdentityApplicationService =>
  dependencies.identityApplicationService ??
  new IdentityApplicationService(
    dependencies.identityApplicationRepository ?? new IdentityApplicationRepository(undefined, new SensitiveFieldCipherService(config.SENSITIVE_DATA_ENCRYPTION_KEY)),
    createApplicationEkycPolicy(dependencies)
  );

export const createProtectedBankAccountServiceForRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): ProtectedBankAccountService =>
  dependencies.protectedBankAccountService ??
  new ProtectedBankAccountService(
    dependencies.protectedBankAccountRepository ?? new ProtectedBankAccountRepository(),
    new SensitiveFieldCipherService(config.SENSITIVE_DATA_ENCRYPTION_KEY),
    createApplicationEkycPolicy(dependencies)
  );
