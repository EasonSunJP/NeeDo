import { assertSafeAffiliateCompletionDatabase } from "../scripts/lib/assert-safe-affiliate-completion-database";

const safeEnvironment = {
  NODE_ENV: "test",
  DEPLOY_ENV: "local",
  DATABASE_URL: "mysql://needo:needo@127.0.0.1:3306/needo_test"
};

describe("affiliate completion MySQL acceptance safety", () => {
  it.each(["staging", "prod", "production", " Production "])("rejects NODE_ENV=%s", (value) => {
    expect(() =>
      assertSafeAffiliateCompletionDatabase({ ...safeEnvironment, NODE_ENV: value })
    ).toThrow("completion check rejects staging and production node environments");
  });

  it.each(["staging", "prod", "production", " STAGING "])("rejects DEPLOY_ENV=%s", (value) => {
    expect(() =>
      assertSafeAffiliateCompletionDatabase({ ...safeEnvironment, DEPLOY_ENV: value })
    ).toThrow("completion check rejects staging and production deploy environments");
  });

  it("rejects non-local database hosts", () => {
    expect(() =>
      assertSafeAffiliateCompletionDatabase({
        ...safeEnvironment,
        DATABASE_URL: "mysql://needo:needo@db.internal:3306/needo_test"
      })
    ).toThrow("completion check only accepts a local MySQL host");
  });

  it.each(["needo_prod", "needo-production", "staging_needo"])(
    "rejects production-looking database name %s",
    (databaseName) => {
      expect(() =>
        assertSafeAffiliateCompletionDatabase({
          ...safeEnvironment,
          DATABASE_URL: `mysql://needo:needo@127.0.0.1:3306/${databaseName}`
        })
      ).toThrow("completion check rejects production-looking database names");
    }
  );

  it("accepts the explicit local test database", () => {
    expect(assertSafeAffiliateCompletionDatabase(safeEnvironment)).toBe("needo_test");
  });
});
