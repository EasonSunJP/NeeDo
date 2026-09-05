import { describe, expect, it, jest } from "@jest/globals";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "dotenv";
import childProcess from "node:child_process";
import {
  createExchangeCancellationScratchTarget,
  validateExchangeCancellationBaseEnvironment,
  runExchangeCancellationScratchCheck,
  requireExchangeCancellationScratchEnvironment,
  resolveExchangeCancellationAdminCredentials,
  verifyExchangeCancellationSocketAdmin,
  runExchangeCancellationCommand
} from "../scripts/check-exchange-cancellation-flow";

describe("Exchange cancellation isolated flow checker", () => {
  it("requires root@localhost identity on the explicit socket connection", async () => {
    const query = jest.fn(async () => [{ principal: "root@localhost" }]);
    await expect(verifyExchangeCancellationSocketAdmin({ query })).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith("SELECT CURRENT_USER() AS principal");
    await expect(
      verifyExchangeCancellationSocketAdmin({
        query: async () => [{ principal: "other@localhost" }]
      })
    ).rejects.toThrow("root@localhost");
  });

  it.each(["production", "mismatched-principal"])(
    "rejects a scratch-looking environment with %s",
    async (problem) => {
      const directory = await mkdtemp(join(tmpdir(), "exchange-safety-test-"));
      const path = join(directory, "test.env");
      const databaseSuffix = "a".repeat(24);
      const userSuffix = problem === "mismatched-principal" ? "b".repeat(24) : databaseSuffix;
      try {
        await writeFile(
          path,
          `NODE_ENV=${problem === "production" ? "production" : "test"}\nDEPLOY_ENV=test\nDATABASE_URL=mysql://neec_${userSuffix}:secret@localhost/needo_exchange_cancel_${databaseSuffix}\n`,
          { mode: 0o600 }
        );
        expect(() => requireExchangeCancellationScratchEnvironment(path)).toThrow();
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  );

  it("requires an explicit administrator and supports the source MYSQL_ROOT_PASSWORD", () => {
    expect(() => resolveExchangeCancellationAdminCredentials({}, {})).toThrow(
      "Explicit MySQL administrator credentials"
    );
    expect(
      resolveExchangeCancellationAdminCredentials({ MYSQL_ROOT_PASSWORD: "source-secret" }, {})
    ).toEqual({ user: "root", password: "source-secret" });
    expect(
      resolveExchangeCancellationAdminCredentials(
        {},
        {
          EXCHANGE_CANCELLATION_MYSQL_ADMIN_USER: "scratch-admin",
          EXCHANGE_CANCELLATION_MYSQL_ADMIN_PASSWORD: "explicit-secret"
        }
      )
    ).toEqual({ user: "scratch-admin", password: "explicit-secret" });
    expect(() =>
      resolveExchangeCancellationAdminCredentials(
        { MYSQL_ROOT_PASSWORD: "root-secret" },
        { EXCHANGE_CANCELLATION_MYSQL_ADMIN_USER: "someone-else" }
      )
    ).toThrow("Explicit MySQL administrator credentials");
  });

  it("allows passwordless root only on an explicit verified local Unix socket", () => {
    expect(
      resolveExchangeCancellationAdminCredentials(
        { MYSQL_ROOT_PASSWORD: "unused-source-password" },
        {
          EXCHANGE_CANCELLATION_MYSQL_ADMIN_SOCKET_PATH: "/tmp/mysql.sock"
        },
        () => true
      )
    ).toEqual({ user: "root", socketPath: "/tmp/mysql.sock" });
    expect(() =>
      resolveExchangeCancellationAdminCredentials(
        {},
        {
          EXCHANGE_CANCELLATION_MYSQL_ADMIN_SOCKET_PATH: "relative/mysql.sock"
        },
        () => true
      )
    ).toThrow("absolute Unix socket");
    expect(() =>
      resolveExchangeCancellationAdminCredentials(
        {},
        {
          EXCHANGE_CANCELLATION_MYSQL_ADMIN_SOCKET_PATH: "/tmp/not-a-socket"
        },
        () => false
      )
    ).toThrow("absolute Unix socket");
    expect(() =>
      resolveExchangeCancellationAdminCredentials(
        {},
        {
          EXCHANGE_CANCELLATION_MYSQL_ADMIN_USER: "root",
          EXCHANGE_CANCELLATION_MYSQL_ADMIN_PASSWORD: ""
        }
      )
    ).toThrow("Explicit MySQL administrator credentials");
  });

  it("captures and sanitizes child diagnostics before emitting them", () => {
    const spawn = jest.spyOn(childProcess, "spawnSync").mockReturnValue({
      pid: 1,
      status: 1,
      signal: null,
      output: [],
      stdout: "mysql://scratch:encoded%21secret@localhost/scratch encoded!secret",
      stderr: "admin-secret"
    });
    const write = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      expect(() =>
        runExchangeCancellationCommand("npm", ["run", "prisma:migrate:deploy"], {
          DATABASE_URL: "mysql://scratch:encoded%21secret@localhost/scratch",
          MYSQL_ROOT_PASSWORD: "admin-secret"
        })
      ).toThrow("migration or integration command failed");
      expect(spawn).toHaveBeenCalledWith(
        "npm",
        expect.any(Array),
        expect.objectContaining({ encoding: "utf8", stdio: "pipe" })
      );
      const output = write.mock.calls.map(([value]) => String(value)).join("");
      expect(output).not.toContain("encoded");
      expect(output).not.toContain("admin-secret");
      expect(output).toContain("[redacted]");
    } finally {
      spawn.mockRestore();
      write.mockRestore();
    }
  });

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
          MYSQL_ROOT_PASSWORD: "admin-secret",
          AUTH_ACCESS_TOKEN_SECRET: "source-auth-secret",
          EXCHANGE_CANCELLATION_MYSQL_ADMIN_USER: "admin"
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
        expect(parsed.AUTH_ACCESS_TOKEN_SECRET).toBeUndefined();
        expect(parsed.EXCHANGE_CANCELLATION_MYSQL_ADMIN_USER).toBeUndefined();
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
      expect(statements.find((sql) => sql.startsWith("GRANT ALL"))).toContain(
        "needo\\_exchange\\_cancel\\_"
      );
      expect(statements.some((sql) => sql.includes("FROM mysql.user"))).toBe(true);
      expect(statements.some((sql) => sql.includes("FROM mysql.db"))).toBe(true);
    }
  );

  it.each(["mysql.user", "mysql.db"])(
    "fails cleanup verification when %s retains scratch authority",
    async (remainingTable) => {
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
            query: async (sql) => [{ total: sql.includes(`FROM ${remainingTable}`) ? 1 : 0 }],
            escape: (value) => `'${value}'`
          },
          async () => undefined
        )
      ).rejects.toThrow("scratch cleanup failed");
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
