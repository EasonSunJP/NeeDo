import type { IdentityApplicationMediaStoragePort } from "./identity-application-media.storage";

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_MAX_BATCHES = 20;
const CLAIM_TIMEOUT_MS = 15 * 60 * 1000;

export interface DueIdentityApplicationPurgeRecord {
  applicationId: number;
  version: number;
  fileKeys: string[];
}

export interface IdentityApplicationPurgeRepositoryPort {
  listDue: (input: {
    now: Date;
    retryBefore: Date;
    limit: number;
  }) => Promise<DueIdentityApplicationPurgeRecord[]>;
  claim: (input: {
    applicationId: number;
    expectedVersion: number;
    claimedAt: Date;
    retryBefore: Date;
  }) => Promise<boolean>;
  complete: (input: {
    applicationId: number;
    claimedVersion: number;
    purgedAt: Date;
  }) => Promise<void>;
  release: (input: { applicationId: number; claimedVersion: number }) => Promise<void>;
}

export interface PurgeDueIdentityApplicationsInput {
  now: Date;
  batchSize?: number;
  maxBatches?: number;
}

export interface PurgeDueIdentityApplicationsResult {
  purged: number;
  failed: number;
}

export class IdentityApplicationPurgeService {
  public constructor(
    private readonly repository: IdentityApplicationPurgeRepositoryPort,
    private readonly storage: IdentityApplicationMediaStoragePort
  ) {}

  public async purgeDue(
    input: PurgeDueIdentityApplicationsInput
  ): Promise<PurgeDueIdentityApplicationsResult> {
    const batchSize = input.batchSize ?? DEFAULT_BATCH_SIZE;
    const maxBatches = input.maxBatches ?? DEFAULT_MAX_BATCHES;
    const retryBefore = new Date(input.now.getTime() - CLAIM_TIMEOUT_MS);
    const result = { purged: 0, failed: 0 };

    for (let batch = 0; batch < maxBatches; batch += 1) {
      const due = await this.repository.listDue({
        now: input.now,
        retryBefore,
        limit: batchSize
      });
      if (due.length === 0) {
        break;
      }

      for (const application of due) {
        const claimed = await this.repository.claim({
          applicationId: application.applicationId,
          expectedVersion: application.version,
          claimedAt: input.now,
          retryBefore
        });
        if (!claimed) {
          continue;
        }

        const claimedVersion = application.version + 1;
        try {
          for (const fileKey of application.fileKeys) {
            await this.storage.delete(fileKey);
          }
          await this.repository.complete({
            applicationId: application.applicationId,
            claimedVersion,
            purgedAt: input.now
          });
          result.purged += 1;
        } catch {
          result.failed += 1;
          await this.repository.release({
            applicationId: application.applicationId,
            claimedVersion
          });
        }
      }

      if (due.length < batchSize) {
        break;
      }
    }

    return result;
  }
}
