type AuthorityEnvironment = Record<string, string | undefined>;

type SchemaColumn = { tableName: string; columnName: string };
export type SchemaIndexColumn = {
  tableName: string;
  indexName: string;
  columnName: string;
  seqInIndex: number | bigint;
  nonUnique: number | bigint;
};

const authorityError =
  "Membership analytics MySQL integration requires the explicit loopback needo_test database";
const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export const membershipAnalyticsIntegrationRequiredColumns = [
  "users.id",
  "users.needo_id",
  "users.email",
  "users.username",
  "users.is_active",
  "users.is_test_account",
  "users.deleted_at",
  "shops.id",
  "shops.shop_no",
  "shops.name",
  "shops.city",
  "shops.address",
  "shops.deleted_at",
  "customer_profiles.id",
  "customer_profiles.user_id",
  "customer_profiles.display_name",
  "customer_profiles.city",
  "customer_profiles.deleted_at",
  "shop_customer_memberships.id",
  "shop_customer_memberships.public_id",
  "shop_customer_memberships.shop_id",
  "shop_customer_memberships.customer_profile_id",
  "shop_customer_memberships.status",
  "shop_customer_memberships.started_at",
  "shop_customer_memberships.ended_at",
  "shop_customer_memberships.deleted_at",
  "shop_membership_cards.id",
  "shop_membership_cards.public_id",
  "shop_membership_cards.membership_id",
  "shop_membership_cards.plan_version_id",
  "shop_membership_cards.issued_by_id",
  "shop_membership_cards.card_no",
  "shop_membership_cards.name",
  "shop_membership_cards.type",
  "shop_membership_cards.status",
  "shop_membership_cards.issuance_source",
  "shop_membership_cards.issued_at",
  "shop_membership_cards.expires_at",
  "shop_membership_cards.frozen_at",
  "shop_membership_cards.deleted_at",
  "shop_membership_card_status_events.id",
  "shop_membership_card_status_events.card_id",
  "shop_membership_card_status_events.from_status",
  "shop_membership_card_status_events.to_status",
  "shop_membership_card_status_events.source",
  "shop_membership_card_status_events.occurred_at",
  "shop_membership_card_status_events.reason_code",
  "shop_membership_card_status_events.actor_user_id",
  "shop_membership_card_status_events.metadata",
  "shop_membership_card_status_events.event_key",
  "shop_membership_card_status_events.deleted_at",
  "shop_membership_card_plan_versions.id",
  "shop_membership_card_plan_versions.name"
] as const;

export const membershipAnalyticsIntegrationRequiredIndexes = [
  {
    tableName: "shop_membership_cards",
    indexName: "shop_membership_cards_status_expiry_idx",
    columns: ["status", "expires_at", "deleted_at"],
    unique: false
  },
  {
    tableName: "shop_membership_cards",
    indexName: "shop_membership_cards_source_issued_id_idx",
    columns: ["issuance_source", "issued_at", "id"],
    unique: false
  },
  {
    tableName: "shop_membership_cards",
    indexName: "shop_membership_cards_membership_source_issued_id_idx",
    columns: ["membership_id", "issuance_source", "issued_at", "id"],
    unique: false
  },
  {
    tableName: "shop_membership_cards",
    indexName: "shop_membership_cards_status_issued_expiry_idx",
    columns: ["status", "issued_at", "expires_at", "deleted_at", "membership_id"],
    unique: false
  },
  {
    tableName: "shop_membership_card_status_events",
    indexName: "shop_membership_card_status_events_event_key",
    columns: ["event_key"],
    unique: true
  },
  {
    tableName: "shop_membership_card_status_events",
    indexName: "shop_membership_card_status_events_card_time_idx",
    columns: ["card_id", "occurred_at", "id", "deleted_at"],
    unique: false
  },
  {
    tableName: "shop_membership_card_status_events",
    indexName: "shop_membership_card_status_events_status_time_idx",
    columns: ["to_status", "occurred_at", "id", "deleted_at"],
    unique: false
  }
] as const;

export function requireMembershipAnalyticsIntegrationAuthority(input: {
  enabled?: string;
  envFile?: string;
  parsed: AuthorityEnvironment;
  runtime?: AuthorityEnvironment;
}): string {
  if (input.enabled !== "true") {
    throw new Error("Membership analytics MySQL integration requires explicit opt-in");
  }
  if (!input.envFile?.trim()) {
    throw new Error("Membership analytics MySQL integration requires FORMAL_BACKEND_ENV_FILE");
  }
  const databaseUrl = input.parsed.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      "FORMAL_BACKEND_ENV_FILE must define DATABASE_URL; inherited values are forbidden"
    );
  }
  const deploymentValues = [
    input.parsed.NODE_ENV,
    input.parsed.DEPLOY_ENV,
    input.runtime?.NODE_ENV,
    input.runtime?.DEPLOY_ENV
  ];
  if (
    deploymentValues.some((value) => value !== undefined && /prod|production|staging/iu.test(value))
  ) {
    throw new Error("Membership analytics MySQL integration requires a non-production environment");
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(authorityError);
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (
    parsed.protocol !== "mysql:" ||
    !allowedHosts.has(parsed.hostname) ||
    database !== "needo_test"
  ) {
    throw new Error(authorityError);
  }
  return databaseUrl;
}

export function assertMembershipAnalyticsIntegrationSchema(
  availableColumns: SchemaColumn[],
  availableIndexes: SchemaIndexColumn[],
  appliedMigrations: string[]
): void {
  if (!appliedMigrations.includes("20260901103000_membership_acquisition_sources")) {
    throw new Error(
      "Membership analytics MySQL integration requires migration 20260901103000_membership_acquisition_sources"
    );
  }
  const columns = new Set(
    availableColumns.map((column) => `${column.tableName}.${column.columnName}`)
  );
  const missingColumns = membershipAnalyticsIntegrationRequiredColumns.filter(
    (column) => !columns.has(column)
  );
  const indexErrors = membershipAnalyticsIntegrationRequiredIndexes.flatMap((required) => {
    const matchingName = availableIndexes.filter((row) => row.indexName === required.indexName);
    if (matchingName.length === 0) return [`missing index ${required.indexName}`];
    if (matchingName.some((row) => row.tableName !== required.tableName)) {
      return [`index table mismatch ${required.indexName}`];
    }
    const ordered = [...matchingName].sort(
      (left, right) => Number(left.seqInIndex) - Number(right.seqInIndex)
    );
    const exactSequence = ordered.every((row, index) => Number(row.seqInIndex) === index + 1);
    const exactColumns =
      ordered.length === required.columns.length &&
      ordered.every((row, index) => row.columnName === required.columns[index]);
    if (!exactSequence || !exactColumns) {
      return [`index column/order mismatch ${required.indexName}`];
    }
    const expectedNonUnique = required.unique ? 0 : 1;
    if (ordered.some((row) => Number(row.nonUnique) !== expectedNonUnique)) {
      return [`index uniqueness mismatch ${required.indexName}`];
    }
    return [];
  });
  if (missingColumns.length > 0 || indexErrors.length > 0) {
    throw new Error(
      `Membership analytics MySQL integration schema is incomplete; missing ${[
        ...missingColumns,
        ...indexErrors
      ].join(", ")}`
    );
  }
}
