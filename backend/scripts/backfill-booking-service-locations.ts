import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";

type Environment = Record<string, string | undefined>;

export type BookingLocationSource = "SHOP_LOCATION" | "CUSTOMER_SERVICE_LOCATION";
export type BookingLocationResolutionStatus = "VERIFIED" | "UNRESOLVED";

export interface BookingLocationCreateInput {
  bookingOrderId: number;
  countryCode: string;
  admin1RegionCode: string | null;
  admin1Name: string | null;
  admin2RegionCode: string | null;
  admin2Name: string | null;
  source: BookingLocationSource;
  resolutionStatus: BookingLocationResolutionStatus;
  datasetVersion: string;
  resolvedAt: Date | null;
}

export interface PersistedBookingLocation extends BookingLocationCreateInput {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface BookingOrderSnapshot {
  id: number;
  fulfillmentMode: string;
  serviceLocation: { bookingOrderId: number } | null;
  shop: {
    serviceLocation: {
      countryCode: string;
      datasetVersion: string;
      verifiedAt: Date;
      deletedAt: Date | null;
      admin1Region: {
        id: number;
        level: string;
        officialCode: string;
        parentId: number | null;
        deletedAt: Date | null;
        locales: Array<{ name: string }>;
      };
      admin2Region: {
        id: number;
        level: string;
        officialCode: string;
        parentId: number | null;
        deletedAt: Date | null;
        locales: Array<{ name: string }>;
      };
    } | null;
  };
}

interface BackfillAuditRecord {
  id: number;
  action: string;
  targetType: string;
  metadata: unknown;
  deletedAt: Date | null;
}

interface AuditLookup {
  where: {
    action: string;
    targetType: string;
    metadata?: { path: string; equals: string };
    deletedAt?: null;
  };
}

export interface BookingLocationBackfillClient {
  bookingOrder: {
    findMany: (args: unknown) => Promise<BookingOrderSnapshot[]>;
  };
  bookingServiceLocation: {
    findMany: (args?: {
      where?: { bookingOrderId?: { in?: number[] } };
      orderBy?: { bookingOrderId: "asc" };
    }) => Promise<PersistedBookingLocation[]>;
    createMany: (args: {
      data: BookingLocationCreateInput[];
      skipDuplicates: boolean;
    }) => Promise<{ count: number }>;
    updateMany: (args: {
      where: { bookingOrderId: number; deletedAt: null; updatedAt: Date };
      data: { deletedAt: Date };
    }) => Promise<{ count: number }>;
    count?: () => Promise<number>;
  };
  auditLog: {
    findFirst: (args: AuditLookup) => Promise<BackfillAuditRecord | null>;
    create: (args: {
      data: { action: string; targetType: string; metadata: Record<string, unknown> };
    }) => Promise<BackfillAuditRecord>;
  };
  $transaction: <T>(
    callback: (transaction: BookingLocationBackfillClient) => Promise<T>
  ) => Promise<T>;
}

export interface BookingLocationBackfillSummary {
  storeVerified: number;
  homeVerified: number;
  unresolved: number;
  alreadyPresent: number;
}

export type BookingLocationBackfillSkipReason =
  | "SHOP_LOCATION_NOT_VERIFIED"
  | "UNSUPPORTED_FULFILLMENT_MODE";

export interface BookingLocationBackfillPlan {
  summary: BookingLocationBackfillSummary;
  rows: BookingLocationCreateInput[];
  skipped: Array<{ bookingOrderId: number; reason: BookingLocationBackfillSkipReason }>;
}

export interface BookingLocationBackfillManifestRow {
  bookingOrderId: number;
  checksum: string;
}

export interface BookingLocationBackfillManifest {
  version: 1;
  runId: string;
  rows: BookingLocationBackfillManifestRow[];
}

export interface BookingLocationBackfillApplyResult {
  insertedCount: number;
  manifest: BookingLocationBackfillManifest;
  auditId: number;
}

export interface BookingLocationBackfillRestoreResult {
  restoredBookingOrderIds: number[];
  auditId: number;
}

export interface BookingLocationBackfillFileSystem {
  resolve: (value: string) => string;
  existsSync: (value: string) => boolean;
  readFileSync: (value: string) => string;
}

export interface BookingLocationBackfillEnvironment {
  envFilePath: string;
  databaseHost: string;
  databaseName: string;
  values: Record<string, string>;
}

export type BookingLocationBackfillArguments =
  | { mode: "preview" }
  | { mode: "apply"; confirmCount?: number }
  | { mode: "restore"; restoreRunId: string };

export type BookingLocationBackfillRunResult =
  | {
      mode: "preview";
      summary: BookingLocationBackfillSummary;
      skipped: BookingLocationBackfillPlan["skipped"];
      writeCount: 0;
      requiredConfirmCount: number;
    }
  | {
      mode: "apply";
      summary: BookingLocationBackfillSummary;
      skipped: BookingLocationBackfillPlan["skipped"];
      writeCount: number;
      requiredConfirmCount: number;
      runId: string;
      manifest: BookingLocationBackfillManifest;
      auditId: number;
    }
  | {
      mode: "restore";
      writeCount: number;
      restoreRunId: string;
      restoredBookingOrderIds: number[];
      auditId: number;
    };

const APPLY_ACTION = "booking_service_location.backfill.apply";
const RESTORE_ACTION = "booking_service_location.backfill.restore";
const AUDIT_TARGET = "booking_service_location_backfill_run";
const UNRESOLVED_DATASET_VERSION = "historical-unresolved-v1";
const MAX_BATCH_SIZE = 500;
const forbiddenTarget = /(?:prod|production|staging|live)/iu;
const localDatabasePurpose = /(?:test|dev|local)/iu;
const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const runIdPattern = /^(?=.{3,80}$)[A-Za-z0-9][A-Za-z0-9._:-]*$/u;

const defaultFileSystem: BookingLocationBackfillFileSystem = {
  resolve,
  existsSync,
  readFileSync: (value) => readFileSync(value, "utf8")
};

const chunks = <T>(items: readonly T[], size = MAX_BATCH_SIZE): T[][] => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
};

