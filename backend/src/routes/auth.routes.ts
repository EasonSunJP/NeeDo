import { Router, type NextFunction, type Request, type Response } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { AuthController } from "../controllers/auth.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import {
  createAccountSecurityRateLimitMiddleware,
  createAuthRegistrationRateLimitMiddleware,
  createAuthVerificationRateLimitMiddleware,
  createGoogleCredentialRateLimitMiddleware,
  createGoogleInitRateLimitMiddleware
} from "../middlewares/security.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import {
  challengeVerificationBodySchema,
  emptyAuthActionBodySchema,
  googleCredentialBodySchema,
  legacyLoginBodySchema,
  loginBodySchema,
  logoutBodySchema,
  passwordSetupBodySchema,
  registerBodySchema,
  registerVerifyBodySchema,
  refreshBodySchema,
  switchIdentityBodySchema,
  switchMerchantShopBodySchema
} from "../validators/auth.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";
import { AppError } from "../utils/app-error";
import { ERROR_CODES } from "../constants/error-codes";

export const AUTH_ROUTE_PERMISSIONS = {
  logout: "auth:logout",
  me: "auth:me",
  merchantShopSwitch: "auth:me:read",
  googleRead: "auth:google:read",
  googleLink: "auth:google:link",
  googleUnlink: "auth:google:unlink",
  passwordSetup: "auth:password:setup"
} as const;

export const createAuthRoutes = (config: AppConfig, dependencies: AppDependencies): Router => {
  const router = Router();
  const authService = createAuthServiceForRoutes(config, dependencies);
  const controller = new AuthController(authService);
  const authenticate = createAuthenticateMiddleware(authService);
  const authorize = createAuthorizeMiddleware;
  const registrationRateLimit = createAuthRegistrationRateLimitMiddleware(config);
  const verificationRateLimit = createAuthVerificationRateLimitMiddleware(config);
  const googleInitRateLimit = createGoogleInitRateLimitMiddleware(config);
  const googleCredentialRateLimit = createGoogleCredentialRateLimitMiddleware(config);
  const accountSecurityRateLimit = createAccountSecurityRateLimitMiddleware(config);

  router.post("/login", validateRequest({ body: legacyLoginBodySchema }), controller.login);
  router.post("/auth/login", validateRequest({ body: loginBodySchema }), controller.login);
  router.post(
    "/auth/register",
    registrationRateLimit,
    validateRequest({ body: registerBodySchema }),
    controller.register
  );
  router.post(
    "/auth/register/verify",
    verificationRateLimit,
    validateRequest({ body: registerVerifyBodySchema }),
    controller.verifyRegistration
  );
  router.post(
    "/auth/google/init",
    googleInitRateLimit,
    validateRequest({ body: emptyAuthActionBodySchema }),
    controller.initializeGoogleLogin
  );
  router.post(
    "/auth/google",
    googleCredentialRateLimit,
    validateRequest({ body: googleCredentialBodySchema }),
    controller.submitGoogleCredential
  );
  router.post(
    "/auth/google/verify",
    verificationRateLimit,
    validateRequest({ body: challengeVerificationBodySchema }),
    controller.verifyGoogleRegistrationOrLink
  );
  router.post("/auth/refresh", validateRequest({ body: refreshBodySchema }), controller.refresh);
  router.post(
    "/auth/switch-identity",
    validateRequest({ body: switchIdentityBodySchema }),
    authenticate(),
    authorize(AUTH_ROUTE_PERMISSIONS.me),
    controller.switchIdentity
  );
  router.post(
    "/auth/merchant-shop/switch",
    validateRequest({ body: switchMerchantShopBodySchema }),
    authenticate(),
    authorize(AUTH_ROUTE_PERMISSIONS.merchantShopSwitch),
    controller.switchMerchantShop
  );
  router.post(
    "/auth/logout",
    validateRequest({ body: logoutBodySchema }),
    authenticate(),
    authorize(AUTH_ROUTE_PERMISSIONS.logout),
    controller.logout
  );
  router.get("/auth/me", authenticate(), authorize(AUTH_ROUTE_PERMISSIONS.me), controller.me);
  router.get(
    "/auth/google/link",
    authenticate(),
    authorize(AUTH_ROUTE_PERMISSIONS.googleRead),
    accountSecurityRateLimit,
    controller.getGoogleLinkStatus
  );
  router.post(
    "/auth/google/link/init",
    validateRequest({ body: emptyAuthActionBodySchema }),
    authenticate(),
    authorize(AUTH_ROUTE_PERMISSIONS.googleLink),
    accountSecurityRateLimit,
    controller.initializeAuthenticatedGoogleLink
  );
  router.post(
    "/auth/google/link",
    validateRequest({ body: googleCredentialBodySchema }),
    authenticate(),
    authorize(AUTH_ROUTE_PERMISSIONS.googleLink),
    accountSecurityRateLimit,
    controller.submitAuthenticatedGoogleLink
  );
  router.post(
    "/auth/google/link/verify",
    validateRequest({ body: challengeVerificationBodySchema }),
    authenticate(),
    authorize(AUTH_ROUTE_PERMISSIONS.googleLink),
    accountSecurityRateLimit,
    verificationRateLimit,
    controller.verifyAuthenticatedGoogleLink
  );
  router.post(
    "/auth/google/unlink",
    validateRequest({ body: emptyAuthActionBodySchema }),
    authenticate(),
    authorize(AUTH_ROUTE_PERMISSIONS.googleUnlink),
    accountSecurityRateLimit,
    controller.startGoogleUnlink
  );
  router.post(
    "/auth/google/unlink/verify",
    validateRequest({ body: challengeVerificationBodySchema }),
    createPrepareGoogleUnlinkVerification(authService),
    accountSecurityRateLimit,
    verificationRateLimit,
    controller.verifyGoogleUnlink
  );
  router.post(
    "/auth/password/setup",
    validateRequest({ body: passwordSetupBodySchema }),
    authenticate(),
    authorize(AUTH_ROUTE_PERMISSIONS.passwordSetup),
    accountSecurityRateLimit,
    controller.startPasswordSetup
  );
  router.post(
    "/auth/password/setup/verify",
    validateRequest({ body: challengeVerificationBodySchema }),
    authenticate(),
    authorize(AUTH_ROUTE_PERMISSIONS.passwordSetup),
    accountSecurityRateLimit,
    verificationRateLimit,
    controller.verifyPasswordSetup
  );

  return router;
};

const createPrepareGoogleUnlinkVerification =
  (authService: ReturnType<typeof createAuthServiceForRoutes>) =>
  async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.locals.auth = await authService.authenticateAccessToken(
        getBearerToken(request),
        AUTH_ROUTE_PERMISSIONS.googleUnlink
      );
      next();
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 401) {
        next();
        return;
      }
      next(error);
    }
  };

const getBearerToken = (request: Request): string => {
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
};
