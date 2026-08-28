import { createHash, randomUUID } from "crypto";
import type {
  AuditLogCreateInput,
  AuditLogRepositoryPort
} from "../repositories/audit-log.repository";

export type ContentPublicationAggregateType = "official_announcement" | "carousel";

export interface ContentPublicationDueRelease {
  aggregateType: ContentPublicationAggregateType;
  aggregateKey: string;
  aggregateTargetId: number;
  releaseId: number;
  publishAt: Date;
}

export interface ContentPublicationActivationInput {
  release: ContentPublicationDueRelease;
  now: Date;
  maxAttempts: number;
  sequence: number;
  commandKey: string;
  requestFingerprint: string;
}

export interface ContentPublicationActivationOutcome {
  activated: boolean;
  replayed: boolean;
}

export interface ContentPublicationFailureRecordInput {
  release: ContentPublicationDueRelease;
  now: Date;
  maxAttempts: number;
  errorKey: string;
  runId: string;
  audit: AuditLogCreateInput;
  auditLogRepository: AuditLogRepositoryPort;
}

export interface ContentPublicationFailureRecordOutcome {
  recorded: boolean;
  activationAttempts: number;
  disabled: boolean;
}

export interface ContentPublicationActivationRepositoryPort {
  listDueScheduledReleases(input: {
    now: Date;
    batchSize: number;
    maxAttempts: number;
  }): Promise<ContentPublicationDueRelease[]>;
  activateDueScheduledRelease(
    input: ContentPublicationActivationInput
  ): Promise<ContentPublicationActivationOutcome>;
  recordDueScheduledReleaseFailure(
    input: ContentPublicationFailureRecordInput
  ): Promise<ContentPublicationFailureRecordOutcome>;
}

export interface ContentPublicationActivationResult {
  scanned: number;
  activated: number;
  failed: number;
}

export interface ContentPublicationFailure {
  aggregateType: ContentPublicationAggregateType;
  aggregateKey: string;
  releaseId: number;
  errorKey: string;
  runId: string;
  activationAttempts: number;
  disabled: boolean;
}

const ACTIVATION_ERROR_KEY = "error.content.schedule_activation_failed";

export class ContentPublicationSchedulerService {
  public constructor(
    private readonly announcementRepository: ContentPublicationActivationRepositoryPort,
    private readonly carouselRepository: ContentPublicationActivationRepositoryPort,
    private readonly auditLogRepository: AuditLogRepositoryPort,
    private readonly maxActivationAttempts: number,
    private readonly onFailure?: (failure: ContentPublicationFailure) => void,
    private readonly createRunId: () => string = randomUUID
  ) {}

  public async activateDue(input: {
    now: Date;
    batchSize: number;
  }): Promise<ContentPublicationActivationResult> {
    const runId = this.createRunId();
    const [announcementDue, carouselDue] = await Promise.all([
      this.announcementRepository.listDueScheduledReleases({
        ...input,
        maxAttempts: this.maxActivationAttempts
      }),
      this.carouselRepository.listDueScheduledReleases({
        ...input,
        maxAttempts: this.maxActivationAttempts
      })
    ]);
    const due = [...announcementDue, ...carouselDue]
      .sort((left, right) => {
        const byPublishAt = left.publishAt.getTime() - right.publishAt.getTime();
        if (byPublishAt !== 0) return byPublishAt;
        const byId = left.releaseId - right.releaseId;
        if (byId !== 0) return byId;
        return left.aggregateType.localeCompare(right.aggregateType);
      })
      .slice(0, input.batchSize);

    let activated = 0;
    let failed = 0;
    for (const [sequence, release] of due.entries()) {
      const repository =
        release.aggregateType === "official_announcement"
          ? this.announcementRepository
          : this.carouselRepository;
      const commandKey = this.commandKey(release);
      try {
        const outcome = await repository.activateDueScheduledRelease({
          release,
          now: input.now,
          maxAttempts: this.maxActivationAttempts,
          sequence,
          commandKey,
          requestFingerprint: createHash("sha256").update(commandKey).digest("hex")
        });
        if (outcome.activated) activated += 1;
      } catch {
        failed += 1;
        const audit = this.failureAudit(release, runId);
        let record: ContentPublicationFailureRecordOutcome = {
          recorded: false,
          activationAttempts: 0,
          disabled: false
        };
        try {
          record = await repository.recordDueScheduledReleaseFailure({
            release,
            now: input.now,
            maxAttempts: this.maxActivationAttempts,
            errorKey: ACTIVATION_ERROR_KEY,
            runId,
            audit,
            auditLogRepository: this.auditLogRepository
          });
        } catch {
          // Per-release persistence failures remain isolated so later due work can proceed.
        }
        try {
          this.onFailure?.({
            aggregateType: release.aggregateType,
            aggregateKey: release.aggregateKey,
            releaseId: release.releaseId,
            errorKey: ACTIVATION_ERROR_KEY,
            runId,
            activationAttempts: record.activationAttempts,
            disabled: record.disabled
          });
        } catch {
          // Observability callbacks cannot stop the remaining due releases.
        }
      }
    }

    return { scanned: due.length, activated, failed };
  }

  private commandKey(release: ContentPublicationDueRelease): string {
    return `content-publication:${release.aggregateType}:${release.aggregateKey}:release:${release.releaseId}:activate`;
  }

  private failureAudit(release: ContentPublicationDueRelease, runId: string): AuditLogCreateInput {
    return {
      actorId: null,
      action: "content_publication.schedule_failed",
      targetType:
        release.aggregateType === "official_announcement"
          ? "OfficialAnnouncementRelease"
          : "CarouselRelease",
      targetId: release.releaseId,
      metadata: {
        aggregateType: release.aggregateType,
        aggregateId: release.aggregateTargetId,
        aggregateKey: release.aggregateKey,
        releaseId: release.releaseId,
        errorKey: ACTIVATION_ERROR_KEY,
        runId
      }
    };
  }
}
