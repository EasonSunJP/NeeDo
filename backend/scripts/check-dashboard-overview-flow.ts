import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";
import type { PrismaClient } from "@prisma/client";
import type { AnalyticsMetricPayload } from "../src/domain/analytics-metric";

type Environment = Record<string, string | undefined>;
type PeriodKey = "current" | "previous";

export const DASHBOARD_CHECK_READY_METRIC_KEYS = [
  "gross_revenue",
  "discount_amount",
  "dedicated_technician_commission",
  "part_time_technician_commission",
  "marketing_commission",
  "ndp_income",
  "affiliate_platform_income",
  "new_users",
  "new_paid_members",
  "technician_onboarding"
] as const;

export type DashboardCheckReadyMetricKey = typeof DASHBOARD_CHECK_READY_METRIC_KEYS[number];
export type DashboardCheckMetricKey =
  | DashboardCheckReadyMetricKey
  | "travel_fare"
  | "consumables_sales"
  | "agent_commission"
  | "consumables_profit"
  | "agent_onboarding"
  | "franchisee_onboarding"
  | "supplier_onboarding";

interface DashboardCheckMetricMetadata {
  metricKey: DashboardCheckMetricKey;
  unit: AnalyticsMetricPayload["unit"];
  dataStatus: AnalyticsMetricPayload["dataStatus"];
  description: string;
  formula: string;
  detailRoute: string | null;
}

const detailRoute = (metricKey: DashboardCheckMetricKey): string =>
  `/admin/analytics/metrics/${metricKey}`;

// This is deliberately duplicated rather than imported from BackofficeService. It is the
// checker's independent public contract oracle.
export const DASHBOARD_CHECK_METRIC_ORACLE: readonly DashboardCheckMetricMetadata[] = [
  { metricKey: "gross_revenue", unit: "jpy", dataStatus: "ready", description: "Completed checkout amount sum", formula: "SUM(completed checkoutAmountJpy)", detailRoute: detailRoute("gross_revenue") },
  { metricKey: "travel_fare", unit: "jpy", dataStatus: "not_connected", description: "Reserved formal travel fare source", formula: "SUM(travel fare)", detailRoute: detailRoute("travel_fare") },
  { metricKey: "discount_amount", unit: "jpy", dataStatus: "ready", description: "Immutable base and add-on amount minus checkout amount", formula: "SUM(discountAmountJpy)", detailRoute: detailRoute("discount_amount") },
  { metricKey: "consumables_sales", unit: "jpy", dataStatus: "not_connected", description: "Formal Store consumables sales excluding invalid orders", formula: "SUM(consumables sales excluding invalid orders)", detailRoute: detailRoute("consumables_sales") },
  { metricKey: "dedicated_technician_commission", unit: "jpy", dataStatus: "ready", description: "Natural-month daily base allocation plus settled share for dedicated technicians", formula: "SUM(natural-month daily base allocation + settled share)", detailRoute: detailRoute("dedicated_technician_commission") },
  { metricKey: "part_time_technician_commission", unit: "jpy", dataStatus: "ready", description: "Natural-month daily base allocation plus settled share across associated shops", formula: "SUM(natural-month daily base allocation + settled share across associated shops)", detailRoute: detailRoute("part_time_technician_commission") },
  { metricKey: "marketing_commission", unit: "ndp", dataStatus: "ready", description: "Settled affiliate claimant reward", formula: "SUM(settled affiliate claimant reward)", detailRoute: detailRoute("marketing_commission") },
  { metricKey: "agent_commission", unit: "jpy", dataStatus: "not_available", description: "Settled agent success reward plus profit share", formula: "SUM(settled success reward + settled profit share)", detailRoute: detailRoute("agent_commission") },
  { metricKey: "ndp_income", unit: "ndp", dataStatus: "ready", description: "Settled production platform NDP income", formula: "SUM(settled production platform NDP income)", detailRoute: detailRoute("ndp_income") },
  { metricKey: "affiliate_platform_income", unit: "ndp", dataStatus: "ready", description: "Settled affiliate platform fee", formula: "SUM(settled affiliate platform fee)", detailRoute: detailRoute("affiliate_platform_income") },
  { metricKey: "consumables_profit", unit: "jpy", dataStatus: "not_connected", description: "Tax-exclusive consumables base times the effective platform share", formula: "SUM(tax-exclusive base * effective platform share)", detailRoute: detailRoute("consumables_profit") },
  { metricKey: "new_users", unit: "people", dataStatus: "ready", description: "Distinct first formal user registrations", formula: "COUNT(DISTINCT first formal registration)", detailRoute: detailRoute("new_users") },
  { metricKey: "new_paid_members", unit: "people", dataStatus: "ready", description: "Distinct first offline-paid active cards excluding grant, trial, replacement and renewal", formula: "COUNT(DISTINCT first offline-paid active membership card)", detailRoute: detailRoute("new_paid_members") },
  { metricKey: "technician_onboarding", unit: "people", dataStatus: "ready", description: "Distinct first technician identity activations", formula: "COUNT(DISTINCT first technician identity activation)", detailRoute: detailRoute("technician_onboarding") },
  { metricKey: "agent_onboarding", unit: "people", dataStatus: "not_available", description: "Distinct first formal agent markings", formula: "COUNT(DISTINCT first formal agent marking)", detailRoute: detailRoute("agent_onboarding") },
  { metricKey: "franchisee_onboarding", unit: "people", dataStatus: "not_available", description: "Distinct first formal franchisee markings", formula: "COUNT(DISTINCT first formal franchisee marking)", detailRoute: null },
  { metricKey: "supplier_onboarding", unit: "people", dataStatus: "not_available", description: "Distinct first formal supplier markings", formula: "COUNT(DISTINCT first formal supplier marking)", detailRoute: null }
] as const;

export interface DashboardCheckerAuthority {
  envFilePath: string;
  databaseUrl: string;
  databaseHost: string;
  databaseName: string;
  city: string;
  from: string;
  to: string;
  manifestFilePath: string;
}

export interface DashboardFixtureManifest {
  version: 1;
  namespace: string;
  marker: string;
  city: string;
  windows: {
    current: { from: string; to: string };
    previous: { from: string; to: string };
  };
  witnesses: {
    coherentCompletedCheckoutIds: string[];
    cancelledOrderIds: string[];
    refundedOrderIds: string[];
    reversedFinancialIds: string[];
    otherCityOrderIds: string[];
    testNdpLedgerIds: string[];
    firstPaidMembershipCardIds: string[];
    excludedMembershipCardIds: string[];
    technicianIdentityIds: string[];
    compensationProfileIds: string[];
    ndpIncomeFinancialIds: string[];
    affiliateRewardIds: string[];
  };
  readyMetricWitnesses: Record<DashboardCheckReadyMetricKey, {
    current: string[];
    previous: string[];
  }>;
}

