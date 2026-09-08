import type { OfficialNoticeDispatchResult } from "../services/official-notice.service";

export interface OfficialNoticeWorkerRepositoryPort {
  dispatchDueBatch(now: Date, batchSize: number): Promise<OfficialNoticeDispatchResult>;
}

export interface OfficialNoticeWorkerOptions {
  batchSize?: number;
  intervalMs?: number;
  logger?: {
    info(context: Record<string, unknown>, message: string): void;
    error(context: Record<string, unknown>, message: string): void;
  };
  now?: () => Date;
}

export class OfficialNoticeWorker {
  private readonly batchSize: number;
  private readonly intervalMs: number;
  private readonly logger: NonNullable<OfficialNoticeWorkerOptions["logger"]>;
  private readonly now: () => Date;
  private inFlight: Promise<OfficialNoticeDispatchResult> | null = null;
  private timer: NodeJS.Timeout | null = null;

  public constructor(
    private readonly repository: OfficialNoticeWorkerRepositoryPort,
    options: OfficialNoticeWorkerOptions = {}
  ) {
    this.batchSize = Math.max(1, Math.min(500, options.batchSize ?? 100));
    this.intervalMs = Math.max(1_000, options.intervalMs ?? 60_000);
    this.logger = options.logger ?? { info: () => undefined, error: () => undefined };
    this.now = options.now ?? (() => new Date());
  }

  public start(): void {
    if (this.timer) return;
    void this.runScheduled();
    this.timer = setInterval(() => void this.runScheduled(), this.intervalMs);
    this.timer.unref();
  }

  public stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  public async stopAndDrain(): Promise<void> {
    this.stop();
    await this.inFlight;
  }

  public runOnce(now = new Date()): Promise<OfficialNoticeDispatchResult> {
    if (this.inFlight) return this.inFlight;
    const operation = this.repository.dispatchDueBatch(now, this.batchSize);
    const inFlight = operation.finally(() => {
      if (this.inFlight === inFlight) this.inFlight = null;
    });
    this.inFlight = inFlight;
    return inFlight;
  }

  private async runScheduled(): Promise<void> {
    try {
      const result = await this.runOnce(this.now());
      this.logger.info({ ...result }, "Official notice delivery completed");
    } catch (error) {
      this.logger.error({ error }, "Official notice delivery failed");
    }
  }
}
