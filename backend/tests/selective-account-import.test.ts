import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import {
  importSelectiveAccounts,
  collisionQueryFor,
  parseSelectiveAccountImportConfig,
  type SelectiveAccountImportPort
} from "../src/staging/selective-account-import";
import {
  createStagingImportConnectionConfig,
  parseSelectiveAccountImportCliArgs,
  runSelectiveAccountImportCli
} from "../src/staging/selective-account-import.cli";
import { ACCOUNT_SYNC_TABLES, collectionDigest, type SelectiveAccountSyncBundle } from "../src/staging/selective-account-sync-contract";

type Row = { id: number; [key: string]: unknown };

const administrator = { id: 900, email: "admin@example.test", is_test_account: false, is_active: true };
const requiredRoles = [{ id: 7, code: "admin", deleted_at: null }];
const verificationKey = "b".repeat(64);

const validBundle = (): SelectiveAccountSyncBundle => {
  const users = Array.from({ length: 261 }, (_, index) => ({
    sourceId: index + 1,
    values: { email: `sync-${index + 1}@example.test`, needo_id: `N${index + 1}`, is_test_account: 1, session_generation: 0 }
  }));
  const userRoles = [{ sourceId: 1, values: { user_id: 1, role_code: "admin", scope_type: "global", scope_id: null } }];
  const tables = Object.fromEntries(ACCOUNT_SYNC_TABLES.map((table) => [table, table === "users" ? users : table === "user_roles" ? userRoles : []])) as unknown as SelectiveAccountSyncBundle["tables"];
  const counts = Object.fromEntries(ACCOUNT_SYNC_TABLES.map((table) => [table, tables[table].length])) as SelectiveAccountSyncBundle["counts"];
  const digests = Object.fromEntries(ACCOUNT_SYNC_TABLES.map((table) => [table, collectionDigest(verificationKey, tables[table])])) as SelectiveAccountSyncBundle["digests"];
  return { formatVersion: 1, sourceDatabase: "needo_dev", sourceMigrationCount: 1, sourceLatestMigration: "baseline", exportedAt: "2026-09-05T00:00:00.000Z", verificationKey, tables, counts, digests };
};

// Test-local transaction harness: commit replaces the committed snapshot; rollback discards it.
const createImportHarness = (state: {
  existingUsers?: Row[];
  roles?: Row[];
  occupiedUniqueValues?: Record<string, unknown[]>;
  failAfterTable?: string;
} = {}): SelectiveAccountImportPort & { committedRows: (table: string) => Row[]; occupiedCalls: Array<{ field: string; values: readonly unknown[] }> } => {
  let committed: { users: Row[]; rows: Record<string, Row[]> } = { users: state.existingUsers ?? [administrator], rows: {} };
  let working = committed;
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const occupiedCalls: Array<{ field: string; values: readonly unknown[] }> = [];
  return {
    nodeEnv: "production", deployEnv: "staging", databaseUrl: "mysql://user:password@mysql:3306/needo_staging", adminDefaultEmail: "admin@example.test",
    acquireLock: async () => true, releaseLock: async () => undefined,
    begin: async () => { working = copy(committed); },
    commit: async () => { committed = working; }, rollback: async () => { working = committed; },
    baseline: async () => ({ users: working.users, roles: state.roles ?? requiredRoles, migrations: [{ migration_name: "baseline" }], activePlatformIdentities: 1, administratorRoleCount: 1 }),
    occupied: async (field, values) => { occupiedCalls.push({ field, values }); return state.occupiedUniqueValues?.[field] ?? []; },
    insert: async (table, values) => {
      const rows = working.rows[table] ?? []; const row = { id: rows.length + 1000, ...values }; rows.push(row); working.rows[table] = rows;
      if (table === "users") working.users.push(row);
      if (state.failAfterTable === table) throw new Error("ACCOUNT_SYNC_TRANSACTION_ROLLED_BACK");
      return row.id;
    },
    updateAdministrator: async () => { working.users[0] = { ...working.users[0], is_test_account: true }; },
    verifyPostconditions: async ({ bundle, maps, administratorId }) => {
      const users = working.users.filter((user) => user.deleted_at === null || user.deleted_at === undefined);
      expect(maps.users.get(1)).not.toBe(1);
      expect(users.find((user) => user.id === administratorId)?.is_test_account).toBe(true);
      expect(working.rows.user_roles?.[0]?.user_id).toBe(maps.users.get(1));
      expect(bundle.counts.users).toBe(261);
      return {
        userCount: users.length,
        nonTestUserCount: users.filter((user) => user.is_test_account !== true && user.is_test_account !== 1).length,
        administratorCount: users.filter((user) => user.id === administratorId).length
      };
    },
    committedRows: (table) => table === "users" ? committed.users : committed.rows[table] ?? [],
    occupiedCalls
  };
};

