import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { AuthRepository } from "../repositories/auth.repository";
import { WebhookOtpDeliveryClient } from "../services/auth-otp-delivery.service";
import { RedisAuthSessionStore } from "../services/auth-session.store";
import { AuthService } from "../services/auth.service";

export const createAuthServiceForRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): AuthService =>
  new AuthService(
    config,
    dependencies.authRepository ?? new AuthRepository(),
    dependencies.authSessionStore ?? new RedisAuthSessionStore(),
    dependencies.otpDeliveryClient ?? new WebhookOtpDeliveryClient(config)
  );
