import type { MerchantShopAuditOutboxService } from "../services/merchant-shop-audit-outbox.service";

interface MerchantShopAuditOutboxWorkerLogger {
  info: (context: Record<string, unknown>, message: string) => void;
  error: (context: Record<string, unknown>, message: string) => void;
}

export class MerchantShopAuditOutboxWorker {
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private lastTriggeredAt = 0;

  public constructor(
    private readonly service: Pick<MerchantShopAuditOutboxService, "drain">,
    private readonly logger: MerchantShopAuditOutboxWorkerLogger,
    private readonly intervalMs: number,
    private readonly triggerThrottleMs = 1_000
  ) {}

  public start(): void {
    if (this.timer) return;
    this.trigger(true);
    this.timer = setInterval(() => this.trigger(true), this.intervalMs);
    this.timer.unref();
  }

  public stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  public trigger(ignoreThrottle = false): void {
    const now = Date.now();
    if (!ignoreThrottle && now - this.lastTriggeredAt < this.triggerThrottleMs) return;
    this.lastTriggeredAt = now;
    if (this.running) return;
    this.running = this.runOnce().finally(() => {
      this.running = null;
    });
  }

  public async runOnce(): Promise<void> {
    try {
      const result = await this.service.drain();
      this.logger.info({ ...result }, "Merchant shop audit outbox drain completed");
    } catch (error) {
      this.logger.error({ error }, "Merchant shop audit outbox drain failed");
    }
  }
}
