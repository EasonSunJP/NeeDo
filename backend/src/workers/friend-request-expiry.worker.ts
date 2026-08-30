import type { FriendRequestExpiryService } from "../services/friend-request-expiry.service";

interface FriendRequestExpiryWorkerLogger {
  info: (context: Record<string, unknown>, message: string) => void;
  error: (context: Record<string, unknown>, message: string) => void;
}

export class FriendRequestExpiryWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  public constructor(
    private readonly service: Pick<FriendRequestExpiryService, "expireDue">,
    private readonly logger: FriendRequestExpiryWorkerLogger,
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
      this.logger.info(result, "Friend request expiry completed");
    } catch (error) {
      this.logger.error({ error }, "Friend request expiry failed");
    } finally {
      this.running = false;
    }
  }
}
