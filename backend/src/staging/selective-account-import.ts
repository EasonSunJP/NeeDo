import {
  ACCOUNT_SYNC_TABLES,
  parseSelectiveAccountSyncBundle,
  type SelectiveAccountSyncBundle,
  type SyncRow
} from "./selective-account-sync-contract";

type TargetRow = { id?: number; [key: string]: unknown };
export type CollisionField = "email" | "needo_id" | "account_no" | "phone" | "shop_no" | "code" | "owner_no" | "active_key" | "public_id" | "kind_number_part";

const collisionQueries: Record<CollisionField, string> = {
  email: "SELECT email FROM users WHERE deleted_at IS NULL AND email IN (?)",
  needo_id: "SELECT needo_id FROM users WHERE deleted_at IS NULL AND needo_id IN (?)",
  account_no: "SELECT account_no FROM users WHERE deleted_at IS NULL AND account_no IN (?)",
  phone: "SELECT phone FROM users WHERE deleted_at IS NULL AND phone IN (?)",
  shop_no: "SELECT shop_no FROM shops WHERE deleted_at IS NULL AND shop_no IN (?)",
  code: "SELECT code FROM merchant_accounts WHERE deleted_at IS NULL AND code IN (?)",
  owner_no: "SELECT owner_no FROM merchant_accounts WHERE deleted_at IS NULL AND owner_no IN (?)",
  active_key: "SELECT active_key FROM user_identities WHERE deleted_at IS NULL AND active_key IN (?) UNION ALL SELECT active_key FROM merchant_shop_memberships WHERE deleted_at IS NULL AND active_key IN (?) UNION ALL SELECT active_key FROM technician_shop_affiliations WHERE deleted_at IS NULL AND active_key IN (?)",
  public_id: "SELECT public_id FROM public_identifiers WHERE deleted_at IS NULL AND public_id IN (?)",
  kind_number_part: "SELECT kind, number_part FROM public_identifiers WHERE deleted_at IS NULL AND CONCAT(kind, ':', number_part) IN (?)"
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

const roleScopeMap = (values: Record<string, unknown>, maps: Record<string, Map<number, number>>): void => {
  const scopeType = values.scope_type;
  const scopeId = values.scope_id;
  if (scopeType === "global" || scopeType === "platform") {
    if (scopeId !== null && scopeId !== undefined) throw new Error("ACCOUNT_SYNC_SCOPE_INVALID");
    return;
  }
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
    if (administrator.length !== 1 || String(administrator[0].email).trim().toLowerCase() !== config.adminDefaultEmail || administrator[0].is_active !== true || baseline.activePlatformIdentities !== 1 || baseline.administratorRoleCount !== 1) throw new Error("ACCOUNT_SYNC_TARGET_BASELINE_INVALID");
    if (baseline.migrations.length !== bundle.sourceMigrationCount || String(baseline.migrations.at(-1)?.migration_name) !== bundle.sourceLatestMigration) throw new Error("ACCOUNT_SYNC_MIGRATION_PARITY_INVALID");
    const collisionValues: Record<CollisionField, unknown[]> = {
      email: bundle.tables.users.map((row) => row.values.email).filter((value) => value !== null && value !== undefined),
      needo_id: bundle.tables.users.map((row) => row.values.needo_id).filter((value) => value !== null && value !== undefined),
      account_no: bundle.tables.users.map((row) => row.values.account_no).filter((value) => value !== null && value !== undefined),
      phone: bundle.tables.users.map((row) => row.values.phone).filter((value) => value !== null && value !== undefined),
      shop_no: bundle.tables.shops.map((row) => row.values.shop_no).filter((value) => value !== null && value !== undefined),
      code: bundle.tables.merchant_accounts.map((row) => row.values.code).filter((value) => value !== null && value !== undefined),
      owner_no: bundle.tables.merchant_accounts.map((row) => row.values.owner_no).filter((value) => value !== null && value !== undefined),
      active_key: [...bundle.tables.user_identities, ...bundle.tables.merchant_shop_memberships, ...bundle.tables.technician_shop_affiliations].map((row) => row.values.active_key).filter((value) => value !== null && value !== undefined),
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
    if (postcondition.userCount !== 262 || postcondition.nonTestUserCount !== 0 || postcondition.administratorCount !== 1) throw new Error("ACCOUNT_SYNC_POSTCONDITION_INVALID");
    await port.commit(); started = false;
    return { userCount: postcondition.userCount, nonTestUserCount: postcondition.nonTestUserCount, administratorCount: postcondition.administratorCount, tableCounts: bundle.counts, verificationDigests: bundle.digests };
  } catch (error) {
    if (started) await port.rollback();
    throw error;
  } finally {
    await port.releaseLock();
  }
};
