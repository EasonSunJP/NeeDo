import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parse } from "dotenv";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { Response } from "express";
import type { DashboardWindow } from "../src/domain/dashboard-period";
import type { LiveDashboardSnapshotFacts } from "../src/domain/live-dashboard";
import type { AuthRequestContext, AuthenticatedAccessContext } from "../src/services/auth.service";
import type { LiveDashboardSnapshotResponse } from "../src/services/live-dashboard.service";

type Environment = Record<string, string | undefined>;
type RedisClient = Awaited<ReturnType<typeof loadRuntime>>["createRedisClient"] extends (
  ...args: never[]
) => infer T
  ? T
  : never;

interface RedisCleanupClient {
  readonly isOpen: boolean;
  connect(): Promise<unknown>;
  sendCommand(command: string[]): Promise<unknown>;
  xDel(key: string, ids: string[]): Promise<number>;
  del(keys: string[]): Promise<number>;
}

interface CheckerAuthority {
  envFilePath: string;
  databaseHost: string;
  databaseName: string;
  redisHost: string;
  redisDatabase: string;
  values: Record<string, string>;
}

interface SectionEvidence {
  schema: Record<string, unknown>;
  bookingLocation: Record<string, unknown>;
  regionalAggregates: Record<string, unknown>;
  financeSeparation: Record<string, unknown>;
  cache: Record<string, unknown>;
  sse: Record<string, unknown>;
}

const DATASET_VERSION = "N03-20260101";
const MIGRATION_NAME = "20260906120000_live_dashboard_administrative_regions";
const CATALOG_SOURCE_CHECKSUM = "3095bfbbafa89d791e19bed3488cbe31d048d227b7fea9e185aa208444337751";
const CATALOG_OUTPUT_CHECKSUM = "7abf5ac67b1878ec3929d0faca307b3e0c14aac288ba5df5473d6557fb64625b";
const EVALUATED_AT = new Date("2026-09-06T03:00:00.000Z");
const WINDOW_START = new Date("2026-09-05T15:00:00.000Z");
const RESTRICTED_ENVIRONMENT = /^(?:prod|production|staging|live)$/iu;
const PRODUCTION_LOOKING = /(?:prod(?:uction)?|staging|live)/iu;
const LOCAL_PURPOSE = /(?:test|dev|local)/iu;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const REQUIRED_TABLES = [
  "administrative_regions",
  "administrative_region_locales",
  "shop_service_locations",
  "booking_service_locations"
] as const;
const REQUIRED_COLUMNS = [
  "booking_service_locations.country_code",
  "booking_service_locations.admin1_region_code",
  "booking_service_locations.admin2_region_code",
  "booking_service_locations.resolution_status",
  "booking_service_locations.dataset_version"
] as const;
const REQUIRED_INDEXES = [
  "administrative_regions.administrative_regions_hierarchy_idx",
  "shop_service_locations.shop_service_locations_scope_idx",
  "booking_service_locations.booking_service_locations_scope_idx"
] as const;

const assertCondition: (condition: unknown, message: string) => asserts condition = (
  condition,
  message
) => {
  if (!condition) throw new Error(message);
};

const jsonSection = (value: Record<string, unknown>): void => {
  process.stdout.write(`${JSON.stringify(value)}\n`);
};

const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

const numeric = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  assertCondition(Number.isSafeInteger(parsed), "Formal checker received an unsafe numeric value");
  return parsed;
};

const compareStreamIds = (left: string, right: string): number => {
  const [leftMs = "0", leftSequence = "0"] = left.split("-");
  const [rightMs = "0", rightSequence = "0"] = right.split("-");
  const timestamp = BigInt(leftMs) - BigInt(rightMs);
  if (timestamp !== 0n) return timestamp > 0n ? 1 : -1;
  const sequence = BigInt(leftSequence) - BigInt(rightSequence);
  return sequence === 0n ? 0 : sequence > 0n ? 1 : -1;
};

const validateTargetUrl = (
  raw: string,
  protocol: "mysql:" | "redis:" | "rediss:",
  label: string
): URL => {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (
    protocol === "mysql:"
      ? parsed.protocol !== protocol
      : !["redis:", "rediss:"].includes(parsed.protocol)
  ) {
    throw new Error(`${label} uses an unsupported protocol`);
  }
  const host = parsed.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  if (!LOOPBACK_HOSTS.has(host)) throw new Error(`${label} must use a loopback host`);
  return parsed;
};

export const loadLiveDashboardCheckerAuthority = (
  runtimeEnvironment: Environment
): CheckerAuthority => {
  const requested = runtimeEnvironment.FORMAL_BACKEND_ENV_FILE?.trim();
  if (!requested) throw new Error("FORMAL_BACKEND_ENV_FILE is required");
  if (runtimeEnvironment.LIVE_DASHBOARD_CHECK_ROLLBACK !== "true") {
    throw new Error("LIVE_DASHBOARD_CHECK_ROLLBACK=true is required");
  }
  const resolved = resolve(requested);
  if (!existsSync(resolved)) throw new Error("FORMAL_BACKEND_ENV_FILE does not exist");
  if (lstatSync(resolved).isSymbolicLink() || !statSync(resolved).isFile()) {
    throw new Error("FORMAL_BACKEND_ENV_FILE must be a regular non-symlink file");
  }
  const envFilePath = realpathSync(resolved);
  if (PRODUCTION_LOOKING.test(basename(envFilePath))) {
    throw new Error("Live dashboard checker refuses a production, staging, or live env file");
  }
  const parsed = parse(readFileSync(envFilePath, "utf8"));
  for (const key of ["NODE_ENV", "DEPLOY_ENV"] as const) {
    const fileValue = parsed[key]?.trim() ?? "";
    const runtimeValue = runtimeEnvironment[key]?.trim() ?? "";
    if (!fileValue) throw new Error(`${key} is required in FORMAL_BACKEND_ENV_FILE`);
    if (RESTRICTED_ENVIRONMENT.test(fileValue) || RESTRICTED_ENVIRONMENT.test(runtimeValue)) {
      throw new Error("Live dashboard checker refuses a production, staging, or live runtime");
    }
    if (!/^(?:development|dev|test|local)$/iu.test(fileValue)) {
      throw new Error(`${key} must explicitly identify a development, test, or local runtime`);
    }
  }
  for (const key of ["DATABASE_URL", "REDIS_URL"] as const) {
    if (!parsed[key]?.trim()) throw new Error(`${key} is required in FORMAL_BACKEND_ENV_FILE`);
    const override = runtimeEnvironment[key]?.trim();
    if (override && override !== parsed[key]) {
      throw new Error(`${key} runtime override conflicts with FORMAL_BACKEND_ENV_FILE`);
    }
  }
  const database = validateTargetUrl(parsed.DATABASE_URL!, "mysql:", "DATABASE_URL");
  const databaseName = decodeURIComponent(database.pathname.replace(/^\/+/, ""));
  if (!LOCAL_PURPOSE.test(databaseName) || PRODUCTION_LOOKING.test(databaseName)) {
    throw new Error("DATABASE_URL must name a local, dev, or test database");
  }
  const redis = validateTargetUrl(parsed.REDIS_URL!, "redis:", "REDIS_URL");
  const redisDatabase = redis.pathname.replace(/^\/+/, "") || "0";
  if (PRODUCTION_LOOKING.test(redisDatabase)) {
    throw new Error("REDIS_URL database is production-looking");
  }
  return {
    envFilePath,
    databaseHost: database.hostname,
    databaseName,
    redisHost: redis.hostname,
    redisDatabase,
    values: parsed
  };
};

type TransactionCallback<TTransaction extends object, TResult> = (
  transaction: TTransaction
) => Promise<TResult>;

type TransactionBoundPrismaFacade<TTransaction extends object> = TTransaction & {
  $transaction: <TResult>(callback: TransactionCallback<TTransaction, TResult>) => Promise<TResult>;
};

