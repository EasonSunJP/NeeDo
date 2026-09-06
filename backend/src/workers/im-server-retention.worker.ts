import type { ImServerRetentionService } from "../services/im-server-retention.service";

interface ImServerRetentionWorkerLogger {
  info(context: Record<string, unknown>, message: string): void;
  error(context: Record<string, unknown>, message: string): void;
}

export class ImServerRetentionWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  public constructor(
    private readonly service: Pick<ImServerRetentionService, "purgeDue">,
    private readonly logger: ImServerRetentionWorkerLogger,
    private readonly intervalMs: number,
    private readonly batchSize: number,
    private readonly now: () => Date = () => new Date()
  ) {}

  public start(): void {
    if (this.timer) return;
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), this.intervalMs);
    this.timer.unref();
  }

  public stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  public async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.service.purgeDue({
        now: this.now(),
        batchSize: this.batchSize
      });
      if (result.scanned > 0 || result.failed > 0) {
        this.logger.info(result, "IM server retention completed");
      }
    } catch (error) {
      this.logger.error({ error }, "IM server retention failed");
    } finally {
      this.running = false;
    }
  }
}
