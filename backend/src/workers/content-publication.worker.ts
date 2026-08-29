import type { ContentPublicationActivationResult } from "../services/content-publication-scheduler.service";

interface ContentPublicationWorkerLogger {
  info(context: Record<string, unknown>, message: string): void;
  error(context: Record<string, unknown>, message: string): void;
}

export class ContentPublicationWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  public constructor(
    private readonly service: {
      activateDue(input: {
        now: Date;
        batchSize: number;
      }): Promise<ContentPublicationActivationResult>;
    },
    private readonly logger: ContentPublicationWorkerLogger,
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
      const result = await this.service.activateDue({
        now: this.now(),
        batchSize: this.batchSize
      });
      this.logger.info(
        { scanned: result.scanned, activated: result.activated, failed: result.failed },
        "Content publication activation completed"
      );
    } catch (error) {
      this.logger.error({ error }, "Content publication activation failed");
    } finally {
      this.running = false;
    }
  }
}
