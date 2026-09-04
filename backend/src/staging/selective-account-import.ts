import {
  ACCOUNT_SYNC_TABLES,
  parseSelectiveAccountSyncBundle,
  type SelectiveAccountSyncBundle,
  type SyncRow
} from "./selective-account-sync-contract";

type TargetRow = { id?: number; [key: string]: unknown };
export type CollisionField = "email" | "needo_id" | "account_no" | "phone" | "shop_no" | "code" | "owner_no" | "user_identity_active_key" | "merchant_shop_membership_active_key" | "technician_shop_affiliation_active_key" | "public_id" | "kind_number_part";

const collisionQueries: Record<CollisionField, string> = {
  email: "SELECT email FROM users WHERE email IN (?)",
  needo_id: "SELECT needo_id FROM users WHERE needo_id IN (?)",
  account_no: "SELECT account_no FROM users WHERE account_no IN (?)",
  phone: "SELECT phone FROM users WHERE phone IN (?)",
  shop_no: "SELECT shop_no FROM shops WHERE shop_no IN (?)",
  code: "SELECT code FROM merchant_accounts WHERE code IN (?)",
  owner_no: "SELECT owner_no FROM merchant_accounts WHERE owner_no IN (?)",
  user_identity_active_key: "SELECT active_key FROM user_identities WHERE active_key IN (?)",
  merchant_shop_membership_active_key: "SELECT active_key FROM merchant_shop_memberships WHERE active_key IN (?)",
  technician_shop_affiliation_active_key: "SELECT active_key FROM technician_shop_affiliations WHERE active_key IN (?)",
  public_id: "SELECT public_id FROM public_identifiers WHERE public_id IN (?)",
  kind_number_part: "SELECT kind, number_part FROM public_identifiers WHERE CONCAT(kind, ':', number_part) IN (?)"
};

export const collisionQueryFor = Object.assign((field: CollisionField): string => {
  const query = collisionQueries[field];
  if (!query) throw new Error("ACCOUNT_SYNC_COLLISION_FIELD_INVALID");
  return query;
}, { queries: collisionQueries });

export interface SelectiveAccountImportPort {
  nodeEnv: string | undefined;
  deployEnv: string | undefined;
  databaseUrl: string;
  adminDefaultEmail: string | undefined;
  acquireLock: () => Promise<boolean>;
  releaseLock: () => Promise<void>;
  begin: () => Promise<void>;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
  baseline: () => Promise<{ users: TargetRow[]; roles: TargetRow[]; migrations: TargetRow[]; activePlatformIdentities: number; administratorRoleCount: number }>;
  occupied: (field: CollisionField, values: readonly unknown[]) => Promise<unknown[]>;
  insert: (table: string, values: Record<string, unknown>) => Promise<number>;
  updateAdministrator: (id: number) => Promise<void>;
  verifyPostconditions: (input: {
    bundle: SelectiveAccountSyncBundle;
    maps: Record<string, Map<number, number>>;
    administratorId: number;
    administratorEmail: string;
  }) => Promise<{ userCount: number; nonTestUserCount: number; administratorCount: number }>;
}

export interface ImportSummary {
  userCount: number;
  nonTestUserCount: number;
  administratorCount: number;
  tableCounts: SelectiveAccountSyncBundle["counts"];
  verificationDigests: SelectiveAccountSyncBundle["digests"];
}

export const parseSelectiveAccountImportConfig = (env: NodeJS.ProcessEnv) => {
  const databaseUrl = env.DATABASE_URL;
  const adminDefaultEmail = env.ADMIN_DEFAULT_EMAIL?.trim().toLowerCase();
  try {
    const url = new URL(databaseUrl ?? "");
    if (env.NODE_ENV !== "production" || env.DEPLOY_ENV !== "staging" || url.protocol !== "mysql:" || url.hostname !== "mysql" || url.pathname.replace(/^\/+/, "") !== "needo_staging" || !adminDefaultEmail || !/^\S+@\S+\.\S+$/u.test(adminDefaultEmail)) throw new Error();
    return { databaseUrl, adminDefaultEmail };
  } catch {
    throw new Error("ACCOUNT_SYNC_TARGET_BOUNDARY_REJECTED");
  }
};

const isDatabaseTrue = (value: unknown): boolean => Number(value) === 1;

