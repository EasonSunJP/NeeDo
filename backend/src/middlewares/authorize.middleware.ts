import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ERROR_CODES } from "../constants/error-codes";
import type { AuthenticatedAccessContext } from "../services/auth.service";
import { AppError } from "../utils/app-error";

export const createAuthorizeMiddleware =
  (requiredPermission: string): RequestHandler =>
  (_request: Request, response: Response, next: NextFunction): void => {
    const auth = response.locals.auth as AuthenticatedAccessContext | undefined;

    if (!auth) {
      next(
        new AppError({
          code: ERROR_CODES.TOKEN_INVALID,
          message: "error.auth.token_invalid",
          statusCode: 401
        })
      );
      return;
    }

    if (!auth.permissions.includes(requiredPermission)) {
      next(
        new AppError({
          code: ERROR_CODES.FORBIDDEN,
          message: "error.forbidden",
          statusCode: 403
        })
      );
      return;
    }

    next();
  };
