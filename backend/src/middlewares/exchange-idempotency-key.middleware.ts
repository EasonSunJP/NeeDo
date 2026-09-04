import type { RequestHandler } from "express";
import { ZodError } from "zod";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import { exchangeIdempotencyKeySchema } from "../validators/exchange.validators";

export const validateExchangeIdempotencyKey: RequestHandler = (request, response, next) => {
  try {
    response.locals.exchangeIdempotencyKey = exchangeIdempotencyKeySchema.parse(
      request.get("Idempotency-Key")
    );
    next();
  } catch (error) {
    next(
      error instanceof ZodError
        ? new AppError({
            code: ERROR_CODES.VALIDATION,
            message: "error.validation",
            statusCode: 400,
            cause: error
          })
        : error
    );
  }
};
