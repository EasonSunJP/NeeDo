import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import type { PrismaClient as PrismaClientType } from "@prisma/client";
import mariadb, { type Connection, type ConnectionConfig } from "mariadb";
import { requireSafeExchangeClaimFlowEnvironment } from "./support/exchange-claim-flow-safety";
import {
  resolveExchangeCancellationAdminCredentials,
  validateExchangeCancellationBaseEnvironment,
  verifyExchangeCancellationSocketAdmin
} from "./check-exchange-cancellation-flow";

const MIGRATION = "20260905180000_exchange_intelligence_booking";
const migrationCommand = "prisma migrate deploy";

const reject = async (operation: () => Promise<unknown>, label: string): Promise<void> => {
  let error: unknown;
  try {
    await operation();
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof Error, `${label}: expected rejection`);
};

const scratchUrl = (
  base: URL,
  database: string,
  credentials?: { username: string; password: string }
): string => {
  const next = new URL(base.toString());
  next.pathname = `/${database}`;
  if (credentials) {
    next.username = credentials.username;
    next.password = credentials.password;
  }
  return next.toString();
};

const adminConnectionOptions = (
  base: URL,
  credentials: { user: string; password?: string; socketPath?: string }
): ConnectionConfig => ({
  ...(!credentials.socketPath
    ? {
        host: base.hostname === "[::1]" ? "::1" : base.hostname,
        ...(base.port ? { port: Number(base.port) } : {})
      }
    : { socketPath: credentials.socketPath }),
  user: credentials.user,
  ...(credentials.password ? { password: credentials.password } : {}),
  ...(process.env.DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL === "true"
    ? { allowPublicKeyRetrieval: true }
    : {}),
  connectTimeout: 5_000,
  timezone: "Z"
});

const runFullMigrationChain = (databaseUrl: string, envFile: string): void => {
  const result = spawnSync("npm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: resolve(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: databaseUrl, ENV_FILE: envFile },
    encoding: "utf8",
    timeout: 180_000
  });
  assert.equal(
    result.status,
    0,
    `${migrationCommand} failed: ${(result.stderr || result.stdout).trim()}`
  );
};

const verifyPhysicalSchema = async (connection: Connection, database: string): Promise<void> => {
  const migrations = await connection.query<Array<Record<string, unknown>>>(
    "SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations WHERE migration_name = ?",
    [MIGRATION]
  );
  assert.equal(migrations.length, 1, "feature migration history is missing");
  assert(migrations[0]?.finished_at, "feature migration is unfinished");
  assert.equal(migrations[0]?.rolled_back_at, null, "feature migration is rolled back");

  const columns = await connection.query<Array<{ tableName: string; columnName: string }>>(
    `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND (
       (TABLE_NAME = 'exchange_intelligences' AND COLUMN_NAME IN
         ('service_id','technician_service_id','service_name_snapshot','service_duration_snapshot'))
       OR
       (TABLE_NAME = 'booking_orders' AND COLUMN_NAME IN
         ('exchange_intelligence_post_id','create_idempotency_key','create_request_fingerprint'))
     )`,
    [database]
  );
  assert.equal(columns.length, 7, "feature columns are not physically complete");

  const checks = await connection.query<Array<{ constraintName: string }>>(
    `SELECT CONSTRAINT_NAME AS constraintName FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND CONSTRAINT_TYPE = 'CHECK'
       AND CONSTRAINT_NAME = 'exchange_intelligences_service_binding_check'`,
    [database]
  );
  assert.equal(checks.length, 1, "exchange_intelligences_service_binding_check is missing");

  const indexes = await connection.query<Array<{ indexName: string }>>(
    `SELECT DISTINCT INDEX_NAME AS indexName FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND INDEX_NAME IN
       ('exchange_intelligences_service_deleted_idx',
        'exchange_intelligences_technician_service_deleted_idx',
        'booking_orders_exchange_intelligence_created_idx',
        'booking_orders_customer_create_idempotency_key')`,
    [database]
  );
  assert.equal(indexes.length, 4, "feature indexes are not physically complete");

  const foreignKeys = await connection.query<
    Array<{ constraintName: string; deleteRule: string; updateRule: string }>
  >(
    `SELECT CONSTRAINT_NAME AS constraintName, DELETE_RULE AS deleteRule, UPDATE_RULE AS updateRule
     FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND CONSTRAINT_NAME IN
       ('exchange_intelligences_service_fkey',
        'exchange_intelligences_technician_service_fkey',
        'booking_orders_exchange_intelligence_fkey')`,
    [database]
  );
  assert.equal(foreignKeys.length, 3, "feature foreign keys are not physically complete");
  assert(
    foreignKeys.every((row) => row.deleteRule === "RESTRICT" && row.updateRule === "RESTRICT"),
    "feature foreign keys must use RESTRICT"
  );
};