const assertMigrationCompatibility = (bundle: SelectiveAccountSyncBundle, target: TargetRow[]): void => {
  const source = new Map(bundle.sourceMigrations.map((row) => [row.migration_name, row.checksum]));
  const targetNames = new Set<string>();
  for (const row of target) {
    if (typeof row.migration_name !== "string" || typeof row.checksum !== "string"
      || targetNames.has(row.migration_name) || source.get(row.migration_name) !== row.checksum) {
      throw new Error("ACCOUNT_SYNC_MIGRATION_PARITY_INVALID");
    }
    targetNames.add(row.migration_name);
  }
  const missing = bundle.sourceMigrations.filter((row) => !targetNames.has(row.migration_name));
  if (missing.length === 0) return;
  // User-approved one-time exception after independent 11-table schema comparison.
  // No Exchange schema, permissions, or migration history is copied by this importer.
  if (target.length !== 125 || source.size !== 126 || missing.length !== 1
    || missing[0].migration_name !== "20260903100000_exchange_matched_booking_conversion"
    || missing[0].checksum !== "ecae7c8e14424f4d35def9fa51bffc1ca7292270db54b58d58545c471e7148f2") {
    throw new Error("ACCOUNT_SYNC_MIGRATION_PARITY_INVALID");
  }
};

const roleScopeMap = (values: Record<string, unknown>, maps: Record<string, Map<number, number>>): void => {
  const scopeType = values.scope_type;
  const scopeId = values.scope_id;
  if ((scopeType === null || scopeType === undefined) && (scopeId === null || scopeId === undefined)) return;
  if (scopeType === "global" || scopeType === "platform") {
    if (scopeId !== null && scopeId !== undefined) throw new Error("ACCOUNT_SYNC_SCOPE_INVALID");
    return;
  }
  if (scopeType === null || scopeType === undefined || scopeId === null || scopeId === undefined) throw new Error("ACCOUNT_SYNC_SCOPE_INVALID");
  const table = scopeType === "merchant" ? "merchant_accounts" : scopeType === "customer_profile" ? "customer_profiles" : scopeType === "technician_profile" ? "technician_profiles" : scopeType === "shop" ? "shops" : scopeType === "merchant_account" ? "merchant_accounts" : undefined;
  if (!table || typeof scopeId !== "number" || !maps[table].has(scopeId)) throw new Error("ACCOUNT_SYNC_SCOPE_INVALID");
  values.scope_id = maps[table].get(scopeId);
};

const mapForeignKeys = (table: string, row: SyncRow, maps: Record<string, Map<number, number>>, roleIds: Map<string, number>): Record<string, unknown> => {
  const values: Record<string, unknown> = { ...row.values };
  const map = (field: string, target: string, nullable = false) => {
    const source = values[field];
    if (source === null || source === undefined) return;
    if (typeof source !== "number" || !maps[target].has(source)) {
      if (nullable) values[field] = null;
      else throw new Error("ACCOUNT_SYNC_REFERENCE_INVALID");
    } else values[field] = maps[target].get(source);
  };
  for (const field of ["user_id", "owner_user_id", "membership_granted_by_id", "pricing_mode_updated_by", "created_by_id", "updated_by_id", "removed_by_id"]) map(field, "users", ["membership_granted_by_id", "pricing_mode_updated_by", "created_by_id", "updated_by_id", "removed_by_id"].includes(field));
  for (const field of ["shop_id"]) map(field, "shops");
  for (const field of ["merchant_account_id"]) map(field, "merchant_accounts");
  for (const field of ["technician_profile_id"]) map(field, "technician_profiles");
  for (const field of ["identity_id", "user_identity_id"]) map(field, "user_identities");
  if (table === "merchant_accounts" && values.settlement_bank_account_id !== null && values.settlement_bank_account_id !== undefined) throw new Error("ACCOUNT_SYNC_BANK_REFERENCE_INVALID");
  if (table === "user_roles") {
    const code = values.role_code;
    if (typeof code !== "string" || !roleIds.has(code)) throw new Error("ACCOUNT_SYNC_ROLE_MISSING");
    values.role_id = roleIds.get(code);
    delete values.role_code;
    roleScopeMap(values, maps);
  }
  if (table === "user_identities") roleScopeMap(values, maps);
  if (table === "public_identifiers") {
    const owners = [values.user_identity_id, values.shop_id, values.merchant_account_id].filter((value) => value !== null && value !== undefined);
    if (owners.length !== 1 || values.customer_support_account_id !== null && values.customer_support_account_id !== undefined) throw new Error("ACCOUNT_SYNC_PUBLIC_IDENTIFIER_SCOPE_INVALID");
  }
  return values;
};

