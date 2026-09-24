import { z } from "zod";
import { PLATFORM_LOGIN_VERIFICATION_RULES } from "../domain/platform-settings";

const mediaPublicIdSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/u)
  .nullable();

export const platformBasicSettingsBodySchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    siteEnabled: z.boolean(),
    selfRegistrationEnabled: z.boolean(),
    googleLoginEnabled: z.boolean(),
    passwordLoginOtpEnabled: z.boolean(),
    passwordLoginOtpRule: z.enum(PLATFORM_LOGIN_VERIFICATION_RULES),
    passwordLoginOtpOnNewIp: z.boolean(),
    anytimeServiceTestEnabled: z.boolean(),
    overdueAppointmentGateEnabled: z.boolean(),
    membershipCardFollowUiTheme: z.boolean().optional(),
    loginLogoMediaPublicId: mediaPublicIdSchema,
    requestButtonMediaPublicId: mediaPublicIdSchema
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.passwordLoginOtpEnabled && value.passwordLoginOtpOnNewIp) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["passwordLoginOtpOnNewIp"],
        message: "New-IP verification requires password login verification"
      });
    }
  });

export const platformPaymentSettingsBodySchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    offlinePaymentEnabled: z.boolean(),
    ndpPaymentEnabled: z.boolean()
  })
  .strict();
