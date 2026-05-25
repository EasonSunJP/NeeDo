import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .email()
  .max(255)
  .transform((email) => email.toLowerCase());

export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128)
});

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

export const logoutBodySchema = z.object({
  refreshToken: z.string().min(1)
});

export const testLoginBodySchema = z.object({
  portal: z.enum(["user", "merchant", "technician", "business", "admin"])
});

export type LoginBody = z.infer<typeof loginBodySchema>;
export type OtpSendBody = z.infer<typeof otpSendBodySchema>;
export type OtpVerifyBody = z.infer<typeof otpVerifyBodySchema>;
export type RefreshBody = z.infer<typeof refreshBodySchema>;
export type LogoutBody = z.infer<typeof logoutBodySchema>;
export type TestLoginBody = z.infer<typeof testLoginBodySchema>;
