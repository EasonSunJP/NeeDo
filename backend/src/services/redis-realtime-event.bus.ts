import type { RedisClient } from "../config/redis";
import type { RealtimeEventBusPort } from "./realtime-event.gateway";

type RedisRealtimeClientPort = Pick<
  RedisClient,
  "connect" | "isOpen" | "publish" | "quit" | "subscribe" | "unsubscribe"
> & {
  on?: (event: "error", listener: (error: Error) => void) => unknown;
};

interface RedisRealtimeEventBusOptions {
  channel: string;
  publisher: RedisRealtimeClientPort;
  subscriber: RedisRealtimeClientPort;
  onError?: (error: unknown, connection: "publisher" | "subscriber") => void;
}

export class RedisRealtimeEventBus implements RealtimeEventBusPort {
  private readonly channel: string;
  private readonly publisher: RedisRealtimeClientPort;
  private readonly subscriber: RedisRealtimeClientPort;
  private readonly listeners = new Set<(message: string) => void>();
  private readonly onError: NonNullable<RedisRealtimeEventBusOptions["onError"]>;
  private publisherConnectPromise?: Promise<void>;
  private subscriberConnectPromise?: Promise<void>;
  private subscriptionPromise?: Promise<void>;
  private subscribed = false;
  private closePromise?: Promise<void>;

  public constructor(options: RedisRealtimeEventBusOptions) {
    this.channel = options.channel;
    this.publisher = options.publisher;
    this.subscriber = options.subscriber;
    this.onError = options.onError ?? (() => undefined);
    this.publisher.on?.("error", (error) => this.onError(error, "publisher"));
    this.subscriber.on?.("error", (error) => this.onError(error, "subscriber"));
  }

  public async publish(message: string): Promise<void> {
    if (this.closePromise) {
      return;
    }

    await this.ensurePublisherConnected();
    await this.publisher.publish(this.channel, message);
  }

  public async subscribe(listener: (message: string) => void): Promise<() => Promise<void>> {
    if (this.closePromise) {
      throw new Error("Realtime event bus is closed");
    }

    this.listeners.add(listener);
    try {
      await this.ensureSubscribed();
    } catch (error) {
      this.listeners.delete(listener);
      throw error;
    }

    return async () => {
      this.listeners.delete(listener);
    };
  }

  public async close(): Promise<void> {
    if (this.closePromise) {
      return this.closePromise;
    }

    this.closePromise = this.closeInternal();
    return this.closePromise;
  }

  private async ensurePublisherConnected(): Promise<void> {
    if (this.publisher.isOpen) {
      return;
    }

    if (!this.publisherConnectPromise) {
      this.publisherConnectPromise = Promise.resolve(this.publisher.connect())
        .then(() => undefined)
        .catch((error) => {
          this.publisherConnectPromise = undefined;
          throw error;
        });
    }

    await this.publisherConnectPromise;
  }

  private async ensureSubscriberConnected(): Promise<void> {
    if (this.subscriber.isOpen) {
      return;
    }

    if (!this.subscriberConnectPromise) {
      this.subscriberConnectPromise = Promise.resolve(this.subscriber.connect())
        .then(() => undefined)
        .catch((error) => {
          this.subscriberConnectPromise = undefined;
          throw error;
        });
    }

    await this.subscriberConnectPromise;
  }

  private async ensureSubscribed(): Promise<void> {
    if (this.subscribed) {
      return;
    }

    if (!this.subscriptionPromise) {
      this.subscriptionPromise = this.startSubscription().catch((error) => {
        this.subscriptionPromise = undefined;
        throw error;
      });
    }

    await this.subscriptionPromise;
  }

  private async startSubscription(): Promise<void> {
    await this.ensureSubscriberConnected();
    await this.subscriber.subscribe(this.channel, (message) => {
      for (const listener of this.listeners) {
        listener(message);
      }
    });
    this.subscribed = true;
  }

  private async closeInternal(): Promise<void> {
    this.listeners.clear();

    if (this.subscribed && this.subscriber.isOpen) {
      await this.subscriber.unsubscribe(this.channel);
    }
    this.subscribed = false;

    await Promise.all([
      this.publisher.isOpen ? this.publisher.quit() : Promise.resolve(),
      this.subscriber.isOpen ? this.subscriber.quit() : Promise.resolve()
    ]);
  }
}
