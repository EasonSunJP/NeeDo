import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import { createConnection, type Connection } from "mariadb";
import { seedAdministrativeRegionCatalog } from "../prisma/seed";

const databaseUrl = process.env.ADMINISTRATIVE_REGION_TEST_DATABASE_URL?.trim();
const describeIntegration = databaseUrl ? describe : describe.skip;

const requireSafeScratchUrl = (value: string): URL => {
  const parsed = new URL(value);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (
    parsed.protocol !== "mysql:" ||
    !["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) ||
    !/^needo_admin_region_[a-z0-9_]+$/i.test(databaseName)
  ) {
    throw new Error(
      "ADMINISTRATIVE_REGION_TEST_DATABASE_URL must target a loopback needo_admin_region_* scratch database",
    );
  }
  return parsed;
};

describeIntegration("administrative-region MySQL migration and seed", () => {
  let prisma: PrismaClient;
  let connection: Connection;

  beforeAll(async () => {
    const parsed = requireSafeScratchUrl(databaseUrl ?? "");
    prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl ?? "") });
    connection = await createConnection({
      host: parsed.hostname,
      port: Number(parsed.port || 3306),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: decodeURIComponent(parsed.pathname.slice(1)),
    });
  });

  afterAll(async () => {
    if (connection) await connection.end();
    if (prisma) await prisma.$disconnect();
  });

  it.each([
    [
      "administrative_regions",
      "INSERT INTO administrative_regions (country_code, official_code, level, source, source_version, created_at, updated_at) VALUES (?, ?, 'COUNTRY', 'test', 'test', NOW(3), NOW(3))",
      ["JP", "TST-UPPER"],
      ["jp", "TST-LOWER"],
      "administrative_regions_country_code_chk",
      "DELETE FROM administrative_regions WHERE official_code IN ('TST-UPPER', 'TST-LOWER')",
    ],
    [
      "shop_service_locations",
      "INSERT INTO shop_service_locations (shop_id, country_code, admin1_region_id, admin2_region_id, dataset_version, verified_at, created_at, updated_at) VALUES (?, ?, -1, -2, 'test', NOW(3), NOW(3), NOW(3))",
      [-1, "JP"],
      [-2, "jp"],
      "shop_service_locations_country_code_chk",
      "DELETE FROM shop_service_locations WHERE dataset_version = 'test'",
    ],
    [
      "booking_service_locations",
      "INSERT INTO booking_service_locations (booking_order_id, country_code, source, resolution_status, dataset_version, created_at, updated_at) VALUES (?, ?, 'CUSTOMER_SERVICE_LOCATION', 'UNRESOLVED', 'test', NOW(3), NOW(3))",
      [-1, "JP"],
      [-2, "jp"],
      "booking_service_locations_country_code_chk",
      "DELETE FROM booking_service_locations WHERE dataset_version = 'test'",
    ],
  ])("accepts JP and rejects jp in %s", async (_table, sql, upperParams, lowerParams, constraint, cleanupSql) => {
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    try {
      await expect(connection.query(sql, upperParams)).resolves.toBeDefined();
      await expect(connection.query(sql, lowerParams)).rejects.toMatchObject({
        errno: 3819,
        sqlMessage: expect.stringContaining(constraint),
      });
    } finally {
      await connection.query(cleanupSql);
      await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    }
  });

  it("enforces verified and ADMIN2 booking snapshot semantics", async () => {
    const sql =
      "INSERT INTO booking_service_locations (booking_order_id, country_code, admin1_region_code, admin2_region_code, source, resolution_status, dataset_version, created_at, updated_at) VALUES (?, 'JP', ?, ?, 'CUSTOMER_SERVICE_LOCATION', ?, 'test-resolution', NOW(3), NOW(3))";
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    try {
      await expect(
        connection.query(sql, [-10, null, null, "VERIFIED"]),
      ).rejects.toMatchObject({
        errno: 3819,
        sqlMessage: expect.stringContaining("booking_service_locations_verified_regions_chk"),
      });
      await expect(
        connection.query(sql, [-11, null, "13104", "UNRESOLVED"]),
      ).rejects.toMatchObject({
        errno: 3819,
        sqlMessage: expect.stringContaining(
          "booking_service_locations_admin2_requires_admin1_chk",
        ),
      });
      await expect(
        connection.query(sql, [-12, "13", "13104", "VERIFIED"]),
      ).resolves.toBeDefined();
    } finally {
      await connection.query(
        "DELETE FROM booking_service_locations WHERE dataset_version = 'test-resolution'",
      );
      await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    }
  });

  it("is idempotent, seeds JA only, and restores soft-deleted rows", async () => {
    await seedAdministrativeRegionCatalog(prisma);
    const firstRows = await prisma.administrativeRegion.findMany({
      select: { id: true, officialCode: true },
      orderBy: { officialCode: "asc" },
    });
    await seedAdministrativeRegionCatalog(prisma);
    const secondRows = await prisma.administrativeRegion.findMany({
      select: { id: true, officialCode: true },
      orderBy: { officialCode: "asc" },
    });

    expect(secondRows).toEqual(firstRows);
    expect(await prisma.administrativeRegion.count()).toBe(1_966);
    expect(await prisma.administrativeRegionLocale.count()).toBe(1_966);
    expect(
      await prisma.administrativeRegionLocale.count({ where: { locale: { not: "JA" } } }),
    ).toBe(0);

    const shinjuku = await prisma.administrativeRegion.findUniqueOrThrow({
      where: { countryCode_officialCode: { countryCode: "JP", officialCode: "13104" } },
    });
    await prisma.administrativeRegionLocale.update({
      where: { regionId_locale: { regionId: shinjuku.id, locale: "JA" } },
      data: { name: "stale", deletedAt: new Date("2026-01-01T00:00:00.000Z") },
    });
    await prisma.administrativeRegion.update({
      where: { id: shinjuku.id },
      data: { deletedAt: new Date("2026-01-01T00:00:00.000Z") },
    });

    await seedAdministrativeRegionCatalog(prisma);

    await expect(
      prisma.administrativeRegion.findUniqueOrThrow({ where: { id: shinjuku.id } }),
    ).resolves.toMatchObject({ deletedAt: null });
    await expect(
      prisma.administrativeRegionLocale.findUniqueOrThrow({
        where: { regionId_locale: { regionId: shinjuku.id, locale: "JA" } },
      }),
    ).resolves.toMatchObject({ name: "新宿区", deletedAt: null });
  }, 120_000);
});
