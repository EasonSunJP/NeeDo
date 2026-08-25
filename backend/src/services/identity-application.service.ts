import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import {
  IdentityApplicationPolicyService,
  type IdentityApplicationStatus,
  type IdentityApplicationType
} from "./identity-application-policy.service";

export interface TechnicianApplicationDetailRecord {
  targetShopId: number;
  applicantName: string;
  phone: string | null;
  city: string | null;
  serviceAreas: string[];
  skills: string[];
  yearsExperience: number | null;
  bio: string | null;
  gender: string | null;
  birthDate: Date | null;
}

export interface MerchantApplicationDetailRecord {
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
  bankAccountId: number | null;
  contractAcceptanceId: number | null;
  mediaPurposes: string[];
  bankVerificationStatus: string | null;
  eKycVerified: boolean;
}

export interface IdentityApplicationRecord {
  id: number;
  userId: number;
  type: IdentityApplicationType;
  status: IdentityApplicationStatus;
  version: number;
  activeKey: string | null;
  submittedSnapshotHash: string | null;
  submittedAt: Date | null;
  closedAt: Date | null;
  purgeAt: Date | null;
  technicianDetail: TechnicianApplicationDetailRecord | null;
  merchantDetail: MerchantApplicationDetailRecord | null;
}

export interface CreateTechnicianDraftRepositoryInput {
  userId: number;
  activeKey: string;
  detail: TechnicianApplicationDetailRecord;
}

export interface CreateMerchantDraftRepositoryInput {
  userId: number;
  activeKey: string;
  detail: MerchantApplicationDetailRecord;
}

export interface UpdateTechnicianDraftRepositoryInput {
  applicationId: number;
  expectedVersion: number;
  nextStatus: "draft";
  activeKey: string;
  detail: TechnicianApplicationDetailRecord;
}

export interface UpdateMerchantDraftRepositoryInput {
  applicationId: number;
  expectedVersion: number;
  nextStatus: "draft";
  activeKey: string;
  detail: MerchantApplicationDetailRecord;
}

export interface SubmitIdentityApplicationRepositoryInput {
  applicationId: number;
  expectedVersion: number;
  submittedSnapshot: Record<string, unknown>;
  submittedSnapshotHash: string;
  submittedAt: Date;
}

export interface CloseIdentityApplicationRepositoryInput {
  applicationId: number;
  expectedVersion: number;
  status: "withdrawn";
  closedAt: Date;
  purgeAt: Date;
}

export interface IdentityApplicationRepositoryPort {
  findActiveByUserAndType: (
    userId: number,
    type: IdentityApplicationType
  ) => Promise<IdentityApplicationRecord | null>;
  hasActiveIdentity: (userId: number, type: IdentityApplicationType) => Promise<boolean>;
  isShopEligibleForTechnicianApplications: (shopId: number) => Promise<boolean>;
  createTechnicianDraft: (
    input: CreateTechnicianDraftRepositoryInput
  ) => Promise<IdentityApplicationRecord>;
  createMerchantDraft: (
    input: CreateMerchantDraftRepositoryInput
  ) => Promise<IdentityApplicationRecord>;
  findById: (applicationId: number) => Promise<IdentityApplicationRecord | null>;
  updateTechnicianDraft: (
    input: UpdateTechnicianDraftRepositoryInput
  ) => Promise<IdentityApplicationRecord>;
  updateMerchantDraft: (
    input: UpdateMerchantDraftRepositoryInput
  ) => Promise<IdentityApplicationRecord>;
  submit: (
    input: SubmitIdentityApplicationRepositoryInput
  ) => Promise<IdentityApplicationRecord>;
  close: (input: CloseIdentityApplicationRepositoryInput) => Promise<IdentityApplicationRecord>;
}

export interface CreateTechnicianDraftInput {
  userId: number;
  targetShopId: number;
  applicantName: string;
}

export interface CreateMerchantDraftInput {
  userId: number;
  detail: MerchantApplicationDetailRecord;
}

export interface UpdateTechnicianDraftInput {
  userId: number;
  applicationId: number;
  expectedVersion: number;
  detail: TechnicianApplicationDetailRecord;
}

export interface UpdateMerchantDraftInput {
  userId: number;
  applicationId: number;
  expectedVersion: number;
  detail: MerchantApplicationDetailRecord;
}

