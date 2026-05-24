import type { NextFunction, Request, Response } from "express";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

export const notFoundMiddleware = (
  _request: Request,
  _response: Response,
  next: NextFunction
): void => {
  next(
    new AppError({
      code: ERROR_CODES.NOT_FOUND,
      message: "error.not_found",
      statusCode: 404
    })
  );
};
