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
  const users = Array.from({ length: 251 }, (_, index) => ({
    sourceId: index + 1,
    values: { email: `sync-${index + 1}@example.test`, needo_id: `N${index + 1}`, is_test_account: 1, session_generation: 0 }
  }));
  const userRoles = [{ sourceId: 1, values: { user_id: 1, role_code: "admin", scope_type: "global", scope_id: null } }];
  const tables = Object.fromEntries(ACCOUNT_SYNC_TABLES.map((table) => [table, table === "users" ? users : table === "user_roles" ? userRoles : []])) as unknown as SelectiveAccountSyncBundle["tables"];
  const counts = Object.fromEntries(ACCOUNT_SYNC_TABLES.map((table) => [table, tables[table].length])) as SelectiveAccountSyncBundle["counts"];
  const digests = Object.fromEntries(ACCOUNT_SYNC_TABLES.map((table) => [table, collectionDigest(verificationKey, tables[table])])) as SelectiveAccountSyncBundle["digests"];
  return { formatVersion: 2, sourceDatabase: "needo_dev", sourceMigrationCount: 1, sourceLatestMigration: "baseline", sourceMigrations: [{ migration_name: "baseline", checksum: "a".repeat(64) }], exportedAt: "2026-09-05T00:00:00.000Z", verificationKey, tables, counts, digests };
};

const refreshBundleIntegrity = (bundle: SelectiveAccountSyncBundle): SelectiveAccountSyncBundle => {
  for (const table of ACCOUNT_SYNC_TABLES) {
    bundle.counts[table] = bundle.tables[table].length;
    bundle.digests[table] = collectionDigest(verificationKey, bundle.tables[table]);
  }
  return bundle;
};

