import type { Request, Response } from "express";
import type { AppConfig } from "../config/env";
import { ERROR_CODES } from "../constants/error-codes";
import type { ObservabilityMetricsPort } from "../services/observability.service";
import { errorResponse } from "../utils/api-response";

export class ObservabilityController {
  public constructor(
    private readonly config: AppConfig,
    private readonly metricsService: ObservabilityMetricsPort
  ) {}

  public getMetrics = (request: Request, response: Response): void => {
    if (this.config.METRICS_BEARER_TOKEN) {
      const authorization = request.get("authorization") ?? "";
      const expected = `Bearer ${this.config.METRICS_BEARER_TOKEN}`;

      if (authorization !== expected) {
        response.status(403).json(errorResponse(ERROR_CODES.FORBIDDEN, "error.forbidden"));
        return;
      }
    }

    response.type("text/plain; version=0.0.4; charset=utf-8");
    response.status(200).send(this.metricsService.renderPrometheus());
  };
}