const nonEmpty = (value: string | null | undefined): value is string =>
  typeof value === "string" && value.trim().length > 0;

const verifiedShopRow = (
  orderSnapshot: BookingOrderSnapshot
): BookingLocationCreateInput | null => {
  const assignment = orderSnapshot.shop.serviceLocation;
  if (!assignment) return null;
  const admin1 = assignment.admin1Region;
  const admin2 = assignment.admin2Region;
  const admin1Name = admin1.locales[0]?.name;
  const admin2Name = admin2.locales[0]?.name;
  const assignmentVerifiedAt = new Date(assignment.verifiedAt);
  if (
    assignment.deletedAt !== null ||
    assignment.countryCode !== "JP" ||
    Number.isNaN(assignmentVerifiedAt.getTime()) ||
    !nonEmpty(assignment.datasetVersion) ||
    admin1.deletedAt !== null ||
    admin2.deletedAt !== null ||
    admin1.level !== "ADMIN1" ||
    admin2.level !== "ADMIN2" ||
    admin2.parentId !== admin1.id ||
    !nonEmpty(admin1.officialCode) ||
    !nonEmpty(admin2.officialCode) ||
    !nonEmpty(admin1Name) ||
    !nonEmpty(admin2Name)
  ) {
    return null;
  }
  return {
    bookingOrderId: orderSnapshot.id,
    countryCode: "JP",
    admin1RegionCode: admin1.officialCode.trim(),
    admin1Name: admin1Name.trim(),
    admin2RegionCode: admin2.officialCode.trim(),
    admin2Name: admin2Name.trim(),
    source: "SHOP_LOCATION",
    resolutionStatus: "VERIFIED",
    datasetVersion: assignment.datasetVersion.trim(),
    resolvedAt: assignmentVerifiedAt
  };
};

