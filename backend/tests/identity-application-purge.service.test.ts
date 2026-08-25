import {
  IdentityApplicationPurgeService,
  type IdentityApplicationPurgeRepositoryPort
} from "../src/services/identity-application-purge.service";
import type { IdentityApplicationMediaStoragePort } from "../src/services/identity-application-media.storage";

const now = new Date("2026-09-25T05:00:00.000Z");

const createRepository = (): jest.Mocked<IdentityApplicationPurgeRepositoryPort> => ({
  listDue: jest.fn(),
  claim: jest.fn(),
  complete: jest.fn(),
  release: jest.fn()
});

const createStorage = (): jest.Mocked<IdentityApplicationMediaStoragePort> => ({
  save: jest.fn(),
  read: jest.fn(),
  delete: jest.fn()
});

describe("IdentityApplicationPurgeService", () => {
  it("physically deletes due files and finalizes application-only data at 30 days", async () => {
    const repository = createRepository();
    const storage = createStorage();
    repository.listDue.mockResolvedValueOnce([
      {
        applicationId: 41,
        version: 3,
        fileKeys: ["a".repeat(64) + ".jpg", "b".repeat(64) + ".png"]
      }
    ]).mockResolvedValueOnce([]);
    repository.claim.mockResolvedValue(true);
    repository.complete.mockResolvedValue(undefined);
    storage.delete.mockResolvedValue(undefined);

    const result = await new IdentityApplicationPurgeService(repository, storage).purgeDue({
      now,
      batchSize: 25,
      maxBatches: 2
    });

    expect(result).toEqual({ purged: 1, failed: 0 });
    expect(repository.listDue).toHaveBeenNthCalledWith(1, {
      now,
      retryBefore: new Date("2026-09-25T04:45:00.000Z"),
      limit: 25
    });
    expect(storage.delete).toHaveBeenCalledTimes(2);
    expect(repository.complete).toHaveBeenCalledWith({
      applicationId: 41,
      claimedVersion: 4,
      purgedAt: now
    });
  });

  it("does nothing before the repository reports the exact due boundary", async () => {
    const repository = createRepository();
    const storage = createStorage();
    repository.listDue.mockResolvedValue([]);

    await expect(
      new IdentityApplicationPurgeService(repository, storage).purgeDue({ now })
    ).resolves.toEqual({ purged: 0, failed: 0 });
    expect(repository.claim).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("releases the claim for an idempotent retry when physical deletion fails", async () => {
    const repository = createRepository();
    const storage = createStorage();
    repository.listDue.mockResolvedValueOnce([
      { applicationId: 41, version: 3, fileKeys: ["a".repeat(64) + ".jpg"] }
    ]).mockResolvedValueOnce([]);
    repository.claim.mockResolvedValue(true);
    repository.release.mockResolvedValue(undefined);
    storage.delete.mockRejectedValue(new Error("disk unavailable"));

    await expect(
      new IdentityApplicationPurgeService(repository, storage).purgeDue({ now, maxBatches: 2 })
    ).resolves.toEqual({ purged: 0, failed: 1 });
    expect(repository.release).toHaveBeenCalledWith({ applicationId: 41, claimedVersion: 4 });
    expect(repository.complete).not.toHaveBeenCalled();
  });

  it("skips a record claimed by another worker", async () => {
    const repository = createRepository();
    const storage = createStorage();
    repository.listDue.mockResolvedValueOnce([
      { applicationId: 41, version: 3, fileKeys: ["a".repeat(64) + ".jpg"] }
    ]).mockResolvedValueOnce([]);
    repository.claim.mockResolvedValue(false);

    await expect(
      new IdentityApplicationPurgeService(repository, storage).purgeDue({ now, maxBatches: 2 })
    ).resolves.toEqual({ purged: 0, failed: 0 });
    expect(storage.delete).not.toHaveBeenCalled();
  });
});
