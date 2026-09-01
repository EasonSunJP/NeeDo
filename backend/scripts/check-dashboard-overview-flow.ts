import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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
  version: 2;
  namespace: string;
  marker: string;
  city: string;
  windows: {
    current: { from: string; to: string };
    previous: { from: string; to: string };
  };
  witnesses: {
    coherentCompletedCheckoutIds: FixtureWitnessRef[];
    cancelledOrderIds: FixtureWitnessRef[];
    refundedOrderIds: FixtureWitnessRef[];
    reversedFinancialIds: FixtureWitnessRef[];
    otherCityOrderIds: FixtureWitnessRef[];
    testNdpLedgerIds: FixtureWitnessRef[];
    firstPaidMembershipCardIds: FixtureWitnessRef[];
    excludedMembershipCardIds: FixtureWitnessRef[];
    technicianIdentityIds: FixtureWitnessRef[];
    compensationProfileIds: FixtureWitnessRef[];
    ndpIncomeFinancialIds: FixtureWitnessRef[];
    affiliateRewardIds: FixtureWitnessRef[];
  };
  readyMetricWitnesses: Record<DashboardCheckReadyMetricKey, {
    current: MetricWitnessRef[];
    previous: MetricWitnessRef[];
  }>;
}

export type WitnessNamespace =
  | "booking_order"
  | "order_financial"
  | "ledger_transaction"
  | "membership_card"
  | "user_identity"
  | "compensation_profile"
  | "affiliate_reward"
  | "user";

export type WitnessIdentifierKind =
  | "order_no"
  | "numeric_id"
  | "transaction_no"
  | "public_id"
  | "needo_id";

export type WitnessProvenanceField =
  | "service_snapshot_json.fixtureMarker"
  | "booking_order.service_snapshot_json.fixtureMarker"
  | "metadata.fixtureMarker"
  | "issuance_reference"
  | "user.email"
  | "technician.user.email"
  | "ledger.metadata.fixtureMarker"
  | "email";

export const DASHBOARD_PROVENANCE_STORAGE_CONTRACTS = {
  "service_snapshot_json.fixtureMarker": { storage: "json_string", maxCharacters: null },
  "booking_order.service_snapshot_json.fixtureMarker": { storage: "json_string", maxCharacters: null },
  "metadata.fixtureMarker": { storage: "json_string", maxCharacters: null },
  issuance_reference: { storage: "varchar", maxCharacters: 160 },
  "user.email": { storage: "email_varchar", maxCharacters: 255 },
  "technician.user.email": { storage: "email_varchar", maxCharacters: 255 },
  "ledger.metadata.fixtureMarker": { storage: "json_string", maxCharacters: null },
  email: { storage: "email_varchar", maxCharacters: 255 }
} as const satisfies Record<WitnessProvenanceField, {
  storage: "json_string" | "varchar" | "email_varchar";
  maxCharacters: number | null;
}>;

export interface WitnessProvenance {
  field: WitnessProvenanceField;
  value: string;
}

export interface FixtureWitnessRef {
  namespace: WitnessNamespace;
  id: string;
  period: PeriodKey;
  identifierKind: WitnessIdentifierKind;
  provenance: WitnessProvenance;
}

export interface MetricWitnessRef {
  namespace: WitnessNamespace;
  id: string;
  expectation: "positive" | "zero";
  identifierKind: WitnessIdentifierKind;
  provenance: WitnessProvenance;
}

export interface IndependentEvidenceRow {
  metricKey: DashboardCheckReadyMetricKey;
  period: PeriodKey;
  witnessNamespace: WitnessNamespace;
  witnessId: string;
  value: number | bigint | string;
}

export interface FixtureWitnessRow {
  kind: keyof DashboardFixtureManifest["witnesses"];
  witnessNamespace: WitnessNamespace;
  witnessId: string;
  period: PeriodKey;
  identifierKind: WitnessIdentifierKind;
  resolvedIdentifier: string;
  provenanceField: WitnessProvenanceField;
  resolvedProvenance: string;
  resolvedCount: number | bigint;
  resolvedReversalState: string | null;
  resolvedReversalReference: string | null;
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
  lstatSync: (path: string) => { isSymbolicLink: () => boolean };
  realpathSync: (path: string) => string;
  readdirSync: (path: string) => Array<{ name: string; isDirectory: () => boolean }>;
}

const fileSystem: CheckerFileSystem = {
  resolve,
  existsSync,
  readFileSync: (path) => readFileSync(path, "utf8"),
  statSync,
  lstatSync,
  realpathSync,
  readdirSync: (path) => readdirSync(path, { withFileTypes: true })
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

const gitControlBoundaries = (repositoryRoot: string, fs: CheckerFileSystem): string[] => {
  const gitEntry = join(repositoryRoot, ".git");
  let commonGitDirectory: string;
  if (fs.existsSync(gitEntry) && fs.statSync(gitEntry).isFile()) {
    const gitDirectoryMatch = /^gitdir:\s*(.+)\s*$/imu.exec(fs.readFileSync(gitEntry));
    if (!gitDirectoryMatch) throw new Error("Dashboard checker cannot resolve Git worktree authority");
    const gitDirectory = fs.realpathSync(resolve(repositoryRoot, gitDirectoryMatch[1]!));
    const commonDirectoryFile = join(gitDirectory, "commondir");
    commonGitDirectory = fs.existsSync(commonDirectoryFile)
      ? fs.realpathSync(resolve(gitDirectory, fs.readFileSync(commonDirectoryFile).trim()))
      : gitDirectory;
  } else {
    commonGitDirectory = fs.realpathSync(gitEntry);
  }

  const checkoutRoots = new Set<string>([repositoryRoot, fs.realpathSync(dirname(commonGitDirectory))]);
  const worktreesDirectory = join(commonGitDirectory, "worktrees");
  if (fs.existsSync(worktreesDirectory)) {
    for (const entry of fs.readdirSync(worktreesDirectory)) {
      if (!entry.isDirectory()) continue;
      const gitDirectoryFile = join(worktreesDirectory, entry.name, "gitdir");
      if (!fs.existsSync(gitDirectoryFile)) continue;
      const checkoutGitFile = fs.readFileSync(gitDirectoryFile).trim();
      if (checkoutGitFile !== "" && fs.existsSync(checkoutGitFile)) {
        checkoutRoots.add(fs.realpathSync(dirname(checkoutGitFile)));
      }
    }
  }
  return [...checkoutRoots, commonGitDirectory];
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
  const requestedManifestPath = fs.resolve(
    requireParsedValue(parsed, "DASHBOARD_OVERVIEW_FIXTURE_MANIFEST_FILE")
  );
  if (!fs.existsSync(requestedManifestPath)) throw new Error("Dashboard fixture manifest does not exist");
  if (fs.lstatSync(requestedManifestPath).isSymbolicLink()) {
    throw new Error("Dashboard fixture manifest must not be a symlink");
  }
  const manifestFilePath = fs.realpathSync(requestedManifestPath);
  const repositoryRoot = fs.realpathSync(resolve(__dirname, "../.."));
  const controlledBoundary = gitControlBoundaries(repositoryRoot, fs).find((boundary) =>
    manifestFilePath === boundary || manifestFilePath.startsWith(`${boundary}/`)
  );
  if (controlledBoundary) {
    throw new Error("Dashboard fixture manifest must be outside every repository-controlled path");
  }
  const manifestStat = fs.statSync(manifestFilePath);
  if (!manifestStat.isFile()) throw new Error("Dashboard fixture manifest must be a file");
  if ((manifestStat.mode & 0o222) !== 0) throw new Error("Dashboard fixture manifest must be read-only");
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
  return value.trim();
};

const structuredAuthorityToken = /^(?=.{16,63}$)(?=.*[a-z])(?=.*\d)[a-z0-9]+(?:-[a-z0-9]+)+$/u;

const requireAuthorityToken = (value: unknown, label: "marker" | "namespace"): string => {
  const token = requireVisible(value, label).normalize("NFKC");
  const entropyCharacters = new Set(token.replace(/[-_]/gu, ""));
  if (!structuredAuthorityToken.test(token) || entropyCharacters.size < 6) {
    throw new Error(`Dashboard fixture ${label} format is invalid`);
  }
  return token;
};

const metricWitnessNamespace: Record<DashboardCheckReadyMetricKey, WitnessNamespace> = {
  gross_revenue: "booking_order",
  discount_amount: "booking_order",
  dedicated_technician_commission: "booking_order",
  part_time_technician_commission: "booking_order",
  marketing_commission: "affiliate_reward",
  ndp_income: "order_financial",
  affiliate_platform_income: "affiliate_reward",
  new_users: "user",
  new_paid_members: "membership_card",
  technician_onboarding: "user_identity"
};

const fixtureWitnessNamespace: Record<keyof DashboardFixtureManifest["witnesses"], WitnessNamespace> = {
  coherentCompletedCheckoutIds: "booking_order",
  cancelledOrderIds: "booking_order",
  refundedOrderIds: "booking_order",
  reversedFinancialIds: "order_financial",
  otherCityOrderIds: "booking_order",
  testNdpLedgerIds: "ledger_transaction",
  firstPaidMembershipCardIds: "membership_card",
  excludedMembershipCardIds: "membership_card",
  technicianIdentityIds: "user_identity",
  compensationProfileIds: "compensation_profile",
  ndpIncomeFinancialIds: "order_financial",
  affiliateRewardIds: "affiliate_reward"
};

const identifierKindByNamespace: Record<WitnessNamespace, WitnessIdentifierKind> = {
  booking_order: "order_no",
  order_financial: "numeric_id",
  ledger_transaction: "transaction_no",
  membership_card: "public_id",
  user_identity: "numeric_id",
  compensation_profile: "numeric_id",
  affiliate_reward: "numeric_id",
  user: "needo_id"
};

const provenanceFieldByNamespace: Record<WitnessNamespace, WitnessProvenanceField> = {
  booking_order: "service_snapshot_json.fixtureMarker",
  order_financial: "booking_order.service_snapshot_json.fixtureMarker",
  ledger_transaction: "metadata.fixtureMarker",
  membership_card: "issuance_reference",
  user_identity: "user.email",
  compensation_profile: "technician.user.email",
  affiliate_reward: "ledger.metadata.fixtureMarker",
  user: "email"
};

const canonicalWitnessId = (
  value: unknown,
  identifierKind: WitnessIdentifierKind,
  label: string
): string => {
  const id = requireVisible(value, label).normalize("NFKC");
  if (identifierKind === "numeric_id") {
    if (!/^[1-9]\d{0,9}$/u.test(id) || Number(id) > 2_147_483_647) {
      throw new Error(`Dashboard fixture manifest identifier is invalid: ${label}`);
    }
    return String(Number(id));
  }
  if (identifierKind === "needo_id" && !/^u\d{10}$/u.test(id)) {
    throw new Error(`Dashboard fixture manifest identifier is invalid: ${label}`);
  }
  if (!/^[\x21-\x7e]+$/u.test(id)) {
    throw new Error(`Dashboard fixture manifest identifier is invalid: ${label}`);
  }
  return id;
};

const requireTypedWitness = (
  candidate: Record<string, unknown>,
  namespace: WitnessNamespace,
  label: string,
  marker: string,
  fixtureNamespace: string
): Pick<FixtureWitnessRef, "id" | "identifierKind" | "provenance"> => {
  const expectedIdentifierKind = identifierKindByNamespace[namespace];
  const identifierKind = requireVisible(candidate.identifierKind, `${label}.identifierKind`);
  if (identifierKind !== expectedIdentifierKind) {
    throw new Error(`Dashboard fixture manifest identifier kind is invalid: ${label}`);
  }
  if (!isObject(candidate.provenance)) {
    throw new Error(`Dashboard fixture manifest provenance is invalid: ${label}`);
  }
  const expectedField = provenanceFieldByNamespace[namespace];
  const field = requireVisible(candidate.provenance.field, `${label}.provenance.field`);
  const value = requireVisible(candidate.provenance.value, `${label}.provenance.value`).normalize("NFKC");
  const storage = DASHBOARD_PROVENANCE_STORAGE_CONTRACTS[expectedField];
  const emailStorage = storage.storage === "email_varchar";
  const provenancePrefix = emailStorage
    ? `${namespace}.`
    : `${marker}:${fixtureNamespace}:${namespace}:`;
  const emailDomain = `${marker}.${fixtureNamespace}.fixture.needo.local`;
  const [emailLocal = "", ...emailDomains] = value.split("@");
  const suffix = emailStorage
    ? emailLocal.slice(provenancePrefix.length)
    : value.slice(provenancePrefix.length);
  const emailValid = !emailStorage || (
    value === value.toLowerCase() && value.length <= storage.maxCharacters &&
    emailDomains.length === 1 && emailDomains[0] === emailDomain &&
    emailLocal.length <= 64 && emailLocal.startsWith(provenancePrefix) &&
    emailDomain.split(".").every((part) => part.length > 0 && part.length <= 63) &&
    /^[a-z0-9][a-z0-9._-]*$/u.test(suffix)
  );
  const varcharValid = storage.storage !== "varchar" || value.length <= storage.maxCharacters;
  if (
    field !== expectedField || suffix === "" ||
    (!emailStorage && (!value.startsWith(provenancePrefix) || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(suffix))) ||
    !emailValid || !varcharValid
  ) {
    throw new Error(`Dashboard fixture manifest structured provenance is invalid: ${label}`);
  }
  const id = canonicalWitnessId(candidate.id, expectedIdentifierKind, `${label}.id`);
  return {
    id,
    identifierKind: expectedIdentifierKind,
    provenance: { field: expectedField, value }
  };
};

const requireFixtureWitnesses = (
  value: unknown,
  label: keyof DashboardFixtureManifest["witnesses"],
  marker: string,
  fixtureNamespace: string
): FixtureWitnessRef[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Dashboard fixture manifest is incomplete: ${label}`);
  }
  const witnesses = value.map((candidate) => {
    if (!isObject(candidate)) throw new Error(`Dashboard fixture manifest is incomplete: ${label}`);
    const namespace = requireVisible(candidate.namespace, `${label}.namespace`);
    if (namespace !== fixtureWitnessNamespace[label]) {
      throw new Error(`Dashboard fixture manifest witness namespace is invalid: ${label}`);
    }
    const period = requireVisible(candidate.period, `${label}.period`);
    if (period !== "current" && period !== "previous") {
      throw new Error(`Dashboard fixture manifest witness period is invalid: ${label}`);
    }
    return {
      namespace: namespace as WitnessNamespace,
      ...requireTypedWitness(candidate, namespace as WitnessNamespace, label, marker, fixtureNamespace),
      period: period as PeriodKey
    };
  });
  const keys = witnesses.map(({ namespace, id, period }) => `${namespace}:${id}:${period}`);
  if (new Set(keys).size !== keys.length) {
    throw new Error(`Dashboard fixture manifest has duplicate IDs: ${label}`);
  }
  return witnesses;
};

const requireMetricWitnesses = (
  value: unknown,
  metricKey: DashboardCheckReadyMetricKey,
  period: PeriodKey,
  marker: string,
  fixtureNamespace: string
): MetricWitnessRef[] => {
  const label = `${metricKey}.${period}`;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Dashboard fixture manifest is incomplete: ${label}`);
  }
  const witnesses = value.map((candidate) => {
    if (!isObject(candidate)) throw new Error(`Dashboard fixture manifest is incomplete: ${label}`);
    const namespace = requireVisible(candidate.namespace, `${label}.namespace`);
    if (namespace !== metricWitnessNamespace[metricKey]) {
      throw new Error(`Dashboard fixture metric witness namespace is invalid: ${label}`);
    }
    const expectation = requireVisible(candidate.expectation, `${label}.expectation`);
    if (expectation !== "positive" && expectation !== "zero") {
      throw new Error(`Dashboard fixture metric witness expectation is invalid: ${label}`);
    }
    return {
      namespace: namespace as WitnessNamespace,
      ...requireTypedWitness(candidate, namespace as WitnessNamespace, label, marker, fixtureNamespace),
      expectation: expectation as MetricWitnessRef["expectation"]
    };
  });
  const keys = witnesses.map(({ namespace, id }) => `${namespace}:${id}`);
  if (new Set(keys).size !== keys.length) {
    throw new Error(`Dashboard fixture manifest has duplicate IDs: ${label}`);
  }
  return witnesses;
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

