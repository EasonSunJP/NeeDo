import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { createConnection, type Connection, type ConnectionConfig } from "mariadb";
import { importSelectiveAccounts, parseSelectiveAccountImportConfig, type CollisionField, type SelectiveAccountImportPort } from "./selective-account-import";
import { ACCOUNT_SYNC_TABLES, collectionDigest, parseSelectiveAccountSyncBundle, type SelectiveAccountSyncBundle, type SyncRow } from "./selective-account-sync-contract";

const LOCK_NAME = "needo-staging-selective-account-sync";
type DatabaseRow = Record<string, unknown>;
type StagingConnectionConfig = ConnectionConfig & { jsonStrings: true };

export const parseSelectiveAccountImportCliArgs = (args: readonly string[]) => {
  if (args.length !== 4 || args[0] !== "--input" || args[2] !== "--sha256" || !path.isAbsolute(args[1] ?? "") || !/^[a-f0-9]{64}$/u.test(args[3] ?? "")) throw new Error("ACCOUNT_SYNC_CLI_ARGUMENT_INVALID");
  return { inputPath: args[1], sha256: args[3] };
};

export const createStagingImportConnectionConfig = (databaseUrl: string): StagingConnectionConfig => {
  try {
    const url = new URL(databaseUrl);
    if (url.protocol !== "mysql:" || url.hostname !== "mysql" || url.pathname.replace(/^\/+/, "") !== "needo_staging") throw new Error();
    return { host: "mysql", port: url.port ? Number(url.port) : 3306, user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: "needo_staging", dateStrings: true, jsonStrings: true };
  } catch { throw new Error("ACCOUNT_SYNC_TARGET_BOUNDARY_REJECTED"); }
};

export const readVerifiedSelectiveAccountBundle = async (inputPath: string, sha256: string, reader: (path: string) => Promise<Buffer> = readFile): Promise<SelectiveAccountSyncBundle> => {
  const archive = await reader(inputPath);
  if (createHash("sha256").update(archive).digest("hex") !== sha256) throw new Error("ACCOUNT_SYNC_ARCHIVE_SHA_INVALID");
  return parseSelectiveAccountSyncBundle(JSON.parse(gunzipSync(archive).toString("utf8")));
};

const assertOwnerOnlyInput = async (inputPath: string): Promise<void> => {
  const metadata = await stat(inputPath);
  if (!metadata.isFile() || (metadata.mode & 0o077) !== 0 || metadata.uid !== process.getuid?.()) throw new Error("ACCOUNT_SYNC_ARCHIVE_PERMISSION_INVALID");
};

const rows = (value: unknown): DatabaseRow[] => Array.isArray(value) ? value as DatabaseRow[] : [];
const count = (value: unknown): number => Number(rows(value)[0]?.count ?? 0);
const placeholders = (values: readonly unknown[]): string => values.map(() => "?").join(", ");
const ids = (values: Iterable<number>): number[] => [...values];

const collisionStatements: Record<CollisionField, readonly string[]> = {
  email: ["SELECT email FROM users WHERE email IN (%s)"],
  needo_id: ["SELECT needo_id FROM users WHERE needo_id IN (%s)"],
  account_no: ["SELECT account_no FROM users WHERE account_no IN (%s)"],
  phone: ["SELECT phone FROM users WHERE phone IN (%s)"],
  shop_no: ["SELECT shop_no FROM shops WHERE shop_no IN (%s)"],
  code: ["SELECT code FROM merchant_accounts WHERE code IN (%s)"],
  owner_no: ["SELECT owner_no FROM merchant_accounts WHERE owner_no IN (%s)"],
  user_identity_active_key: ["SELECT active_key FROM user_identities WHERE active_key IN (%s)"],
  merchant_shop_membership_active_key: ["SELECT active_key FROM merchant_shop_memberships WHERE active_key IN (%s)"],
  technician_shop_affiliation_active_key: ["SELECT active_key FROM technician_shop_affiliations WHERE active_key IN (%s)"],
  public_id: ["SELECT public_id FROM public_identifiers WHERE public_id IN (%s)"],
  kind_number_part: ["SELECT kind, number_part FROM public_identifiers WHERE CONCAT(kind, ':', number_part) IN (%s)"]
};

