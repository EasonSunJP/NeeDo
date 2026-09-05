import { describe, expect, it, jest } from "@jest/globals";
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";
import {
  createExchangeCancellationScratchTarget,
  validateExchangeCancellationBaseEnvironment,
  runExchangeCancellationScratchCheck,
  requireExchangeCancellationScratchEnvironment
} from "../scripts/check-exchange-cancellation-flow";

describe("Exchange cancellation isolated flow checker", () => {
  it.each([false, true])(
    "uses a dedicated scratch principal and cleans up even when checks fail: %s",
    async (fail) => {
      const statements: string[] = [];
      const connection = {
        query: jest.fn(async (sql: string) => {
          statements.push(sql);
          return [{ total: 0 }];
        }),
        escape: (value: string) => `'${value}'`
      };
      const base = validateExchangeCancellationBaseEnvironment({
        envFile: "/tmp/needo.env",
        fileExists: () => true,
        parsedEnvironment: {
          NODE_ENV: "test",
          DEPLOY_ENV: "local",
          DATABASE_URL: "mysql://existing:existing-secret@127.0.0.1:3307/needo_dev",
          MYSQL_ROOT_PASSWORD: "admin-secret"
        }
      });
      let scratchFile = "";
      const checks = jest.fn(async (environment: NodeJS.ProcessEnv) => {
        scratchFile = environment.ENV_FILE!;
        const parsed = parse(readFileSync(scratchFile));
        const url = new URL(parsed.DATABASE_URL!);
        expect(url.pathname).toMatch(/^\/needo_exchange_cancel_[a-f0-9]{24}$/);
        expect(url.username).toMatch(/^neec_[a-f0-9]{24}$/);
        expect(url.password).not.toBe("existing-secret");
        expect(parsed.MYSQL_ROOT_PASSWORD).toBeUndefined();
        expect(environment.EXCHANGE_CANCELLATION_MYSQL_ADMIN_PASSWORD).toBeUndefined();
        expect(requireExchangeCancellationScratchEnvironment(scratchFile).databaseName).toBe(
          url.pathname.slice(1)
        );
        if (fail) throw new Error("injected check failure");
      });
      const result = runExchangeCancellationScratchCheck(base, connection, checks);
      if (fail) await expect(result).rejects.toThrow("injected check failure");
      else await expect(result).resolves.toMatchObject({ cleanupVerified: true });
      expect(checks).toHaveBeenCalledTimes(1);
      expect(existsSync(scratchFile)).toBe(false);
      expect(statements.some((sql) => sql.startsWith("DROP DATABASE"))).toBe(true);
      expect(statements.some((sql) => sql.startsWith("REVOKE ALL PRIVILEGES"))).toBe(true);
      expect(statements.some((sql) => sql.startsWith("DROP USER"))).toBe(true);
      expect(
        statements
          .filter((sql) => /CREATE DATABASE|DROP DATABASE|GRANT ALL/.test(sql))
          .every((sql) => !sql.includes("`needo_dev`"))
      ).toBe(true);
      expect(statements.some((sql) => sql.includes("TO 'existing'"))).toBe(false);
    }
  );

  it("continues revocation and verification when database removal fails", async () => {
    const statements: string[] = [];
    const base = validateExchangeCancellationBaseEnvironment({
      envFile: "/tmp/needo.env",
      fileExists: () => true,
      parsedEnvironment: {
        NODE_ENV: "test",
        DEPLOY_ENV: "test",
        DATABASE_URL: "mysql://existing:secret@localhost/needo_dev"
      }
    });
    await expect(
      runExchangeCancellationScratchCheck(
        base,
        {
          query: async (sql: string) => {
            statements.push(sql);
            if (sql.startsWith("DROP DATABASE")) throw new Error("drop failed");
            return [{ total: 0 }];
          },
          escape: (value: string) => `'${value}'`
        },
        async () => undefined
      )
    ).rejects.toThrow("scratch cleanup failed");
    expect(statements.some((sql) => sql.startsWith("REVOKE ALL PRIVILEGES"))).toBe(true);
    expect(statements.some((sql) => sql.startsWith("DROP USER"))).toBe(true);
    expect(statements.some((sql) => sql.includes("information_schema.schemata"))).toBe(true);
  });

  it.each([{}, { NODE_ENV: "test" }, { NODE_ENV: "test", DEPLOY_ENV: "unknown" }])(
    "requires explicit non-production environment labels",
    (environment) => {
      expect(() =>
        validateExchangeCancellationBaseEnvironment({
          envFile: "/tmp/needo.env",
          fileExists: () => true,
          parsedEnvironment: {
            ...environment,
            DATABASE_URL: "mysql://needo:secret@127.0.0.1:3307/needo_dev"
          }
        })
      ).toThrow("explicit local non-production");
    }
  );

  it("accepts only an explicit local non-production MySQL base environment", () => {
    expect(() => validateExchangeCancellationBaseEnvironment(undefined)).toThrow(
      "FORMAL_BACKEND_ENV_FILE is required"
    );
    expect(() =>
      validateExchangeCancellationBaseEnvironment({
        envFile: "/tmp/needo.env",
        fileExists: () => false
      })
    ).toThrow("FORMAL_BACKEND_ENV_FILE does not exist");
    expect(() =>
      validateExchangeCancellationBaseEnvironment({
        envFile: "/tmp/needo.env",
        fileExists: () => true,
        parsedEnvironment: {
          NODE_ENV: "production",
          DEPLOY_ENV: "prod",
          DATABASE_URL: "mysql://needo:secret@127.0.0.1:3307/needo_dev"
        }
      })
    ).toThrow("rejects production and staging runtimes");
    expect(() =>
      validateExchangeCancellationBaseEnvironment({
        envFile: "/tmp/needo.env",
        fileExists: () => true,
        parsedEnvironment: {
          NODE_ENV: "test",
          DEPLOY_ENV: "test",
          DATABASE_URL: "mysql://needo:secret@example.com:3307/needo_dev"
        }
      })
    ).toThrow("only accepts loopback MySQL");
  });

  it("derives a namespaced scratch database and dedicated principal without changing the base database", () => {
    const target = createExchangeCancellationScratchTarget(
      "mysql://needo:secret@127.0.0.1:3307/needo_dev?connection_limit=5",
      "0123456789abcdef01234567",
      "scratch-secret"
    );

    expect(target.databaseName).toBe("needo_exchange_cancel_0123456789abcdef01234567");
    expect(target.databaseUrl).toBe(
      "mysql://neec_0123456789abcdef01234567:scratch-secret@127.0.0.1:3307/needo_exchange_cancel_0123456789abcdef01234567?connection_limit=5"
    );
    expect(target.username).toBe("neec_0123456789abcdef01234567");
    expect(target.baseDatabaseName).toBe("needo_dev");
  });

  it("rejects malformed scratch suffixes", () => {
    expect(() =>
      createExchangeCancellationScratchTarget(
        "mysql://needo:secret@127.0.0.1:3307/needo_dev",
        "../unsafe"
      )
    ).toThrow("scratch suffix");
  });
});
