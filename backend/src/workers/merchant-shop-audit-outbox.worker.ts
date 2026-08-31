import type { MerchantShopAuditOutboxService } from "../services/merchant-shop-audit-outbox.service";

interface MerchantShopAuditOutboxWorkerLogger {
  info: (context: Record<string, unknown>, message: string) => void;
  error: (context: Record<string, unknown>, message: string) => void;
}

export interface MerchantShopAuditOutboxWorkerRuntime {
  service: Pick<MerchantShopAuditOutboxService, "drain">;
  destroy: () => void;
}

interface MerchantShopAuditOutboxWorkerOptions {
  drainTimeoutMs?: number;
  shutdownTimeoutMs?: number;
}

export class MerchantShopAuditOutboxWorker {
  private timer: NodeJS.Timeout | null = null;
  private drainTimer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private runtime: MerchantShopAuditOutboxWorkerRuntime | null = null;
  private abortController: AbortController | null = null;
  private lastTriggeredAt = 0;
  private stopped = false;
  private readonly drainTimeoutMs: number;
  private readonly shutdownTimeoutMs: number;
  private readonly destroyedRuntimes = new WeakSet<MerchantShopAuditOutboxWorkerRuntime>();

  public constructor(
    private readonly runtimeFactory: () => MerchantShopAuditOutboxWorkerRuntime,
    private readonly logger: MerchantShopAuditOutboxWorkerLogger,
    private readonly intervalMs: number,
    private readonly triggerThrottleMs = 1_000,
    options: MerchantShopAuditOutboxWorkerOptions = {}
  ) {
    this.drainTimeoutMs = Math.max(1, Math.floor(options.drainTimeoutMs ?? 3_000));
    this.shutdownTimeoutMs = Math.max(1, Math.floor(options.shutdownTimeoutMs ?? 1_000));
  }

  public start(): void {
    if (this.stopped || this.timer) return;
    this.trigger(true);
    this.timer = setInterval(() => this.trigger(true), this.intervalMs);
    this.timer.unref();
  }

  public async stop(): Promise<void> {
    if (this.stopped) {
      if (this.running) await this.waitForRunningDrain(this.running);
      return;
    }
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.abortController?.abort(new Error("Merchant shop audit outbox worker stopped"));
    if (this.runtime) this.destroyRuntime(this.runtime);
    if (this.running) await this.waitForRunningDrain(this.running);
    if (this.drainTimer) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }
  }

  public trigger(ignoreThrottle = false): void {
    if (this.stopped) return;
    const now = Date.now();
    if (!ignoreThrottle && now - this.lastTriggeredAt < this.triggerThrottleMs) return;
    this.lastTriggeredAt = now;
    if (this.running) return;
    this.running = this.runOnce().finally(() => {
      this.running = null;
    });
  }

  public async runOnce(): Promise<void> {
    if (this.stopped) return;
    let runtime: MerchantShopAuditOutboxWorkerRuntime;
    try {
      runtime = this.runtime ?? this.createRuntime();
    } catch (error) {
      this.logger.error({ error }, "Merchant shop audit outbox runtime creation failed");
      return;
    }
    const abortController = new AbortController();
    this.abortController = abortController;
    this.drainTimer = setTimeout(() => {
      abortController.abort(new Error("Merchant shop audit outbox drain timed out"));
      this.destroyRuntime(runtime);
      this.logger.error(
        { drainTimeoutMs: this.drainTimeoutMs },
        "Merchant shop audit outbox drain timed out"
      );
    }, this.drainTimeoutMs);
    this.drainTimer.unref();

    try {
      const result = await runtime.service.drain({ abortSignal: abortController.signal });
      if (!this.stopped) {
        this.logger.info({ ...result }, "Merchant shop audit outbox drain completed");
      }
    } catch (error) {
      if (!this.stopped) {
        this.logger.error({ error }, "Merchant shop audit outbox drain failed");
      }
    } finally {
      if (this.drainTimer) {
        clearTimeout(this.drainTimer);
        this.drainTimer = null;
      }
      if (this.abortController === abortController) this.abortController = null;
    }
  }

  private createRuntime(): MerchantShopAuditOutboxWorkerRuntime {
    const runtime = this.runtimeFactory();
    this.runtime = runtime;
    return runtime;
  }

  private destroyRuntime(runtime: MerchantShopAuditOutboxWorkerRuntime): void {
    if (this.destroyedRuntimes.has(runtime)) return;
    this.destroyedRuntimes.add(runtime);
    if (this.runtime === runtime) this.runtime = null;
    try {
      runtime.destroy();
    } catch (error) {
      this.logger.error({ error }, "Merchant shop audit outbox Redis destroy failed");
    }
  }

  private async waitForRunningDrain(running: Promise<void>): Promise<void> {
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(finish, this.shutdownTimeoutMs);
      timeout.unref();
      void running.finally(finish);
    });
  }
}
