import type { IdentityApplicationPurgeService } from "../services/identity-application-purge.service";

interface PurgeWorkerLogger {
  info: (context: Record<string, unknown>, message: string) => void;
  error: (context: Record<string, unknown>, message: string) => void;
}

export class IdentityApplicationPurgeWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  public constructor(
    private readonly service: Pick<IdentityApplicationPurgeService, "purgeDue">,
    private readonly logger: PurgeWorkerLogger,
    private readonly intervalMs: number,
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
      const result = await this.service.purgeDue({ now: this.now() });
      this.logger.info(
        { purged: result.purged, failed: result.failed },
        "Identity application private-data purge completed"
      );
    } catch (error) {
      this.logger.error({ error }, "Identity application private-data purge failed");
    } finally {
      this.running = false;
    }
  }
}
