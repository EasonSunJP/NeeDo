import type { AppDependencies } from "../app";
import type { DatabaseHealthStatus } from "../config/database";
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

export interface ReadinessPayload {
  status: "ready" | "not_ready";
  service: string;
  timestamp: string;
  dependencies: {
    database: DatabaseHealthStatus;
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
    this.recordDependencyHealth("redis", redis);

    return {
      status: redis.status === "ok" ? "ok" : "degraded",
      service: this.config.SERVICE_NAME,
      timestamp: new Date().toISOString(),
      dependencies: {
        redis
      }
    };
  }

  public async getReadiness(): Promise<ReadinessPayload> {
    const [database, redis] = await Promise.all([this.getDatabaseHealth(), this.getRedisHealth()]);
    this.recordDependencyHealth("database", database);
    this.recordDependencyHealth("redis", redis);
    const ready = database.status === "ok" && redis.status === "ok";

    return {
      status: ready ? "ready" : "not_ready",
      service: this.config.SERVICE_NAME,
      timestamp: new Date().toISOString(),
      dependencies: {
        database,
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

  private async getDatabaseHealth(): Promise<DatabaseHealthStatus> {
    try {
      if (!this.dependencies.databaseHealthCheck) {
        return {
          status: "error",
          message: "Database health check is not configured"
        };
      }

      return await this.dependencies.databaseHealthCheck();
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown database health check error"
      };
    }
  }

  private recordDependencyHealth(
    dependency: "database" | "redis",
    status: DatabaseHealthStatus | RedisHealthStatus
  ): void {
    this.dependencies.metricsService?.recordDependencyHealth({
      dependency,
      status: status.status,
      latencyMs: "latencyMs" in status ? status.latencyMs : undefined,
      poolSize: "poolSize" in status ? status.poolSize : undefined,
      healthyClients: "healthyClients" in status ? status.healthyClients : undefined
    });
  }
}
