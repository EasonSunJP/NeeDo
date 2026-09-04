import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import { IdentityApplicationPolicyService } from "./identity-application-policy.service";
import {
  SaasBillingPolicyService,
  type InitialTrialFreePeriod
} from "./saas-billing-policy.service";

export interface MerchantApplicationBankProjection {
  id: number;
  bankCode: string;
  bankName: string;
  branchCode: string;
  branchName: string;
  accountType: string;
  accountNumberMasked: string;
  accountHolderMasked: string;
  verificationSource: string;
  verificationStatus: string;
  holderMatched: boolean;
  verifiedAt: Date | null;
}

export interface MerchantApplicationContractEvidence {
  id: number;
  contractType: string;
  contractVersion: string;
  contentHash: string;
  acceptedAt: Date;
  language: string;
  receiptId: string;
}

export interface MerchantApplicationDocumentProjection {
  id: number;
  purpose: string;
  url: string;
  mimeType: string;
}

export interface MerchantApplicationReviewRecord {
  applicationId: number;
  applicantUserId: number;
  status: string;
  version: number;
  submittedSnapshotHash: string | null;
  submittedAt: Date | null;
  createdAt: Date;
  applicantKind: "corporate" | "individual";
  corporateLegalName: string | null;
  corporateLegalNameKana: string | null;
  representativeName: string;
  representativeNameKana: string;
  shopName: string;
  businessAddress: string;
  contactPhone: string;
  responsiblePersonName: string;
  showcaseDraft: Record<string, unknown> | null;
  serviceCategories: Array<{
    id: number;
    code: string;
    label: string;
    qualificationPolicy: string;
  }>;
  businessKeywords: Array<{
    id: number;
    code: string;
    categoryId: number;
    label: string;
    qualificationPolicy: string;
  }>;
  bankAccount: MerchantApplicationBankProjection | null;
  eKycVerified: boolean;
  contractAcceptance: MerchantApplicationContractEvidence | null;
  media: MerchantApplicationDocumentProjection[];
}

export interface MerchantApplicationReviewListQuery {
  page: number;
  pageSize: number;
  status?: string;
}

export interface MerchantApplicationReviewPage {
  list: MerchantApplicationReviewRecord[];
  total: number;
  page: number;
  page_size: number;
}

export interface ApproveMerchantApplicationRepositoryInput {
  applicationId: number;
  applicantUserId: number;
  reviewerUserId: number;
  expectedVersion: number;
  displayName: string;
  merchantAccountName: string;
  shopName: string;
  businessAddress: string;
  contactPhone: string;
  showcaseDraft: Record<string, unknown>;
  serviceCategoryIds: number[];
  businessKeywordIds: number[];
  bankAccountId: number;
  contractAcceptanceId: number;
  reviewedAt: Date;
  purgeAt: Date;
  trialStartsAt: Date;
  trialEndsAt: Date;
  automaticBonusDays: number;
  freePeriods: InitialTrialFreePeriod[];
}

export interface RejectMerchantApplicationRepositoryInput {
  applicationId: number;
  applicantUserId: number;
  reviewerUserId: number;
  expectedVersion: number;
  rejectionReason: string;
  reviewedAt: Date;
  purgeAt: Date;
}

export interface MerchantApplicationApprovalResult {
  applicationId: number;
  status: "approved";
  version: number;
  merchantAccountId?: number;
  shopId?: number;
  identityId?: number;
  billingProfileId?: number;
  reviewedAt?: Date;
}

export interface MerchantApplicationRejectionResult {
  applicationId: number;
  status: "rejected";
  version: number;
  rejectionReason?: string;
  reviewedAt?: Date;
}

export interface MerchantApplicationReviewRepositoryPort {
  list: (
    query: MerchantApplicationReviewListQuery,
    includeSensitiveDocuments: boolean
  ) => Promise<MerchantApplicationReviewPage>;
  findById: (
    applicationId: number,
    includeSensitiveDocuments: boolean
  ) => Promise<MerchantApplicationReviewRecord | null>;
  approveInTransaction: (
    input: ApproveMerchantApplicationRepositoryInput
  ) => Promise<MerchantApplicationApprovalResult>;
  rejectInTransaction: (
    input: RejectMerchantApplicationRepositoryInput
  ) => Promise<MerchantApplicationRejectionResult>;
}

interface MerchantReviewActionInput {
  applicationId: number;
  reviewerUserId: number;
  expectedVersion: number;
  now: Date;
}

export type ApproveMerchantApplicationInput = MerchantReviewActionInput;
export interface RejectMerchantApplicationInput extends MerchantReviewActionInput {
  rejectionReason: string;
}

export class MerchantApplicationReviewService {
  public constructor(
    private readonly repository: MerchantApplicationReviewRepositoryPort,
    private readonly billingPolicy = new SaasBillingPolicyService(),
    private readonly applicationPolicy = new IdentityApplicationPolicyService()
  ) {}

  public list(
    query: MerchantApplicationReviewListQuery,
    includeSensitiveDocuments: boolean
  ): Promise<MerchantApplicationReviewPage> {
    return this.repository.list(query, includeSensitiveDocuments);
  }

  public async get(
    applicationId: number,
    includeSensitiveDocuments: boolean
  ): Promise<MerchantApplicationReviewRecord> {
    return this.load(applicationId, includeSensitiveDocuments);
  }