export interface SubmitIdentityApplicationInput {
  userId: number;
  applicationId: number;
  expectedVersion: number;
  now: Date;
}

export type WithdrawIdentityApplicationInput = SubmitIdentityApplicationInput;

const emptyTechnicianDetail = (
  targetShopId: number,
  applicantName: string
): TechnicianApplicationDetailRecord => ({
  targetShopId,
  applicantName: applicantName.trim(),
  phone: null,
  city: null,
  serviceAreas: [],
  skills: [],
  yearsExperience: null,
  bio: null,
  gender: null,
  birthDate: null
});

export class IdentityApplicationService {
  public constructor(
    private readonly repository: IdentityApplicationRepositoryPort,
    private readonly policy = new IdentityApplicationPolicyService()
  ) {}

  public async createTechnicianDraft(
    input: CreateTechnicianDraftInput
  ): Promise<IdentityApplicationRecord> {
    await this.assertCanApply(input.userId, "technician");
    await this.assertEligibleShop(input.targetShopId);

    return this.repository.createTechnicianDraft({
      userId: input.userId,
      activeKey: this.policy.buildActiveKey(input.userId, "technician", "draft")!,
      detail: emptyTechnicianDetail(input.targetShopId, input.applicantName)
    });
  }

  public async createMerchantDraft(
    input: CreateMerchantDraftInput
  ): Promise<IdentityApplicationRecord> {
    await this.assertCanApply(input.userId, "merchant");

    return this.repository.createMerchantDraft({
      userId: input.userId,
      activeKey: this.policy.buildActiveKey(input.userId, "merchant", "draft")!,
      detail: this.normalizeMerchantDetail(input.detail)
    });
  }

  public async updateTechnicianDraft(
    input: UpdateTechnicianDraftInput
  ): Promise<IdentityApplicationRecord> {
    const application = await this.loadOwned(input.userId, input.applicationId);
    this.assertType(application, "technician");
    this.assertVersion(application.version, input.expectedVersion);
    this.assertEditable(application.status);
    await this.assertEligibleShop(input.detail.targetShopId);

    return this.repository.updateTechnicianDraft({
      applicationId: application.id,
      expectedVersion: input.expectedVersion,
      nextStatus: "draft",
      activeKey: this.policy.buildActiveKey(input.userId, "technician", "draft")!,
      detail: {
        ...input.detail,
        applicantName: input.detail.applicantName.trim()
      }
    });
  }

  public async updateMerchantDraft(
    input: UpdateMerchantDraftInput
  ): Promise<IdentityApplicationRecord> {
    const application = await this.loadOwned(input.userId, input.applicationId);
    this.assertType(application, "merchant");
    this.assertVersion(application.version, input.expectedVersion);
    this.assertEditable(application.status);

    return this.repository.updateMerchantDraft({
      applicationId: application.id,
      expectedVersion: input.expectedVersion,
      nextStatus: "draft",
      activeKey: this.policy.buildActiveKey(input.userId, "merchant", "draft")!,
      detail: this.normalizeMerchantDetail(input.detail)
    });
  }

  public async submit(input: SubmitIdentityApplicationInput): Promise<IdentityApplicationRecord> {
    const application = await this.loadOwned(input.userId, input.applicationId);
    this.assertVersion(application.version, input.expectedVersion);
    this.assertEditable(application.status);
    this.assertTransition(application.status, "submitted");

    const submittedSnapshot = this.buildSubmittedSnapshot(application);
    return this.repository.submit({
      applicationId: application.id,
      expectedVersion: input.expectedVersion,
      submittedSnapshot,
      submittedSnapshotHash: this.policy.hashSnapshot(submittedSnapshot),
      submittedAt: input.now
    });
  }

  public async withdraw(
    input: WithdrawIdentityApplicationInput
  ): Promise<IdentityApplicationRecord> {
    const application = await this.loadOwned(input.userId, input.applicationId);
    this.assertVersion(application.version, input.expectedVersion);
    this.assertTransition(application.status, "withdrawn");

    return this.repository.close({
      applicationId: application.id,
      expectedVersion: input.expectedVersion,
      status: "withdrawn",
      closedAt: input.now,
      purgeAt: this.policy.calculatePurgeAt(input.now)
    });
  }

  private async assertCanApply(userId: number, type: IdentityApplicationType): Promise<void> {
    if (await this.repository.findActiveByUserAndType(userId, type)) {
      throw this.conflict("error.identity_application.conflict");
    }
    if (await this.repository.hasActiveIdentity(userId, type)) {
      throw this.conflict("error.identity_application.identity_already_active");
    }
  }

