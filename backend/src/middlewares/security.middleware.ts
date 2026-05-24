import cors from "cors";
import rateLimit from "express-rate-limit";
import type { RequestHandler } from "express";
import helmet from "helmet";
import type { AppConfig } from "../config/env";
import { ERROR_CODES } from "../constants/error-codes";
import { errorResponse } from "../utils/api-response";
import { AppError } from "../utils/app-error";

export const createHelmetMiddleware = (): RequestHandler => helmet();

export const createCorsMiddleware = (config: AppConfig): RequestHandler =>
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || config.CORS_ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(
        new AppError({
          code: ERROR_CODES.CORS_FORBIDDEN,
          message: "error.cors_forbidden",
          statusCode: 403
        })
      );
    }
  });

export const createRateLimitMiddleware = (config: AppConfig): RequestHandler =>
  rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    limit: config.RATE_LIMIT_MAX,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_request, response) => {
      response.status(429).json(errorResponse(ERROR_CODES.RATE_LIMITED, "error.rate_limited"));
    }
  });
