import { createMariaDbPoolConfig, getDatabaseConfig } from "../src/config/database";

describe("database config", () => {
  it("uses MySQL with UTF8MB4 defaults and environment-provided url", () => {
    expect(
      getDatabaseConfig({
        DATABASE_URL: "mysql://needo:secret@localhost:3306/needo_test",
        DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL: false,
        DATABASE_POOL_CONNECTION_LIMIT: 12,
        DATABASE_POOL_ACQUIRE_TIMEOUT_MS: 10000,
        DATABASE_POOL_IDLE_TIMEOUT_MS: 30000,
        DATABASE_POOL_CONNECT_TIMEOUT_MS: 5000
      })
    ).toEqual({
      provider: "mysql",
      charset: "utf8mb4",
      collation: "utf8mb4_unicode_ci",
      url: "mysql://needo:secret@localhost:3306/needo_test",
      pool: {
        acquireTimeoutMs: 10000,
        connectTimeoutMs: 5000,
        connectionLimit: 12,
        idleTimeoutMs: 30000
      }
    });
  });

  it("passes MySQL 8 RSA public-key retrieval through to the MariaDB adapter", () => {
    expect(
      createMariaDbPoolConfig({
        DATABASE_URL: "mysql://needo:secret@localhost:3306/needo_test",
        DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL: true,
        DATABASE_POOL_CONNECTION_LIMIT: 12,
        DATABASE_POOL_ACQUIRE_TIMEOUT_MS: 10000,
        DATABASE_POOL_IDLE_TIMEOUT_MS: 30000,
        DATABASE_POOL_CONNECT_TIMEOUT_MS: 5000
      })
    ).toMatchObject({
      allowPublicKeyRetrieval: true,
      charset: "utf8mb4",
      collation: "utf8mb4_unicode_ci",
      connectionLimit: 12
    });
  });
});
