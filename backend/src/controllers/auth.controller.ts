import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedAccessContext, AuthService } from "../services/auth.service";
import { successResponse } from "../utils/api-response";
import { AppError } from "../utils/app-error";
import { ERROR_CODES } from "../constants/error-codes";
import type {
  LoginBody,
  LogoutBody,
  OtpSendBody,
  OtpVerifyBody,
  RefreshBody,
  SwitchIdentityBody
} from "../validators/auth.validator";

type BodyRequest<TBody> = Request<Record<string, string>, unknown, TBody>;

export class AuthController {
  public constructor(private readonly authService: AuthService) {}

  public login = async (
    request: BodyRequest<LoginBody>,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { loginIdentifier, password } = request.body;
      response
        .status(200)
        .json(
          successResponse(
            await this.authService.login(loginIdentifier, password, this.getContext(request))
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public sendOtp = async (
    request: BodyRequest<OtpSendBody>,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(successResponse(await this.authService.sendOtp(request.body.email)));
    } catch (error) {
      next(error);
    }
  };

  public verifyOtp = async (
    request: BodyRequest<OtpVerifyBody>,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { email, otp } = request.body;
      response
        .status(200)
        .json(
          successResponse(await this.authService.verifyOtp(email, otp, this.getContext(request)))
        );
    } catch (error) {
      next(error);
    }
  };

  public refresh = async (
    request: BodyRequest<RefreshBody>,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(successResponse(await this.authService.refresh(request.body.refreshToken)));
    } catch (error) {
      next(error);
    }
  };

  public switchIdentity = async (
    request: BodyRequest<SwitchIdentityBody>,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.authService.switchIdentity(
              this.getAuthenticatedAccess(response),
              request.body.refreshToken,
              request.body.identityId,
              this.getContext(request)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public logout = async (
    request: BodyRequest<LogoutBody>,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.authService.logout(
              this.getAuthenticatedAccess(response),
              request.body.refreshToken,
              this.getContext(request)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public me = async (_request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response
        .status(200)
        .json(successResponse(await this.authService.getMe(this.getAuthenticatedAccess(response))));
    } catch (error) {
      next(error);
    }
  };

  private getContext(request: Request) {
    return {
      ip: this.getIp(request),
      userAgent: request.get("user-agent") ?? undefined
    };
  }

  private getIp(request: Request): string {
    const forwardedFor = request.get("x-forwarded-for");

    if (forwardedFor) {
      return forwardedFor.split(",")[0].trim();
    }

    return request.ip || request.socket.remoteAddress || "unknown";
  }

  private getAuthenticatedAccess(response: Response): AuthenticatedAccessContext {
    const auth = response.locals.auth as AuthenticatedAccessContext | undefined;

    if (!auth) {
      throw new AppError({
        code: ERROR_CODES.TOKEN_INVALID,
        message: "error.auth.token_invalid",
        statusCode: 401
      });
    }

    return auth;
  }
}
