import type { AuthRepositoryPort } from "../repositories/auth.repository";
import type { AuthSessionStore, MerchantShopSwitchAuditOutboxStats } from "./auth-session.store";

export interface MerchantShopAuditOutboxDrainResult extends MerchantShopSwitchAuditOutboxStats {
  read: number;
  completed: number;
  failed: number;
  deadLettered: number;
}

export class MerchantShopAuditOutboxService {
  public constructor(
    private readonly repository: Pick<AuthRepositoryPort, "completeMerchantShopSwitchAudit">,
    private readonly sessionStore: Pick<
      AuthSessionStore,
      | "readMerchantShopSwitchAuditOutbox"
      | "acknowledgeMerchantShopSwitchAuditOutbox"
      | "deadLetterMerchantShopSwitchAuditOutbox"
      | "getMerchantShopSwitchAuditOutboxStats"
    >
  ) {}

  public async drain(): Promise<MerchantShopAuditOutboxDrainResult> {
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

    const events = await read.call(this.sessionStore);
    let completed = 0;
    let failed = 0;
    let deadLettered = 0;
    for (const event of events) {
      if (event.kind === "poison") {
        try {
          await deadLetter.call(this.sessionStore, event);
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
          await acknowledge.call(this.sessionStore, event);
          completed += 1;
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
    }

    let stats: MerchantShopSwitchAuditOutboxStats = {
      streamLength: 0,
      pendingCount: 0,
      deadLetterLength: 0
    };
    if (this.sessionStore.getMerchantShopSwitchAuditOutboxStats) {
      stats = await this.sessionStore.getMerchantShopSwitchAuditOutboxStats();
    }
    return { read: events.length, completed, failed, deadLettered, ...stats };
  }
}
