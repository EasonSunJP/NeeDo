import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import { BankAccountHolderService } from "./bank-account-holder.service";
import type { SensitiveFieldCipherService } from "./sensitive-field-cipher.service";

export interface AffiliateBankBindingContext {
  userId: number;
  affiliateIdentityActive: boolean;
  verifiedEkycNameKanaEncrypted: string | null;
  previousBankAccountId: number | null;
}

export interface BindAffiliateBankAccountInput {
  userId: number;
  bankCode: string;
  bankName: string;
  branchCode: string;
  branchName: string;
  accountType: "ordinary" | "current";
  accountNumber: string;
  accountHolderName: string;
  now: Date;
}

export interface BindVerifiedAffiliateBankAccountRepositoryInput {
  userId: number;
  previousBankAccountId: number | null;
  purpose: "affiliate_withdrawal";
  bankCode: string;
  bankName: string;
  branchCode: string;
  branchName: string;
  accountType: "ordinary" | "current";
  accountNumberEncrypted: string;
  accountHolderEncrypted: string;
  accountHolderNormalizedEncrypted: string;
  holderMatchHash: string;
  verificationSource: "ekyc";
  verificationStatus: "verified";
  verifiedAt: Date;
  auditMetadata: Record<string, unknown>;
}

export interface BoundAffiliateBankAccountRecord {
  id: number;
  bankCode: string;
  bankName: string;
  branchCode: string;
  branchName: string;
  accountType: string;
  verifiedAt: Date;
}

export interface AffiliateBankAccountRepositoryPort {
  findBindingContext: (userId: number, now: Date) => Promise<AffiliateBankBindingContext | null>;
  bindVerifiedAccount: (
    input: BindVerifiedAffiliateBankAccountRepositoryInput
  ) => Promise<BoundAffiliateBankAccountRecord>;
}

export interface AffiliateBankAccountProjection extends BoundAffiliateBankAccountRecord {
  accountNumberMasked: string;
  holderMatched: true;
}

export class AffiliateBankAccountService {
  public constructor(
    private readonly repository: AffiliateBankAccountRepositoryPort,
    private readonly cipher: SensitiveFieldCipherService,
    private readonly holder = new BankAccountHolderService()
  ) {}

  public async bind(input: BindAffiliateBankAccountInput): Promise<AffiliateBankAccountProjection> {
    const context = await this.repository.findBindingContext(input.userId, input.now);
    if (!context?.affiliateIdentityActive) {
      throw this.conflict("error.affiliate_withdrawal.identity_required");
    }
    if (!context.verifiedEkycNameKanaEncrypted) {
      throw this.conflict("error.affiliate_withdrawal.ekyc_required");
    }
    const eKycNameKana = this.cipher.open(context.verifiedEkycNameKanaEncrypted);
    if (
      !this.holder.matches({
        applicantKind: "individual",
        bankHolderName: input.accountHolderName,
        eKycNameKana
      })
    ) {
      throw this.conflict("error.affiliate_withdrawal.holder_name_mismatch");
    }

    const normalizedHolder = this.holder.normalizeForMatch("individual", input.accountHolderName);
    const record = await this.repository.bindVerifiedAccount({
      userId: input.userId,
      previousBankAccountId: context.previousBankAccountId,
      purpose: "affiliate_withdrawal",
      bankCode: input.bankCode.trim(),
      bankName: input.bankName.trim(),
      branchCode: input.branchCode.trim(),
      branchName: input.branchName.trim(),
      accountType: input.accountType,
      accountNumberEncrypted: this.cipher.seal(input.accountNumber.trim()),
      accountHolderEncrypted: this.cipher.seal(input.accountHolderName.trim()),
      accountHolderNormalizedEncrypted: this.cipher.seal(normalizedHolder),
      holderMatchHash: this.cipher.matchHash(normalizedHolder),
      verificationSource: "ekyc",
      verificationStatus: "verified",
      verifiedAt: input.now,
      auditMetadata: {
        purpose: "affiliate_withdrawal",
        verificationStatus: "verified"
      }
    });
    return {
      ...record,
      accountNumberMasked: this.cipher.maskAccountNumber(input.accountNumber),
      holderMatched: true
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
