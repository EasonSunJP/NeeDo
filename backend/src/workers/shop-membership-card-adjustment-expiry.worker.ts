import type { ShopMembershipCardAdjustmentExpiryService } from "../services/shop-membership-card-adjustment-expiry.service";

interface ShopMembershipCardAdjustmentExpiryWorkerLogger {
  info: (context: Record<string, unknown>, message: string) => void;
  error: (context: Record<string, unknown>, message: string) => void;
}

export class ShopMembershipCardAdjustmentExpiryWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  public constructor(
    private readonly service: Pick<ShopMembershipCardAdjustmentExpiryService, "expireDue">,
    private readonly logger: ShopMembershipCardAdjustmentExpiryWorkerLogger,
    private readonly intervalMs: number,
    private readonly batchSize: number
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
      const result = await this.service.expireDue({ batchSize: this.batchSize });
      this.logger.info(
        { scanned: result.scanned, expired: result.expired, failed: result.failed },
        "Membership card adjustment expiry completed"
      );
    } catch (error) {
      this.logger.error({ error }, "Membership card adjustment expiry failed");
    } finally {
      this.running = false;
    }
  }
}
