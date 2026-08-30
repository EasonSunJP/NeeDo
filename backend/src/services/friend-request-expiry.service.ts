import { randomUUID } from "node:crypto";
import type { RealtimeRepositoryPort } from "../repositories/realtime.repository";
import type { RealtimeEventGatewayPort } from "./realtime-event.gateway";

export class FriendRequestExpiryService {
  public constructor(
    private readonly repository: Pick<RealtimeRepositoryPort, "expireDueFriendRequests">,
    private readonly eventGateway: RealtimeEventGatewayPort
  ) {}

  public async expireDue(input: { batchSize: number }): Promise<{ expired: number }> {
    const expired = await this.repository.expireDueFriendRequests(input);
    for (const request of expired) {
      for (const recipientUserId of [request.requesterUserId, request.targetUserId]) {
        this.eventGateway.publish({
          id: randomUUID(),
          type: "friend_request.expired",
          recipientUserId,
          payload: request,
          createdAt: new Date().toISOString()
        });
      }
    }
    return { expired: expired.length };
  }
}
