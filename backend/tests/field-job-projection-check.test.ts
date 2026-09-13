import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertSafeFieldJobProjectionEnvironment } from "../scripts/check-field-job-projection";

describe("field-job projection local formal-data checker", () => {
  it("accepts an explicitly local development database", () => {
    expect(() =>
      assertSafeFieldJobProjectionEnvironment({
        NODE_ENV: "development",
        DEPLOY_ENV: "local",
        DATABASE_URL: "mysql://user:password@127.0.0.1:3307/needo_dev"
      })
    ).not.toThrow();
  });

  it("rejects remote, staging, production, and unsafe database names", () => {
    expect(() =>
      assertSafeFieldJobProjectionEnvironment({
        NODE_ENV: "development",
        DATABASE_URL: "mysql://user:password@db.example.com:3306/needo_dev"
      })
    ).toThrow(/local MySQL host/);
    expect(() =>
      assertSafeFieldJobProjectionEnvironment({
        DEPLOY_ENV: "staging",
        DATABASE_URL: "mysql://user:password@127.0.0.1:3307/needo_dev"
      })
    ).toThrow(/staging or production/);
    expect(() =>
      assertSafeFieldJobProjectionEnvironment({
        NODE_ENV: "development",
        DATABASE_URL: "mysql://user:password@127.0.0.1:3307/needo"
      })
    ).toThrow(/development or test database/);
  });

  it("is exposed as the read-only package verification command", () => {
    const packageJson = readFileSync(resolve(process.cwd(), "package.json"), "utf8");
    expect(packageJson).toContain(
      '"check:field-job-projection": "ENV_FILE=.env.dev node --import tsx scripts/check-field-job-projection.ts"'
    );
  });
});
