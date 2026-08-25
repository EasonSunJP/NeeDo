import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import { BankAccountHolderService } from "./bank-account-holder.service";
import type { SensitiveFieldCipherService } from "./sensitive-field-cipher.service";

export interface MerchantBankBindingContext {
  applicationId: number;
  userId: number;
  status: string;
  version: number;
  applicantKind: "corporate" | "individual";
  corporateLegalNameKana: string | null;
  currentBankAccountId: number | null;
  verifiedEkycNameKanaEncrypted: string | null;
}

export interface BindMerchantBankAccountInput {
  userId: number;
  applicationId: number;
  expectedVersion: number;
  bankCode: string;
  bankName: string;
  branchCode: string;
  branchName: string;
  accountType: "ordinary" | "current";
  accountNumber: string;
  accountHolderName: string;
  now: Date;
}

export interface BindVerifiedMerchantBankAccountRepositoryInput {
  userId: number;
  applicationId: number;
  expectedVersion: number;
  previousBankAccountId: number | null;
  bankCode: string;
  bankName: string;
  branchCode: string;
  branchName: string;
  accountType: "ordinary" | "current";
  accountNumberEncrypted: string;
  accountHolderEncrypted: string;
  accountHolderNormalizedEncrypted: string;
  holderMatchHash: string;
  verificationSource: "corporate_registration" | "ekyc";
  verificationStatus: "verified";
  verifiedAt: Date;
  auditMetadata: Record<string, unknown>;
}

export interface ProtectedBankAccountProjection {
  id: number;
  bankCode: string;
  bankName: string;
  branchCode: string;
  branchName: string;
  accountType: string;
  accountNumberMasked: string;
  holderMatched: true;
  verifiedAt: Date;
  applicationVersion: number;
}

export type BoundProtectedBankAccountRecord = Omit<
  ProtectedBankAccountProjection,
  "accountNumberMasked" | "holderMatched"
>;

export interface ProtectedBankAccountRepositoryPort {
  findMerchantBindingContext: (
    applicationId: number,
    now: Date
  ) => Promise<MerchantBankBindingContext | null>;
  bindVerifiedMerchantAccount: (
    input: BindVerifiedMerchantBankAccountRepositoryInput
  ) => Promise<BoundProtectedBankAccountRecord>;
}

export class ProtectedBankAccountService {
  public constructor(
    private readonly repository: ProtectedBankAccountRepositoryPort,
    private readonly cipher: SensitiveFieldCipherService,
    private readonly holder = new BankAccountHolderService()
  ) {}

  public async bindMerchantAccount(
    input: BindMerchantBankAccountInput
  ): Promise<ProtectedBankAccountProjection> {
    const context = await this.repository.findMerchantBindingContext(input.applicationId, input.now);
    if (!context || context.userId !== input.userId) {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.identity_application.not_found",
        statusCode: 404
      });
    }
    if (context.status !== "draft" && context.status !== "rejected") {
      throw this.conflict("error.identity_application.submitted_snapshot_locked");
    }
    if (context.version !== input.expectedVersion) {
      throw this.conflict("error.identity_application.version_conflict");
    }

    const eKycNameKana =
      context.verifiedEkycNameKanaEncrypted === null
        ? undefined
        : this.cipher.open(context.verifiedEkycNameKanaEncrypted);
    if (context.applicantKind === "individual" && !eKycNameKana) {
      throw this.conflict("error.identity_application.ekyc_required");
    }
    try {
      this.holder.assertMatches({
        applicantKind: context.applicantKind,
        bankHolderName: input.accountHolderName,
        corporateLegalNameKana: context.corporateLegalNameKana ?? undefined,
        eKycNameKana
      });
    } catch {
      throw this.conflict("error.bank_account.holder_name_mismatch");
    }

    const normalizedHolder = this.holder.normalizeKatakana(input.accountHolderName);
    const normalizedMatchValue = this.holder.normalizeForMatch(
      context.applicantKind,
      input.accountHolderName
    );
    const verificationSource =
      context.applicantKind === "corporate" ? "corporate_registration" : "ekyc";
    const result = await this.repository.bindVerifiedMerchantAccount({
      userId: input.userId,
      applicationId: input.applicationId,
      expectedVersion: input.expectedVersion,
      previousBankAccountId: context.currentBankAccountId,
      bankCode: input.bankCode.trim(),
      bankName: input.bankName.trim(),
      branchCode: input.branchCode.trim(),
      branchName: input.branchName.trim(),
      accountType: input.accountType,
      accountNumberEncrypted: this.cipher.seal(input.accountNumber.trim()),
      accountHolderEncrypted: this.cipher.seal(input.accountHolderName.trim()),
      accountHolderNormalizedEncrypted: this.cipher.seal(normalizedHolder),
      holderMatchHash: this.cipher.matchHash(normalizedMatchValue),
      verificationSource,
      verificationStatus: "verified",
      verifiedAt: input.now,
      auditMetadata: {
        applicationId: input.applicationId,
        applicantKind: context.applicantKind,
        verificationStatus: "verified"
      }
    });

    return {
      ...result,
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
