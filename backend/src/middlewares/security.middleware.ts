import cors from "cors";
import rateLimit from "express-rate-limit";
import type { Request, RequestHandler, Response } from "express";
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

type AuthRateLimitName =
  | "registration"
  | "verification"
  | "google-init"
  | "google-credential"
  | "account-security";

const createAuthActionRateLimitMiddleware = (
  config: AppConfig,
  name: AuthRateLimitName,
  limit: number
): RequestHandler =>
  rateLimit({
    windowMs: config.AUTH_ACTION_RATE_LIMIT_WINDOW_MS,
    limit,
    identifier: `auth-${name}`,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (request: Request, response: Response) => {
      const ip = (request.ip || request.socket.remoteAddress || "unknown").trim().toLowerCase();
      const authenticatedUserId = (response.locals.auth as { userId?: unknown } | undefined)
        ?.userId;
      const userKey =
        typeof authenticatedUserId === "number" && Number.isSafeInteger(authenticatedUserId)
          ? String(authenticatedUserId)
          : "anonymous";
      return `${name}:${ip}:${userKey}`;
    },
    handler: (_request, response) => {
      response.status(429).json(errorResponse(ERROR_CODES.RATE_LIMITED, "error.rate_limited"));
    }
  });

export const createAuthRegistrationRateLimitMiddleware = (config: AppConfig): RequestHandler =>
  createAuthActionRateLimitMiddleware(
    config,
    "registration",
    config.AUTH_REGISTRATION_RATE_LIMIT_MAX
  );

export const createAuthVerificationRateLimitMiddleware = (config: AppConfig): RequestHandler =>
  createAuthActionRateLimitMiddleware(
    config,
    "verification",
    config.AUTH_VERIFICATION_RATE_LIMIT_MAX
  );

export const createGoogleInitRateLimitMiddleware = (config: AppConfig): RequestHandler =>
  createAuthActionRateLimitMiddleware(
    config,
    "google-init",
    config.AUTH_GOOGLE_INIT_RATE_LIMIT_MAX
  );

export const createGoogleCredentialRateLimitMiddleware = (config: AppConfig): RequestHandler =>
  createAuthActionRateLimitMiddleware(
    config,
    "google-credential",
    config.AUTH_GOOGLE_CREDENTIAL_RATE_LIMIT_MAX
  );

export const createAccountSecurityRateLimitMiddleware = (config: AppConfig): RequestHandler =>
  createAuthActionRateLimitMiddleware(
    config,
    "account-security",
    config.AUTH_VERIFICATION_RATE_LIMIT_MAX
  );
