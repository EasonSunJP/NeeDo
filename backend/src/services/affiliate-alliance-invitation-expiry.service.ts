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

const FORWARD_RUNS_PER_REVISIT = 3;

export class AffiliateAllianceInvitationExpiryService {
  private afterInvitationId = 0;
  private forwardRunsSinceRevisit = 0;
  private revisitAfterInvitationId = 0;
  private revisitUpperBound = 0;

  public constructor(
    private readonly repository: AffiliateAllianceInvitationExpiryRepositoryPort
  ) {}

  public async expireDue(
    input: AffiliateAllianceInvitationExpiryInput
  ): Promise<AffiliateAllianceInvitationExpirySummary> {
    this.validateInput(input);
    const candidatePage = await this.listCandidateIds(input);
    const candidateIds = candidatePage.invitationIds;
    if (candidatePage.advanceForwardCursor && candidateIds.length > 0) {
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

  private async listCandidateIds(input: AffiliateAllianceInvitationExpiryInput): Promise<{
    invitationIds: number[];
    advanceForwardCursor: boolean;
  }> {
    if (
      this.afterInvitationId !== 0 &&
      this.forwardRunsSinceRevisit >= FORWARD_RUNS_PER_REVISIT
    ) {
      this.forwardRunsSinceRevisit = 0;
      return this.listRevisitCandidateIds(input);
    }

    const invitationIds = (
      await this.repository.listExpiryCandidateInvitationIds({
        now: input.now,
        batchSize: input.batchSize,
        afterInvitationId: this.afterInvitationId
      })
    ).slice(0, input.batchSize);
    if (invitationIds.length === 0 && this.afterInvitationId !== 0) {
      this.afterInvitationId = 0;
      this.forwardRunsSinceRevisit = 0;
      this.resetRevisitSweep();
      return { invitationIds: [], advanceForwardCursor: true };
    }

    this.forwardRunsSinceRevisit += 1;
    return { invitationIds, advanceForwardCursor: true };
  }

  private async listRevisitCandidateIds(
    input: AffiliateAllianceInvitationExpiryInput
  ): Promise<{ invitationIds: number[]; advanceForwardCursor: false }> {
    if (this.revisitUpperBound === 0) {
      this.revisitUpperBound = this.afterInvitationId;
    }
    const candidateIds = (
      await this.repository.listExpiryCandidateInvitationIds({
        now: input.now,
        batchSize: input.batchSize,
        afterInvitationId: this.revisitAfterInvitationId
      })
    ).slice(0, input.batchSize);
    const invitationIds = candidateIds.filter(
      (invitationId) => invitationId <= this.revisitUpperBound
    );

    if (invitationIds.length > 0) {
      this.revisitAfterInvitationId = invitationIds[invitationIds.length - 1];
    }
    if (
      candidateIds.length < input.batchSize ||
      invitationIds.length !== candidateIds.length ||
      this.revisitAfterInvitationId >= this.revisitUpperBound
    ) {
      this.resetRevisitSweep();
    }

    return { invitationIds, advanceForwardCursor: false };
  }

  private resetRevisitSweep(): void {
    this.revisitAfterInvitationId = 0;
    this.revisitUpperBound = 0;
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