export interface IndependentEvidenceRow {
  metricKey: DashboardCheckReadyMetricKey;
  period: PeriodKey;
  witnessId: string;
  value: number | bigint | string;
}

export interface FixtureWitnessRow {
  kind: keyof DashboardFixtureManifest["witnesses"];
  witnessId: string;
}

export type IndependentReadyValues = Record<DashboardCheckReadyMetricKey, {
  current: number;
  previous: number;
}>;

interface CheckerFileSystem {
  resolve: (path: string) => string;
  existsSync: (path: string) => boolean;
  readFileSync: (path: string) => string;
  statSync: (path: string) => { mode: number; isFile: () => boolean };
}

const fileSystem: CheckerFileSystem = {
  resolve,
  existsSync,
  readFileSync: (path) => readFileSync(path, "utf8"),
  statSync
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/u;
const productionEnvironment = /^(?:prod|production|staging|live)$/iu;
const productionLooking = /(?:prod(?:uction)?|staging|live)/iu;
const localPurpose = /(?:test|dev|local)/iu;
const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);

const requireParsedValue = (values: Record<string, string>, key: string): string => {
  const value = values[key]?.trim();
  if (!value) throw new Error(`${key} is required in FORMAL_BACKEND_ENV_FILE`);
  return value;
};

const parseDate = (value: string, name: string): Date => {
  if (!datePattern.test(value)) throw new Error(`${name} must be a calendar date`);
  const date = new Date(`${value}T00:00:00.000+09:00`);
  if (!Number.isFinite(date.getTime()) || toTokyoDate(date) !== value) {
    throw new Error(`${name} must be a valid Tokyo calendar date`);
  }
  return date;
};

const toTokyoDate = (date: Date): string => {
  const tokyo = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return [
    String(tokyo.getUTCFullYear()).padStart(4, "0"),
    String(tokyo.getUTCMonth() + 1).padStart(2, "0"),
    String(tokyo.getUTCDate()).padStart(2, "0")
  ].join("-");
};

export function loadDashboardCheckerAuthority(
  runtimeEnvironment: Environment,
  fs: CheckerFileSystem = fileSystem
): DashboardCheckerAuthority {
  const requested = runtimeEnvironment.FORMAL_BACKEND_ENV_FILE?.trim();
  if (!requested) throw new Error("FORMAL_BACKEND_ENV_FILE is required");
  const envFilePath = fs.resolve(requested);
  if (!fs.existsSync(envFilePath)) throw new Error("FORMAL_BACKEND_ENV_FILE does not exist");
  const parsed = parse(fs.readFileSync(envFilePath));
  for (const key of ["NODE_ENV", "DEPLOY_ENV"] as const) {
    if (productionEnvironment.test(parsed[key]?.trim() ?? "")) {
      throw new Error("Dashboard checker refuses a production environment");
    }
  }
  const databaseUrl = requireParsedValue(parsed, "DATABASE_URL");
  let database: URL;
  try {
    database = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid MySQL URL");
  }
  if (database.protocol !== "mysql:") throw new Error("DATABASE_URL must use MySQL");
  const databaseHost = database.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  if (!loopbackHosts.has(databaseHost)) {
    throw new Error("DATABASE_URL must use a loopback MySQL host");
  }
  const databaseName = decodeURIComponent(database.pathname.replace(/^\/+/, "")).trim();
  if (!databaseName || !localPurpose.test(databaseName)) {
    throw new Error("Database name must contain test, dev, or local");
  }
  if (productionLooking.test(databaseName)) throw new Error("Database name is production-looking");

  const city = requireParsedValue(parsed, "DASHBOARD_OVERVIEW_CHECK_CITY");
  const from = requireParsedValue(parsed, "DASHBOARD_OVERVIEW_CHECK_FROM");
  const to = requireParsedValue(parsed, "DASHBOARD_OVERVIEW_CHECK_TO");
  parseDate(from, "DASHBOARD_OVERVIEW_CHECK_FROM");
  parseDate(to, "DASHBOARD_OVERVIEW_CHECK_TO");
  if (from > to) throw new Error("Dashboard checker current date range is invalid");
  const manifestFilePath = fs.resolve(
    requireParsedValue(parsed, "DASHBOARD_OVERVIEW_FIXTURE_MANIFEST_FILE")
  );
  if (!fs.existsSync(manifestFilePath)) throw new Error("Dashboard fixture manifest does not exist");
  const manifestStat = fs.statSync(manifestFilePath);
  if (!manifestStat.isFile()) throw new Error("Dashboard fixture manifest must be a file");
  if ((manifestStat.mode & 0o222) !== 0) throw new Error("Dashboard fixture manifest must be read-only");
  const repositoryRoot = resolve(__dirname, "../..");
  if (manifestFilePath === repositoryRoot || manifestFilePath.startsWith(`${repositoryRoot}/`)) {
    throw new Error("Dashboard fixture manifest must be external to repo-generated state");
  }
  return {
    envFilePath,
    databaseUrl,
    databaseHost,
    databaseName,
    city,
    from,
    to,
    manifestFilePath
  };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireVisible = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Dashboard fixture manifest is incomplete: ${label}`);
  }
  return value;
};

const requireIds = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Dashboard fixture manifest is incomplete: ${label}`);
  }
  const ids = value.map((id) => requireVisible(id, label));
  if (new Set(ids).size !== ids.length) {
    throw new Error(`Dashboard fixture manifest has duplicate IDs: ${label}`);
  }
  return ids;
};

export function resolveCheckerWindows(from: string, to: string): {
  current: { from: string; to: string; fromInclusive: string; toExclusive: string };
  previous: { from: string; to: string; fromInclusive: string; toExclusive: string };
} {
  const fromDate = parseDate(from, "from");
  const toDate = parseDate(to, "to");
  if (fromDate > toDate) throw new Error("Dashboard checker date range is invalid");
  const days = Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
  const toExclusive = new Date(toDate.getTime() + 86_400_000);
  const previousTo = new Date(fromDate.getTime() - 86_400_000);
  const previousFrom = new Date(previousTo.getTime() - (days - 1) * 86_400_000);
  return {
    current: {
      from,
      to,
      fromInclusive: fromDate.toISOString(),
      toExclusive: toExclusive.toISOString()
    },
    previous: {
      from: toTokyoDate(previousFrom),
      to: toTokyoDate(previousTo),
      fromInclusive: previousFrom.toISOString(),
      toExclusive: fromDate.toISOString()
    }
  };
}

