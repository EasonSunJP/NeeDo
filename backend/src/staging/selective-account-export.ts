import { createHash, randomBytes } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import {
  ACCOUNT_SYNC_TABLES,
  collectionDigest,
  parseSelectiveAccountSyncBundle,
  type JsonScalar,
  type SyncRow
} from "./selective-account-sync-contract";

export const ACCOUNT_EXPORT_QUERIES = {
  activeUsers: "SELECT id FROM users WHERE deleted_at IS NULL AND is_test_account = 1",
  merchantAccounts: "SELECT id FROM merchant_accounts WHERE deleted_at IS NULL AND owner_user_id IN (?)",
  merchantAccountIdentityScopes: "SELECT scope_id FROM user_identities WHERE deleted_at IS NULL AND user_id IN (?) AND scope_type = 'merchant_account' AND scope_id IS NOT NULL",
  ownedShops: "SELECT id FROM shops WHERE deleted_at IS NULL AND owner_user_id IN (?)",
  technicianProfileShops: "SELECT shop_id FROM technician_profiles WHERE deleted_at IS NULL AND user_id IN (?) AND shop_id IS NOT NULL",
  shopIdentityScopes: "SELECT scope_id FROM user_identities WHERE deleted_at IS NULL AND user_id IN (?) AND scope_type = 'shop' AND scope_id IS NOT NULL",
  shopsForSelectedMerchantAccounts: "SELECT shop_id FROM merchant_shop_memberships WHERE deleted_at IS NULL AND merchant_account_id IN (?)",
  shopsForSelectedTechnicianProfiles: "SELECT shop_id FROM technician_shop_affiliations WHERE deleted_at IS NULL AND technician_profile_id IN (?)",
  users: "SELECT * FROM users WHERE deleted_at IS NULL AND id IN (?)",
  shops: "SELECT * FROM shops WHERE deleted_at IS NULL AND id IN (?)",
  merchant_accounts: "SELECT * FROM merchant_accounts WHERE deleted_at IS NULL AND id IN (?)",
  customer_profiles: "SELECT * FROM customer_profiles WHERE deleted_at IS NULL AND user_id IN (?)",
  technician_profiles: "SELECT * FROM technician_profiles WHERE deleted_at IS NULL AND user_id IN (?)",
  user_identities: "SELECT * FROM user_identities WHERE deleted_at IS NULL AND user_id IN (?)",
  merchant_identity_profiles: "SELECT * FROM merchant_identity_profiles WHERE deleted_at IS NULL AND user_id IN (?)",
  user_roles: "SELECT ur.*, r.code AS role_code FROM user_roles ur JOIN roles r ON r.id = ur.role_id AND r.deleted_at IS NULL WHERE ur.deleted_at IS NULL AND ur.user_id IN (?)",
  merchant_shop_memberships: "SELECT * FROM merchant_shop_memberships WHERE deleted_at IS NULL AND merchant_account_id IN (?) AND shop_id IN (?)",
  technician_shop_affiliations: "SELECT * FROM technician_shop_affiliations WHERE deleted_at IS NULL AND technician_profile_id IN (?) AND shop_id IN (?)",
  public_identifiers: "SELECT * FROM public_identifiers WHERE deleted_at IS NULL AND customer_support_account_id IS NULL AND (user_identity_id IN (?) OR shop_id IN (?) OR merchant_account_id IN (?))",
  migrations: "SELECT migration_name, checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name ASC"
} as const;

export interface AccountClosureInput {
  activeUserIds: readonly number[];
  ownedMerchantAccountIds: readonly number[];
  merchantAccountIdentityScopeIds: readonly number[];
  ownedShopIds: readonly number[];
  technicianProfileShopIds: readonly number[];
  shopIdentityScopeIds: readonly number[];
  shopsForSelectedMerchantAccounts: readonly number[];
  shopsForSelectedTechnicianProfiles: readonly number[];
  scopedIdentityReferences?: readonly { type: string; sourceId: number }[];
}

export interface AccountClosure {
  userIds: number[];
  merchantAccountIds: number[];
  shopIds: number[];
}

export interface SelectiveAccountExportPort {
  deployEnv: string | undefined;
  sourceDatabaseUrl: string;
  outputPath: string;
  query: (query: string, parameters?: readonly unknown[]) => Promise<Array<Record<string, unknown>>>;
  readArchive?: (outputPath: string) => Promise<Buffer>;
}