describe("selective staging account importer", () => {
  it("enforces staging-only target guard", () => {
    expect(() => parseSelectiveAccountImportConfig({ NODE_ENV: "development", DEPLOY_ENV: "staging", DATABASE_URL: "mysql://x:y@mysql/needo_staging", ADMIN_DEFAULT_EMAIL: "admin@example.test" })).toThrow("ACCOUNT_SYNC_TARGET_BOUNDARY_REJECTED");
  });

  it("uses only fixed collision queries and passes actual bundle values", async () => {
    expect(() => collisionQueryFor("unknown_field" as never)).toThrow("ACCOUNT_SYNC_COLLISION_FIELD_INVALID");
    for (const query of Object.values(collisionQueryFor.queries)) expect(query).not.toMatch(/\$\{|\+\s*field|FROM\s+\?/u);
    const harness = createImportHarness();
    await importSelectiveAccounts(harness, validBundle());
    expect(harness.occupiedCalls).toContainEqual({ field: "email", values: ["sync-1@example.test", "sync-2@example.test", "sync-3@example.test", ...Array.from({ length: 258 }, (_, index) => `sync-${index + 4}@example.test`)] });
  });

  it("rejects invalid baseline, collisions, missing roles, and rolls back", async () => {
    await expect(importSelectiveAccounts(createImportHarness({ existingUsers: [administrator, { ...administrator, id: 901 }] }), validBundle())).rejects.toThrow("ACCOUNT_SYNC_TARGET_BASELINE_INVALID");
    await expect(importSelectiveAccounts(createImportHarness({ occupiedUniqueValues: { email: ["sync-1@example.test"] } }), validBundle())).rejects.toThrow("ACCOUNT_SYNC_UNIQUE_COLLISION");
    await expect(importSelectiveAccounts(createImportHarness({ roles: [] }), validBundle())).rejects.toThrow("ACCOUNT_SYNC_ROLE_MISSING");
    const failing = createImportHarness({ failAfterTable: "users" });
    await expect(importSelectiveAccounts(failing, validBundle())).rejects.toThrow("ACCOUNT_SYNC_TRANSACTION_ROLLED_BACK");
    expect(failing.committedRows("users")).toEqual([administrator]);
  });

  it("maps source IDs, marks only the administrator, and returns verified target counts", async () => {
    const result = await importSelectiveAccounts(createImportHarness(), validBundle());
    expect(result.userCount).toBe(262);
    expect(result.nonTestUserCount).toBe(0);
    expect(result.administratorCount).toBe(1);
    expect(result.tableCounts.users).toBe(261);
  });

  it("verifies gzip bytes and sha before parsing", () => {
    const archive = gzipSync(Buffer.from(JSON.stringify(validBundle()), "utf8"));
    expect(createHash("sha256").update(archive).digest("hex")).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("creates a staging-only MariaDB CLI connection with date strings and closes it", async () => {
    expect(createStagingImportConnectionConfig("mysql://user:password@mysql:3306/needo_staging"))
      .toEqual(expect.objectContaining({ host: "mysql", port: 3306, database: "needo_staging", dateStrings: true }));
    expect(() => createStagingImportConnectionConfig("mysql://user:password@127.0.0.1:3306/needo_staging"))
      .toThrow("ACCOUNT_SYNC_TARGET_BOUNDARY_REJECTED");
    expect(parseSelectiveAccountImportCliArgs(["--input", "/private/tmp/accounts.json.gz", "--sha256", "a".repeat(64)]))
      .toEqual({ inputPath: "/private/tmp/accounts.json.gz", sha256: "a".repeat(64) });

    const archive = gzipSync(Buffer.from(JSON.stringify(validBundle()), "utf8"));
    let ended = false;
    const connection = {
      beginTransaction: async () => undefined,
      commit: async () => undefined,
      rollback: async () => undefined,
      end: async () => { ended = true; },
      query: async (sql: string) => {
        if (sql.includes("GET_LOCK")) return [{ acquired: 1 }];
        if (sql.includes("RELEASE_LOCK")) return [{ released: 1 }];
        if (sql.includes("FROM users")) return [administrator];
        if (sql.includes("FROM roles")) return requiredRoles;
        if (sql.includes("_prisma_migrations")) return [{ migration_name: "baseline" }];
        if (sql.includes("COUNT")) return [{ count: 0 }];
        if (sql.startsWith("INSERT")) return { insertId: 1000 };
        if (sql.startsWith("UPDATE")) return { affectedRows: 1 };
        return [];
      }
    };
    await expect(runSelectiveAccountImportCli({
      args: ["--input", "/private/tmp/accounts.json.gz", "--sha256", createHash("sha256").update(archive).digest("hex")],
      env: { NODE_ENV: "production", DEPLOY_ENV: "staging", DATABASE_URL: "mysql://user:password@mysql:3306/needo_staging", ADMIN_DEFAULT_EMAIL: "admin@example.test" },
      readFile: async () => archive,
      createConnection: async () => connection as never,
      writeOutput: () => undefined
    })).rejects.toThrow("ACCOUNT_SYNC_TARGET_BASELINE_INVALID");
    expect(ended).toBe(true);
  });
});
