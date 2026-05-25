import type { Response } from "express";

export interface RealtimeEvent {
  id: string;
  type: string;
  recipientUserId: number;
  payload: unknown;
  createdAt: string;
}

export interface RealtimeEventGatewayPort {
  publish: (event: RealtimeEvent) => void;
  subscribe: (userId: number, response: Response) => () => void;
}

export class SseRealtimeEventGateway implements RealtimeEventGatewayPort {
  private readonly subscribers = new Map<number, Set<Response>>();

  public publish(event: RealtimeEvent): void {
    const userSubscribers = this.subscribers.get(event.recipientUserId);

    if (!userSubscribers || userSubscribers.size === 0) {
      return;
    }

    for (const response of userSubscribers) {
      response.write(this.formatEvent(event.type, event));
    }
  }

  public subscribe(userId: number, response: Response): () => void {
    response.status(200);
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders?.();
    response.write("retry: 5000\n\n");
    response.write(
      this.formatEvent("connected", {
        id: this.createEventId(),
        type: "connected",
        recipientUserId: userId,
        payload: { userId },
        createdAt: new Date().toISOString()
      })
    );

    const userSubscribers = this.subscribers.get(userId) ?? new Set<Response>();
    userSubscribers.add(response);
    this.subscribers.set(userId, userSubscribers);

    const heartbeat = setInterval(() => {
      response.write(": heartbeat\n\n");
    }, 25_000);

    const unsubscribe = (): void => {
      clearInterval(heartbeat);
      userSubscribers.delete(response);
      if (userSubscribers.size === 0) {
        this.subscribers.delete(userId);
      }
    };

    response.on("close", unsubscribe);
    response.on("error", unsubscribe);

    return unsubscribe;
  }

  private formatEvent(eventName: string, payload: unknown): string {
    return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  }

  private createEventId(): string {
    return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  }
}
