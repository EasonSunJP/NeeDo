import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ERROR_CODES } from "../constants/error-codes";
import type { AuthService } from "../services/auth.service";
import { AppError } from "../utils/app-error";
import { merchantPreviewShopHeaderSchema } from "../validators/merchant-preview.validator";

export interface AuthenticateOptions {
  requiredPermission?: string;
  allowDuringCompliance?: boolean;
}

export const createAuthenticateMiddleware =
  (authService: AuthService) =>
  (options: AuthenticateOptions = {}): RequestHandler =>
  async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const token = getBearerToken(request);
      const auth = await authService.authenticateAccessToken(token, options.requiredPermission, {
        allowDuringCompliance: options.allowDuringCompliance
      });
      response.locals.auth = applyReadOnlyMerchantPreview(request, auth);
      next();
    } catch (error) {
      next(error);
    }
  };

export const createOptionalAuthenticateMiddleware =
  (authService: AuthService): RequestHandler =>
  async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    if (!request.get("authorization")) {
      next();
      return;
    }

    try {
      const token = getBearerToken(request);
      response.locals.auth = await authService.authenticateAccessToken(token);
      next();
    } catch (error) {
      next(error);
    }
  };

const merchantPreviewHeader = "x-needo-merchant-preview-shop-id";
const safePreviewMethods = new Set(["GET", "HEAD", "OPTIONS"]);

const applyReadOnlyMerchantPreview = <
  TAuth extends {
    permissions: string[];
    currentIdentityScopeType?: string | null;
    currentIdentityScopeId?: number | null;
  }
>(
  request: Request,
  auth: TAuth
): TAuth => {
  const headerValue = request.get(merchantPreviewHeader);
  if (!headerValue) return auth;

  if (!auth.permissions.includes("backoffice:merchant-accounts:read")) {
    throw new AppError({
      code: ERROR_CODES.FORBIDDEN,
      message: "error.forbidden",
      statusCode: 403
    });
  }

  const parsed = merchantPreviewShopHeaderSchema.safeParse(headerValue);
  if (!parsed.success) {
    throw new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.validation",
      statusCode: 400,
      cause: parsed.error
    });
  }

  if (!safePreviewMethods.has(request.method.toUpperCase())) {
    throw new AppError({
      code: ERROR_CODES.FORBIDDEN,
      message: "error.merchant_preview.read_only",
      statusCode: 403
    });
  }

  return {
    ...auth,
    currentIdentityScopeType: "shop",
    currentIdentityScopeId: parsed.data,
    isReadOnlyMerchantPreview: true,
    merchantPreviewShopId: parsed.data
  };
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
