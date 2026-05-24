import type { NextFunction, Request, Response } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { HealthService } from "../services/health.service";
import { successResponse } from "../utils/api-response";

export class HealthController {
  private readonly healthService: HealthService;

  public constructor(config: AppConfig, dependencies: AppDependencies) {
    this.healthService = new HealthService(config, dependencies);
  }

  public getHealth = async (
    _request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response.status(200).json(successResponse(await this.healthService.getHealth()));
    } catch (error) {
      next(error);
    }
  };
}
