import type { AffiliateTaskExpiryService } from "../services/affiliate-task-expiry.service";

interface AffiliateTaskExpiryWorkerLogger {
  info: (context: Record<string, unknown>, message: string) => void;
  error: (context: Record<string, unknown>, message: string) => void;
}

export class AffiliateTaskExpiryWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  public constructor(
    private readonly service: Pick<AffiliateTaskExpiryService, "expireDue">,
    private readonly logger: AffiliateTaskExpiryWorkerLogger,
    private readonly intervalMs: number,
    private readonly batchSize: number,
    private readonly now: () => Date = () => new Date()
  ) {}

  public start(): void {
    if (this.timer) {
      return;
    }
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), this.intervalMs);
    this.timer.unref();
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async runOnce(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const result = await this.service.expireDue({ now: this.now(), batchSize: this.batchSize });
      this.logger.info(
        {
          scanned: result.scanned,
          ended: result.ended,
          released: result.released,
          failed: result.failed,
          releasedNdp: result.releasedNdp
        },
        "Affiliate task expiry completed"
      );
    } catch (error) {
      this.logger.error({ error }, "Affiliate task expiry failed");
    } finally {
      this.running = false;
    }
  }
}