  private async assertEligibleShop(shopId: number): Promise<void> {
    if (!(await this.repository.isShopEligibleForTechnicianApplications(shopId))) {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.identity_application.target_shop_not_found",
        statusCode: 404
      });
    }
  }

  private async loadOwned(userId: number, applicationId: number): Promise<IdentityApplicationRecord> {
    const application = await this.repository.findById(applicationId);
    if (!application || application.userId !== userId) {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.identity_application.not_found",
        statusCode: 404
      });
    }

    return application;
  }

  private assertVersion(actualVersion: number, expectedVersion: number): void {
    try {
      this.policy.assertVersion(expectedVersion, actualVersion);
    } catch {
      throw this.conflict("error.identity_application.version_conflict");
    }
  }

  private assertEditable(status: IdentityApplicationStatus): void {
    try {
      this.policy.assertEditable(status);
    } catch {
      throw this.conflict("error.identity_application.submitted_snapshot_locked");
    }
  }

  private assertTransition(
    current: IdentityApplicationStatus,
    next: IdentityApplicationStatus
  ): void {
    try {
      this.policy.assertTransition({ current, next });
    } catch {
      throw this.conflict("error.identity_application.invalid_transition");
    }
  }

  private assertType(application: IdentityApplicationRecord, type: IdentityApplicationType): void {
    if (application.type !== type) {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.identity_application.not_found",
        statusCode: 404
      });
    }
  }

  private buildSubmittedSnapshot(application: IdentityApplicationRecord): Record<string, unknown> {
    if (application.type === "technician") {
      if (!application.technicianDetail?.applicantName.trim()) {
        throw this.validation("error.identity_application.technician_name_required");
      }

      return { type: "technician", detail: application.technicianDetail };
    }

    const detail = application.merchantDetail;
    if (!detail) {
      throw this.validation("error.identity_application.merchant_detail_required");
    }
    this.assertMerchantSubmission(detail);

    return { type: "merchant", detail };
  }

  private assertMerchantSubmission(detail: MerchantApplicationDetailRecord): void {
    const requiredValues = [
      detail.representativeName,
      detail.representativeNameKana,
      detail.shopName,
      detail.businessAddress,
      detail.contactPhone,
      detail.responsiblePersonName
    ];
    if (requiredValues.some((value) => !value.trim()) || !detail.showcaseDraft) {
      throw this.validation("error.identity_application.merchant_required_fields");
    }
    if (!detail.mediaPurposes.includes("representative_identity")) {
      throw this.validation("error.identity_application.representative_identity_required");
    }
    if (detail.applicantKind === "corporate") {
      if (!detail.corporateLegalName?.trim() || !detail.corporateLegalNameKana?.trim()) {
        throw this.validation("error.identity_application.corporate_name_required");
      }
      if (!detail.mediaPurposes.includes("corporate_registration")) {
        throw this.validation("error.identity_application.corporate_registration_required");
      }
    } else if (!detail.eKycVerified) {
      throw this.conflict("error.identity_application.ekyc_required");
    }
    if (!detail.bankAccountId || detail.bankVerificationStatus !== "verified") {
      throw this.conflict("error.identity_application.bank_verification_required");
    }
    if (!detail.contractAcceptanceId) {
      throw this.conflict("error.identity_application.contract_acceptance_required");
    }
  }

  private normalizeMerchantDetail(
    detail: MerchantApplicationDetailRecord
  ): MerchantApplicationDetailRecord {
    return {
      ...detail,
      corporateLegalName: detail.corporateLegalName?.trim() || null,
      corporateLegalNameKana: detail.corporateLegalNameKana?.trim() || null,
      representativeName: detail.representativeName.trim(),
      representativeNameKana: detail.representativeNameKana.trim(),
      shopName: detail.shopName.trim(),
      businessAddress: detail.businessAddress.trim(),
      contactPhone: detail.contactPhone.trim(),
      responsiblePersonName: detail.responsiblePersonName.trim()
    };
  }

  private conflict(message: string): AppError {
    return new AppError({
      code: ERROR_CODES.SAAS_BILLING_CONFLICT,
      message,
      statusCode: 409
    });
  }

  private validation(message: string): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message,
      statusCode: 400
    });
  }
}
