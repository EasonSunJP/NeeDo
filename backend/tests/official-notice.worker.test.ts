import { OfficialNoticeWorker } from "../src/workers/official-notice.worker";

describe("OfficialNoticeWorker", () => {
  it("delegates one bounded due batch and keeps its result observable", async () => {
    const dispatchDueBatch = jest.fn(async () => ({ notices: 2, delivered: 8, failed: 1 }));
    const worker = new OfficialNoticeWorker({ dispatchDueBatch }, { batchSize: 25 });
    const now = new Date("2026-09-02T12:00:00.000Z");
    await expect(worker.runOnce(now)).resolves.toEqual({ notices: 2, delivered: 8, failed: 1 });
    expect(dispatchDueBatch).toHaveBeenCalledWith(now, 25);
  });

  it("coalesces concurrent runs onto the same repository pass", async () => {
    let resolve!: (value: { notices: number; delivered: number; failed: number }) => void;
    const dispatchDueBatch = jest.fn(
      (dispatchAt: Date, batchSize: number) => {
        void dispatchAt;
        void batchSize;
        return new Promise<{ notices: number; delivered: number; failed: number }>((next) => {
          resolve = next;
        });
      }
    );
    const worker = new OfficialNoticeWorker({ dispatchDueBatch });
    const first = worker.runOnce(new Date());
    const second = worker.runOnce(new Date());
    expect(dispatchDueBatch).toHaveBeenCalledTimes(1);
    resolve({ notices: 1, delivered: 1, failed: 0 });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { notices: 1, delivered: 1, failed: 0 },
      { notices: 1, delivered: 1, failed: 0 }
    ]);
  });

  it("starts an immediate recurring pass, reports outcomes, and stops cleanly", async () => {
    jest.useFakeTimers();
    try {
      const dispatchDueBatch = jest.fn(async () => ({ notices: 1, delivered: 3, failed: 0 }));
      const logger = { info: jest.fn(), error: jest.fn() };
      const worker = new OfficialNoticeWorker(
        { dispatchDueBatch },
        {
          batchSize: 20,
          intervalMs: 1_000,
          logger,
          now: () => new Date("2026-09-02T12:00:00.000Z")
        }
      );
      worker.start();
      await jest.runOnlyPendingTimersAsync();
      expect(dispatchDueBatch).toHaveBeenCalledTimes(2);
      expect(logger.info).toHaveBeenCalledWith(
        { notices: 1, delivered: 3, failed: 0 },
        "Official notice delivery completed"
      );
      worker.stop();
      await jest.advanceTimersByTimeAsync(2_000);
      expect(dispatchDueBatch).toHaveBeenCalledTimes(2);
      expect(logger.error).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