const importableColumns: Record<(typeof ACCOUNT_SYNC_TABLES)[number], ReadonlySet<string>> = {
  users: new Set(["needo_id", "account_no", "primary_identity_type", "email", "phone", "email_verified_at", "password_hash", "username", "avatar_url", "avatar_bootstrap_url", "avatar_bootstrapped_at", "is_active", "is_test_account", "session_generation", "last_login_at", "created_at", "updated_at", "deleted_at"]),
  shops: new Set(["shop_no", "owner_user_id", "name", "description", "city", "address", "latitude", "longitude", "phone", "status", "is_recommended", "pricing_mode", "technician_pricing_rate_percent", "pricing_mode_updated_at", "pricing_mode_updated_by", "created_at", "updated_at", "deleted_at"]),
  merchant_accounts: new Set(["code", "owner_no", "owner_user_id", "settlement_bank_account_id", "name", "status", "payment_responsibility", "created_at", "updated_at", "deleted_at"]),
  customer_profiles: new Set(["user_id", "display_name", "bio", "city", "membership_level", "membership_grant_mode", "membership_duration_unit", "membership_duration_value", "membership_starts_at", "membership_expires_at", "membership_granted_by_id", "platform_membership_lock_version", "is_public", "gender", "age", "height_cm", "languages", "visibility", "created_at", "updated_at", "deleted_at"]),
  technician_profiles: new Set(["user_id", "shop_id", "display_name", "bio", "city", "service_area", "service_areas", "base_latitude", "base_longitude", "gender", "age", "height_cm", "languages", "profile_tags", "can_serve_foreigners", "bid_budget_min_jpy", "bid_budget_max_jpy", "payment_methods", "visibility", "years_experience", "employment_type", "employment_started_at", "status", "is_recommended", "verified_at", "created_at", "updated_at", "deleted_at"]),
  user_identities: new Set(["user_id", "type", "active_key", "scope_type", "scope_id", "display_name", "is_default", "is_active", "created_at", "updated_at", "deleted_at"]),
  merchant_identity_profiles: new Set(["identity_id", "user_id", "display_name", "gender", "age", "height_cm", "languages", "bio", "visibility", "created_at", "updated_at", "deleted_at"]),
  user_roles: new Set(["user_id", "role_id", "scope_type", "scope_id", "created_at", "updated_at", "deleted_at"]),
  merchant_shop_memberships: new Set(["merchant_account_id", "shop_id", "active_key", "starts_at", "ends_at", "removed_reason", "created_by_id", "removed_by_id", "created_at", "updated_at", "deleted_at"]),
  technician_shop_affiliations: new Set(["technician_profile_id", "shop_id", "relationship_type", "work_status", "starts_at", "ends_at", "active_key", "created_by_id", "updated_by_id", "created_at", "updated_at", "deleted_at"]),
  public_identifiers: new Set(["public_id", "number_part", "kind", "user_identity_id", "shop_id", "merchant_account_id", "customer_support_account_id", "login_allowed", "searchable", "status", "created_at", "updated_at", "deleted_at"])
};

const normalizeScalar = (value: unknown): string | number | boolean | null => {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  throw new Error("ACCOUNT_SYNC_TARGET_VALUE_INVALID");
};

const targetRowsToSourceRows = (table: (typeof ACCOUNT_SYNC_TABLES)[number], targetRows: readonly DatabaseRow[], maps: Record<string, Map<number, number>>, roleCodes: Map<number, string>): SyncRow[] => {
  const reverse = Object.fromEntries(Object.entries(maps).map(([name, map]) => [name, new Map([...map].map(([source, target]) => [target, source]))])) as Record<string, Map<number, number>>;
  const remap = (values: Record<string, string | number | boolean | null>, field: string, target: string): void => {
    const value = values[field];
    if (value === null || value === undefined) return;
    if (typeof value !== "number" || !reverse[target].has(value)) throw new Error("ACCOUNT_SYNC_POSTCONDITION_INVALID");
    values[field] = reverse[target].get(value)!;
  };
  return targetRows.map((row) => {
    const sourceId = reverse[table].get(Number(row.id));
    if (!sourceId) throw new Error("ACCOUNT_SYNC_POSTCONDITION_INVALID");
    const values = Object.fromEntries(Object.entries(row).filter(([key]) => key !== "id").map(([key, value]) => [key, normalizeScalar(value)]));
    for (const field of ["user_id", "owner_user_id", "membership_granted_by_id", "pricing_mode_updated_by", "created_by_id", "updated_by_id", "removed_by_id"]) remap(values, field, "users");
    remap(values, "shop_id", "shops"); remap(values, "merchant_account_id", "merchant_accounts"); remap(values, "technician_profile_id", "technician_profiles");
    remap(values, "identity_id", "user_identities"); remap(values, "user_identity_id", "user_identities");
    if (table === "user_roles") { const roleId = values.role_id; if (typeof roleId !== "number" || !roleCodes.has(roleId)) throw new Error("ACCOUNT_SYNC_POSTCONDITION_INVALID"); values.role_code = roleCodes.get(roleId)!; delete values.role_id; }
    if ((table === "user_roles" || table === "user_identities") && values.scope_id !== null && values.scope_id !== undefined) {
      const scope = values.scope_type;
      const target = scope === "merchant" || scope === "merchant_account" ? "merchant_accounts" : scope === "customer_profile" ? "customer_profiles" : scope === "technician_profile" ? "technician_profiles" : scope === "shop" ? "shops" : undefined;
      if (!target) throw new Error("ACCOUNT_SYNC_POSTCONDITION_INVALID");
      remap(values, "scope_id", target);
    }
    return { sourceId, values };
  });
};

