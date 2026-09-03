import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

export const CONTENT_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const createContentImageBodyParser = (): RequestHandler =>
  express.raw({ type: [...CONTENT_IMAGE_MIME_TYPES], limit: "8mb" });

export const createContentImageBodyErrorHandler =
  (messages: { invalid: string; tooLarge: string }): ErrorRequestHandler =>
  (error, _request, _response, next): void => {
    const status = readParserStatus(error);
    if (status === 413 || isEntityTooLarge(error)) {
      next(
        new AppError({
          code: ERROR_CODES.VALIDATION,
          message: messages.tooLarge,
          statusCode: 413,
          cause: error
        })
      );
      return;
    }
    if (!(error instanceof AppError) && status >= 400 && status < 500) {
      next(
        new AppError({
          code: ERROR_CODES.VALIDATION,
          message: messages.invalid,
          statusCode: status,
          cause: error
        })
      );
      return;
    }
    next(error);
  };

const readParserStatus = (error: unknown): number => {
  if (typeof error !== "object" || error === null) {
    return Number.NaN;
  }
  return Number("statusCode" in error ? error.statusCode : "status" in error ? error.status : NaN);
};

const isEntityTooLarge = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "type" in error &&
  error.type === "entity.too.large";
