import type { RealtimeEventGatewayPort } from "./realtime-event.gateway";

export interface DuePrivacyMessage {
  id: number;
  conversationId: number;
  senderUserId: number | null;
  createdAt: Date;
  expiresAt: Date;
  lifecycleVersion: number;
  privacyPolicyVersionAtSend: number;
}

export interface PrivacyExpiryExecution {
  directiveId: number;
  conversationId: number;
  messageId: number;
  occurredAt: Date;
  participantUserIds: number[];
}

export interface ImPrivacyExpiryRepositoryPort {
  listDue: (input: { now: Date; take: number }) => Promise<DuePrivacyMessage[]>;
  expire: (input: {
    candidate: DuePrivacyMessage;
    now: Date;
  }) => Promise<PrivacyExpiryExecution | null>;
}

export class ImPrivacyExpiryService {
  public constructor(
    private readonly repository: ImPrivacyExpiryRepositoryPort,
    private readonly gateway: Pick<RealtimeEventGatewayPort, "publish">
  ) {}

  public async expireDue(input: { now: Date; batchSize: number }) {
    const take = Math.min(Math.max(input.batchSize, 1), 100);
    const candidates = await this.repository.listDue({ now: input.now, take });
    const summary = {
      scanned: candidates.length,
      expired: 0,
      failed: 0,
      publishFailed: 0
    };

    for (const candidate of candidates) {
      try {
        const execution = await this.repository.expire({ candidate, now: input.now });
        if (!execution) continue;
        summary.expired += 1;
        summary.publishFailed += this.publishDeletion(execution);
      } catch {
        summary.failed += 1;
      }
    }

    return summary;
  }

  private publishDeletion(execution: PrivacyExpiryExecution) {
    let failed = 0;
    const event = {
      id: `im-privacy-expired-${execution.directiveId}`,
      type: "message.deleted",
      payload: {
        id: execution.directiveId,
        conversationId: execution.conversationId,
        messageId: execution.messageId,
        action: "privacy_expired",
        occurredAt: execution.occurredAt.toISOString()
      },
      createdAt: execution.occurredAt.toISOString()
    };

    for (const recipientUserId of execution.participantUserIds) {
      try {
        this.gateway.publish({ ...event, recipientUserId });
      } catch {
        failed += 1;
      }
    }

    return failed;
  }
}