  public async approve(
    input: ApproveMerchantApplicationInput
  ): Promise<MerchantApplicationApprovalResult> {
    const application = await this.load(input.applicationId, true);
    if (application.status === "approved") {
      return {
        applicationId: application.applicationId,
        status: "approved",
        version: application.version
      };
    }
    this.assertReviewable(application.status);
    this.assertVersion(application.version, input.expectedVersion);
    this.assertApprovalEvidence(application);

    const trial = this.billingPolicy.calculateInitialTrial(input.now);
    return this.repository.approveInTransaction({
      applicationId: application.applicationId,
      applicantUserId: application.applicantUserId,
      reviewerUserId: input.reviewerUserId,
      expectedVersion: input.expectedVersion,
      displayName: application.representativeName,
      merchantAccountName: application.corporateLegalName ?? application.shopName,
      shopName: application.shopName,
      businessAddress: application.businessAddress,
      contactPhone: application.contactPhone,
      showcaseDraft: application.showcaseDraft!,
      serviceCategoryIds: application.serviceCategories.map((category) => category.id),
      businessKeywordIds: application.businessKeywords.map((keyword) => keyword.id),
      bankAccountId: application.bankAccount!.id,
      contractAcceptanceId: application.contractAcceptance!.id,
      reviewedAt: input.now,
      purgeAt: this.applicationPolicy.calculatePurgeAt(input.now),
      trialStartsAt: trial.startsAt,
      trialEndsAt: trial.endsAt,
      automaticBonusDays: trial.automaticBonusDays,
      freePeriods: this.billingPolicy.buildInitialTrialFreePeriods(trial)
    });
  }

  public async reject(
    input: RejectMerchantApplicationInput
  ): Promise<MerchantApplicationRejectionResult> {
    const rejectionReason = input.rejectionReason.trim();
    if (!rejectionReason) {
      throw this.validation("error.identity_application.rejection_reason_required");
    }
    const application = await this.load(input.applicationId, false);
    if (application.status === "rejected") {
      return {
        applicationId: application.applicationId,
        status: "rejected",
        version: application.version
      };
    }
    this.assertReviewable(application.status);
    this.assertVersion(application.version, input.expectedVersion);

    return this.repository.rejectInTransaction({
      applicationId: application.applicationId,
      applicantUserId: application.applicantUserId,
      reviewerUserId: input.reviewerUserId,
      expectedVersion: input.expectedVersion,
      rejectionReason,
      reviewedAt: input.now,
      purgeAt: this.applicationPolicy.calculatePurgeAt(input.now)
    });
  }

  private async load(
    applicationId: number,
    includeSensitiveDocuments: boolean
  ): Promise<MerchantApplicationReviewRecord> {
    const application = await this.repository.findById(applicationId, includeSensitiveDocuments);
    if (!application) {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.identity_application.not_found",
        statusCode: 404
      });
    }
    return application;
  }

  private assertApprovalEvidence(application: MerchantApplicationReviewRecord): void {
    if (!application.submittedSnapshotHash || !application.showcaseDraft) {
      throw this.conflict("error.identity_application.submitted_snapshot_invalid");
    }
    if (application.serviceCategories.length === 0) {
      throw this.validation("error.identity_application.service_category_required");
    }
    if (!application.media.some((item) => item.purpose === "representative_identity")) {
      throw this.validation("error.identity_application.representative_identity_required");
    }
    if (application.applicantKind === "corporate") {
      if (!application.corporateLegalName?.trim() || !application.corporateLegalNameKana?.trim()) {
        throw this.validation("error.identity_application.corporate_name_required");
      }
      if (!application.media.some((item) => item.purpose === "corporate_registration")) {
        throw this.validation("error.identity_application.corporate_registration_required");
      }
    } else if (!application.eKycVerified) {
      throw this.conflict("error.identity_application.ekyc_required");
    }

    const bank = application.bankAccount;
    const expectedSource =
      application.applicantKind === "corporate" ? "corporate_registration" : "ekyc";
    if (
      !bank ||
      bank.verificationStatus !== "verified" ||
      bank.holderMatched !== true ||
      bank.verificationSource !== expectedSource ||
      bank.verifiedAt === null
    ) {
      throw this.conflict("error.identity_application.bank_verification_required");
    }

    const contract = application.contractAcceptance;
    if (
      !contract ||
      contract.contractType !== "merchant" ||
      !contract.contractVersion.trim() ||
      !/^[a-f0-9]{64}$/i.test(contract.contentHash)
    ) {
      throw this.conflict("error.identity_application.contract_acceptance_required");
    }
  }

  private assertReviewable(status: string): void {
    if (status !== "submitted" && status !== "under_review") {
      throw this.conflict("error.identity_application.invalid_transition");
    }
  }

  private assertVersion(actualVersion: number, expectedVersion: number): void {
    if (actualVersion !== expectedVersion) {
      throw this.conflict("error.identity_application.version_conflict");
    }
  }

  private validation(message: string): AppError {
    return new AppError({ code: ERROR_CODES.VALIDATION, message, statusCode: 400 });
  }

  private conflict(message: string): AppError {
    return new AppError({
      code: ERROR_CODES.SAAS_BILLING_CONFLICT,
      message,
      statusCode: 409
    });
  }
}
