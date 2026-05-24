import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ERROR_CODES } from "../constants/error-codes";
import type { AuthService } from "../services/auth.service";
import { AppError } from "../utils/app-error";

export interface AuthenticateOptions {
  requiredPermission?: string;
}

export const createAuthenticateMiddleware =
  (authService: AuthService) =>
  (options: AuthenticateOptions = {}): RequestHandler =>
  async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const token = getBearerToken(request);
      response.locals.auth = await authService.authenticateAccessToken(
        token,
        options.requiredPermission
      );
      next();
    } catch (error) {
      next(error);
    }
  };

const getBearerToken = (request: Request): string => {
  const authorization = request.get("authorization");

  if (!authorization) {
    throw invalidTokenError();
  }

  const [scheme, token, extra] = authorization.split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || !token || extra) {
    throw invalidTokenError();
  }

  return token;
};

const invalidTokenError = (): AppError =>
  new AppError({
    code: ERROR_CODES.TOKEN_INVALID,
    message: "error.auth.token_invalid",
    statusCode: 401
  });