export interface ExportSummary {
  counts: Record<(typeof ACCOUNT_SYNC_TABLES)[number], number>;
  archiveSha256: string;
  archiveBytes: number;
}

const nullableUserReferences = new Set([
  "membership_granted_by_id", "pricing_mode_updated_by", "created_by_id", "updated_by_id", "removed_by_id"
]);
const allowedIdentityScopes = new Set(["customer_profile", "technician_profile", "shop", "merchant_account"]);

const sortedIds = (values: readonly number[]): number[] => {
  const ids = new Set<number>();
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error("ACCOUNT_SYNC_CLOSURE_INVALID");
    ids.add(value);
  }
  return [...ids].sort((left, right) => left - right);
};

const isPositiveSafeId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

export const resolveAccountClosure = (input: AccountClosureInput): AccountClosure => {
  for (const reference of input.scopedIdentityReferences ?? []) {
    if (!allowedIdentityScopes.has(reference.type) || !Number.isSafeInteger(reference.sourceId) || reference.sourceId <= 0) {
      throw new Error("ACCOUNT_SYNC_IDENTITY_SCOPE_INVALID");
    }
  }
  return {
    userIds: sortedIds(input.activeUserIds),
    merchantAccountIds: sortedIds([...input.ownedMerchantAccountIds, ...input.merchantAccountIdentityScopeIds]),
    shopIds: sortedIds([
      ...input.ownedShopIds,
      ...input.technicianProfileShopIds,
      ...input.shopIdentityScopeIds,
      ...input.shopsForSelectedMerchantAccounts,
      ...input.shopsForSelectedTechnicianProfiles
    ])
  };
};

export function parseLocalSourceDatabaseUrl(value: string): URL {
  try {
    const url = new URL(value);
    const database = url.pathname.replace(/^\/+/, "");
    if (url.protocol !== "mysql:" || !["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname) || database !== "needo_dev") {
      throw new Error("ACCOUNT_SYNC_SOURCE_BOUNDARY_REJECTED");
    }
    return url;
  } catch {
    throw new Error("ACCOUNT_SYNC_SOURCE_BOUNDARY_REJECTED");
  }
}

const idsFrom = (rows: readonly Record<string, unknown>[], field: string): number[] =>
  rows.map((row) => row[field]).filter(isPositiveSafeId);

const queryRows = async (port: SelectiveAccountExportPort, query: string, parameters: readonly unknown[] = []) =>
  port.query(query, parameters);

const scalarValue = (value: unknown): JsonScalar => {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "object") return JSON.stringify(value);
  throw new Error("ACCOUNT_SYNC_ROW_VALUE_INVALID");
};

const sourceRow = (row: Record<string, unknown>): SyncRow => {
  const sourceId = row.id;
  if (!isPositiveSafeId(sourceId)) throw new Error("ACCOUNT_SYNC_ROW_ID_INVALID");
  const values: Record<string, JsonScalar> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key !== "id") values[key] = scalarValue(value);
  }
  return { sourceId, values };
};

const assertSelected = (value: JsonScalar | undefined, selected: readonly number[], label: string, nullable = false) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== "number" || !selected.includes(value)) {
    if (nullable) return null;
    throw new Error(`ACCOUNT_SYNC_REFERENCE_${label}_INVALID`);
  }
  return value;
};

interface ExportReferences {
  userIds: readonly number[];
  shopIds: readonly number[];
  merchantAccountIds: readonly number[];
  customerProfileIds: readonly number[];
  technicianProfileIds: readonly number[];
  identityIds: readonly number[];
}

