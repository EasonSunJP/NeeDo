import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import type { RedisHealthStatus } from "../config/redis";

export interface HealthPayload {
  status: "ok" | "degraded";
  service: string;
  timestamp: string;
  dependencies: {
    redis: RedisHealthStatus;
  };
}

export class HealthService {
  public constructor(
    private readonly config: AppConfig,
    private readonly dependencies: AppDependencies
  ) {}

  public async getHealth(): Promise<HealthPayload> {
    const redis = await this.getRedisHealth();

    return {
      status: redis.status === "ok" ? "ok" : "degraded",
      service: this.config.SERVICE_NAME,
      timestamp: new Date().toISOString(),
      dependencies: {
        redis
      }
    };
  }

  private async getRedisHealth(): Promise<RedisHealthStatus> {
    try {
      return await this.dependencies.redisHealthCheck();
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown Redis health check error"
      };
    }
  }
}