export function parseDashboardFixtureManifest(
  serialized: string,
  authority: Pick<DashboardCheckerAuthority, "city" | "from" | "to">
): DashboardFixtureManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(serialized) as unknown;
  } catch {
    throw new Error("Dashboard fixture manifest must be valid JSON");
  }
  if (!isObject(raw) || raw.version !== 1 || !isObject(raw.windows) || !isObject(raw.witnesses) || !isObject(raw.readyMetricWitnesses)) {
    throw new Error("Dashboard fixture manifest is incomplete");
  }
  const rawWindows = raw.windows;
  const rawWitnesses = raw.witnesses;
  const rawReadyMetricWitnesses = raw.readyMetricWitnesses;
  const namespace = requireVisible(raw.namespace, "namespace");
  const marker = requireVisible(raw.marker, "marker");
  const city = requireVisible(raw.city, "city");
  if (namespace === marker) throw new Error("Dashboard fixture namespace and marker must be distinct");
  const resolved = resolveCheckerWindows(authority.from, authority.to);
  const current = rawWindows.current;
  const previous = rawWindows.previous;
  if (!isObject(current) || !isObject(previous)) throw new Error("Dashboard fixture windows are incomplete");
  if (
    city !== authority.city ||
    current.from !== authority.from || current.to !== authority.to ||
    previous.from !== resolved.previous.from || previous.to !== resolved.previous.to
  ) {
    throw new Error("Dashboard fixture manifest does not match environment authority");
  }
  const witnessKeys = [
    "coherentCompletedCheckoutIds", "cancelledOrderIds", "refundedOrderIds",
    "reversedFinancialIds", "otherCityOrderIds", "testNdpLedgerIds",
    "firstPaidMembershipCardIds", "excludedMembershipCardIds", "technicianIdentityIds",
    "compensationProfileIds", "ndpIncomeFinancialIds", "affiliateRewardIds"
  ] as const;
  const witnesses = Object.fromEntries(
    witnessKeys.map((key) => [key, requireIds(rawWitnesses[key], key)])
  ) as unknown as DashboardFixtureManifest["witnesses"];
  const readyMetricWitnesses = Object.fromEntries(DASHBOARD_CHECK_READY_METRIC_KEYS.map((key) => {
    const family = rawReadyMetricWitnesses[key];
    if (!isObject(family)) throw new Error(`Dashboard fixture manifest is incomplete: ${key}`);
    return [key, {
      current: requireIds(family.current, `${key}.current`),
      previous: requireIds(family.previous, `${key}.previous`)
    }];
  })) as DashboardFixtureManifest["readyMetricWitnesses"];
  return {
    version: 1,
    namespace,
    marker,
    city,
    windows: {
      current: { from: authority.from, to: authority.to },
      previous: { from: resolved.previous.from, to: resolved.previous.to }
    },
    witnesses,
    readyMetricWitnesses
  };
}

const forbiddenGrant = /\b(?:ALL(?:\s+PRIVILEGES)?|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRIGGER|EXECUTE|EVENT|LOCK(?:\s+TABLES)?)\b/iu;

export function assertSelectOnlyGrants(grants: readonly string[]): void {
  if (grants.length === 0 || grants.some((grant) => forbiddenGrant.test(grant))) {
    throw new Error("Dashboard checker requires a SELECT-only MySQL credential");
  }
  const allowed = grants.every((grant) =>
    /\bGRANT\s+(?:SELECT|USAGE)\b/iu.test(grant)
  );
  if (!allowed || !grants.some((grant) => /\bGRANT\s+SELECT\b/iu.test(grant))) {
    throw new Error("Dashboard checker requires a SELECT-only MySQL credential");
  }
}

type QueryRaw = (query: unknown, ...values: unknown[]) => Promise<unknown>;

const queryText = (query: unknown): string => {
  if (typeof query === "string") return query;
  if (isObject(query)) {
    if (typeof query.sql === "string") return query.sql;
    if (typeof query.text === "string") return query.text;
    if (Array.isArray(query.strings)) return query.strings.join("?");
  }
  return String(query);
};

export interface SelectOnlyQueryFacade {
  $queryRaw: <T = unknown>(query: unknown, ...values: unknown[]) => Promise<T>;
}