interface IndependentCompensationProfile {
  id: number;
  status: string;
  wageMode: string;
  baseSalaryJpy: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  deleted: boolean;
}

interface IndependentCommissionOrder {
  witnessId: string;
  technicianProfileId: number;
  shopId: number;
  workDate: string;
  classification: "dedicated" | "part_time";
  settledShareJpy: number;
  profiles: IndependentCompensationProfile[];
}

const formalWageModes = new Set([
  "fixed_per_order", "commission", "base_plus_commission", "hourly"
]);

export function calculateIndependentTechnicianCommission(
  orders: readonly IndependentCommissionOrder[]
): { dedicated: number; partTime: number } {
  const daily = new Map<string, {
    classification: IndependentCommissionOrder["classification"];
    profile: IndependentCompensationProfile;
    dates: Set<string>;
  }>();
  let dedicated = 0;
  let partTime = 0;
  for (const order of orders) {
    parseDate(order.workDate, "commission workDate");
    if (
      !Number.isSafeInteger(order.technicianProfileId) || order.technicianProfileId <= 0 ||
      !Number.isSafeInteger(order.shopId) || order.shopId <= 0 ||
      !Number.isSafeInteger(order.settledShareJpy) || order.settledShareJpy < 0
    ) {
      throw new Error("Independent technician commission order is invalid");
    }
    const history = order.profiles.filter((profile) =>
      !profile.deleted && (profile.status === "active" || profile.status === "archived")
    );
    for (const profile of history) {
      if (
        !Number.isSafeInteger(profile.id) || profile.id <= 0 ||
        !formalWageModes.has(profile.wageMode) ||
        !Number.isSafeInteger(profile.baseSalaryJpy) || profile.baseSalaryJpy < 0 ||
        (profile.effectiveFrom !== null && !datePattern.test(profile.effectiveFrom)) ||
        (profile.effectiveTo !== null && !datePattern.test(profile.effectiveTo)) ||
        (profile.effectiveFrom !== null && profile.effectiveTo !== null &&
          profile.effectiveFrom > profile.effectiveTo)
      ) {
        throw new Error("Independent technician compensation profile history is invalid");
      }
    }
    const effective = history.filter((profile) =>
      (profile.effectiveFrom === null || profile.effectiveFrom <= order.workDate) &&
      (profile.effectiveTo === null || profile.effectiveTo >= order.workDate)
    );
    if (effective.length !== 1) {
      throw new Error("Independent technician compensation profile selection is ambiguous");
    }
    const profile = effective[0]!;
    if (order.classification === "dedicated") dedicated += order.settledShareJpy;
    else partTime += order.settledShareJpy;
    const month = order.workDate.slice(0, 7);
    const allocationKey = [
      order.classification, order.technicianProfileId, order.shopId, profile.id, month
    ].join(":");
    const allocation = daily.get(allocationKey) ?? {
      classification: order.classification,
      profile,
      dates: new Set<string>()
    };
    if (
      allocation.profile.baseSalaryJpy !== profile.baseSalaryJpy ||
      allocation.profile.wageMode !== profile.wageMode
    ) {
      throw new Error("Independent technician compensation profile selection is ambiguous");
    }
    allocation.dates.add(order.workDate);
    daily.set(allocationKey, allocation);
  }
  for (const [key, allocation] of daily) {
    if (allocation.profile.wageMode !== "base_plus_commission") continue;
    const month = Number(key.slice(-2));
    const year = Number(key.slice(-7, -3));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const base = Math.round(
      allocation.profile.baseSalaryJpy * allocation.dates.size / daysInMonth
    );
    if (allocation.classification === "dedicated") dedicated += base;
    else partTime += base;
  }
  if (
    !Number.isSafeInteger(dedicated) || dedicated < 0 ||
    !Number.isSafeInteger(partTime) || partTime < 0
  ) {
    throw new Error("Independent technician commission aggregate is invalid");
  }
  return { dedicated, partTime };
}

interface IndependentNdpFinancialEvidence {
  financialId: string;
  paymentConfirmedAt: string;
  platformFeeNdp: number;
  requestFeeNdp: number;
  userRewardNdp: number;
  userRewardGrantedAt: string | null;
  paymentLedgerValid: boolean;
  paymentWalletValid: boolean;
  paymentReconciliationValid: boolean;
  rewardLedgerValid: boolean;
  rewardWalletValid: boolean;
}

type CheckerWindows = ReturnType<typeof resolveCheckerWindows>;

const periodForTimestamp = (value: string, windows: CheckerWindows): PeriodKey | null => {
  const instant = new Date(value).getTime();
  if (!Number.isFinite(instant)) throw new Error("Independent evidence timestamp is invalid");
  for (const period of ["current", "previous"] as const) {
    if (
      instant >= new Date(windows[period].fromInclusive).getTime() &&
      instant < new Date(windows[period].toExclusive).getTime()
    ) return period;
  }
  return null;
};

export function calculateIndependentNdpIncome(
  rows: readonly IndependentNdpFinancialEvidence[],
  windows: CheckerWindows
): { current: number; previous: number } {
  const result = { current: 0, previous: 0 };
  for (const row of rows) {
    if (
      !row.paymentLedgerValid || !row.paymentWalletValid ||
      !row.paymentReconciliationValid
    ) {
      throw new Error(`Independent NDP payment evidence is incomplete: ${row.financialId}`);
    }
    for (const amount of [row.platformFeeNdp, row.requestFeeNdp, row.userRewardNdp]) {
      if (!Number.isSafeInteger(amount) || amount < 0) {
        throw new Error("Independent NDP amount is invalid");
      }
    }
    const paymentPeriod = periodForTimestamp(row.paymentConfirmedAt, windows);
    if (paymentPeriod) result[paymentPeriod] += row.platformFeeNdp + row.requestFeeNdp;
    if (row.userRewardNdp > 0 && row.userRewardGrantedAt !== null) {
      const rewardPeriod = periodForTimestamp(row.userRewardGrantedAt, windows);
      if (rewardPeriod) {
        if (!row.rewardLedgerValid || !row.rewardWalletValid) {
          throw new Error(`Independent NDP reward evidence is incomplete: ${row.financialId}`);
        }
        result[rewardPeriod] -= row.userRewardNdp;
      }
    }
  }
  if (
    !Number.isSafeInteger(result.current) || result.current < 0 ||
    !Number.isSafeInteger(result.previous) || result.previous < 0
  ) throw new Error("Independent NDP aggregate is invalid");
  return result;
}

interface IndependentTechnicianOnboardingRow {
  identityId: string;
  userId: number;
  activatedAt: string;
  firstActivatedAt: string;
  identityActive: boolean;
  identityDeleted: boolean;
  userActive: boolean;
  userDeleted: boolean;
  testUser: boolean;
  profileDeleted: boolean;
  directShop: { city: string; active: boolean; deleted: boolean } | null;
  affiliations: Array<{
    city: string;
    relationshipType: string;
    workStatus: string;
    startsAt: string;
    endsAt: string | null;
    deleted: boolean;
  }>;
}