const mapRow = (table: (typeof ACCOUNT_SYNC_TABLES)[number], row: Record<string, unknown>, references: ExportReferences): SyncRow => {
  const { userIds, shopIds, merchantAccountIds, technicianProfileIds, identityIds } = references;
  const mapped = sourceRow(row);
  for (const field of nullableUserReferences) {
    if (field in mapped.values) mapped.values[field] = assertSelected(mapped.values[field], userIds, "USER", true) as JsonScalar;
  }
  if (table === "users") {
    mapped.values.is_test_account = 1;
    mapped.values.session_generation = 0;
  }
  if (table === "merchant_accounts") mapped.values.settlement_bank_account_id = null;
  if (table === "shops") assertSelected(mapped.values.owner_user_id, userIds, "USER");
  if (table === "merchant_accounts") assertSelected(mapped.values.owner_user_id, userIds, "USER");
  if (table === "technician_profiles") assertSelected(mapped.values.shop_id, shopIds, "SHOP");
  if (table === "merchant_identity_profiles") assertSelected(mapped.values.identity_id, identityIds, "IDENTITY");
  if (table === "user_roles") {
    const roleCode = mapped.values.role_code;
    if (typeof roleCode !== "string" || !roleCode) throw new Error("ACCOUNT_SYNC_ROLE_CODE_INVALID");
    delete mapped.values.role_id;
  }
  if (["customer_profiles", "technician_profiles", "user_identities", "merchant_identity_profiles", "user_roles"].includes(table)) {
    assertSelected(mapped.values.user_id, userIds, "USER");
  }
  if (table === "user_identities" && mapped.values.scope_id !== null && mapped.values.scope_id !== undefined) {
    const scopeType = mapped.values.scope_type;
    if (typeof scopeType !== "string" || !allowedIdentityScopes.has(scopeType)) throw new Error("ACCOUNT_SYNC_IDENTITY_SCOPE_INVALID");
    const selected = scopeType === "shop"
      ? shopIds
      : scopeType === "merchant_account"
        ? merchantAccountIds
      : scopeType === "technician_profile"
          ? technicianProfileIds
          : references.customerProfileIds;
    assertSelected(mapped.values.scope_id, selected, "IDENTITY_SCOPE");
  }
  if (["merchant_shop_memberships", "technician_shop_affiliations"].includes(table)) {
    assertSelected(mapped.values.shop_id, shopIds, "SHOP");
  }
  if (table === "merchant_shop_memberships") assertSelected(mapped.values.merchant_account_id, merchantAccountIds, "MERCHANT");
  if (table === "technician_shop_affiliations") assertSelected(mapped.values.technician_profile_id, technicianProfileIds, "TECHNICIAN_PROFILE");
  if (table === "public_identifiers") {
    assertSelected(mapped.values.user_identity_id, identityIds, "IDENTITY", true);
    assertSelected(mapped.values.shop_id, shopIds, "SHOP", true);
    assertSelected(mapped.values.merchant_account_id, merchantAccountIds, "MERCHANT", true);
    if (mapped.values.customer_support_account_id !== null && mapped.values.customer_support_account_id !== undefined) {
      throw new Error("ACCOUNT_SYNC_PUBLIC_IDENTIFIER_SCOPE_INVALID");
    }
  }
  return mapped;
};

const assertRoleScope = (row: SyncRow, references: ExportReferences): void => {
  const scopeType = row.values.scope_type;
  const scopeId = row.values.scope_id;
  if (scopeType === null || scopeType === undefined) {
    if (scopeId === null || scopeId === undefined) return;
    throw new Error("ACCOUNT_SYNC_REFERENCE_ROLE_SCOPE_INVALID");
  }
  if (typeof scopeType !== "string") throw new Error("ACCOUNT_SYNC_REFERENCE_ROLE_SCOPE_INVALID");
  if (scopeType === "global" || scopeType === "platform") {
    if (scopeId === null || scopeId === undefined) return;
    throw new Error("ACCOUNT_SYNC_REFERENCE_ROLE_SCOPE_INVALID");
  }
  const selected = scopeType === "customer_profile"
    ? references.customerProfileIds
    : scopeType === "technician_profile"
      ? references.technicianProfileIds
      : scopeType === "shop"
        ? references.shopIds
        : ["merchant", "merchant_account"].includes(scopeType)
          ? references.merchantAccountIds
          : undefined;
  if (!selected) throw new Error("ACCOUNT_SYNC_REFERENCE_ROLE_SCOPE_INVALID");
  assertSelected(scopeId, selected, "ROLE_SCOPE");
};

const assertRowsUseSelectedSourceIds = (rows: readonly Record<string, unknown>[], selected: readonly number[], label: string): void => {
  for (const row of rows) {
    if (!isPositiveSafeId(row.id) || !selected.includes(row.id)) {
      throw new Error(`ACCOUNT_SYNC_REFERENCE_${label}_INVALID`);
    }
  }
};

