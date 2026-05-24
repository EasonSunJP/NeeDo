import { randomUUID } from "crypto";
import type { RequestHandler } from "express";
import pinoHttp from "pino-http";
import type { AppConfig } from "../config/env";
import { logger } from "../config/logger";

export const createRequestLoggerMiddleware = (config: AppConfig): RequestHandler =>
  pinoHttp({
    logger,
    autoLogging: config.NODE_ENV !== "test",
    genReqId: (request) => {
      const header = request.headers["x-request-id"];
      return typeof header === "string" && header.trim().length > 0 ? header : randomUUID();
    },
    customProps: () => ({
      service: config.SERVICE_NAME
    })
  });
