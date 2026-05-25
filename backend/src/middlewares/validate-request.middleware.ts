import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";
import { ZodError } from "zod";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

interface RequestSchemas {
  body?: ZodSchema<unknown>;
  params?: ZodSchema<unknown>;
  query?: ZodSchema<unknown>;
}

export const validateRequest =
  (schemas: RequestSchemas) =>
  (request: Request, _response: Response, next: NextFunction): void => {
    try {
      if (schemas.params) {
        request.params = schemas.params.parse(request.params) as Request["params"];
      }

      if (schemas.query) {
        request.query = schemas.query.parse(request.query) as Request["query"];
      }

      if (schemas.body) {
        request.body = schemas.body.parse(request.body);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(
          new AppError({
            code: ERROR_CODES.VALIDATION,
            message: "error.validation",
            statusCode: 400,
            cause: error
          })
        );
        return;
      }

      next(error);
    }
  };
