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

export interface ObservabilityMetricsPort {
  recordHttpRequest: (metric: HttpRequestMetricInput) => void;
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
      "# TYPE http_request_duration_seconds histogram"
    ];

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
