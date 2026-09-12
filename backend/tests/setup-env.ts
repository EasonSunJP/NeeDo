import { tmpdir } from "node:os";
import { join } from "node:path";
import { config as loadDotenv } from "dotenv";
import { requireCustomerProfileRepositoryIntegrationDatabaseUrl } from "./customer-profile-repository-integration-safety";
import { requireExchangeCancellationScratchEnvironment } from "../scripts/check-exchange-cancellation-flow";

const runCustomerProfileRepositoryIntegration =
  process.env.RUN_CUSTOMER_PROFILE_REPOSITORY_INTEGRATION === "true";
const runCarouselPublicationIntegration =
  process.env.RUN_CAROUSEL_PUBLICATION_INTEGRATION === "true";
const runExchangeCancellationIntegration =
  process.env.RUN_EXCHANGE_CANCELLATION_INTEGRATION === "true";

if (runCustomerProfileRepositoryIntegration) {
  const envFile = process.env.ENV_FILE?.trim();

  if (!envFile) {
    throw new Error(
      "Customer profile repository integration tests require ENV_FILE; inherited DATABASE_URL values are forbidden"
    );
  }

  const loadedEnvironment = loadDotenv({ path: envFile, override: true });

  if (loadedEnvironment.error) {
    throw new Error(`Unable to load customer profile repository integration ENV_FILE: ${envFile}`);
  }

  process.env.DATABASE_URL = requireCustomerProfileRepositoryIntegrationDatabaseUrl({
    databaseUrl:
      process.env.CUSTOMER_PROFILE_REPOSITORY_TEST_DATABASE_URL?.trim()
      || loadedEnvironment.parsed?.DATABASE_URL,
    envFile
  });
}

if (runCarouselPublicationIntegration) {
  const envFile = process.env.ENV_FILE?.trim();
  if (!envFile) throw new Error("Carousel publication integration tests require ENV_FILE");
  const loadedEnvironment = loadDotenv({ path: envFile });
  if (loadedEnvironment.error || !loadedEnvironment.parsed?.DATABASE_URL) {
    throw new Error(`Unable to load carousel publication integration ENV_FILE: ${envFile}`);
  }
  process.env.DATABASE_URL = loadedEnvironment.parsed.DATABASE_URL;
}

if (runExchangeCancellationIntegration) {
  const { envFile } = requireExchangeCancellationScratchEnvironment(
    process.env.FORMAL_BACKEND_ENV_FILE
  );
  process.env.ENV_FILE = envFile;
  const loadedEnvironment = loadDotenv({ path: envFile, override: true });
  if (loadedEnvironment.error || !loadedEnvironment.parsed?.DATABASE_URL) {
    throw new Error(`Unable to load Exchange cancellation integration ENV_FILE: ${envFile}`);
  }
  process.env.DATABASE_URL = loadedEnvironment.parsed.DATABASE_URL;
}

if (!runCarouselPublicationIntegration) {
  process.env.NODE_ENV = runCustomerProfileRepositoryIntegration ? "development" : "test";
  process.env.DEPLOY_ENV = runCustomerProfileRepositoryIntegration ? "local" : "test";
}
process.env.ALLOW_TEST_LOGIN = "true";
process.env.ALLOW_FORMAL_TEST_SEED = "true";
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
if (
  !runCustomerProfileRepositoryIntegration &&
  !runCarouselPublicationIntegration &&
  !runExchangeCancellationIntegration
) {
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
process.env.AUTH_TOKEN_AUDIENCE = "needo-backend";
process.env.AUTH_VERIFICATION_SECRET = "test-verification-secret-with-at-least-32-chars";
process.env.AUTH_VERIFICATION_MAX_ATTEMPTS = "5";
process.env.AUTH_ACTION_RATE_LIMIT_WINDOW_MS = "60000";
process.env.AUTH_REGISTRATION_RATE_LIMIT_MAX = "1000";
process.env.AUTH_GOOGLE_INIT_RATE_LIMIT_MAX = "1000";
process.env.AUTH_GOOGLE_CREDENTIAL_RATE_LIMIT_MAX = "1000";
process.env.AUTH_VERIFICATION_RATE_LIMIT_MAX = "1000";
process.env.AUTH_GOOGLE_NONCE_TTL_SECONDS = "300";
process.env.GOOGLE_AUTH_CLIENT_ID = "test-google-client-id.apps.googleusercontent.com";
process.env.GOOGLE_AUTH_VERIFY_TIMEOUT_MS = "5000";
process.env.AFFILIATE_LINK_SECRET = "test-affiliate-link-secret-with-at-least-32-chars";
process.env.SENSITIVE_DATA_ENCRYPTION_KEY = "test-sensitive-data-key-with-at-least-32-chars";
process.env.AFFILIATE_PUBLIC_BASE_URL = "http://localhost:5180/afirieito";
process.env.CUSTOMER_AVATAR_STORAGE_DIR = join(tmpdir(), "needo-customer-avatars-test");
process.env.CONTENT_MEDIA_STORAGE_DIR = join(tmpdir(), "needo-content-media-test");
process.env.CONTENT_PUBLICATION_INTERVAL_MS = "60000";
process.env.CONTENT_PUBLICATION_BATCH_SIZE = "50";
process.env.CONTENT_PUBLICATION_MAX_ACTIVATION_ATTEMPTS = "3";
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
