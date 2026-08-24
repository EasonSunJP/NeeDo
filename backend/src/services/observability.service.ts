import type { AppConfig } from "../config/env";

interface HttpRequestMetric {
  method: string;
  path: string;
  statusCode: number;
  count: number;
  sumSeconds: number;
  buckets: Map<number, number>;
}

export interface HttpRequestMetricInput {
  method: string;
  path: string;
  statusCode: number;
  durationSeconds: number;
}

export interface DependencyHealthMetricInput {
  dependency: "database" | "redis";
  status: "ok" | "error";
  latencyMs?: number;
  poolSize?: number;
  healthyClients?: number;
}

export interface ObservabilityMetricsPort {
  recordHttpRequest: (metric: HttpRequestMetricInput) => void;
  recordDependencyHealth: (metric: DependencyHealthMetricInput) => void;
  renderPrometheus: () => string;
}

const DEFAULT_DURATION_BUCKETS_SECONDS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

const escapeLabelValue = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

const labels = (values: Record<string, string | number>): string =>
  Object.entries(values)
    .map(([key, value]) => `${key}="${escapeLabelValue(String(value))}"`)
    .join(",");

export class ObservabilityMetricsService implements ObservabilityMetricsPort {
  private readonly httpRequests = new Map<string, HttpRequestMetric>();
  private readonly dependencyHealth = new Map<
    DependencyHealthMetricInput["dependency"],
    DependencyHealthMetricInput & { checkedAtSeconds: number }
  >();
  private readonly startedAt = Date.now();

  public constructor(private readonly config: AppConfig) {}

  public recordHttpRequest(metric: HttpRequestMetricInput): void {
    if (!this.config.METRICS_ENABLED) {
      return;
    }

    const key = `${metric.method}:${metric.path}:${metric.statusCode}`;
    const existing =
      this.httpRequests.get(key) ??
      ({
        method: metric.method,
        path: metric.path,
        statusCode: metric.statusCode,
        count: 0,
        sumSeconds: 0,
        buckets: new Map(DEFAULT_DURATION_BUCKETS_SECONDS.map((bucket) => [bucket, 0]))
      } satisfies HttpRequestMetric);

    existing.count += 1;
    existing.sumSeconds += metric.durationSeconds;

    DEFAULT_DURATION_BUCKETS_SECONDS.forEach((bucket) => {
      if (metric.durationSeconds <= bucket) {
        existing.buckets.set(bucket, (existing.buckets.get(bucket) ?? 0) + 1);
      }
    });

    this.httpRequests.set(key, existing);
  }

  public recordDependencyHealth(metric: DependencyHealthMetricInput): void {
    if (!this.config.METRICS_ENABLED) {
      return;
    }

    this.dependencyHealth.set(metric.dependency, {
      ...metric,
      checkedAtSeconds: Date.now() / 1000
    });
  }

  public renderPrometheus(): string {
    const lines: string[] = [
      "# HELP needo_backend_uptime_seconds Process uptime in seconds.",
      "# TYPE needo_backend_uptime_seconds gauge",
      `needo_backend_uptime_seconds ${Math.floor((Date.now() - this.startedAt) / 1000)}`,
      "# HELP process_resident_memory_bytes Resident memory size in bytes.",
      "# TYPE process_resident_memory_bytes gauge",
      `process_resident_memory_bytes ${process.memoryUsage().rss}`,
      "# HELP http_requests_total Total HTTP requests by method, normalized path, and status.",
      "# TYPE http_requests_total counter",
      "# HELP http_request_duration_seconds HTTP request duration histogram.",
      "# TYPE http_request_duration_seconds histogram",
      "# HELP needo_dependency_up Whether the last dependency readiness check succeeded.",
      "# TYPE needo_dependency_up gauge",
      "# HELP needo_dependency_latency_seconds Duration of the last dependency readiness check.",
      "# TYPE needo_dependency_latency_seconds gauge",
      "# HELP needo_dependency_pool_size Configured dependency pool size.",
      "# TYPE needo_dependency_pool_size gauge",
      "# HELP needo_dependency_pool_healthy Healthy clients reported by the dependency pool.",
      "# TYPE needo_dependency_pool_healthy gauge",
      "# HELP needo_dependency_last_check_timestamp_seconds Unix timestamp of the last dependency check.",
      "# TYPE needo_dependency_last_check_timestamp_seconds gauge"
    ];

    Array.from(this.dependencyHealth.values())
      .sort((left, right) => left.dependency.localeCompare(right.dependency))
      .forEach((metric) => {
        const dependencyLabels = labels({ dependency: metric.dependency });
        lines.push(`needo_dependency_up{${dependencyLabels}} ${metric.status === "ok" ? 1 : 0}`);
        if (metric.latencyMs !== undefined) {
          lines.push(
            `needo_dependency_latency_seconds{${dependencyLabels}} ${metric.latencyMs / 1000}`
          );
        }
        if (metric.poolSize !== undefined) {
          lines.push(`needo_dependency_pool_size{${dependencyLabels}} ${metric.poolSize}`);
        }
        if (metric.healthyClients !== undefined) {
          lines.push(
            `needo_dependency_pool_healthy{${dependencyLabels}} ${metric.healthyClients}`
          );
        }
        lines.push(
          `needo_dependency_last_check_timestamp_seconds{${dependencyLabels}} ${metric.checkedAtSeconds}`
        );
      });

    Array.from(this.httpRequests.values())
      .sort((left, right) =>
        `${left.method}:${left.path}:${left.statusCode}`.localeCompare(
          `${right.method}:${right.path}:${right.statusCode}`
        )
      )
      .forEach((metric) => {
        const baseLabels = {
          method: metric.method,
          path: metric.path,
          status: metric.statusCode
        };

        lines.push(`http_requests_total{${labels(baseLabels)}} ${metric.count}`);
        DEFAULT_DURATION_BUCKETS_SECONDS.forEach((bucket) => {
          lines.push(
            `http_request_duration_seconds_bucket{${labels({
              ...baseLabels,
              le: bucket
            })}} ${metric.buckets.get(bucket) ?? 0}`
          );
        });
        lines.push(
          `http_request_duration_seconds_bucket{${labels({ ...baseLabels, le: "+Inf" })}} ${
            metric.count
          }`
        );
        lines.push(`http_request_duration_seconds_sum{${labels(baseLabels)}} ${metric.sumSeconds}`);
        lines.push(`http_request_duration_seconds_count{${labels(baseLabels)}} ${metric.count}`);
      });

    return `${lines.join("\n")}\n`;
  }
}