const createTransactionBoundPrismaFacade = <TTransaction extends object>(
  transaction: TTransaction
): TransactionBoundPrismaFacade<TTransaction> =>
  new Proxy(transaction, {
    get(target, property, receiver) {
      if (property === "$transaction") {
        return async <TResult>(callback: TransactionCallback<TTransaction, TResult>) =>
          callback(transaction);
      }
      if (property === "$connect" || property === "$disconnect") {
        return async () => {
          throw new Error("Transaction-bound facade cannot manage the global connection");
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    }
  }) as TransactionBoundPrismaFacade<TTransaction>;

class LiveDashboardRollbackSentinel extends Error {
  public constructor() {
    super("LIVE_DASHBOARD_CHECK_ROLLBACK");
  }
}

class SseResponse extends EventEmitter {
  public writableEnded = false;
  public destroyed = false;
  public statusCode = 0;
  public readonly chunks: string[] = [];
  public readonly headers = new Map<string, string>();

  public status(code: number): this {
    this.statusCode = code;
    return this;
  }

  public setHeader(name: string, value: string): this {
    this.headers.set(name.toLowerCase(), value);
    return this;
  }

  public flushHeaders(): void {}

  public write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }

  public end(): this {
    this.writableEnded = true;
    return this;
  }
}

const loadRuntime = async () => {
  const [
    prismaModule,
    redisModule,
    bookingModule,
    regionModule,
    dashboardRepositoryModule,
    dashboardCacheModule,
    dashboardServiceModule,
    auditRepositoryModule,
    auditServiceModule,
    eventGatewayModule,
    eventStreamModule,
    eventBusModule,
    rankingRepositoryModule,
    routeEstimateModule
  ] = await Promise.all([
    import("../src/prisma/client"),
    import("../src/config/redis"),
    import("../src/repositories/booking.repository"),
    import("../src/repositories/administrative-region.repository"),
    import("../src/repositories/live-dashboard.repository"),
    import("../src/services/live-dashboard-cache.service"),
    import("../src/services/live-dashboard.service"),
    import("../src/repositories/audit-log.repository"),
    import("../src/services/audit-log.service"),
    import("../src/services/live-dashboard-event.gateway"),
    import("../src/services/redis-live-dashboard-event-stream"),
    import("../src/services/redis-realtime-event.bus"),
    import("../src/repositories/analytics-ranking.repository"),
    import("../src/services/route-estimate.service")
  ]);
  return {
    ...prismaModule,
    ...redisModule,
    ...bookingModule,
    ...regionModule,
    ...dashboardRepositoryModule,
    ...dashboardCacheModule,
    ...dashboardServiceModule,
    ...auditRepositoryModule,
    ...auditServiceModule,
    ...eventGatewayModule,
    ...eventStreamModule,
    ...eventBusModule,
    ...rankingRepositoryModule,
    ...routeEstimateModule
  };
};

const deterministicUuid = (marker: string, name: string): string => {
  const value = sha256(`${marker}:${name}`).slice(0, 32).split("");
  value[12] = "4";
  value[16] = ((Number.parseInt(value[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${value.slice(0, 8).join("")}-${value.slice(8, 12).join("")}-${value
    .slice(12, 16)
    .join("")}-${value.slice(16, 20).join("")}-${value.slice(20).join("")}`;
};

const schemaEvidence = async (
  transaction: Prisma.TransactionClient,
  repositoryRoot: string
): Promise<Record<string, unknown>> => {
  const migrationPath = resolve(
    repositoryRoot,
    "backend/prisma/migrations",
    MIGRATION_NAME,
    "migration.sql"
  );
  const catalogPath = resolve(
    repositoryRoot,
    "backend/prisma/reference/jp-administrative-regions-2026.json"
  );
  const migrationChecksum = sha256(readFileSync(migrationPath));
  const catalogText = readFileSync(catalogPath, "utf8");
  const catalog = JSON.parse(catalogText) as {
    version: string;
    sourceSha256: string;
    outputSha256: string;
    regions: Array<{ officialCode: string; level: "COUNTRY" | "ADMIN1" | "ADMIN2" }>;
  };
  const [
    migrationRows,
    tableRows,
    columnRows,
    indexRows,
    counts,
    tokyoWards,
    databaseCatalogRows,
    permission
  ] = await Promise.all([
    transaction.$queryRaw<Array<{ migration_name: string; checksum: string }>>(Prisma.sql`
        SELECT migration_name, checksum FROM _prisma_migrations
        WHERE migration_name = ${MIGRATION_NAME} AND finished_at IS NOT NULL
          AND rolled_back_at IS NULL
      `),
    transaction.$queryRaw<Array<{ table_name: string }>>(Prisma.sql`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name IN (${Prisma.join(REQUIRED_TABLES)})
      `),
    transaction.$queryRaw<Array<{ table_name: string; column_name: string }>>(Prisma.sql`
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = DATABASE()
      `),
    transaction.$queryRaw<Array<{ table_name: string; index_name: string }>>(Prisma.sql`
        SELECT DISTINCT table_name, index_name FROM information_schema.statistics
        WHERE table_schema = DATABASE()
      `),
    transaction.$queryRaw<Array<{ level: string; count: bigint }>>(Prisma.sql`
        SELECT level, COUNT(*) AS count FROM administrative_regions
        WHERE country_code = ${"JP"} AND source_version = ${DATASET_VERSION}
          AND deleted_at IS NULL GROUP BY level
      `),
    transaction.$queryRaw<Array<{ official_code: string }>>(Prisma.sql`
        SELECT ward.official_code FROM administrative_regions AS ward
        INNER JOIN administrative_regions AS tokyo
          ON tokyo.id = ward.parent_id AND tokyo.official_code = ${"13"}
          AND tokyo.level = ${"ADMIN1"} AND tokyo.deleted_at IS NULL
        WHERE ward.country_code = ${"JP"} AND ward.level = ${"ADMIN2"}
          AND ward.source_version = ${DATASET_VERSION} AND ward.deleted_at IS NULL
          AND ward.official_code REGEXP ${"^131[0-2][0-9]$|^1310[1-9]$"}
        ORDER BY ward.official_code
      `),
    transaction.$queryRaw<
      Array<{
        countryCode: string;
        officialCode: string;
        level: "COUNTRY" | "ADMIN1" | "ADMIN2";
        parentOfficialCode: string | null;
        nameJa: string;
        centroidLat: Prisma.Decimal | null;
        centroidLng: Prisma.Decimal | null;
        source: string;
        sourceVersion: string;
      }>
    >(Prisma.sql`
        SELECT region.country_code AS countryCode, region.official_code AS officialCode,
          region.level AS level, parent.official_code AS parentOfficialCode,
          locale.name AS nameJa, region.centroid_lat AS centroidLat,
          region.centroid_lng AS centroidLng, region.source AS source,
          region.source_version AS sourceVersion
        FROM administrative_regions AS region
        LEFT JOIN administrative_regions AS parent
          ON parent.id = region.parent_id AND parent.deleted_at IS NULL
        INNER JOIN administrative_region_locales AS locale
          ON locale.region_id = region.id AND locale.locale = ${"ja"}
          AND locale.deleted_at IS NULL
        WHERE region.country_code = ${"JP"} AND region.source_version = ${DATASET_VERSION}
          AND region.deleted_at IS NULL
        ORDER BY FIELD(region.level, ${"COUNTRY"}, ${"ADMIN1"}, ${"ADMIN2"}),
          region.official_code ASC
      `),
    transaction.permission.findFirst({
      where: {
        code: "backoffice:dashboard:read",
        deletedAt: null,
        rolePermissions: { some: { deletedAt: null, role: { deletedAt: null } } }
      },
      select: {
        code: true,
        rolePermissions: { where: { deletedAt: null }, select: { id: true } }
      }
    })
  ]);
  assertCondition(
    migrationRows.length === 1 && migrationRows[0]!.checksum === migrationChecksum,
    "Administrative-region migration checksum is not applied exactly"
  );
  const tables = tableRows.map((row) => row.table_name);
  const columns = columnRows.map((row) => `${row.table_name}.${row.column_name}`);
  const indexes = indexRows.map((row) => `${row.table_name}.${row.index_name}`);
  assertCondition(
    REQUIRED_TABLES.every((value) => tables.includes(value)),
    "Schema table missing"
  );
  assertCondition(
    REQUIRED_COLUMNS.every((value) => columns.includes(value)),
    "Schema column missing"
  );
  assertCondition(
    REQUIRED_INDEXES.every((value) => indexes.includes(value)),
    "Schema index missing"
  );
  const countByLevel = Object.fromEntries(counts.map((row) => [row.level, numeric(row.count)]));
  assertCondition(countByLevel.COUNTRY === 1, "Japan catalog country count must be 1");
  assertCondition(countByLevel.ADMIN1 === 47, "Japan catalog admin1 count must be 47");
  assertCondition(countByLevel.ADMIN2 === 1918, "Japan catalog admin2 count must be 1918");
  assertCondition(tokyoWards.length === 23, "Tokyo special-ward count must be 23");
  assertCondition(
    tokyoWards.some((row) => row.official_code === "13104"),
    "Shinjuku is missing"
  );
  assertCondition(catalog.version === DATASET_VERSION, "Catalog version mismatch");
  assertCondition(
    catalog.regions.filter((region) => region.level === "COUNTRY").length === 1,
    "Catalog country count mismatch"
  );
  assertCondition(
    catalog.regions.filter((region) => region.level === "ADMIN1").length === 47,
    "Catalog admin1 count mismatch"
  );
  assertCondition(
    catalog.regions.filter((region) => region.level === "ADMIN2").length === 1918,
    "Catalog admin2 count mismatch"
  );
  assertCondition(
    catalog.sourceSha256 === CATALOG_SOURCE_CHECKSUM,
    "Catalog source checksum mismatch"
  );
  assertCondition(
    catalog.outputSha256 === CATALOG_OUTPUT_CHECKSUM,
    "Catalog output checksum mismatch"
  );
  const outputPayload = `${JSON.stringify(
    { version: catalog.version, regions: catalog.regions },
    null,
    2
  )}\n`;
  assertCondition(
    sha256(outputPayload) === catalog.outputSha256,
    "Catalog content checksum mismatch"
  );
  const databaseCatalog = databaseCatalogRows.map((row) => ({
    countryCode: row.countryCode,
    officialCode: row.officialCode,
    level: row.level,
    parentOfficialCode: row.parentOfficialCode,
    nameJa: row.nameJa,
    centroidLat: row.centroidLat === null ? null : Number(row.centroidLat),
    centroidLng: row.centroidLng === null ? null : Number(row.centroidLng),
    source: row.source,
    sourceVersion: row.sourceVersion
  }));
  const databaseCatalogChecksum = sha256(
    `${JSON.stringify({ version: DATASET_VERSION, regions: databaseCatalog }, null, 2)}\n`
  );
  assertCondition(
    databaseCatalogChecksum === catalog.outputSha256,
    "Database administrative-region catalogue differs from the authoritative artifact"
  );
  assertCondition(
    permission?.rolePermissions.length,
    "Formal dashboard permission grant is missing"
  );
  return {
    migration: MIGRATION_NAME,
    migrationChecksum,
    catalogVersion: catalog.version,
    catalogFileChecksum: sha256(catalogText),
    catalogSourceChecksum: catalog.sourceSha256,
    catalogOutputChecksum: catalog.outputSha256,
    databaseCatalogChecksum,
    databaseCounts: countByLevel,
    tokyoSpecialWards: tokyoWards.length,
    permission: permission.code,
    permissionGrantCount: permission.rolePermissions.length
  };
};

interface FixtureEvidence {
  storeOrderId: number;
  homeOrderId: number;
  unresolvedOrderId: number;
  orderNumbers: string[];
  immutableLocations: Array<Record<string, unknown>>;
  forbiddenSentinels: string[];
}

const createFixture = async (
  transaction: Prisma.TransactionClient,
  facade: PrismaClient,
  marker: string,
  runtime: Awaited<ReturnType<typeof loadRuntime>>
): Promise<FixtureEvidence> => {
  const [tokyo, shinjuku, osaka, osakaKita] = await Promise.all([
    transaction.administrativeRegion.findFirstOrThrow({
      where: {
        countryCode: "JP",
        officialCode: "13",
        sourceVersion: DATASET_VERSION,
        deletedAt: null
      }
    }),
    transaction.administrativeRegion.findFirstOrThrow({
      where: {
        countryCode: "JP",
        officialCode: "13104",
        sourceVersion: DATASET_VERSION,
        deletedAt: null
      }
    }),
    transaction.administrativeRegion.findFirstOrThrow({
      where: {
        countryCode: "JP",
        officialCode: "27",
        sourceVersion: DATASET_VERSION,
        deletedAt: null
      }
    }),
    transaction.administrativeRegion.findFirstOrThrow({
      where: {
        countryCode: "JP",
        officialCode: "27127",
        sourceVersion: DATASET_VERSION,
        deletedAt: null
      }
    })
  ]);
  const userSeed =
    Number(BigInt(`0x${sha256(marker).slice(0, 12)}`) % 9_000_000_000n) + 1_000_000_000;
  const users = await Promise.all(
    ["operator", "technician", "store-customer", "home-customer", "unresolved-customer"].map(
      (name, index) =>
        transaction.user.create({
          data: {
            needoId: `u${String(userSeed + index)
              .slice(-10)
              .padStart(10, "0")}`,
            email: `${marker}.${name}@formal.invalid`,
            username: `${marker}-${name}`,
            isTestAccount: true,
            createdAt: new Date(WINDOW_START.getTime() + (index + 1) * 60_000)
          }
        })
    )
  );
  const [operator, technicianUser, storeCustomer, homeCustomer, unresolvedCustomer] = users;
  await Promise.all(
    [storeCustomer!, homeCustomer!, unresolvedCustomer!].map((user) =>
      transaction.customerProfile.create({
        data: {
          userId: user.id,
          displayName: `${marker}-customer`,
          city: "東京都",
          createdAt: new Date(WINDOW_START.getTime() + 10 * 60_000)
        }
      })
    )
  );
  const shop = await transaction.shop.create({
    data: {
      ownerUserId: operator!.id,
      name: `${marker}-shop`,
      city: "新宿区",
      address: `${marker}-private-address`,
      phone: "+819900000008",
      status: "published",
      createdAt: new Date(WINDOW_START.getTime() + 20 * 60_000)
    }
  });
  const technician = await transaction.technicianProfile.create({
    data: {
      userId: technicianUser!.id,
      shopId: shop.id,
      displayName: `${marker}-technician-private`,
      city: "新宿区",
      createdAt: new Date(WINDOW_START.getTime() + 30 * 60_000)
    }
  });
  const category = await transaction.category.create({
    data: { code: `${marker}-category`, name: `${marker}-category` }
  });
  const service = await transaction.service.create({
    data: {
      publicId: deterministicUuid(marker, "service"),
      categoryId: category.id,
      shopId: shop.id,
      technicianProfileId: technician.id,
      name: `${marker}-service`,
      city: "新宿区",
      priceAmount: 12_000,
      durationMinutes: 60,
      status: "published"
    }
  });
  await transaction.shopServiceLocation.create({
    data: {
      shopId: shop.id,
      countryCode: "JP",
      admin1RegionId: tokyo.id,
      admin2RegionId: shinjuku.id,
      datasetVersion: DATASET_VERSION,
      verifiedAt: EVALUATED_AT,
      verifiedById: operator!.id
    }
  });
  // Booking admission uses wall-clock freshness; the orders below are subsequently
  // projected into the fixed reporting window inside this rollback transaction.
  const fixtureBookingTime = Date.now();
  const slots = await Promise.all(
    [1, 2, 3].map((index) =>
      transaction.scheduleSlot.create({
        data: {
          serviceId: service.id,
          shopId: shop.id,
          technicianProfileId: technician.id,
          startsAt: new Date(fixtureBookingTime + (120 + index * 90) * 60_000),
          endsAt: new Date(fixtureBookingTime + (180 + index * 90) * 60_000),
          capacity: 1
        }
      })
    )
  );
  const regionRepository = new runtime.AdministrativeRegionRepository(facade);
  const bookingRepository = new runtime.BookingRepository(facade, regionRepository);
  const homeAddress = runtime.normalizeJapaneseRouteAddress({
    countryCode: "JP", postalCode: "160-0022", prefecture: "東京都", city: "新宿区",
    addressLine1: `${marker}-private-address`
  });
  const travelPolicy = await transaction.shopTravelFarePolicyVersion.create({
    data: {
      publicId: deterministicUuid(marker, "travel-policy"), shopId: shop.id,
      version: 1, effectiveFrom: new Date(fixtureBookingTime - 60_000),
      publishedByUserId: operator!.id, reason: "Rollback-only live dashboard acceptance fixture",
      bands: { create: { ordinal: 1, maximumDistanceMeters: 10_000, fareAmountJpy: 0 } }
    },
    include: { bands: true }
  });
  // Explicit transaction-local evidence, not a claim of live routing-provider acceptance.
  const homeTravelEstimate = await transaction.routeEstimate.create({
    data: {
      publicId: deterministicUuid(marker, "travel-estimate"), customerUserId: homeCustomer!.id,
      shopId: shop.id, serviceId: service.id, scheduleSlotId: slots[1]!.id,
      policyVersionId: travelPolicy.id, matchedBandId: travelPolicy.bands[0]!.id,
      providerCode: "rollback_fixture", distanceMeters: 1_000, durationSeconds: 300,
      originAddressHash: runtime.hashRouteAddress(runtime.shopAddressToJapaneseRouteAddress(shop)),
      destinationAddressHash: runtime.hashRouteAddress(homeAddress), fareAmountJpy: 0,
      expiresAt: new Date(fixtureBookingTime + 60 * 60_000)
    }
  });
  const storeResult = await bookingRepository.createBooking({
    customerUserId: storeCustomer!.id,
    serviceId: service.id,
    scheduleSlotId: slots[0]!.id,
    fulfillmentMode: "store",
    serviceLocation: { source: "SHOP_LOCATION" },
    paymentMethod: "onsite",
    note: `${marker}-booking-note-private`
  });
  const homeResult = await bookingRepository.createBooking({
    customerUserId: homeCustomer!.id,
    serviceId: service.id,
    scheduleSlotId: slots[1]!.id,
    fulfillmentMode: "home",
    fulfillmentAddress: homeAddress,
    travelEstimatePublicId: homeTravelEstimate.publicId,
    serviceLocation: {
      source: "CUSTOMER_SERVICE_LOCATION",
      countryCode: "JP",
      admin1Code: "13",
      admin2Code: "13104"
    },
    paymentMethod: "onsite"
  });
  assertCondition(storeResult && homeResult && "order" in storeResult && "order" in homeResult, "Formal booking fixture creation failed");
  const deterministicOrders = [
    { id: storeResult.order.id, orderNo: `${marker}-store`, status: "COMPLETED" as const },
    { id: homeResult.order.id, orderNo: `${marker}-home`, status: "COMPLETED" as const }
  ];
  for (const [index, order] of deterministicOrders.entries()) {
    await transaction.bookingOrder.update({
      where: { id: order.id },
      data: {
        orderNo: order.orderNo,
        status: order.status,
        paymentStatus: "CONFIRMED",
        paymentConfirmedById: operator!.id,
        paymentConfirmedAt: new Date(WINDOW_START.getTime() + (240 + index) * 60_000),
        createdAt: new Date(WINDOW_START.getTime() + (60 + index) * 60_000),
        startsAt: new Date(WINDOW_START.getTime() + (180 + index) * 60_000),
        endsAt: new Date(WINDOW_START.getTime() + (240 + index) * 60_000)
      }
    });
  }
  const maxRate = await transaction.ndpExchangeRateRule.aggregate({ _max: { version: true } });
  const rate = await transaction.ndpExchangeRateRule.create({
    data: {
      publicId: deterministicUuid(marker, "rate"),
      version: (maxRate._max.version ?? 0) + 1,
      ndpUnits: 1,
      jpyUnits: 1,
      status: "SUPERSEDED",
      effectiveFrom: WINDOW_START,
      idempotencyKey: `${marker}:rate`,
      reason: "Rollback-only live dashboard checker",
      createdById: operator!.id
    }
  });
  for (const [index, order] of deterministicOrders.entries()) {
    const amount = index === 0 ? 12_000 : 15_000;
    const currency = index === 0 ? "NDP" : "TEST_NDP";
    const confirmedAt = new Date(WINDOW_START.getTime() + (240 + index) * 60_000);
    const checkout = await transaction.orderCheckout.create({
      data: {
        bookingOrderId: order.id,
        baseAmountJpy: amount,
        checkoutAmountJpy: amount,
        payableNdp: amount,
        ndpRateRuleId: rate.id,
        rateSnapshotJson: { marker, currency },
        calculationSnapshotJson: { marker, amount },
        paymentMethod: "NDP",
        paymentSelectedAt: new Date(confirmedAt.getTime() - 2_000)
      }
    });
    const ledger = await transaction.ledgerTransaction.create({
      data: {
        transactionNo: `${marker}-ledger-${index}`,
        idempotencyKey: `${marker}:ledger:${index}`,
        type: "BOOKING_COMPLETE_SETTLEMENT",
        status: "APPLIED",
        referenceType: "order_checkout_payment",
        referenceId: checkout.id,
        actorUserId: operator!.id,
        amount,
        currency,
        metadata: { marker },
        createdAt: new Date(confirmedAt.getTime() - 1_000)
      }
    });
    await transaction.orderCheckout.update({
      where: { id: checkout.id },
      data: { ledgerTransactionId: ledger.id }
    });
    await transaction.bookingOrder.update({
      where: { id: order.id },
      data: {
        priceAmount: amount,
        servicePriceSnapshot: amount,
        paymentAmountJpy: amount,
        paymentReference: `checkout:${checkout.id}:ledger:${ledger.id}`
      }
    });
    await transaction.orderFinancial.create({
      data: {
        bookingOrderId: order.id,
        ndpCurrency: currency,
        customerUserId: index === 0 ? storeCustomer!.id : homeCustomer!.id,
        shopId: shop.id,
        technicianProfileId: technician.id,
        serviceAmountJpy: amount,
        bPlatformFeeActualNdp: index === 0 ? 120 : 210,
        cRequestFeeActualNdp: index === 0 ? 30 : 40,
        userRewardNdp: index === 0 ? 10 : 20,
        userRewardStatus: "PAID",
        userRewardGrantedAt: confirmedAt,
        settlementStatus: "settled",
        createdAt: confirmedAt
      }
    });
  }
  const unresolvedOrder = await transaction.bookingOrder.create({
    data: {
      orderNo: `${marker}-UNRESOLVED`,
      customerUserId: unresolvedCustomer!.id,
      serviceId: service.id,
      shopId: shop.id,
      technicianProfileId: technician.id,
      scheduleSlotId: slots[2]!.id,
      fulfillmentMode: "home",
      priceAmount: 9_000,
      serviceNameSnapshot: `${marker}-unresolved-service`,
      startsAt: new Date(WINDOW_START.getTime() + 6 * 60 * 60_000),
      endsAt: new Date(WINDOW_START.getTime() + 7 * 60 * 60_000),
      createdAt: new Date(WINDOW_START.getTime() + 3 * 60 * 60_000),
      serviceSnapshotJson: { marker, resolution: "UNRESOLVED" }
    }
  });
  await transaction.bookingServiceLocation.create({
    data: {
      bookingOrderId: unresolvedOrder.id,
      countryCode: "JP",
      source: "CUSTOMER_SERVICE_LOCATION",
      resolutionStatus: "UNRESOLVED",
      datasetVersion: DATASET_VERSION
    }
  });
  await transaction.shopServiceLocation.update({
    where: { shopId: shop.id },
    data: {
      admin1RegionId: osaka.id,
      admin2RegionId: osakaKita.id,
      verifiedAt: new Date(EVALUATED_AT.getTime() + 60_000)
    }
  });
  const immutableLocations = await transaction.bookingServiceLocation.findMany({
    where: { bookingOrderId: { in: deterministicOrders.map((order) => order.id) } },
    orderBy: { bookingOrderId: "asc" },
    select: {
      bookingOrderId: true,
      source: true,
      countryCode: true,
      admin1RegionCode: true,
      admin2RegionCode: true,
      resolutionStatus: true,
      datasetVersion: true
    }
  });
  assertCondition(
    immutableLocations.length === 2 &&
      immutableLocations.every(
        (location) =>
          location.countryCode === "JP" &&
          location.admin1RegionCode === "13" &&
          location.admin2RegionCode === "13104" &&
          location.resolutionStatus === "VERIFIED"
      ),
    "Immutable store/home booking locations are not verified Shinjuku snapshots"
  );
  return {
    storeOrderId: storeResult.order.id,
    homeOrderId: homeResult.order.id,
    unresolvedOrderId: unresolvedOrder.id,
    orderNumbers: [...deterministicOrders.map((order) => order.orderNo), unresolvedOrder.orderNo],
    immutableLocations,
    forbiddenSentinels: [
      `${marker}-customer`,
      `${marker}-private-address`,
      `${marker}-technician-private`,
      `${marker}.home-customer@formal.invalid`,
      `${marker}-booking-note-private`,
      "+819900000008"
    ]
  };
};

const scopePredicate = (admin1: string | null, admin2: string | null): Prisma.Sql =>
  !admin1 && !admin2 ? Prisma.sql`(location.booking_order_id IS NULL OR (location.country_code = ${"JP"} AND location.deleted_at IS NULL))` : Prisma.sql`
    location.country_code = ${"JP"}
    AND location.deleted_at IS NULL
    ${
      admin1
        ? Prisma.sql`AND location.resolution_status = ${"verified"}
      AND location.admin1_region_code = ${admin1}`
        : Prisma.empty
    }
    ${admin2 ? Prisma.sql`AND location.admin2_region_code = ${admin2}` : Prisma.empty}
  `;

interface AggregateEvidence {
  totalOrders: number;
  serviceGmvJpy: number;
  confirmedPaymentJpy: number;
  confirmedPaymentNdp: number;
  confirmedPaymentTestNdp: number;
  platformNetRevenueNdp: number;
  platformNetRevenueTestNdp: number;
}

const CHECKER_DAY_MS = 24 * 60 * 60 * 1_000;
const CHECKER_TOKYO_OFFSET_MS = 9 * 60 * 60 * 1_000;
// Cache reads happen immediately after population; allow bounded local query/clock latency only.
const CACHE_TTL_MEASUREMENT_TOLERANCE_MS = 15_000;

const checkerCalendarDate = (instant: Date): string =>
  new Date(instant.getTime() + CHECKER_TOKYO_OFFSET_MS).toISOString().slice(0, 10);

const independentDashboardWindow = (
  period: "today" | "last7days" | "last30days"
): DashboardWindow => {
  const days = period === "today" ? 1 : period === "last7days" ? 7 : 30;
  const toExclusive = new Date(WINDOW_START.getTime() + CHECKER_DAY_MS);
  const fromInclusive = new Date(toExclusive.getTime() - days * CHECKER_DAY_MS);
  const previousToExclusive = fromInclusive;
  const previousFromInclusive = new Date(fromInclusive.getTime() - days * CHECKER_DAY_MS);
  const buckets =
    period === "today"
      ? Array.from({ length: 24 }, (_, hour) => {
          const start = new Date(fromInclusive.getTime() + hour * 60 * 60 * 1_000);
          const label = `${String(hour).padStart(2, "0")}:00`;
          return {
            key: label,
            label,
            fromInclusive: start,
            toExclusive: new Date(start.getTime() + 60 * 60 * 1_000)
          };
        })
      : Array.from({ length: days }, (_, index) => {
          const start = new Date(fromInclusive.getTime() + index * CHECKER_DAY_MS);
          const key = checkerCalendarDate(start);
          return {
            key,
            label: key.slice(5),
            fromInclusive: start,
            toExclusive: new Date(start.getTime() + CHECKER_DAY_MS)
          };
        });
  return {
    period,
    timeZone: "Asia/Tokyo",
    granularity: period === "today" ? "hour" : "day",
    fromDate: checkerCalendarDate(fromInclusive),
    toDate: checkerCalendarDate(new Date(toExclusive.getTime() - CHECKER_DAY_MS)),
    fromInclusive,
    toExclusive,
    previousFromDate: checkerCalendarDate(previousFromInclusive),
    previousToDate: checkerCalendarDate(new Date(previousToExclusive.getTime() - CHECKER_DAY_MS)),
    previousFromInclusive,
    previousToExclusive,
    buckets
  };
};

// This checker-owned predicate intentionally duplicates the persisted evidence contract so
// production repository regressions cannot self-confirm through a shared implementation.
const independentConfirmedPaymentEvidence = (): Prisma.Sql => Prisma.sql`
  booking.status = ${"completed"}
  AND booking.payment_status = ${"confirmed"}
  AND booking.payment_confirmed_by_id IS NOT NULL
  AND booking.payment_refunded_at IS NULL
  AND booking.payment_refunded_by_id IS NULL
  AND booking.payment_refund_reference IS NULL
  AND booking.payment_refund_reason IS NULL
  AND booking.payment_amount_jpy = checkout.checkout_amount_jpy
  AND checkout.base_amount_jpy >= 0
  AND checkout.add_on_amount_jpy >= 0
  AND checkout.travel_fare_amount_jpy >= 0
  AND checkout.discount_amount_jpy >= 0
  AND checkout.checkout_amount_jpy >= 0
  AND checkout.payable_ndp >= 0
  AND checkout.base_amount_jpy + checkout.add_on_amount_jpy
    + checkout.travel_fare_amount_jpy - checkout.discount_amount_jpy
    = checkout.checkout_amount_jpy
  AND checkout.payment_method = booking.payment_method
  AND checkout.payment_selected_at IS NOT NULL
  AND checkout.payment_selected_at <= booking.payment_confirmed_at
  AND (
    (
      checkout.payment_method = ${"ndp"}
      AND checkout.ledger_transaction_id IS NOT NULL
      AND ledger.id = checkout.ledger_transaction_id
      AND ledger.type = ${"booking_complete_settlement"}
      AND ledger.status = ${"applied"}
      AND ledger.reference_type = ${"order_checkout_payment"}
      AND ledger.reference_id = checkout.id
      AND ledger.amount = checkout.payable_ndp
      AND ledger.actor_user_id = booking.payment_confirmed_by_id
      AND ledger.deleted_at IS NULL
      AND checkout.payment_selected_at <= ledger.created_at
      AND ledger.created_at <= booking.payment_confirmed_at
      AND booking.payment_reference = CONCAT(
        ${"checkout:"}, checkout.id, ${":ledger:"}, ledger.id
      )
      AND booking.payment_note IS NULL
      AND checkout.receipt_confirmed_by_id IS NULL
      AND checkout.receipt_confirmed_at IS NULL
      AND checkout.receipt_confirmation_reason IS NULL
    )
    OR
    (
      checkout.payment_method IN (${"cash"}, ${"other"})
      AND checkout.ledger_transaction_id IS NULL
      AND ledger.id IS NULL
      AND checkout.receipt_confirmed_by_id IS NOT NULL
      AND checkout.receipt_confirmed_at IS NOT NULL
      AND checkout.payment_selected_at <= checkout.receipt_confirmed_at
      AND checkout.receipt_confirmed_at <= booking.payment_confirmed_at
      AND checkout.receipt_confirmation_reason IS NOT NULL
      AND TRIM(checkout.receipt_confirmation_reason) <> ${""}
      AND booking.payment_confirmed_by_id = checkout.receipt_confirmed_by_id
      AND booking.payment_note = checkout.receipt_confirmation_reason
      AND booking.payment_reference IN (
        CONCAT(${"checkout:"}, checkout.id, ${":technician-receipt"}),
        CONCAT(${"checkout:"}, checkout.id, ${":operations-receipt"})
      )
      AND (
        (checkout.payment_method = ${"cash"}
          AND checkout.other_method_code IS NULL
          AND checkout.other_method_label IS NULL)
        OR
        (checkout.payment_method = ${"other"}
          AND checkout.other_method_code IS NOT NULL
          AND TRIM(checkout.other_method_code) <> ${""}
          AND checkout.other_method_label IS NOT NULL
          AND TRIM(checkout.other_method_label) <> ${""})
      )
    )
  )
`;

const directAggregate = async (
  transaction: Prisma.TransactionClient,
  admin1: string | null,
  admin2: string | null,
  window: { fromInclusive: Date; toExclusive: Date }
): Promise<AggregateEvidence> => {
  const [row] = await transaction.$queryRaw<
    Array<Record<keyof AggregateEvidence, bigint | number | string>>
  >(Prisma.sql`
    WITH scoped_orders AS (
      SELECT booking.id, booking.status, booking.payment_status, booking.price_amount
      FROM booking_orders AS booking
      LEFT JOIN booking_service_locations AS location ON location.booking_order_id = booking.id
      INNER JOIN shops AS shop ON shop.id = booking.shop_id AND shop.deleted_at IS NULL AND ${scopePredicate(admin1, admin2)}
      WHERE booking.starts_at >= ${window.fromInclusive} AND booking.starts_at < ${window.toExclusive}
        AND booking.created_at <= ${EVALUATED_AT} AND booking.deleted_at IS NULL
    ), eligible_payments AS (
      SELECT checkout.checkout_amount_jpy, checkout.payable_ndp, ledger.currency
      FROM booking_orders AS booking
      LEFT JOIN booking_service_locations AS location ON location.booking_order_id = booking.id
      INNER JOIN shops AS shop ON shop.id = booking.shop_id AND shop.deleted_at IS NULL AND ${scopePredicate(admin1, admin2)}
      INNER JOIN order_checkouts AS checkout
        ON checkout.booking_order_id = booking.id AND checkout.deleted_at IS NULL
      LEFT JOIN ledger_transactions AS ledger
        ON ledger.id = checkout.ledger_transaction_id AND ledger.deleted_at IS NULL
      WHERE booking.payment_confirmed_at >= ${window.fromInclusive}
        AND booking.payment_confirmed_at < ${window.toExclusive}
        AND booking.payment_confirmed_at <= ${EVALUATED_AT}
        AND booking.deleted_at IS NULL AND ${independentConfirmedPaymentEvidence()}
    ), revenue AS (
      SELECT financial.ndp_currency,
        COALESCE(SUM(financial.b_platform_fee_actual_ndp), 0) AS platform_fee,
        COALESCE(SUM(financial.c_request_fee_actual_ndp), 0) AS request_fee
      FROM booking_orders AS booking
      LEFT JOIN booking_service_locations AS location ON location.booking_order_id = booking.id
      INNER JOIN shops AS shop ON shop.id = booking.shop_id AND shop.deleted_at IS NULL AND ${scopePredicate(admin1, admin2)}
      INNER JOIN order_financials AS financial
        ON financial.booking_order_id = booking.id AND financial.shop_id = booking.shop_id
        AND financial.deleted_at IS NULL
      WHERE booking.starts_at >= ${window.fromInclusive} AND booking.starts_at < ${window.toExclusive}
        AND booking.created_at <= ${EVALUATED_AT} AND booking.deleted_at IS NULL
      GROUP BY financial.ndp_currency
    ), paid_rewards AS (
      SELECT financial.ndp_currency, COALESCE(SUM(financial.user_reward_ndp), 0) AS reward
      FROM order_financials AS financial
      INNER JOIN booking_orders AS booking
        ON booking.id = financial.booking_order_id AND booking.deleted_at IS NULL
      LEFT JOIN booking_service_locations AS location ON location.booking_order_id = booking.id
      INNER JOIN shops AS shop ON shop.id = booking.shop_id AND shop.deleted_at IS NULL AND ${scopePredicate(admin1, admin2)}
      WHERE financial.user_reward_granted_at >= ${window.fromInclusive}
        AND financial.user_reward_granted_at < ${window.toExclusive}
        AND financial.user_reward_granted_at <= ${EVALUATED_AT}
        AND financial.user_reward_status = ${"paid"} AND financial.deleted_at IS NULL
      GROUP BY financial.ndp_currency
    )
    SELECT
      (SELECT COUNT(*) FROM scoped_orders) AS totalOrders,
      COALESCE((SELECT SUM(CASE WHEN status = ${"completed"}
        AND payment_status NOT IN (${"refund_pending"}, ${"refunded"})
        THEN price_amount ELSE 0 END) FROM scoped_orders), 0) AS serviceGmvJpy,
      COALESCE((SELECT SUM(checkout_amount_jpy) FROM eligible_payments), 0)
        AS confirmedPaymentJpy,
      COALESCE((SELECT SUM(payable_ndp) FROM eligible_payments WHERE currency = ${"NDP"}), 0)
        AS confirmedPaymentNdp,
      COALESCE((SELECT SUM(payable_ndp) FROM eligible_payments WHERE currency = ${"TEST_NDP"}), 0)
        AS confirmedPaymentTestNdp,
      COALESCE((SELECT platform_fee + request_fee FROM revenue WHERE ndp_currency = ${"NDP"}), 0)
        - COALESCE((SELECT reward FROM paid_rewards WHERE ndp_currency = ${"NDP"}), 0)
        AS platformNetRevenueNdp,
      COALESCE((SELECT platform_fee + request_fee FROM revenue
        WHERE ndp_currency = ${"TEST_NDP"}), 0)
        - COALESCE((SELECT reward FROM paid_rewards WHERE ndp_currency = ${"TEST_NDP"}), 0)
        AS platformNetRevenueTestNdp
  `);
  assertCondition(row, "Direct aggregate query returned no row");
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, numeric(value)])
  ) as unknown as AggregateEvidence;
};

const assertAggregateParity = (
  snapshot: LiveDashboardSnapshotResponse,
  direct: AggregateEvidence,
  label: string
): void => {
  const expected = {
    totalOrders: snapshot.orders.total,
    serviceGmvJpy: snapshot.orders.serviceGmv.jpy,
    confirmedPaymentJpy: snapshot.confirmedPayments.jpy,
    confirmedPaymentNdp: snapshot.confirmedPayments.ndp,
    confirmedPaymentTestNdp: snapshot.confirmedPayments.testNdp,
    platformNetRevenueNdp: snapshot.orders.platformNetRevenue.ndp,
    platformNetRevenueTestNdp: snapshot.orders.platformNetRevenue.testNdp
  };
  assertCondition(
    JSON.stringify(direct) === JSON.stringify(expected),
    `Direct MySQL and formal cached snapshot differ for ${label}`
  );
};

const directSnapshotFacts = (facts: LiveDashboardSnapshotFacts): Record<string, unknown> => {
  const order = (value: LiveDashboardSnapshotFacts["activity"][number]) => ({
    ...value,
    occurredAt: value.occurredAt.toISOString()
  });
  return {
    evaluatedAt: facts.evaluatedAt.toISOString(),
    scope: facts.scope,
    children: facts.children,
    headline: facts.headline,
    confirmedPayments: facts.confirmedPayments,
    orders: facts.orders,
    realtimeOrders: {
      ...facts.realtimeOrders,
      list: facts.realtimeOrders.list.map(order)
    },
    activity: facts.activity.map(order),
    trend: facts.trend,
    serviceRanking: facts.serviceRanking,
    technicianRanking: facts.technicianRanking,
    coverage: facts.coverage
  };
};

const cachedSnapshotFacts = (snapshot: LiveDashboardSnapshotResponse): Record<string, unknown> => ({
  evaluatedAt: snapshot.evaluatedAt,
  scope: {
    countryCode: snapshot.scope.country,
    admin1Code: snapshot.scope.admin1,
    admin2Code: snapshot.scope.admin2
  },
  children: snapshot.children,
  headline: snapshot.headline,
  confirmedPayments: snapshot.confirmedPayments,
  orders: snapshot.orders,
  realtimeOrders: snapshot.realtimeOrders,
  activity: snapshot.activity,
  trend: snapshot.trend,
  serviceRanking: snapshot.serviceRanking,
  technicianRanking: snapshot.technicianRanking,
  coverage: snapshot.coverage
});

export const assertCompleteSnapshotParity = (
  snapshot: LiveDashboardSnapshotResponse,
  facts: LiveDashboardSnapshotFacts,
  label: string
): void => {
  assertCondition(
    JSON.stringify(cachedSnapshotFacts(snapshot)) === JSON.stringify(directSnapshotFacts(facts)),
    `Complete direct MySQL snapshot parity failed for ${label}`
  );
};

const independentDirectSnapshot = async (
  transaction: Prisma.TransactionClient,
  runtime: Awaited<ReturnType<typeof loadRuntime>>,
  scope: { countryCode: "JP"; admin1Code: string | null; admin2Code: string | null },
  period: "today" | "last7days" | "last30days"
): Promise<LiveDashboardSnapshotFacts> => {
  const window = independentDashboardWindow(period);
  const trendWindow = independentDashboardWindow("last7days");
  const childLevel = scope.admin1Code ? "ADMIN2" : "ADMIN1";
  const childCode = scope.admin1Code
    ? Prisma.sql`location.admin2_region_code`
    : Prisma.sql`location.admin1_region_code`;
  const parentCode = scope.admin1Code ?? "JP";
  const children = scope.admin2Code
    ? []
    : await transaction.$queryRaw<
        Array<{
          code: string;
          name: string;
          orderCount: bigint;
          confirmedPaymentJpy: Prisma.Decimal;
          confirmedPaymentNdp: Prisma.Decimal;
          confirmedPaymentTestNdp: Prisma.Decimal;
        }>
      >(Prisma.sql`
        WITH order_counts AS (
          SELECT ${childCode} AS child_code, COUNT(booking.id) AS order_count
          FROM booking_orders AS booking
          LEFT JOIN booking_service_locations AS location ON location.booking_order_id = booking.id
          INNER JOIN shops AS shop ON shop.id = booking.shop_id AND shop.deleted_at IS NULL AND ${scopePredicate(scope.admin1Code, scope.admin2Code)}
          WHERE booking.starts_at >= ${window.fromInclusive}
            AND booking.starts_at < ${window.toExclusive}
            AND booking.created_at <= ${EVALUATED_AT} AND booking.deleted_at IS NULL
          AND location.resolution_status = ${"verified"}
          GROUP BY ${childCode}
        ), payments AS (
          SELECT ${childCode} AS child_code,
            COALESCE(SUM(checkout.checkout_amount_jpy), 0) AS confirmed_jpy,
            COALESCE(SUM(CASE WHEN ledger.currency = ${"NDP"}
              THEN checkout.payable_ndp ELSE 0 END), 0) AS confirmed_ndp,
            COALESCE(SUM(CASE WHEN ledger.currency = ${"TEST_NDP"}
              THEN checkout.payable_ndp ELSE 0 END), 0) AS confirmed_test_ndp
          FROM booking_orders AS booking
          LEFT JOIN booking_service_locations AS location ON location.booking_order_id = booking.id
          INNER JOIN shops AS shop ON shop.id = booking.shop_id AND shop.deleted_at IS NULL AND ${scopePredicate(scope.admin1Code, scope.admin2Code)}
          INNER JOIN order_checkouts AS checkout
            ON checkout.booking_order_id = booking.id AND checkout.deleted_at IS NULL
          LEFT JOIN ledger_transactions AS ledger
            ON ledger.id = checkout.ledger_transaction_id AND ledger.deleted_at IS NULL
          WHERE booking.payment_confirmed_at >= ${window.fromInclusive}
            AND booking.payment_confirmed_at < ${window.toExclusive}
            AND booking.payment_confirmed_at <= ${EVALUATED_AT}
            AND booking.deleted_at IS NULL AND ${independentConfirmedPaymentEvidence()}
          AND location.resolution_status = ${"verified"}
          GROUP BY ${childCode}
        )
        SELECT child.official_code AS code, locale.name AS name,
          COALESCE(order_counts.order_count, 0) AS orderCount,
          COALESCE(payments.confirmed_jpy, 0) AS confirmedPaymentJpy,
          COALESCE(payments.confirmed_ndp, 0) AS confirmedPaymentNdp,
          COALESCE(payments.confirmed_test_ndp, 0) AS confirmedPaymentTestNdp
        FROM administrative_regions AS child
        INNER JOIN administrative_regions AS parent
          ON parent.id = child.parent_id AND parent.official_code = ${parentCode}
          AND parent.deleted_at IS NULL
        INNER JOIN administrative_region_locales AS locale
          ON locale.region_id = child.id AND locale.locale = ${"ja"} AND locale.deleted_at IS NULL
        LEFT JOIN order_counts ON order_counts.child_code = child.official_code
        LEFT JOIN payments ON payments.child_code = child.official_code
        WHERE child.country_code = ${"JP"} AND child.level = ${childLevel}
          AND child.deleted_at IS NULL ORDER BY child.official_code ASC
      `);
  const [headlineOrders] = await transaction.$queryRaw<
    Array<{ newOrders: bigint; completedOrders: Prisma.Decimal }>
  >(Prisma.sql`
    SELECT COALESCE(SUM(booking.created_at >= ${window.fromInclusive}
        AND booking.created_at < ${window.toExclusive}), 0) AS newOrders,
      COALESCE(SUM(booking.starts_at >= ${window.fromInclusive}
        AND booking.starts_at < ${window.toExclusive}
        AND booking.status = ${"completed"}
        AND booking.payment_status NOT IN (${"refund_pending"}, ${"refunded"})), 0)
        AS completedOrders
    FROM booking_orders AS booking
    LEFT JOIN booking_service_locations AS location ON location.booking_order_id = booking.id
    INNER JOIN shops AS shop ON shop.id = booking.shop_id AND shop.deleted_at IS NULL AND ${scopePredicate(scope.admin1Code, scope.admin2Code)}
    WHERE booking.created_at <= ${EVALUATED_AT} AND booking.deleted_at IS NULL
      AND ((booking.created_at >= ${window.fromInclusive} AND booking.created_at < ${window.toExclusive})
        OR (booking.starts_at >= ${window.fromInclusive} AND booking.starts_at < ${window.toExclusive}))
  `);
  const narrow = scope.admin1Code !== null || scope.admin2Code !== null;
  const [headlineEntities] = await transaction.$queryRaw<
    Array<{ newCustomers: bigint; onboardedTechnicians: bigint }>
  >(Prisma.sql`
    SELECT
      (SELECT COUNT(profile.id) FROM customer_profiles AS profile
       WHERE profile.created_at >= ${window.fromInclusive}
         AND profile.created_at < ${window.toExclusive}
         AND profile.created_at <= ${EVALUATED_AT} AND profile.deleted_at IS NULL
         ${
           narrow
             ? Prisma.sql`AND EXISTS (
               SELECT 1 FROM booking_orders AS occurrence
               INNER JOIN booking_service_locations AS location
                 ON location.booking_order_id = occurrence.id
                 AND ${scopePredicate(scope.admin1Code, scope.admin2Code)}
               INNER JOIN shops AS shop ON shop.id = occurrence.shop_id AND shop.deleted_at IS NULL
               WHERE occurrence.customer_user_id = profile.user_id
                 AND occurrence.created_at <= ${EVALUATED_AT} AND occurrence.deleted_at IS NULL)`
             : Prisma.empty
         }) AS newCustomers,
      (SELECT COUNT(technician.id) FROM technician_profiles AS technician
       WHERE technician.created_at >= ${window.fromInclusive}
         AND technician.created_at < ${window.toExclusive}
         AND technician.created_at <= ${EVALUATED_AT} AND technician.deleted_at IS NULL
         ${
           narrow
             ? Prisma.sql`AND EXISTS (
               SELECT 1 FROM booking_orders AS occurrence
               INNER JOIN booking_service_locations AS location
                 ON location.booking_order_id = occurrence.id
                 AND ${scopePredicate(scope.admin1Code, scope.admin2Code)}
               INNER JOIN shops AS shop ON shop.id = occurrence.shop_id AND shop.deleted_at IS NULL
               WHERE occurrence.technician_profile_id = technician.id
                 AND occurrence.created_at <= ${EVALUATED_AT} AND occurrence.deleted_at IS NULL)`
             : Prisma.empty
         }) AS onboardedTechnicians
  `);
  const aggregate = await directAggregate(transaction, scope.admin1Code, scope.admin2Code, window);
  const realtimeRows = await transaction.$queryRaw<
    Array<{
      totalCount: bigint;
      orderNo: string;
      status: string;
      serviceName: string;
      amountJpy: Prisma.Decimal;
      occurredAt: Date;
    }>
  >(Prisma.sql`
    SELECT COUNT(*) OVER() AS totalCount, booking.order_no AS orderNo,
      booking.status, COALESCE(booking.service_name_snapshot, ${"-"}) AS serviceName,
      CAST(booking.price_amount AS DECIMAL(65, 0)) AS amountJpy,
      booking.created_at AS occurredAt
    FROM booking_orders AS booking
    LEFT JOIN booking_service_locations AS location ON location.booking_order_id = booking.id
    INNER JOIN shops AS shop ON shop.id = booking.shop_id AND shop.deleted_at IS NULL AND ${scopePredicate(scope.admin1Code, scope.admin2Code)}
    WHERE booking.created_at >= ${window.fromInclusive}
      AND booking.created_at < ${window.toExclusive}
      AND booking.created_at <= ${EVALUATED_AT} AND booking.deleted_at IS NULL
    ORDER BY booking.created_at DESC, booking.id DESC LIMIT 20
  `);
  const activityRows = await transaction.$queryRaw<
    Array<{
      orderNo: string;
      status: string;
      serviceName: string;
      amountJpy: Prisma.Decimal;
      occurredAt: Date;
    }>
  >(Prisma.sql`
    SELECT booking.order_no AS orderNo, history.to_status AS status,
      COALESCE(booking.service_name_snapshot, ${"-"}) AS serviceName,
      CAST(booking.price_amount AS DECIMAL(65, 0)) AS amountJpy,
      history.created_at AS occurredAt
    FROM order_status_histories AS history
    INNER JOIN booking_orders AS booking ON booking.id = history.booking_order_id
      AND booking.deleted_at IS NULL
    LEFT JOIN booking_service_locations AS location ON location.booking_order_id = booking.id
    INNER JOIN shops AS shop ON shop.id = booking.shop_id AND shop.deleted_at IS NULL AND ${scopePredicate(scope.admin1Code, scope.admin2Code)}
    WHERE history.created_at >= ${window.fromInclusive}
      AND history.created_at < ${window.toExclusive}
      AND history.created_at <= ${EVALUATED_AT} AND history.deleted_at IS NULL
    ORDER BY history.created_at DESC, history.id DESC LIMIT 20
  `);
  const bucketTable = Prisma.join(
    trendWindow.buckets.map(
      (bucket: { key: string; label: string; fromInclusive: Date; toExclusive: Date }) =>
        Prisma.sql`SELECT ${bucket.key} AS bucket_key, ${bucket.label} AS label,
          ${bucket.fromInclusive} AS from_inclusive, ${bucket.toExclusive} AS to_exclusive`
    ),
    " UNION ALL "
  );
  const trendRows = await transaction.$queryRaw<
    Array<{
      key: string;
      label: string;
      orderCount: bigint;
      confirmedPaymentJpy: Prisma.Decimal;
      confirmedPaymentNdp: Prisma.Decimal;
      confirmedPaymentTestNdp: Prisma.Decimal;
    }>
  >(Prisma.sql`
    WITH buckets AS (${bucketTable}), eligible AS (
      SELECT booking.payment_confirmed_at, checkout.checkout_amount_jpy,
        checkout.payable_ndp, ledger.currency
      FROM booking_orders AS booking
      LEFT JOIN booking_service_locations AS location ON location.booking_order_id = booking.id
      INNER JOIN shops AS shop ON shop.id = booking.shop_id AND shop.deleted_at IS NULL AND ${scopePredicate(scope.admin1Code, scope.admin2Code)}
      INNER JOIN order_checkouts AS checkout
        ON checkout.booking_order_id = booking.id AND checkout.deleted_at IS NULL
      LEFT JOIN ledger_transactions AS ledger
        ON ledger.id = checkout.ledger_transaction_id AND ledger.deleted_at IS NULL
      WHERE booking.created_at <= ${EVALUATED_AT}
        AND booking.payment_confirmed_at <= ${EVALUATED_AT}
        AND booking.deleted_at IS NULL AND ${independentConfirmedPaymentEvidence()}
    )
    SELECT bucket.bucket_key AS \`key\`, bucket.label,
      (SELECT COUNT(booking.id) FROM booking_orders AS booking
       LEFT JOIN booking_service_locations AS location ON location.booking_order_id = booking.id
       INNER JOIN shops AS shop ON shop.id = booking.shop_id AND shop.deleted_at IS NULL AND ${scopePredicate(scope.admin1Code, scope.admin2Code)}
       WHERE booking.starts_at >= bucket.from_inclusive
         AND booking.starts_at < bucket.to_exclusive
         AND booking.created_at <= ${EVALUATED_AT} AND booking.deleted_at IS NULL) AS orderCount,
      COALESCE(SUM(eligible.checkout_amount_jpy), 0) AS confirmedPaymentJpy,
      COALESCE(SUM(CASE WHEN eligible.currency = ${"NDP"}
        THEN eligible.payable_ndp ELSE 0 END), 0) AS confirmedPaymentNdp,
      COALESCE(SUM(CASE WHEN eligible.currency = ${"TEST_NDP"}
        THEN eligible.payable_ndp ELSE 0 END), 0) AS confirmedPaymentTestNdp
    FROM buckets AS bucket LEFT JOIN eligible
      ON eligible.payment_confirmed_at >= bucket.from_inclusive
      AND eligible.payment_confirmed_at < bucket.to_exclusive
    GROUP BY bucket.bucket_key, bucket.label, bucket.from_inclusive, bucket.to_exclusive
    ORDER BY bucket.from_inclusive ASC
  `);
  const ranking = async (kind: "service" | "technician") => {
    const input = {
      kind,
      metric: "gmv" as const,
      window,
      evaluatedAt: EVALUATED_AT,
      city: null,
      categoryId: null,
      page: 1,
      pageSize: 10
    };
    return transaction.$queryRaw<
      Array<{
        rank: bigint;
        entityPublicId: string;
        displayName: string;
        avatarUrl: string | null;
        gmvJpy: Prisma.Decimal;
        completedCount: bigint;
      }>
    >(Prisma.sql`
      WITH ${runtime.AnalyticsRankingRepository.formalRankingCtes(input, {
        candidateJoins: Prisma.sql`LEFT JOIN booking_service_locations AS location
          ON location.booking_order_id = booking.id`,
        candidatePredicate: scopePredicate(scope.admin1Code, scope.admin2Code),
        entityPredicate: Prisma.sql`candidate.customer_is_test = FALSE
          AND candidate.technician_user_is_test = FALSE`
      })}, ${runtime.AnalyticsRankingRepository.rankingCtes(input)}
      SELECT ranking_position AS rank, entity_public_id AS entityPublicId,
        display_name AS displayName, avatar_url AS avatarUrl,
        gmv_jpy AS gmvJpy, completed_count AS completedCount
      FROM ranked_entities ORDER BY ranking_position ASC LIMIT 10
    `);
  };
  const [serviceRankingRows, technicianRankingRows, coverageRows] = await Promise.all([
    ranking("service"),
    ranking("technician"),
    transaction.$queryRaw<
      Array<{ total: bigint; attributed: Prisma.Decimal; unresolved: Prisma.Decimal }>
    >(
      Prisma.sql`
        SELECT COUNT(booking.id) AS total,
          COALESCE(SUM(location.resolution_status = ${"verified"}), 0) AS attributed,
          COALESCE(SUM(COALESCE(location.resolution_status, ${"unresolved"}) = ${"unresolved"}), 0) AS unresolved
        FROM booking_orders AS booking
        LEFT JOIN booking_service_locations AS location ON location.booking_order_id = booking.id
        INNER JOIN shops AS shop ON shop.id = booking.shop_id AND shop.deleted_at IS NULL AND ${scopePredicate(scope.admin1Code, scope.admin2Code)}
        WHERE booking.starts_at >= ${window.fromInclusive}
          AND booking.starts_at < ${window.toExclusive}
          AND booking.created_at <= ${EVALUATED_AT} AND booking.deleted_at IS NULL
      `
    )
  ]);
  const mapOrder = (row: (typeof activityRows)[number]) => ({
    orderNo: row.orderNo,
    status: row.status,
    serviceName: row.serviceName,
    amountJpy: numeric(row.amountJpy),
    occurredAt: new Date(row.occurredAt)
  });
  const mapRanking = (row: (typeof serviceRankingRows)[number]) => ({
    rank: numeric(row.rank),
    entityPublicId: row.entityPublicId,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    gmvJpy: numeric(row.gmvJpy),
    completedCount: numeric(row.completedCount)
  });
  const coverage = coverageRows[0]!;
  const total = numeric(coverage.total);
  const attributed = numeric(coverage.attributed);
  const unresolved = numeric(coverage.unresolved);
  return {
    evaluatedAt: EVALUATED_AT,
    scope,
    children: children.map((row) => ({
      code: row.code,
      name: row.name,
      orderCount: numeric(row.orderCount),
      confirmedPayments: {
        jpy: numeric(row.confirmedPaymentJpy),
        ndp: numeric(row.confirmedPaymentNdp),
        testNdp: numeric(row.confirmedPaymentTestNdp)
      }
    })),
    headline: {
      newOrders: numeric(headlineOrders?.newOrders),
      completedOrders: numeric(headlineOrders?.completedOrders),
      newCustomers: numeric(headlineEntities?.newCustomers),
      onboardedTechnicians: numeric(headlineEntities?.onboardedTechnicians)
    },
    confirmedPayments: {
      jpy: aggregate.confirmedPaymentJpy,
      ndp: aggregate.confirmedPaymentNdp,
      testNdp: aggregate.confirmedPaymentTestNdp
    },
    orders: {
      total: aggregate.totalOrders,
      serviceGmv: { jpy: aggregate.serviceGmvJpy, ndp: 0, testNdp: 0 },
      platformNetRevenue: {
        jpy: 0,
        ndp: aggregate.platformNetRevenueNdp,
        testNdp: aggregate.platformNetRevenueTestNdp
      },
      agentCommission: null
    },
    realtimeOrders: {
      list: realtimeRows.map(mapOrder),
      total: realtimeRows.length === 0 ? 0 : numeric(realtimeRows[0]!.totalCount),
      page: 1,
      page_size: 20
    },
    activity: activityRows.map(mapOrder),
    trend: trendRows.map((row) => ({
      key: row.key,
      label: row.label,
      orderCount: numeric(row.orderCount),
      confirmedPayments: {
        jpy: numeric(row.confirmedPaymentJpy),
        ndp: numeric(row.confirmedPaymentNdp),
        testNdp: numeric(row.confirmedPaymentTestNdp)
      }
    })),
    serviceRanking: serviceRankingRows.map(mapRanking),
    technicianRanking: technicianRankingRows.map(mapRanking),
    coverage: {
      total,
      attributed,
      unresolved,
      completenessPercent: total === 0 ? 100 : Math.round((attributed / total) * 100)
    }
  };
};

const exactKeys = (value: Record<string, unknown>, expected: string[]): boolean => {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
};

export const assertSsePrivacy = (
  body: string,
  expectedOrderNo: string,
  forbiddenSentinels: readonly string[]
): void => {
  for (const sentinel of forbiddenSentinels) {
    assertCondition(!body.includes(sentinel), "SSE leaked a private fixture sentinel");
  }
  const frames = body
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice("data: ".length)) as Record<string, unknown>);
  assertCondition(frames.length >= 3, "SSE did not emit connected, order, and invalidation frames");
  let sawExpectedOrder = false;
  for (const frame of frames) {
    const type = frame.type;
    assertCondition(
      exactKeys(
        frame,
        type === "connected"
          ? ["type", "scope", "payload", "createdAt"]
          : ["id", "type", "scope", "payload", "createdAt"]
      ),
      "SSE frame contains a non-allowlisted top-level field"
    );
    assertCondition(frame.scope && typeof frame.scope === "object", "SSE scope is missing");
    assertCondition(
      exactKeys(frame.scope as Record<string, unknown>, [
        "countryCode",
        "admin1Code",
        "admin2Code"
      ]),
      "SSE scope contains a non-allowlisted field"
    );
    assertCondition(frame.payload && typeof frame.payload === "object", "SSE payload is missing");
    const payload = frame.payload as Record<string, unknown>;
    if (type === "connected") {
      assertCondition(exactKeys(payload, []), "Connected SSE payload must be empty");
    } else if (type === "order.changed") {
      assertCondition(
        exactKeys(payload, ["orderNo", "status", "serviceName", "amountJpy"]),
        "Order SSE payload contains a non-allowlisted field"
      );
      sawExpectedOrder ||= payload.orderNo === expectedOrderNo;
    } else if (type === "metrics.invalidate") {
      assertCondition(
        exactKeys(payload, ["sections"]) && Array.isArray(payload.sections),
        "Invalidation SSE payload contains a non-allowlisted field"
      );
    } else {
      throw new Error("SSE emitted a non-allowlisted event type");
    }
  }
  assertCondition(sawExpectedOrder, "SSE omitted the allowlisted formal order number");
};

interface CacheLifecycleEntry {
  key: string;
  value: string | null;
  pttl: number;
  elapsedSincePopulationMs: number;
}

interface InvalidatedCacheEntry {
  key: string;
  value: string | null;
  generation: string | null;
}

export const assertCacheLifecycle = (
  populatedEntries: CacheLifecycleEntry[],
  invalidatedEntries: InvalidatedCacheEntry[],
  expectedKeys: string[],
  ttlSeconds: number
): void => {
  const expected = [...expectedKeys].sort();
  assertCondition(
    JSON.stringify(populatedEntries.map(({ key }) => key).sort()) === JSON.stringify(expected),
    "Cache lifecycle did not inspect every configured scope/period key"
  );
  assertCondition(
    populatedEntries.every(
      (entry) => entry.value !== null && entry.pttl > 0 && entry.pttl <= ttlSeconds * 1_000
    ),
    "Every scope/period cache entry must have the configured positive TTL"
  );
  assertCondition(
    populatedEntries.every(
      (entry) =>
        entry.pttl >=
        Math.max(
          1,
          ttlSeconds * 1_000 - entry.elapsedSincePopulationMs - CACHE_TTL_MEASUREMENT_TOLERANCE_MS
        )
    ),
    "Every scope/period cache entry must remain within the configured TTL tolerance"
  );
  assertCondition(
    JSON.stringify(invalidatedEntries.map(({ key }) => key).sort()) === JSON.stringify(expected),
    "Cache invalidation did not inspect every configured scope/period key"
  );
  assertCondition(
    invalidatedEntries.every((entry) => entry.value === null && entry.generation === "1"),
    "Redis generation fence did not invalidate all ancestor cache scopes"
  );
};

const scanRunKeys = async (client: RedisCleanupClient, pattern: string): Promise<string[]> => {
  let cursor = "0";
  const keys: string[] = [];
  do {
    const result = (await client.sendCommand([
      "SCAN",
      cursor,
      "MATCH",
      pattern,
      "COUNT",
      "100"
    ])) as unknown;
    assertCondition(Array.isArray(result) && result.length === 2, "Redis SCAN response is invalid");
    cursor = String(result[0]);
    assertCondition(Array.isArray(result[1]), "Redis SCAN keys are invalid");
    keys.push(...result[1].map(String));
  } while (cursor !== "0");
  return [...new Set(keys)].sort();
};

const runFormalFlow = async (
  transaction: Prisma.TransactionClient,
  marker: string,
  redisNamespace: string,
  cacheClient: RedisClient,
  runtime: Awaited<ReturnType<typeof loadRuntime>>,
  repositoryRoot: string
): Promise<{ evidence: SectionEvidence; eventIds: string[]; streamKey: string }> => {
  const facade = createTransactionBoundPrismaFacade(transaction) as unknown as PrismaClient;
  const schema = await schemaEvidence(transaction, repositoryRoot);
  const fixture = await createFixture(transaction, facade, marker, runtime);
  const regions = new runtime.AdministrativeRegionRepository(facade);
  const cacheAdapter = {
    get isOpen() {
      return cacheClient.isOpen;
    },
    connect: () => cacheClient.connect(),
    get: (key: string) => cacheClient.get(`${redisNamespace}:${key}`),
    sendCommand: (command: string[]) =>
      cacheClient.sendCommand(
        command.map((value) =>
          value.startsWith("dashboard:live:v1:") ? `${redisNamespace}:${value}` : value
        )
      )
  };
  const cache = new runtime.LiveDashboardCache(
    () => cacheAdapter,
    () => EVALUATED_AT
  );
  const audit = new runtime.AuditLogService(new runtime.AuditLogRepository(facade));
  const repository = new runtime.LiveDashboardRepository(facade);
  const service = new runtime.LiveDashboardService(
    repository,
    regions,
    cache,
    audit,
    () => EVALUATED_AT
  );
  const actor: AuthenticatedAccessContext = {
    userId: (
      await transaction.user.findFirstOrThrow({
        where: { email: `${marker}.operator@formal.invalid` },
        select: { id: true }
      })
    ).id,
    email: `${marker}.operator@formal.invalid`,
    accessTokenJti: marker,
    accessTokenExpiresAt: Math.floor(EVALUATED_AT.getTime() / 1000) + 900,
    currentIdentityType: "platform_admin",
    currentIdentityScopeType: "global",
    roles: ["operations"],
    permissions: ["backoffice:dashboard:read"]
  };
  const context: AuthRequestContext = { ip: "127.0.0.1", userAgent: marker };
  const scopeQueries = [
    { label: "JP", country: "JP" as const },
    { label: "Tokyo", country: "JP" as const, admin1: "13" },
    {
      label: "Shinjuku",
      country: "JP" as const,
      admin1: "13",
      admin2: "13104"
    }
  ];
  const queries = scopeQueries.flatMap((scope) =>
    (["today", "last7days", "last30days"] as const).map((period) => ({
      ...scope,
      cacheLabel: `${scope.label}:${period}`,
      period
    }))
  );
  const snapshots: Array<{
    label: string;
    period: "today" | "last7days" | "last30days";
    first: LiveDashboardSnapshotResponse;
    second: LiveDashboardSnapshotResponse;
    directFacts: LiveDashboardSnapshotFacts;
    directAggregate: AggregateEvidence | null;
  }> = [];
  const allPeriodCacheState: CacheLifecycleEntry[] = [];
  for (const query of queries) {
    const first = await service.getSnapshot(actor, context, query, "ja");
    const populationCompletedAt = Date.now();
    const second = await service.getSnapshot(actor, context, query, "ja");
    const cacheKey = `${redisNamespace}:dashboard:live:v1:${query.country}:${query.admin1 ?? "-"}:${
      query.admin2 ?? "-"
    }:${query.period}`;
    const cacheValue = await cacheClient.get(cacheKey);
    const cachePttl = await cacheClient.pTTL(cacheKey);
    allPeriodCacheState.push({
      key: cacheKey,
      value: cacheValue,
      pttl: cachePttl,
      elapsedSincePopulationMs: Date.now() - populationCompletedAt
    });
    const directFacts = await independentDirectSnapshot(
      transaction,
      runtime,
      {
        countryCode: "JP",
        admin1Code: query.admin1 ?? null,
        admin2Code: query.admin2 ?? null
      },
      query.period
    );
    const aggregate =
      query.period === "today"
        ? {
            totalOrders: directFacts.orders.total,
            serviceGmvJpy: directFacts.orders.serviceGmv.jpy,
            confirmedPaymentJpy: directFacts.confirmedPayments.jpy,
            confirmedPaymentNdp: directFacts.confirmedPayments.ndp,
            confirmedPaymentTestNdp: directFacts.confirmedPayments.testNdp,
            platformNetRevenueNdp: directFacts.orders.platformNetRevenue.ndp,
            platformNetRevenueTestNdp: directFacts.orders.platformNetRevenue.testNdp
          }
        : null;
    assertCondition(
      first.cacheStatus === "miss",
      `${query.cacheLabel} initial cache status must be miss`
    );
    assertCondition(
      second.cacheStatus === "hit",
      `${query.cacheLabel} repeated cache status must be hit`
    );
    assertCompleteSnapshotParity(second, directFacts, query.cacheLabel);
    if (aggregate) assertAggregateParity(second, aggregate, query.label);
    snapshots.push({
      label: query.label,
      period: query.period,
      first,
      second,
      directFacts,
      directAggregate: aggregate
    });
  }
  const todaySnapshots = snapshots.filter((snapshot) => snapshot.period === "today");
  assertCondition(
    todaySnapshots[0]!.second.coverage.unresolved >= 1,
    "Nationwide coverage must retain the unresolved fixture"
  );
  assertCondition(
    todaySnapshots[1]!.second.coverage.unresolved === 0 &&
      todaySnapshots[2]!.second.coverage.unresolved === 0,
    "Narrow scopes must exclude unresolved locations"
  );

  const streamKey = `${redisNamespace}:needo:dashboard:live:stream:v1`;
  const channel = `${redisNamespace}:needo:dashboard:live:v1`;
  const streamClient = runtime.createRedisClient();
  const publisher = runtime.createRedisClient();
  const subscriber = runtime.createRedisClient();
  const eventBus = new runtime.RedisRealtimeEventBus({ channel, publisher, subscriber });
  const eventStream = new runtime.RedisLiveDashboardEventStream({
    key: streamKey,
    client: streamClient,
    eventBus
  });
  const eventErrors: string[] = [];
  const gateway = new runtime.LiveDashboardEventGateway({
    eventStream,
    cache,
    now: () => EVALUATED_AT,
    onError: (_error: unknown, operation: string) => eventErrors.push(operation)
  });
  const response = new SseResponse();
  let unsubscribe: (() => void) | undefined;
  const eventIds: string[] = [];
  try {
    unsubscribe = await gateway.subscribe(
      { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      null,
      response as unknown as Response
    );
    const orderEvent = await gateway.publish({
      type: "order.changed",
      scope: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      payload: {
        orderNo: fixture.orderNumbers[0]!,
        status: "completed",
        serviceName: "Formal service",
        amountJpy: 12_000
      }
    });
    const invalidateEvent = await gateway.publish({
      type: "metrics.invalidate",
      scope: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      payload: { sections: ["headline", "orders", "trend", "rankings"] }
    });
    assertCondition(orderEvent && invalidateEvent, "Formal Redis event publication failed");
    eventIds.push(orderEvent.id, invalidateEvent.id);
    assertCondition(
      compareStreamIds(orderEvent.id, invalidateEvent.id) < 0,
      "Stream IDs are unordered"
    );
    const replay = await eventStream.readRetained(orderEvent.id);
    assertCondition(
      replay.status === "ready" && replay.entries.some((entry) => entry.id === invalidateEvent.id),
      "SSE replay did not return the retained successor event"
    );
    const reset = await eventStream.readRetained("1-0");
    assertCondition(
      reset.status === "reset_required",
      "Expired SSE cursor must require a 409 reset"
    );
    await new Promise((resolveHeartbeat) => setTimeout(resolveHeartbeat, 30_050));
    const body = response.chunks.join("");
    assertCondition(response.statusCode === 200, "SSE response status must be 200");
    assertCondition(body.includes("retry: 5000"), "SSE retry cadence is missing");
    assertCondition(body.includes(": heartbeat"), "SSE 30-second heartbeat is missing");
    assertCondition(body.includes("event: order.changed"), "SSE order event is missing");
    assertCondition(
      body.includes("event: metrics.invalidate"),
      "SSE invalidation event is missing"
    );
    assertSsePrivacy(body, fixture.orderNumbers[0]!, fixture.forbiddenSentinels);
    assertCondition(eventErrors.length === 0, "Live dashboard event gateway reported an error");
  } finally {
    unsubscribe?.();
    await gateway.close();
  }

  const invalidatedKeys = queries.map(
    (query) =>
      `${redisNamespace}:dashboard:live:v1:${query.country}:${query.admin1 ?? "-"}:${
        query.admin2 ?? "-"
      }:${query.period}`
  );
  const invalidationState = await Promise.all(
    invalidatedKeys.map(async (key) => ({
      key,
      value: await cacheClient.get(key),
      generation: await cacheClient.get(`${key}:generation`)
    }))
  );
  assertCacheLifecycle(
    allPeriodCacheState,
    invalidationState,
    invalidatedKeys,
    runtime.LIVE_DASHBOARD_CACHE_TTL_SECONDS
  );
  return {
    evidence: {
      schema,
      bookingLocation: {
        storeOrderId: fixture.storeOrderId,
        homeOrderId: fixture.homeOrderId,
        unresolvedOrderId: fixture.unresolvedOrderId,
        snapshots: fixture.immutableLocations,
        immutableAfterShopLocationMutation: true
      },
      regionalAggregates: Object.fromEntries(
        todaySnapshots.map((entry) => [
          entry.label,
          { ...entry.directAggregate, completeSnapshotSectionsMatched: true }
        ])
      ),
      financeSeparation: {
        ndp: todaySnapshots[2]!.directAggregate!.confirmedPaymentNdp,
        testNdp: todaySnapshots[2]!.directAggregate!.confirmedPaymentTestNdp,
        platformNetRevenueNdp: todaySnapshots[2]!.directAggregate!.platformNetRevenueNdp,
        platformNetRevenueTestNdp: todaySnapshots[2]!.directAggregate!.platformNetRevenueTestNdp,
        exactParityWithFormalSnapshots: true
      },
      cache: {
        statuses: snapshots.map((entry) => ({
          scope: entry.label,
          period: entry.period,
          initial: entry.first.cacheStatus,
          repeated: entry.second.cacheStatus
        })),
        namespace: redisNamespace,
        ttlSeconds: runtime.LIVE_DASHBOARD_CACHE_TTL_SECONDS,
        populatedEntries: allPeriodCacheState.map(({ key, pttl }) => ({ key, pttl })),
        ancestorGenerationFence: invalidationState
      },
      sse: {
        channel,
        streamKey,
        eventIds,
        strictlyOrdered: true,
        replayedSuccessor: true,
        staleCursorResetRequired: true,
        retryMilliseconds: 5_000,
        heartbeatMilliseconds: 30_000,
        privateFieldsAbsent: true
      }
    },
    eventIds,
    streamKey
  };
};

export const cleanupRedis = async (
  client: RedisCleanupClient,
  redisNamespace: string,
  streamKey: string | undefined,
  eventIds: string[]
): Promise<{
  deletedStreamEntries: number | null;
  deletedKeys: number | null;
  remainingKeys: string[] | null;
  cleanupFailures: string[];
}> => {
  const cleanupFailures: string[] = [];
  if (!client.isOpen) {
    try {
      await client.connect();
    } catch (error) {
      cleanupFailures.push(
        `connect:${redactCheckerError(error instanceof Error ? error.message : "unknown")}`
      );
    }
  }
  let deletedStreamEntries: number | null = 0;
  if (streamKey && eventIds.length > 0) {
    try {
      deletedStreamEntries = await client.xDel(streamKey, eventIds);
    } catch (error) {
      deletedStreamEntries = null;
      cleanupFailures.push(
        `xdel:${redactCheckerError(error instanceof Error ? error.message : "unknown")}`
      );
    }
  }
  let keys: string[] | null = null;
  try {
    keys = await scanRunKeys(client, `${redisNamespace}:*`);
  } catch (error) {
    cleanupFailures.push(
      `scan-before-delete:${redactCheckerError(error instanceof Error ? error.message : "unknown")}`
    );
  }
  let deletedKeys: number | null = keys === null ? null : 0;
  if (keys && keys.length > 0) {
    try {
      deletedKeys = await client.del(keys);
    } catch (error) {
      deletedKeys = null;
      cleanupFailures.push(
        `delete:${redactCheckerError(error instanceof Error ? error.message : "unknown")}`
      );
    }
  }
  let remainingKeys: string[] | null = null;
  try {
    remainingKeys = await scanRunKeys(client, `${redisNamespace}:*`);
    if (remainingKeys.length > 0) cleanupFailures.push(`remaining-keys:${remainingKeys.length}`);
  } catch (error) {
    cleanupFailures.push(
      `scan-after-delete:${redactCheckerError(error instanceof Error ? error.message : "unknown")}`
    );
  }
  return { deletedStreamEntries, deletedKeys, remainingKeys, cleanupFailures };
};

export const buildDeterministicRunMarker = (runId: string | undefined): string => {
  const normalized = runId?.trim();
  if (!normalized) throw new Error("LIVE_DASHBOARD_CHECK_RUN_ID is required");
  if (!/^[a-z0-9][a-z0-9-]{5,31}$/u.test(normalized)) {
    throw new Error("LIVE_DASHBOARD_CHECK_RUN_ID must be a lowercase deterministic token");
  }
  return `ld8-${sha256(normalized).slice(0, 12)}`;
};

export const redactCheckerError = (value: string): string =>
  value.replace(/(?:mysql|rediss?):\/\/[^\s"']+/giu, "[redacted-url]");

class CheckerCombinedFailure extends Error {
  public constructor(
    public readonly primaryFailure: string | null,
    public readonly cleanupFailures: string[]
  ) {
    super("Live dashboard formal checker failed");
  }
}

const main = async (): Promise<void> => {
  const authority = loadLiveDashboardCheckerAuthority(process.env);
  Object.assign(process.env, authority.values, { ENV_FILE: authority.envFilePath });
  const repositoryRoot = realpathSync(resolve(__dirname, "../.."));
  const marker = buildDeterministicRunMarker(process.env.LIVE_DASHBOARD_CHECK_RUN_ID);
  const redisNamespace = `${marker}:run`;
  const runtime = await loadRuntime();
  const cacheClient = runtime.createRedisClient();
  let evidence: SectionEvidence | undefined;
  let eventIds: string[] = [];
  let streamKey: string | undefined;
  let rollbackCaught = false;
  let redisCleanup: Awaited<ReturnType<typeof cleanupRedis>> | undefined;
  let databaseResidue = -1;
  let primaryFailure: unknown;
  const cleanupFailures: string[] = [];
  let ownsRedisNamespace = false;
  try {
    if (!cacheClient.isOpen) await cacheClient.connect();
    const preexistingRedisKeys = await scanRunKeys(cacheClient, `${redisNamespace}:*`);
    assertCondition(
      preexistingRedisKeys.length === 0,
      "LIVE_DASHBOARD_CHECK_RUN_ID collides with an existing Redis namespace"
    );
    const preexistingDatabaseRows =
      (await runtime.prisma.user.count({ where: { email: { startsWith: `${marker}.` } } })) +
      (await runtime.prisma.bookingOrder.count({ where: { orderNo: { startsWith: marker } } }));
    assertCondition(
      preexistingDatabaseRows === 0,
      "LIVE_DASHBOARD_CHECK_RUN_ID collides with existing database fixtures"
    );
    ownsRedisNamespace = true;
    try {
      await runtime.prisma.$transaction(
        async (transaction: Prisma.TransactionClient) => {
          const flow = await runFormalFlow(
            transaction,
            marker,
            redisNamespace,
            cacheClient,
            runtime,
            repositoryRoot
          );
          evidence = flow.evidence;
          eventIds = flow.eventIds;
          streamKey = flow.streamKey;
          throw new LiveDashboardRollbackSentinel();
        },
        {
          maxWait: 10_000,
          timeout: 120_000,
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead
        }
      );
    } catch (error) {
      if (!(error instanceof LiveDashboardRollbackSentinel)) throw error;
      rollbackCaught = true;
    }
    assertCondition(rollbackCaught && evidence, "Private rollback sentinel was not caught");
  } catch (error) {
    primaryFailure = error;
  }

  if (ownsRedisNamespace) {
    try {
      redisCleanup = await cleanupRedis(cacheClient, redisNamespace, streamKey, eventIds);
      cleanupFailures.push(...redisCleanup.cleanupFailures.map((failure) => `redis:${failure}`));
    } catch (error) {
      cleanupFailures.push(
        `redis:${redactCheckerError(error instanceof Error ? error.message : "unknown")}`
      );
    }
  }
  try {
    databaseResidue =
      (await runtime.prisma.user.count({ where: { email: { startsWith: `${marker}.` } } })) +
      (await runtime.prisma.bookingOrder.count({ where: { orderNo: { startsWith: marker } } })) +
      (await runtime.prisma.category.count({ where: { code: { startsWith: marker } } })) +
      (await runtime.prisma.shop.count({ where: { name: { startsWith: marker } } })) +
      (await runtime.prisma.auditLog.count({ where: { userAgent: marker } }));
    if (databaseResidue !== 0) cleanupFailures.push(`database:residue:${databaseResidue}`);
  } catch (error) {
    cleanupFailures.push(
      `database:${redactCheckerError(error instanceof Error ? error.message : "unknown")}`
    );
  }
  try {
    if (cacheClient.isOpen) await cacheClient.quit();
  } catch (error) {
    cleanupFailures.push(
      `redis-close:${redactCheckerError(error instanceof Error ? error.message : "unknown")}`
    );
  }
  try {
    await runtime.disconnectPrisma();
  } catch (error) {
    cleanupFailures.push(
      `database-close:${redactCheckerError(error instanceof Error ? error.message : "unknown")}`
    );
  }

  const databaseStatus = databaseResidue === 0 ? "clean" : "unverified";
  const redisStatus =
    redisCleanup?.remainingKeys?.length === 0
      ? "clean"
      : ownsRedisNamespace
        ? "unverified"
        : "not-owned";
  const cleanupVerified =
    databaseStatus === "clean" && redisStatus === "clean" && cleanupFailures.length === 0;
  if (!cleanupVerified && cleanupFailures.length === 0) {
    cleanupFailures.push(`verification:database=${databaseStatus},redis=${redisStatus}`);
  }
  jsonSection({
    section: "cleanup",
    status: cleanupVerified ? "passed" : "failed",
    database: databaseStatus,
    redis: redisStatus,
    databaseResidue,
    redisDeletedStreamEntries: redisCleanup?.deletedStreamEntries ?? null,
    redisDeletedKeys: redisCleanup?.deletedKeys ?? null,
    redisRemainingKeys: redisCleanup?.remainingKeys ?? null,
    cleanupFailures
  });

  if (primaryFailure || cleanupFailures.length > 0) {
    throw new CheckerCombinedFailure(
      primaryFailure
        ? redactCheckerError(
            primaryFailure instanceof Error ? primaryFailure.message : "Unknown primary failure"
          )
        : null,
      cleanupFailures
    );
  }

  assertCondition(evidence && redisCleanup, "Formal evidence is incomplete after cleanup");

  jsonSection({ section: "schema", status: "passed", ...evidence.schema });
  jsonSection({
    section: "bookingLocation",
    status: "passed",
    ...evidence.bookingLocation
  });
  jsonSection({
    section: "regionalAggregates",
    status: "passed",
    ...evidence.regionalAggregates
  });
  jsonSection({
    section: "financeSeparation",
    status: "passed",
    ...evidence.financeSeparation
  });
  jsonSection({ section: "cache", status: "passed", ...evidence.cache });
  jsonSection({ section: "sse", status: "passed", ...evidence.sse });
  jsonSection({
    section: "final",
    status: "passed",
    target: {
      databaseHost: authority.databaseHost,
      databaseName: authority.databaseName,
      redisHost: authority.redisHost,
      redisDatabase: authority.redisDatabase
    },
    runId: marker,
    rollback: true,
    cleanup: { database: "clean", redis: "clean" }
  });
};

if (require.main === module) {
  void main().catch((error: unknown) => {
    if (error instanceof CheckerCombinedFailure) {
      jsonSection({
        section: "final",
        status: "failed",
        primaryFailure: error.primaryFailure,
        cleanupFailures: error.cleanupFailures
      });
    } else {
      const message = error instanceof Error ? error.message : "Unknown formal checker failure";
      jsonSection({ section: "final", status: "failed", message: redactCheckerError(message) });
    }
    process.exitCode = 1;
  });
}
