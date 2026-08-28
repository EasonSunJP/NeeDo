import type {
  AuditLogCreateInput,
  AuditLogRepositoryPort
} from "../src/repositories/audit-log.repository";
import {
  ContentPublicationSchedulerService,
  type ContentPublicationDueRelease,
  type ContentPublicationFailureRecordInput,
  type ContentPublicationActivationInput
} from "../src/services/content-publication-scheduler.service";

const now = new Date("2026-08-29T09:00:00.000Z");

const due = (
  aggregateType: ContentPublicationDueRelease["aggregateType"],
  aggregateKey: string,
  aggregateTargetId: number,
  releaseId: number,
  publishAt: string
): ContentPublicationDueRelease => ({
  aggregateType,
  aggregateKey,
  aggregateTargetId,
  releaseId,
  publishAt: new Date(publishAt)
});

class AuditSpy implements AuditLogRepositoryPort {
  public readonly entries: AuditLogCreateInput[] = [];

  public async create(input: AuditLogCreateInput): Promise<void> {
    this.entries.push(input);
  }
}

class ScheduledRepositorySpy {
  public readonly activations: ContentPublicationActivationInput[] = [];
  public readonly failures: ContentPublicationFailureRecordInput[] = [];
  public activationFailures = new Map<number, unknown>();

  public constructor(public dueReleases: ContentPublicationDueRelease[]) {}

  public async listDueScheduledReleases(): Promise<ContentPublicationDueRelease[]> {
    return this.dueReleases;
  }

  public async activateDueScheduledRelease(input: ContentPublicationActivationInput) {
    this.activations.push(input);
    const failure = this.activationFailures.get(input.release.releaseId);
    if (failure) throw failure;
    return { activated: true, replayed: false };
  }

  public async recordDueScheduledReleaseFailure(input: ContentPublicationFailureRecordInput) {
    this.failures.push(input);
    await input.auditLogRepository.create(input.audit);
    return { recorded: true, activationAttempts: 1, disabled: false };
  }
}

describe("ContentPublicationSchedulerService", () => {
  it("activates due releases in deterministic publishAt/id order and isolates one failure", async () => {
    const announcement = new ScheduledRepositorySpy([
      due("official_announcement", "announcement-a", 11, 3, "2026-08-29T08:00:00.000Z"),
      due("official_announcement", "announcement-b", 12, 9, "2026-08-29T08:30:00.000Z")
    ]);
    const carousel = new ScheduledRepositorySpy([
      due("carousel", "USER_HOME", 21, 5, "2026-08-29T08:15:00.000Z")
    ]);
    carousel.activationFailures.set(5, new Error("database unavailable"));
    const auditLogRepository = new AuditSpy();
    const onFailure = jest.fn();
    const service = new ContentPublicationSchedulerService(
      announcement,
      carousel,
      auditLogRepository,
      3,
      onFailure,
      () => "run-0001"
    );

    await expect(service.activateDue({ now, batchSize: 50 })).resolves.toEqual({
      scanned: 3,
      activated: 2,
      failed: 1
    });

    const orderedReleaseIds = [...announcement.activations, ...carousel.activations]
      .sort((left, right) => left.sequence - right.sequence)
      .map((input) => input.release.releaseId);
    expect(orderedReleaseIds).toEqual([3, 5, 9]);
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateType: "carousel",
        aggregateKey: "USER_HOME",
        releaseId: 5,
        errorKey: "error.content.schedule_activation_failed",
        runId: "run-0001"
      })
    );
    expect(announcement.activations).toHaveLength(2);
    expect(carousel.activations).toHaveLength(1);
  });

  it("writes the stable failure audit through the injected repository and continues later work", async () => {
    const first = due("carousel", "USER_HOME", 21, 7, "2026-08-29T08:00:00.000Z");
    const later = due(
      "official_announcement",
      "announcement-later",
      31,
      8,
      "2026-08-29T08:01:00.000Z"
    );
    const announcement = new ScheduledRepositorySpy([later]);
    const carousel = new ScheduledRepositorySpy([first]);
    carousel.activationFailures.set(7, new TypeError("volatile implementation detail"));
    const auditLogRepository = new AuditSpy();
    const service = new ContentPublicationSchedulerService(
      announcement,
      carousel,
      auditLogRepository,
      3,
      undefined,
      () => "run-correlation-7"
    );

    await service.activateDue({ now, batchSize: 50 });

    expect(auditLogRepository.entries).toEqual([
      {
        actorId: null,
        action: "content_publication.schedule_failed",
        targetType: "CarouselRelease",
        targetId: 7,
        metadata: {
          aggregateType: "carousel",
          aggregateId: 21,
          aggregateKey: "USER_HOME",
          releaseId: 7,
          errorKey: "error.content.schedule_activation_failed",
          runId: "run-correlation-7"
        }
      }
    ]);
    expect(announcement.activations).toHaveLength(1);
  });

  it("uses stable command keys and bounded global batching", async () => {
    const announcement = new ScheduledRepositorySpy([
      due("official_announcement", "a", 1, 1, "2026-08-29T08:00:00.000Z"),
      due("official_announcement", "b", 2, 4, "2026-08-29T08:03:00.000Z")
    ]);
    const carousel = new ScheduledRepositorySpy([
      due("carousel", "USER_HOME", 3, 2, "2026-08-29T08:01:00.000Z"),
      due("carousel", "AFFILIATE_HOME_NOTICE", 4, 3, "2026-08-29T08:02:00.000Z")
    ]);
    const service = new ContentPublicationSchedulerService(
      announcement,
      carousel,
      new AuditSpy(),
      3,
      undefined,
      () => "run-bounded"
    );

    await expect(service.activateDue({ now, batchSize: 2 })).resolves.toEqual({
      scanned: 2,
      activated: 2,
      failed: 0
    });
    const activations = [...announcement.activations, ...carousel.activations];
    expect(activations).toHaveLength(2);
    expect(activations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          commandKey: "content-publication:official_announcement:a:release:1:activate",
          requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/)
        }),
        expect.objectContaining({
          commandKey: "content-publication:carousel:USER_HOME:release:2:activate",
          requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/)
        })
      ])
    );
  });

  it("fails the run when due enumeration fails before processing", async () => {
    const failure = new Error("enumeration unavailable");
    const announcement = new ScheduledRepositorySpy([]);
    announcement.listDueScheduledReleases = jest.fn().mockRejectedValue(failure);
    const carousel = new ScheduledRepositorySpy([]);
    const service = new ContentPublicationSchedulerService(
      announcement,
      carousel,
      new AuditSpy(),
      3
    );

    await expect(service.activateDue({ now, batchSize: 50 })).rejects.toBe(failure);
    expect(announcement.activations).toHaveLength(0);
    expect(carousel.activations).toHaveLength(0);
  });

  it("isolates a throwing failure observer and still activates later due work", async () => {
    const announcement = new ScheduledRepositorySpy([
      due("official_announcement", "announcement-later", 31, 8, "2026-08-29T08:01:00.000Z")
    ]);
    const carousel = new ScheduledRepositorySpy([
      due("carousel", "USER_HOME", 21, 7, "2026-08-29T08:00:00.000Z")
    ]);
    carousel.activationFailures.set(7, new Error("activation failed"));
    const service = new ContentPublicationSchedulerService(
      announcement,
      carousel,
      new AuditSpy(),
      3,
      () => {
        throw new Error("observer failed");
      }
    );

    await expect(service.activateDue({ now, batchSize: 50 })).resolves.toEqual({
      scanned: 2,
      activated: 1,
      failed: 1
    });
    expect(announcement.activations).toHaveLength(1);
  });
});