export function createSelectOnlyQueryFacade(client: { $queryRaw: QueryRaw }): SelectOnlyQueryFacade {
  return Object.freeze({
    $queryRaw: async <T = unknown>(query: unknown, ...values: unknown[]): Promise<T> => {
      const statement = queryText(query).trim().replace(/^\/\*[\s\S]*?\*\//u, "").trim();
      if (!/^(?:SELECT|WITH|SHOW)\b/iu.test(statement)) {
        throw new Error("Dashboard checker read-only facade rejected a non-SELECT query");
      }
      return client.$queryRaw(query, ...values) as Promise<T>;
    }
  });
}

const toSafeValue = (value: IndependentEvidenceRow["value"]): number => {
  if (typeof value === "bigint") {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Independent evidence value is invalid");
    return Number(value);
  }
  const number = typeof value === "string" && /^(?:0|[1-9]\d*)$/u.test(value)
    ? Number(value)
    : value;
  if (!Number.isSafeInteger(number) || Number(number) < 0) {
    throw new Error("Independent evidence value is invalid");
  }
  return Number(number);
};

export function aggregateIndependentEvidence(
  fixture: DashboardFixtureManifest,
  rows: readonly IndependentEvidenceRow[]
): IndependentReadyValues {
  const sums = {} as IndependentReadyValues;
  const seen = new Set<string>();
  for (const key of DASHBOARD_CHECK_READY_METRIC_KEYS) {
    sums[key] = { current: 0, previous: 0 };
  }
  for (const row of rows) {
    if (!DASHBOARD_CHECK_READY_METRIC_KEYS.includes(row.metricKey)) {
      throw new Error("Independent evidence metric family is incomplete");
    }
    if (row.period !== "current" && row.period !== "previous") {
      throw new Error("Independent evidence period is invalid");
    }
    const authorized = fixture.readyMetricWitnesses[row.metricKey][row.period];
    if (!authorized.includes(row.witnessId)) {
      throw new Error("Independent evidence row is not manifest-authorized");
    }
    const key = `${row.metricKey}:${row.period}:${row.witnessId}`;
    if (seen.has(key)) throw new Error("Independent evidence contains duplicate rows");
    seen.add(key);
    const next = sums[row.metricKey][row.period] + toSafeValue(row.value);
    if (!Number.isSafeInteger(next)) throw new Error("Independent evidence aggregate is unsafe");
    sums[row.metricKey][row.period] = next;
  }
  for (const metricKey of DASHBOARD_CHECK_READY_METRIC_KEYS) {
    for (const period of ["current", "previous"] as const) {
      for (const witnessId of fixture.readyMetricWitnesses[metricKey][period]) {
        if (!seen.has(`${metricKey}:${period}:${witnessId}`)) {
          throw new Error(`Independent evidence is missing ${metricKey}.${period} witness`);
        }
      }
    }
  }
  if (Object.values(sums).every(({ current, previous }) => current === 0 && previous === 0)) {
    throw new Error("Independent evidence cannot be an all-zero fixture");
  }
  return sums;
}

export function assertFixtureWitnessRows(
  fixture: DashboardFixtureManifest,
  rows: readonly FixtureWitnessRow[]
): void {
  const expected = new Set<string>();
  for (const [kind, witnessIds] of Object.entries(fixture.witnesses)) {
    for (const witnessId of witnessIds) expected.add(`${kind}:${witnessId}`);
  }
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.kind}:${row.witnessId}`;
    if (!expected.has(key)) throw new Error("Fixture witness row is not manifest-authorized");
    if (seen.has(key)) throw new Error("Fixture witness query returned a duplicate row");
    seen.add(key);
  }
  for (const key of expected) {
    if (!seen.has(key)) throw new Error(`Fixture witness query is missing ${key}`);
  }
}

const roundPercent = (value: number): number => {
  const scaled = Number((Math.abs(value) * 100).toPrecision(15));
  const rounded = Math.sign(value) * Math.round(scaled) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
};

export function compareDashboardValues(current: number | null, previous: number | null): {
  percent: number | null;
  direction: "up" | "down" | "flat" | "unavailable";
} {
  if ((current !== null && !Number.isFinite(current)) || (previous !== null && !Number.isFinite(previous))) {
    throw new Error("Independent comparison requires finite values");
  }
  if (current === null || previous === null) return { percent: null, direction: "unavailable" };
  if (current === previous) return { percent: 0, direction: "flat" };
  const raw = previous === 0
    ? current > 0 ? 100 : -100
    : ((current - previous) / Math.abs(previous)) * 100;
  const percent = roundPercent(raw);
  return { percent, direction: percent > 0 ? "up" : percent < 0 ? "down" : "flat" };
}

interface ProjectionMetric extends DashboardCheckMetricMetadata {
  currentValue: number | null;
  previousValue: number | null;
  comparisonPercent: number | null;
  comparisonDirection: "up" | "down" | "flat" | "unavailable";
}

interface ProjectionFilter {
  period: string;
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
  timeZone: string;
  granularity: string;
  city: string | null;
}

export interface DashboardCheckerProjection {
  filter: ProjectionFilter;
  operationsFinance: ProjectionMetric[];
  commissionMetrics: ProjectionMetric[];
  growthMetrics: ProjectionMetric[];
  details: Record<string, {
    filter: ProjectionFilter;
    metric: ProjectionMetric;
    series: Array<{
      seriesKey: string;
      label: string;
      unit: string;
      points: Array<{ key: string; label: string; value: number | null }>;
    }>;
  }>;
}

const equal = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

const expectedMetric = (
  metadata: DashboardCheckMetricMetadata,
  values: IndependentReadyValues
): ProjectionMetric => {
  const ready = values[metadata.metricKey as DashboardCheckReadyMetricKey];
  const currentValue = metadata.dataStatus === "ready" ? ready.current : null;
  const previousValue = metadata.dataStatus === "ready" ? ready.previous : null;
  const comparison = compareDashboardValues(currentValue, previousValue);
  return {
    ...metadata,
    currentValue,
    previousValue,
    comparisonPercent: comparison.percent,
    comparisonDirection: comparison.direction
  };
};

export function assertDashboardProjection(
  projection: DashboardCheckerProjection,
  fixture: DashboardFixtureManifest,
  values: IndependentReadyValues
): void {
  const filter = {
    period: "custom",
    from: fixture.windows.current.from,
    to: fixture.windows.current.to,
    previousFrom: fixture.windows.previous.from,
    previousTo: fixture.windows.previous.to,
    timeZone: "Asia/Tokyo",
    granularity: "day",
    city: fixture.city
  };
  if (!equal(projection.filter, filter)) throw new Error("Dashboard overview filter does not match fixture authority");
  const expected = DASHBOARD_CHECK_METRIC_ORACLE.map((metadata) => expectedMetric(metadata, values));
  const actual = [
    ...projection.operationsFinance,
    ...projection.commissionMetrics,
    ...projection.growthMetrics
  ];
  if (projection.operationsFinance.length !== 4 || projection.commissionMetrics.length !== 7 || projection.growthMetrics.length !== 6) {
    throw new Error("Dashboard metric group size is invalid");
  }
  if (actual.map(({ metricKey }) => metricKey).join("|") !== expected.map(({ metricKey }) => metricKey).join("|")) {
    throw new Error("Dashboard metric order is invalid");
  }
  if (!equal(actual, expected)) throw new Error("Dashboard metric projection does not match independent oracle");
  for (const metric of expected) {
    const detail = projection.details[metric.metricKey];
    const expectedDetail = {
      filter,
      metric,
      series: [{
        seriesKey: metric.metricKey,
        label: metric.description,
        unit: metric.unit,
        points: [
          { key: "previous", label: `${fixture.windows.previous.from} - ${fixture.windows.previous.to}`, value: metric.previousValue },
          { key: "current", label: `${fixture.windows.current.from} - ${fixture.windows.current.to}`, value: metric.currentValue }
        ]
      }]
    };
    if (!detail || !equal(detail, expectedDetail)) {
      throw new Error(`Dashboard detail projection is invalid: ${metric.metricKey}`);
    }
  }
  if (Object.keys(projection.details).length !== 17) {
    throw new Error("Dashboard detail projection contains unexpected metrics");
  }
}

const grantsFromRows = (rows: unknown): string[] => {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => isObject(row)
    ? Object.values(row).filter((value): value is string => typeof value === "string")
    : []);
};

const sqlLiteral = (value: string): string => `'${value.replaceAll("'", "''")}'`;
const mysqlTimestamp = (iso: string): string => iso.replace("T", " ").replace(/Z$/u, "");

const authorizedEvidenceCte = (fixture: DashboardFixtureManifest): string =>
  Object.entries(fixture.readyMetricWitnesses).flatMap(([metricKey, periods]) =>
    (["current", "previous"] as const).flatMap((period) =>
      periods[period].map((witnessId) =>
        `SELECT ${sqlLiteral(metricKey)} AS metric_key, ${sqlLiteral(period)} AS period_key, ${sqlLiteral(witnessId)} AS witness_id`
      )
    )
  ).join(" UNION ALL ");

const validCompletedCheckoutPredicate = `
  booking.deleted_at IS NULL
  AND booking.status = 'completed'
  AND booking.payment_status = 'confirmed'
  AND booking.payment_confirmed_by_id IS NOT NULL
  AND booking.payment_refunded_at IS NULL
  AND booking.payment_refunded_by_id IS NULL
  AND booking.payment_refund_reference IS NULL
  AND booking.payment_refund_reason IS NULL
  AND checkout.deleted_at IS NULL
  AND checkout.base_amount_jpy >= 0
  AND checkout.add_on_amount_jpy >= 0
  AND checkout.discount_amount_jpy >= 0
  AND checkout.checkout_amount_jpy >= 0
  AND checkout.base_amount_jpy + checkout.add_on_amount_jpy - checkout.discount_amount_jpy = checkout.checkout_amount_jpy
  AND booking.payment_amount_jpy = checkout.checkout_amount_jpy
  AND booking.payment_method = checkout.payment_method
  AND checkout.payment_selected_at IS NOT NULL
  AND checkout.payment_selected_at <= booking.payment_confirmed_at`;

// This deliberately uses independent row-level SQL rather than the production aggregate
// repositories. Each contribution is scoped by one immutable manifest witness. The formal
// readers still run separately below, so malformed evidence cannot be accepted by two calls
// to the same aggregation implementation.
const independentEvidenceStatement = (fixture: DashboardFixtureManifest): string => {
  const windows = resolveCheckerWindows(
    fixture.windows.current.from,
    fixture.windows.current.to
  );
  const periodBounds = `
    SELECT 'current' AS period_key, TIMESTAMP(${sqlLiteral(mysqlTimestamp(windows.current.fromInclusive))}) AS from_inclusive,
      TIMESTAMP(${sqlLiteral(mysqlTimestamp(windows.current.toExclusive))}) AS to_exclusive
    UNION ALL
    SELECT 'previous', TIMESTAMP(${sqlLiteral(mysqlTimestamp(windows.previous.fromInclusive))}),
      TIMESTAMP(${sqlLiteral(mysqlTimestamp(windows.previous.toExclusive))})`;
  return `/* dashboard_checker_independent_evidence */
    WITH authorized AS (${authorizedEvidenceCte(fixture)}),
    periods AS (${periodBounds}),
    operation_rows AS (
      SELECT authorized.metric_key, authorized.period_key, authorized.witness_id,
        CASE authorized.metric_key
          WHEN 'gross_revenue' THEN checkout.checkout_amount_jpy
          ELSE checkout.discount_amount_jpy
        END AS contribution_value
      FROM authorized
      INNER JOIN periods AS period ON period.period_key = authorized.period_key
      INNER JOIN booking_orders AS booking
        ON (booking.order_no = authorized.witness_id OR CAST(booking.id AS CHAR) = authorized.witness_id)
      INNER JOIN shops AS shop ON shop.id = booking.shop_id AND shop.deleted_at IS NULL
      INNER JOIN order_checkouts AS checkout ON checkout.booking_order_id = booking.id
      WHERE authorized.metric_key IN ('gross_revenue', 'discount_amount')
        AND TRIM(shop.city) = ${sqlLiteral(fixture.city)}
        AND booking.payment_confirmed_at >= period.from_inclusive
        AND booking.payment_confirmed_at < period.to_exclusive
        AND ${validCompletedCheckoutPredicate}
        AND (
          (checkout.payment_method = 'ndp'
            AND EXISTS (
              SELECT 1 FROM ledger_transactions AS payment_ledger
              WHERE payment_ledger.id = checkout.ledger_transaction_id
                AND payment_ledger.type = 'booking_complete_settlement'
                AND payment_ledger.status = 'applied'
                AND payment_ledger.reference_type = 'order_checkout_payment'
                AND payment_ledger.reference_id = checkout.id
                AND payment_ledger.amount = checkout.payable_ndp
                AND payment_ledger.actor_user_id = booking.payment_confirmed_by_id
                AND payment_ledger.deleted_at IS NULL
                AND checkout.payment_selected_at <= payment_ledger.created_at
                AND payment_ledger.created_at <= booking.payment_confirmed_at))
          OR
          (checkout.payment_method IN ('cash', 'other')
            AND checkout.ledger_transaction_id IS NULL
            AND checkout.receipt_confirmed_by_id = booking.payment_confirmed_by_id
            AND checkout.receipt_confirmed_at BETWEEN checkout.payment_selected_at AND booking.payment_confirmed_at
            AND checkout.receipt_confirmation_reason IS NOT NULL
            AND TRIM(checkout.receipt_confirmation_reason) <> '')
        )
    ),
    commission_rows AS (
      SELECT authorized.metric_key, authorized.period_key, authorized.witness_id,
        COALESCE((
          SELECT SUM(line.amount_jpy)
          FROM payslip_lines AS line
          INNER JOIN payslips AS payslip ON payslip.id = line.payslip_id
            AND payslip.shop_id = booking.shop_id
            AND payslip.technician_profile_id = booking.technician_profile_id
            AND payslip.status IN ('approved', 'scheduled', 'paid', 'locked')
            AND payslip.dispute_status = 'none' AND payslip.deleted_at IS NULL
          INNER JOIN pay_runs AS pay_run ON pay_run.id = payslip.pay_run_id
            AND pay_run.status IN ('approved', 'scheduled', 'paid', 'locked')
            AND pay_run.deleted_at IS NULL
          WHERE line.order_id = booking.id AND line.line_type = 'commission'
            AND line.amount_jpy >= 0 AND line.deleted_at IS NULL
        ), 0) + COALESCE((
          SELECT CASE WHEN MAX(profile.wage_mode) = 'base_plus_commission'
            THEN ROUND(MAX(profile.base_salary_jpy) / DAY(LAST_DAY(DATE(CONVERT_TZ(session.ended_at, '+00:00', '+09:00')))))
            ELSE 0 END
          FROM technician_compensation_profiles AS profile
          WHERE profile.technician_profile_id = booking.technician_profile_id
            AND profile.shop_id = booking.shop_id
            AND profile.status IN ('active', 'archived') AND profile.deleted_at IS NULL
            AND (profile.effective_from IS NULL OR profile.effective_from <= session.ended_at)
            AND (profile.effective_to IS NULL OR profile.effective_to >= session.ended_at)
          HAVING COUNT(profile.id) = 1
        ), 0) AS contribution_value
      FROM authorized
      INNER JOIN periods AS period ON period.period_key = authorized.period_key
      INNER JOIN booking_orders AS booking
        ON (booking.order_no = authorized.witness_id OR CAST(booking.id AS CHAR) = authorized.witness_id)
      INNER JOIN shops AS shop ON shop.id = booking.shop_id AND shop.deleted_at IS NULL
      INNER JOIN order_checkouts AS checkout ON checkout.booking_order_id = booking.id
      INNER JOIN order_service_sessions AS session ON session.booking_order_id = booking.id
        AND session.ended_at >= period.from_inclusive AND session.ended_at < period.to_exclusive
        AND session.ended_by_user_id IS NOT NULL AND session.deleted_at IS NULL
      INNER JOIN technician_profiles AS technician ON technician.id = booking.technician_profile_id
        AND technician.deleted_at IS NULL
      WHERE authorized.metric_key IN ('dedicated_technician_commission', 'part_time_technician_commission')
        AND TRIM(shop.city) = ${sqlLiteral(fixture.city)}
        AND ${validCompletedCheckoutPredicate}
        AND (
          (authorized.metric_key = 'dedicated_technician_commission' AND (
            EXISTS (SELECT 1 FROM technician_shop_affiliations AS affiliation
              WHERE affiliation.technician_profile_id = technician.id
                AND affiliation.shop_id = booking.shop_id
                AND affiliation.relationship_type = 'exclusive'
                AND affiliation.work_status = 'active' AND affiliation.deleted_at IS NULL)
            OR (technician.shop_id = booking.shop_id AND technician.employment_type = 'FULL_TIME')
          )) OR
          (authorized.metric_key = 'part_time_technician_commission' AND (
            EXISTS (SELECT 1 FROM technician_shop_affiliations AS affiliation
              WHERE affiliation.technician_profile_id = technician.id
                AND affiliation.shop_id = booking.shop_id
                AND affiliation.relationship_type = 'partner'
                AND affiliation.work_status = 'active' AND affiliation.deleted_at IS NULL)
            OR (technician.shop_id = booking.shop_id AND technician.employment_type IN ('TEMPORARY', 'INDEPENDENT'))
          ))
        )
    ),
    affiliate_rows AS (
      SELECT authorized.metric_key, authorized.period_key, authorized.witness_id,
        CASE authorized.metric_key WHEN 'marketing_commission' THEN reward.reward_ndp
          ELSE reward.platform_fee_ndp END AS contribution_value
      FROM authorized
      INNER JOIN periods AS period ON period.period_key = authorized.period_key
      INNER JOIN affiliate_rewards AS reward ON CAST(reward.id AS CHAR) = authorized.witness_id
      INNER JOIN affiliate_attributions AS attribution ON attribution.id = reward.attribution_id
        AND attribution.status = 'settled' AND attribution.settled_at = reward.settled_at
        AND attribution.deleted_at IS NULL
      INNER JOIN shops AS shop ON shop.id = attribution.shop_id AND shop.deleted_at IS NULL
      INNER JOIN affiliate_reward_transactions AS reward_transaction
        ON reward_transaction.reward_id = reward.id AND reward_transaction.kind = 'settlement'
        AND reward_transaction.amount_ndp = reward.reward_ndp + reward.platform_fee_ndp
        AND reward_transaction.deleted_at IS NULL
      INNER JOIN ledger_transactions AS ledger ON ledger.id = reward_transaction.ledger_transaction_id
        AND ledger.type = 'affiliate_reward_settlement' AND ledger.status = 'applied'
        AND ledger.currency = 'NDP' AND ledger.reference_type = 'affiliate_reward'
        AND ledger.reference_id = reward.id AND ledger.amount = reward.reward_ndp + reward.platform_fee_ndp
        AND ledger.deleted_at IS NULL
      WHERE authorized.metric_key IN ('marketing_commission', 'affiliate_platform_income')
        AND TRIM(shop.city) = ${sqlLiteral(fixture.city)}
        AND reward.status = 'settled' AND reward.deleted_at IS NULL
        AND reward.settled_at >= period.from_inclusive AND reward.settled_at < period.to_exclusive
        AND reward.reversal_required_ndp = 0 AND reward.reversed_ndp = 0
        AND reward.outstanding_recovery_ndp = 0 AND reward.reversed_at IS NULL
        AND reward.reversal_reason IS NULL
    ),
    ndp_rows AS (
      SELECT authorized.metric_key, authorized.period_key, authorized.witness_id,
        financial.b_platform_fee_actual_ndp + financial.c_request_fee_actual_ndp
          - financial.user_reward_ndp AS contribution_value
      FROM authorized
      INNER JOIN periods AS period ON period.period_key = authorized.period_key
      INNER JOIN order_financials AS financial ON CAST(financial.id AS CHAR) = authorized.witness_id
      INNER JOIN booking_orders AS booking ON booking.id = financial.booking_order_id
      INNER JOIN shops AS shop ON shop.id = booking.shop_id AND shop.deleted_at IS NULL
      INNER JOIN order_checkouts AS checkout ON checkout.booking_order_id = booking.id
      WHERE authorized.metric_key = 'ndp_income'
        AND TRIM(shop.city) = ${sqlLiteral(fixture.city)}
        AND booking.payment_confirmed_at >= period.from_inclusive
        AND booking.payment_confirmed_at < period.to_exclusive
        AND ${validCompletedCheckoutPredicate}
        AND financial.ndp_currency = 'NDP' AND financial.settlement_status = 'settled'
        AND financial.b_platform_fee_actual_ndp >= 0
        AND financial.c_request_fee_actual_ndp >= 0 AND financial.user_reward_ndp >= 0
        AND financial.deleted_at IS NULL
    ),
    user_rows AS (
      SELECT authorized.metric_key, authorized.period_key, authorized.witness_id, 1 AS contribution_value
      FROM authorized
      INNER JOIN periods AS period ON period.period_key = authorized.period_key
      INNER JOIN users AS registered_user
        ON (registered_user.needo_id = authorized.witness_id OR CAST(registered_user.id AS CHAR) = authorized.witness_id)
      INNER JOIN customer_profiles AS customer ON customer.user_id = registered_user.id
        AND customer.deleted_at IS NULL
      WHERE authorized.metric_key = 'new_users'
        AND registered_user.created_at >= period.from_inclusive
        AND registered_user.created_at < period.to_exclusive
        AND registered_user.is_active = TRUE AND registered_user.is_test_account = FALSE
        AND registered_user.deleted_at IS NULL AND TRIM(customer.city) = ${sqlLiteral(fixture.city)}
    ),
    member_rows AS (
      SELECT authorized.metric_key, authorized.period_key, authorized.witness_id, 1 AS contribution_value
      FROM authorized
      INNER JOIN periods AS period ON period.period_key = authorized.period_key
      INNER JOIN shop_membership_cards AS card
        ON (card.public_id = authorized.witness_id OR CAST(card.id AS CHAR) = authorized.witness_id)
      INNER JOIN shop_customer_memberships AS membership ON membership.id = card.membership_id
        AND membership.status = 'active' AND membership.deleted_at IS NULL
      INNER JOIN customer_profiles AS customer ON customer.id = membership.customer_profile_id
        AND customer.deleted_at IS NULL
      INNER JOIN users AS member_user ON member_user.id = customer.user_id
        AND member_user.is_active = TRUE AND member_user.is_test_account = FALSE
        AND member_user.deleted_at IS NULL
      INNER JOIN shops AS shop ON shop.id = membership.shop_id AND shop.deleted_at IS NULL
      WHERE authorized.metric_key = 'new_paid_members'
        AND card.issued_at >= period.from_inclusive AND card.issued_at < period.to_exclusive
        AND card.issuance_source = 'offline_paid' AND card.status = 'active'
        AND card.deleted_at IS NULL AND TRIM(shop.city) = ${sqlLiteral(fixture.city)}
        AND card.issued_at = (
          SELECT MIN(historical_card.issued_at)
          FROM shop_membership_cards AS historical_card
          INNER JOIN shop_customer_memberships AS historical_membership
            ON historical_membership.id = historical_card.membership_id
          WHERE historical_membership.customer_profile_id = customer.id
            AND historical_card.issuance_source = 'offline_paid'
        )
    ),
    technician_rows AS (
      SELECT authorized.metric_key, authorized.period_key, authorized.witness_id, 1 AS contribution_value
      FROM authorized
      INNER JOIN periods AS period ON period.period_key = authorized.period_key
      INNER JOIN user_identities AS identity_row ON CAST(identity_row.id AS CHAR) = authorized.witness_id
      INNER JOIN users AS technician_user ON technician_user.id = identity_row.user_id
        AND technician_user.is_active = TRUE AND technician_user.is_test_account = FALSE
        AND technician_user.deleted_at IS NULL
      INNER JOIN technician_profiles AS technician ON technician.user_id = identity_row.user_id
        AND technician.deleted_at IS NULL
      INNER JOIN shops AS shop ON shop.id = technician.shop_id AND shop.deleted_at IS NULL
      WHERE authorized.metric_key = 'technician_onboarding'
        AND identity_row.type = 'technician' AND identity_row.is_active = TRUE
        AND identity_row.deleted_at IS NULL
        AND identity_row.created_at >= period.from_inclusive
        AND identity_row.created_at < period.to_exclusive
        AND identity_row.created_at = (
          SELECT MIN(history.created_at) FROM user_identities AS history
          WHERE history.user_id = identity_row.user_id AND history.type = 'technician'
        )
        AND TRIM(shop.city) = ${sqlLiteral(fixture.city)}
    )
    SELECT metric_key AS metricKey, period_key AS period, witness_id AS witnessId,
      contribution_value AS value FROM operation_rows
    UNION ALL SELECT metric_key, period_key, witness_id, contribution_value FROM commission_rows
    UNION ALL SELECT metric_key, period_key, witness_id, contribution_value FROM affiliate_rows
    UNION ALL SELECT metric_key, period_key, witness_id, contribution_value FROM ndp_rows
    UNION ALL SELECT metric_key, period_key, witness_id, contribution_value FROM user_rows
    UNION ALL SELECT metric_key, period_key, witness_id, contribution_value FROM member_rows
    UNION ALL SELECT metric_key, period_key, witness_id, contribution_value FROM technician_rows`;
};

const witnessStatement = (fixture: DashboardFixtureManifest): string => {
  const authorized = Object.entries(fixture.witnesses).flatMap(([kind, ids]) =>
    ids.map((id) => `SELECT ${sqlLiteral(kind)} AS kind, ${sqlLiteral(id)} AS witness_id`)
  ).join(" UNION ALL ");
  return `/* dashboard_checker_fixture_witnesses */
    WITH authorized AS (${authorized})
    SELECT authorized.kind, authorized.witness_id AS witnessId
    FROM authorized
    WHERE
      (authorized.kind = 'coherentCompletedCheckoutIds' AND EXISTS (
        SELECT 1 FROM booking_orders AS booking
        INNER JOIN order_checkouts AS checkout ON checkout.booking_order_id = booking.id
        WHERE (booking.order_no = authorized.witness_id OR CAST(booking.id AS CHAR) = authorized.witness_id)
          AND booking.status = 'completed' AND booking.payment_status = 'confirmed'
          AND booking.payment_refunded_at IS NULL AND booking.deleted_at IS NULL
          AND checkout.deleted_at IS NULL))
      OR (authorized.kind = 'cancelledOrderIds' AND EXISTS (
        SELECT 1 FROM booking_orders AS booking WHERE
          (booking.order_no = authorized.witness_id OR CAST(booking.id AS CHAR) = authorized.witness_id)
          AND booking.status = 'cancelled'))
      OR (authorized.kind = 'refundedOrderIds' AND EXISTS (
        SELECT 1 FROM booking_orders AS booking WHERE
          (booking.order_no = authorized.witness_id OR CAST(booking.id AS CHAR) = authorized.witness_id)
          AND booking.payment_refunded_at IS NOT NULL))
      OR (authorized.kind = 'reversedFinancialIds' AND EXISTS (
        SELECT 1 FROM order_financials AS financial
        INNER JOIN booking_orders AS booking ON booking.id = financial.booking_order_id
        WHERE CAST(financial.id AS CHAR) = authorized.witness_id
          AND (financial.settlement_status <> 'settled' OR booking.payment_refunded_at IS NOT NULL)))
      OR (authorized.kind = 'otherCityOrderIds' AND EXISTS (
        SELECT 1 FROM booking_orders AS booking INNER JOIN shops AS shop ON shop.id = booking.shop_id
        WHERE (booking.order_no = authorized.witness_id OR CAST(booking.id AS CHAR) = authorized.witness_id)
          AND TRIM(shop.city) <> ${sqlLiteral(fixture.city)}))
      OR (authorized.kind = 'testNdpLedgerIds' AND EXISTS (
        SELECT 1 FROM ledger_transactions AS ledger
        WHERE (ledger.transaction_no = authorized.witness_id OR CAST(ledger.id AS CHAR) = authorized.witness_id)
          AND ledger.currency = 'TEST_NDP'))
      OR (authorized.kind = 'firstPaidMembershipCardIds' AND EXISTS (
        SELECT 1 FROM shop_membership_cards AS card
        WHERE (card.public_id = authorized.witness_id OR CAST(card.id AS CHAR) = authorized.witness_id)
          AND card.issuance_source = 'offline_paid'))
      OR (authorized.kind = 'excludedMembershipCardIds' AND EXISTS (
        SELECT 1 FROM shop_membership_cards AS card
        WHERE (card.public_id = authorized.witness_id OR CAST(card.id AS CHAR) = authorized.witness_id)
          AND (card.issuance_source IS NULL OR card.issuance_source <> 'offline_paid' OR card.status <> 'active')))
      OR (authorized.kind = 'technicianIdentityIds' AND EXISTS (
        SELECT 1 FROM user_identities AS identity_row
        WHERE CAST(identity_row.id AS CHAR) = authorized.witness_id AND identity_row.type = 'technician'))
      OR (authorized.kind = 'compensationProfileIds' AND EXISTS (
        SELECT 1 FROM technician_compensation_profiles AS profile
        WHERE CAST(profile.id AS CHAR) = authorized.witness_id AND profile.deleted_at IS NULL))
      OR (authorized.kind = 'ndpIncomeFinancialIds' AND EXISTS (
        SELECT 1 FROM order_financials AS financial WHERE CAST(financial.id AS CHAR) = authorized.witness_id
          AND financial.ndp_currency = 'NDP' AND financial.settlement_status = 'settled'))
      OR (authorized.kind = 'affiliateRewardIds' AND EXISTS (
        SELECT 1 FROM affiliate_rewards AS reward WHERE CAST(reward.id AS CHAR) = authorized.witness_id
          AND reward.status = 'settled' AND reward.reversed_at IS NULL))`;
};

const createRealProjection = async (
  facade: SelectOnlyQueryFacade,
  fixture: DashboardFixtureManifest
): Promise<DashboardCheckerProjection> => {
  const [
    { DashboardOperationsFinanceRepository },
    { DashboardCommissionRepository },
    { DashboardGrowthRepository },
    { BackofficeService },
    { AuditLogService }
  ] = await Promise.all([
    import("../src/repositories/dashboard-operations-finance.repository"),
    import("../src/repositories/dashboard-commission.repository"),
    import("../src/repositories/dashboard-growth.repository"),
    import("../src/services/backoffice.service"),
    import("../src/services/audit-log.service")
  ]);
  const client = facade as unknown as PrismaClient;
  const analyticsReader = {
    getOperationsFinance: (input: Parameters<InstanceType<typeof DashboardOperationsFinanceRepository>["getOperationsFinance"]>[0]) =>
      new DashboardOperationsFinanceRepository(client).getOperationsFinance(input),
    getCommissionFacts: (input: Parameters<InstanceType<typeof DashboardCommissionRepository>["getCommissionFacts"]>[0]) =>
      new DashboardCommissionRepository(client).getCommissionFacts(input),
    getGrowthFacts: (input: Parameters<InstanceType<typeof DashboardGrowthRepository>["getGrowthFacts"]>[0]) =>
      new DashboardGrowthRepository(client).getGrowthFacts(input)
  };
  const capturedAudits: unknown[] = [];
  const audit = new AuditLogService({
    create: async (input) => { capturedAudits.push(input); }
  });
  const service = new BackofficeService(
    {} as never,
    audit,
    {} as never,
    () => new Date(`${fixture.windows.current.to}T12:00:00.000+09:00`),
    undefined,
    analyticsReader
  );
  const actor = {
    userId: 1,
    email: "dashboard-checker@localhost.invalid",
    accessTokenJti: "dashboard-checker",
    accessTokenExpiresAt: Number.MAX_SAFE_INTEGER,
    roles: ["operator"],
    permissions: ["backoffice:dashboard:read", "backoffice:dashboard-detail:read"]
  } as never;
  const context = { ip: "127.0.0.1", userAgent: "dashboard-zero-write-checker" };
  const query = {
    period: "custom" as const,
    from: fixture.windows.current.from,
    to: fixture.windows.current.to,
    city: fixture.city
  };
  const overview = await service.getDashboardOverview(actor, context, query);
  const details = Object.fromEntries(await Promise.all(DASHBOARD_CHECK_METRIC_ORACLE.map(async ({ metricKey }) => [
    metricKey,
    await service.getDashboardMetricDetail(actor, context, metricKey, query)
  ])));
  if (capturedAudits.length !== 18) throw new Error("Dashboard checker expected capture-only audit evidence");
  return { ...overview, details } as DashboardCheckerProjection;
};

interface QueryClient {
  $queryRaw: QueryRaw;
}

interface DashboardCheckConnection {
  client: QueryClient;
  disconnect: () => Promise<void>;
}

export interface DashboardOverviewCheckDependencies {
  runtimeEnvironment?: Environment;
  fs?: CheckerFileSystem;
  connect?: (databaseUrl: string) => Promise<DashboardCheckConnection>;
  createProjection?: (
    facade: SelectOnlyQueryFacade,
    fixture: DashboardFixtureManifest,
    facts: IndependentReadyValues
  ) => Promise<DashboardCheckerProjection>;
}

const connectPrisma = async (databaseUrl: string): Promise<DashboardCheckConnection> => {
  const [{ PrismaClient, Prisma }, { PrismaMariaDb }] = await Promise.all([
    import("@prisma/client"),
    import("@prisma/adapter-mariadb")
  ]);
  const client = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl), log: ["error"] });
  const queryClient: QueryClient = {
    $queryRaw: (query, ...values) => typeof query === "string"
      ? client.$queryRaw(Prisma.raw(query))
      : client.$queryRaw(query as never, ...values)
  };
  return { client: queryClient, disconnect: () => client.$disconnect() };
};

