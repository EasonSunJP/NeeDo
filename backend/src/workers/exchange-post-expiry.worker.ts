import type { ExchangeService } from "../services/exchange.service";

interface ExchangePostExpiryWorkerLogger {
  info: (context: Record<string, unknown>, message: string) => void;
  error: (context: Record<string, unknown>, message: string) => void;
}

export class ExchangePostExpiryWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  public constructor(
    private readonly service: Pick<ExchangeService, "expireDue">,
    private readonly logger: ExchangePostExpiryWorkerLogger,
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
      const expired = await this.service.expireDue(this.now(), this.batchSize);
      this.logger.info({ expired }, "Exchange post expiry completed");
    } catch (error) {
      this.logger.error({ error }, "Exchange post expiry failed");
    } finally {
      this.running = false;
    }
  }
}
