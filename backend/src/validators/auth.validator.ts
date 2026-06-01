import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .email()
  .max(255)
  .transform((email) => email.toLowerCase());

const loginIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .transform((identifier) => identifier.toLowerCase());

export const loginBodySchema = z
  .object({
    email: emailSchema.optional(),
    username: loginIdentifierSchema.optional(),
    password: z.string().min(1).max(128),
    type: z.enum(["username", "mobile", "email", "wechat", "qq", "weibo"]).optional(),
    numcode: z.string().trim().max(32).optional()
  })
  .superRefine((body, context) => {
    if (body.email || body.username) {
      return;
    }

    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "email or username is required",
      path: ["email"]
    });
  })
  .transform((body) => ({
    loginIdentifier: body.email ?? body.username ?? "",
    password: body.password
  }));

export const otpSendBodySchema = z.object({
  email: emailSchema
});

export const otpVerifyBodySchema = z.object({
  email: emailSchema,
  otp: z.string().regex(/^\d{6}$/)
});

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(1)
});

export const switchIdentityBodySchema = z.object({
  refreshToken: z.string().min(1),
  identityId: z.number().int().positive()
});

export const logoutBodySchema = z.object({
  refreshToken: z.string().min(1)
});

export type LoginBody = z.infer<typeof loginBodySchema>;
export type OtpSendBody = z.infer<typeof otpSendBodySchema>;
export type OtpVerifyBody = z.infer<typeof otpVerifyBodySchema>;
export type RefreshBody = z.infer<typeof refreshBodySchema>;
export type SwitchIdentityBody = z.infer<typeof switchIdentityBodySchema>;
export type LogoutBody = z.infer<typeof logoutBodySchema>;
