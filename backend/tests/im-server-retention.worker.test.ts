import { ImServerRetentionWorker } from "../src/workers/im-server-retention.worker";

describe("ImServerRetentionWorker", () => {
  it("runs the bounded server-only purge and reports material activity", async () => {
    const now = new Date("2026-09-06T00:00:00.000Z");
    const service = {
      purgeDue: jest.fn(async () => ({
        scanned: 2,
        messagesPurged: 1,
        mediaPurged: 1,
        failed: 0
      }))
    };
    const logger = { info: jest.fn(), error: jest.fn() };
    const worker = new ImServerRetentionWorker(service, logger, 60_000, 50, () => now);

    await worker.runOnce();

    expect(service.purgeDue).toHaveBeenCalledWith({ now, batchSize: 50 });
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ messagesPurged: 1, mediaPurged: 1 }),
      "IM server retention completed"
    );
    expect(logger.error).not.toHaveBeenCalled();
  });
});
