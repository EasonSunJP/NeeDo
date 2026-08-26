import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

export interface AffiliateWithdrawalEligibilityRecord {
  affiliateIdentityActive: boolean;
  eKyc: {
    id: number;
    status: string;
    nameMatchHash: string;
    verifiedAt: Date | null;
    expiresAt: Date | null;
  } | null;
  bankAccount: {
    id: number;
    verificationStatus: string;
    holderMatchHash: string;
    verifiedAt: Date | null;
  } | null;
}

export interface AffiliateWithdrawalEligibilityRepositoryPort {
  findEligibility: (
    userId: number,
    now: Date
  ) => Promise<AffiliateWithdrawalEligibilityRecord | null>;
}

export interface AffiliateWithdrawalEligibilityResult {
  eKycVerificationId: number;
  bankAccountId: number;
}

export class AffiliateWithdrawalEligibilityService {
  public constructor(private readonly repository: AffiliateWithdrawalEligibilityRepositoryPort) {}

  public async assertEligible(
    userId: number,
    now: Date
  ): Promise<AffiliateWithdrawalEligibilityResult> {
    const record = await this.repository.findEligibility(userId, now);
    if (!record?.affiliateIdentityActive) {
      throw this.conflict("error.affiliate_withdrawal.identity_required");
    }
    if (
      !record.eKyc ||
      record.eKyc.status !== "verified" ||
      record.eKyc.verifiedAt === null ||
      (record.eKyc.expiresAt !== null && record.eKyc.expiresAt.getTime() <= now.getTime())
    ) {
      throw this.conflict("error.affiliate_withdrawal.ekyc_required");
    }
    if (
      !record.bankAccount ||
      record.bankAccount.verificationStatus !== "verified" ||
      record.bankAccount.verifiedAt === null
    ) {
      throw this.conflict("error.affiliate_withdrawal.bank_account_required");
    }
    if (record.eKyc.nameMatchHash !== record.bankAccount.holderMatchHash) {
      throw this.conflict("error.affiliate_withdrawal.holder_name_mismatch");
    }

    return {
      eKycVerificationId: record.eKyc.id,
      bankAccountId: record.bankAccount.id
    };
  }

  private conflict(message: string): AppError {
    return new AppError({
      code: ERROR_CODES.SAAS_BILLING_CONFLICT,
      message,
      statusCode: 409
    });
  }
}
