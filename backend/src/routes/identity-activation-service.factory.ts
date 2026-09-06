import type { AppDependencies } from "../app";
import { AffiliateIdentityActivationRepository } from "../repositories/affiliate-identity-activation.repository";
import { AffiliateBankAccountRepository } from "../repositories/affiliate-bank-account.repository";
import { MerchantContractAcceptanceRepository } from "../repositories/merchant-contract-acceptance.repository";
import { ContractReceiptRepository } from "../repositories/contract-receipt.repository";
import { LegalDocumentRepository } from "../repositories/legal-document.repository";
import { AffiliateBankAccountService } from "../services/affiliate-bank-account.service";
import { AffiliateIdentityActivationService } from "../services/affiliate-identity-activation.service";
import { NeedoContractCatalogService } from "../services/needo-contract-catalog.service";
import { MerchantContractAcceptanceService } from "../services/merchant-contract-acceptance.service";
import { ContractReceiptService } from "../services/contract-receipt.service";
import { SensitiveFieldCipherService } from "../services/sensitive-field-cipher.service";
import type { AppConfig } from "../config/env";

export const createContractCatalogForRoutes = (
  dependencies: AppDependencies
): NeedoContractCatalogService =>
  new NeedoContractCatalogService(
    dependencies.legalDocumentRepository ?? new LegalDocumentRepository()
  );

export const createAffiliateIdentityActivationServiceForRoutes = (
  dependencies: AppDependencies,
  catalog: NeedoContractCatalogService
): AffiliateIdentityActivationService =>
  dependencies.affiliateIdentityActivationService ??
  new AffiliateIdentityActivationService(
    catalog,
    dependencies.affiliateIdentityActivationRepository ??
      new AffiliateIdentityActivationRepository()
  );

export const createAffiliateBankAccountServiceForRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): AffiliateBankAccountService =>
  dependencies.affiliateBankAccountService ??
  new AffiliateBankAccountService(
    dependencies.affiliateBankAccountRepository ?? new AffiliateBankAccountRepository(),
    new SensitiveFieldCipherService(config.SENSITIVE_DATA_ENCRYPTION_KEY)
  );

export const createMerchantContractAcceptanceServiceForRoutes = (
  dependencies: AppDependencies,
  catalog: NeedoContractCatalogService
): MerchantContractAcceptanceService =>
  dependencies.merchantContractAcceptanceService ??
  new MerchantContractAcceptanceService(
    catalog,
    dependencies.merchantContractAcceptanceRepository ?? new MerchantContractAcceptanceRepository()
  );

export const createContractReceiptServiceForRoutes = (
  dependencies: AppDependencies
): ContractReceiptService =>
  dependencies.contractReceiptService ??
  new ContractReceiptService(
    dependencies.contractReceiptRepository ?? new ContractReceiptRepository()
  );
