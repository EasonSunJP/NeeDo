import type { AffiliateAllianceInvitationExpiryService } from "../services/affiliate-alliance-invitation-expiry.service";

interface AffiliateAllianceInvitationExpiryWorkerLogger {
  info: (context: Record<string, unknown>, message: string) => void;
  error: (context: Record<string, unknown>, message: string) => void;
}

export class AffiliateAllianceInvitationExpiryWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  public constructor(
    private readonly service: Pick<AffiliateAllianceInvitationExpiryService, "expireDue">,
    private readonly logger: AffiliateAllianceInvitationExpiryWorkerLogger,
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
      const result = await this.service.expireDue({ now: this.now(), batchSize: this.batchSize });
      this.logger.info(
        {
          scanned: result.scanned,
          expired: result.expired,
          skipped: result.skipped,
          failed: result.failed
        },
        "Affiliate alliance invitation expiry completed"
      );
    } catch (error) {
      this.logger.error({ error }, "Affiliate alliance invitation expiry failed");
    } finally {
      this.running = false;
    }
  }
}
