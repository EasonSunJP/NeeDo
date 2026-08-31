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

export const strongPasswordSchema = z
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
    password: strongPasswordSchema
  })
  .strict();

export const challengeVerificationBodySchema = z
  .object({
    challengeId: z.string().uuid().max(64),
    otp: z.string().regex(/^\d{6}$/)
  })
  .strict();

export const loginBodySchema = z
  .object({
    loginIdentifier: loginIdentifierSchema,
    password: z.string().min(1).max(128)
  })
  .strict();

export const legacyLoginBodySchema = z
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

export const registerVerifyBodySchema = challengeVerificationBodySchema;

export const emptyAuthActionBodySchema = z.object({}).strict();

export const googleCredentialBodySchema = z
  .object({
    credential: z.string().trim().min(1).max(8192),
    nonceChallengeId: z.string().uuid().max(64)
  })
  .strict();

export const passwordSetupBodySchema = z
  .object({
    password: strongPasswordSchema
  })
  .strict();

export const refreshBodySchema = z
  .object({
    refreshToken: z.string().min(1).max(8192)
  })
  .strict();

export const switchIdentityBodySchema = z
  .object({
    refreshToken: z.string().min(1).max(8192),
    identityId: z.number().int().positive()
  })
  .strict();

export const switchMerchantShopBodySchema = z
  .object({
    refreshToken: z.string().min(1).max(8192),
    shopPublicId: z.string().regex(/^shop\d{10}$/)
  })
  .strict();

export const logoutBodySchema = z
  .object({
    refreshToken: z.string().min(1).max(8192)
  })
  .strict();

export type LoginBody = z.infer<typeof loginBodySchema>;
export type LegacyLoginBody = z.infer<typeof legacyLoginBodySchema>;
export type RegisterBody = z.infer<typeof registerBodySchema>;
export type RegisterVerifyBody = z.infer<typeof registerVerifyBodySchema>;
export type ChallengeVerificationBody = z.infer<typeof challengeVerificationBodySchema>;
export type GoogleCredentialBody = z.infer<typeof googleCredentialBodySchema>;
export type PasswordSetupBody = z.infer<typeof passwordSetupBodySchema>;
export type RefreshBody = z.infer<typeof refreshBodySchema>;
export type SwitchIdentityBody = z.infer<typeof switchIdentityBodySchema>;
export type SwitchMerchantShopBody = z.infer<typeof switchMerchantShopBodySchema>;
export type LogoutBody = z.infer<typeof logoutBodySchema>;
