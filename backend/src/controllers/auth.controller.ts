import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedAccessContext, AuthService } from "../services/auth.service";
import { successResponse } from "../utils/api-response";
import { AppError } from "../utils/app-error";
import { ERROR_CODES } from "../constants/error-codes";
import type {
  ChallengeVerificationBody,
  CompliancePhoneBindingBody,
  GoogleCredentialBody,
  LoginBody,
  LogoutBody,
  PasswordSetupBody,
  PasswordLoginVerifyBody,
  RefreshBody,
  RegisterBody,
  RegisterVerifyBody,
  SwitchIdentityBody,
  SwitchMerchantShopBody
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

  public verifyPasswordLogin = async (
    request: BodyRequest<PasswordLoginVerifyBody>,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.authService.verifyPasswordLogin(
              request.body.challengeId,
              request.body.otp,
              this.getContext(request)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public register = async (
    request: BodyRequest<RegisterBody>,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(successResponse(await this.authService.startRegistration(request.body)));
    } catch (error) {
      next(error);
    }
  };

  public verifyRegistration = async (
    request: BodyRequest<RegisterVerifyBody>,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.authService.verifyRegistration(
              request.body.challengeId,
              request.body.otp,
              this.getContext(request)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public initializeGoogleLogin = async (
    _request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response.status(200).json(successResponse(await this.authService.initializeGoogleLogin()));
    } catch (error) {
      next(error);
    }
  };

  public submitGoogleCredential = async (
    request: BodyRequest<GoogleCredentialBody>,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.authService.submitGoogleCredential(request.body, this.getContext(request))
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public verifyGoogleRegistrationOrLink = async (
    request: BodyRequest<ChallengeVerificationBody>,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.authService.verifyGoogleRegistrationOrLink(
              request.body.challengeId,
              request.body.otp,
              this.getContext(request)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public getGoogleLinkStatus = async (
    _request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.authService.getGoogleLinkStatus(this.getAuthenticatedAccess(response))
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public initializeAuthenticatedGoogleLink = async (
    _request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.authService.initializeAuthenticatedGoogleLink(
              this.getAuthenticatedAccess(response)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public submitAuthenticatedGoogleLink = async (
    request: BodyRequest<GoogleCredentialBody>,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.authService.submitAuthenticatedGoogleLink(
              request.body,
              this.getAuthenticatedAccess(response),
              this.getContext(request)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public verifyAuthenticatedGoogleLink = async (
    request: BodyRequest<ChallengeVerificationBody>,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.authService.verifyAuthenticatedGoogleLink(
              request.body.challengeId,
              request.body.otp,
              this.getAuthenticatedAccess(response),
              this.getContext(request)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public startGoogleUnlink = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.authService.startGoogleUnlink(
              this.getAuthenticatedAccess(response),
              this.getContext(request)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public verifyGoogleUnlink = async (
    request: BodyRequest<ChallengeVerificationBody>,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const auth = response.locals.auth as AuthenticatedAccessContext | undefined;
      const result = auth
        ? await this.authService.verifyGoogleUnlink(
            request.body.challengeId,
            request.body.otp,
            auth,
            this.getContext(request)
          )
        : await this.authService.recoverGoogleUnlinkCompletion(
            this.getBearerToken(request),
            request.body.challengeId
          );
      response.status(200).json(successResponse(result));
    } catch (error) {
      next(error);
    }
  };

  public startPasswordSetup = async (
    request: BodyRequest<PasswordSetupBody>,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.authService.startPasswordSetup(
              request.body.password,
              this.getAuthenticatedAccess(response),
              this.getContext(request)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public verifyPasswordSetup = async (
    request: BodyRequest<ChallengeVerificationBody>,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.authService.verifyPasswordSetup(
              request.body.challengeId,
              request.body.otp,
              this.getAuthenticatedAccess(response),
              this.getContext(request)
            )
          )
        );
    } catch (error) {
      next(error);
    }
  };

  public bindCompliancePhone = async (
    request: BodyRequest<CompliancePhoneBindingBody>,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.authService.bindCompliancePhone(
              request.body.phone,
              this.getAuthenticatedAccess(response),
              this.getContext(request)
            )
          )
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

  public switchMerchantShop = async (
    request: BodyRequest<SwitchMerchantShopBody>,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .status(200)
        .json(
          successResponse(
            await this.authService.switchMerchantShop(
              this.getAuthenticatedAccess(response),
              request.body.refreshToken,
              request.body.shopPublicId,
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

  private getBearerToken(request: Request): string {
    const authorization = request.get("authorization");
    const [scheme, token, extra] = authorization?.split(/\s+/) ?? [];
    if (scheme?.toLowerCase() !== "bearer" || !token || extra) {
      throw new AppError({
        code: ERROR_CODES.TOKEN_INVALID,
        message: "error.auth.token_invalid",
        statusCode: 401
      });
    }
    return token;
  }
}
