import { config as loadDotenv } from "dotenv";
import { z } from "zod";

if (process.env.ENV_FILE) {
  loadDotenv({ path: process.env.ENV_FILE });
} else {
  loadDotenv();
}

const booleanSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return value;
}, z.boolean());

const commaSeparatedListSchema = z
  .string()
  .min(1)
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  )
  .refine((items) => items.length > 0, "At least one value is required");

const optionalUrlSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.trim().length === 0) {
    return undefined;
  }

  return value;
}, z.string().url().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  DEPLOY_ENV: z.enum(["local", "test", "staging", "prod"]).default("local"),
  SERVICE_NAME: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65535),
  API_PREFIX: z.string().regex(/^\/api\/v[0-9]+$/),
  CORS_ALLOWED_ORIGINS: commaSeparatedListSchema,
  TRUST_PROXY: booleanSchema.default(false),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive(),
  RATE_LIMIT_MAX: z.coerce.number().int().positive(),
  REQUEST_BODY_LIMIT: z.string().min(1),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]),
  OPENAPI_ENABLED: booleanSchema,
  METRICS_ENABLED: booleanSchema.default(true),
  METRICS_BEARER_TOKEN: z.preprocess((value) => {
    if (typeof value === "string" && value.trim().length === 0) {
      return undefined;
    }

    return value;
  }, z.string().min(32).optional()),
  TRACING_ENABLED: booleanSchema.default(true),
  CACHE_PUBLIC_MAX_AGE_SECONDS: z.coerce.number().int().min(0).default(30),
  CACHE_STALE_WHILE_REVALIDATE_SECONDS: z.coerce.number().int().min(0).default(120),
  CDN_BASE_URL: optionalUrlSchema,
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_CONNECTION_LIMIT: z.coerce.number().int().positive().max(200).default(10),
  DATABASE_POOL_ACQUIRE_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  DATABASE_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  DATABASE_POOL_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  REDIS_URL: z.string().url(),
  REDIS_POOL_SIZE: z.coerce.number().int().positive().max(20).default(1),
  REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  REDIS_RECONNECT_MAX_RETRIES: z.coerce.number().int().min(0).default(0),
  REDIS_RECONNECT_BASE_DELAY_MS: z.coerce.number().int().positive().default(100),
  REDIS_RECONNECT_MAX_DELAY_MS: z.coerce.number().int().positive().default(3000),
  AUTH_ACCESS_TOKEN_SECRET: z.string().min(32),
  AUTH_REFRESH_TOKEN_SECRET: z.string().min(32),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().max(900),
  AUTH_REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().max(604800),
  AUTH_LOGIN_FAILURE_LIMIT: z.coerce.number().int().positive(),
  AUTH_LOGIN_FAILURE_WINDOW_SECONDS: z.coerce.number().int().positive(),
  AUTH_LOGIN_LOCK_SECONDS: z.coerce.number().int().positive(),
  AUTH_OTP_TTL_SECONDS: z.coerce.number().int().positive().max(600),
  AUTH_OTP_COOLDOWN_SECONDS: z.coerce.number().int().positive(),
  AUTH_OTP_EMAIL_WEBHOOK_URL: optionalUrlSchema,
  AUTH_OTP_EMAIL_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().positive(),
  AUTH_TEST_LOGIN_ENABLED: booleanSchema.default(false)
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const formatted = parsedEnv.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid backend environment configuration: ${formatted}`);
}

export const env = parsedEnv.data;

export type AppConfig = typeof env;
