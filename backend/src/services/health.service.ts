import type { AppConfig } from "../config/env";

export interface HealthPayload {
  status: "ok";
  service: string;
  timestamp: string;
}

export class HealthService {
  public constructor(private readonly config: AppConfig) {}

  public getHealth(): HealthPayload {
    return {
      status: "ok",
      service: this.config.SERVICE_NAME,
      timestamp: new Date().toISOString()
    };
  }
}
