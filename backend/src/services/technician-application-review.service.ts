import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import { IdentityApplicationPolicyService } from "./identity-application-policy.service";

export interface TechnicianApplicationReviewRecord {
  applicationId: number;
  applicantUserId: number;
  targetShopId: number;
  targetShopServiceUserId: number | null;
  status: string;
  version: number;
  applicantName: string;
  city: string | null;
  bio: string | null;
  phone: string | null;
  serviceAreas: string[];
  skills: string[];
  yearsExperience: number | null;
  gender: string | null;
  birthDate: Date | null;
  submittedAt: Date | null;
  createdAt: Date;
  media: Array<{
    id: number;
    purpose: string;
    url: string;
    mimeType: string;
  }>;
}

export interface TechnicianApplicationReviewListQuery {
  page: number;
  pageSize: number;
  status?: string;
}

export interface TechnicianApplicationReviewPage {
  list: TechnicianApplicationReviewRecord[];
  total: number;
  page: number;
  page_size: number;
}

export interface ApproveTechnicianApplicationRepositoryInput {
  applicationId: number;
  applicantUserId: number;
  targetShopId: number;
  reviewerUserId: number;
  expectedVersion: number;
  applicantName: string;
  city: string | null;
  bio: string | null;
  reviewedAt: Date;
  purgeAt: Date;
}

export interface RejectTechnicianApplicationRepositoryInput {
  applicationId: number;
  applicantUserId: number;
  targetShopId: number;
  reviewerUserId: number;
  expectedVersion: number;
  rejectionReason: string;
  reviewedAt: Date;
  purgeAt: Date;
}

export interface TechnicianApprovalResult {
  applicationId: number;
  status: "approved";
  version: number;
  technicianProfileId?: number;
  identityId?: number;
  reviewedAt?: Date;
}

export interface TechnicianRejectionResult {
  applicationId: number;
  status: "rejected";
  version: number;
  rejectionReason?: string;
  reviewedAt?: Date;
}

export interface TechnicianApplicationContactAuditInput {
  applicationId: number;
  reviewerUserId: number;
  targetShopId: number;
  conversationId: number;
  contactedAt: Date;
}

export interface TechnicianApplicationReviewRepositoryPort {
  listForShop: (
    shopId: number,
    query: TechnicianApplicationReviewListQuery
  ) => Promise<TechnicianApplicationReviewPage>;
  findForShop: (
    applicationId: number,
    shopId: number
  ) => Promise<TechnicianApplicationReviewRecord | null>;
  approveInTransaction: (
    input: ApproveTechnicianApplicationRepositoryInput
  ) => Promise<TechnicianApprovalResult>;
  rejectInTransaction: (
    input: RejectTechnicianApplicationRepositoryInput
  ) => Promise<TechnicianRejectionResult>;
  recordContactAudit: (input: TechnicianApplicationContactAuditInput) => Promise<void>;
}

export interface EnsureTechnicianApplicationContactInput {
  serviceUserId: number;
  applicantUserId: number;
  createdByUserId: number;
}

export interface TechnicianApplicationContactPort {
  ensureDirectContactConversation: (
    input: EnsureTechnicianApplicationContactInput
  ) => Promise<{ conversationId: number }>;
}

interface ReviewActionInput {
  applicationId: number;
  reviewerUserId: number;
  reviewerShopId: number;
  expectedVersion: number;
  now: Date;
}

export type ApproveTechnicianApplicationInput = ReviewActionInput;
export interface RejectTechnicianApplicationInput extends ReviewActionInput {
  rejectionReason: string;
}

export interface ContactTechnicianApplicationInput {
  applicationId: number;
  reviewerUserId: number;
  reviewerShopId: number;
  now: Date;
}

export class TechnicianApplicationReviewService {
  public constructor(
    private readonly repository: TechnicianApplicationReviewRepositoryPort,
    private readonly contacts: TechnicianApplicationContactPort,
    private readonly policy = new IdentityApplicationPolicyService()
  ) {}

  public list(
    reviewerShopId: number,
    query: TechnicianApplicationReviewListQuery
  ): Promise<TechnicianApplicationReviewPage> {
    return this.repository.listForShop(reviewerShopId, query);
  }

  public async get(
    applicationId: number,
    reviewerShopId: number
  ): Promise<TechnicianApplicationReviewRecord> {
    return this.loadForShop(applicationId, reviewerShopId);
  }

  public async approve(
    input: ApproveTechnicianApplicationInput
  ): Promise<TechnicianApprovalResult> {
    const application = await this.loadForShop(input.applicationId, input.reviewerShopId);
    if (application.status === "approved") {
      return {
        applicationId: application.applicationId,
        status: "approved",
        version: application.version
      };
    }
    this.assertReviewable(application.status);
    this.assertVersion(application.version, input.expectedVersion);

    return this.repository.approveInTransaction({
      applicationId: application.applicationId,
      applicantUserId: application.applicantUserId,
      targetShopId: application.targetShopId,
      reviewerUserId: input.reviewerUserId,
      expectedVersion: input.expectedVersion,
      applicantName: application.applicantName,
      city: application.city,
      bio: application.bio,
      reviewedAt: input.now,
      purgeAt: this.policy.calculatePurgeAt(input.now)
    });
  }

  public async reject(
    input: RejectTechnicianApplicationInput
  ): Promise<TechnicianRejectionResult> {
    const rejectionReason = input.rejectionReason.trim();
    if (!rejectionReason) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.identity_application.rejection_reason_required",
        statusCode: 400
      });
    }
    const application = await this.loadForShop(input.applicationId, input.reviewerShopId);
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
      targetShopId: application.targetShopId,
      reviewerUserId: input.reviewerUserId,
      expectedVersion: input.expectedVersion,
      rejectionReason,
      reviewedAt: input.now,
      purgeAt: this.policy.calculatePurgeAt(input.now)
    });
  }

  public async contact(
    input: ContactTechnicianApplicationInput
  ): Promise<{ conversationId: number }> {
    const application = await this.loadForShop(input.applicationId, input.reviewerShopId);
    this.assertReviewable(application.status);
    if (application.targetShopServiceUserId === null) {
      throw new AppError({
        code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
        message: "error.identity_application.shop_service_account_unavailable",
        statusCode: 503
      });
    }
    const result = await this.contacts.ensureDirectContactConversation({
      serviceUserId: application.targetShopServiceUserId,
      applicantUserId: application.applicantUserId,
      createdByUserId: input.reviewerUserId
    });
    await this.repository.recordContactAudit({
      applicationId: application.applicationId,
      reviewerUserId: input.reviewerUserId,
      targetShopId: application.targetShopId,
      conversationId: result.conversationId,
      contactedAt: input.now
    });
    return result;
  }

  private async loadForShop(
    applicationId: number,
    shopId: number
  ): Promise<TechnicianApplicationReviewRecord> {
    const application = await this.repository.findForShop(applicationId, shopId);
    if (!application) {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.identity_application.not_found",
        statusCode: 404
      });
    }
    return application;
  }

  private assertReviewable(status: string): void {
    if (status !== "submitted" && status !== "under_review") {
      throw new AppError({
        code: ERROR_CODES.SAAS_BILLING_CONFLICT,
        message: "error.identity_application.invalid_transition",
        statusCode: 409
      });
    }
  }

  private assertVersion(actual: number, expected: number): void {
    if (actual !== expected) {
      throw new AppError({
        code: ERROR_CODES.SAAS_BILLING_CONFLICT,
        message: "error.identity_application.version_conflict",
        statusCode: 409
      });
    }
  }
}
