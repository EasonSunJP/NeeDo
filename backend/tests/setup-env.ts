import { tmpdir } from "node:os";
import { join } from "node:path";
import { config as loadDotenv } from "dotenv";

const runCustomerProfileRepositoryIntegration =
  process.env.RUN_CUSTOMER_PROFILE_REPOSITORY_INTEGRATION === "true";

if (runCustomerProfileRepositoryIntegration && process.env.ENV_FILE) {
  loadDotenv({ path: process.env.ENV_FILE, override: true });
  const integrationDatabaseUrl = new URL(process.env.DATABASE_URL ?? "");

  if (
    !["localhost", "127.0.0.1", "::1"].includes(integrationDatabaseUrl.hostname) ||
    /prod/i.test(integrationDatabaseUrl.pathname)
  ) {
    throw new Error("Customer profile repository integration tests require a local non-production database");
  }
}

process.env.NODE_ENV = runCustomerProfileRepositoryIntegration ? "development" : "test";
process.env.DEPLOY_ENV = runCustomerProfileRepositoryIntegration ? "local" : "test";
process.env.ALLOW_TEST_LOGIN = "true";
process.env.ALLOW_DEMO_SEED = "true";
process.env.ALLOW_SIMULATION_SEED = "true";
process.env.SERVICE_NAME = "needo-backend";
process.env.PORT = "3101";
process.env.API_PREFIX = "/api/v1";
process.env.CORS_ALLOWED_ORIGINS = "http://localhost:5180,http://127.0.0.1:5180";
process.env.TRUST_PROXY = "false";
process.env.RATE_LIMIT_WINDOW_MS = "60000";
process.env.RATE_LIMIT_MAX = "1000";
process.env.REQUEST_BODY_LIMIT = "1mb";
process.env.LOG_LEVEL = "silent";
process.env.OPENAPI_ENABLED = "true";
process.env.METRICS_ENABLED = "true";
process.env.METRICS_BEARER_TOKEN = "";
process.env.TRACING_ENABLED = "true";
process.env.CACHE_PUBLIC_MAX_AGE_SECONDS = "30";
process.env.CACHE_STALE_WHILE_REVALIDATE_SECONDS = "120";
if (!runCustomerProfileRepositoryIntegration) {
  process.env.DATABASE_URL =
    process.env.CUSTOMER_PROFILE_REPOSITORY_TEST_DATABASE_URL ??
    "mysql://needo_test:needo_test_password@localhost:3307/needo_test";
}
process.env.DATABASE_POOL_CONNECTION_LIMIT = "10";
process.env.DATABASE_POOL_ACQUIRE_TIMEOUT_MS = "10000";
process.env.DATABASE_POOL_IDLE_TIMEOUT_MS = "30000";
process.env.DATABASE_POOL_CONNECT_TIMEOUT_MS = "5000";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.REDIS_POOL_SIZE = "1";
process.env.REDIS_CONNECT_TIMEOUT_MS = "5000";
process.env.REDIS_RECONNECT_MAX_RETRIES = "0";
process.env.REDIS_RECONNECT_BASE_DELAY_MS = "100";
process.env.REDIS_RECONNECT_MAX_DELAY_MS = "3000";
process.env.AUTH_ACCESS_TOKEN_SECRET = "test-access-token-secret-with-at-least-32-chars";
process.env.AUTH_REFRESH_TOKEN_SECRET = "test-refresh-token-secret-with-at-least-32-chars";
process.env.AFFILIATE_LINK_SECRET = "test-affiliate-link-secret-with-at-least-32-chars";
process.env.AFFILIATE_PUBLIC_BASE_URL = "http://localhost:5180/afirieito";
process.env.CUSTOMER_AVATAR_STORAGE_DIR = join(tmpdir(), "needo-customer-avatars-test");
process.env.CUSTOMER_AVATAR_PUBLIC_BASE_URL = "http://localhost:3101/media/customer-avatars";
process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS = "900";
process.env.AUTH_REFRESH_TOKEN_TTL_SECONDS = "604800";
process.env.AUTH_LOGIN_FAILURE_LIMIT = "5";
process.env.AUTH_LOGIN_FAILURE_WINDOW_SECONDS = "300";
process.env.AUTH_LOGIN_LOCK_SECONDS = "300";
process.env.AUTH_OTP_TTL_SECONDS = "600";
process.env.AUTH_OTP_COOLDOWN_SECONDS = "60";
process.env.AUTH_OTP_EMAIL_WEBHOOK_URL = "http://localhost:3999/test-otp";
process.env.AUTH_OTP_EMAIL_WEBHOOK_TIMEOUT_MS = "3000";
process.env.TEST_USER_DEFAULT_PASSWORD = "Abcd@1234";