export const importSelectiveAccounts = async (port: SelectiveAccountImportPort, bundleInput: unknown): Promise<ImportSummary> => {
  const config = parseSelectiveAccountImportConfig({ NODE_ENV: port.nodeEnv, DEPLOY_ENV: port.deployEnv, DATABASE_URL: port.databaseUrl, ADMIN_DEFAULT_EMAIL: port.adminDefaultEmail });
  const bundle = parseSelectiveAccountSyncBundle(bundleInput);
  if (!await port.acquireLock()) throw new Error("ACCOUNT_SYNC_LOCK_UNAVAILABLE");
  let started = false;
  try {
    await port.begin(); started = true;
    const baseline = await port.baseline();
    const administrator = baseline.users.filter((user) => user.deleted_at === null || user.deleted_at === undefined);
    if (administrator.length !== 1 || String(administrator[0].email).trim().toLowerCase() !== config.adminDefaultEmail || !isDatabaseTrue(administrator[0].is_active) || baseline.activePlatformIdentities !== 1 || baseline.administratorRoleCount !== 1) throw new Error("ACCOUNT_SYNC_TARGET_BASELINE_INVALID");
    assertMigrationCompatibility(bundle, baseline.migrations);
    const collisionValues: Record<CollisionField, unknown[]> = {
      email: bundle.tables.users.map((row) => row.values.email).filter((value) => value !== null && value !== undefined),
      needo_id: bundle.tables.users.map((row) => row.values.needo_id).filter((value) => value !== null && value !== undefined),
      account_no: bundle.tables.users.map((row) => row.values.account_no).filter((value) => value !== null && value !== undefined),
      phone: bundle.tables.users.map((row) => row.values.phone).filter((value) => value !== null && value !== undefined),
      shop_no: bundle.tables.shops.map((row) => row.values.shop_no).filter((value) => value !== null && value !== undefined),
      code: bundle.tables.merchant_accounts.map((row) => row.values.code).filter((value) => value !== null && value !== undefined),
      owner_no: bundle.tables.merchant_accounts.map((row) => row.values.owner_no).filter((value) => value !== null && value !== undefined),
      user_identity_active_key: bundle.tables.user_identities.map((row) => row.values.active_key).filter((value) => value !== null && value !== undefined),
      merchant_shop_membership_active_key: bundle.tables.merchant_shop_memberships.map((row) => row.values.active_key).filter((value) => value !== null && value !== undefined),
      technician_shop_affiliation_active_key: bundle.tables.technician_shop_affiliations.map((row) => row.values.active_key).filter((value) => value !== null && value !== undefined),
      public_id: bundle.tables.public_identifiers.map((row) => row.values.public_id).filter((value) => value !== null && value !== undefined),
      kind_number_part: bundle.tables.public_identifiers.map((row) => `${row.values.kind}:${row.values.number_part}`)
    };
    for (const [field, values] of Object.entries(collisionValues) as Array<[CollisionField, unknown[]]>) {
      if (values.length > 0 && (await port.occupied(field, values)).length > 0) throw new Error(`ACCOUNT_SYNC_UNIQUE_COLLISION:${field}`);
    }
    const roleIds = new Map(baseline.roles.filter((role) => role.deleted_at === null || role.deleted_at === undefined).map((role) => [String(role.code), Number(role.id)]));
    for (const row of bundle.tables.user_roles) if (!roleIds.has(String(row.values.role_code))) throw new Error("ACCOUNT_SYNC_ROLE_MISSING");
    const maps = Object.fromEntries(ACCOUNT_SYNC_TABLES.map((table) => [table, new Map<number, number>()])) as Record<string, Map<number, number>>;
    for (const table of ACCOUNT_SYNC_TABLES) for (const row of bundle.tables[table]) maps[table].set(row.sourceId, await port.insert(table, mapForeignKeys(table, row, maps, roleIds)));
    await port.updateAdministrator(Number(administrator[0].id));
    const postcondition = await port.verifyPostconditions({
      bundle,
      maps,
      administratorId: Number(administrator[0].id),
      administratorEmail: config.adminDefaultEmail
    });
    if (postcondition.userCount !== 252 || postcondition.nonTestUserCount !== 0 || postcondition.administratorCount !== 1) throw new Error("ACCOUNT_SYNC_POSTCONDITION_INVALID");
    await port.commit(); started = false;
    return { userCount: postcondition.userCount, nonTestUserCount: postcondition.nonTestUserCount, administratorCount: postcondition.administratorCount, tableCounts: bundle.counts, verificationDigests: bundle.digests };
  } catch (error) {
    if (started) await port.rollback();
    throw error;
  } finally {
    await port.releaseLock();
  }
};
