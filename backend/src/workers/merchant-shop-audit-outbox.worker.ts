import type { MerchantShopAuditOutboxService } from "../services/merchant-shop-audit-outbox.service";

interface MerchantShopAuditOutboxWorkerLogger {
  info: (context: Record<string, unknown>, message: string) => void;
  error: (context: Record<string, unknown>, message: string) => void;
}

export interface MerchantShopAuditOutboxWorkerRuntime {
  service: Pick<MerchantShopAuditOutboxService, "drain">;
  destroy: () => void | Promise<void>;
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
  private readonly pendingDestroyRuntimes = new Set<MerchantShopAuditOutboxWorkerRuntime>();
  private readonly destroyAttempts = new Map<
    MerchantShopAuditOutboxWorkerRuntime,
    Promise<boolean>
  >();

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
    this.forceDestroy();
    const pendingRetries = [...this.pendingDestroyRuntimes].map((runtime) =>
      this.destroyRuntime(runtime)
    );
    const waits = [
      ...(this.running ? [this.running] : []),
      ...this.destroyAttempts.values(),
      ...pendingRetries
    ];
    if (waits.length > 0) await this.waitForPromises(waits);
    const finalRetries = [...this.pendingDestroyRuntimes].map((runtime) =>
      this.destroyRuntime(runtime)
    );
    if (finalRetries.length > 0) await this.waitForPromises(finalRetries);
  }

  public forceDestroy(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.abortController?.abort(new Error("Merchant shop audit outbox worker stopped"));
    const runtimes = new Set(this.pendingDestroyRuntimes);
    if (this.runtime) runtimes.add(this.runtime);
    runtimes.forEach((runtime) => {
      void this.destroyRuntime(runtime);
    });
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
      void this.destroyRuntime(runtime);
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

  private destroyRuntime(runtime: MerchantShopAuditOutboxWorkerRuntime): Promise<boolean> {
    if (this.destroyedRuntimes.has(runtime)) return Promise.resolve(true);
    const existingAttempt = this.destroyAttempts.get(runtime);
    if (existingAttempt) return existingAttempt;
    if (this.runtime === runtime) this.runtime = null;
    this.pendingDestroyRuntimes.add(runtime);
    let destroyResult: void | Promise<void>;
    try {
      destroyResult = runtime.destroy();
    } catch (error) {
      this.logger.error({ error }, "Merchant shop audit outbox runtime destroy failed");
      return Promise.resolve(false);
    }
    const attempt = Promise.resolve(destroyResult)
      .then(
        () => {
          this.destroyedRuntimes.add(runtime);
          this.pendingDestroyRuntimes.delete(runtime);
          return true;
        },
        (error: unknown) => {
          this.logger.error({ error }, "Merchant shop audit outbox runtime destroy failed");
          return false;
        }
      )
      .finally(() => {
        this.destroyAttempts.delete(runtime);
      });
    this.destroyAttempts.set(runtime, attempt);
    return attempt;
  }

  private async waitForPromises(promises: Array<Promise<unknown>>): Promise<void> {
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
      void Promise.allSettled(promises).then(finish);
    });
  }
}
