import type { AppConfig } from "../config/env";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

export interface OtpDeliveryClient {
  sendOtp: (email: string, otp: string) => Promise<void>;
}

export class WebhookOtpDeliveryClient implements OtpDeliveryClient {
  public constructor(private readonly config: AppConfig) {}

  public async sendOtp(email: string, otp: string): Promise<void> {
    if (!this.config.AUTH_OTP_EMAIL_WEBHOOK_URL) {
      throw new AppError({
        code: ERROR_CODES.INTERNAL,
        message: "error.auth.otp_delivery_not_configured",
        statusCode: 503
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.AUTH_OTP_EMAIL_WEBHOOK_TIMEOUT_MS
    );

    try {
      const response = await fetch(this.config.AUTH_OTP_EMAIL_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ email, otp }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new AppError({
          code: ERROR_CODES.INTERNAL,
          message: "error.auth.otp_delivery_failed",
          statusCode: 502
        });
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError({
        code: ERROR_CODES.INTERNAL,
        message: "error.auth.otp_delivery_failed",
        statusCode: 502,
        cause: error
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
