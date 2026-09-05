import type { AppConfig } from "../config/env";
import { getManagedRedisClient } from "../config/redis";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type { RouteDistanceProviderErrorKey } from "./route-distance.provider";

export type RouteProviderRuntimeStatus =
  | "configured"
  | "healthy"
  | "rate_limited"
  | "unavailable";

export interface RouteProviderHealthSnapshot {
  status: RouteProviderRuntimeStatus;
  checkedAt: string | null;
}

export interface RouteProviderHealthStorePort {
  recordSuccess(providerCode: string, at?: Date): Promise<void>;
  recordFailure(
    providerCode: string,
    errorKey: RouteDistanceProviderErrorKey,
    at?: Date
  ): Promise<void>;
  read(providerCode: string): Promise<RouteProviderHealthSnapshot>;
}

export interface RouteProviderHealthRedisClient {
  isOpen: boolean;
  connect(): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
}

interface RedisRouteProviderHealthStoreOptions {
  ttlSeconds: number;
  keyNamespace?: string;
}

export const ROUTE_PROVIDER_HEALTH_KEY_NAMESPACE =
  "needo:travel:route-provider-health:v1";

const persistedStatuses = new Set<RouteProviderRuntimeStatus>([
  "healthy",
  "rate_limited",
  "unavailable"
]);

const unavailableError = (): AppError =>
  new AppError({
    code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
    message: "error.dependency.redis_unavailable",
    statusCode: 503
  });

const failureStatus = (
  errorKey: RouteDistanceProviderErrorKey
): Exclude<RouteProviderRuntimeStatus, "configured"> =>
  errorKey === "error.travel.provider_rate_limited"
    ? "rate_limited"
    : errorKey === "error.travel.route_not_found"
      ? "healthy"
      : "unavailable";

export class RedisRouteProviderHealthStore implements RouteProviderHealthStorePort {
  private readonly ttlSeconds: number;
  private readonly keyNamespace: string;
  private connection: Promise<void> | undefined;

  public constructor(
    private readonly getClient: () => RouteProviderHealthRedisClient,
    options: RedisRouteProviderHealthStoreOptions
  ) {
    this.ttlSeconds = options.ttlSeconds;
    this.keyNamespace = options.keyNamespace ?? ROUTE_PROVIDER_HEALTH_KEY_NAMESPACE;
  }

  public async recordSuccess(providerCode: string, at = new Date()): Promise<void> {
    await this.write(providerCode, { status: "healthy", checkedAt: at.toISOString() });
  }

  public async recordFailure(
    providerCode: string,
    errorKey: RouteDistanceProviderErrorKey,
    at = new Date()
  ): Promise<void> {
    await this.write(providerCode, {
      status: failureStatus(errorKey),
      checkedAt: at.toISOString()
    });
  }

  public async read(providerCode: string): Promise<RouteProviderHealthSnapshot> {
    try {
      const client = await this.connect();
      const value = await client.get(this.key(providerCode));
      if (value === null) {
        return { status: "configured", checkedAt: null };
      }

      const parsed: unknown = JSON.parse(value);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !("status" in parsed) ||
        !("checkedAt" in parsed) ||
        !persistedStatuses.has(parsed.status as RouteProviderRuntimeStatus) ||
        typeof parsed.checkedAt !== "string" ||
        !Number.isFinite(Date.parse(parsed.checkedAt))
      ) {
        throw unavailableError();
      }

      return {
        status: parsed.status as Exclude<RouteProviderRuntimeStatus, "configured">,
        checkedAt: parsed.checkedAt
      };
    } catch {
      throw unavailableError();
    }
  }

  private async write(providerCode: string, snapshot: RouteProviderHealthSnapshot): Promise<void> {
    try {
      const client = await this.connect();
      const result = await client.set(this.key(providerCode), JSON.stringify(snapshot), {
        EX: this.ttlSeconds
      });
      if (result !== "OK") {
        throw unavailableError();
      }
    } catch {
      throw unavailableError();
    }
  }

  private async connect(): Promise<RouteProviderHealthRedisClient> {
    const client = this.getClient();
    if (client.isOpen) return client;

    this.connection ??= Promise.resolve(client.connect())
      .then(() => undefined)
      .finally(() => {
        this.connection = undefined;
      });
    await this.connection;
    return client;
  }

  private key(providerCode: string): string {
    return `${this.keyNamespace}:${encodeURIComponent(providerCode)}`;
  }
}

export const createRouteProviderHealthStore = (
  config: AppConfig
): RouteProviderHealthStorePort =>
  new RedisRouteProviderHealthStore(
    () =>
      getManagedRedisClient("travel-route-provider-health", {
        ...config,
        REDIS_URL: config.TRAVEL_ROUTE_HEALTH_REDIS_URL
      }),
    { ttlSeconds: config.TRAVEL_ROUTE_HEALTH_TTL_SECONDS }
  );
