import { getDatabaseConfig } from "../src/config/database";

describe("database config", () => {
  it("uses MySQL with UTF8MB4 defaults and environment-provided url", () => {
    expect(
      getDatabaseConfig({
        DATABASE_URL: "mysql://needo:secret@localhost:3306/needo_test"
      })
    ).toEqual({
      provider: "mysql",
      charset: "utf8mb4",
      collation: "utf8mb4_unicode_ci",
      url: "mysql://needo:secret@localhost:3306/needo_test"
    });
  });
});
