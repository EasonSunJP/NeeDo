import { isIP } from "node:net";
import { isAbsolute } from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";
import { assertContentMediaStorageIsolationSync } from "../services/content-media.storage";

if (process.env.ENV_FILE) {
  loadDotenv({ path: process.env.ENV_FILE });
} else {
  loadDotenv();
}

const normalizedProcessEnv = { ...process.env };
const applyEnvAlias = (target: string, source: string): void => {
  if (!normalizedProcessEnv[target] && normalizedProcessEnv[source]) {
    normalizedProcessEnv[target] = normalizedProcessEnv[source];
  }
};

applyEnvAlias("CORS_ALLOWED_ORIGINS", "CORS_ORIGINS");
applyEnvAlias("AUTH_ACCESS_TOKEN_SECRET", "JWT_ACCESS_SECRET");
applyEnvAlias("AUTH_REFRESH_TOKEN_SECRET", "JWT_REFRESH_SECRET");
applyEnvAlias("AUTH_ACCESS_TOKEN_TTL_SECONDS", "JWT_ACCESS_EXPIRES_IN");
applyEnvAlias("AUTH_REFRESH_TOKEN_TTL_SECONDS", "JWT_REFRESH_EXPIRES_IN");

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

const optionalSecretSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.trim().length === 0) {
    return undefined;
  }

  return value;
}, z.string().trim().min(1).optional());

const productionPlaceholderPattern = /(change-?me|example|placeholder|replace-?with)/i;
const translationPlaceholderTokenPattern =
  /(?:^|[-_.:])(change-?me|example|placeholder|replace-?with|dummy|test|fake|sample)(?:$|[-_.:])/iu;
const productionTranslationPlaceholderKeys = new Set([
  "local",
  "local-key",
  "development",
  "development-key",
  "dev-key",
  "not-a-real-key"
]);
const productionTranslationPlaceholderTokenPattern =
  /(?:^|[-_.:])(local|development|dev)(?:$|[-_.:])/u;
const productionGoogleWebClientIdPattern =
  /^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?\.apps\.googleusercontent\.com$/;
const productionGoogleClientIdNonProductionValuePattern = /\b(local|dummy|test)\b/i;

const addProductionIssue = (context: z.RefinementCtx, path: string, message: string): void => {
  context.addIssue({
    code: z.ZodIssueCode.custom,
    message,
    path: [path]
  });
};

const normalizeConfiguredHostname = (hostname: string): string =>
  hostname
    .toLowerCase()
    .replace(/^\[|\]$/gu, "")
    .replace(/\.+$/u, "");

const parseIpv6Words = (address: string): number[] | null => {
  if (isIP(address) !== 6) return null;
  const [head = "", tail = "", ...extra] = address.split("::");
  if (extra.length > 0) return null;
  const parseSide = (side: string): number[] =>
    side.length === 0 ? [] : side.split(":").map((word) => Number.parseInt(word, 16));
  const headWords = parseSide(head);
  const tailWords = parseSide(tail);
  const omittedWordCount = 8 - headWords.length - tailWords.length;
  if (omittedWordCount < 0) return null;
  return [...headWords, ...Array.from({ length: omittedWordCount }, () => 0), ...tailWords];
};

const isUnsafeTranslationIp = (hostname: string): boolean => {
  const ipVersion = isIP(hostname);
  if (ipVersion === 4) {
    const octets = hostname.split(".").map(Number);
    return octets[0] === 127 || octets.every((octet) => octet === 0);
  }
  if (ipVersion !== 6) return false;

  const words = parseIpv6Words(hostname);
  if (!words) return false;
  const isUnspecified = words.every((word) => word === 0);
  const isLoopback = words.slice(0, 7).every((word) => word === 0) && words[7] === 1;
  const isIpv4Mapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  const isIpv4Compatible = words.slice(0, 6).every((word) => word === 0);
  const mappedIpv4IsUnsafe =
    (isIpv4Mapped || isIpv4Compatible) &&
    ((words[6] === 0 && words[7] === 0) || (words[6] ?? 0) >> 8 === 127);
  return isUnspecified || isLoopback || mappedIpv4IsUnsafe;
};

