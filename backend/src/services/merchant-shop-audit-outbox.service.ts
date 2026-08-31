import type { AuthRepositoryPort } from "../repositories/auth.repository";
import type { AuthSessionStore, MerchantShopSwitchAuditOutboxStats } from "./auth-session.store";

export interface MerchantShopAuditOutboxDrainResult extends MerchantShopSwitchAuditOutboxStats {
  read: number;
  completed: number;
  failed: number;
  deadLettered: number;
}

interface MerchantShopAuditOutboxServiceOptions {
  maxPagesPerDrain?: number;
  maxDeliveryAttempts?: number;
}

interface MerchantShopAuditOutboxDrainOptions {
  abortSignal?: AbortSignal;
}

export class MerchantShopAuditOutboxService {
  private pendingCursor = "0-0";
  private readonly maxPagesPerDrain: number;
  private readonly maxDeliveryAttempts: number;

  public constructor(
    private readonly repository: Pick<AuthRepositoryPort, "completeMerchantShopSwitchAudit">,
    private readonly sessionStore: Pick<
      AuthSessionStore,
      | "readMerchantShopSwitchAuditOutbox"
      | "acknowledgeMerchantShopSwitchAuditOutbox"
      | "deadLetterMerchantShopSwitchAuditOutbox"
      | "getMerchantShopSwitchAuditOutboxStats"
    >,
    options: MerchantShopAuditOutboxServiceOptions = {}
  ) {
    this.maxPagesPerDrain = Math.max(1, Math.floor(options.maxPagesPerDrain ?? 4));
    this.maxDeliveryAttempts = Math.max(1, Math.floor(options.maxDeliveryAttempts ?? 5));
  }

  public async drain(
    options: MerchantShopAuditOutboxDrainOptions = {}
  ): Promise<MerchantShopAuditOutboxDrainResult> {
    const read = this.sessionStore.readMerchantShopSwitchAuditOutbox;
    const acknowledge = this.sessionStore.acknowledgeMerchantShopSwitchAuditOutbox;
    const deadLetter = this.sessionStore.deadLetterMerchantShopSwitchAuditOutbox;
    const complete = this.repository.completeMerchantShopSwitchAudit;
    if (!read || !acknowledge || !deadLetter || !complete) {
      return {
        read: 0,
        completed: 0,
        failed: 0,
        deadLettered: 0,
        streamLength: 0,
        pendingCount: 0,
        deadLetterLength: 0
      };
    }

    let readCount = 0;
    let completed = 0;
    let failed = 0;
    let deadLettered = 0;
    for (let pageNumber = 0; pageNumber < this.maxPagesPerDrain; pageNumber += 1) {
      const page = await read.call(this.sessionStore, {
        pendingCursor: this.pendingCursor,
        abortSignal: options.abortSignal
      });
      this.pendingCursor = page.nextPendingCursor;
      readCount += page.items.length;
      for (const event of page.items) {
        if (event.kind === "poison") {
          try {
            await deadLetter.call(this.sessionStore, event, {
              abortSignal: options.abortSignal
            });
            deadLettered += 1;
          } catch {
            failed += 1;
          }
          continue;
        }
        try {
          if (
            await complete.call(this.repository, {
              auditId: event.auditId,
              operationId: event.operationId
            })
          ) {
            await acknowledge.call(this.sessionStore, event, {
              abortSignal: options.abortSignal
            });
            completed += 1;
          } else if (event.deliveryCount >= this.maxDeliveryAttempts) {
            await deadLetter.call(
              this.sessionStore,
              {
                kind: "poison",
                streamId: event.streamId,
                reason: "completion_retry_exhausted",
                deliveryCount: event.deliveryCount
              },
              { abortSignal: options.abortSignal }
            );
            deadLettered += 1;
          } else {
            failed += 1;
          }
        } catch {
          failed += 1;
        }
      }
      if (this.pendingCursor === "0-0") break;
    }

    let stats: MerchantShopSwitchAuditOutboxStats = {
      streamLength: 0,
      pendingCount: 0,
      deadLetterLength: 0
    };
    if (this.sessionStore.getMerchantShopSwitchAuditOutboxStats) {
      stats = await this.sessionStore.getMerchantShopSwitchAuditOutboxStats({
        abortSignal: options.abortSignal
      });
    }
    return { read: readCount, completed, failed, deadLettered, ...stats };
  }
}
