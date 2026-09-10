type AuthorityEnvironment = Record<string, string | undefined>;
type SchemaColumn = { tableName: string; columnName: string };
export type RankingSchemaIndexColumn = {
  tableName: string;
  indexName: string;
  columnName: string;
  seqInIndex: number | bigint;
  nonUnique: number | bigint;
};

const authorityError =
  "Analytics ranking MySQL integration requires explicit loopback needo_test authority";
const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export const analyticsRankingRequiredColumns = [
  "booking_orders.id",
  "booking_orders.customer_user_id",
  "booking_orders.service_id",
  "booking_orders.technician_service_id",
  "booking_orders.shop_id",
  "booking_orders.technician_profile_id",
  "booking_orders.status",
  "booking_orders.currency",
  "booking_orders.payment_method",
  "booking_orders.payment_status",
  "booking_orders.payment_amount_jpy",
  "booking_orders.payment_confirmed_by_id",
  "booking_orders.payment_confirmed_at",
  "booking_orders.payment_reference",
  "booking_orders.payment_note",
  "booking_orders.payment_refunded_by_id",
  "booking_orders.payment_refunded_at",
  "booking_orders.payment_refund_reference",
  "booking_orders.payment_refund_reason",
  "booking_orders.deleted_at",
  "order_checkouts.id",
  "order_checkouts.booking_order_id",
  "order_checkouts.base_amount_jpy",
  "order_checkouts.add_on_amount_jpy",
  "order_checkouts.discount_amount_jpy",
  "order_checkouts.checkout_amount_jpy",
  "order_checkouts.payable_ndp",
  "order_checkouts.calculation_snapshot_json",
  "order_checkouts.payment_method",
  "order_checkouts.payment_selected_at",
  "order_checkouts.other_method_code",
  "order_checkouts.other_method_label",
  "order_checkouts.other_payment_reference",
  "order_checkouts.ledger_transaction_id",
  "order_checkouts.receipt_confirmed_by_id",
  "order_checkouts.receipt_confirmed_at",
  "order_checkouts.receipt_confirmation_reason",
  "order_checkouts.deleted_at",
  "order_service_sessions.id",
  "order_service_sessions.booking_order_id",
  "order_service_sessions.ended_at",
  "order_service_sessions.deleted_at",
  "order_service_events.id",
  "order_service_events.booking_order_id",
  "order_service_events.service_session_id",
  "order_service_events.order_add_on_id",
  "order_service_events.order_checkout_id",
  "order_service_events.event_type",
  "order_service_events.actor_user_id",
  "order_service_events.reason",
  "order_service_events.metadata",
  "order_service_events.occurred_at",
  "order_service_events.deleted_at",
  "order_add_ons.id",
  "order_add_ons.booking_order_id",
  "order_add_ons.service_id",
  "order_add_ons.status",
  "order_add_ons.price_amount_jpy",
  "order_add_ons.currency",
  "order_add_ons.proposed_at",
  "order_add_ons.deleted_at",
  "ledger_transactions.id",
  "ledger_transactions.type",
  "ledger_transactions.status",
  "ledger_transactions.reference_type",
  "ledger_transactions.reference_id",
  "ledger_transactions.actor_user_id",
  "ledger_transactions.amount",
  "ledger_transactions.currency",
  "ledger_transactions.created_at",
  "ledger_transactions.deleted_at",
  "audit_logs.id",
  "audit_logs.actor_id",
  "audit_logs.action",
  "audit_logs.target_type",
  "audit_logs.target_id",
  "audit_logs.metadata",
  "audit_logs.deleted_at",
  "services.id",
  "services.public_id",
  "services.category_id",
  "services.name",
  "services.created_at",
  "services.deleted_at",
  "technician_services.id",
  "technician_services.public_id",
  "technician_services.category_id",
  "technician_services.name",
  "technician_services.cover_image_url",
  "technician_services.created_at",
  "technician_services.deleted_at",
  "categories.id",
  "categories.is_active",
  "categories.deleted_at",
  "shops.id",
  "shops.city",
  "shops.deleted_at",
  "users.id",
  "users.needo_id",
  "users.username",
  "users.avatar_url",
  "users.is_active",
  "users.is_test_account",
  "users.created_at",
  "users.deleted_at",
  "technician_profiles.id",
  "technician_profiles.user_id",
  "technician_profiles.display_name",
  "technician_profiles.created_at",
  "technician_profiles.deleted_at",
  "customer_profiles.user_id",
  "customer_profiles.display_name",
  "customer_profiles.deleted_at",
  "media_assets.id",
  "media_assets.entity_type",
  "media_assets.entity_id",
  "media_assets.url",
  "media_assets.usage_type",
  "media_assets.sort_order",
  "media_assets.is_active",
  "media_assets.deleted_at"
] as const;

