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

const registrationPasswordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/[a-z]/, "password must include a lowercase letter")
  .regex(/[A-Z]/, "password must include an uppercase letter")
  .regex(/[0-9]/, "password must include a number")
  .regex(/[^A-Za-z0-9]/, "password must include a symbol");

export const registerBodySchema = z
  .object({
    email: emailSchema,
    password: registrationPasswordSchema
  })
  .strict();

export const registerVerifyBodySchema = z
  .object({
    challengeId: z.string().uuid(),
    otp: z.string().regex(/^\d{6}$/)
  })
  .strict();

export const loginBodySchema = z
  .object({
    loginIdentifier: loginIdentifierSchema.optional(),
    email: emailSchema.optional(),
    username: loginIdentifierSchema.optional(),
    password: z.string().min(1).max(128),
    type: z.enum(["username", "mobile", "email", "wechat", "qq", "weibo"]).optional(),
    numcode: z.string().trim().max(32).optional()
  })
  .superRefine((body, context) => {
    if (body.loginIdentifier || body.email || body.username) {
      return;
    }

    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "loginIdentifier is required",
      path: ["loginIdentifier"]
    });
  })
  .transform((body) => ({
    loginIdentifier: body.loginIdentifier ?? body.email ?? body.username ?? "",
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
export type RegisterBody = z.infer<typeof registerBodySchema>;
export type RegisterVerifyBody = z.infer<typeof registerVerifyBodySchema>;
export type OtpSendBody = z.infer<typeof otpSendBodySchema>;
export type OtpVerifyBody = z.infer<typeof otpVerifyBodySchema>;
export type RefreshBody = z.infer<typeof refreshBodySchema>;
export type SwitchIdentityBody = z.infer<typeof switchIdentityBodySchema>;
export type LogoutBody = z.infer<typeof logoutBodySchema>;