const assertNoOrphans = async (connection: Connection, maps: Record<string, Map<number, number>>): Promise<void> => {
  const imported = (table: string) => ids(maps[table].values());
  const checks: Array<[string, readonly unknown[]]> = [];
  if (imported("merchant_shop_memberships").length) checks.push([`SELECT COUNT(*) AS count FROM merchant_shop_memberships m LEFT JOIN merchant_accounts a ON a.id = m.merchant_account_id LEFT JOIN shops s ON s.id = m.shop_id WHERE m.id IN (${placeholders(imported("merchant_shop_memberships"))}) AND (a.id IS NULL OR s.id IS NULL)`, imported("merchant_shop_memberships")]);
  if (imported("technician_shop_affiliations").length) checks.push([`SELECT COUNT(*) AS count FROM technician_shop_affiliations a LEFT JOIN technician_profiles p ON p.id = a.technician_profile_id LEFT JOIN shops s ON s.id = a.shop_id WHERE a.id IN (${placeholders(imported("technician_shop_affiliations"))}) AND (p.id IS NULL OR s.id IS NULL)`, imported("technician_shop_affiliations")]);
  if (imported("public_identifiers").length) checks.push([`SELECT COUNT(*) AS count FROM public_identifiers WHERE id IN (${placeholders(imported("public_identifiers"))}) AND (customer_support_account_id IS NOT NULL OR ((user_identity_id IS NOT NULL) + (shop_id IS NOT NULL) + (merchant_account_id IS NOT NULL)) <> 1)`, imported("public_identifiers")]);
  for (const [query, parameters] of checks) if (count(await connection.query(query, parameters)) !== 0) throw new Error("ACCOUNT_SYNC_POSTCONDITION_INVALID");
};

