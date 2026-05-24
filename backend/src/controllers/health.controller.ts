import type { Request, Response } from "express";
import type { AppConfig } from "../config/env";
import { HealthService } from "../services/health.service";
import { successResponse } from "../utils/api-response";

export class HealthController {
  private readonly healthService: HealthService;

  public constructor(config: AppConfig) {
    this.healthService = new HealthService(config);
  }

  public getHealth = (_request: Request, response: Response): void => {
    response.status(200).json(successResponse(this.healthService.getHealth()));
  };
}