const isUnsafeProductionTranslationHostname = (hostname: string): boolean => {
  const normalized = normalizeConfiguredHostname(hostname);
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    isUnsafeTranslationIp(normalized) ||
    /(?:^|\.)example\.(?:com|net|org)$/u.test(normalized) ||
    normalized === "example" ||
    normalized.endsWith(".example")
  );
};

const isTranslationPlaceholderKey = (key: string, production: boolean): boolean => {
  const normalized = key.trim().toLowerCase();
  const productionExactOrProviderSuffix = Array.from(productionTranslationPlaceholderKeys).some(
    (placeholder) => normalized === placeholder || normalized.startsWith(`${placeholder}:`)
  );
  return (
    translationPlaceholderTokenPattern.test(normalized) ||
    (production &&
      (productionExactOrProviderSuffix ||
        productionTranslationPlaceholderTokenPattern.test(normalized)))
  );
};

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]),
    DEPLOY_ENV: z.enum(["local", "test", "staging", "prod"]).default("local"),
    ALLOW_TEST_LOGIN: booleanSchema.default(false),
    ALLOW_FORMAL_TEST_SEED: booleanSchema.default(false),
    ALLOW_SIMULATION_SEED: booleanSchema.default(false),
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
    DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL: booleanSchema.default(false),
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
    REALTIME_REDIS_CHANNEL: z
      .string()
      .regex(/^[A-Za-z0-9:_-]{1,128}$/)
      .default("needo:realtime:events:v1"),
    AUTH_ACCESS_TOKEN_SECRET: z.string().min(32),
    AUTH_REFRESH_TOKEN_SECRET: z.string().min(32),
    AUTH_TOKEN_AUDIENCE: z.string().regex(/^[a-z0-9][a-z0-9:_-]{2,127}$/),
    AUTH_VERIFICATION_SECRET: z.string().min(32),
    AUTH_VERIFICATION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5),
    AUTH_ACTION_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive(),
    AUTH_REGISTRATION_RATE_LIMIT_MAX: z.coerce.number().int().positive(),
    AUTH_GOOGLE_INIT_RATE_LIMIT_MAX: z.coerce.number().int().positive(),
    AUTH_GOOGLE_CREDENTIAL_RATE_LIMIT_MAX: z.coerce.number().int().positive(),
    AUTH_VERIFICATION_RATE_LIMIT_MAX: z.coerce.number().int().positive(),
    AUTH_GOOGLE_NONCE_TTL_SECONDS: z.coerce.number().int().positive().max(600),
    AUTH_MERCHANT_SHOP_AUDIT_OUTBOX_INTERVAL_MS: z.coerce.number().int().min(1_000).default(5_000),
    AUTH_MERCHANT_SHOP_AUDIT_OUTBOX_DRAIN_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .default(3_000),
    AUTH_MERCHANT_SHOP_AUDIT_OUTBOX_SHUTDOWN_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .default(1_000),
    GOOGLE_AUTH_CLIENT_ID: z.string().trim().min(1),
    GOOGLE_AUTH_VERIFY_TIMEOUT_MS: z.coerce.number().int().positive(),
    AFFILIATE_LINK_SECRET: z.string().min(32),
    SENSITIVE_DATA_ENCRYPTION_KEY: z.string().min(32),
    AFFILIATE_PUBLIC_BASE_URL: z.string().url(),
    CUSTOMER_AVATAR_STORAGE_DIR: z.string().min(1).default("runtime/customer-avatars"),
    IDENTITY_APPLICATION_MEDIA_STORAGE_DIR: z
      .string()
      .min(1)
      .default("runtime/identity-applications"),
    IM_MEDIA_STORAGE_DIR: z.string().min(1).default("runtime/im-media"),
    IM_MEDIA_PUBLIC_BASE_URL: optionalUrlSchema,
    IM_PRIVACY_EXPIRY_INTERVAL_MS: z.coerce.number().int().min(100).default(1_000),
    IM_PRIVACY_EXPIRY_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(50),
    IM_TRANSLATION_PROVIDER: z.enum(["disabled", "deepl"]).default("disabled"),
    IM_TRANSLATION_API_BASE_URL: optionalUrlSchema,
    IM_TRANSLATION_API_KEY: optionalSecretSchema,
    IM_TRANSLATION_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5_000),
    IM_TRANSLATION_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(2),
    // Provider quota policy metadata only; this bounded step does not create a local usage ledger.
    IM_TRANSLATION_MONTHLY_CHARACTER_LIMIT: z.coerce.number().int().positive().default(500_000),
    TRAVEL_ROUTE_PROVIDER: z.enum(["disabled", "geoapify"]).default("disabled"),
    GEOAPIFY_API_BASE_URL: z.string().url().default("https://api.geoapify.com"),
    GEOAPIFY_API_KEY: optionalSecretSchema,
    TRAVEL_ROUTE_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5_000),
    TRAVEL_ROUTE_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(2),
    TRAVEL_ROUTE_CACHE_TTL_SECONDS: z.coerce.number().int().min(30).max(3_600).default(300),
    TRAVEL_ROUTE_NEGATIVE_CACHE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(5)
      .max(300)
      .default(30),
    TRAVEL_ESTIMATE_TTL_SECONDS: z.coerce.number().int().min(60).max(1_800).default(600),
    CONTENT_MEDIA_STORAGE_DIR: z.string().min(1).default("runtime/content-media"),
    FRIEND_REQUEST_EXPIRY_INTERVAL_MS: z.coerce.number().int().min(60_000).default(60_000),
    FRIEND_REQUEST_EXPIRY_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(100),
    CONTENT_PUBLICATION_INTERVAL_MS: z.coerce.number().int().min(60_000).default(60_000),
    CONTENT_PUBLICATION_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(50),
    CONTENT_PUBLICATION_MAX_ACTIVATION_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(3),
    OFFICIAL_NOTICE_DELIVERY_INTERVAL_MS: z.coerce.number().int().min(1_000).default(60_000),
    OFFICIAL_NOTICE_DELIVERY_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(100),
    OFFICIAL_NOTICE_MAX_DELIVERY_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(3),
    IDENTITY_APPLICATION_PURGE_INTERVAL_MS: z.coerce.number().int().min(60_000).default(3_600_000),
    AFFILIATE_TASK_EXPIRY_INTERVAL_MS: z.coerce.number().int().min(60_000).default(300_000),
    AFFILIATE_TASK_EXPIRY_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(100),
    AFFILIATE_ALLIANCE_INVITATION_EXPIRY_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(60_000)
      .default(300_000),
    AFFILIATE_ALLIANCE_INVITATION_EXPIRY_BATCH_SIZE: z.coerce
      .number()
      .int()
      .min(1)
      .max(500)
      .default(100),
    BOOKING_USER_REWARD_EXPIRY_INTERVAL_MS: z.coerce.number().int().min(60_000).default(300_000),
    BOOKING_USER_REWARD_EXPIRY_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(100),
    ORDER_SERVICE_EXPIRY_INTERVAL_MS: z.coerce.number().int().min(1_000).default(60_000),
    ORDER_SERVICE_EXPIRY_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(100),
    SHOP_MEMBERSHIP_CARD_ADJUSTMENT_EXPIRY_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(60_000)
      .default(300_000),
    SHOP_MEMBERSHIP_CARD_ADJUSTMENT_EXPIRY_BATCH_SIZE: z.coerce
      .number()
      .int()
      .min(1)
      .max(500)
      .default(100),
    EXCHANGE_EXPIRY_WORKER_ENABLED: booleanSchema.default(true),
    EXCHANGE_EXPIRY_INTERVAL_MS: z.coerce.number().int().min(60_000).default(300_000),
    EXCHANGE_EXPIRY_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(100),
    CUSTOMER_AVATAR_PUBLIC_BASE_URL: z.string().url(),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().max(900),
    AUTH_REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().max(604800),
    AUTH_LOGIN_FAILURE_LIMIT: z.coerce.number().int().positive(),
    AUTH_LOGIN_FAILURE_WINDOW_SECONDS: z.coerce.number().int().positive(),
    AUTH_LOGIN_LOCK_SECONDS: z.coerce.number().int().positive(),
    AUTH_OTP_TTL_SECONDS: z.coerce.number().int().positive().max(600),
    AUTH_OTP_COOLDOWN_SECONDS: z.coerce.number().int().positive(),
    AUTH_OTP_EMAIL_WEBHOOK_URL: optionalUrlSchema,
    AUTH_OTP_EMAIL_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().positive()
  })
  .superRefine((value, context) => {
    try {
      assertContentMediaStorageIsolationSync(
        value.CONTENT_MEDIA_STORAGE_DIR,
        value.IDENTITY_APPLICATION_MEDIA_STORAGE_DIR
      );
    } catch (error) {
      addProductionIssue(
        context,
        "CONTENT_MEDIA_STORAGE_DIR",
        error instanceof Error ? error.message : "Content media storage isolation is invalid"
      );
    }

    if (value.IM_TRANSLATION_PROVIDER === "deepl") {
      if (!value.IM_TRANSLATION_API_BASE_URL) {
        addProductionIssue(
          context,
          "IM_TRANSLATION_API_BASE_URL",
          "IM_TRANSLATION_API_BASE_URL is required for the DeepL provider"
        );
      } else {
        const translationApiUrl = new URL(value.IM_TRANSLATION_API_BASE_URL);
        if (translationApiUrl.protocol !== "https:") {
          addProductionIssue(
            context,
            "IM_TRANSLATION_API_BASE_URL",
            "IM_TRANSLATION_API_BASE_URL must use HTTPS"
          );
        }
        if (
          value.NODE_ENV === "production" &&
          isUnsafeProductionTranslationHostname(translationApiUrl.hostname)
        ) {
          addProductionIssue(
            context,
            "IM_TRANSLATION_API_BASE_URL",
            "IM_TRANSLATION_API_BASE_URL must use a non-local production host"
          );
        }
      }

      if (!value.IM_TRANSLATION_API_KEY) {
        addProductionIssue(
          context,
          "IM_TRANSLATION_API_KEY",
          "IM_TRANSLATION_API_KEY is required for the DeepL provider"
        );
      } else if (
        isTranslationPlaceholderKey(value.IM_TRANSLATION_API_KEY, value.NODE_ENV === "production")
      ) {
        addProductionIssue(
          context,
          "IM_TRANSLATION_API_KEY",
          "IM_TRANSLATION_API_KEY must not use a placeholder value"
        );
      }
    }

    if (value.TRAVEL_ROUTE_PROVIDER === "geoapify") {
      const geoapifyUrl = new URL(value.GEOAPIFY_API_BASE_URL);
      if (geoapifyUrl.protocol !== "https:") {
        addProductionIssue(
          context,
          "GEOAPIFY_API_BASE_URL",
          "GEOAPIFY_API_BASE_URL must use HTTPS"
        );
      }
      if (
        value.NODE_ENV === "production" &&
        isUnsafeProductionTranslationHostname(geoapifyUrl.hostname)
      ) {
        addProductionIssue(
          context,
          "GEOAPIFY_API_BASE_URL",
          "GEOAPIFY_API_BASE_URL must use a non-local production host"
        );
      }
      if (!value.GEOAPIFY_API_KEY) {
        addProductionIssue(
          context,
          "GEOAPIFY_API_KEY",
          "GEOAPIFY_API_KEY is required for the Geoapify provider"
        );
      }
    }

    if (value.NODE_ENV !== "production") {
      return;
    }

    for (const field of ["IM_MEDIA_STORAGE_DIR", "CONTENT_MEDIA_STORAGE_DIR"] as const) {
      if (!isAbsolute(value[field])) {
        addProductionIssue(context, field, `${field} must be an absolute path in production`);
      }
    }

    const unsafeFlags = [
      ["ALLOW_TEST_LOGIN", value.ALLOW_TEST_LOGIN],
      ["ALLOW_FORMAL_TEST_SEED", value.ALLOW_FORMAL_TEST_SEED],
      ["ALLOW_SIMULATION_SEED", value.ALLOW_SIMULATION_SEED]
    ] as const;

    for (const [flag, enabled] of unsafeFlags) {
      if (enabled) {
        addProductionIssue(context, flag, `${flag} must be false when NODE_ENV=production`);
      }
    }

    if (!(["staging", "prod"] as const).includes(value.DEPLOY_ENV as "staging" | "prod")) {
      addProductionIssue(
        context,
        "DEPLOY_ENV",
        "DEPLOY_ENV must be staging or prod when NODE_ENV=production"
      );
    }

    const insecureOrigin = value.CORS_ALLOWED_ORIGINS.find((origin) => {
      try {
        const parsedOrigin = new URL(origin);
        return (
          parsedOrigin.protocol !== "https:" ||
          parsedOrigin.hostname.endsWith(".example") ||
          parsedOrigin.hostname === "example"
        );
      } catch {
        return true;
      }
    });
    if (insecureOrigin) {
      addProductionIssue(
        context,
        "CORS_ALLOWED_ORIGINS",
        `CORS_ALLOWED_ORIGINS must contain HTTPS origins only in production: ${insecureOrigin}`
      );
    }

    if (!value.METRICS_ENABLED) {
      addProductionIssue(context, "METRICS_ENABLED", "METRICS_ENABLED must be true in production");
    } else if (!value.METRICS_BEARER_TOKEN) {
      addProductionIssue(
        context,
        "METRICS_BEARER_TOKEN",
        "METRICS_BEARER_TOKEN is required when metrics are enabled in production"
      );
    }

    const tokenSecrets = [
      ["AUTH_ACCESS_TOKEN_SECRET", value.AUTH_ACCESS_TOKEN_SECRET],
      ["AUTH_REFRESH_TOKEN_SECRET", value.AUTH_REFRESH_TOKEN_SECRET]
    ] as const;
    for (const [field, secret] of tokenSecrets) {
      if (productionPlaceholderPattern.test(secret)) {
        addProductionIssue(
          context,
          field,
          `${field} must not use a placeholder value in production`
        );
      }
    }
    if (value.AUTH_ACCESS_TOKEN_SECRET === value.AUTH_REFRESH_TOKEN_SECRET) {
      addProductionIssue(
        context,
        "AUTH_REFRESH_TOKEN_SECRET",
        "AUTH_REFRESH_TOKEN_SECRET must differ from AUTH_ACCESS_TOKEN_SECRET"
      );
    }

    if (productionPlaceholderPattern.test(value.AUTH_VERIFICATION_SECRET)) {
      addProductionIssue(
        context,
        "AUTH_VERIFICATION_SECRET",
        "AUTH_VERIFICATION_SECRET must not use a placeholder value in production"
      );
    }

    if (
      !productionGoogleWebClientIdPattern.test(value.GOOGLE_AUTH_CLIENT_ID) ||
      productionPlaceholderPattern.test(value.GOOGLE_AUTH_CLIENT_ID) ||
      productionGoogleClientIdNonProductionValuePattern.test(value.GOOGLE_AUTH_CLIENT_ID)
    ) {
      addProductionIssue(
        context,
        "GOOGLE_AUTH_CLIENT_ID",
        "GOOGLE_AUTH_CLIENT_ID must use a production Google Web OAuth client ID"
      );
    }
    if (
      value.AUTH_VERIFICATION_SECRET === value.AUTH_ACCESS_TOKEN_SECRET ||
      value.AUTH_VERIFICATION_SECRET === value.AUTH_REFRESH_TOKEN_SECRET
    ) {
      addProductionIssue(
        context,
        "AUTH_VERIFICATION_SECRET",
        "AUTH_VERIFICATION_SECRET must differ from Auth token secrets"
      );
    }

    if (productionPlaceholderPattern.test(value.AFFILIATE_LINK_SECRET)) {
      addProductionIssue(
        context,
        "AFFILIATE_LINK_SECRET",
        "AFFILIATE_LINK_SECRET must not use a placeholder value in production"
      );
    }
    if (
      value.AFFILIATE_LINK_SECRET === value.AUTH_ACCESS_TOKEN_SECRET ||
      value.AFFILIATE_LINK_SECRET === value.AUTH_REFRESH_TOKEN_SECRET
    ) {
      addProductionIssue(
        context,
        "AFFILIATE_LINK_SECRET",
        "AFFILIATE_LINK_SECRET must differ from Auth token secrets"
      );
    }

    if (productionPlaceholderPattern.test(value.SENSITIVE_DATA_ENCRYPTION_KEY)) {
      addProductionIssue(
        context,
        "SENSITIVE_DATA_ENCRYPTION_KEY",
        "SENSITIVE_DATA_ENCRYPTION_KEY must not use a placeholder value in production"
      );
    }
    if (
      [
        value.AUTH_ACCESS_TOKEN_SECRET,
        value.AUTH_REFRESH_TOKEN_SECRET,
        value.AFFILIATE_LINK_SECRET
      ].includes(value.SENSITIVE_DATA_ENCRYPTION_KEY)
    ) {
      addProductionIssue(
        context,
        "SENSITIVE_DATA_ENCRYPTION_KEY",
        "SENSITIVE_DATA_ENCRYPTION_KEY must differ from Auth and affiliate secrets"
      );
    }

    const affiliatePublicBaseUrl = new URL(value.AFFILIATE_PUBLIC_BASE_URL);
    if (
      affiliatePublicBaseUrl.protocol !== "https:" ||
      affiliatePublicBaseUrl.hostname.endsWith(".example") ||
      affiliatePublicBaseUrl.hostname === "example"
    ) {
      addProductionIssue(
        context,
        "AFFILIATE_PUBLIC_BASE_URL",
        "AFFILIATE_PUBLIC_BASE_URL must use a production HTTPS origin"
      );
    }

    const customerAvatarPublicBaseUrl = new URL(value.CUSTOMER_AVATAR_PUBLIC_BASE_URL);
    if (customerAvatarPublicBaseUrl.protocol !== "https:") {
      addProductionIssue(
        context,
        "CUSTOMER_AVATAR_PUBLIC_BASE_URL",
        "CUSTOMER_AVATAR_PUBLIC_BASE_URL must use a production HTTPS origin"
      );
    }

    if (value.IM_MEDIA_PUBLIC_BASE_URL) {
      const imMediaPublicBaseUrl = new URL(value.IM_MEDIA_PUBLIC_BASE_URL);
      if (imMediaPublicBaseUrl.protocol !== "https:") {
        addProductionIssue(
          context,
          "IM_MEDIA_PUBLIC_BASE_URL",
          "IM_MEDIA_PUBLIC_BASE_URL must use a production HTTPS origin"
        );
      }
    }

    const databaseUrl = new URL(value.DATABASE_URL);
    if (
      !databaseUrl.password ||
      productionPlaceholderPattern.test(databaseUrl.password) ||
      ["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)
    ) {
      addProductionIssue(
        context,
        "DATABASE_URL",
        "DATABASE_URL must use non-placeholder credentials and a non-local host in production"
      );
    }

    const redisUrl = new URL(value.REDIS_URL);
    if (
      !redisUrl.password ||
      productionPlaceholderPattern.test(redisUrl.password) ||
      ["localhost", "127.0.0.1", "::1"].includes(redisUrl.hostname)
    ) {
      addProductionIssue(
        context,
        "REDIS_URL",
        "REDIS_URL must use authentication and a non-local host in production"
      );
    }
  });

const parsedEnv = envSchema.safeParse(normalizedProcessEnv);

if (!parsedEnv.success) {
  const formatted = parsedEnv.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid backend environment configuration: ${formatted}`);
}

export const env = {
  ...parsedEnv.data,
  IM_TRANSLATION_API_BASE_URL: parsedEnv.data.IM_TRANSLATION_API_BASE_URL,
  IM_TRANSLATION_API_KEY: parsedEnv.data.IM_TRANSLATION_API_KEY,
  GEOAPIFY_API_KEY: parsedEnv.data.GEOAPIFY_API_KEY
};

export type AppConfig = typeof env;