export async function buildBookingLocationBackfillPlan(
  client: BookingLocationBackfillClient
): Promise<BookingLocationBackfillPlan> {
  const orders = await client.bookingOrder.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      fulfillmentMode: true,
      serviceLocation: { select: { bookingOrderId: true } },
      shop: {
        select: {
          serviceLocation: {
            select: {
              countryCode: true,
              datasetVersion: true,
              verifiedAt: true,
              deletedAt: true,
              admin1Region: {
                select: {
                  id: true,
                  level: true,
                  officialCode: true,
                  parentId: true,
                  deletedAt: true,
                  locales: {
                    where: { locale: "JA", deletedAt: null },
                    select: { name: true },
                    take: 1
                  }
                }
              },
              admin2Region: {
                select: {
                  id: true,
                  level: true,
                  officialCode: true,
                  parentId: true,
                  deletedAt: true,
                  locales: {
                    where: { locale: "JA", deletedAt: null },
                    select: { name: true },
                    take: 1
                  }
                }
              }
            }
          }
        }
      }
    },
    orderBy: { id: "asc" }
  });
  const summary: BookingLocationBackfillSummary = {
    storeVerified: 0,
    homeVerified: 0,
    unresolved: 0,
    alreadyPresent: 0
  };
  const rows: BookingLocationCreateInput[] = [];
  const skipped: BookingLocationBackfillPlan["skipped"] = [];

  for (const current of orders) {
    if (current.serviceLocation !== null) {
      summary.alreadyPresent += 1;
      continue;
    }
    const mode = current.fulfillmentMode.trim().toLowerCase();
    if (mode === "home") {
      rows.push({
        bookingOrderId: current.id,
        countryCode: "JP",
        admin1RegionCode: null,
        admin1Name: null,
        admin2RegionCode: null,
        admin2Name: null,
        source: "CUSTOMER_SERVICE_LOCATION",
        resolutionStatus: "UNRESOLVED",
        datasetVersion: UNRESOLVED_DATASET_VERSION,
        resolvedAt: null
      });
      summary.unresolved += 1;
      continue;
    }
    if (mode === "store") {
      const verified = verifiedShopRow(current);
      if (verified) {
        rows.push(verified);
        summary.storeVerified += 1;
      } else {
        skipped.push({
          bookingOrderId: current.id,
          reason: "SHOP_LOCATION_NOT_VERIFIED"
        });
      }
      continue;
    }
    skipped.push({
      bookingOrderId: current.id,
      reason: "UNSUPPORTED_FULFILLMENT_MODE"
    });
  }
  return { summary, rows, skipped };
}

const requireValidRunId = (runId: string): string => {
  const normalized = runId.trim();
  if (!runIdPattern.test(normalized)) throw new Error("Backfill run ID is invalid");
  return normalized;
};

const validatePlan = (plan: BookingLocationBackfillPlan): void => {
  const bookingOrderIds = plan.rows.map((row) => row.bookingOrderId);
  if (
    bookingOrderIds.some((id) => !Number.isSafeInteger(id) || id < 1) ||
    new Set(bookingOrderIds).size !== bookingOrderIds.length
  ) {
    throw new Error("Backfill plan contains invalid or duplicate booking order IDs");
  }
  const derived = {
    storeVerified: plan.rows.filter(
      (row) => row.source === "SHOP_LOCATION" && row.resolutionStatus === "VERIFIED"
    ).length,
    homeVerified: plan.rows.filter(
      (row) => row.source === "CUSTOMER_SERVICE_LOCATION" && row.resolutionStatus === "VERIFIED"
    ).length,
    unresolved: plan.rows.filter((row) => row.resolutionStatus === "UNRESOLVED").length,
    alreadyPresent: plan.summary.alreadyPresent
  };
  if (JSON.stringify(derived) !== JSON.stringify(plan.summary)) {
    throw new Error("Backfill plan summary does not match its rows");
  }
};

const findLocations = async (
  client: BookingLocationBackfillClient,
  bookingOrderIds: readonly number[]
): Promise<PersistedBookingLocation[]> => {
  const result: PersistedBookingLocation[] = [];
  for (const batch of chunks(bookingOrderIds)) {
    if (batch.length === 0) continue;
    result.push(
      ...(await client.bookingServiceLocation.findMany({
        where: { bookingOrderId: { in: batch } },
        orderBy: { bookingOrderId: "asc" }
      }))
    );
  }
  return result.sort((left, right) => left.bookingOrderId - right.bookingOrderId);
};

