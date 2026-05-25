import type { RequestHandler } from "express";
import type { AppConfig } from "../config/env";
import type { ObservabilityMetricsPort } from "../services/observability.service";

const normalizeMetricPath = (config: AppConfig, path: string): string => {
  const apiPath = path.startsWith(config.API_PREFIX) ? path.slice(config.API_PREFIX.length) : path;
  const normalized = apiPath
    .split("/")
    .map((segment) => {
      if (/^[0-9]+$/.test(segment)) {
        return ":id";
      }

      if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(segment)) {
        return ":id";
      }

      return segment;
    })
    .join("/");

  return normalized || "/";
};

export const createMetricsMiddleware = (
  config: AppConfig,
  metricsService: ObservabilityMetricsPort
): RequestHandler => {
  return (request, response, next) => {
    const startedAt = process.hrtime.bigint();

    response.on("finish", () => {
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;

      metricsService.recordHttpRequest({
        method: request.method,
        path: normalizeMetricPath(config, request.path),
        statusCode: response.statusCode,
        durationSeconds
      });
    });

    next();
  };
};
