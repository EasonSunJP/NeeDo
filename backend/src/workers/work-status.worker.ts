import type { WorkStatusService } from "../services/work-status.service";
export class WorkStatusWorker {
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private cursor = 0;
  constructor(
    private readonly service: Pick<WorkStatusService, "inspectBatch">,
    private readonly logger: { error: (context: Record<string, unknown>, message: string) => void },
    private readonly intervalMs: number,
    private readonly batchSize: number
  ) {}
  start() {
    if (this.timer) return;
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), this.intervalMs);
    this.timer.unref();
  }
  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.running;
  }
  async runOnce() {
    if (this.running) return this.running;
    this.running = this.process();
    try {
      await this.running;
    } finally {
      this.running = null;
    }
  }
  private async process() {
    try {
      this.cursor = await this.service.inspectBatch(this.cursor, this.batchSize);
    } catch (error) {
      this.logger.error({ error }, "Work status attendance inspection failed");
    }
  }
}