export function countIndependentTechnicianOnboarding(
  rows: readonly IndependentTechnicianOnboardingRow[],
  windows: CheckerWindows,
  city: string
): { current: number; previous: number } {
  const users = { current: new Set<number>(), previous: new Set<number>() };
  for (const row of rows) {
    if (
      row.activatedAt !== row.firstActivatedAt || !row.identityActive || row.identityDeleted ||
      !row.userActive || row.userDeleted || row.testUser || row.profileDeleted
    ) continue;
    const period = periodForTimestamp(row.activatedAt, windows);
    if (!period) continue;
    const activated = new Date(row.activatedAt).getTime();
    const affiliations = row.affiliations.filter((affiliation) => {
      const startsAt = new Date(affiliation.startsAt).getTime();
      const endsAt = affiliation.endsAt === null ? null : new Date(affiliation.endsAt).getTime();
      return !affiliation.deleted && affiliation.workStatus === "active" &&
        (affiliation.relationshipType === "exclusive" || affiliation.relationshipType === "partner") &&
        startsAt <= activated && (endsAt === null || endsAt >= activated);
    });
    const matches = affiliations.length > 0
      ? affiliations.some((affiliation) => affiliation.city.trim() === city)
      : row.directShop !== null && row.directShop.active && !row.directShop.deleted &&
        row.directShop.city.trim() === city;
    if (matches) users[period].add(row.userId);
  }
  return { current: users.current.size, previous: users.previous.size };
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
  if (!isObject(raw) || raw.version !== 2 || !isObject(raw.windows) || !isObject(raw.witnesses) || !isObject(raw.readyMetricWitnesses)) {
    throw new Error("Dashboard fixture manifest is incomplete");
  }
  const rawWindows = raw.windows;
  const rawWitnesses = raw.witnesses;
  const rawReadyMetricWitnesses = raw.readyMetricWitnesses;
  const namespace = requireAuthorityToken(raw.namespace, "namespace");
  const marker = requireAuthorityToken(raw.marker, "marker");
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
    witnessKeys.map((key) => [
      key,
      requireFixtureWitnesses(rawWitnesses[key], key, marker, namespace)
    ])
  ) as unknown as DashboardFixtureManifest["witnesses"];
  const fixtureIds = new Set<string>();
  const fixtureProvenance = new Set<string>();
  for (const [kind, entries] of Object.entries(witnesses)) {
    for (const entry of entries) {
      const key = `${entry.namespace}:${entry.identifierKind}:${entry.id.toLowerCase()}`;
      if (fixtureIds.has(key)) {
        throw new Error(`Dashboard fixture manifest has canonical identifier collision: ${kind}`);
      }
      fixtureIds.add(key);
      const provenanceKey = `${entry.provenance.field}:${entry.provenance.value}`;
      if (fixtureProvenance.has(provenanceKey)) {
        throw new Error(`Dashboard fixture manifest has provenance collision: ${kind}`);
      }
      fixtureProvenance.add(provenanceKey);
    }
  }
  const readyMetricWitnesses = Object.fromEntries(DASHBOARD_CHECK_READY_METRIC_KEYS.map((key) => {
    const family = rawReadyMetricWitnesses[key];
    if (!isObject(family)) throw new Error(`Dashboard fixture manifest is incomplete: ${key}`);
    return [key, {
      current: requireMetricWitnesses(family.current, key, "current", marker, namespace),
      previous: requireMetricWitnesses(family.previous, key, "previous", marker, namespace)
    }];
  })) as DashboardFixtureManifest["readyMetricWitnesses"];
  const metricUses = new Map<string, Array<{ metricKey: DashboardCheckReadyMetricKey; period: PeriodKey }>>();
  for (const metricKey of DASHBOARD_CHECK_READY_METRIC_KEYS) {
    for (const period of ["current", "previous"] as const) {
      for (const entry of readyMetricWitnesses[metricKey][period]) {
        const typedId = `${entry.namespace}:${entry.identifierKind}:${entry.id.toLowerCase()}`;
        const uses = metricUses.get(typedId) ?? [];
        const compatibleCrossPeriodNdp = entry.namespace === "order_financial" &&
          metricKey === "ndp_income" && uses.every((use) => use.metricKey === "ndp_income");
        if (uses.some((use) => use.period !== period) && !compatibleCrossPeriodNdp) {
          throw new Error(`Dashboard fixture manifest has cross-period witness reuse: ${typedId}`);
        }
        const metrics = new Set([...uses.map((use) => use.metricKey), metricKey]);
        const compatibleBooking = entry.namespace === "booking_order" &&
          [...metrics].every((metric) => [
            "gross_revenue", "discount_amount", "dedicated_technician_commission",
            "part_time_technician_commission"
          ].includes(metric)) &&
          !(metrics.has("dedicated_technician_commission") && metrics.has("part_time_technician_commission"));
        const compatibleAffiliate = entry.namespace === "affiliate_reward" &&
          [...metrics].every((metric) => [
            "marketing_commission", "affiliate_platform_income"
          ].includes(metric));
        if (uses.length > 0 && !compatibleBooking && !compatibleAffiliate) {
          throw new Error(`Dashboard fixture manifest has incompatible witness reuse: ${typedId}`);
        }
        uses.push({ metricKey, period });
        metricUses.set(typedId, uses);
      }
    }
  }
  return {
    version: 2,
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

export function assertSelectOnlyGrants(grants: readonly string[]): void {
  let hasSelect = false;
  const allowed = grants.length > 0 && grants.every((grant) => {
    if (/\b(?:PROXY|WITH\s+(?:GRANT|ADMIN)\s+OPTION|AS\s+\S+)\b/iu.test(grant)) return false;
    const match = /^\s*GRANT\s+(.+?)\s+ON\s+.+?\s+TO\s+.+\s*$/iu.exec(grant);
    if (!match) return false;
    const privileges = match[1]!.split(",").map((privilege) => privilege.trim().toUpperCase());
    if (privileges.length === 0 || privileges.some((privilege) => privilege !== "USAGE" && privilege !== "SELECT")) {
      return false;
    }
    if (privileges.includes("SELECT")) hasSelect = true;
    return true;
  });
  if (!allowed || !hasSelect) {
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

const sqlWriteKeyword = /\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|TRUNCATE|CALL|LOAD|HANDLER|DO|SET|USE|GRANT|REVOKE|ANALYZE|OPTIMIZE|REPAIR|FLUSH|KILL|LOCK|UNLOCK|START|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/iu;
const sqlReadSideEffect = /(?:\b(?:FOR\s+UPDATE|LOCK\s+IN\s+SHARE\s+MODE|INTO\s+(?:OUTFILE|DUMPFILE))\b|:=|@{1,2}[A-Za-z_$])/iu;
const sqlQualifiedFunctionCall = /(?:[A-Za-z_][A-Za-z0-9_$]*|\?)\s*\.\s*(?:[A-Za-z_][A-Za-z0-9_$]*|\?)\s*\(/u;

const checkerSqlFunctions = new Set([
  "CAST", "COALESCE", "CONCAT", "CONVERT_TZ", "COUNT", "DATE", "DAY",
  "JSON_CONTAINS", "JSON_EXTRACT", "JSON_OBJECT", "JSON_UNQUOTE", "LAST_DAY",
  "MAX", "MIN", "MONTH", "ROUND", "ROW_NUMBER", "SUM", "TIMESTAMP", "TRIM", "YEAR"
]);

const parenthesizedSqlSyntax = new Set([
  "AND", "AS", "EXISTS", "IN", "NOT", "OR", "OVER", "THEN", "WHEN", "WHERE"
]);

export function extractSqlFunctionCalls(query: unknown): string[] {
  const input = queryText(query);
  const calls: string[] = [];
  let index = 0;
  const skipQuoted = (delimiter: "'" | '"'): void => {
    index += 1;
    while (index < input.length) {
      if (input[index] === "\\") {
        index += 2;
        continue;
      }
      if (input[index] === delimiter) {
        if (input[index + 1] === delimiter) {
          index += 2;
          continue;
        }
        index += 1;
        return;
      }
      index += 1;
    }
  };
  const skipTrivia = (start: number): number => {
    let cursor = start;
    while (cursor < input.length) {
      if (/\s/u.test(input[cursor]!)) {
        cursor += 1;
        continue;
      }
      if (input[cursor] === "/" && input[cursor + 1] === "*") {
        const close = input.indexOf("*/", cursor + 2);
        return close < 0 ? input.length : skipTrivia(close + 2);
      }
      if (input[cursor] === "#" || (input[cursor] === "-" && input[cursor + 1] === "-" &&
        Number.isFinite(input.charCodeAt(cursor + 2)) && input.charCodeAt(cursor + 2) <= 0x20)) {
        const newline = input.slice(cursor).search(/[\r\n]/u);
        return newline < 0 ? input.length : skipTrivia(cursor + newline + 1);
      }
      break;
    }
    return cursor;
  };
  while (index < input.length) {
    const character = input[index]!;
    const next = input[index + 1];
    if (character === "'" || character === '"') {
      skipQuoted(character);
      continue;
    }
    if (character === "#" || (character === "-" && next === "-" &&
      Number.isFinite(input.charCodeAt(index + 2)) && input.charCodeAt(index + 2) <= 0x20)) {
      const newline = input.slice(index).search(/[\r\n]/u);
      index = newline < 0 ? input.length : index + newline + 1;
      continue;
    }
    if (character === "/" && next === "*") {
      const close = input.indexOf("*/", index + 2);
      index = close < 0 ? input.length : close + 2;
      continue;
    }
    let identifier = "";
    let quotedIdentifier = false;
    if (character === "`") {
      quotedIdentifier = true;
      index += 1;
      while (index < input.length) {
        if (input[index] === "`" && input[index + 1] === "`") {
          identifier += "`";
          index += 2;
        } else if (input[index] === "`") {
          index += 1;
          break;
        } else {
          identifier += input[index]!;
          index += 1;
        }
      }
    } else if (/[A-Za-z_]/u.test(character)) {
      const start = index;
      index += 1;
      while (index < input.length && /[A-Za-z0-9_$]/u.test(input[index]!)) index += 1;
      identifier = input.slice(start, index);
    } else {
      index += 1;
      continue;
    }
    const follower = skipTrivia(index);
    if (input[follower] !== "(") continue;
    const normalized = identifier.toUpperCase();
    if (quotedIdentifier || !parenthesizedSqlSyntax.has(normalized)) calls.push(normalized);
  }
  return calls;
}

const lexicalSql = (input: string): string => {
  let output = "";
  let state: "normal" | "single" | "backtick" | "line" | "block" = "normal";
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    const next = input[index + 1];
    if (state === "line") {
      if (character === "\n" || character === "\r") {
        state = "normal";
        output += " ";
      }
      continue;
    }
    if (state === "block") {
      if (character === "*" && next === "/") {
        state = "normal";
        output += " ";
        index += 1;
      }
      continue;
    }
    if (state === "single" || state === "backtick") {
      const delimiter = state === "single" ? "'" : "`";
      if (character === "\\" && state !== "backtick") {
        index += 1;
        continue;
      }
      if (character === delimiter) {
        if (next === delimiter) {
          index += 1;
          continue;
        }
        state = "normal";
        output += " ? ";
      }
      continue;
    }
    const commentFollower = input.charCodeAt(index + 2);
    if (character === "-" && next === "-" && Number.isFinite(commentFollower) && commentFollower <= 0x20) {
      state = "line";
      index += 1;
      continue;
    }
    if (character === "#") {
      state = "line";
      continue;
    }
    if (character === "/" && next === "*") {
      if (input[index + 2] === "!" || input[index + 2] === "+") {
        throw new Error("Dashboard checker read-only facade rejected a non-read-only query");
      }
      state = "block";
      index += 1;
      continue;
    }
    if (character === "'") state = "single";
    else if (character === '"') {
      throw new Error("Dashboard checker read-only facade rejected an ANSI_QUOTES-ambiguous token");
    }
    else if (character === "`") state = "backtick";
    else output += character;
  }
  if (state !== "normal" && state !== "line") {
    throw new Error("Dashboard checker read-only facade rejected malformed SQL");
  }
  return output.trim();
};

const oneSqlStatement = (input: string): string => {
  const lexical = lexicalSql(input);
  const semicolons = [...lexical.matchAll(/;/gu)].map((match) => match.index ?? -1);
  if (semicolons.length > 1) {
    throw new Error("Dashboard checker read-only facade rejected multiple SQL statements");
  }
  if (semicolons.length === 1 && lexical.slice(semicolons[0]! + 1).trim() !== "") {
    throw new Error("Dashboard checker read-only facade rejected multiple SQL statements");
  }
  return lexical.replace(/;\s*$/u, "").trim();
};

const topLevelWords = (statement: string): string[] => {
  const words: string[] = [];
  let depth = 0;
  let current = "";
  const flush = (): void => {
    if (current !== "" && depth === 0) words.push(current.toUpperCase());
    current = "";
  };
  for (const character of statement) {
    if (character === "(") {
      flush();
      depth += 1;
    } else if (character === ")") {
      flush();
      depth -= 1;
      if (depth < 0) throw new Error("Dashboard checker read-only facade rejected malformed SQL");
    } else if (/[A-Za-z_]/u.test(character)) {
      current += character;
    } else {
      flush();
    }
  }
  flush();
  if (depth !== 0) throw new Error("Dashboard checker read-only facade rejected malformed SQL");
  return words;
};

export function assertReadOnlySql(query: unknown): void {
  const statement = oneSqlStatement(queryText(query));
  const containsNonAsciiSqlToken = [...statement].some((character) => character.codePointAt(0)! > 0x7f);
  if (
    statement === "" || containsNonAsciiSqlToken || sqlQualifiedFunctionCall.test(statement) ||
    sqlWriteKeyword.test(statement) || sqlReadSideEffect.test(statement)
  ) {
    throw new Error("Dashboard checker read-only facade rejected a non-read-only query");
  }
  const unsupportedFunctions = extractSqlFunctionCalls(query)
    .filter((name) => !checkerSqlFunctions.has(name));
  if (unsupportedFunctions.length > 0) {
    throw new Error(
      `Dashboard checker read-only facade rejected unsupported SQL function: ${unsupportedFunctions.join(", ")}`
    );
  }
  const words = topLevelWords(statement);
  const first = words[0];
  if (first === "SELECT" || first === "DESCRIBE") return;
  if (first === "SHOW" && /^SHOW\s+GRANTS$/iu.test(statement)) return;
  if (first === "WITH") {
    const terminal = words.find((word, index) => index > 0 && [
      "SELECT", "INSERT", "UPDATE", "DELETE", "REPLACE"
    ].includes(word));
    if (terminal === "SELECT") return;
  }
  if (first === "EXPLAIN") {
    const explained = statement.replace(/^\s*EXPLAIN\s+/iu, "");
    const explainedWords = topLevelWords(explained);
    if (explainedWords[0] === "SELECT" || explainedWords[0] === "WITH") return;
  }
  throw new Error("Dashboard checker read-only facade rejected a non-read-only query");
}

export interface SelectOnlyQueryFacade {
  $queryRaw: <T = unknown>(query: unknown, ...values: unknown[]) => Promise<T>;
}

export function createSelectOnlyQueryFacade(client: { $queryRaw: QueryRaw }): SelectOnlyQueryFacade {
  return Object.freeze({
    $queryRaw: async <T = unknown>(query: unknown, ...values: unknown[]): Promise<T> => {
      assertReadOnlySql(query);
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
    const witness = authorized.find((entry) =>
      entry.namespace === row.witnessNamespace && entry.id === row.witnessId
    );
    if (!witness) {
      throw new Error("Independent evidence row is not manifest-authorized");
    }
    const key = `${row.metricKey}:${row.period}:${row.witnessNamespace}:${row.witnessId}`;
    if (seen.has(key)) throw new Error("Independent evidence contains duplicate rows");
    seen.add(key);
    const contribution = toSafeValue(row.value);
    if (witness.expectation === "positive" && contribution === 0) {
      throw new Error(`Independent evidence expected a positive contribution: ${key}`);
    }
    if (witness.expectation === "zero" && contribution !== 0) {
      throw new Error(`Independent evidence expected an explicit zero baseline: ${key}`);
    }
    const next = sums[row.metricKey][row.period] + contribution;
    if (!Number.isSafeInteger(next)) throw new Error("Independent evidence aggregate is unsafe");
    sums[row.metricKey][row.period] = next;
  }
  for (const metricKey of DASHBOARD_CHECK_READY_METRIC_KEYS) {
    for (const period of ["current", "previous"] as const) {
      for (const witness of fixture.readyMetricWitnesses[metricKey][period]) {
        if (!seen.has(`${metricKey}:${period}:${witness.namespace}:${witness.id}`)) {
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
  const expected = new Map<string, FixtureWitnessRef>();
  for (const [kind, witnesses] of Object.entries(fixture.witnesses)) {
    for (const witness of witnesses) {
      expected.set(`${kind}:${witness.namespace}:${witness.id}:${witness.period}`, witness);
    }
  }
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.kind}:${row.witnessNamespace}:${row.witnessId}:${row.period}`;
    const witness = expected.get(key);
    if (!witness) throw new Error("Fixture witness row is not manifest-authorized");
    if (seen.has(key)) throw new Error("Fixture witness query returned a duplicate row");
    if (Number(row.resolvedCount) !== 1) {
      throw new Error("Fixture witness must resolve to exactly one physical row");
    }
    if (row.identifierKind !== witness.identifierKind || row.resolvedIdentifier !== witness.id) {
      throw new Error("Fixture witness resolved identifier is not an exact canonical match");
    }
    if (row.provenanceField !== witness.provenance.field || row.resolvedProvenance !== witness.provenance.value) {
      throw new Error("Fixture witness persisted provenance does not match immutable authority");
    }
    if (
      row.kind === "reversedFinancialIds" &&
      (row.resolvedReversalState !== "refunded" ||
        typeof row.resolvedReversalReference !== "string" ||
        row.resolvedReversalReference.trim() === "")
    ) {
      throw new Error("Fixture witness formal reversal evidence is invalid");
    }
    if (
      row.kind !== "reversedFinancialIds" &&
      (row.resolvedReversalState !== null || row.resolvedReversalReference !== null)
    ) {
      throw new Error("Fixture witness contains unexpected reversal evidence");
    }
    seen.add(key);
  }
  for (const key of expected.keys()) {
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
      periods[period].map((witness) =>
        `SELECT ${sqlLiteral(metricKey)} AS metric_key, ${sqlLiteral(period)} AS period_key, ${sqlLiteral(witness.namespace)} AS witness_namespace, ${sqlLiteral(witness.id)} AS witness_id, ${sqlLiteral(witness.identifierKind)} AS identifier_kind, ${sqlLiteral(witness.provenance.field)} AS provenance_field, ${sqlLiteral(witness.provenance.value)} AS provenance_value`
      )
    )
  ).join(" UNION ALL ");

const coherentCheckoutCorePredicate = `
  booking.deleted_at IS NULL
  AND booking.payment_confirmed_by_id IS NOT NULL
  AND checkout.deleted_at IS NULL
  AND checkout.base_amount_jpy >= 0
  AND checkout.add_on_amount_jpy >= 0
  AND checkout.discount_amount_jpy >= 0
  AND checkout.checkout_amount_jpy >= 0
  AND checkout.payable_ndp >= 0
  AND checkout.base_amount_jpy + checkout.add_on_amount_jpy - checkout.discount_amount_jpy = checkout.checkout_amount_jpy
  AND booking.payment_amount_jpy = checkout.checkout_amount_jpy
  AND booking.payment_method = checkout.payment_method
  AND checkout.payment_selected_at IS NOT NULL
  AND checkout.payment_selected_at <= booking.payment_confirmed_at`;

const validCompletedCheckoutPredicate = `
  ${coherentCheckoutCorePredicate}
  AND booking.status = 'completed'
  AND booking.payment_status = 'confirmed'
  AND booking.payment_refunded_at IS NULL
  AND booking.payment_refunded_by_id IS NULL
  AND booking.payment_refund_reference IS NULL
  AND booking.payment_refund_reason IS NULL`;

const validCheckoutPaymentEvidencePredicate = `
  (
    (checkout.payment_method = 'ndp'
      AND checkout.ledger_transaction_id IS NOT NULL
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
          AND payment_ledger.created_at <= booking.payment_confirmed_at
          AND booking.payment_reference = CONCAT('checkout:', checkout.id, ':ledger:', payment_ledger.id))
      AND booking.payment_note IS NULL
      AND checkout.receipt_confirmed_by_id IS NULL
      AND checkout.receipt_confirmed_at IS NULL
      AND checkout.receipt_confirmation_reason IS NULL)
    OR
    (checkout.payment_method IN ('cash', 'other')
      AND checkout.ledger_transaction_id IS NULL
      AND checkout.receipt_confirmed_by_id = booking.payment_confirmed_by_id
      AND checkout.receipt_confirmed_at BETWEEN checkout.payment_selected_at AND booking.payment_confirmed_at
      AND checkout.receipt_confirmation_reason IS NOT NULL
      AND TRIM(checkout.receipt_confirmation_reason) <> ''
      AND booking.payment_note = checkout.receipt_confirmation_reason
      AND booking.payment_reference IN (
        CONCAT('checkout:', checkout.id, ':technician-receipt'),
        CONCAT('checkout:', checkout.id, ':operations-receipt'))
      AND ((checkout.payment_method = 'cash'
          AND checkout.other_method_code IS NULL AND checkout.other_method_label IS NULL)
        OR (checkout.payment_method = 'other'
          AND checkout.other_method_code IS NOT NULL AND TRIM(checkout.other_method_code) <> ''
          AND checkout.other_method_label IS NOT NULL AND TRIM(checkout.other_method_label) <> '')))
  )`;

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
      SELECT authorized.metric_key, authorized.period_key, authorized.witness_namespace, authorized.witness_id,
        CASE authorized.metric_key
          WHEN 'gross_revenue' THEN checkout.checkout_amount_jpy
          ELSE checkout.discount_amount_jpy
        END AS contribution_value
      FROM authorized
      INNER JOIN periods AS period ON period.period_key = authorized.period_key
      INNER JOIN booking_orders AS booking
        ON authorized.identifier_kind = 'order_no'
        AND BINARY TRIM(booking.order_no) = BINARY authorized.witness_id
      INNER JOIN shops AS shop ON shop.id = booking.shop_id AND shop.deleted_at IS NULL
      INNER JOIN order_checkouts AS checkout ON checkout.booking_order_id = booking.id
      WHERE authorized.metric_key IN ('gross_revenue', 'discount_amount')
        AND authorized.provenance_field = 'service_snapshot_json.fixtureMarker'
        AND BINARY JSON_UNQUOTE(JSON_EXTRACT(booking.service_snapshot_json, '$.fixtureMarker'))
          = BINARY authorized.provenance_value
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
                AND payment_ledger.created_at <= booking.payment_confirmed_at
                AND booking.payment_reference = CONCAT('checkout:', checkout.id, ':ledger:', payment_ledger.id))
            AND booking.payment_note IS NULL
            AND checkout.receipt_confirmed_by_id IS NULL
            AND checkout.receipt_confirmed_at IS NULL
            AND checkout.receipt_confirmation_reason IS NULL)
          OR
          (checkout.payment_method IN ('cash', 'other')
            AND checkout.ledger_transaction_id IS NULL
            AND checkout.receipt_confirmed_by_id = booking.payment_confirmed_by_id
            AND checkout.receipt_confirmed_at BETWEEN checkout.payment_selected_at AND booking.payment_confirmed_at
            AND checkout.receipt_confirmation_reason IS NOT NULL
            AND TRIM(checkout.receipt_confirmation_reason) <> ''
            AND booking.payment_note = checkout.receipt_confirmation_reason
            AND booking.payment_reference IN (
              CONCAT('checkout:', checkout.id, ':technician-receipt'),
              CONCAT('checkout:', checkout.id, ':operations-receipt'))
            AND ((checkout.payment_method = 'cash'
                AND checkout.other_method_code IS NULL AND checkout.other_method_label IS NULL)
              OR (checkout.payment_method = 'other'
                AND checkout.other_method_code IS NOT NULL AND TRIM(checkout.other_method_code) <> ''
                AND checkout.other_method_label IS NOT NULL AND TRIM(checkout.other_method_label) <> '')))
        )
    ),
    commission_order_base AS (
      SELECT authorized.metric_key, authorized.period_key, authorized.witness_namespace, authorized.witness_id,
        booking.id AS booking_order_id, booking.technician_profile_id, booking.shop_id,
        DATE(CONVERT_TZ(session.ended_at, '+00:00', '+09:00')) AS work_date,
        CASE
          WHEN (
            SELECT COUNT(DISTINCT affiliation.relationship_type)
            FROM technician_shop_affiliations AS affiliation
            WHERE affiliation.technician_profile_id = technician.id
              AND affiliation.shop_id = booking.shop_id
              AND affiliation.work_status = 'active' AND affiliation.deleted_at IS NULL
              AND DATE(CONVERT_TZ(affiliation.starts_at, '+00:00', '+09:00'))
                <= DATE(CONVERT_TZ(session.ended_at, '+00:00', '+09:00'))
              AND (affiliation.ends_at IS NULL OR
                DATE(CONVERT_TZ(affiliation.ends_at, '+00:00', '+09:00'))
                  >= DATE(CONVERT_TZ(session.ended_at, '+00:00', '+09:00')))
          ) = 1 AND (
            SELECT MAX(affiliation.relationship_type)
            FROM technician_shop_affiliations AS affiliation
            WHERE affiliation.technician_profile_id = technician.id
              AND affiliation.shop_id = booking.shop_id
              AND affiliation.work_status = 'active' AND affiliation.deleted_at IS NULL
              AND DATE(CONVERT_TZ(affiliation.starts_at, '+00:00', '+09:00'))
                <= DATE(CONVERT_TZ(session.ended_at, '+00:00', '+09:00'))
              AND (affiliation.ends_at IS NULL OR
                DATE(CONVERT_TZ(affiliation.ends_at, '+00:00', '+09:00'))
                  >= DATE(CONVERT_TZ(session.ended_at, '+00:00', '+09:00')))
          ) = 'exclusive' THEN 'dedicated'
          WHEN (
            SELECT COUNT(DISTINCT affiliation.relationship_type)
            FROM technician_shop_affiliations AS affiliation
            WHERE affiliation.technician_profile_id = technician.id
              AND affiliation.shop_id = booking.shop_id
              AND affiliation.work_status = 'active' AND affiliation.deleted_at IS NULL
              AND DATE(CONVERT_TZ(affiliation.starts_at, '+00:00', '+09:00'))
                <= DATE(CONVERT_TZ(session.ended_at, '+00:00', '+09:00'))
              AND (affiliation.ends_at IS NULL OR
                DATE(CONVERT_TZ(affiliation.ends_at, '+00:00', '+09:00'))
                  >= DATE(CONVERT_TZ(session.ended_at, '+00:00', '+09:00')))
          ) = 1 AND (
            SELECT MAX(affiliation.relationship_type)
            FROM technician_shop_affiliations AS affiliation
            WHERE affiliation.technician_profile_id = technician.id
              AND affiliation.shop_id = booking.shop_id
              AND affiliation.work_status = 'active' AND affiliation.deleted_at IS NULL
              AND DATE(CONVERT_TZ(affiliation.starts_at, '+00:00', '+09:00'))
                <= DATE(CONVERT_TZ(session.ended_at, '+00:00', '+09:00'))
              AND (affiliation.ends_at IS NULL OR
                DATE(CONVERT_TZ(affiliation.ends_at, '+00:00', '+09:00'))
                  >= DATE(CONVERT_TZ(session.ended_at, '+00:00', '+09:00')))
          ) = 'partner' THEN 'part_time'
          WHEN NOT EXISTS (
            SELECT 1 FROM technician_shop_affiliations AS affiliation
            WHERE affiliation.technician_profile_id = technician.id
              AND affiliation.shop_id = booking.shop_id
              AND affiliation.work_status = 'active' AND affiliation.deleted_at IS NULL
              AND DATE(CONVERT_TZ(affiliation.starts_at, '+00:00', '+09:00'))
                <= DATE(CONVERT_TZ(session.ended_at, '+00:00', '+09:00'))
              AND (affiliation.ends_at IS NULL OR
                DATE(CONVERT_TZ(affiliation.ends_at, '+00:00', '+09:00'))
                  >= DATE(CONVERT_TZ(session.ended_at, '+00:00', '+09:00')))
          ) AND technician.shop_id = booking.shop_id AND technician.employment_type = 'FULL_TIME'
            THEN 'dedicated'
          WHEN NOT EXISTS (
            SELECT 1 FROM technician_shop_affiliations AS affiliation
            WHERE affiliation.technician_profile_id = technician.id
              AND affiliation.shop_id = booking.shop_id
              AND affiliation.work_status = 'active' AND affiliation.deleted_at IS NULL
              AND DATE(CONVERT_TZ(affiliation.starts_at, '+00:00', '+09:00'))
                <= DATE(CONVERT_TZ(session.ended_at, '+00:00', '+09:00'))
              AND (affiliation.ends_at IS NULL OR
                DATE(CONVERT_TZ(affiliation.ends_at, '+00:00', '+09:00'))
                  >= DATE(CONVERT_TZ(session.ended_at, '+00:00', '+09:00')))
          ) AND technician.shop_id = booking.shop_id
            AND technician.employment_type IN ('TEMPORARY', 'INDEPENDENT') THEN 'part_time'
          ELSE NULL
        END AS classification,
        (
          SELECT COUNT(profile.id)
          FROM technician_compensation_profiles AS profile
          WHERE profile.technician_profile_id = booking.technician_profile_id
            AND profile.shop_id = booking.shop_id
            AND profile.status IN ('active', 'archived') AND profile.deleted_at IS NULL
            AND (profile.effective_from IS NULL OR
              DATE(CONVERT_TZ(profile.effective_from, '+00:00', '+09:00'))
                <= DATE(CONVERT_TZ(session.ended_at, '+00:00', '+09:00')))
            AND (profile.effective_to IS NULL OR
              DATE(CONVERT_TZ(profile.effective_to, '+00:00', '+09:00'))
                >= DATE(CONVERT_TZ(session.ended_at, '+00:00', '+09:00')))
        ) AS matching_profile_count,
        (
          SELECT COUNT(profile.id)
          FROM technician_compensation_profiles AS profile
          WHERE profile.technician_profile_id = booking.technician_profile_id
            AND profile.shop_id = booking.shop_id
            AND profile.status IN ('active', 'archived') AND profile.deleted_at IS NULL
            AND (profile.base_salary_jpy < 0
              OR profile.wage_mode NOT IN ('fixed_per_order', 'commission', 'base_plus_commission', 'hourly')
              OR (profile.effective_from IS NOT NULL AND profile.effective_to IS NOT NULL
                AND profile.effective_from > profile.effective_to))
        ) AS profile_history_anomaly_count,
        (
          SELECT MAX(profile.id) FROM technician_compensation_profiles AS profile
          WHERE profile.technician_profile_id = booking.technician_profile_id
            AND profile.shop_id = booking.shop_id
            AND profile.status IN ('active', 'archived') AND profile.deleted_at IS NULL
            AND (profile.effective_from IS NULL OR
              DATE(CONVERT_TZ(profile.effective_from, '+00:00', '+09:00'))
                <= DATE(CONVERT_TZ(session.ended_at, '+00:00', '+09:00')))
            AND (profile.effective_to IS NULL OR
              DATE(CONVERT_TZ(profile.effective_to, '+00:00', '+09:00'))
                >= DATE(CONVERT_TZ(session.ended_at, '+00:00', '+09:00')))
        ) AS compensation_profile_id,
        (
          SELECT MAX(profile.base_salary_jpy) FROM technician_compensation_profiles AS profile
          WHERE profile.technician_profile_id = booking.technician_profile_id
            AND profile.shop_id = booking.shop_id
            AND profile.status IN ('active', 'archived') AND profile.deleted_at IS NULL
            AND (profile.effective_from IS NULL OR
              DATE(CONVERT_TZ(profile.effective_from, '+00:00', '+09:00'))
                <= DATE(CONVERT_TZ(session.ended_at, '+00:00', '+09:00')))
            AND (profile.effective_to IS NULL OR
              DATE(CONVERT_TZ(profile.effective_to, '+00:00', '+09:00'))
                >= DATE(CONVERT_TZ(session.ended_at, '+00:00', '+09:00')))
        ) AS base_salary_jpy,
        (
          SELECT MAX(profile.wage_mode) FROM technician_compensation_profiles AS profile
          WHERE profile.technician_profile_id = booking.technician_profile_id
            AND profile.shop_id = booking.shop_id
            AND profile.status IN ('active', 'archived') AND profile.deleted_at IS NULL
            AND (profile.effective_from IS NULL OR
              DATE(CONVERT_TZ(profile.effective_from, '+00:00', '+09:00'))
                <= DATE(CONVERT_TZ(session.ended_at, '+00:00', '+09:00')))
            AND (profile.effective_to IS NULL OR
              DATE(CONVERT_TZ(profile.effective_to, '+00:00', '+09:00'))
                >= DATE(CONVERT_TZ(session.ended_at, '+00:00', '+09:00')))
        ) AS wage_mode,
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
        ), 0) AS settled_share_jpy
      FROM authorized
      INNER JOIN periods AS period ON period.period_key = authorized.period_key
      INNER JOIN booking_orders AS booking
        ON authorized.identifier_kind = 'order_no'
        AND BINARY TRIM(booking.order_no) = BINARY authorized.witness_id
      INNER JOIN shops AS shop ON shop.id = booking.shop_id AND shop.deleted_at IS NULL
      INNER JOIN order_checkouts AS checkout ON checkout.booking_order_id = booking.id
      INNER JOIN order_service_sessions AS session ON session.booking_order_id = booking.id
        AND session.ended_at >= period.from_inclusive AND session.ended_at < period.to_exclusive
        AND session.ended_by_user_id IS NOT NULL AND session.deleted_at IS NULL
      INNER JOIN technician_profiles AS technician ON technician.id = booking.technician_profile_id
        AND technician.deleted_at IS NULL
      WHERE authorized.metric_key IN ('dedicated_technician_commission', 'part_time_technician_commission')
        AND authorized.provenance_field = 'service_snapshot_json.fixtureMarker'
        AND BINARY JSON_UNQUOTE(JSON_EXTRACT(booking.service_snapshot_json, '$.fixtureMarker'))
          = BINARY authorized.provenance_value
        AND TRIM(shop.city) = ${sqlLiteral(fixture.city)}
        AND ${validCompletedCheckoutPredicate}
        AND session.started_at IS NOT NULL AND session.started_by_user_id IS NOT NULL
        AND session.started_at <= session.ended_at
        AND EXISTS (
          SELECT 1 FROM order_service_events AS service_end_event
          WHERE service_end_event.booking_order_id = booking.id
            AND service_end_event.service_session_id = session.id
            AND service_end_event.event_type = 'service_ended'
            AND service_end_event.actor_user_id = session.ended_by_user_id
            AND service_end_event.occurred_at = session.ended_at
            AND service_end_event.deleted_at IS NULL)
        AND (
          (checkout.payment_method = 'ndp'
            AND EXISTS (
              SELECT 1 FROM ledger_transactions AS payment_ledger
              WHERE payment_ledger.id = checkout.ledger_transaction_id
                AND payment_ledger.type = 'booking_complete_settlement'
                AND payment_ledger.status = 'applied' AND payment_ledger.currency = 'NDP'
                AND payment_ledger.reference_type = 'order_checkout_payment'
                AND payment_ledger.reference_id = checkout.id
                AND payment_ledger.amount = checkout.payable_ndp
                AND payment_ledger.actor_user_id = booking.payment_confirmed_by_id
                AND payment_ledger.deleted_at IS NULL
                AND checkout.payment_selected_at <= payment_ledger.created_at
                AND payment_ledger.created_at <= booking.payment_confirmed_at
                AND booking.payment_reference = CONCAT('checkout:', checkout.id, ':ledger:', payment_ledger.id))
            AND booking.payment_note IS NULL
            AND checkout.receipt_confirmed_by_id IS NULL
            AND checkout.receipt_confirmed_at IS NULL
            AND checkout.receipt_confirmation_reason IS NULL)
          OR
          (checkout.payment_method IN ('cash', 'other')
            AND checkout.ledger_transaction_id IS NULL
            AND checkout.receipt_confirmed_by_id = booking.payment_confirmed_by_id
            AND checkout.receipt_confirmed_at BETWEEN checkout.payment_selected_at AND booking.payment_confirmed_at
            AND checkout.receipt_confirmation_reason IS NOT NULL
            AND TRIM(checkout.receipt_confirmation_reason) <> ''
            AND booking.payment_note = checkout.receipt_confirmation_reason
            AND booking.payment_reference IN (
              CONCAT('checkout:', checkout.id, ':technician-receipt'),
              CONCAT('checkout:', checkout.id, ':operations-receipt'))
            AND ((checkout.payment_method = 'cash'
                AND checkout.other_method_code IS NULL AND checkout.other_method_label IS NULL)
              OR (checkout.payment_method = 'other'
                AND checkout.other_method_code IS NOT NULL AND TRIM(checkout.other_method_code) <> ''
                AND checkout.other_method_label IS NOT NULL AND TRIM(checkout.other_method_label) <> '')))
        )
    ),
    commission_orders AS (
      SELECT * FROM commission_order_base
      WHERE matching_profile_count = 1 AND profile_history_anomaly_count = 0
        AND ((metric_key = 'dedicated_technician_commission' AND classification = 'dedicated')
          OR (metric_key = 'part_time_technician_commission' AND classification = 'part_time'))
    ),
    commission_months AS (
      SELECT period_key, classification, technician_profile_id, shop_id,
        compensation_profile_id, YEAR(work_date) AS work_year, MONTH(work_date) AS work_month,
        MAX(base_salary_jpy) AS base_salary_jpy, MAX(wage_mode) AS wage_mode,
        COUNT(DISTINCT work_date) AS distinct_work_days,
        MIN(CONCAT(work_date, ':', witness_id)) AS allocation_owner
      FROM commission_orders
      GROUP BY period_key, classification, technician_profile_id, shop_id,
        compensation_profile_id, YEAR(work_date), MONTH(work_date)
    ),
    commission_rows AS (
      SELECT order_row.metric_key, order_row.period_key, order_row.witness_namespace,
        order_row.witness_id,
        order_row.settled_share_jpy + CASE
          WHEN month_row.wage_mode = 'base_plus_commission'
            AND CONCAT(order_row.work_date, ':', order_row.witness_id) = month_row.allocation_owner
          THEN ROUND(month_row.base_salary_jpy * month_row.distinct_work_days
            / DAY(LAST_DAY(order_row.work_date)))
          ELSE 0 END AS contribution_value
      FROM commission_orders AS order_row
      INNER JOIN commission_months AS month_row
        ON month_row.period_key = order_row.period_key
        AND month_row.classification = order_row.classification
        AND month_row.technician_profile_id = order_row.technician_profile_id
        AND month_row.shop_id = order_row.shop_id
        AND month_row.compensation_profile_id = order_row.compensation_profile_id
        AND month_row.work_year = YEAR(order_row.work_date)
        AND month_row.work_month = MONTH(order_row.work_date)
    ),
    affiliate_rows AS (
      SELECT authorized.metric_key, authorized.period_key, authorized.witness_namespace, authorized.witness_id,
        CASE authorized.metric_key WHEN 'marketing_commission' THEN reward.reward_ndp
          ELSE reward.platform_fee_ndp END AS contribution_value
      FROM authorized
      INNER JOIN periods AS period ON period.period_key = authorized.period_key
      INNER JOIN affiliate_rewards AS reward
        ON authorized.identifier_kind = 'numeric_id'
        AND CAST(reward.id AS CHAR) = authorized.witness_id
      INNER JOIN affiliate_attributions AS attribution ON attribution.id = reward.attribution_id
        AND attribution.booking_order_id = reward.booking_order_id
        AND attribution.task_id = reward.task_id AND attribution.claim_id = reward.claim_id
        AND attribution.status = 'settled' AND attribution.settled_at = reward.settled_at
        AND attribution.deleted_at IS NULL
      INNER JOIN booking_orders AS booking ON booking.id = attribution.booking_order_id
        AND booking.shop_id = attribution.shop_id
        AND booking.status = 'completed' AND booking.payment_status = 'confirmed'
        AND booking.payment_confirmed_by_id IS NOT NULL
        AND booking.payment_refunded_at IS NULL AND booking.payment_refunded_by_id IS NULL
        AND booking.payment_refund_reference IS NULL AND booking.payment_refund_reason IS NULL
        AND booking.deleted_at IS NULL
      INNER JOIN shops AS shop ON shop.id = attribution.shop_id AND shop.deleted_at IS NULL
      INNER JOIN affiliate_reward_transactions AS reward_transaction
        ON reward_transaction.reward_id = reward.id AND reward_transaction.kind = 'settlement'
        AND reward_transaction.amount_ndp = reward.reward_ndp + reward.platform_fee_ndp
        AND reward_transaction.deleted_at IS NULL
      INNER JOIN ledger_transactions AS ledger ON ledger.id = reward_transaction.ledger_transaction_id
        AND ledger.type = 'affiliate_reward_settlement' AND ledger.status = 'applied'
        AND ledger.currency = 'NDP' AND ledger.reference_type = 'affiliate_reward'
        AND ledger.reference_id = reward.id AND ledger.amount = reward.reward_ndp + reward.platform_fee_ndp
        AND JSON_UNQUOTE(JSON_EXTRACT(ledger.metadata, '$.taskId')) = CAST(reward.task_id AS CHAR)
        AND JSON_UNQUOTE(JSON_EXTRACT(ledger.metadata, '$.attributionId')) = CAST(reward.attribution_id AS CHAR)
        AND JSON_UNQUOTE(JSON_EXTRACT(ledger.metadata, '$.bookingOrderId')) = CAST(reward.booking_order_id AS CHAR)
        AND JSON_UNQUOTE(JSON_EXTRACT(ledger.metadata, '$.rewardNdp')) = CAST(reward.reward_ndp AS CHAR)
        AND JSON_UNQUOTE(JSON_EXTRACT(ledger.metadata, '$.platformFeeNdp')) = CAST(reward.platform_fee_ndp AS CHAR)
        AND ledger.deleted_at IS NULL
      WHERE authorized.metric_key IN ('marketing_commission', 'affiliate_platform_income')
        AND authorized.provenance_field = 'ledger.metadata.fixtureMarker'
        AND BINARY JSON_UNQUOTE(JSON_EXTRACT(ledger.metadata, '$.fixtureMarker'))
          = BINARY authorized.provenance_value
        AND TRIM(shop.city) = ${sqlLiteral(fixture.city)}
        AND reward.status = 'settled' AND reward.deleted_at IS NULL
        AND reward.settled_at >= period.from_inclusive AND reward.settled_at < period.to_exclusive
        AND reward.reversal_required_ndp = 0 AND reward.reversed_ndp = 0
        AND reward.outstanding_recovery_ndp = 0 AND reward.reversed_at IS NULL
        AND reward.reversal_reason IS NULL
        AND reward.reward_ndp >= 0 AND reward.platform_fee_ndp >= 0
        AND (SELECT COUNT(*) FROM affiliate_reward_transactions AS settlement_transaction
          WHERE settlement_transaction.reward_id = reward.id
            AND settlement_transaction.kind = 'settlement'
            AND settlement_transaction.deleted_at IS NULL) = 1
        AND NOT EXISTS (
          SELECT 1 FROM affiliate_reward_transactions AS contradictory_transaction
          WHERE contradictory_transaction.reward_id = reward.id
            AND contradictory_transaction.kind IN ('reversal', 'recovery')
            AND contradictory_transaction.deleted_at IS NULL)
    ),
    ndp_evidence AS (
      SELECT authorized.period_key, authorized.witness_namespace, authorized.witness_id,
        CASE WHEN booking.payment_confirmed_at >= period.from_inclusive
          AND booking.payment_confirmed_at < period.to_exclusive
          THEN financial.b_platform_fee_actual_ndp + financial.c_request_fee_actual_ndp
          ELSE 0 END
        - CASE WHEN financial.user_reward_granted_at >= period.from_inclusive
          AND financial.user_reward_granted_at < period.to_exclusive
          THEN financial.user_reward_ndp ELSE 0 END AS contribution_value
      FROM authorized
      INNER JOIN periods AS period ON period.period_key = authorized.period_key
      INNER JOIN order_financials AS financial
        ON authorized.identifier_kind = 'numeric_id'
        AND CAST(financial.id AS CHAR) = authorized.witness_id
      INNER JOIN booking_orders AS booking ON booking.id = financial.booking_order_id
      INNER JOIN shops AS shop ON shop.id = booking.shop_id AND shop.deleted_at IS NULL
      INNER JOIN order_checkouts AS checkout ON checkout.booking_order_id = booking.id
      WHERE authorized.metric_key = 'ndp_income'
        AND authorized.provenance_field = 'booking_order.service_snapshot_json.fixtureMarker'
        AND BINARY JSON_UNQUOTE(JSON_EXTRACT(booking.service_snapshot_json, '$.fixtureMarker'))
          = BINARY authorized.provenance_value
        AND TRIM(shop.city) = ${sqlLiteral(fixture.city)}
        AND ${validCompletedCheckoutPredicate}
        AND financial.ndp_currency = 'NDP' AND financial.settlement_status = 'settled'
        AND financial.b_platform_fee_actual_ndp >= 0
        AND financial.c_request_fee_actual_ndp >= 0 AND financial.user_reward_ndp >= 0
        AND financial.deleted_at IS NULL
        AND ((booking.payment_confirmed_at >= period.from_inclusive
            AND booking.payment_confirmed_at < period.to_exclusive)
          OR (financial.user_reward_granted_at >= period.from_inclusive
            AND financial.user_reward_granted_at < period.to_exclusive))
        AND (
          (checkout.payment_method = 'ndp'
            AND EXISTS (
              SELECT 1 FROM ledger_transactions AS payment_ledger
              INNER JOIN wallet_ledgers AS payment_entry
                ON payment_entry.transaction_id = payment_ledger.id
                AND payment_entry.direction = 'available_debit'
                AND payment_entry.amount = checkout.payable_ndp
                AND payment_entry.available_delta = -checkout.payable_ndp
                AND payment_entry.frozen_delta = 0
                AND payment_entry.deleted_at IS NULL
              INNER JOIN wallets AS payment_wallet ON payment_wallet.id = payment_entry.wallet_id
                AND payment_wallet.currency = 'NDP' AND payment_wallet.deleted_at IS NULL
              INNER JOIN finance_reconciliations AS reconciliation
                ON reconciliation.transaction_id = payment_ledger.id
                AND reconciliation.reference_type = 'order_checkout_payment'
                AND reconciliation.reference_id = checkout.id
                AND reconciliation.currency = 'NDP' AND reconciliation.status = 'pending'
                AND reconciliation.expected_amount = checkout.payable_ndp
                AND reconciliation.actual_amount = checkout.payable_ndp
                AND reconciliation.difference_amount = 0 AND reconciliation.deleted_at IS NULL
              WHERE payment_ledger.id = checkout.ledger_transaction_id
                AND payment_ledger.type = 'booking_complete_settlement'
                AND payment_ledger.status = 'applied' AND payment_ledger.currency = 'NDP'
                AND payment_ledger.reference_type = 'order_checkout_payment'
                AND payment_ledger.reference_id = checkout.id
                AND payment_ledger.amount = checkout.payable_ndp
                AND payment_ledger.actor_user_id = booking.payment_confirmed_by_id
                AND checkout.payment_selected_at <= payment_ledger.created_at
                AND payment_ledger.created_at <= booking.payment_confirmed_at
                AND booking.payment_reference = CONCAT('checkout:', checkout.id, ':ledger:', payment_ledger.id)
                AND booking.payment_note IS NULL
                AND checkout.receipt_confirmed_by_id IS NULL
                AND checkout.receipt_confirmed_at IS NULL
                AND checkout.receipt_confirmation_reason IS NULL
                AND payment_ledger.deleted_at IS NULL))
          OR
          (checkout.payment_method IN ('cash', 'other')
            AND checkout.ledger_transaction_id IS NULL
            AND checkout.receipt_confirmed_by_id = booking.payment_confirmed_by_id
            AND checkout.receipt_confirmed_at BETWEEN checkout.payment_selected_at AND booking.payment_confirmed_at
            AND checkout.receipt_confirmation_reason IS NOT NULL
            AND TRIM(checkout.receipt_confirmation_reason) <> ''
            AND booking.payment_note = checkout.receipt_confirmation_reason
            AND booking.payment_reference IN (
              CONCAT('checkout:', checkout.id, ':technician-receipt'),
              CONCAT('checkout:', checkout.id, ':operations-receipt'))
            AND ((checkout.payment_method = 'cash'
                AND checkout.other_method_code IS NULL AND checkout.other_method_label IS NULL)
              OR (checkout.payment_method = 'other'
                AND checkout.other_method_code IS NOT NULL AND TRIM(checkout.other_method_code) <> ''
                AND checkout.other_method_label IS NOT NULL AND TRIM(checkout.other_method_label) <> '')))
        )
        AND (
          NOT (
            financial.user_reward_ndp > 0
            AND financial.user_reward_granted_at >= period.from_inclusive
            AND financial.user_reward_granted_at < period.to_exclusive
          )
          OR (
            financial.user_reward_status IN ('immediate', 'paid')
            AND EXISTS (
          SELECT 1 FROM ledger_transactions AS reward_ledger
          INNER JOIN wallet_ledgers AS reward_entry
            ON reward_entry.transaction_id = reward_ledger.id
            AND reward_entry.direction = 'available_credit'
            AND reward_entry.amount = financial.user_reward_ndp
            AND reward_entry.available_delta = financial.user_reward_ndp
            AND reward_entry.frozen_delta = 0
            AND reward_entry.reason IN ('booking_complete_customer_reward', 'booking_delayed_customer_reward')
            AND reward_entry.deleted_at IS NULL
          INNER JOIN wallets AS reward_wallet ON reward_wallet.id = reward_entry.wallet_id
            AND reward_wallet.owner_type = 'user'
            AND reward_wallet.owner_id = financial.customer_user_id
            AND reward_wallet.currency = 'NDP' AND reward_wallet.deleted_at IS NULL
          WHERE reward_ledger.type = 'booking_complete_settlement'
            AND reward_ledger.status = 'applied' AND reward_ledger.currency = 'NDP'
            AND reward_ledger.reference_type = 'booking_order'
            AND reward_ledger.reference_id = financial.booking_order_id
            AND financial.user_reward_granted_at IS NOT NULL
            AND reward_ledger.created_at >= financial.user_reward_granted_at
            AND reward_ledger.deleted_at IS NULL
          )
          )
        )
    ),
    ndp_period_totals AS (
      SELECT period_key, SUM(contribution_value) AS contribution_value,
        MIN(witness_id) AS allocation_witness_id
      FROM ndp_evidence GROUP BY period_key
      HAVING SUM(contribution_value) >= 0
    ),
    ndp_rows AS (
      SELECT authorized.metric_key, authorized.period_key, authorized.witness_namespace,
        authorized.witness_id,
        CASE WHEN authorized.witness_id = total.allocation_witness_id
          THEN total.contribution_value ELSE 0 END AS contribution_value
      FROM authorized
      INNER JOIN ndp_period_totals AS total ON total.period_key = authorized.period_key
      WHERE authorized.metric_key = 'ndp_income'
    ),
    user_rows AS (
      SELECT authorized.metric_key, authorized.period_key, authorized.witness_namespace, authorized.witness_id, 1 AS contribution_value
      FROM authorized
      INNER JOIN periods AS period ON period.period_key = authorized.period_key
      INNER JOIN users AS registered_user
        ON authorized.identifier_kind = 'needo_id'
        AND BINARY TRIM(registered_user.needo_id) = BINARY authorized.witness_id
      INNER JOIN customer_profiles AS customer ON customer.user_id = registered_user.id
        AND customer.deleted_at IS NULL
      WHERE authorized.metric_key = 'new_users'
        AND authorized.provenance_field = 'email'
        AND BINARY TRIM(registered_user.email) = BINARY authorized.provenance_value
        AND registered_user.created_at >= period.from_inclusive
        AND registered_user.created_at < period.to_exclusive
        AND registered_user.is_active = TRUE AND registered_user.is_test_account = FALSE
        AND registered_user.deleted_at IS NULL AND TRIM(customer.city) = ${sqlLiteral(fixture.city)}
    ),
    member_candidates AS (
      SELECT authorized.metric_key, authorized.period_key, authorized.witness_namespace,
        authorized.witness_id, member_user.id AS member_user_id,
        ROW_NUMBER() OVER (PARTITION BY authorized.period_key, member_user.id
          ORDER BY card.issued_at, card.id) AS user_period_rank
      FROM authorized
      INNER JOIN periods AS period ON period.period_key = authorized.period_key
      INNER JOIN shop_membership_cards AS card
        ON authorized.identifier_kind = 'public_id'
        AND BINARY TRIM(card.public_id) = BINARY authorized.witness_id
      INNER JOIN shop_customer_memberships AS membership ON membership.id = card.membership_id
        AND membership.status = 'active' AND membership.deleted_at IS NULL
      INNER JOIN customer_profiles AS customer ON customer.id = membership.customer_profile_id
        AND customer.deleted_at IS NULL
      INNER JOIN users AS member_user ON member_user.id = customer.user_id
        AND member_user.is_active = TRUE AND member_user.is_test_account = FALSE
        AND member_user.deleted_at IS NULL
      INNER JOIN shops AS shop ON shop.id = membership.shop_id AND shop.deleted_at IS NULL
      WHERE authorized.metric_key = 'new_paid_members'
        AND authorized.provenance_field = 'issuance_reference'
        AND BINARY TRIM(card.issuance_reference) = BINARY authorized.provenance_value
        AND card.issued_at >= period.from_inclusive AND card.issued_at < period.to_exclusive
        AND card.issuance_source = 'offline_paid' AND card.status = 'active'
        AND card.deleted_at IS NULL AND TRIM(shop.city) = ${sqlLiteral(fixture.city)}
        AND card.issued_at = (
          SELECT MIN(historical_card.issued_at)
          FROM shop_membership_cards AS historical_card
          INNER JOIN shop_customer_memberships AS historical_membership
            ON historical_membership.id = historical_card.membership_id
          INNER JOIN customer_profiles AS historical_customer
            ON historical_customer.id = historical_membership.customer_profile_id
          WHERE historical_customer.user_id = member_user.id
            AND historical_card.issuance_source = 'offline_paid'
        )
    ),
    member_rows AS (
      SELECT metric_key, period_key, witness_namespace, witness_id,
        CASE WHEN user_period_rank = 1 THEN 1 ELSE 0 END AS contribution_value
      FROM member_candidates
    ),
    technician_candidates AS (
      SELECT authorized.metric_key, authorized.period_key, authorized.witness_namespace,
        authorized.witness_id, identity_row.user_id, identity_row.created_at AS activated_at,
        technician.id AS technician_profile_id, technician.shop_id AS direct_shop_id
      FROM authorized
      INNER JOIN periods AS period ON period.period_key = authorized.period_key
      INNER JOIN user_identities AS identity_row
        ON authorized.identifier_kind = 'numeric_id'
        AND CAST(identity_row.id AS CHAR) = authorized.witness_id
      INNER JOIN users AS technician_user ON technician_user.id = identity_row.user_id
        AND technician_user.is_active = TRUE AND technician_user.is_test_account = FALSE
        AND technician_user.deleted_at IS NULL
      INNER JOIN technician_profiles AS technician ON technician.user_id = identity_row.user_id
        AND technician.deleted_at IS NULL
      WHERE authorized.metric_key = 'technician_onboarding'
        AND authorized.provenance_field = 'user.email'
        AND BINARY TRIM(technician_user.email) = BINARY authorized.provenance_value
        AND identity_row.type = 'technician' AND identity_row.is_active = TRUE
        AND identity_row.deleted_at IS NULL
        AND identity_row.created_at >= period.from_inclusive
        AND identity_row.created_at < period.to_exclusive
        AND identity_row.created_at = (
          SELECT MIN(history.created_at) FROM user_identities AS history
          WHERE history.user_id = identity_row.user_id AND history.type = 'technician'
        )
    ),
    technician_shop_rows AS (
      SELECT candidate.*, affiliation.shop_id
      FROM technician_candidates AS candidate
      INNER JOIN technician_shop_affiliations AS affiliation
        ON affiliation.technician_profile_id = candidate.technician_profile_id
        AND affiliation.relationship_type IN ('exclusive', 'partner')
        AND affiliation.work_status = 'active' AND affiliation.deleted_at IS NULL
        AND affiliation.starts_at <= candidate.activated_at
        AND (affiliation.ends_at IS NULL OR affiliation.ends_at >= candidate.activated_at)
      UNION ALL
      SELECT candidate.*, candidate.direct_shop_id AS shop_id
      FROM technician_candidates AS candidate
      WHERE candidate.direct_shop_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM technician_shop_affiliations AS affiliation
        WHERE affiliation.technician_profile_id = candidate.technician_profile_id
          AND affiliation.relationship_type IN ('exclusive', 'partner')
          AND affiliation.work_status = 'active' AND affiliation.deleted_at IS NULL
          AND affiliation.starts_at <= candidate.activated_at
          AND (affiliation.ends_at IS NULL OR affiliation.ends_at >= candidate.activated_at)
      )
    ),
    technician_rows AS (
      SELECT candidate.metric_key, candidate.period_key, candidate.witness_namespace,
        candidate.witness_id, 1 AS contribution_value
      FROM technician_shop_rows AS candidate
      INNER JOIN shops AS shop ON shop.id = candidate.shop_id AND shop.deleted_at IS NULL
      WHERE TRIM(shop.city) = ${sqlLiteral(fixture.city)}
      GROUP BY candidate.metric_key, candidate.period_key, candidate.witness_namespace,
        candidate.witness_id
    )
    SELECT metric_key AS metricKey, period_key AS period, witness_namespace AS witnessNamespace, witness_id AS witnessId,
      contribution_value AS value FROM operation_rows
    UNION ALL SELECT metric_key, period_key, witness_namespace, witness_id, contribution_value FROM commission_rows
    UNION ALL SELECT metric_key, period_key, witness_namespace, witness_id, contribution_value FROM affiliate_rows
    UNION ALL SELECT metric_key, period_key, witness_namespace, witness_id, contribution_value FROM ndp_rows
    UNION ALL SELECT metric_key, period_key, witness_namespace, witness_id, contribution_value FROM user_rows
    UNION ALL SELECT metric_key, period_key, witness_namespace, witness_id, contribution_value FROM member_rows
    UNION ALL SELECT metric_key, period_key, witness_namespace, witness_id, contribution_value FROM technician_rows`;
};

const witnessStatement = (fixture: DashboardFixtureManifest): string => {
  const windows = resolveCheckerWindows(fixture.windows.current.from, fixture.windows.current.to);
  const periodBounds = `
    SELECT 'current' AS period_key,
      TIMESTAMP(${sqlLiteral(mysqlTimestamp(windows.current.fromInclusive))}) AS from_inclusive,
      TIMESTAMP(${sqlLiteral(mysqlTimestamp(windows.current.toExclusive))}) AS to_exclusive
    UNION ALL
    SELECT 'previous',
      TIMESTAMP(${sqlLiteral(mysqlTimestamp(windows.previous.fromInclusive))}),
      TIMESTAMP(${sqlLiteral(mysqlTimestamp(windows.previous.toExclusive))})`;
  const authorized = Object.entries(fixture.witnesses).flatMap(([kind, witnesses]) =>
    witnesses.map((witness) =>
      `SELECT ${sqlLiteral(kind)} AS kind, ${sqlLiteral(witness.namespace)} AS witness_namespace, ${sqlLiteral(witness.id)} AS witness_id, ${sqlLiteral(witness.period)} AS period_key, ${sqlLiteral(witness.identifierKind)} AS identifier_kind, ${sqlLiteral(witness.provenance.field)} AS provenance_field, ${sqlLiteral(witness.provenance.value)} AS provenance_value`
    )
  ).join(" UNION ALL ");
  const resolvedIdentifier = `CASE authorized.witness_namespace
    WHEN 'booking_order' THEN (SELECT MIN(TRIM(row_booking.order_no)) FROM booking_orders AS row_booking
      WHERE BINARY TRIM(row_booking.order_no) = BINARY authorized.witness_id
        AND BINARY JSON_UNQUOTE(JSON_EXTRACT(row_booking.service_snapshot_json, '$.fixtureMarker'))
          = BINARY authorized.provenance_value)
    WHEN 'order_financial' THEN (SELECT MIN(CAST(row_financial.id AS CHAR))
      FROM order_financials AS row_financial
      INNER JOIN booking_orders AS row_financial_booking ON row_financial_booking.id = row_financial.booking_order_id
      WHERE CAST(row_financial.id AS CHAR) = authorized.witness_id
        AND BINARY JSON_UNQUOTE(JSON_EXTRACT(row_financial_booking.service_snapshot_json, '$.fixtureMarker'))
          = BINARY authorized.provenance_value)
    WHEN 'ledger_transaction' THEN (SELECT MIN(TRIM(row_ledger.transaction_no))
      FROM ledger_transactions AS row_ledger
      WHERE BINARY TRIM(row_ledger.transaction_no) = BINARY authorized.witness_id
        AND BINARY JSON_UNQUOTE(JSON_EXTRACT(row_ledger.metadata, '$.fixtureMarker'))
          = BINARY authorized.provenance_value)
    WHEN 'membership_card' THEN (SELECT MIN(TRIM(row_card.public_id))
      FROM shop_membership_cards AS row_card
      WHERE BINARY TRIM(row_card.public_id) = BINARY authorized.witness_id
        AND BINARY TRIM(row_card.issuance_reference) = BINARY authorized.provenance_value)
    WHEN 'user_identity' THEN (SELECT MIN(CAST(row_identity.id AS CHAR))
      FROM user_identities AS row_identity
      INNER JOIN users AS row_identity_user ON row_identity_user.id = row_identity.user_id
      WHERE CAST(row_identity.id AS CHAR) = authorized.witness_id
        AND BINARY TRIM(row_identity_user.email) = BINARY authorized.provenance_value)
    WHEN 'compensation_profile' THEN (SELECT MIN(CAST(row_profile.id AS CHAR))
      FROM technician_compensation_profiles AS row_profile
      INNER JOIN technician_profiles AS row_profile_technician
        ON row_profile_technician.id = row_profile.technician_profile_id
      INNER JOIN users AS row_profile_user ON row_profile_user.id = row_profile_technician.user_id
      WHERE CAST(row_profile.id AS CHAR) = authorized.witness_id
        AND BINARY TRIM(row_profile_user.email) = BINARY authorized.provenance_value)
    WHEN 'affiliate_reward' THEN (SELECT MIN(CAST(row_reward.id AS CHAR))
      FROM affiliate_rewards AS row_reward
      INNER JOIN affiliate_reward_transactions AS row_reward_transaction
        ON row_reward_transaction.reward_id = row_reward.id AND row_reward_transaction.kind = 'settlement'
        AND row_reward_transaction.deleted_at IS NULL
      INNER JOIN ledger_transactions AS row_reward_ledger
        ON row_reward_ledger.id = row_reward_transaction.ledger_transaction_id
      WHERE CAST(row_reward.id AS CHAR) = authorized.witness_id
        AND BINARY JSON_UNQUOTE(JSON_EXTRACT(row_reward_ledger.metadata, '$.fixtureMarker'))
          = BINARY authorized.provenance_value)
    WHEN 'user' THEN (SELECT MIN(TRIM(row_user.needo_id)) FROM users AS row_user
      WHERE BINARY TRIM(row_user.needo_id) = BINARY authorized.witness_id
        AND BINARY TRIM(row_user.email) = BINARY authorized.provenance_value)
    ELSE NULL END`;
  const resolvedProvenance = `CASE authorized.witness_namespace
    WHEN 'booking_order' THEN (SELECT MIN(JSON_UNQUOTE(JSON_EXTRACT(row_booking.service_snapshot_json, '$.fixtureMarker')))
      FROM booking_orders AS row_booking
      WHERE BINARY TRIM(row_booking.order_no) = BINARY authorized.witness_id
        AND BINARY JSON_UNQUOTE(JSON_EXTRACT(row_booking.service_snapshot_json, '$.fixtureMarker'))
          = BINARY authorized.provenance_value)
    WHEN 'order_financial' THEN (SELECT MIN(JSON_UNQUOTE(JSON_EXTRACT(row_financial_booking.service_snapshot_json, '$.fixtureMarker')))
      FROM order_financials AS row_financial
      INNER JOIN booking_orders AS row_financial_booking ON row_financial_booking.id = row_financial.booking_order_id
      WHERE CAST(row_financial.id AS CHAR) = authorized.witness_id
        AND BINARY JSON_UNQUOTE(JSON_EXTRACT(row_financial_booking.service_snapshot_json, '$.fixtureMarker'))
          = BINARY authorized.provenance_value)
    WHEN 'ledger_transaction' THEN (SELECT MIN(JSON_UNQUOTE(JSON_EXTRACT(row_ledger.metadata, '$.fixtureMarker')))
      FROM ledger_transactions AS row_ledger
      WHERE BINARY TRIM(row_ledger.transaction_no) = BINARY authorized.witness_id
        AND BINARY JSON_UNQUOTE(JSON_EXTRACT(row_ledger.metadata, '$.fixtureMarker'))
          = BINARY authorized.provenance_value)
    WHEN 'membership_card' THEN (SELECT MIN(TRIM(row_card.issuance_reference))
      FROM shop_membership_cards AS row_card
      WHERE BINARY TRIM(row_card.public_id) = BINARY authorized.witness_id
        AND BINARY TRIM(row_card.issuance_reference) = BINARY authorized.provenance_value)
    WHEN 'user_identity' THEN (SELECT MIN(TRIM(row_identity_user.email))
      FROM user_identities AS row_identity
      INNER JOIN users AS row_identity_user ON row_identity_user.id = row_identity.user_id
      WHERE CAST(row_identity.id AS CHAR) = authorized.witness_id
        AND BINARY TRIM(row_identity_user.email) = BINARY authorized.provenance_value)
    WHEN 'compensation_profile' THEN (SELECT MIN(TRIM(row_profile_user.email))
      FROM technician_compensation_profiles AS row_profile
      INNER JOIN technician_profiles AS row_profile_technician
        ON row_profile_technician.id = row_profile.technician_profile_id
      INNER JOIN users AS row_profile_user ON row_profile_user.id = row_profile_technician.user_id
      WHERE CAST(row_profile.id AS CHAR) = authorized.witness_id
        AND BINARY TRIM(row_profile_user.email) = BINARY authorized.provenance_value)
    WHEN 'affiliate_reward' THEN (SELECT MIN(JSON_UNQUOTE(JSON_EXTRACT(row_reward_ledger.metadata, '$.fixtureMarker')))
      FROM affiliate_rewards AS row_reward
      INNER JOIN affiliate_reward_transactions AS row_reward_transaction
        ON row_reward_transaction.reward_id = row_reward.id AND row_reward_transaction.kind = 'settlement'
        AND row_reward_transaction.deleted_at IS NULL
      INNER JOIN ledger_transactions AS row_reward_ledger
        ON row_reward_ledger.id = row_reward_transaction.ledger_transaction_id
      WHERE CAST(row_reward.id AS CHAR) = authorized.witness_id
        AND BINARY JSON_UNQUOTE(JSON_EXTRACT(row_reward_ledger.metadata, '$.fixtureMarker'))
          = BINARY authorized.provenance_value)
    WHEN 'user' THEN (SELECT MIN(TRIM(row_user.email)) FROM users AS row_user
      WHERE BINARY TRIM(row_user.needo_id) = BINARY authorized.witness_id
        AND BINARY TRIM(row_user.email) = BINARY authorized.provenance_value)
    ELSE NULL END`;
  const resolvedCount = `CASE authorized.witness_namespace
    WHEN 'booking_order' THEN (SELECT COUNT(*) FROM booking_orders AS row_booking
      WHERE BINARY TRIM(row_booking.order_no) = BINARY authorized.witness_id
        AND BINARY JSON_UNQUOTE(JSON_EXTRACT(row_booking.service_snapshot_json, '$.fixtureMarker'))
          = BINARY authorized.provenance_value)
    WHEN 'order_financial' THEN (SELECT COUNT(*) FROM order_financials AS row_financial
      INNER JOIN booking_orders AS row_financial_booking ON row_financial_booking.id = row_financial.booking_order_id
      WHERE CAST(row_financial.id AS CHAR) = authorized.witness_id
        AND BINARY JSON_UNQUOTE(JSON_EXTRACT(row_financial_booking.service_snapshot_json, '$.fixtureMarker'))
          = BINARY authorized.provenance_value)
    WHEN 'ledger_transaction' THEN (SELECT COUNT(*) FROM ledger_transactions AS row_ledger
      WHERE BINARY TRIM(row_ledger.transaction_no) = BINARY authorized.witness_id
        AND BINARY JSON_UNQUOTE(JSON_EXTRACT(row_ledger.metadata, '$.fixtureMarker'))
          = BINARY authorized.provenance_value)
    WHEN 'membership_card' THEN (SELECT COUNT(*) FROM shop_membership_cards AS row_card
      WHERE BINARY TRIM(row_card.public_id) = BINARY authorized.witness_id
        AND BINARY TRIM(row_card.issuance_reference) = BINARY authorized.provenance_value)
    WHEN 'user_identity' THEN (SELECT COUNT(*) FROM user_identities AS row_identity
      INNER JOIN users AS row_identity_user ON row_identity_user.id = row_identity.user_id
      WHERE CAST(row_identity.id AS CHAR) = authorized.witness_id
        AND BINARY TRIM(row_identity_user.email) = BINARY authorized.provenance_value)
    WHEN 'compensation_profile' THEN (SELECT COUNT(*) FROM technician_compensation_profiles AS row_profile
      INNER JOIN technician_profiles AS row_profile_technician
        ON row_profile_technician.id = row_profile.technician_profile_id
      INNER JOIN users AS row_profile_user ON row_profile_user.id = row_profile_technician.user_id
      WHERE CAST(row_profile.id AS CHAR) = authorized.witness_id
        AND BINARY TRIM(row_profile_user.email) = BINARY authorized.provenance_value)
    WHEN 'affiliate_reward' THEN (SELECT COUNT(*) FROM affiliate_rewards AS row_reward
      INNER JOIN affiliate_reward_transactions AS row_reward_transaction
        ON row_reward_transaction.reward_id = row_reward.id AND row_reward_transaction.kind = 'settlement'
        AND row_reward_transaction.deleted_at IS NULL
      INNER JOIN ledger_transactions AS row_reward_ledger
        ON row_reward_ledger.id = row_reward_transaction.ledger_transaction_id
      WHERE CAST(row_reward.id AS CHAR) = authorized.witness_id
        AND BINARY JSON_UNQUOTE(JSON_EXTRACT(row_reward_ledger.metadata, '$.fixtureMarker'))
          = BINARY authorized.provenance_value)
    WHEN 'user' THEN (SELECT COUNT(*) FROM users AS row_user
      WHERE BINARY TRIM(row_user.needo_id) = BINARY authorized.witness_id
        AND BINARY TRIM(row_user.email) = BINARY authorized.provenance_value)
    ELSE 0 END`;
  const resolvedReversalState = `CASE WHEN authorized.kind = 'reversedFinancialIds' THEN (
    SELECT MIN(row_reversal.settlement_status)
    FROM order_financials AS row_reversal
    INNER JOIN booking_orders AS row_reversal_booking
      ON row_reversal_booking.id = row_reversal.booking_order_id
    WHERE CAST(row_reversal.id AS CHAR) = authorized.witness_id
      AND BINARY JSON_UNQUOTE(JSON_EXTRACT(row_reversal_booking.service_snapshot_json, '$.fixtureMarker'))
        = BINARY authorized.provenance_value
  ) ELSE NULL END`;
  const resolvedReversalReference = `CASE WHEN authorized.kind = 'reversedFinancialIds' THEN (
    SELECT MIN(TRIM(row_reversal_booking.payment_refund_reference))
    FROM order_financials AS row_reversal
    INNER JOIN booking_orders AS row_reversal_booking
      ON row_reversal_booking.id = row_reversal.booking_order_id
    WHERE CAST(row_reversal.id AS CHAR) = authorized.witness_id
      AND BINARY JSON_UNQUOTE(JSON_EXTRACT(row_reversal_booking.service_snapshot_json, '$.fixtureMarker'))
        = BINARY authorized.provenance_value
  ) ELSE NULL END`;
  return `/* dashboard_checker_fixture_witnesses */
    WITH authorized AS (${authorized}), periods AS (${periodBounds})
    SELECT authorized.kind, authorized.witness_namespace AS witnessNamespace,
      authorized.witness_id AS witnessId, authorized.period_key AS period,
      authorized.identifier_kind AS identifierKind,
      ${resolvedIdentifier} AS resolvedIdentifier,
      authorized.provenance_field AS provenanceField,
      ${resolvedProvenance} AS resolvedProvenance,
      ${resolvedCount} AS resolvedCount,
      ${resolvedReversalState} AS resolvedReversalState,
      ${resolvedReversalReference} AS resolvedReversalReference
    FROM authorized
    INNER JOIN periods AS period ON period.period_key = authorized.period_key
    WHERE
      (authorized.kind = 'coherentCompletedCheckoutIds' AND EXISTS (
        SELECT 1 FROM booking_orders AS booking
        INNER JOIN shops AS shop ON shop.id = booking.shop_id AND shop.deleted_at IS NULL
        INNER JOIN order_checkouts AS checkout ON checkout.booking_order_id = booking.id
        WHERE authorized.identifier_kind = 'order_no'
          AND authorized.provenance_field = 'service_snapshot_json.fixtureMarker'
          AND BINARY TRIM(booking.order_no) = BINARY authorized.witness_id
          AND BINARY JSON_UNQUOTE(JSON_EXTRACT(booking.service_snapshot_json, '$.fixtureMarker'))
            = BINARY authorized.provenance_value
          AND booking.payment_confirmed_at >= period.from_inclusive
          AND booking.payment_confirmed_at < period.to_exclusive
          AND TRIM(shop.city) = ${sqlLiteral(fixture.city)}
          AND ${validCompletedCheckoutPredicate}
          AND ${validCheckoutPaymentEvidencePredicate}))
      OR (authorized.kind = 'cancelledOrderIds' AND EXISTS (
        SELECT 1 FROM booking_orders AS booking
        INNER JOIN shops AS shop ON shop.id = booking.shop_id AND shop.deleted_at IS NULL
        INNER JOIN order_checkouts AS checkout ON checkout.booking_order_id = booking.id
        INNER JOIN order_status_histories AS history ON history.booking_order_id = booking.id
          AND history.to_status = 'cancelled' AND history.deleted_at IS NULL
          AND history.created_at >= period.from_inclusive AND history.created_at < period.to_exclusive
        WHERE authorized.identifier_kind = 'order_no'
          AND authorized.provenance_field = 'service_snapshot_json.fixtureMarker'
          AND BINARY TRIM(booking.order_no) = BINARY authorized.witness_id
          AND BINARY JSON_UNQUOTE(JSON_EXTRACT(booking.service_snapshot_json, '$.fixtureMarker'))
            = BINARY authorized.provenance_value
          AND ${coherentCheckoutCorePredicate}
          AND booking.status = 'cancelled' AND booking.payment_status = 'confirmed'
          AND booking.payment_refunded_at IS NULL AND booking.payment_refunded_by_id IS NULL
          AND booking.payment_refund_reference IS NULL AND booking.payment_refund_reason IS NULL
          AND booking.payment_confirmed_at >= period.from_inclusive
          AND booking.payment_confirmed_at < period.to_exclusive
          AND TRIM(shop.city) = ${sqlLiteral(fixture.city)}
          AND ${validCheckoutPaymentEvidencePredicate}))
      OR (authorized.kind = 'refundedOrderIds' AND EXISTS (
        SELECT 1 FROM booking_orders AS booking
        INNER JOIN shops AS shop ON shop.id = booking.shop_id AND shop.deleted_at IS NULL
        INNER JOIN order_checkouts AS checkout ON checkout.booking_order_id = booking.id
          AND checkout.deleted_at IS NULL
        WHERE authorized.identifier_kind = 'order_no'
          AND authorized.provenance_field = 'service_snapshot_json.fixtureMarker'
          AND BINARY TRIM(booking.order_no) = BINARY authorized.witness_id
          AND BINARY JSON_UNQUOTE(JSON_EXTRACT(booking.service_snapshot_json, '$.fixtureMarker'))
            = BINARY authorized.provenance_value
          AND ${coherentCheckoutCorePredicate}
          AND booking.status = 'completed' AND booking.payment_status = 'refunded'
          AND booking.payment_confirmed_at >= period.from_inclusive
          AND booking.payment_confirmed_at < period.to_exclusive
          AND TRIM(shop.city) = ${sqlLiteral(fixture.city)}
          AND booking.payment_refunded_at IS NOT NULL
          AND booking.payment_refunded_by_id IS NOT NULL
          AND booking.payment_refund_reference IS NOT NULL
          AND TRIM(booking.payment_refund_reference) <> ''
          AND booking.payment_refund_reason IS NOT NULL AND TRIM(booking.payment_refund_reason) <> ''
          AND ${validCheckoutPaymentEvidencePredicate}))
      OR (authorized.kind = 'reversedFinancialIds' AND EXISTS (
        SELECT 1 FROM order_financials AS financial
        INNER JOIN booking_orders AS booking ON booking.id = financial.booking_order_id
        INNER JOIN shops AS shop ON shop.id = booking.shop_id AND shop.deleted_at IS NULL
        INNER JOIN order_checkouts AS checkout ON checkout.booking_order_id = booking.id
        WHERE authorized.identifier_kind = 'numeric_id'
          AND authorized.provenance_field = 'booking_order.service_snapshot_json.fixtureMarker'
          AND CAST(financial.id AS CHAR) = authorized.witness_id
          AND BINARY JSON_UNQUOTE(JSON_EXTRACT(booking.service_snapshot_json, '$.fixtureMarker'))
            = BINARY authorized.provenance_value
          AND financial.settlement_status = 'refunded' AND financial.deleted_at IS NULL
          AND financial.service_income_status = 'confirmed'
          AND financial.ndp_currency = 'NDP'
          AND financial.b_platform_fee_actual_ndp >= 0
          AND financial.c_request_fee_actual_ndp >= 0 AND financial.user_reward_ndp >= 0
          AND booking.payment_confirmed_at >= period.from_inclusive
          AND booking.payment_confirmed_at < period.to_exclusive
          AND TRIM(shop.city) = ${sqlLiteral(fixture.city)}
          AND ${coherentCheckoutCorePredicate}
          AND booking.status = 'completed' AND booking.payment_status = 'refunded'
          AND booking.payment_refunded_at >= booking.payment_confirmed_at
          AND booking.payment_refunded_by_id IS NOT NULL
          AND booking.payment_refund_reference IS NOT NULL
          AND TRIM(booking.payment_refund_reference) <> ''
          AND booking.payment_refund_reason IS NOT NULL
          AND TRIM(booking.payment_refund_reason) <> ''
          AND JSON_CONTAINS(
            financial.money_timeline_json,
            JSON_OBJECT(
              'type', 'manual_payment_refunded',
              'amountJpy', booking.payment_amount_jpy,
              'status', 'refunded',
              'metadata', JSON_OBJECT(
                'reason', booking.payment_refund_reason,
                'reference', booking.payment_refund_reference
              )
            )
          ) = 1
          AND ${validCheckoutPaymentEvidencePredicate}))
      OR (authorized.kind = 'otherCityOrderIds' AND EXISTS (
        SELECT 1 FROM booking_orders AS booking
        INNER JOIN shops AS shop ON shop.id = booking.shop_id AND shop.deleted_at IS NULL
        INNER JOIN order_checkouts AS checkout ON checkout.booking_order_id = booking.id
        WHERE authorized.identifier_kind = 'order_no'
          AND authorized.provenance_field = 'service_snapshot_json.fixtureMarker'
          AND BINARY TRIM(booking.order_no) = BINARY authorized.witness_id
          AND BINARY JSON_UNQUOTE(JSON_EXTRACT(booking.service_snapshot_json, '$.fixtureMarker'))
            = BINARY authorized.provenance_value
          AND booking.payment_confirmed_at >= period.from_inclusive
          AND booking.payment_confirmed_at < period.to_exclusive
          AND TRIM(shop.city) <> '' AND TRIM(shop.city) <> ${sqlLiteral(fixture.city)}
          AND ${validCompletedCheckoutPredicate}
          AND ${validCheckoutPaymentEvidencePredicate}))
      OR (authorized.kind = 'testNdpLedgerIds' AND EXISTS (
        SELECT 1 FROM ledger_transactions AS ledger
        INNER JOIN order_checkouts AS checkout ON checkout.ledger_transaction_id = ledger.id
        INNER JOIN booking_orders AS booking ON booking.id = checkout.booking_order_id
        INNER JOIN shops AS shop ON shop.id = booking.shop_id AND shop.deleted_at IS NULL
        WHERE authorized.identifier_kind = 'transaction_no'
          AND authorized.provenance_field = 'metadata.fixtureMarker'
          AND BINARY TRIM(ledger.transaction_no) = BINARY authorized.witness_id
          AND BINARY JSON_UNQUOTE(JSON_EXTRACT(ledger.metadata, '$.fixtureMarker'))
            = BINARY authorized.provenance_value
          AND ledger.currency = 'TEST_NDP' AND ledger.type = 'booking_complete_settlement'
          AND ledger.status = 'applied' AND ledger.reference_type = 'order_checkout_payment'
          AND ledger.reference_id = checkout.id AND ledger.amount = checkout.payable_ndp
          AND ledger.actor_user_id = booking.payment_confirmed_by_id AND ledger.deleted_at IS NULL
          AND ledger.created_at BETWEEN checkout.payment_selected_at AND booking.payment_confirmed_at
          AND checkout.payment_method = 'ndp'
          AND checkout.receipt_confirmed_by_id IS NULL
          AND checkout.receipt_confirmed_at IS NULL
          AND checkout.receipt_confirmation_reason IS NULL
          AND booking.payment_note IS NULL
          AND EXISTS (
            SELECT 1 FROM wallet_ledgers AS payment_entry
            INNER JOIN wallets AS payment_wallet ON payment_wallet.id = payment_entry.wallet_id
              AND payment_wallet.currency = 'TEST_NDP' AND payment_wallet.deleted_at IS NULL
            WHERE payment_entry.transaction_id = ledger.id
              AND payment_entry.direction = 'available_debit'
              AND payment_entry.amount = checkout.payable_ndp
              AND payment_entry.available_delta = -checkout.payable_ndp
              AND payment_entry.frozen_delta = 0 AND payment_entry.deleted_at IS NULL)
          AND EXISTS (
            SELECT 1 FROM finance_reconciliations AS reconciliation
            WHERE reconciliation.transaction_id = ledger.id
              AND reconciliation.reference_type = 'order_checkout_payment'
              AND reconciliation.reference_id = checkout.id
              AND reconciliation.currency = 'TEST_NDP' AND reconciliation.status = 'pending'
              AND reconciliation.expected_amount = checkout.payable_ndp
              AND reconciliation.actual_amount = checkout.payable_ndp
              AND reconciliation.difference_amount = 0 AND reconciliation.deleted_at IS NULL)
          AND booking.payment_confirmed_at >= period.from_inclusive
          AND booking.payment_confirmed_at < period.to_exclusive
          AND TRIM(shop.city) = ${sqlLiteral(fixture.city)}
          AND ${validCompletedCheckoutPredicate}
          AND booking.payment_reference = CONCAT('checkout:', checkout.id, ':ledger:', ledger.id)))
      OR (authorized.kind = 'firstPaidMembershipCardIds' AND EXISTS (
        SELECT 1 FROM shop_membership_cards AS card
        INNER JOIN shop_customer_memberships AS membership ON membership.id = card.membership_id
          AND membership.status = 'active' AND membership.deleted_at IS NULL
        INNER JOIN customer_profiles AS customer ON customer.id = membership.customer_profile_id
          AND customer.deleted_at IS NULL
        INNER JOIN users AS member_user ON member_user.id = customer.user_id
          AND member_user.is_active = TRUE AND member_user.is_test_account = FALSE
          AND member_user.deleted_at IS NULL
        INNER JOIN shops AS shop ON shop.id = membership.shop_id AND shop.deleted_at IS NULL
        WHERE authorized.identifier_kind = 'public_id'
          AND authorized.provenance_field = 'issuance_reference'
          AND BINARY TRIM(card.public_id) = BINARY authorized.witness_id
          AND BINARY TRIM(card.issuance_reference) = BINARY authorized.provenance_value
          AND card.issued_at >= period.from_inclusive AND card.issued_at < period.to_exclusive
          AND card.issuance_source = 'offline_paid' AND card.status = 'active'
          AND card.deleted_at IS NULL AND TRIM(shop.city) = ${sqlLiteral(fixture.city)}
          AND card.issued_at = (
            SELECT MIN(historical_card.issued_at)
            FROM shop_membership_cards AS historical_card
            INNER JOIN shop_customer_memberships AS historical_membership
              ON historical_membership.id = historical_card.membership_id
            INNER JOIN customer_profiles AS historical_customer
              ON historical_customer.id = historical_membership.customer_profile_id
            WHERE historical_customer.user_id = customer.user_id
              AND historical_card.issuance_source = 'offline_paid')))
      OR (authorized.kind = 'excludedMembershipCardIds' AND EXISTS (
        SELECT 1 FROM shop_membership_cards AS card
        INNER JOIN shop_customer_memberships AS membership ON membership.id = card.membership_id
          AND membership.status = 'active' AND membership.deleted_at IS NULL
        INNER JOIN customer_profiles AS customer ON customer.id = membership.customer_profile_id
          AND customer.deleted_at IS NULL
        INNER JOIN users AS member_user ON member_user.id = customer.user_id
          AND member_user.is_active = TRUE AND member_user.is_test_account = FALSE
          AND member_user.deleted_at IS NULL
        INNER JOIN shops AS shop ON shop.id = membership.shop_id AND shop.deleted_at IS NULL
        WHERE authorized.identifier_kind = 'public_id'
          AND authorized.provenance_field = 'issuance_reference'
          AND BINARY TRIM(card.public_id) = BINARY authorized.witness_id
          AND BINARY TRIM(card.issuance_reference) = BINARY authorized.provenance_value
          AND card.issued_at >= period.from_inclusive AND card.issued_at < period.to_exclusive
          AND card.status = 'active' AND card.deleted_at IS NULL
          AND TRIM(shop.city) = ${sqlLiteral(fixture.city)}
          AND (card.issuance_source IS NULL OR card.issuance_source <> 'offline_paid')
          AND NOT EXISTS (
            SELECT 1
            FROM shop_membership_cards AS historical_card
            INNER JOIN shop_customer_memberships AS historical_membership
              ON historical_membership.id = historical_card.membership_id
            INNER JOIN customer_profiles AS historical_customer
              ON historical_customer.id = historical_membership.customer_profile_id
            WHERE historical_customer.user_id = customer.user_id
              AND historical_card.issuance_source = 'offline_paid'
              AND historical_card.issued_at < card.issued_at)))
      OR (authorized.kind = 'technicianIdentityIds' AND EXISTS (
        SELECT 1 FROM user_identities AS identity_row
        INNER JOIN users AS technician_user ON technician_user.id = identity_row.user_id
          AND technician_user.is_active = TRUE AND technician_user.is_test_account = FALSE
          AND technician_user.deleted_at IS NULL
        INNER JOIN technician_profiles AS technician ON technician.user_id = identity_row.user_id
          AND technician.deleted_at IS NULL
        INNER JOIN shops AS shop ON shop.id = COALESCE((
          SELECT MIN(affiliation.shop_id) FROM technician_shop_affiliations AS affiliation
          WHERE affiliation.technician_profile_id = technician.id
            AND affiliation.relationship_type IN ('exclusive', 'partner')
            AND affiliation.work_status = 'active' AND affiliation.deleted_at IS NULL
            AND affiliation.starts_at <= identity_row.created_at
            AND (affiliation.ends_at IS NULL OR affiliation.ends_at >= identity_row.created_at)
        ), technician.shop_id) AND shop.deleted_at IS NULL
        WHERE authorized.identifier_kind = 'numeric_id'
          AND authorized.provenance_field = 'user.email'
          AND CAST(identity_row.id AS CHAR) = authorized.witness_id
          AND BINARY TRIM(technician_user.email) = BINARY authorized.provenance_value
          AND identity_row.type = 'technician' AND identity_row.is_active = TRUE
          AND identity_row.deleted_at IS NULL
          AND identity_row.created_at >= period.from_inclusive AND identity_row.created_at < period.to_exclusive
          AND identity_row.created_at = (SELECT MIN(history.created_at)
            FROM user_identities AS history
            WHERE history.user_id = identity_row.user_id AND history.type = 'technician')
          AND TRIM(shop.city) = ${sqlLiteral(fixture.city)}))
      OR (authorized.kind = 'compensationProfileIds' AND EXISTS (
        SELECT 1 FROM technician_compensation_profiles AS profile
        INNER JOIN technician_profiles AS technician ON technician.id = profile.technician_profile_id
          AND technician.deleted_at IS NULL
        INNER JOIN users AS technician_user ON technician_user.id = technician.user_id
          AND technician_user.deleted_at IS NULL
        INNER JOIN shops AS shop ON shop.id = profile.shop_id AND shop.deleted_at IS NULL
        WHERE authorized.identifier_kind = 'numeric_id'
          AND authorized.provenance_field = 'technician.user.email'
          AND CAST(profile.id AS CHAR) = authorized.witness_id
          AND BINARY TRIM(technician_user.email) = BINARY authorized.provenance_value
          AND profile.status IN ('active', 'archived') AND profile.deleted_at IS NULL
          AND profile.wage_mode IN ('fixed_per_order', 'commission', 'base_plus_commission', 'hourly')
          AND profile.base_salary_jpy >= 0
          AND (profile.effective_from IS NULL OR profile.effective_from < period.to_exclusive)
          AND (profile.effective_to IS NULL OR profile.effective_to >= period.from_inclusive)
          AND (profile.effective_from IS NULL OR profile.effective_to IS NULL
            OR profile.effective_from <= profile.effective_to)
          AND TRIM(shop.city) = ${sqlLiteral(fixture.city)}))
      OR (authorized.kind = 'ndpIncomeFinancialIds' AND EXISTS (
        SELECT 1 FROM order_financials AS financial
        INNER JOIN booking_orders AS booking ON booking.id = financial.booking_order_id
        INNER JOIN shops AS shop ON shop.id = booking.shop_id AND shop.deleted_at IS NULL
        INNER JOIN order_checkouts AS checkout ON checkout.booking_order_id = booking.id
        WHERE authorized.identifier_kind = 'numeric_id'
          AND authorized.provenance_field = 'booking_order.service_snapshot_json.fixtureMarker'
          AND CAST(financial.id AS CHAR) = authorized.witness_id
          AND BINARY JSON_UNQUOTE(JSON_EXTRACT(booking.service_snapshot_json, '$.fixtureMarker'))
            = BINARY authorized.provenance_value
          AND financial.ndp_currency = 'NDP' AND financial.settlement_status = 'settled'
          AND financial.deleted_at IS NULL AND financial.b_platform_fee_actual_ndp >= 0
          AND financial.c_request_fee_actual_ndp >= 0 AND financial.user_reward_ndp >= 0
          AND ((booking.payment_confirmed_at >= period.from_inclusive
              AND booking.payment_confirmed_at < period.to_exclusive)
            OR (financial.user_reward_granted_at >= period.from_inclusive
              AND financial.user_reward_granted_at < period.to_exclusive))
          AND TRIM(shop.city) = ${sqlLiteral(fixture.city)}
          AND ${validCompletedCheckoutPredicate}
          AND ${validCheckoutPaymentEvidencePredicate}))
      OR (authorized.kind = 'affiliateRewardIds' AND EXISTS (
        SELECT 1 FROM affiliate_rewards AS reward
        INNER JOIN affiliate_attributions AS attribution ON attribution.id = reward.attribution_id
          AND attribution.booking_order_id = reward.booking_order_id
          AND attribution.task_id = reward.task_id AND attribution.claim_id = reward.claim_id
          AND attribution.status = 'settled' AND attribution.settled_at = reward.settled_at
          AND attribution.deleted_at IS NULL
        INNER JOIN booking_orders AS booking ON booking.id = reward.booking_order_id
          AND booking.status = 'completed' AND booking.payment_status = 'confirmed'
          AND booking.payment_confirmed_by_id IS NOT NULL
          AND booking.payment_refunded_at IS NULL AND booking.payment_refunded_by_id IS NULL
          AND booking.payment_refund_reference IS NULL AND booking.payment_refund_reason IS NULL
          AND booking.deleted_at IS NULL
        INNER JOIN shops AS shop ON shop.id = attribution.shop_id AND shop.deleted_at IS NULL
        INNER JOIN affiliate_reward_transactions AS reward_transaction
          ON reward_transaction.reward_id = reward.id AND reward_transaction.kind = 'settlement'
          AND reward_transaction.amount_ndp = reward.reward_ndp + reward.platform_fee_ndp
          AND reward_transaction.deleted_at IS NULL
        INNER JOIN ledger_transactions AS ledger ON ledger.id = reward_transaction.ledger_transaction_id
          AND ledger.type = 'affiliate_reward_settlement' AND ledger.status = 'applied'
          AND ledger.currency = 'NDP' AND ledger.reference_type = 'affiliate_reward'
          AND ledger.reference_id = reward.id
          AND ledger.amount = reward.reward_ndp + reward.platform_fee_ndp
          AND ledger.deleted_at IS NULL
        WHERE authorized.identifier_kind = 'numeric_id'
          AND authorized.provenance_field = 'ledger.metadata.fixtureMarker'
          AND CAST(reward.id AS CHAR) = authorized.witness_id
          AND BINARY JSON_UNQUOTE(JSON_EXTRACT(ledger.metadata, '$.fixtureMarker'))
            = BINARY authorized.provenance_value
          AND reward.status = 'settled' AND reward.deleted_at IS NULL
          AND reward.settled_at >= period.from_inclusive AND reward.settled_at < period.to_exclusive
          AND reward.reversal_required_ndp = 0 AND reward.reversed_ndp = 0
          AND reward.outstanding_recovery_ndp = 0 AND reward.reversed_at IS NULL
          AND reward.reversal_reason IS NULL
          AND TRIM(shop.city) = ${sqlLiteral(fixture.city)}
        GROUP BY reward.id HAVING COUNT(reward_transaction.id) = 1))`;
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
