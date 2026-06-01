import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { AuthController } from "../controllers/auth.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import {
  loginBodySchema,
  logoutBodySchema,
  otpSendBodySchema,
  otpVerifyBodySchema,
  refreshBodySchema,
  switchIdentityBodySchema
} from "../validators/auth.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const AUTH_ROUTE_PERMISSIONS = {
  logout: "auth:logout",
  me: "auth:me"
} as const;

export const createAuthRoutes = (config: AppConfig, dependencies: AppDependencies): Router => {
  const router = Router();
  const authService = createAuthServiceForRoutes(config, dependencies);
  const controller = new AuthController(authService);
  const authenticate = createAuthenticateMiddleware(authService);
  const authorize = createAuthorizeMiddleware;

  router.post("/login", validateRequest({ body: loginBodySchema }), controller.login);
  router.post("/auth/login", validateRequest({ body: loginBodySchema }), controller.login);
  router.post("/auth/otp/send", validateRequest({ body: otpSendBodySchema }), controller.sendOtp);
  router.post(
    "/auth/otp/verify",
    validateRequest({ body: otpVerifyBodySchema }),
    controller.verifyOtp
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
    "/auth/logout",
    validateRequest({ body: logoutBodySchema }),
    authenticate(),
    authorize(AUTH_ROUTE_PERMISSIONS.logout),
    controller.logout
  );
  router.get("/auth/me", authenticate(), authorize(AUTH_ROUTE_PERMISSIONS.me), controller.me);

  return router;
};
