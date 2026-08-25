import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ERROR_CODES } from "../constants/error-codes";
import type { AuthenticatedAccessContext } from "../services/auth.service";
import { AppError } from "../utils/app-error";

export const createAuthorizeMiddleware =
  (requiredPermission: string): RequestHandler =>
  (request: Request, response: Response, next: NextFunction): void => {
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

    if (isAuthorizedReadOnlyMerchantPreview(request, auth)) {
      next();
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

export const createAuthorizeAnyMiddleware =
  (requiredPermissions: readonly string[]): RequestHandler =>
  (request: Request, response: Response, next: NextFunction): void => {
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

    if (isAuthorizedReadOnlyMerchantPreview(request, auth)) {
      next();
      return;
    }

    if (!requiredPermissions.some((permission) => auth.permissions.includes(permission))) {
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

const isAuthorizedReadOnlyMerchantPreview = (
  request: Request,
  auth: AuthenticatedAccessContext
) =>
  Boolean(
    auth.isReadOnlyMerchantPreview &&
      request.method.toUpperCase() === "GET" &&
      request.path.startsWith("/merchant-admin") &&
      auth.permissions.includes("backoffice:merchant-accounts:read")
  );