export const buildSelectiveAccountExportSuccessOutput = (summary: ExportSummary): string =>
  JSON.stringify({ gate: "staging-selective-account-export", status: "passed", counts: summary.counts, archiveSha256: summary.archiveSha256, archiveBytes: summary.archiveBytes });

export const exportSelectiveAccounts = async (port: SelectiveAccountExportPort, now: Date): Promise<ExportSummary> => {
  if (port.deployEnv !== "local" || !path.isAbsolute(port.outputPath)) throw new Error("ACCOUNT_SYNC_SOURCE_BOUNDARY_REJECTED");
  parseLocalSourceDatabaseUrl(port.sourceDatabaseUrl);
  const activeUserIds = idsFrom(await queryRows(port, ACCOUNT_EXPORT_QUERIES.activeUsers), "id");
  const [ownedMerchantAccountIds, merchantAccountIdentityScopeIds, ownedShopIds, technicianProfileShopIds, shopIdentityScopeIds] = await Promise.all([
    idsFrom(await queryRows(port, ACCOUNT_EXPORT_QUERIES.merchantAccounts, [activeUserIds]), "id"),
    idsFrom(await queryRows(port, ACCOUNT_EXPORT_QUERIES.merchantAccountIdentityScopes, [activeUserIds]), "scope_id"),
    idsFrom(await queryRows(port, ACCOUNT_EXPORT_QUERIES.ownedShops, [activeUserIds]), "id"),
    idsFrom(await queryRows(port, ACCOUNT_EXPORT_QUERIES.technicianProfileShops, [activeUserIds]), "shop_id"),
    idsFrom(await queryRows(port, ACCOUNT_EXPORT_QUERIES.shopIdentityScopes, [activeUserIds]), "scope_id")
  ]);
  const technicianProfileIds = idsFrom(await queryRows(port, ACCOUNT_EXPORT_QUERIES.technician_profiles, [activeUserIds]), "id");
  const candidateMerchantAccountIds = sortedIds([...ownedMerchantAccountIds, ...merchantAccountIdentityScopeIds]);
  const [shopsForSelectedMerchantAccounts, shopsForSelectedTechnicianProfiles] = await Promise.all([
    idsFrom(await queryRows(port, ACCOUNT_EXPORT_QUERIES.shopsForSelectedMerchantAccounts, [candidateMerchantAccountIds]), "shop_id"),
    idsFrom(await queryRows(port, ACCOUNT_EXPORT_QUERIES.shopsForSelectedTechnicianProfiles, [technicianProfileIds]), "shop_id")
  ]);
  const closure = resolveAccountClosure({ activeUserIds, ownedMerchantAccountIds, merchantAccountIdentityScopeIds, ownedShopIds, technicianProfileShopIds, shopIdentityScopeIds, shopsForSelectedMerchantAccounts, shopsForSelectedTechnicianProfiles });
  const [userRows, shopRows, merchantAccountRows] = await Promise.all([
    queryRows(port, ACCOUNT_EXPORT_QUERIES.users, [closure.userIds]),
    queryRows(port, ACCOUNT_EXPORT_QUERIES.shops, [closure.shopIds]),
    queryRows(port, ACCOUNT_EXPORT_QUERIES.merchant_accounts, [closure.merchantAccountIds])
  ]);
  assertRowsUseSelectedSourceIds(userRows, closure.userIds, "USER");
  assertRowsUseSelectedSourceIds(shopRows, closure.shopIds, "SHOP");
  assertRowsUseSelectedSourceIds(merchantAccountRows, closure.merchantAccountIds, "MERCHANT");
  const userIds = idsFrom(userRows, "id");
  const shopIds = idsFrom(shopRows, "id");
  const merchantAccountIds = idsFrom(merchantAccountRows, "id");
  const [customerProfileRows, technicianProfileRows, userIdentityRows] = await Promise.all([
    queryRows(port, ACCOUNT_EXPORT_QUERIES.customer_profiles, [userIds]),
    queryRows(port, ACCOUNT_EXPORT_QUERIES.technician_profiles, [userIds]),
    queryRows(port, ACCOUNT_EXPORT_QUERIES.user_identities, [userIds])
  ]);
  const customerProfileIds = idsFrom(customerProfileRows, "id");
  const finalTechnicianProfileIds = idsFrom(technicianProfileRows, "id");
  const identityIds = idsFrom(userIdentityRows, "id");
  const references: ExportReferences = { userIds, shopIds, merchantAccountIds, customerProfileIds, technicianProfileIds: finalTechnicianProfileIds, identityIds };
  const nonemptyIds = (ids: readonly number[]): readonly number[] => ids.length === 0 ? [-1] : ids;
  const [merchantIdentityProfileRows, userRoleRows, merchantShopMembershipRows, technicianShopAffiliationRows, publicIdentifierRows] = await Promise.all([
    queryRows(port, ACCOUNT_EXPORT_QUERIES.merchant_identity_profiles, [userIds]),
    queryRows(port, ACCOUNT_EXPORT_QUERIES.user_roles, [userIds]),
    queryRows(port, ACCOUNT_EXPORT_QUERIES.merchant_shop_memberships, [merchantAccountIds, shopIds]),
    queryRows(port, ACCOUNT_EXPORT_QUERIES.technician_shop_affiliations, [finalTechnicianProfileIds, shopIds]),
    queryRows(port, ACCOUNT_EXPORT_QUERIES.public_identifiers, [nonemptyIds(identityIds), nonemptyIds(shopIds), nonemptyIds(merchantAccountIds)])
  ]);
  const tableRows: Record<(typeof ACCOUNT_SYNC_TABLES)[number], SyncRow[]> = {
    users: userRows.map((row) => mapRow("users", row, references)),
    shops: shopRows.map((row) => mapRow("shops", row, references)),
    merchant_accounts: merchantAccountRows.map((row) => mapRow("merchant_accounts", row, references)),
    customer_profiles: customerProfileRows.map((row) => mapRow("customer_profiles", row, references)),
    technician_profiles: technicianProfileRows.map((row) => mapRow("technician_profiles", row, references)),
    user_identities: userIdentityRows.map((row) => mapRow("user_identities", row, references)),
    merchant_identity_profiles: merchantIdentityProfileRows.map((row) => mapRow("merchant_identity_profiles", row, references)),
    user_roles: userRoleRows.map((row) => {
      const mapped = mapRow("user_roles", row, references);
      assertRoleScope(mapped, references);
      return mapped;
    }),
    merchant_shop_memberships: merchantShopMembershipRows.map((row) => mapRow("merchant_shop_memberships", row, references)),
    technician_shop_affiliations: technicianShopAffiliationRows.map((row) => mapRow("technician_shop_affiliations", row, references)),
    public_identifiers: publicIdentifierRows.map((row) => mapRow("public_identifiers", row, references))
  };
  const migrations = await queryRows(port, ACCOUNT_EXPORT_QUERIES.migrations);
  const verificationKey = randomBytes(32).toString("hex");
  const counts = Object.fromEntries(ACCOUNT_SYNC_TABLES.map((table) => [table, tableRows[table].length])) as Record<(typeof ACCOUNT_SYNC_TABLES)[number], number>;
  const digests = Object.fromEntries(ACCOUNT_SYNC_TABLES.map((table) => [table, collectionDigest(verificationKey, tableRows[table])])) as Record<(typeof ACCOUNT_SYNC_TABLES)[number], string>;
  const bundle = parseSelectiveAccountSyncBundle({ formatVersion: 2, sourceDatabase: "needo_dev", sourceMigrationCount: migrations.length, sourceLatestMigration: String(migrations.at(-1)?.migration_name ?? "baseline"), sourceMigrations: migrations.map(({ migration_name, checksum }) => ({ migration_name, checksum })), exportedAt: now.toISOString(), verificationKey, tables: tableRows, counts, digests });
  const archive = gzipSync(Buffer.from(JSON.stringify(bundle), "utf8"), { mtime: 0 } as never);
  await writeFile(port.outputPath, archive, { flag: "wx", mode: 0o600 });
  const fileMode = (await stat(port.outputPath)).mode & 0o777;
  if (fileMode !== 0o600) throw new Error("ACCOUNT_SYNC_ARCHIVE_MODE_INVALID");
  const finalArchive = await (port.readArchive ?? readFile)(port.outputPath);
  if (!finalArchive.equals(archive)) throw new Error("ACCOUNT_SYNC_ARCHIVE_VERIFICATION_INVALID");
  const archiveSha256 = createHash("sha256").update(finalArchive).digest("hex");
  return { counts, archiveSha256, archiveBytes: finalArchive.byteLength };
};