export const analyticsRankingRequiredIndexes = [
  {
    tableName: "booking_orders",
    indexName: "booking_orders_ranking_window_idx",
    columns: ["status", "payment_status", "deleted_at", "payment_confirmed_at", "shop_id", "id"],
    unique: false
  },
  {
    tableName: "technician_services",
    indexName: "technician_services_public_id_key",
    columns: ["public_id"],
    unique: true
  },
  {
    tableName: "order_service_events",
    indexName: "order_service_events_order_time_idx",
    columns: ["booking_order_id", "occurred_at", "deleted_at"],
    unique: false
  },
  {
    tableName: "order_add_ons",
    indexName: "order_add_ons_order_status_idx",
    columns: ["booking_order_id", "status", "deleted_at"],
    unique: false
  }
] as const;

export function requireAnalyticsRankingIntegrationAuthority(input: {
  enabled?: string;
  envFile?: string;
  parsed: AuthorityEnvironment;
  runtime?: AuthorityEnvironment;
}): string {
  if (input.enabled !== "true")
    throw new Error("Analytics ranking MySQL integration requires explicit opt-in");
  if (!input.envFile?.trim())
    throw new Error("Analytics ranking MySQL integration requires FORMAL_BACKEND_ENV_FILE");
  const databaseUrl = input.parsed.DATABASE_URL?.trim();
  if (!databaseUrl)
    throw new Error(
      "FORMAL_BACKEND_ENV_FILE must define DATABASE_URL; inherited values are forbidden"
    );
  if (
    [
      input.parsed.NODE_ENV,
      input.parsed.DEPLOY_ENV,
      input.runtime?.NODE_ENV,
      input.runtime?.DEPLOY_ENV
    ].some((value) => value !== undefined && /prod|production|staging/iu.test(value))
  ) {
    throw new Error("Analytics ranking MySQL integration requires a non-production environment");
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
  )
    throw new Error(authorityError);
  return databaseUrl;
}

export function assertAnalyticsRankingIntegrationSchema(
  availableColumns: SchemaColumn[],
  availableIndexes: RankingSchemaIndexColumn[],
  appliedMigrations: string[]
): void {
  if (!appliedMigrations.includes("20260902100000_analytics_ranking_identity_permission"))
    throw new Error(
      "Analytics ranking MySQL integration requires migration 20260902100000_analytics_ranking_identity_permission"
    );
  const columns = new Set(availableColumns.map((row) => `${row.tableName}.${row.columnName}`));
  const missing = analyticsRankingRequiredColumns.filter((column) => !columns.has(column));
  const indexErrors = analyticsRankingRequiredIndexes.flatMap((required) => {
    const rows = availableIndexes.filter((row) => row.indexName === required.indexName);
    if (rows.length === 0) return [`missing index ${required.indexName}`];
    if (rows.some((row) => row.tableName !== required.tableName))
      return [`index table mismatch ${required.indexName}`];
    const ordered = [...rows].sort((a, b) => Number(a.seqInIndex) - Number(b.seqInIndex));
    if (
      ordered.length !== required.columns.length ||
      ordered.some(
        (row, index) =>
          Number(row.seqInIndex) !== index + 1 || row.columnName !== required.columns[index]
      )
    )
      return [`index column/order mismatch ${required.indexName}`];
    if (ordered.some((row) => Number(row.nonUnique) !== (required.unique ? 0 : 1)))
      return [`index uniqueness mismatch ${required.indexName}`];
    return [];
  });
  if (missing.length || indexErrors.length)
    throw new Error(
      `Analytics ranking MySQL integration schema is incomplete; missing ${[...missing, ...indexErrors].join(", ")}`
    );
}
