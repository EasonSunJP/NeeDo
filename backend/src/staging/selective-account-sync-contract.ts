import { createHmac } from "node:crypto";
import { z } from "zod";

export const ACCOUNT_SYNC_TABLES = [
  "users",
  "shops",
  "merchant_accounts",
  "customer_profiles",
  "technician_profiles",
  "user_identities",
  "merchant_identity_profiles",
  "user_roles",
  "merchant_shop_memberships",
  "technician_shop_affiliations",
  "public_identifiers"
] as const;

type AccountSyncTable = (typeof ACCOUNT_SYNC_TABLES)[number];
export type JsonScalar = null | boolean | number | string;

export interface SyncRow {
  sourceId: number;
  values: Record<string, JsonScalar>;
}

export interface SelectiveAccountSyncBundle {
  formatVersion: 1;
  sourceDatabase: string;
  sourceMigrationCount: number;
  sourceLatestMigration: string;
  exportedAt: string;
  verificationKey: string;
  tables: Record<AccountSyncTable, SyncRow[]>;
  counts: Record<AccountSyncTable, number>;
  digests: Record<AccountSyncTable, string>;
}

const jsonScalarSchema = z.union([
  z.null(),
  z.boolean(),
  z.number().int().safe(),
  z.string()
]);

const syncRowSchema = z.object({
  sourceId: z.number().int().safe().positive(),
  values: z.record(jsonScalarSchema)
}).strict();

const tableRowsSchema = z.object(
  Object.fromEntries(ACCOUNT_SYNC_TABLES.map((table) => [table, z.array(syncRowSchema)])) as Record<
    AccountSyncTable,
    z.ZodArray<typeof syncRowSchema>
  >
).strict();

const tableCountsSchema = z.object(
  Object.fromEntries(
    ACCOUNT_SYNC_TABLES.map((table) => [table, z.number().int().safe().nonnegative()])
  ) as Record<AccountSyncTable, z.ZodNumber>
).strict();

const tableDigestsSchema = z.object(
  Object.fromEntries(
    ACCOUNT_SYNC_TABLES.map((table) => [table, z.string().regex(/^[a-f0-9]{64}$/u)])
  ) as Record<AccountSyncTable, z.ZodString>
).strict();

const bundleSchema = z.object({
  formatVersion: z.literal(1),
  sourceDatabase: z.string().trim().min(1),
  sourceMigrationCount: z.number().int().safe().nonnegative(),
  sourceLatestMigration: z.string().trim().min(1),
  exportedAt: z.string().datetime({ offset: true }),
  verificationKey: z.string().regex(/^[a-f0-9]{64}$/u),
  tables: tableRowsSchema,
  counts: tableCountsSchema,
  digests: tableDigestsSchema
}).strict();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasExactTableKeys = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...ACCOUNT_SYNC_TABLES].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

export const canonicalizeCollection = (rows: readonly SyncRow[]): string =>
  JSON.stringify(
    [...rows]
      .sort((left, right) => left.sourceId - right.sourceId)
      .map(({ sourceId, values }) => ({
        sourceId,
        values: Object.fromEntries(
          Object.entries(values).sort(([left], [right]) => left.localeCompare(right))
        )
      }))
  );

export const collectionDigest = (key: string, rows: readonly SyncRow[]): string =>
  createHmac("sha256", Buffer.from(key, "hex"))
    .update(canonicalizeCollection(rows), "utf8")
    .digest("hex");

export const parseSelectiveAccountSyncBundle = (value: unknown): SelectiveAccountSyncBundle => {
  if (!isRecord(value)) throw new Error("ACCOUNT_SYNC_BUNDLE_INVALID");
  if (
    !hasExactTableKeys(value.tables) ||
    !hasExactTableKeys(value.counts) ||
    !hasExactTableKeys(value.digests)
  ) {
    throw new Error("ACCOUNT_SYNC_TABLE_SET_INVALID");
  }

  const parsed = bundleSchema.safeParse(value);
  if (!parsed.success) throw new Error("ACCOUNT_SYNC_BUNDLE_INVALID");

  for (const table of ACCOUNT_SYNC_TABLES) {
    const rows = parsed.data.tables[table] as SyncRow[];
    const sourceIds = new Set<number>();
    for (const row of rows) {
      if (sourceIds.has(row.sourceId)) {
        throw new Error("ACCOUNT_SYNC_DUPLICATE_SOURCE_ID");
      }
      sourceIds.add(row.sourceId);
    }

    if (parsed.data.counts[table] !== rows.length) {
      throw new Error("ACCOUNT_SYNC_COUNT_MISMATCH");
    }
    if (parsed.data.digests[table] !== collectionDigest(parsed.data.verificationKey, rows)) {
      throw new Error("ACCOUNT_SYNC_DIGEST_MISMATCH");
    }
  }

  return {
    formatVersion: parsed.data.formatVersion,
    sourceDatabase: parsed.data.sourceDatabase,
    sourceMigrationCount: parsed.data.sourceMigrationCount,
    sourceLatestMigration: parsed.data.sourceLatestMigration,
    exportedAt: parsed.data.exportedAt,
    verificationKey: parsed.data.verificationKey,
    tables: parsed.data.tables as Record<AccountSyncTable, SyncRow[]>,
    counts: parsed.data.counts as Record<AccountSyncTable, number>,
    digests: parsed.data.digests as Record<AccountSyncTable, string>
  };
};