const makeImportPort = (connection: Connection, env: NodeJS.ProcessEnv): SelectiveAccountImportPort => ({
  nodeEnv: env.NODE_ENV, deployEnv: env.DEPLOY_ENV, databaseUrl: env.DATABASE_URL ?? "", adminDefaultEmail: env.ADMIN_DEFAULT_EMAIL,
  acquireLock: async () => Number(rows(await connection.query("SELECT GET_LOCK(?, 0) AS acquired", [LOCK_NAME]))[0]?.acquired) === 1,
  releaseLock: async () => { await connection.query("SELECT RELEASE_LOCK(?) AS released", [LOCK_NAME]); },
  begin: async () => { await connection.beginTransaction(); }, commit: async () => { await connection.commit(); }, rollback: async () => { await connection.rollback(); },
  baseline: async () => {
    const users = rows(await connection.query("SELECT id, email, is_active, is_test_account, deleted_at FROM users WHERE deleted_at IS NULL"));
    const administratorId = users.length === 1 ? Number(users[0].id) : -1;
    const [roles, migrations, identities, administratorRoles] = await Promise.all([
      connection.query("SELECT id, code, deleted_at FROM roles WHERE deleted_at IS NULL"), connection.query("SELECT migration_name, checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name ASC"),
      connection.query("SELECT COUNT(*) AS count FROM user_identities WHERE user_id = ? AND deleted_at IS NULL AND is_active = 1 AND type = 'platform' AND scope_type = 'global' AND scope_id IS NULL", [administratorId]),
      connection.query("SELECT COUNT(*) AS count FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? AND ur.deleted_at IS NULL AND r.deleted_at IS NULL AND r.code = 'admin'", [administratorId])
    ]);
    return { users, roles: rows(roles), migrations: rows(migrations), activePlatformIdentities: count(identities), administratorRoleCount: count(administratorRoles) };
  },
  occupied: async (field, values) => (await Promise.all(collisionStatements[field].map((statement) => connection.query(statement.replace("%s", placeholders(values)), values)))).flatMap(rows),
  insert: async (table, values) => {
    if (!ACCOUNT_SYNC_TABLES.includes(table as (typeof ACCOUNT_SYNC_TABLES)[number])) throw new Error("ACCOUNT_SYNC_TABLE_INVALID");
    const columns = Object.keys(values).sort(); const allowed = importableColumns[table as (typeof ACCOUNT_SYNC_TABLES)[number]];
    if (!columns.length || columns.some((column) => !allowed.has(column))) throw new Error("ACCOUNT_SYNC_COLUMN_INVALID");
    const result = await connection.query(`INSERT INTO ${table} (${columns.map((column) => `\`${column}\``).join(", ")}) VALUES (${placeholders(columns)})`, columns.map((column) => values[column]));
    const insertId = Number((result as { insertId?: unknown }).insertId); if (!Number.isSafeInteger(insertId) || insertId <= 0) throw new Error("ACCOUNT_SYNC_INSERT_INVALID"); return insertId;
  },
  updateAdministrator: async (id) => { const result = await connection.query("UPDATE users SET is_test_account = 1, updated_at = updated_at WHERE id = ? AND deleted_at IS NULL", [id]); if (Number((result as { affectedRows?: unknown }).affectedRows) !== 1) throw new Error("ACCOUNT_SYNC_ADMIN_UPDATE_INVALID"); },
  verifyPostconditions: async ({ bundle, maps, administratorId, administratorEmail }) => {
    const [userTotals, administratorRoles, roleRows] = await Promise.all([
      connection.query("SELECT COUNT(*) AS user_count, SUM(CASE WHEN is_test_account = 0 THEN 1 ELSE 0 END) AS non_test_count FROM users WHERE deleted_at IS NULL"),
      connection.query("SELECT COUNT(*) AS count FROM users u JOIN user_roles ur ON ur.user_id = u.id AND ur.deleted_at IS NULL JOIN roles r ON r.id = ur.role_id AND r.deleted_at IS NULL AND r.code = 'admin' WHERE u.id = ? AND u.email = ? AND u.deleted_at IS NULL AND u.is_active = 1", [administratorId, administratorEmail]),
      connection.query("SELECT id, code FROM roles WHERE deleted_at IS NULL")
    ]);
    const roleCodes = new Map<number, string>(rows(roleRows).map((row) => [Number(row.id), String(row.code)]));
    for (const table of ACCOUNT_SYNC_TABLES) {
      const targetIds = ids(maps[table].values()); if (targetIds.length !== bundle.counts[table]) throw new Error("ACCOUNT_SYNC_POSTCONDITION_INVALID"); if (!targetIds.length) continue;
      const targetRows = rows(await connection.query(`SELECT * FROM ${table} WHERE deleted_at IS NULL AND id IN (${placeholders(targetIds)})`, targetIds));
      if (targetRows.length !== bundle.counts[table] || collectionDigest(bundle.verificationKey, targetRowsToSourceRows(table, targetRows, maps, roleCodes)) !== bundle.digests[table]) throw new Error("ACCOUNT_SYNC_POSTCONDITION_INVALID");
    }
    for (const sourceUserId of new Set(bundle.tables.user_identities.map((row) => row.values.user_id).filter((value): value is number => typeof value === "number"))) {
      const targetUserId = maps.users.get(sourceUserId); if (!targetUserId || count(await connection.query("SELECT COUNT(*) AS count FROM user_identities WHERE user_id = ? AND deleted_at IS NULL AND is_active = 1 AND is_default = 1", [targetUserId])) !== 1) throw new Error("ACCOUNT_SYNC_POSTCONDITION_INVALID");
    }
    await assertNoOrphans(connection, maps);
    const totals = rows(userTotals)[0] ?? {}; return { userCount: Number(totals.user_count), nonTestUserCount: Number(totals.non_test_count ?? 0), administratorCount: count(administratorRoles) };
  }
});

interface SelectiveAccountImportCliOptions { args?: readonly string[]; env?: NodeJS.ProcessEnv; createConnection?: (config: ConnectionConfig) => Promise<Connection>; readFile?: (path: string) => Promise<Buffer>; writeOutput?: (value: string) => void; }

export const runSelectiveAccountImportCli = async (options: SelectiveAccountImportCliOptions = {}): Promise<void> => {
  const env = options.env ?? process.env; const args = parseSelectiveAccountImportCliArgs(options.args ?? process.argv.slice(2)); const config = parseSelectiveAccountImportConfig(env);
  if (!options.readFile) await assertOwnerOnlyInput(args.inputPath);
  const bundle = await readVerifiedSelectiveAccountBundle(args.inputPath, args.sha256, options.readFile);
  let connection: Connection | undefined;
  try {
    connection = await (options.createConnection ?? createConnection)(createStagingImportConnectionConfig(config.databaseUrl ?? ""));
    const summary = await importSelectiveAccounts(makeImportPort(connection, env), bundle);
    (options.writeOutput ?? console.log)(JSON.stringify({ gate: "staging-selective-account-import", status: "passed", userCount: summary.userCount, nonTestUserCount: summary.nonTestUserCount, administratorCount: summary.administratorCount, tableCounts: summary.tableCounts, verificationDigests: summary.verificationDigests }));
  } finally { await connection?.end(); }
};

if (require.main === module) runSelectiveAccountImportCli().catch(() => { console.error(JSON.stringify({ gate: "staging-selective-account-import", status: "failed", reason: "ACCOUNT_SYNC_IMPORT_FAILED" })); process.exitCode = 1; });
