import { createHash } from "node:crypto";
import { readFile, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type { Connection } from "mariadb";
import {
  ACCOUNT_EXPORT_QUERIES,
  buildSelectiveAccountExportSuccessOutput,
  exportSelectiveAccounts,
  parseLocalSourceDatabaseUrl,
  resolveAccountClosure,
  type SelectiveAccountExportPort
} from "../src/staging/selective-account-export";
import {
  parseSelectiveAccountExportCliArgs,
  runSelectiveAccountExportCli
} from "../src/staging/selective-account-export.cli";

const fixtureDirectories = new Set<string>();

afterEach(async () => {
  await Promise.all([...fixtureDirectories].map((directory) => rm(directory, { recursive: true, force: true })));
  fixtureDirectories.clear();
});

describe("selective staging account exporter", () => {
  it("expands only the fixed selected account closure", () => {
    expect(resolveAccountClosure({
      activeUserIds: [1, 2],
      ownedMerchantAccountIds: [20],
      merchantAccountIdentityScopeIds: [21],
      ownedShopIds: [30],
      technicianProfileShopIds: [31],
      shopIdentityScopeIds: [32],
      shopsForSelectedMerchantAccounts: [33],
      shopsForSelectedTechnicianProfiles: [34]
    })).toEqual({
      userIds: [1, 2],
      merchantAccountIds: [20, 21],
      shopIds: [30, 31, 32, 33, 34]
    });
  });

  it("rejects non-loopback or non-needo_dev sources before a query can run", () => {
    for (const value of [
      "mysql://user:password@db.example.test:3306/needo_dev",
      "mysql://user:password@127.0.0.1:3306/needo_prod",
      "postgres://user:password@127.0.0.1:5432/needo_dev"
    ]) {
      expect(() => parseLocalSourceDatabaseUrl(value)).toThrow("ACCOUNT_SYNC_SOURCE_BOUNDARY_REJECTED");
    }
    expect(parseLocalSourceDatabaseUrl("mysql://user:password@localhost:3306/needo_dev").hostname)
      .toBe("localhost");
    expect(parseLocalSourceDatabaseUrl("mysql://user:password@[::1]:3306/needo_dev").hostname)
      .toBe("[::1]");
  });

  it("accepts exactly one absolute CLI output path", () => {
    expect(parseSelectiveAccountExportCliArgs(["--output", "/private/tmp/account-bundle.json.gz"]))
      .toBe("/private/tmp/account-bundle.json.gz");
    for (const args of [[], ["--output"], ["--output", "relative.json.gz"], ["--output", "/tmp/a", "extra"]]) {
      expect(() => parseSelectiveAccountExportCliArgs(args)).toThrow("ACCOUNT_SYNC_CLI_ARGUMENT_INVALID");
    }
  });

  it("creates its local MariaDB connection with date strings enabled", async () => {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), "needo-selective-account-export-"));
    fixtureDirectories.add(outputDirectory);
    let connectionInput: unknown;
    const connection = {
      query: async () => [] as Array<Record<string, unknown>>,
      end: async () => undefined
    } as unknown as Connection;

    await runSelectiveAccountExportCli({
      args: ["--output", path.join(outputDirectory, "bundle.json.gz")],
      env: { DEPLOY_ENV: "local", DATABASE_URL: "mysql://user:password@127.0.0.1:3306/needo_dev" },
      createConnection: async (input) => {
        connectionInput = input;
        return connection;
      },
      writeOutput: () => undefined
    });

    expect(connectionInput).toEqual(expect.objectContaining({ dateStrings: true }));
  });

  it("uses fixed allowlisted queries that exclude deleted graph rows", () => {
    expect(Object.keys(ACCOUNT_EXPORT_QUERIES).sort()).toEqual([
      "activeUsers",
      "customer_profiles",
      "merchantAccountIdentityScopes",
      "merchantAccounts",
      "merchant_accounts",
      "merchant_identity_profiles",
      "merchant_shop_memberships",
      "migrations",
      "ownedShops",
      "public_identifiers",
      "shopIdentityScopes",
      "shops",
      "shopsForSelectedMerchantAccounts",
      "shopsForSelectedTechnicianProfiles",
      "technicianProfileShops",
      "technician_profiles",
      "technician_shop_affiliations",
      "user_identities",
      "user_roles",
      "users"
    ]);
    for (const [name, query] of Object.entries(ACCOUNT_EXPORT_QUERIES)) {
      if (name !== "migrations") expect(query).toContain("deleted_at IS NULL");
      expect(query).not.toMatch(/\$\{|\+\s*table|FROM\s+\?/u);
    }
    expect(ACCOUNT_EXPORT_QUERIES.technician_shop_affiliations)
      .toContain("technician_profile_id IN (?) AND shop_id IN (?)");
    expect(ACCOUNT_EXPORT_QUERIES.migrations).toContain("migration_name, checksum");
    expect(ACCOUNT_EXPORT_QUERIES.migrations).toContain("rolled_back_at IS NULL");
  });

  it("rejects a role scope that is not part of the final exported graph", async () => {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), "needo-selective-account-export-"));
    fixtureDirectories.add(outputDirectory);
    const rowsByQuery = new Map<string, Array<Record<string, unknown>>>([
      [ACCOUNT_EXPORT_QUERIES.activeUsers, [{ id: 1 }]],
      [ACCOUNT_EXPORT_QUERIES.merchantAccounts, [{ id: 20 }]],
      [ACCOUNT_EXPORT_QUERIES.merchant_accounts, []],
      [ACCOUNT_EXPORT_QUERIES.users, [{ id: 1, is_test_account: 1, session_generation: 0 }]],
      [ACCOUNT_EXPORT_QUERIES.user_roles, [{ id: 2, user_id: 1, role_id: 99, role_code: "merchant_owner", scope_type: "merchant", scope_id: 20 }]],
      [ACCOUNT_EXPORT_QUERIES.migrations, []]
    ]);
    const port: SelectiveAccountExportPort = {
      deployEnv: "local",
      outputPath: path.join(outputDirectory, "bundle.json.gz"),
      sourceDatabaseUrl: "mysql://user:password@127.0.0.1:3306/needo_dev",
      query: async (query) => rowsByQuery.get(query) ?? []
    };

    await expect(exportSelectiveAccounts(port, new Date("2026-09-05T00:00:00.000Z")))
      .rejects.toThrow("ACCOUNT_SYNC_REFERENCE_ROLE_SCOPE_INVALID");
  });

  it("rejects the unsupported merchant-account role scope alias", async () => {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), "needo-selective-account-export-"));
    fixtureDirectories.add(outputDirectory);
    const rowsByQuery = new Map<string, Array<Record<string, unknown>>>([
      [ACCOUNT_EXPORT_QUERIES.activeUsers, [{ id: 1 }]],
      [ACCOUNT_EXPORT_QUERIES.merchantAccounts, [{ id: 20 }]],
      [ACCOUNT_EXPORT_QUERIES.merchant_accounts, [{ id: 20, owner_user_id: 1 }]],
      [ACCOUNT_EXPORT_QUERIES.users, [{ id: 1, is_test_account: 1, session_generation: 0 }]],
      [ACCOUNT_EXPORT_QUERIES.user_roles, [{ id: 2, user_id: 1, role_id: 99, role_code: "merchant_owner", scope_type: "merchant-account", scope_id: 20 }]],
      [ACCOUNT_EXPORT_QUERIES.migrations, []]
    ]);
    const port: SelectiveAccountExportPort = {
      deployEnv: "local",
      outputPath: path.join(outputDirectory, "bundle.json.gz"),
      sourceDatabaseUrl: "mysql://user:password@127.0.0.1:3306/needo_dev",
      query: async (query) => rowsByQuery.get(query) ?? []
    };

    await expect(exportSelectiveAccounts(port, new Date("2026-09-05T00:00:00.000Z")))
      .rejects.toThrow("ACCOUNT_SYNC_REFERENCE_ROLE_SCOPE_INVALID");
  });

  it("rejects the unsupported merchantAccount role scope alias", async () => {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), "needo-selective-account-export-"));
    fixtureDirectories.add(outputDirectory);
    const rowsByQuery = new Map<string, Array<Record<string, unknown>>>([
      [ACCOUNT_EXPORT_QUERIES.activeUsers, [{ id: 1 }]],
      [ACCOUNT_EXPORT_QUERIES.merchantAccounts, [{ id: 20 }]],
      [ACCOUNT_EXPORT_QUERIES.merchant_accounts, [{ id: 20, owner_user_id: 1 }]],
      [ACCOUNT_EXPORT_QUERIES.users, [{ id: 1, is_test_account: 1, session_generation: 0 }]],
      [ACCOUNT_EXPORT_QUERIES.user_roles, [{ id: 2, user_id: 1, role_id: 99, role_code: "merchant_owner", scope_type: "merchantAccount", scope_id: 20 }]],
      [ACCOUNT_EXPORT_QUERIES.migrations, []]
    ]);
    const port: SelectiveAccountExportPort = {
      deployEnv: "local",
      outputPath: path.join(outputDirectory, "bundle.json.gz"),
      sourceDatabaseUrl: "mysql://user:password@127.0.0.1:3306/needo_dev",
      query: async (query) => rowsByQuery.get(query) ?? []
    };

    await expect(exportSelectiveAccounts(port, new Date("2026-09-05T00:00:00.000Z")))
      .rejects.toThrow("ACCOUNT_SYNC_REFERENCE_ROLE_SCOPE_INVALID");
  });

  it("rejects a candidate shop missing from the final exported rows", async () => {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), "needo-selective-account-export-"));
    fixtureDirectories.add(outputDirectory);
    const rowsByQuery = new Map<string, Array<Record<string, unknown>>>([
      [ACCOUNT_EXPORT_QUERIES.activeUsers, [{ id: 1 }]],
      [ACCOUNT_EXPORT_QUERIES.ownedShops, [{ id: 30 }]],
      [ACCOUNT_EXPORT_QUERIES.users, [{ id: 1, is_test_account: 1, session_generation: 0 }]],
      [ACCOUNT_EXPORT_QUERIES.shops, []],
      [ACCOUNT_EXPORT_QUERIES.technician_profiles, [{ id: 2, user_id: 1, shop_id: 30 }]],
      [ACCOUNT_EXPORT_QUERIES.migrations, []]
    ]);
    const port: SelectiveAccountExportPort = {
      deployEnv: "local",
      outputPath: path.join(outputDirectory, "bundle.json.gz"),
      sourceDatabaseUrl: "mysql://user:password@127.0.0.1:3306/needo_dev",
      query: async (query) => rowsByQuery.get(query) ?? []
    };

    await expect(exportSelectiveAccounts(port, new Date("2026-09-05T00:00:00.000Z")))
      .rejects.toThrow("ACCOUNT_SYNC_REFERENCE_SHOP_INVALID");
  });

  it("rejects an archive whose final on-disk bytes differ after writing", async () => {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), "needo-selective-account-export-"));
    fixtureDirectories.add(outputDirectory);
    const port = {
      deployEnv: "local",
      outputPath: path.join(outputDirectory, "bundle.json.gz"),
      sourceDatabaseUrl: "mysql://user:password@127.0.0.1:3306/needo_dev",
      query: async () => [] as Array<Record<string, unknown>>,
      readArchive: async () => Buffer.from("tampered", "utf8")
    } as SelectiveAccountExportPort & { readArchive: (outputPath: string) => Promise<Buffer> };

    await expect(exportSelectiveAccounts(port, new Date("2026-09-05T00:00:00.000Z")))
      .rejects.toThrow("ACCOUNT_SYNC_ARCHIVE_VERIFICATION_INVALID");
  });

  it("maps only active account rows, resets sessions, and writes a deterministic private archive", async () => {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), "needo-selective-account-export-"));
    fixtureDirectories.add(outputDirectory);
    const outputPath = path.join(outputDirectory, "bundle.json.gz");
    const rowsByQuery = new Map<string, Array<Record<string, unknown>>>([
      [ACCOUNT_EXPORT_QUERIES.activeUsers, [{ id: 1 }]],
      [ACCOUNT_EXPORT_QUERIES.merchantAccounts, []],
      [ACCOUNT_EXPORT_QUERIES.merchantAccountIdentityScopes, []],
      [ACCOUNT_EXPORT_QUERIES.ownedShops, []],
      [ACCOUNT_EXPORT_QUERIES.technicianProfileShops, []],
      [ACCOUNT_EXPORT_QUERIES.shopIdentityScopes, []],
      [ACCOUNT_EXPORT_QUERIES.shopsForSelectedMerchantAccounts, []],
      [ACCOUNT_EXPORT_QUERIES.shopsForSelectedTechnicianProfiles, []],
      [ACCOUNT_EXPORT_QUERIES.users, [{
        id: 1,
        email: "fixture-account@example.test",
        phone: "+819012345678",
        password_hash: "fixture-password-hash",
        profile_text: "fixture private profile",
        is_test_account: 0,
        session_generation: 44,
        deleted_at: null
      }]],
      [ACCOUNT_EXPORT_QUERIES.customer_profiles, [{ id: 2, user_id: 1, membership_granted_by_id: 99, deleted_at: null }]],
      [ACCOUNT_EXPORT_QUERIES.technician_profiles, []],
      [ACCOUNT_EXPORT_QUERIES.user_identities, []],
      [ACCOUNT_EXPORT_QUERIES.merchant_identity_profiles, []],
      [ACCOUNT_EXPORT_QUERIES.user_roles, []],
      [ACCOUNT_EXPORT_QUERIES.merchant_shop_memberships, []],
      [ACCOUNT_EXPORT_QUERIES.technician_shop_affiliations, []],
      [ACCOUNT_EXPORT_QUERIES.shops, []],
      [ACCOUNT_EXPORT_QUERIES.public_identifiers, []],
      [ACCOUNT_EXPORT_QUERIES.migrations, [{ migration_name: "20260903170000_order_review_shop_summary", checksum: "a".repeat(64) }]]
    ]);
    const port: SelectiveAccountExportPort = {
      deployEnv: "local",
      outputPath,
      sourceDatabaseUrl: "mysql://user:password@127.0.0.1:3306/needo_dev",
      query: async (query) => rowsByQuery.get(query) ?? []
    };

    const summary = await exportSelectiveAccounts(port, new Date("2026-09-05T00:00:00.000Z"));
    const archive = await readFile(outputPath);
    const decoded = JSON.parse(gunzipSync(archive).toString("utf8")) as {
      tables: {
        users: Array<{ sourceId: number; values: Record<string, unknown> }>;
        customer_profiles: Array<{ sourceId: number; values: Record<string, unknown> }>;
      };
    };

    expect((await stat(outputPath)).mode & 0o777).toBe(0o600);
    expect(createHash("sha256").update(archive).digest("hex")).toBe(summary.archiveSha256);
    expect(summary.counts.users).toBe(1);
    expect(decoded.tables.users).toEqual([
      expect.objectContaining({
        sourceId: 1,
        values: expect.objectContaining({ is_test_account: 1, session_generation: 0 })
      })
    ]);
    expect(decoded.tables.customer_profiles[0]?.values.membership_granted_by_id).toBeNull();
    const stdout = buildSelectiveAccountExportSuccessOutput(summary);
    for (const forbidden of ["fixture-account@example.test", "+819012345678", "fixture-password-hash", "fixture private profile"]) {
      expect(stdout).not.toContain(forbidden);
    }
  });
});
