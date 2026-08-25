import { describe, expect, it } from "@jest/globals";
import {
  assertSafeCustomerProfileRepositoryDatabaseUrl,
  requireCustomerProfileRepositoryIntegrationDatabaseUrl
} from "./customer-profile-repository-integration-safety";

describe("customer profile repository integration database safety", () => {
  it.each([
    "mysql://needo:secret@127.0.0.1:3307/needo_dev",
    "mysql://needo:secret@localhost:3307/needo_test",
    "mysql://needo:secret@[::1]:3307/needo_test"
  ])("accepts the explicit local database whitelist: %s", (databaseUrl) => {
    expect(assertSafeCustomerProfileRepositoryDatabaseUrl(databaseUrl)).toBe(databaseUrl);
  });

  it.each([
    ["a remote host", "mysql://needo:secret@db.internal:3306/needo_test"],
    ["a production-looking database", "mysql://needo:secret@127.0.0.1:3307/needo_production"],
    ["an unlisted local database", "mysql://needo:secret@127.0.0.1:3307/customer_data"],
    ["a non-MySQL protocol", "postgresql://needo:secret@127.0.0.1:5432/needo_test"],
    ["an invalid URL", "not-a-url"]
  ])("rejects %s", (_label, databaseUrl) => {
    expect(() => assertSafeCustomerProfileRepositoryDatabaseUrl(databaseUrl)).toThrow(
      "Customer profile repository integration tests require an explicitly allowed local database"
    );
  });

  it("requires an explicit environment file instead of inheriting DATABASE_URL", () => {
    expect(() =>
      requireCustomerProfileRepositoryIntegrationDatabaseUrl({
        databaseUrl: "mysql://needo:secret@127.0.0.1:3307/needo_dev"
      })
    ).toThrow("Customer profile repository integration tests require ENV_FILE");
  });

  it("requires DATABASE_URL to come from the loaded environment file", () => {
    expect(() =>
      requireCustomerProfileRepositoryIntegrationDatabaseUrl({ envFile: ".env.dev" })
    ).toThrow("The integration ENV_FILE must define DATABASE_URL");
  });
});
