import type { ContentMediaPurgeService } from "../services/content-media-purge.service";

export class ContentMediaPurgeWorker {
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;

  public constructor(
    private readonly service: Pick<ContentMediaPurgeService, "purgeDue">,
    private readonly logger: {
      info(context: Record<string, unknown>, message: string): void;
      error(context: Record<string, unknown>, message: string): void;
    },
    private readonly intervalMs = 5 * 60 * 1000
  ) {}

  public start(): void {
    if (this.timer) return;
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), this.intervalMs);
    this.timer.unref();
  }

  public async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.running;
  }

  public async runOnce(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.process();
    try { await this.running; } finally { this.running = null; }
  }

  private async process(): Promise<void> {
    try {
      this.logger.info(await this.service.purgeDue({ now: new Date() }), "Pending content-media purge completed");
    } catch (error) {
      this.logger.error({ error }, "Pending content-media purge failed");
    }
  }
}
