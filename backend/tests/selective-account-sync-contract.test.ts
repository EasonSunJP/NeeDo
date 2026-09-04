import {
  ACCOUNT_SYNC_TABLES,
  canonicalizeCollection,
  collectionDigest,
  parseSelectiveAccountSyncBundle,
  type SyncRow
} from "../src/staging/selective-account-sync-contract";

const verificationKey = "a".repeat(64);

const createMinimalBundle = () => ({
  formatVersion: 1,
  sourceDatabase: "needo_dev",
  sourceMigrationCount: 125,
  sourceLatestMigration: "20260903170000_order_review_shop_summary",
  exportedAt: "2026-09-05T00:00:00.000Z",
  verificationKey,
  tables: Object.fromEntries(ACCOUNT_SYNC_TABLES.map((name) => [name, []])),
  counts: Object.fromEntries(ACCOUNT_SYNC_TABLES.map((name) => [name, 0])),
  digests: Object.fromEntries(
    ACCOUNT_SYNC_TABLES.map((name) => [name, collectionDigest(verificationKey, [])])
  )
});

const withRows = (
  base: ReturnType<typeof createMinimalBundle>,
  table: (typeof ACCOUNT_SYNC_TABLES)[number],
  rows: Array<{ sourceId: number; values: Record<string, string | number | boolean | null> }>
) => ({
  ...base,
  tables: { ...base.tables, [table]: rows },
  counts: { ...base.counts, [table]: rows.length },
  digests: { ...base.digests, [table]: collectionDigest(verificationKey, rows) }
});

describe("selective account sync bundle contract", () => {
  it("uses the fixed allowlist table order", () => {
    expect(ACCOUNT_SYNC_TABLES).toEqual([
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
    ]);
  });

  it("accepts a complete empty allowlist bundle", () => {
    expect(parseSelectiveAccountSyncBundle(createMinimalBundle()).counts.users).toBe(0);
  });

  it("rejects unknown or extra table keys", () => {
    const minimal = createMinimalBundle();

    expect(() =>
      parseSelectiveAccountSyncBundle({
        ...minimal,
        tables: { ...minimal.tables, sessions: [] }
      })
    ).toThrow("ACCOUNT_SYNC_TABLE_SET_INVALID");
  });

  it("rejects unsafe scalar values", () => {
    const minimal = createMinimalBundle();
    const unsafe = withRows(minimal, "users", [
      { sourceId: 1, values: { unsafeId: Number.MAX_SAFE_INTEGER + 1 } }
    ]);

    expect(() => parseSelectiveAccountSyncBundle(unsafe)).toThrow("ACCOUNT_SYNC_BUNDLE_INVALID");
  });

  it("rejects duplicate source IDs within one table", () => {
    const duplicate = withRows(createMinimalBundle(), "users", [
      { sourceId: 1, values: { email: "one@example.test" } },
      { sourceId: 1, values: { email: "two@example.test" } }
    ]);

    expect(() => parseSelectiveAccountSyncBundle(duplicate)).toThrow(
      "ACCOUNT_SYNC_DUPLICATE_SOURCE_ID"
    );
  });

  it("canonicalizes object keys and source IDs before calculating a digest", () => {
    const rows: SyncRow[] = [
      { sourceId: 2, values: { z: "last", a: true } },
      { sourceId: 1, values: { b: null, a: 7 } }
    ];
    const reorderedRows: SyncRow[] = [
      { sourceId: 1, values: { a: 7, b: null } },
      { sourceId: 2, values: { a: true, z: "last" } }
    ];

    expect(canonicalizeCollection(rows)).toBe(canonicalizeCollection(reorderedRows));
    expect(collectionDigest(verificationKey, rows)).toBe(
      collectionDigest(verificationKey, reorderedRows)
    );
  });

  it("rejects every manifest count or digest mismatch", () => {
    const minimal = createMinimalBundle();

    expect(() =>
      parseSelectiveAccountSyncBundle({
        ...minimal,
        counts: { ...minimal.counts, users: 1 }
      })
    ).toThrow("ACCOUNT_SYNC_COUNT_MISMATCH");
    expect(() =>
      parseSelectiveAccountSyncBundle({
        ...minimal,
        digests: { ...minimal.digests, users: "b".repeat(64) }
      })
    ).toThrow("ACCOUNT_SYNC_DIGEST_MISMATCH");
  });
});
