import type { ApplicationEkycPolicyPort } from "../domain/user-policy-enforcement";
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
  currentBankAccountId: number | null;
}

export interface BindMerchantBankAccountInput {
  userId: number;
  applicationId: number;
  expectedVersion: number;
  bankCode: string;
  bankName: string;
  branchCode: string;
  branchName: string;
  accountType: "ordinary" | "current" | "savings" | "other";
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
  accountType: "ordinary" | "current" | "savings" | "other";
  accountNumberEncrypted: string;
  accountHolderEncrypted: string;
  accountHolderNormalizedEncrypted: string;
  holderMatchHash: string;
  verificationSource: "corporate_registration" | "ekyc" | "applicant_declaration";
  verificationStatus: "verified" | "declared";
  verifiedAt: Date | null;
  boundAt: Date;
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
  verifiedAt: Date | null;
  applicationVersion: number;
}

export type BoundProtectedBankAccountRecord = Omit<
  ProtectedBankAccountProjection,
  "accountNumberMasked"
>;

export interface ProtectedBankAccountRepositoryPort {
  findMerchantBindingContext: (
    applicationId: number
  ) => Promise<MerchantBankBindingContext | null>;
  bindVerifiedMerchantAccount: (
    input: BindVerifiedMerchantBankAccountRepositoryInput
  ) => Promise<BoundProtectedBankAccountRecord>;
}

export class ProtectedBankAccountService {
  public constructor(
    private readonly repository: ProtectedBankAccountRepositoryPort,
    private readonly cipher: SensitiveFieldCipherService,
    private readonly ekycPolicy: ApplicationEkycPolicyPort,
    private readonly holder = new BankAccountHolderService()
  ) {}

  public async bindMerchantAccount(
    input: BindMerchantBankAccountInput
  ): Promise<ProtectedBankAccountProjection> {
    const context = await this.repository.findMerchantBindingContext(input.applicationId);
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

    const ekyc = await this.ekycPolicy.evaluateApplicationEkyc(input.userId, "merchant", input.now);
    if (ekyc.required && !ekyc.verified) {
      throw this.conflict("error.identity_application.ekyc_required");
    }

    const normalizedHolder = this.holder.normalizeKatakana(input.accountHolderName);
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
      holderMatchHash: this.cipher.matchHash(normalizedHolder),
      verificationSource: "applicant_declaration",
      verificationStatus: "declared",
      verifiedAt: null,
      boundAt: input.now,
      auditMetadata: {
        applicationId: input.applicationId,
        applicantKind: context.applicantKind,
        verificationStatus: "declared",
        verificationSource: "applicant_declaration",
        ekycPolicy: ekyc
      }
    });

    return {
      ...result,
      accountNumberMasked: this.cipher.maskAccountNumber(input.accountNumber)
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
