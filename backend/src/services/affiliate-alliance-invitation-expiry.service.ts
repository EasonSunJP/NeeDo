import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

export interface AffiliateAllianceInvitationExpiryRepositoryPort {
  listExpiryCandidateInvitationIds(input: {
    now: Date;
    batchSize: number;
    afterInvitationId: number;
  }): Promise<number[]>;
  expireInvitation(input: { invitationId: number; now: Date }): Promise<boolean>;
}

export interface AffiliateAllianceInvitationExpiryInput {
  now: Date;
  batchSize: number;
}

export interface AffiliateAllianceInvitationExpirySummary {
  scanned: number;
  expired: number;
  skipped: number;
  failed: number;
}

export class AffiliateAllianceInvitationExpiryService {
  private afterInvitationId = 0;

  public constructor(
    private readonly repository: AffiliateAllianceInvitationExpiryRepositoryPort
  ) {}

  public async expireDue(
    input: AffiliateAllianceInvitationExpiryInput
  ): Promise<AffiliateAllianceInvitationExpirySummary> {
    this.validateInput(input);
    let candidateIds = await this.repository.listExpiryCandidateInvitationIds({
      now: input.now,
      batchSize: input.batchSize,
      afterInvitationId: this.afterInvitationId
    });
    candidateIds = candidateIds.slice(0, input.batchSize);
    if (candidateIds.length === 0 && this.afterInvitationId !== 0) {
      this.afterInvitationId = 0;
      return { scanned: 0, expired: 0, skipped: 0, failed: 0 };
    }
    if (candidateIds.length > 0) {
      this.afterInvitationId = candidateIds[candidateIds.length - 1];
    }

    const summary: AffiliateAllianceInvitationExpirySummary = {
      scanned: candidateIds.length,
      expired: 0,
      skipped: 0,
      failed: 0
    };
    for (const invitationId of candidateIds) {
      try {
        const expired = await this.repository.expireInvitation({ invitationId, now: input.now });
        summary.expired += expired ? 1 : 0;
        summary.skipped += expired ? 0 : 1;
      } catch {
        summary.failed += 1;
      }
    }
    return summary;
  }

  private validateInput(input: AffiliateAllianceInvitationExpiryInput): void {
    if (
      Number.isNaN(input.now.getTime()) ||
      !Number.isSafeInteger(input.batchSize) ||
      input.batchSize < 1 ||
      input.batchSize > 500
    ) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.validation",
        statusCode: 400
      });
    }
  }
}