const fullGraphBundle = (): SelectiveAccountSyncBundle => {
  const bundle = validBundle();
  const timestamp = "2026-09-05 00:00:00";
  for (const user of bundle.tables.users) user.values = { needo_id: String(user.values.needo_id), account_no: null, primary_identity_type: null, email: String(user.values.email), phone: null, email_verified_at: null, password_hash: null, username: `user-${user.sourceId}`, avatar_url: null, avatar_bootstrap_url: null, avatar_bootstrapped_at: null, is_active: 1, is_test_account: 1, session_generation: 0, last_login_at: null, created_at: timestamp, updated_at: timestamp, deleted_at: null };
  bundle.tables.shops.push({ sourceId: 1, values: { shop_no: "S000000001", owner_user_id: 1, name: "shop", description: null, city: "Tokyo", address: "address", latitude: null, longitude: null, phone: null, status: "published", is_recommended: 0, pricing_mode: "merchant", technician_pricing_rate_percent: 100, pricing_mode_updated_at: null, pricing_mode_updated_by: 1, created_at: timestamp, updated_at: timestamp, deleted_at: null } });
  bundle.tables.merchant_accounts.push({ sourceId: 1, values: { code: "merchant", owner_no: "M000000001", owner_user_id: 1, settlement_bank_account_id: null, name: "merchant", status: "active", payment_responsibility: "group_consolidated", created_at: timestamp, updated_at: timestamp, deleted_at: null } });
  bundle.tables.customer_profiles.push({ sourceId: 1, values: { user_id: 1, display_name: "customer", bio: null, city: null, membership_level: "standard", membership_grant_mode: "self_service", membership_duration_unit: null, membership_duration_value: null, membership_starts_at: null, membership_expires_at: null, membership_granted_by_id: 1, platform_membership_lock_version: 1, is_public: 1, gender: "private", age: null, height_cm: null, languages: "[\"ja\"]", visibility: "public", created_at: timestamp, updated_at: timestamp, deleted_at: null } });
  bundle.tables.technician_profiles.push({ sourceId: 1, values: { user_id: 1, shop_id: 1, display_name: "tech", bio: null, city: "Tokyo", service_area: null, service_areas: "[\"Tokyo\"]", base_latitude: null, base_longitude: null, gender: "private", age: null, height_cm: null, languages: "[\"ja\"]", profile_tags: null, can_serve_foreigners: 0, bid_budget_min_jpy: null, bid_budget_max_jpy: null, payment_methods: null, visibility: "public", years_experience: 0, employment_type: "INDEPENDENT", employment_started_at: null, status: "published", is_recommended: 0, verified_at: null, created_at: timestamp, updated_at: timestamp, deleted_at: null } });
  bundle.tables.user_identities.push(
    { sourceId: 1, values: { user_id: 1, type: "customer", active_key: "identity-key", scope_type: "customer_profile", scope_id: 1, display_name: null, is_default: 1, is_active: 1, created_at: timestamp, updated_at: timestamp, deleted_at: null } },
    { sourceId: 2, values: { user_id: 1, type: "shop", active_key: "shop-identity-key", scope_type: "shop", scope_id: 1, display_name: null, is_default: 0, is_active: 1, created_at: timestamp, updated_at: timestamp, deleted_at: null } },
    { sourceId: 3, values: { user_id: 1, type: "merchant", active_key: "merchant-identity-key", scope_type: "merchant_account", scope_id: 1, display_name: null, is_default: 0, is_active: 1, created_at: timestamp, updated_at: timestamp, deleted_at: null } },
    { sourceId: 4, values: { user_id: 1, type: "technician", active_key: "tech-identity-key", scope_type: "technician_profile", scope_id: 1, display_name: null, is_default: 0, is_active: 1, created_at: timestamp, updated_at: timestamp, deleted_at: null } },
    { sourceId: 5, values: { user_id: 1, type: "platform", active_key: "platform-identity-key", scope_type: "platform", scope_id: null, display_name: null, is_default: 0, is_active: 1, created_at: timestamp, updated_at: timestamp, deleted_at: null } }
  );
  bundle.tables.merchant_identity_profiles.push({ sourceId: 1, values: { identity_id: 3, user_id: 1, display_name: "merchant identity", gender: "private", age: null, height_cm: null, languages: "[\"ja\"]", bio: null, visibility: "public", created_at: timestamp, updated_at: timestamp, deleted_at: null } });
  bundle.tables.user_roles = [
    { sourceId: 1, values: { user_id: 1, role_code: "admin", scope_type: "merchant_account", scope_id: 1, created_at: timestamp, updated_at: timestamp, deleted_at: null } },
    { sourceId: 2, values: { user_id: 1, role_code: "admin", scope_type: "shop", scope_id: 1, created_at: timestamp, updated_at: timestamp, deleted_at: null } },
    { sourceId: 3, values: { user_id: 1, role_code: "admin", scope_type: "technician_profile", scope_id: 1, created_at: timestamp, updated_at: timestamp, deleted_at: null } },
    { sourceId: 4, values: { user_id: 1, role_code: "admin", scope_type: "customer_profile", scope_id: 1, created_at: timestamp, updated_at: timestamp, deleted_at: null } },
    { sourceId: 5, values: { user_id: 1, role_code: "admin", scope_type: "merchant", scope_id: 1, created_at: timestamp, updated_at: timestamp, deleted_at: null } },
    { sourceId: 6, values: { user_id: 1, role_code: "admin", scope_type: "platform", scope_id: null, created_at: timestamp, updated_at: timestamp, deleted_at: null } }
  ];
  bundle.tables.merchant_shop_memberships.push({ sourceId: 1, values: { merchant_account_id: 1, shop_id: 1, active_key: "membership-key", starts_at: timestamp, ends_at: null, removed_reason: null, created_by_id: 1, removed_by_id: 1, created_at: timestamp, updated_at: timestamp, deleted_at: null } });
  bundle.tables.technician_shop_affiliations.push({ sourceId: 1, values: { technician_profile_id: 1, shop_id: 1, relationship_type: "exclusive", work_status: "active", starts_at: timestamp, ends_at: null, active_key: "affiliation-key", created_by_id: 1, updated_by_id: 1, created_at: timestamp, updated_at: timestamp, deleted_at: null } });
  bundle.tables.public_identifiers.push(
    { sourceId: 1, values: { public_id: "PUBLIC0001", number_part: "0000000001", kind: "u", user_identity_id: 1, shop_id: null, merchant_account_id: null, customer_support_account_id: null, login_allowed: 0, searchable: 0, status: "active", created_at: timestamp, updated_at: timestamp, deleted_at: null } },
    { sourceId: 2, values: { public_id: "PUBLIC0002", number_part: "0000000002", kind: "s", user_identity_id: null, shop_id: 1, merchant_account_id: null, customer_support_account_id: null, login_allowed: 0, searchable: 0, status: "active", created_at: timestamp, updated_at: timestamp, deleted_at: null } },
    { sourceId: 3, values: { public_id: "PUBLIC0003", number_part: "0000000003", kind: "b", user_identity_id: null, shop_id: null, merchant_account_id: 1, customer_support_account_id: null, login_allowed: 0, searchable: 0, status: "active", created_at: timestamp, updated_at: timestamp, deleted_at: null } }
  );
  return refreshBundleIntegrity(bundle);
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
    baseline: async () => ({ users: working.users, roles: state.roles ?? requiredRoles, migrations: [{ migration_name: "baseline", checksum: "a".repeat(64) }], activePlatformIdentities: 1, administratorRoleCount: 1 }),
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
      expect(bundle.counts.users).toBe(251);
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
  it("allows only the approved source-only Exchange migration with all common checksums equal", async () => {
    const common = Array.from({ length: 125 }, (_, index) => ({ migration_name: `20260801_${index}`, checksum: "a".repeat(64) }));
    const extra = { migration_name: "20260903100000_exchange_matched_booking_conversion", checksum: "ecae7c8e14424f4d35def9fa51bffc1ca7292270db54b58d58545c471e7148f2" };
    const bundle = { ...validBundle(), formatVersion: 2, sourceMigrationCount: 126, sourceLatestMigration: extra.migration_name, sourceMigrations: [...common, extra] };
    const harness = createImportHarness();
    const baseline = await harness.baseline();
    harness.baseline = async () => ({ ...baseline, migrations: common });
    await expect(importSelectiveAccounts(harness, bundle)).resolves.toMatchObject({ userCount: 252 });
  });

  it.each(["extra-name", "extra-checksum", "common-checksum", "target-extra", "target-duplicate", "second-missing"])("rejects migration exception drift: %s before any insertion", async (mutation) => {
    const common = Array.from({ length: 125 }, (_, index) => ({ migration_name: `20260801_${index}`, checksum: "a".repeat(64) }));
    const sourceMigrations = [...common.map((row) => ({ ...row })), { migration_name: "20260903100000_exchange_matched_booking_conversion", checksum: "ecae7c8e14424f4d35def9fa51bffc1ca7292270db54b58d58545c471e7148f2" }];
    if (mutation === "extra-name") sourceMigrations[125].migration_name = "different-migration";
    if (mutation === "extra-checksum") sourceMigrations[125].checksum = "b".repeat(64);
    if (mutation === "common-checksum") common[0].checksum = "b".repeat(64);
    if (mutation === "target-extra") common.push({ migration_name: "target-only", checksum: "a".repeat(64) });
    if (mutation === "target-duplicate") common[1] = { ...common[0] };
    if (mutation === "second-missing") common.pop();
    const bundle = { ...validBundle(), sourceMigrationCount: 126, sourceLatestMigration: sourceMigrations[125].migration_name, sourceMigrations };
    const harness = createImportHarness();
    const baseline = await harness.baseline();
    harness.baseline = async () => ({ ...baseline, migrations: common });
    await expect(importSelectiveAccounts(harness, bundle)).rejects.toThrow("ACCOUNT_SYNC_MIGRATION_PARITY_INVALID");
    expect(harness.committedRows("users")).toEqual([administrator]);
    expect(harness.occupiedCalls).toEqual([]);
  });

  it("enforces staging-only target guard", () => {
    expect(() => parseSelectiveAccountImportConfig({ NODE_ENV: "development", DEPLOY_ENV: "staging", DATABASE_URL: "mysql://x:y@mysql/needo_staging", ADMIN_DEFAULT_EMAIL: "admin@example.test" })).toThrow("ACCOUNT_SYNC_TARGET_BOUNDARY_REJECTED");
  });

  it("uses string-safe MariaDB connection decoding for dates and JSON", () => {
    expect(createStagingImportConnectionConfig("mysql://user:password@mysql:3306/needo_staging"))
      .toEqual(expect.objectContaining({ dateStrings: true, jsonStrings: true }));
  });

  it("uses only fixed collision queries and passes actual bundle values", async () => {
    expect(() => collisionQueryFor("unknown_field" as never)).toThrow("ACCOUNT_SYNC_COLLISION_FIELD_INVALID");
    for (const query of Object.values(collisionQueryFor.queries)) {
      expect(query).not.toMatch(/\$\{|\+\s*field|FROM\s+\?/u);
      expect(query).not.toContain("deleted_at");
    }
    const harness = createImportHarness();
    await importSelectiveAccounts(harness, validBundle());
    expect(harness.occupiedCalls).toContainEqual({ field: "email", values: ["sync-1@example.test", "sync-2@example.test", "sync-3@example.test", ...Array.from({ length: 248 }, (_, index) => `sync-${index + 4}@example.test`)] });
  });

  it("separates physical active-key collision collections and allows an absent scope", async () => {
    const bundle = validBundle();
    bundle.tables.user_roles[0].values.scope_type = null;
    bundle.tables.user_roles[0].values.scope_id = null;
    bundle.tables.shops.push({ sourceId: 1, values: { owner_user_id: 1, name: "shop", city: "Tokyo", address: "address" } });
    bundle.tables.merchant_accounts.push({ sourceId: 1, values: { owner_user_id: 1, settlement_bank_account_id: null, code: "merchant", name: "merchant" } });
    bundle.tables.technician_profiles.push({ sourceId: 1, values: { user_id: 1, shop_id: 1, display_name: "tech", city: "Tokyo" } });
    bundle.tables.user_identities.push({ sourceId: 1, values: { user_id: 1, type: "customer", active_key: "identity-key", scope_type: null, scope_id: null, is_default: 1, is_active: 1 } });
    bundle.tables.merchant_shop_memberships.push({ sourceId: 1, values: { merchant_account_id: 1, shop_id: 1, active_key: "membership-key" } });
    bundle.tables.technician_shop_affiliations.push({ sourceId: 1, values: { technician_profile_id: 1, shop_id: 1, active_key: "affiliation-key" } });
    for (const table of ACCOUNT_SYNC_TABLES) {
      bundle.counts[table] = bundle.tables[table].length;
      bundle.digests[table] = collectionDigest(verificationKey, bundle.tables[table]);
    }
    const harness = createImportHarness();
    await expect(importSelectiveAccounts(harness, bundle)).resolves.toMatchObject({ userCount: 252 });
    expect(harness.occupiedCalls).toEqual(expect.arrayContaining([
      { field: "user_identity_active_key" as never, values: ["identity-key"] },
      { field: "merchant_shop_membership_active_key" as never, values: ["membership-key"] },
      { field: "technician_shop_affiliation_active_key" as never, values: ["affiliation-key"] }
    ]));
  });

  it("rejects invalid baseline, collisions, missing roles, and rolls back", async () => {
    await expect(importSelectiveAccounts(createImportHarness({ existingUsers: [administrator, { ...administrator, id: 901 }] }), validBundle())).rejects.toThrow("ACCOUNT_SYNC_TARGET_BASELINE_INVALID");
    await expect(importSelectiveAccounts(createImportHarness({ occupiedUniqueValues: { email: ["sync-1@example.test"] } }), validBundle())).rejects.toThrow("ACCOUNT_SYNC_UNIQUE_COLLISION");
    await expect(importSelectiveAccounts(createImportHarness({ roles: [] }), validBundle())).rejects.toThrow("ACCOUNT_SYNC_ROLE_MISSING");
    const failing = createImportHarness({ failAfterTable: "users" });
    await expect(importSelectiveAccounts(failing, validBundle())).rejects.toThrow("ACCOUNT_SYNC_TRANSACTION_ROLLED_BACK");
    expect(failing.committedRows("users")).toEqual([administrator]);
  });

  it("rejects a merchant settlement-bank reference before any graph insert", async () => {
    const bundle = validBundle();
    bundle.tables.merchant_accounts.push({ sourceId: 1, values: { code: "merchant", name: "merchant", settlement_bank_account_id: 99 } });
    await expect(importSelectiveAccounts(createImportHarness(), refreshBundleIntegrity(bundle))).rejects.toThrow("ACCOUNT_SYNC_BANK_REFERENCE_INVALID");
  });

  it("maps source IDs, marks only the administrator, and returns verified target counts", async () => {
    const result = await importSelectiveAccounts(createImportHarness(), validBundle());
    expect(result.userCount).toBe(252);
    expect(result.nonTestUserCount).toBe(0);
    expect(result.administratorCount).toBe(1);
    expect(result.tableCounts.users).toBe(251);
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
        if (sql.includes("_prisma_migrations")) return [{ migration_name: "baseline", checksum: "a".repeat(64) }];
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

  it("commits a complete eleven-table graph through the MariaDB adapter with JSON-safe keyed digests", async () => {
    const bundle = fullGraphBundle();
    bundle.tables.customer_profiles[0].values.languages = '["ja","zh"]';
    refreshBundleIntegrity(bundle);
    const archive = gzipSync(Buffer.from(JSON.stringify(bundle), "utf8"));
    const inserted = Object.fromEntries(ACCOUNT_SYNC_TABLES.map((table) => [table, [] as Row[]])) as Record<string, Row[]>;
    const queries: string[] = [];
    let nextId = 1000;
    let committed = false;
    let rolledBack = false;
    let ended = false;
    const physicalColumns: Record<string, readonly string[]> = {
      users: ["needo_id", "account_no", "primary_identity_type", "email", "phone", "email_verified_at", "password_hash", "username", "avatar_url", "avatar_bootstrap_url", "avatar_bootstrapped_at", "is_active", "is_test_account", "session_generation", "last_login_at", "created_at", "updated_at", "deleted_at"],
      shops: ["shop_no", "owner_user_id", "name", "description", "city", "address", "latitude", "longitude", "phone", "status", "is_recommended", "pricing_mode", "technician_pricing_rate_percent", "pricing_mode_updated_at", "pricing_mode_updated_by", "created_at", "updated_at", "deleted_at"],
      merchant_accounts: ["code", "owner_no", "owner_user_id", "settlement_bank_account_id", "name", "status", "payment_responsibility", "created_at", "updated_at", "deleted_at"],
      customer_profiles: ["user_id", "display_name", "bio", "city", "membership_level", "membership_grant_mode", "membership_duration_unit", "membership_duration_value", "membership_starts_at", "membership_expires_at", "membership_granted_by_id", "platform_membership_lock_version", "is_public", "gender", "age", "height_cm", "languages", "visibility", "created_at", "updated_at", "deleted_at"],
      technician_profiles: ["user_id", "shop_id", "display_name", "bio", "city", "service_area", "service_areas", "base_latitude", "base_longitude", "gender", "age", "height_cm", "languages", "profile_tags", "can_serve_foreigners", "bid_budget_min_jpy", "bid_budget_max_jpy", "payment_methods", "visibility", "years_experience", "employment_type", "employment_started_at", "status", "is_recommended", "verified_at", "created_at", "updated_at", "deleted_at"],
      user_identities: ["user_id", "type", "active_key", "scope_type", "scope_id", "display_name", "is_default", "is_active", "created_at", "updated_at", "deleted_at"],
      merchant_identity_profiles: ["identity_id", "user_id", "display_name", "gender", "age", "height_cm", "languages", "bio", "visibility", "created_at", "updated_at", "deleted_at"],
      user_roles: ["user_id", "role_id", "scope_type", "scope_id", "created_at", "updated_at", "deleted_at"],
      merchant_shop_memberships: ["merchant_account_id", "shop_id", "active_key", "starts_at", "ends_at", "removed_reason", "created_by_id", "removed_by_id", "created_at", "updated_at", "deleted_at"],
      technician_shop_affiliations: ["technician_profile_id", "shop_id", "relationship_type", "work_status", "starts_at", "ends_at", "active_key", "created_by_id", "updated_by_id", "created_at", "updated_at", "deleted_at"],
      public_identifiers: ["public_id", "number_part", "kind", "user_identity_id", "shop_id", "merchant_account_id", "customer_support_account_id", "login_allowed", "searchable", "status", "created_at", "updated_at", "deleted_at"]
    };
    const connection = {
      beginTransaction: async () => undefined,
      commit: async () => { committed = true; },
      rollback: async () => { rolledBack = true; },
      end: async () => { ended = true; },
      query: async (sql: string, parameters: unknown[] = []) => {
        queries.push(sql);
        if (sql.includes("GET_LOCK")) return [{ acquired: 1 }];
        if (sql.includes("RELEASE_LOCK")) return [{ released: 1 }];
        if (sql.startsWith("SELECT id, email")) return [{ ...administrator, is_active: "1" }];
        if (sql.includes("FROM roles") && sql.includes("deleted_at")) return requiredRoles;
        if (sql.includes("_prisma_migrations")) return [{ migration_name: "baseline", checksum: "a".repeat(64) }];
        if (sql.includes("type = 'platform'")) return [{ count: 1 }];
        if (sql.includes("JOIN user_roles ur") || sql.includes("FROM user_roles ur JOIN roles")) return [{ count: 1 }];
        if (sql.startsWith("INSERT INTO ")) {
          const table = sql.match(/^INSERT INTO ([a-z_]+)/u)?.[1];
          const columns = [...sql.matchAll(/`([^`]+)`/gu)].map((match) => match[1]);
          if (!table) throw new Error("test insert table missing");
          const values = Object.fromEntries(columns.map((column, index) => [column, parameters[index]]));
          if (JSON.stringify(Object.keys(values).sort()) !== JSON.stringify([...(physicalColumns[table] ?? [])].sort())) throw new Error(`TEST_PHYSICAL_COLUMN_SET_INVALID:${table}`);
          if (table === "users" && (typeof values.email !== "string" || typeof values.needo_id !== "string" || typeof values.username !== "string" || values.is_test_account !== 1)) throw new Error("TEST_TYPE_INVALID:users");
          if (table === "customer_profiles" && (typeof values.user_id !== "number" || typeof values.membership_granted_by_id !== "number")) throw new Error("TEST_TYPE_INVALID:customer_profiles");
          if (table === "user_identities" && (typeof values.user_id !== "number" || !(typeof values.scope_id === "number" || ((values.scope_type === "platform" || values.scope_type === "global") && values.scope_id === null)) || ![0, 1].includes(Number(values.is_default)) || ![0, 1].includes(Number(values.is_active)))) throw new Error("TEST_TYPE_INVALID:user_identities");
          if (["merchant_shop_memberships", "technician_shop_affiliations"].includes(table) && ["created_by_id", "removed_by_id", "updated_by_id"].some((column) => column in values && typeof values[column] !== "number")) throw new Error(`TEST_TYPE_INVALID:${table}`);
          if (table === "shops" && values.pricing_mode !== "merchant") throw new Error("TEST_ENUM_INVALID:shops");
          if (table === "customer_profiles" && values.membership_grant_mode !== "self_service") throw new Error("TEST_ENUM_INVALID:customer_profiles");
          if (table === "technician_profiles" && values.employment_type !== "INDEPENDENT") throw new Error("TEST_ENUM_INVALID:technician_profiles");
          if (table === "technician_shop_affiliations" && (values.relationship_type !== "exclusive" || values.work_status !== "active")) throw new Error("TEST_ENUM_INVALID:technician_shop_affiliations");
          if (table === "public_identifiers" && (!["u", "s", "b"].includes(String(values.kind)) || [values.user_identity_id, values.shop_id, values.merchant_account_id].filter((value) => value !== null).length !== 1)) throw new Error("TEST_ENUM_INVALID:public_identifiers");
          for (const jsonColumn of ["languages", "service_areas"]) if (jsonColumn in values && (typeof values[jsonColumn] !== "string" || !Array.isArray(JSON.parse(values[jsonColumn] as string)))) throw new Error(`TEST_JSON_INVALID:${table}`);
          inserted[table].push({ id: nextId++, ...values });
          return { insertId: nextId - 1 };
        }
        if (sql.startsWith("UPDATE users SET is_test_account")) return { affectedRows: 1 };
        if (sql.includes("user_count")) return [{ user_count: 252, non_test_count: 0 }];
        if (sql === "SELECT id, code FROM roles WHERE deleted_at IS NULL") return requiredRoles;
        if (sql.startsWith("SELECT * FROM ")) {
          const table = sql.match(/^SELECT \* FROM ([a-z_]+)/u)?.[1];
          return inserted[table ?? ""]?.filter((row) => parameters.includes(row.id)).map((row) => ({
            ...row,
            ...(typeof row.languages === "string" ? { languages: JSON.stringify(JSON.parse(row.languages), null, 1) } : {})
          })) ?? [];
        }
        if (sql.includes("is_default = 1")) return [{ count: 1 }];
        if (sql.includes("COUNT(*)")) return [{ count: 0 }];
        return [];
      }
    };
    const output: string[] = [];
    await runSelectiveAccountImportCli({
      args: ["--input", "/private/tmp/accounts.json.gz", "--sha256", createHash("sha256").update(archive).digest("hex")],
      env: { NODE_ENV: "production", DEPLOY_ENV: "staging", DATABASE_URL: "mysql://user:password@mysql:3306/needo_staging", ADMIN_DEFAULT_EMAIL: "admin@example.test" },
      readFile: async () => archive,
      createConnection: async () => connection as never,
      writeOutput: (value) => output.push(value)
    });
    expect(committed).toBe(true);
    expect(rolledBack).toBe(false);
    expect(ended).toBe(true);
    expect(Object.values(inserted).every((rows) => rows.length > 0)).toBe(true);
    const targetUserId = inserted.users[0]?.id;
    const targetShopId = inserted.shops[0]?.id;
    const targetMerchantId = inserted.merchant_accounts[0]?.id;
    const targetCustomerProfileId = inserted.customer_profiles[0]?.id;
    const targetTechnicianProfileId = inserted.technician_profiles[0]?.id;
    expect(inserted.customer_profiles[0]).toMatchObject({ membership_granted_by_id: targetUserId });
    expect(inserted.merchant_shop_memberships[0]).toMatchObject({ created_by_id: targetUserId, removed_by_id: targetUserId });
    expect(inserted.technician_shop_affiliations[0]).toMatchObject({ created_by_id: targetUserId, updated_by_id: targetUserId });
    expect(inserted.user_identities.map((row) => [row.scope_type, row.scope_id])).toEqual(expect.arrayContaining([
      ["customer_profile", targetCustomerProfileId], ["shop", targetShopId], ["merchant_account", targetMerchantId], ["technician_profile", targetTechnicianProfileId], ["platform", null]
    ]));
    expect(inserted.user_roles.map((row) => [row.scope_type, row.scope_id])).toEqual(expect.arrayContaining([
      ["merchant_account", targetMerchantId], ["merchant", targetMerchantId], ["shop", targetShopId], ["technician_profile", targetTechnicianProfileId], ["customer_profile", targetCustomerProfileId], ["platform", null]
    ]));
    expect(inserted.public_identifiers.map((row) => [row.user_identity_id, row.shop_id, row.merchant_account_id])).toEqual(expect.arrayContaining([
      [inserted.user_identities[0]?.id, null, null], [null, targetShopId, null], [null, null, targetMerchantId]
    ]));
    expect(queries.some((query) => query.includes("type = 'platform' AND scope_type = 'global' AND scope_id IS NULL"))).toBe(true);
    expect(queries.some((query) => query.includes("LEFT JOIN merchant_accounts"))).toBe(true);
    expect(JSON.parse(output[0] ?? "{}")).toMatchObject({ status: "passed", userCount: 252, nonTestUserCount: 0, administratorCount: 1 });
  });
});
