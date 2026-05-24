import type { Request, Response } from "express";
import { ERROR_CODES } from "../constants/error-codes";
import type { AuthRequestContext, AuthenticatedAccessContext } from "../services/auth.service";
import { AppError } from "./app-error";

export const getRequestContext = (request: Request): AuthRequestContext => ({
  ip: getIp(request),
  userAgent: request.get("user-agent") ?? undefined
});

export const getAuthenticatedAccess = (response: Response): AuthenticatedAccessContext => {
  const auth = response.locals.auth as AuthenticatedAccessContext | undefined;

  if (!auth) {
    throw new AppError({
      code: ERROR_CODES.TOKEN_INVALID,
      message: "error.auth.token_invalid",
      statusCode: 401
    });
  }

  return auth;
};

const getIp = (request: Request): string => {
  const forwardedFor = request.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return request.ip || request.socket.remoteAddress || "unknown";
};