const dateValue = (value: Date | null): string | null =>
  value === null ? null : value.toISOString();

export const checksumBookingLocation = (row: PersistedBookingLocation): string => {
  const canonical = JSON.stringify({
    id: row.id,
    bookingOrderId: row.bookingOrderId,
    countryCode: row.countryCode,
    admin1RegionCode: row.admin1RegionCode,
    admin1Name: row.admin1Name,
    admin2RegionCode: row.admin2RegionCode,
    admin2Name: row.admin2Name,
    source: row.source,
    resolutionStatus: row.resolutionStatus,
    datasetVersion: row.datasetVersion,
    resolvedAt: dateValue(row.resolvedAt),
    createdAt: dateValue(row.createdAt),
    updatedAt: dateValue(row.updatedAt)
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
};

const auditLookup = (action: string, runId: string): AuditLookup => ({
  where: {
    action,
    targetType: AUDIT_TARGET,
    metadata: { path: "$.runId", equals: runId },
    deletedAt: null
  }
});

export async function applyBookingLocationBackfill(
  client: BookingLocationBackfillClient,
  plan: BookingLocationBackfillPlan,
  runIdInput: string
): Promise<BookingLocationBackfillApplyResult> {
  validatePlan(plan);
  const runId = requireValidRunId(runIdInput);
  return client.$transaction(async (transaction) => {
    if (await transaction.auditLog.findFirst(auditLookup(APPLY_ACTION, runId))) {
      throw new Error("Backfill run ID has already been applied");
    }
    const bookingOrderIds = plan.rows.map((row) => row.bookingOrderId);
    const before = await findLocations(transaction, bookingOrderIds);
    const beforeIds = new Set(before.map((row) => row.bookingOrderId));
    let createdCount = 0;
    for (const batch of chunks(plan.rows)) {
      const created = await transaction.bookingServiceLocation.createMany({
        data: batch,
        skipDuplicates: true
      });
      createdCount += created.count;
    }
    const after = await findLocations(transaction, bookingOrderIds);
    const inserted = after.filter((row) => !beforeIds.has(row.bookingOrderId));
    if (inserted.length !== createdCount) {
      throw new Error("Backfill inserted-row reconciliation failed");
    }
    const manifest: BookingLocationBackfillManifest = {
      version: 1,
      runId,
      rows: inserted.map((row) => ({
        bookingOrderId: row.bookingOrderId,
        checksum: checksumBookingLocation(row)
      }))
    };
    const audit = await transaction.auditLog.create({
      data: {
        action: APPLY_ACTION,
        targetType: AUDIT_TARGET,
        metadata: {
          version: manifest.version,
          runId: manifest.runId,
          insertedCount: manifest.rows.length,
          rows: manifest.rows
        }
      }
    });
    return { insertedCount: manifest.rows.length, manifest, auditId: audit.id };
  });
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readManifest = (
  audit: BackfillAuditRecord,
  expectedRunId: string
): BookingLocationBackfillManifest => {
  if (!isRecord(audit.metadata)) throw new Error("Backfill manifest is invalid");
  const candidateRows = audit.metadata.rows;
  if (
    audit.metadata.version !== 1 ||
    audit.metadata.runId !== expectedRunId ||
    !Array.isArray(candidateRows)
  ) {
    throw new Error("Backfill manifest is invalid");
  }
  const rows: BookingLocationBackfillManifestRow[] = candidateRows.map((candidate) => {
    if (
      !isRecord(candidate) ||
      !Number.isSafeInteger(candidate.bookingOrderId) ||
      Number(candidate.bookingOrderId) < 1 ||
      typeof candidate.checksum !== "string" ||
      !/^[a-f0-9]{64}$/u.test(candidate.checksum)
    ) {
      throw new Error("Backfill manifest is invalid");
    }
    return {
      bookingOrderId: Number(candidate.bookingOrderId),
      checksum: candidate.checksum
    };
  });
  if (new Set(rows.map((row) => row.bookingOrderId)).size !== rows.length) {
    throw new Error("Backfill manifest is invalid");
  }
  return { version: 1, runId: expectedRunId, rows };
};

export async function restoreBookingLocationBackfill(
  client: BookingLocationBackfillClient,
  runIdInput: string
): Promise<BookingLocationBackfillRestoreResult> {
  const runId = requireValidRunId(runIdInput);
  return client.$transaction(async (transaction) => {
    const audit = await transaction.auditLog.findFirst(auditLookup(APPLY_ACTION, runId));
    if (!audit) throw new Error("Backfill manifest was not found");
    const manifest = readManifest(audit, runId);
    const bookingOrderIds = manifest.rows.map((row) => row.bookingOrderId);
    const locations = await findLocations(transaction, bookingOrderIds);
    const locationsByOrderId = new Map(locations.map((row) => [row.bookingOrderId, row]));
    for (const manifestRow of manifest.rows) {
      const current = locationsByOrderId.get(manifestRow.bookingOrderId);
      if (
        !current ||
        current.deletedAt !== null ||
        checksumBookingLocation(current) !== manifestRow.checksum
      ) {
        throw new Error("Backfill restore refused checksum drift");
      }
    }
    const deletedAt = new Date();
    for (const manifestRow of manifest.rows) {
      const current = locationsByOrderId.get(manifestRow.bookingOrderId)!;
      const restored = await transaction.bookingServiceLocation.updateMany({
        where: {
          bookingOrderId: current.bookingOrderId,
          deletedAt: null,
          updatedAt: current.updatedAt
        },
        data: { deletedAt }
      });
      if (restored.count !== 1) {
        throw new Error("Backfill restore refused concurrent checksum drift");
      }
    }
    const restoredBookingOrderIds = [...bookingOrderIds].sort((left, right) => left - right);
    const restoreAudit = await transaction.auditLog.create({
      data: {
        action: RESTORE_ACTION,
        targetType: AUDIT_TARGET,
        metadata: {
          version: 1,
          runId,
          manifestAuditId: audit.id,
          restoredBookingOrderIds
        }
      }
    });
    return { restoredBookingOrderIds, auditId: restoreAudit.id };
  });
}

export function loadBookingLocationBackfillEnvironment(
  runtimeEnvironment: Environment,
  fileSystem: BookingLocationBackfillFileSystem = defaultFileSystem
): BookingLocationBackfillEnvironment {
  const requestedPath = runtimeEnvironment.FORMAL_BACKEND_ENV_FILE?.trim();
  if (!requestedPath) throw new Error("FORMAL_BACKEND_ENV_FILE is required");
  const envFilePath = fileSystem.resolve(requestedPath);
  if (!fileSystem.existsSync(envFilePath)) {
    throw new Error("FORMAL_BACKEND_ENV_FILE does not exist");
  }
  const values = parse(fileSystem.readFileSync(envFilePath));
  for (const key of ["NODE_ENV", "DEPLOY_ENV", "APP_ENV", "ENVIRONMENT"] as const) {
    if (forbiddenTarget.test(values[key]?.trim() ?? "")) {
      throw new Error("Booking location backfill refuses a protected environment");
    }
  }
  const databaseUrl = values.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required in FORMAL_BACKEND_ENV_FILE");
  let target: URL;
  try {
    target = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid MySQL URL");
  }
  if (target.protocol !== "mysql:") throw new Error("DATABASE_URL must use MySQL");
  const databaseHost = target.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  if (forbiddenTarget.test(databaseHost) || !loopbackHosts.has(databaseHost)) {
    throw new Error("Booking location backfill refuses this database host");
  }
  const databaseName = decodeURIComponent(target.pathname.replace(/^\/+/, "")).trim();
  if (
    databaseName.length === 0 ||
    forbiddenTarget.test(databaseName) ||
    !localDatabasePurpose.test(databaseName)
  ) {
    throw new Error("Booking location backfill refuses this database name");
  }
  return { envFilePath, databaseHost, databaseName, values };
}

export function parseBookingLocationBackfillArguments(
  args: readonly string[]
): BookingLocationBackfillArguments {
  const known = args.filter(
    (argument) =>
      argument === "--apply" ||
      argument.startsWith("--confirm-count=") ||
      argument.startsWith("--restore-run=")
  );
  if (known.length !== args.length) throw new Error("Unknown booking location backfill argument");
  const applyCount = args.filter((argument) => argument === "--apply").length;
  const confirmValues = args.filter((argument) => argument.startsWith("--confirm-count="));
  const restoreValues = args.filter((argument) => argument.startsWith("--restore-run="));
  if (applyCount > 1 || confirmValues.length > 1 || restoreValues.length > 1) {
    throw new Error("Duplicate booking location backfill argument");
  }
  if (restoreValues.length === 1) {
    if (applyCount > 0 || confirmValues.length > 0) {
      throw new Error("--restore-run cannot be combined with apply arguments");
    }
    return {
      mode: "restore",
      restoreRunId: requireValidRunId(restoreValues[0]!.slice("--restore-run=".length))
    };
  }
  if (confirmValues.length === 1 && applyCount === 0) {
    throw new Error("--confirm-count requires --apply");
  }
  if (applyCount === 0) return { mode: "preview" };
  if (confirmValues.length === 0) return { mode: "apply" };
  const rawCount = confirmValues[0]!.slice("--confirm-count=".length);
  if (!/^\d+$/u.test(rawCount)) throw new Error("--confirm-count must be a non-negative integer");
  const confirmCount = Number(rawCount);
  if (!Number.isSafeInteger(confirmCount)) {
    throw new Error("--confirm-count must be a non-negative integer");
  }
  return { mode: "apply", confirmCount };
}

const generatedRunId = (): string => {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/gu, "")
    .replace(/\.\d{3}Z$/u, "Z");
  return `${timestamp}-${randomBytes(3).toString("hex")}`;
};

export async function runBookingLocationBackfill(
  client: BookingLocationBackfillClient,
  args: readonly string[],
  runIdInput?: string,
  emitPreview?: (preview: BookingLocationBackfillRunResult) => void
): Promise<BookingLocationBackfillRunResult> {
  const options = parseBookingLocationBackfillArguments(args);
  if (options.mode === "restore") {
    const restored = await restoreBookingLocationBackfill(client, options.restoreRunId);
    return {
      mode: "restore",
      writeCount: restored.restoredBookingOrderIds.length,
      restoreRunId: options.restoreRunId,
      ...restored
    };
  }
  const plan = await buildBookingLocationBackfillPlan(client);
  const requiredConfirmCount = plan.rows.length;
  const preview: BookingLocationBackfillRunResult = {
    mode: "preview",
    summary: plan.summary,
    skipped: plan.skipped,
    writeCount: 0,
    requiredConfirmCount
  };
  emitPreview?.(preview);
  if (options.mode === "preview") return preview;
  if (options.confirmCount !== requiredConfirmCount) {
    throw new Error(`--confirm-count=${requiredConfirmCount} is required`);
  }
  const runId = requireValidRunId(runIdInput ?? generatedRunId());
  const applied = await applyBookingLocationBackfill(client, plan, runId);
  return {
    mode: "apply",
    summary: plan.summary,
    skipped: plan.skipped,
    writeCount: applied.insertedCount,
    requiredConfirmCount,
    runId,
    manifest: applied.manifest,
    auditId: applied.auditId
  };
}

const writeJson = (value: unknown): void => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

const main = async (): Promise<void> => {
  const authority = loadBookingLocationBackfillEnvironment(process.env);
  const args = process.argv.slice(2);
  const options = parseBookingLocationBackfillArguments(args);
  for (const [key, value] of Object.entries(authority.values)) process.env[key] = value;
  process.env.ENV_FILE = authority.envFilePath;
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");
  try {
    const result = await runBookingLocationBackfill(
      prisma as unknown as BookingLocationBackfillClient,
      args,
      undefined,
      options.mode === "apply" ? writeJson : undefined
    );
    writeJson(result);
  } finally {
    await disconnectPrisma();
  }
};

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Booking location backfill failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
