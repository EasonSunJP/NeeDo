import type { ImPrivacyExpiryService } from "../services/im-privacy-expiry.service";

interface ImPrivacyExpiryWorkerLogger {
  info: (context: Record<string, unknown>, message: string) => void;
  error: (context: Record<string, unknown>, message: string) => void;
}

export class ImPrivacyExpiryWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  public constructor(
    private readonly service: Pick<ImPrivacyExpiryService, "expireDue">,
    private readonly logger: ImPrivacyExpiryWorkerLogger,
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
      const result = await this.service.expireDue({
        now: this.now(),
        batchSize: this.batchSize
      });
      if (result.scanned > 0 || result.failed > 0 || result.publishFailed > 0) {
        this.logger.info(result, "IM privacy message expiry completed");
      }
    } catch (error) {
      this.logger.error({ error }, "IM privacy message expiry failed");
    } finally {
      this.running = false;
    }
  }
}
