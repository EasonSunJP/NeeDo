import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { prisma } from "../prisma/client";
import { MerchantApplicationReviewRepository } from "../repositories/merchant-application-review.repository";
import { MerchantApplicationReviewService } from "../services/merchant-application-review.service";
import { SensitiveFieldCipherService } from "../services/sensitive-field-cipher.service";

export const createMerchantApplicationReviewServiceForRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): MerchantApplicationReviewService =>
  dependencies.merchantApplicationReviewService ??
  new MerchantApplicationReviewService(
    dependencies.merchantApplicationReviewRepository ??
      new MerchantApplicationReviewRepository(
        prisma,
        new SensitiveFieldCipherService(config.SENSITIVE_DATA_ENCRYPTION_KEY)
      )
  );