export async function runDashboardOverviewCheck(
  dependencies: DashboardOverviewCheckDependencies = {}
): Promise<{ metricCount: 17; detailCount: 17 }> {
  const fs = dependencies.fs ?? fileSystem;
  const authority = loadDashboardCheckerAuthority(
    dependencies.runtimeEnvironment ?? process.env,
    fs
  );
  const fixture = parseDashboardFixtureManifest(
    fs.readFileSync(authority.manifestFilePath),
    authority
  );
  const connection = await (dependencies.connect ?? connectPrisma)(authority.databaseUrl);
  try {
    const grantRows = await connection.client.$queryRaw("SHOW GRANTS");
    assertSelectOnlyGrants(grantsFromRows(grantRows));
    const facade = createSelectOnlyQueryFacade(connection.client);
    const witnessRows = await facade.$queryRaw<FixtureWitnessRow[]>(witnessStatement(fixture));
    assertFixtureWitnessRows(fixture, witnessRows);
    const rows = await facade.$queryRaw<IndependentEvidenceRow[]>(
      independentEvidenceStatement(fixture)
    );
    const facts = aggregateIndependentEvidence(fixture, rows);
    const projection = await (dependencies.createProjection ?? createRealProjection)(
      facade,
      fixture,
      facts
    );
    assertDashboardProjection(projection, fixture, facts);
    return { metricCount: 17, detailCount: 17 };
  } finally {
    await connection.disconnect();
  }
}

async function main(): Promise<void> {
  await runDashboardOverviewCheck();
  process.stdout.write("Comprehensive dashboard repository/service verification passed.\n");
}

if (process.env.JEST_WORKER_ID === undefined && require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Dashboard checker failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