async function main(): Promise<void> {
  const target = requireSafeExchangeClaimFlowEnvironment(process.env.FORMAL_BACKEND_ENV_FILE);
  const baseEnvironment = validateExchangeCancellationBaseEnvironment({
    envFile: target.envFile
  });
  process.env.ENV_FILE = target.envFile;
  process.env.AUTH_TOKEN_AUDIENCE ||= "needo-local-intelligence-check";
  const base = new URL(process.env.DATABASE_URL!);
  const suffix = randomBytes(10).toString("hex");
  const database = `needo_intelligence_check_${suffix}`;
  const scratchUsername = `neib_${suffix}`;
  const scratchPassword = randomBytes(24).toString("base64url");
  assert(/^needo_intelligence_check_[a-f0-9]{20}$/u.test(database));
  assert(/^neib_[a-f0-9]{20}$/u.test(scratchUsername));
  const databaseUrl = scratchUrl(base, database, {
    username: scratchUsername,
    password: scratchPassword
  });
  const adminCredentials = resolveExchangeCancellationAdminCredentials(
    baseEnvironment.parsedEnvironment,
    process.env
  );
  const admin = await mariadb.createConnection(adminConnectionOptions(base, adminCredentials));
  if (adminCredentials.socketPath) await verifyExchangeCancellationSocketAdmin(admin);
  let prisma: Awaited<typeof import("../src/prisma/client")>["prisma"] | undefined;
  const concurrencyClients: PrismaClientType[] = [];
  let created = false;
  let userCreated = false;
  let report: Record<string, unknown> | undefined;

  try {
    await admin.query(
      `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    created = true;
    const principal = `${admin.escape(scratchUsername)}@${admin.escape("localhost")}`;
    await admin.query(`CREATE USER ${principal} IDENTIFIED BY ${admin.escape(scratchPassword)}`);
    userCreated = true;
    await admin.query(`GRANT ALL PRIVILEGES ON \`${database}\`.* TO ${principal}`);
    runFullMigrationChain(databaseUrl, target.envFile);
    await admin.query(`USE \`${database}\``);
    await verifyPhysicalSchema(admin, database);

    process.env.DATABASE_URL = databaseUrl;
    const [
      { prisma: client },
      { ExchangePostRepository },
      { ExchangeService },
      { BookingRepository },
      { BookingService },
      { RealtimeRepository },
      { RealtimeService },
      { hashRouteAddress, shopAddressToJapaneseRouteAddress },
      { bookingCreateBodySchema },
      { PrismaClient },
      { PrismaMariaDb }
    ] = await Promise.all([
      import("../src/prisma/client"),
      import("../src/repositories/exchange.repository"),
      import("../src/services/exchange.service"),
      import("../src/repositories/booking.repository"),
      import("../src/services/booking.service"),
      import("../src/repositories/realtime.repository"),
      import("../src/services/realtime.service"),
      import("../src/services/route-estimate.service"),
      import("../src/validators/booking.validator"),
      import("@prisma/client"),
      import("@prisma/adapter-mariadb")
    ]);
    prisma = client;
    const now = new Date();
    const atHours = (hours: number) => new Date(now.getTime() + hours * 60 * 60 * 1_000);
    const createUser = (label: string, sequence: number) =>
      client.user.create({
        data: {
          needoId: `needo-check-${sequence}`,
          email: `intelligence-${label}-${database}@needo.test`,
          username: `Intelligence ${label}`,
          emailVerifiedAt: now,
          isTestAccount: true
        }
      });
    const [customerUser, shopOwnerUser, technicianUser] = await Promise.all([
      createUser("customer", 1),
      createUser("shop-owner", 2),
      createUser("technician", 3)
    ]);
    const customerProfile = await client.customerProfile.create({
      data: {
        userId: customerUser.id,
        displayName: "Intelligence Customer",
        city: "Tokyo",
        membershipLevel: "black"
      }
    });
    const [shop, technicianShop] = await Promise.all([
      client.shop.create({
        data: {
          ownerUserId: shopOwnerUser.id,
          name: "Intelligence Formal Shop",
          city: "Tokyo",
          address: "東京都渋谷区1-1",
          status: "published",
          pricingMode: "MERCHANT"
        }
      }),
      client.shop.create({
        data: {
          ownerUserId: technicianUser.id,
          name: "Intelligence Technician Shop",
          city: "Tokyo",
          address: "東京都新宿区2-2",
          status: "published",
          pricingMode: "TECHNICIAN"
        }
      })
    ]);
    const tokyoRegion = await client.administrativeRegion.create({
      data: {
        countryCode: "JP",
        officialCode: "13",
        level: "ADMIN1",
        source: "NeeDo intelligence booking checker",
        sourceVersion: "N03-20260101"
      }
    });
    const [shibuyaRegion, shinjukuRegion] = await Promise.all([
      client.administrativeRegion.create({
        data: {
          countryCode: "JP",
          officialCode: "13113",
          level: "ADMIN2",
          parentId: tokyoRegion.id,
          source: "NeeDo intelligence booking checker",
          sourceVersion: "N03-20260101"
        }
      }),
      client.administrativeRegion.create({
        data: {
          countryCode: "JP",
          officialCode: "13104",
          level: "ADMIN2",
          parentId: tokyoRegion.id,
          source: "NeeDo intelligence booking checker",
          sourceVersion: "N03-20260101"
        }
      })
    ]);
    await Promise.all([
      client.administrativeRegionLocale.create({
        data: { regionId: tokyoRegion.id, locale: "JA", name: "東京都" }
      }),
      client.administrativeRegionLocale.create({
        data: { regionId: shibuyaRegion.id, locale: "JA", name: "渋谷区" }
      }),
      client.administrativeRegionLocale.create({
        data: { regionId: shinjukuRegion.id, locale: "JA", name: "新宿区" }
      })
    ]);
    await client.shopServiceLocation.createMany({
      data: [
        {
          shopId: shop.id,
          countryCode: "JP",
          admin1RegionId: tokyoRegion.id,
          admin2RegionId: shibuyaRegion.id,
          datasetVersion: "N03-20260101",
          verifiedAt: now,
          verifiedById: shopOwnerUser.id
        },
        {
          shopId: technicianShop.id,
          countryCode: "JP",
          admin1RegionId: tokyoRegion.id,
          admin2RegionId: shinjukuRegion.id,
          datasetVersion: "N03-20260101",
          verifiedAt: now,
          verifiedById: technicianUser.id
        }
      ]
    });
    const technicianProfile = await client.technicianProfile.create({
      data: {
        userId: technicianUser.id,
        shopId: technicianShop.id,
        displayName: "Intelligence Technician",
        city: "Tokyo",
        serviceArea: "新宿区",
        serviceAreasJson: ["新宿区", "渋谷区"],
        status: "published",
        visibility: "public",
        yearsExperience: 8
      }
    });
    const [customerIdentity, shopIdentity, technicianIdentity] = await Promise.all([
      client.userIdentity.create({
        data: {
          userId: customerUser.id,
          type: "customer",
          scopeType: "customer_profile",
          scopeId: customerProfile.id,
          displayName: "Intelligence Customer",
          isDefault: true,
          activeKey: `${database}:customer`
        }
      }),
      client.userIdentity.create({
        data: {
          userId: shopOwnerUser.id,
          type: "merchant_owner",
          scopeType: "shop",
          scopeId: shop.id,
          displayName: "Intelligence Shop Owner",
          isDefault: true,
          activeKey: `${database}:shop`
        }
      }),
      client.userIdentity.create({
        data: {
          userId: technicianUser.id,
          type: "technician",
          scopeType: "technician_profile",
          scopeId: technicianProfile.id,
          displayName: "Intelligence Technician",
          isDefault: true,
          activeKey: `${database}:technician`
        }
      })
    ]);
    const [customerPublic, shopOwnerPublic, technicianPublic] = await Promise.all([
      client.publicIdentifier.create({
        data: {
          publicId: "u9000000001",
          numberPart: "9000000001",
          kind: "U",
          userIdentityId: customerIdentity.id,
          status: "ACTIVE"
        }
      }),
      client.publicIdentifier.create({
        data: {
          publicId: "s9000000002",
          numberPart: "9000000002",
          kind: "S",
          userIdentityId: shopIdentity.id,
          status: "ACTIVE"
        }
      }),
      client.publicIdentifier.create({
        data: {
          publicId: "s9000000003",
          numberPart: "9000000003",
          kind: "S",
          userIdentityId: technicianIdentity.id,
          status: "ACTIVE"
        }
      })
    ]);
    const [shopPublic, technicianShopPublic] = await Promise.all([
      client.publicIdentifier.create({
        data: {
          publicId: "shop9000000004",
          numberPart: "9000000004",
          kind: "SHOP",
          shopId: shop.id,
          status: "ACTIVE"
        }
      }),
      client.publicIdentifier.create({
        data: {
          publicId: "shop9000000005",
          numberPart: "9000000005",
          kind: "SHOP",
          shopId: technicianShop.id,
          status: "ACTIVE"
        }
      })
    ]);
    assert(
      customerPublic && shopOwnerPublic && technicianPublic && shopPublic && technicianShopPublic
    );
    const category = await client.category.create({
      data: { code: `${database}-category`, name: "Formal Care", isActive: true }
    });
    const [shopService, homeService, technicianSourceService] = await Promise.all([
      client.service.create({
        data: {
          categoryId: category.id,
          shopId: shop.id,
          name: "Formal Shop Care",
          description: "Formal shop service description",
          city: "Tokyo",
          serviceMode: "store",
          priceAmount: 12_000,
          currency: "JPY",
          durationMinutes: 60,
          status: "published"
        }
      }),
      client.service.create({
        data: {
          categoryId: category.id,
          shopId: shop.id,
          name: "Formal Home Care",
          description: "Formal onsite Intelligence service description",
          city: "Tokyo",
          serviceMode: "home",
          priceAmount: 14_000,
          currency: "JPY",
          durationMinutes: 60,
          status: "published"
        }
      }),
      client.service.create({
        data: {
          categoryId: category.id,
          shopId: technicianShop.id,
          technicianProfileId: technicianProfile.id,
          name: "Technician Source Care",
          city: "Tokyo",
          serviceMode: "store",
          priceAmount: 15_000,
          currency: "JPY",
          durationMinutes: 60,
          status: "published"
        }
      })
    ]);
    const technicianService = await client.technicianService.create({
      data: {
        shopId: technicianShop.id,
        technicianId: technicianProfile.id,
        sourceShopServiceId: technicianSourceService.id,
        name: "Formal Technician Care",
        description: "Formal technician service description",
        categoryId: category.id,
        priceAmount: 13_000,
        currency: "JPY",
        durationMinutes: 60,
        tagsJson: ["care", "weekday"],
        isActive: true,
        isBookable: true,
        reviewStatus: "APPROVED"
      }
    });
    const affiliation = await client.technicianShopAffiliation.create({
      data: {
        technicianProfileId: technicianProfile.id,
        shopId: technicianShop.id,
        relationshipType: "EXCLUSIVE",
        workStatus: "ACTIVE",
        startsAt: atHours(-24),
        activeKey: `${database}:affiliation`
      }
    });
    const [shopSlot, raceSlot, rollbackSlot, outsideSlot, technicianSlot, homeSlot, homeRollbackSlot] = await Promise.all([
      client.scheduleSlot.create({
        data: {
          serviceId: shopService.id,
          shopId: shop.id,
          startsAt: atHours(2),
          endsAt: atHours(3),
          capacity: 1,
          status: "AVAILABLE"
        }
      }),
      client.scheduleSlot.create({
        data: {
          serviceId: shopService.id,
          shopId: shop.id,
          startsAt: atHours(4),
          endsAt: atHours(5),
          capacity: 1,
          status: "AVAILABLE"
        }
      }),
      client.scheduleSlot.create({
        data: {
          serviceId: shopService.id,
          shopId: shop.id,
          startsAt: atHours(5),
          endsAt: atHours(6),
          capacity: 1,
          status: "AVAILABLE"
        }
      }),
      client.scheduleSlot.create({
        data: {
          serviceId: shopService.id,
          shopId: shop.id,
          startsAt: atHours(7),
          endsAt: atHours(8),
          capacity: 1,
          status: "AVAILABLE"
        }
      }),
      client.scheduleSlot.create({
        data: {
          technicianServiceId: technicianService.id,
          shopId: technicianShop.id,
          technicianProfileId: technicianProfile.id,
          startsAt: atHours(9),
          endsAt: atHours(10),
          capacity: 1,
          status: "AVAILABLE"
        }
      }),
      client.scheduleSlot.create({
        data: {
          serviceId: homeService.id,
          shopId: shop.id,
          startsAt: atHours(16),
          endsAt: atHours(17),
          capacity: 1,
          status: "AVAILABLE"
        }
      }),
      client.scheduleSlot.create({
        data: {
          serviceId: homeService.id,
          shopId: shop.id,
          startsAt: atHours(18),
          endsAt: atHours(19),
          capacity: 1,
          status: "AVAILABLE"
        }
      })
    ]);

    const exchange = new ExchangeService(new ExchangePostRepository(client), () => now);
    const access = (input: {
      userId: number;
      email: string;
      identityId: number;
      publicId: string;
      type: string;
      scopeType: string;
      scopeId: number;
      roles: string[];
    }) => ({
      userId: input.userId,
      email: input.email,
      accessTokenJti: `${database}:jti`,
      accessTokenExpiresAt: Math.floor(now.getTime() / 1_000) + 900,
      currentIdentityId: input.identityId,
      currentPublicId: input.publicId,
      currentIdentityType: input.type,
      currentIdentityScopeType: input.scopeType,
      currentIdentityScopeId: input.scopeId,
      roles: input.roles,
      permissions: ["exchange:intelligence:service-options:list"]
    });
    const shopAccess = access({
      userId: shopOwnerUser.id,
      email: shopOwnerUser.email,
      identityId: shopIdentity.id,
      publicId: shopOwnerPublic.publicId,
      type: "merchant_owner",
      scopeType: "shop",
      scopeId: shop.id,
      roles: ["merchant_owner"]
    });
    const technicianAccess = access({
      userId: technicianUser.id,
      email: technicianUser.email,
      identityId: technicianIdentity.id,
      publicId: technicianPublic.publicId,
      type: "technician",
      scopeType: "technician_profile",
      scopeId: technicianProfile.id,
      roles: ["technician"]
    });
    await reject(
      () =>
        exchange.publish(
          shopAccess,
          {
            type: "intelligence",
            title: "Cross-shop rejection",
            detail: "Must stay inside publisher scope",
            contentLocale: "ja",
            serviceStartAt: atHours(1),
            serviceEndAt: atHours(6),
            expiresAt: atHours(12),
            serviceRef: `shop:${technicianSourceService.id}`,
            campaignPriceJpy: 10_000
          },
          `${database}:cross-shop`
        ),
      "cross-shop publication"
    );
    await reject(
      () =>
        exchange.publish(
          { ...shopAccess, currentIdentityId: technicianIdentity.id },
          {
            type: "intelligence",
            title: "Impersonation rejection",
            detail: "Identity ownership must match",
            contentLocale: "ja",
            serviceStartAt: atHours(1),
            serviceEndAt: atHours(6),
            expiresAt: atHours(12),
            serviceRef: `shop:${shopService.id}`,
            campaignPriceJpy: 10_000
          },
          `${database}:impersonated`
        ),
      "impersonated publication"
    );

    const shopPost = await exchange.publish(
      shopAccess,
      {
        type: "intelligence",
        title: "Formal shop campaign",
        detail: "Book the exact formal shop service",
        contentLocale: "ja",
        serviceStartAt: atHours(1),
        serviceEndAt: atHours(6),
        expiresAt: atHours(12),
        serviceRef: `shop:${shopService.id}`,
        campaignPriceJpy: 10_000
      },
      `${database}:publish-shop`
    );
    const technicianPost = await exchange.publish(
      technicianAccess,
      {
        type: "intelligence",
        title: "Formal technician campaign",
        detail: "Book the exact approved technician service",
        contentLocale: "ja",
        serviceStartAt: atHours(8),
        serviceEndAt: atHours(11),
        expiresAt: atHours(14),
        serviceRef: `technician:${technicianService.id}`,
        campaignPriceJpy: 11_000
      },
      `${database}:publish-technician`
    );
    const homePost = await exchange.publish(
      shopAccess,
      {
        type: "intelligence",
        title: "Formal onsite campaign",
        detail: "Book the exact formal home service with travel evidence",
        contentLocale: "ja",
        serviceStartAt: atHours(15),
        serviceEndAt: atHours(20),
        expiresAt: atHours(21),
        serviceRef: `shop:${homeService.id}`,
        campaignPriceJpy: 9_000
      },
      `${database}:publish-home`
    );
    assert.equal(shopPost.intelligence?.booking.available, true);
    assert.deepEqual(shopPost.intelligence?.booking.target, {
      type: "shop_service",
      id: shopService.id
    });
    assert.equal(shopPost.intelligence?.publisherCard?.type, "shop");
    assert.equal(shopPost.intelligence?.publisherCard?.publicId, shopPublic.publicId);
    assert.equal(shopPost.intelligence?.serviceCard?.name, shopService.name);
    assert.equal(shopPost.intelligence?.serviceCard?.catalogPriceJpy, 12_000);
    assert.equal(shopPost.intelligence?.serviceCard?.campaignPriceJpy, 10_000);
    assert.equal(technicianPost.intelligence?.booking.available, true);
    assert.equal(technicianPost.intelligence?.publisherCard?.type, "technician");
    assert.equal(technicianPost.intelligence?.publisherCard?.publicId, technicianPublic.publicId);
    assert.equal(technicianPost.intelligence?.serviceCard?.targetType, "technician_service");
    assert.equal(
      technicianPost.intelligence?.serviceCard?.shopPublicId,
      technicianShopPublic.publicId
    );
    assert.equal(homePost.intelligence?.serviceMode, "onsite");
    assert.equal(homePost.intelligence?.booking.target?.id, homeService.id);
    assert.equal(homePost.intelligence?.serviceCard?.campaignPriceJpy, 9_000);

    const realtime = new RealtimeService(new RealtimeRepository(client), {
      publish: () => undefined,
      subscribe: async () => undefined
    } as never);
    const booking = new BookingService(
      new BookingRepository(client),
      undefined,
      realtime,
      undefined,
      undefined,
      undefined,
      () => now
    );
    const customerActor = {
      userId: customerUser.id,
      roles: ["customer"],
      currentIdentityId: customerIdentity.id,
      currentIdentityType: "customer",
      currentIdentityScopeType: "customer_profile",
      currentIdentityScopeId: customerProfile.id
    };
    const bookShop = (slotId: number, key: string, serviceId = shopService.id) =>
      booking.createBooking(
        customerActor,
        {
          serviceId,
          scheduleSlotId: slotId,
          fulfillmentMode: "store",
          paymentMethod: "onsite",
          exchangeIntelligencePostId: shopPost.id
        },
        key
      );
    const destination = {
      countryCode: "JP" as const,
      postalCode: "150-0002",
      prefecture: "東京都",
      city: "渋谷区",
      addressLine1: "渋谷1-2-3",
      building: "NeeDo 301"
    };
    const policy = await client.shopTravelFarePolicyVersion.create({
      data: {
        shopId: shop.id,
        version: 1,
        effectiveFrom: atHours(-1),
        publishedByUserId: shopOwnerUser.id,
        reason: "Intelligence onsite persistence checker"
      }
    });
    const fareBand = await client.shopTravelFareBand.create({
      data: {
        policyVersionId: policy.id,
        ordinal: 0,
        maximumDistanceMeters: 10_000,
        fareAmountJpy: 800
      }
    });
    const createHomeEstimate = (slotId: number, requestId: string) =>
      client.routeEstimate.create({
        data: {
          customerUserId: customerUser.id,
          shopId: shop.id,
          serviceId: homeService.id,
          scheduleSlotId: slotId,
          policyVersionId: policy.id,
          matchedBandId: fareBand.id,
          providerCode: "checker",
          providerRequestId: requestId,
          originAddressHash: hashRouteAddress(
            shopAddressToJapaneseRouteAddress({ city: shop.city, address: shop.address })
          ),
          destinationAddressHash: hashRouteAddress(destination),
          distanceMeters: 4_200,
          durationSeconds: 900,
          fareAmountJpy: 800,
          expiresAt: atHours(1)
        }
      });
    const bookHome = (slotId: number, estimatePublicId: string, key: string) =>
      booking.createBooking(
        customerActor,
        {
          serviceId: homeService.id,
          scheduleSlotId: slotId,
          fulfillmentMode: "home",
          paymentMethod: "onsite",
          serviceLocation: {
            countryCode: "JP",
            admin1Code: tokyoRegion.officialCode,
            admin2Code: shibuyaRegion.officialCode
          },
          fulfillmentAddress: destination,
          travelEstimatePublicId: estimatePublicId,
          exchangeIntelligencePostId: homePost.id
        },
        key
      );
    await reject(
      () =>
        booking.createBooking(
          customerActor,
          {
            technicianServiceId: technicianService.id,
            scheduleSlotId: technicianSlot.id,
            fulfillmentMode: "store",
            exchangeIntelligencePostId: shopPost.id
          },
          `${database}:mismatch`
        ),
      "service mismatch"
    );
    await reject(
      () => bookShop(outsideSlot.id, `${database}:outside-window`),
      "time-window mismatch"
    );
    await client.exchangePost.update({ where: { id: shopPost.id }, data: { status: "CLOSED" } });
    await reject(() => bookShop(shopSlot.id, `${database}:terminal`), "terminal post");
    await client.exchangePost.update({ where: { id: shopPost.id }, data: { status: "PUBLISHED" } });
    await client.exchangePost.update({ where: { id: shopPost.id }, data: { status: "WITHDRAWN" } });
    await reject(() => bookShop(shopSlot.id, `${database}:withdrawn`), "withdrawn post");
    await client.exchangePost.update({ where: { id: shopPost.id }, data: { status: "PUBLISHED" } });
    await client.exchangePost.update({
      where: { id: shopPost.id },
      data: {
        serviceStartAt: atHours(-2),
        serviceEndAt: atHours(-1),
        expiresAt: atHours(-1)
      }
    });
    await reject(() => bookShop(shopSlot.id, `${database}:expired`), "expired post");
    await client.exchangePost.update({
      where: { id: shopPost.id },
      data: {
        serviceStartAt: atHours(1),
        serviceEndAt: atHours(6),
        expiresAt: atHours(12)
      }
    });
    await client.service.update({ where: { id: shopService.id }, data: { status: "draft" } });
    await reject(
      () => bookShop(shopSlot.id, `${database}:service-unavailable`),
      "unavailable service"
    );
    await client.service.update({ where: { id: shopService.id }, data: { status: "published" } });
    await client.technicianShopAffiliation.update({
      where: { id: affiliation.id },
      data: { workStatus: "SUSPENDED", activeKey: null }
    });
    await reject(
      () =>
        booking.createBooking(
          customerActor,
          {
            technicianServiceId: technicianService.id,
            scheduleSlotId: technicianSlot.id,
            fulfillmentMode: "store",
            exchangeIntelligencePostId: technicianPost.id
          },
          `${database}:inactive-affiliation`
        ),
      "inactive affiliation"
    );
    await client.technicianShopAffiliation.update({
      where: { id: affiliation.id },
      data: { workStatus: "ACTIVE", activeKey: `${database}:affiliation` }
    });
    const legacyPost = await client.exchangePost.create({
      data: {
        authorUserId: shopOwnerUser.id,
        authorIdentityId: shopIdentity.id,
        ownerIdentityId: shopIdentity.id,
        publisherPublicId: shopOwnerPublic.publicId,
        publisherIdentityType: "merchant_owner",
        publisherDisplayName: "Legacy Shop Owner",
        type: "INTELLIGENCE",
        status: "PUBLISHED",
        title: "Legacy unbound intelligence",
        detail: "Legacy compatibility only",
        contentLocale: "JA",
        areaLabel: "Tokyo",
        serviceStartAt: atHours(1),
        serviceEndAt: atHours(6),
        expiresAt: atHours(12),
        idempotencyKey: `${database}:legacy`,
        intelligence: {
          create: {
            serviceMode: "STORE",
            serviceAreas: ["Tokyo"],
            originalPriceJpy: 12_000,
            campaignPriceJpy: 10_000
          }
        }
      }
    });
    await reject(
      () =>
        booking.createBooking(
          customerActor,
          {
            serviceId: shopService.id,
            scheduleSlotId: shopSlot.id,
            fulfillmentMode: "store",
            exchangeIntelligencePostId: legacyPost.id
          },
          `${database}:legacy-book`
        ),
      "legacy unbound intelligence"
    );
    assert.equal(
      bookingCreateBodySchema.safeParse({
        serviceId: shopService.id,
        scheduleSlotId: shopSlot.id,
        fulfillmentMode: "store",
        exchangeIntelligencePostId: shopPost.id,
        priceAmount: 1
      }).success,
      false,
      "client price injection must be rejected"
    );
    await reject(
      () => admin.query("DELETE FROM services WHERE id = ?", [shopService.id]),
      "service deletion while referenced"
    );

    const rollbackKey = `${database}:rollback`;
    const homeRollbackKey = `${database}:rollback-home`;
    const homeRollbackEstimate = await createHomeEstimate(
      homeRollbackSlot.id,
      `${database}:estimate-rollback-home`
    );
    const rollbackTrigger = `${database}_rollback_guard`;
    await admin.query(`
      CREATE TRIGGER \`${rollbackTrigger}\` BEFORE INSERT ON audit_logs FOR EACH ROW
      BEGIN
        IF NEW.action = 'booking.exchange_intelligence.create'
          AND CAST(JSON_UNQUOTE(JSON_EXTRACT(NEW.metadata, '$.scheduleSlotId')) AS UNSIGNED)
            IN (${rollbackSlot.id}, ${homeRollbackSlot.id})
        THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'intelligence checker injected transaction failure';
        END IF;
      END
    `);
    try {
      await reject(
        () => bookShop(rollbackSlot.id, rollbackKey),
        "injected transaction failure"
      );
      await reject(
        () => bookHome(homeRollbackSlot.id, homeRollbackEstimate.publicId, homeRollbackKey),
        "injected onsite transaction failure"
      );
    } finally {
      await admin.query(`DROP TRIGGER \`${rollbackTrigger}\``);
    }
    const [rollbackOrderCount, rollbackAuditCount, rollbackSlotAfter, homeRollbackSlotAfter, homeRollbackEstimateAfter] = await Promise.all([
      client.bookingOrder.count({ where: { createIdempotencyKey: { in: [rollbackKey, homeRollbackKey] } } }),
      client.auditLog.count({
        where: {
          action: "booking.exchange_intelligence.create",
          OR: [
            { metadata: { path: "$.scheduleSlotId", equals: rollbackSlot.id } },
            { metadata: { path: "$.scheduleSlotId", equals: homeRollbackSlot.id } }
          ]
        }
      }),
      client.scheduleSlot.findUniqueOrThrow({ where: { id: rollbackSlot.id } }),
      client.scheduleSlot.findUniqueOrThrow({ where: { id: homeRollbackSlot.id } }),
      client.routeEstimate.findUniqueOrThrow({ where: { id: homeRollbackEstimate.id } })
    ]);
    assert.equal(rollbackOrderCount, 0, "injected failure left a booking order");
    assert.equal(rollbackAuditCount, 0, "injected failure left a booking audit");
    assert.equal(rollbackSlotAfter.bookedCount, 0, "injected failure consumed slot capacity");
    assert.equal(rollbackSlotAfter.status, "AVAILABLE", "injected failure changed slot state");
    assert.equal(homeRollbackSlotAfter.bookedCount, 0, "onsite rollback consumed slot capacity");
    assert.equal(homeRollbackSlotAfter.status, "AVAILABLE", "onsite rollback changed slot state");
    assert.equal(homeRollbackEstimateAfter.consumedAt, null, "onsite rollback consumed route estimate");
    assert.equal(homeRollbackEstimateAfter.consumedByBookingOrderId, null, "onsite rollback linked route estimate");

    const shopKey = `${database}:booking-shop`;
    const shopOrder = await bookShop(shopSlot.id, shopKey);
    const replay = await bookShop(shopSlot.id, shopKey);
    assert.equal(replay.id, shopOrder.id, "booking idempotency replay changed the order");
    await reject(() => bookShop(raceSlot.id, shopKey), "booking idempotency fingerprint conflict");
    const technicianOrder = await booking.createBooking(
      customerActor,
      {
        technicianServiceId: technicianService.id,
        scheduleSlotId: technicianSlot.id,
        fulfillmentMode: "store",
        exchangeIntelligencePostId: technicianPost.id
      },
      `${database}:booking-technician`
    );
    const homeEstimate = await createHomeEstimate(homeSlot.id, `${database}:estimate-home`);
    const homeKey = `${database}:booking-home`;
    const homeOrder = await bookHome(homeSlot.id, homeEstimate.publicId, homeKey);
    const homeReplay = await bookHome(homeSlot.id, homeEstimate.publicId, homeKey);
    assert.equal(homeReplay.id, homeOrder.id, "onsite booking idempotency replay changed the order");
    await reject(
      () => bookHome(homeRollbackSlot.id, homeRollbackEstimate.publicId, homeKey),
      "onsite booking idempotency fingerprint conflict"
    );
    const independentClients = [
      new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl), log: ["error"] }),
      new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl), log: ["error"] })
    ];
    concurrencyClients.push(...independentClients);
    await Promise.all(independentClients.map((independentClient) => independentClient.$connect()));
    const independentBookings = independentClients.map((independentClient) =>
      new BookingService(
        new BookingRepository(independentClient),
        undefined,
        new RealtimeService(new RealtimeRepository(independentClient), {
          publish: () => undefined,
          subscribe: async () => undefined
        } as never),
        undefined,
        undefined,
        undefined,
        () => now
      )
    );
    let releaseConcurrencyGate!: () => void;
    const concurrencyGate = new Promise<void>((resolveGate) => {
      releaseConcurrencyGate = resolveGate;
    });
    const raceAttempts = independentBookings.map(async (independentBooking, index) => {
      await concurrencyGate;
      return independentBooking.createBooking(
        customerActor,
        {
          serviceId: shopService.id,
          scheduleSlotId: raceSlot.id,
          fulfillmentMode: "store",
          paymentMethod: "onsite",
          exchangeIntelligencePostId: shopPost.id
        },
        `${database}:race-${index + 1}`
      );
    });
    releaseConcurrencyGate();
    const raceResults = await Promise.allSettled(raceAttempts);
    assert.equal(
      raceResults.filter((result) => result.status === "fulfilled").length,
      1,
      "slot concurrency must commit exactly one booking"
    );

    const orderIds = [
      shopOrder.id,
      technicianOrder.id,
      homeOrder.id,
      ...raceResults.flatMap((result) => (result.status === "fulfilled" ? [result.value.id] : []))
    ];
    const [
      orders,
      histories,
      notifications,
      bookingAudits,
      publicationAudits,
      travelSnapshots,
      bookingLocations
    ] =
      await Promise.all([
        client.bookingOrder.findMany({ where: { id: { in: orderIds } }, orderBy: { id: "asc" } }),
        client.orderStatusHistory.findMany({ where: { bookingOrderId: { in: orderIds } } }),
        client.notification.findMany({ where: { actorUserId: customerUser.id } }),
        client.auditLog.findMany({
          where: { action: "booking.exchange_intelligence.create", targetId: { in: orderIds } }
        }),
        client.auditLog.findMany({
          where: {
            action: "exchange.post.publish",
            targetId: { in: [shopPost.id, technicianPost.id, homePost.id] }
          }
        }),
        client.bookingTravelFareSnapshot.count({ where: { bookingOrderId: { in: orderIds } } }),
        client.bookingServiceLocation.findMany({
          where: { bookingOrderId: { in: orderIds } },
          orderBy: { bookingOrderId: "asc" }
        })
      ]);
    assert.equal(orders.length, 4, "expected four committed intelligence bookings");
    assert.equal(histories.length, 4, "each booking must have one initial history row");
    assert.equal(bookingAudits.length, 4, "each booking must have one source audit row");
    assert.equal(publicationAudits.length, 3, "each formal publication must have one audit row");
    assert.equal(notifications.length, 4, "each booking must notify its provider identity once");
    assert.equal(travelSnapshots, 1, "only onsite Intelligence booking must create travel state");
    assert.equal(bookingLocations.length, 4, "each booking must persist one service location");
    assert(
      bookingLocations.every(
        (location) =>
          location.countryCode === "JP" &&
          location.admin1RegionCode === "13" &&
          location.resolutionStatus === "VERIFIED" &&
          location.datasetVersion === "N03-20260101"
      ),
      "booking service-location evidence is incomplete"
    );
    assert(
      orders.every(
        (order) =>
          order.exchangeIntelligencePostId !== null &&
          order.createIdempotencyKey !== null &&
          order.createRequestFingerprint?.length === 64 &&
          order.priceAmount.toString() === order.servicePriceSnapshot?.toString() &&
          order.serviceDurationSnapshot === 60
      ),
      "booking source, idempotency, price, or duration snapshot is incomplete"
    );
    const persistedShopOrder = orders.find((order) => order.id === shopOrder.id)!;
    const persistedTechnicianOrder = orders.find((order) => order.id === technicianOrder.id)!;
    const persistedHomeOrder = orders.find((order) => order.id === homeOrder.id)!;
    assert.equal(persistedShopOrder.serviceId, shopService.id);
    assert.equal(persistedShopOrder.technicianServiceId, null);
    assert.equal(persistedShopOrder.priceAmount.toString(), "10000");
    assert.equal(persistedTechnicianOrder.serviceId, null);
    assert.equal(persistedTechnicianOrder.technicianServiceId, technicianService.id);
    assert.equal(persistedTechnicianOrder.priceAmount.toString(), "11000");
    assert.equal(persistedHomeOrder.serviceId, homeService.id);
    assert.equal(persistedHomeOrder.fulfillmentMode, "home");
    assert.equal(persistedHomeOrder.exchangeIntelligencePostId, homePost.id);
    assert.equal(persistedHomeOrder.priceAmount.toString(), "9000");
    assert.equal(
      persistedHomeOrder.paymentAmountJpy,
      9_000,
      "booking-stage payment amount must retain the immutable service campaign amount"
    );
    assert.equal(
      bookingAudits.filter((audit) => audit.targetId === homeOrder.id).length,
      1,
      "onsite Intelligence booking must have exactly one source audit"
    );
    assert.equal(
      notifications.filter((notification) => {
        const payload = notification.payload;
        return payload !== null && typeof payload === "object" && !Array.isArray(payload)
          && payload.orderId === homeOrder.id
          && notification.recipientUserId === shopOwnerUser.id;
      }).length,
      1,
      "onsite Intelligence booking must notify its provider exactly once"
    );
    const persistedHomeLocation = bookingLocations.find(
      (location) => location.bookingOrderId === homeOrder.id
    );
    assert.equal(persistedHomeLocation?.source, "CUSTOMER_SERVICE_LOCATION");
    assert(
      bookingLocations
        .filter((location) => location.bookingOrderId !== homeOrder.id)
        .every((location) => location.source === "SHOP_LOCATION"),
      "store booking location source changed"
    );
    const [persistedTravelSnapshot, consumedHomeEstimate] = await Promise.all([
      client.bookingTravelFareSnapshot.findUniqueOrThrow({ where: { bookingOrderId: homeOrder.id } }),
      client.routeEstimate.findUniqueOrThrow({ where: { id: homeEstimate.id } })
    ]);
    assert.equal(persistedTravelSnapshot.fareAmountJpy, 800);
    assert.equal(
      Number(persistedHomeOrder.priceAmount) + persistedTravelSnapshot.fareAmountJpy,
      9_800,
      "onsite checkout total must compose campaign service amount and immutable travel fare"
    );
    assert.equal(consumedHomeEstimate.consumedByBookingOrderId, homeOrder.id);
    assert(consumedHomeEstimate.consumedAt, "onsite booking did not consume route estimate");
    await reject(
      () => admin.query("DELETE FROM exchange_posts WHERE id = ?", [shopPost.id]),
      "source post deletion while referenced"
    );

    report = {
      database,
      migrations: "full-chain",
      physicalColumns: 7,
      constraints: { check: 1, indexes: 4, restrictForeignKeys: 3 },
      publications: 3,
      bookingOrders: orders.length,
      cardsVerified: true,
      sourceSnapshotsVerified: true,
      serviceLocationsVerified: bookingLocations.length,
      idempotencyVerified: true,
      concurrencyVerified: true,
      rollbackVerified: true,
      notifications: notifications.length,
      audits: bookingAudits.length + publicationAudits.length,
      onsiteTravelPersistenceVerified: true,
      travelStateSeparated: true,
      negativeCases: 16,
      cleanup: "pending"
    };
  } finally {
    await Promise.all(concurrencyClients.map((client) => client.$disconnect()));
    if (prisma) await prisma.$disconnect();
    if (created) {
      await admin.query(`DROP DATABASE \`${database}\``);
      const residue = await admin.query<Array<{ databaseName: string }>>(
        "SELECT SCHEMA_NAME AS databaseName FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?",
        [database]
      );
      assert.equal(residue.length, 0, "scratch database cleanup failed");
      if (report) report.cleanup = "verified";
    }
    if (userCreated) {
      await admin.query(`DROP USER ${admin.escape(scratchUsername)}@${admin.escape("localhost")}`);
    }
    await admin.end();
  }

  assert(report, "checker did not produce a report");
  console.log(JSON.stringify(report));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
