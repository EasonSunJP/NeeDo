import { describe, expect, it } from "@jest/globals";
import { requireDashboardIntegrationDatabaseUrl } from "./dashboard-integration-safety";

describe("dashboard MySQL integration safety", () => {
  it.each([
    "mysql://needo:secret@127.0.0.1:3307/needo_test",
    "mysql://needo:secret@localhost:3307/needo_test",
    "mysql://needo:secret@[::1]:3307/needo_test"
  ])("accepts only an explicit loopback needo_test URL: %s", (databaseUrl) => {
    expect(
      requireDashboardIntegrationDatabaseUrl({ databaseUrl, envFile: "/tmp/dashboard.env" })
    ).toBe(databaseUrl);
  });

  it("rejects an inherited DATABASE_URL without ENV_FILE", () => {
    expect(() =>
      requireDashboardIntegrationDatabaseUrl({
        databaseUrl: "mysql://needo:secret@127.0.0.1:3307/needo_test"
      })
    ).toThrow("inherited DATABASE_URL values are forbidden");
  });

  it.each([
    "mysql://needo:secret@db.internal:3306/needo_test",
    "mysql://needo:secret@127.0.0.1:3307/needo_dev",
    "mysql://needo:secret@127.0.0.1:3307/needo_production",
    "postgresql://needo:secret@127.0.0.1:5432/needo_test",
    "not-a-url"
  ])("rejects unsafe database URL %s", (databaseUrl) => {
    expect(() =>
      requireDashboardIntegrationDatabaseUrl({ databaseUrl, envFile: "/tmp/dashboard.env" })
    ).toThrow("explicit loopback needo_test database");
  });
});
