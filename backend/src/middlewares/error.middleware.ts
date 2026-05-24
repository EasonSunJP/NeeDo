import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "../config/logger";
import { ERROR_CODES } from "../constants/error-codes";
import { errorResponse } from "../utils/api-response";
import { AppError, createInternalError } from "../utils/app-error";

const normalizeError = (error: unknown): AppError => {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.validation",
      statusCode: 400,
      cause: error
    });
  }

  return createInternalError(error);
};

export const errorMiddleware: ErrorRequestHandler = (error, request, response, next): void => {
  if (response.headersSent) {
    next(error);
    return;
  }

  const appError = normalizeError(error);

  if (appError.statusCode >= 500) {
    logger.error({ error, path: request.path }, appError.message);
  } else {
    logger.warn({ error: appError, path: request.path }, appError.message);
  }

  response.status(appError.statusCode).json(errorResponse(appError.code, appError.message));
};
