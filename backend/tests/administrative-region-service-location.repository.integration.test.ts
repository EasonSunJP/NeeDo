import { randomUUID } from "node:crypto";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import type { Prisma } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import { createConnection, type Connection } from "mariadb";
import { seedAdministrativeRegionCatalog } from "../prisma/seed";
import { AdministrativeRegionRepository } from "../src/repositories/administrative-region.repository";
import {
  AuditLogRepository,
  type TransactionAwareAuditLogRepositoryPort
} from "../src/repositories/audit-log.repository";
import { BackofficeRepository } from "../src/repositories/backoffice.repository";
import { PublicIdentifierRepository } from "../src/repositories/public-identifier.repository";
import { IdentifierAllocator } from "../src/services/public-identifier.service";
import { UserBootstrapKeyAllocator } from "../src/services/user-bootstrap-key.service";

const databaseUrl = process.env.ADMINISTRATIVE_REGION_TEST_DATABASE_URL?.trim();
const describeIntegration = databaseUrl ? describe : describe.skip;
const rollbackSentinel = new Error("rollback administrative-region integration fixture");
const marker = `region-assignment-${randomUUID()}`;

const requireSafeScratchUrl = (value: string): void => {
  const parsed = new URL(value);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (
    parsed.protocol !== "mysql:" ||
    !["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) ||
    !/^needo_admin_region_[a-z0-9_]+$/i.test(databaseName)
  ) {
    throw new Error(
      "ADMINISTRATIVE_REGION_TEST_DATABASE_URL must target a loopback needo_admin_region_* scratch database"
    );
  }
};

const transactionBoundClient = (transaction: Prisma.TransactionClient): PrismaClient =>
  new Proxy(transaction as object, {
    get(target, property, receiver) {
      if (property === "$transaction") {
        return async (callback: (client: Prisma.TransactionClient) => Promise<unknown>) =>
          callback(transaction);
      }
      return Reflect.get(target, property, receiver);
    }
  }) as PrismaClient;

describeIntegration("administrative-region shop assignment MySQL transactions", () => {
  let prisma: PrismaClient;
  let actorUserId = 0;
  let parsedDatabaseUrl: URL;

  beforeAll(async () => {
    requireSafeScratchUrl(databaseUrl ?? "");
    parsedDatabaseUrl = new URL(databaseUrl ?? "");
    prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl ?? "") });
    await seedAdministrativeRegionCatalog(prisma);
    await prisma.role.upsert({
      where: { code: "customer" },
      create: { code: "customer", name: "Customer", isSystem: true },
      update: { deletedAt: null }
    });
    await prisma.role.upsert({
      where: { code: "merchant_owner" },
      create: { code: "merchant_owner", name: "Merchant Owner", isSystem: true },
      update: { deletedAt: null }
    });
    actorUserId = (
      await prisma.user.create({
        data: {
          needoId: `it-${randomUUID().replaceAll("-", "").slice(0, 20)}`,
          email: `${marker}@needo.test`,
          username: marker
        }
      })
    ).id;
  }, 120_000);

  afterAll(async () => {
    if (prisma && actorUserId) {
      await prisma.auditLog.deleteMany({ where: { actorId: actorUserId } });
      await prisma.user.deleteMany({ where: { id: actorUserId } });
    }
    await prisma?.$disconnect();
  }, 30_000);

  const withRollback = async (
    run: (transaction: Prisma.TransactionClient, client: PrismaClient) => Promise<void>
  ): Promise<void> => {
    try {
      await prisma.$transaction(
        async (transaction) => {
          await run(transaction, transactionBoundClient(transaction));
          throw rollbackSentinel;
        },
        { maxWait: 10_000, timeout: 60_000 }
      );
      throw new Error("integration fixture unexpectedly committed");
    } catch (error) {
      if (error !== rollbackSentinel) throw error;
    }
  };

  const createRepository = (
    client: PrismaClient,
    auditLogRepository: TransactionAwareAuditLogRepositoryPort = new AuditLogRepository(client)
  ): BackofficeRepository =>
    new BackofficeRepository(
      client,
      new UserBootstrapKeyAllocator(() => "0123456789abcdef01234567"),
      (transaction) =>
        new IdentifierAllocator(new PublicIdentifierRepository(transaction), () => "3141592653"),
      new AdministrativeRegionRepository(client),
      auditLogRepository
    );

  const serviceLocationAudit = () => ({
    actorId: actorUserId,
    action: "backoffice.shop.service_location.verify",
    targetType: "shop",
    targetId: null,
    ip: "127.0.0.1",
    userAgent: marker,
    metadata: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" }
  });

  const createNumberedShop = async (
    transaction: Prisma.TransactionClient,
    numberPart = "2718281828"
  ) => {
    const shop = await transaction.shop.create({
      data: {
        name: `${marker}-shop`,
        city: "Tokyo",
        address: "Shinjuku",
        status: "published"
      }
    });
    const support = await transaction.customerSupportAccount.create({
      data: { shopId: shop.id, type: "SHOP", displayName: `${shop.name} Customer Support` }
    });
    const pair = await new IdentifierAllocator(
      new PublicIdentifierRepository(transaction),
      () => numberPart
    ).allocateShopSupportPair({ shopId: shop.id, customerSupportAccountId: support.id });
    return transaction.shop.update({
      where: { id: shop.id },
      data: { shopNo: pair.shopIdentifier.numberPart }
    });
  };

  const createSqlConnection = (): Promise<Connection> =>
    createConnection({
      host: parsedDatabaseUrl.hostname,
      port: Number(parsedDatabaseUrl.port || 3306),
      user: decodeURIComponent(parsedDatabaseUrl.username),
      password: decodeURIComponent(parsedDatabaseUrl.password),
      database: decodeURIComponent(parsedDatabaseUrl.pathname.slice(1))
    });

  const waitForRowLockWait = async (observer: Connection): Promise<void> => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const rows = (await observer.query(
        "SELECT COUNT(*) AS waiting_count FROM performance_schema.data_lock_waits"
      )) as Array<{ waiting_count: bigint | number }>;
      if (Number(rows[0]?.waiting_count ?? 0) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Timed out waiting for the assignment transaction to block on a row lock");
  };

  const cleanupNumberedShop = async (shopId: number): Promise<void> => {
    const support = await prisma.customerSupportAccount.findUnique({ where: { shopId } });
    await prisma.auditLog.deleteMany({ where: { actorId: actorUserId, userAgent: marker } });
    await prisma.shopServiceLocation.deleteMany({ where: { shopId } });
    await prisma.publicIdentifier.deleteMany({
      where: {
        OR: [{ shopId }, ...(support ? [{ customerSupportAccountId: support.id }] : [])]
      }
    });
    await prisma.customerSupportAccount.deleteMany({ where: { shopId } });
    await prisma.shop.deleteMany({ where: { id: shopId } });
  };

  it("lists active approved-version rows with requested locale then JA fallback", async () => {
    await withRollback(async (transaction, client) => {
      const repository = new AdministrativeRegionRepository(client);
      const shinjuku = await transaction.administrativeRegion.findUniqueOrThrow({
        where: { countryCode_officialCode: { countryCode: "JP", officialCode: "13104" } }
      });
      await transaction.administrativeRegionLocale.create({
        data: { regionId: shinjuku.id, locale: "EN", name: "Shinjuku City" }
      });

      await expect(
        repository.listChildren({ country: "JP", parent: "13", locale: "en" })
      ).resolves.toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "13104", name: "Shinjuku City" })])
      );

      await transaction.administrativeRegionLocale.update({
        where: { regionId_locale: { regionId: shinjuku.id, locale: "EN" } },
        data: { deletedAt: new Date() }
      });
      await expect(
        repository.listChildren({ country: "JP", parent: "13", locale: "en" })
      ).resolves.toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "13104", name: "新宿区" })])
      );

      await transaction.administrativeRegion.update({
        where: { id: shinjuku.id },
        data: { sourceVersion: "stale-test-version" }
      });
      const staleFiltered = await repository.listChildren({
        country: "JP",
        parent: "13",
        locale: "ja"
      });
      expect(staleFiltered).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "13104" })])
      );

      await transaction.administrativeRegion.update({
        where: { id: shinjuku.id },
        data: { sourceVersion: "N03-20260101", deletedAt: new Date() }
      });
      const deletedFiltered = await repository.listChildren({
        country: "JP",
        parent: "13",
        locale: "ja"
      });
      expect(deletedFiltered).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "13104" })])
      );
    });
  });

  it("resolves only a valid active ADMIN1-to-ADMIN2 hierarchy", async () => {
    await withRollback(async (transaction, client) => {
      const repository = new AdministrativeRegionRepository(client);
      await expect(
        repository.resolveVerifiedScope({
          countryCode: "JP",
          admin1Code: "13",
          admin2Code: "13104"
        })
      ).resolves.toMatchObject({
        admin1NameJa: "東京都",
        admin2NameJa: "新宿区",
        datasetVersion: "N03-20260101"
      });
      await expect(
        repository.resolveVerifiedScope({
          countryCode: "JP",
          admin1Code: "27",
          admin2Code: "13104"
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "error.administrative_region.invalid_hierarchy"
      });

      const shinjuku = await transaction.administrativeRegion.findUniqueOrThrow({
        where: { countryCode_officialCode: { countryCode: "JP", officialCode: "13104" } }
      });
      await transaction.administrativeRegion.update({
        where: { id: shinjuku.id },
        data: { deletedAt: new Date() }
      });
      await expect(
        repository.resolveVerifiedScope({
          countryCode: "JP",
          admin1Code: "13",
          admin2Code: "13104"
        })
      ).rejects.toMatchObject({ message: "error.administrative_region.invalid_hierarchy" });
    });
  });

  it("creates a shop, formal shop/support identifiers, assignment, and audit atomically", async () => {
    await withRollback(async (transaction, client) => {
      const shop = await createRepository(client).createShop({
        createdById: actorUserId,
        ownerEmail: `${marker}-owner@needo.test`,
        ownerUsername: "Formal Shop Owner",
        ownerPasswordHash: "prepared-password-hash",
        name: "Formal Region Shop",
        city: "Tokyo",
        address: "Shinjuku",
        serviceCountryCode: "JP",
        serviceAdmin1Code: "13",
        serviceAdmin2Code: "13104",
        verifiedById: actorUserId,
        serviceLocationAudit: serviceLocationAudit()
      });

      expect(shop.shopNo).toMatch(/^\d{10}$/);
      const persisted = await transaction.shop.findUniqueOrThrow({
        where: { id: shop.id },
        include: {
          serviceLocation: true,
          publicIdentifier: true,
          customerSupportAccount: { include: { publicIdentifier: true } }
        }
      });
      expect(persisted.serviceLocation).toMatchObject({
        countryCode: "JP",
        datasetVersion: "N03-20260101",
        verifiedById: actorUserId
      });
      expect(persisted.publicIdentifier).toMatchObject({
        kind: "SHOP",
        numberPart: shop.shopNo
      });
      expect(persisted.customerSupportAccount?.publicIdentifier).toMatchObject({
        kind: "CUSTOMER_SUPPORT",
        numberPart: shop.shopNo
      });
      await expect(
        transaction.auditLog.findFirstOrThrow({
          where: {
            actorId: actorUserId,
            action: "backoffice.shop.service_location.verify",
            userAgent: marker
          }
        })
      ).resolves.toMatchObject({
        targetId: null,
        metadata: {
          countryCode: "JP",
          admin1Code: "13",
          admin2Code: "13104",
          shopNo: shop.shopNo
        }
      });
    });
  });

  it("rejects an invalid create hierarchy before creating an owner or shop", async () => {
    const ownerEmail = `${marker}-invalid-owner@needo.test`;
    await expect(
      createRepository(prisma).createShop({
        createdById: actorUserId,
        ownerEmail,
        ownerUsername: "Invalid Region Owner",
        ownerPasswordHash: "prepared-password-hash",
        name: `${marker}-invalid-shop`,
        city: "Tokyo",
        address: "Shinjuku",
        serviceCountryCode: "JP",
        serviceAdmin1Code: "27",
        serviceAdmin2Code: "13104",
        verifiedById: actorUserId,
        serviceLocationAudit: serviceLocationAudit()
      })
    ).rejects.toMatchObject({ message: "error.administrative_region.invalid_hierarchy" });
    await expect(prisma.user.count({ where: { email: ownerEmail } })).resolves.toBe(0);
    await expect(prisma.shop.count({ where: { name: `${marker}-invalid-shop` } })).resolves.toBe(0);
  });

  it("rejects create verification without a valid verifier before creating an owner or shop", async () => {
    const ownerEmail = `${marker}-missing-verifier@needo.test`;
    await expect(
      createRepository(prisma).createShop({
        createdById: actorUserId,
        ownerEmail,
        ownerUsername: "Missing Verifier Owner",
        ownerPasswordHash: "prepared-password-hash",
        name: `${marker}-missing-verifier-shop`,
        city: "Tokyo",
        address: "Shinjuku",
        serviceCountryCode: "JP",
        serviceAdmin1Code: "13",
        serviceAdmin2Code: "13104",
        verifiedById: 0,
        serviceLocationAudit: serviceLocationAudit()
      })
    ).rejects.toMatchObject({ message: "error.administrative_region.verifier_required" });
    await expect(prisma.user.count({ where: { email: ownerEmail } })).resolves.toBe(0);
    await expect(
      prisma.shop.count({ where: { name: `${marker}-missing-verifier-shop` } })
    ).resolves.toBe(0);
  });

  it("updates a numbered shop and rejects invalid or legacy-null assignments without writes", async () => {
    await withRollback(async (transaction, client) => {
      const repository = createRepository(client);
      const numbered = await createNumberedShop(transaction);
      await expect(
        repository.updateShop(
          numbered.id,
          {
            name: "Verified Region Shop",
            serviceCountryCode: "JP",
            serviceAdmin1Code: "13",
            serviceAdmin2Code: "13104"
          },
          { verifiedById: actorUserId, serviceLocationAudit: serviceLocationAudit() }
        )
      ).resolves.toMatchObject({ name: "Verified Region Shop", shopNo: numbered.shopNo });
      await expect(
        transaction.shopServiceLocation.findUniqueOrThrow({ where: { shopId: numbered.id } })
      ).resolves.toMatchObject({ datasetVersion: "N03-20260101" });
      await expect(
        transaction.auditLog.findFirstOrThrow({
          where: {
            actorId: actorUserId,
            action: "backoffice.shop.service_location.verify",
            userAgent: marker
          }
        })
      ).resolves.toMatchObject({
        targetId: null,
        metadata: expect.objectContaining({ shopNo: numbered.shopNo })
      });

      const beforeInvalid = await transaction.shop.findUniqueOrThrow({
        where: { id: numbered.id }
      });
      const locationBeforeInvalid = await transaction.shopServiceLocation.findUniqueOrThrow({
        where: { shopId: numbered.id }
      });
      const auditsBeforeInvalid = await transaction.auditLog.count({
        where: { actorId: actorUserId, userAgent: marker }
      });
      await expect(
        repository.updateShop(
          numbered.id,
          {
            name: "Must Roll Back",
            serviceCountryCode: "JP",
            serviceAdmin1Code: "27",
            serviceAdmin2Code: "13104"
          },
          { verifiedById: actorUserId, serviceLocationAudit: serviceLocationAudit() }
        )
      ).rejects.toMatchObject({ message: "error.administrative_region.invalid_hierarchy" });
      await expect(
        transaction.shop.findUniqueOrThrow({ where: { id: numbered.id } })
      ).resolves.toEqual(beforeInvalid);
      await expect(
        transaction.shopServiceLocation.findUniqueOrThrow({ where: { shopId: numbered.id } })
      ).resolves.toEqual(locationBeforeInvalid);
      await expect(
        transaction.auditLog.count({ where: { actorId: actorUserId, userAgent: marker } })
      ).resolves.toBe(auditsBeforeInvalid);

      const legacy = await transaction.shop.create({
        data: { name: "Legacy Null", city: "Tokyo", address: "Tokyo", status: "published" }
      });
      await expect(
        repository.updateShop(
          legacy.id,
          {
            name: "Must Not Change",
            serviceCountryCode: "JP",
            serviceAdmin1Code: "13",
            serviceAdmin2Code: "13104"
          },
          { verifiedById: actorUserId, serviceLocationAudit: serviceLocationAudit() }
        )
      ).rejects.toMatchObject({ message: "error.shop.public_number_required" });
      await expect(
        transaction.shop.findUniqueOrThrow({ where: { id: legacy.id } })
      ).resolves.toMatchObject({
        name: "Legacy Null",
        shopNo: null
      });
      await expect(
        transaction.shopServiceLocation.count({ where: { shopId: legacy.id } })
      ).resolves.toBe(0);
    });
  });

  it("rolls back shop and location writes when the transactional audit write fails", async () => {
    const shop = await prisma.$transaction((transaction) =>
      createNumberedShop(transaction, "1618033988")
    );
    const failingAudit: TransactionAwareAuditLogRepositoryPort = {
      create: async () => {
        throw new Error("forced audit failure");
      },
      createInTransaction: async (transaction, input) => {
        await new AuditLogRepository(prisma).createInTransaction(transaction, input);
        throw new Error("forced audit failure");
      }
    };
    try {
      await expect(
        createRepository(prisma).updateShop(
          shop.id,
          {
            name: "Missing Audit Must Roll Back",
            serviceCountryCode: "JP",
            serviceAdmin1Code: "13",
            serviceAdmin2Code: "13104"
          },
          { verifiedById: actorUserId }
        )
      ).rejects.toMatchObject({ message: "error.administrative_region.verifier_required" });
      await expect(
        prisma.shop.findUniqueOrThrow({ where: { id: shop.id } })
      ).resolves.toMatchObject({
        name: `${marker}-shop`,
        shopNo: "1618033988"
      });
      await expect(prisma.shopServiceLocation.count({ where: { shopId: shop.id } })).resolves.toBe(
        0
      );

      await expect(
        createRepository(prisma, failingAudit).updateShop(
          shop.id,
          {
            name: "Must Roll Back",
            serviceCountryCode: "JP",
            serviceAdmin1Code: "13",
            serviceAdmin2Code: "13104"
          },
          { verifiedById: actorUserId, serviceLocationAudit: serviceLocationAudit() }
        )
      ).rejects.toThrow("forced audit failure");

      await expect(
        prisma.shop.findUniqueOrThrow({ where: { id: shop.id } })
      ).resolves.toMatchObject({
        name: `${marker}-shop`,
        shopNo: "1618033988"
      });
      await expect(prisma.shopServiceLocation.count({ where: { shopId: shop.id } })).resolves.toBe(
        0
      );
      await expect(
        prisma.auditLog.count({
          where: {
            actorId: actorUserId,
            action: "backoffice.shop.service_location.verify",
            userAgent: marker
          }
        })
      ).resolves.toBe(0);
    } finally {
      const support = await prisma.customerSupportAccount.findUnique({
        where: { shopId: shop.id }
      });
      await prisma.publicIdentifier.deleteMany({
        where: {
          OR: [{ shopId: shop.id }, ...(support ? [{ customerSupportAccountId: support.id }] : [])]
        }
      });
      await prisma.customerSupportAccount.deleteMany({ where: { shopId: shop.id } });
      await prisma.shop.delete({ where: { id: shop.id } });
    }
  });

  it("does not assign a location after a concurrent shop soft-delete wins the row lock", async () => {
    const shop = await prisma.$transaction((transaction) =>
      createNumberedShop(transaction, "1414213562")
    );
    const locker = await createSqlConnection();
    const observer = await createSqlConnection();
    try {
      await locker.beginTransaction();
      await locker.query("UPDATE shops SET deleted_at = NOW(3) WHERE id = ?", [shop.id]);

      const mutation = createRepository(prisma).updateShop(
        shop.id,
        {
          serviceCountryCode: "JP",
          serviceAdmin1Code: "13",
          serviceAdmin2Code: "13104"
        },
        { verifiedById: actorUserId, serviceLocationAudit: serviceLocationAudit() }
      );
      await waitForRowLockWait(observer);
      await locker.commit();

      await expect(mutation).resolves.toBeNull();
      await expect(prisma.shopServiceLocation.count({ where: { shopId: shop.id } })).resolves.toBe(
        0
      );
      await expect(
        prisma.auditLog.count({
          where: {
            actorId: actorUserId,
            action: "backoffice.shop.service_location.verify",
            userAgent: marker
          }
        })
      ).resolves.toBe(0);
    } finally {
      await locker.rollback().catch(() => undefined);
      await locker.end();
      await observer.end();
      await cleanupNumberedShop(shop.id);
    }
  });

  it("does not assign a location after a concurrent region retirement wins the row lock", async () => {
    const shop = await prisma.$transaction((transaction) =>
      createNumberedShop(transaction, "1732050807")
    );
    const shinjuku = await prisma.administrativeRegion.findUniqueOrThrow({
      where: { countryCode_officialCode: { countryCode: "JP", officialCode: "13104" } }
    });
    const locker = await createSqlConnection();
    const observer = await createSqlConnection();
    try {
      await locker.beginTransaction();
      await locker.query("UPDATE administrative_regions SET deleted_at = NOW(3) WHERE id = ?", [
        shinjuku.id
      ]);

      const mutation = createRepository(prisma).updateShop(
        shop.id,
        {
          serviceCountryCode: "JP",
          serviceAdmin1Code: "13",
          serviceAdmin2Code: "13104"
        },
        { verifiedById: actorUserId, serviceLocationAudit: serviceLocationAudit() }
      );
      await waitForRowLockWait(observer);
      await locker.commit();

      await expect(mutation).rejects.toMatchObject({
        statusCode: 400,
        message: "error.administrative_region.invalid_hierarchy"
      });
      await expect(prisma.shopServiceLocation.count({ where: { shopId: shop.id } })).resolves.toBe(
        0
      );
      await expect(
        prisma.auditLog.count({
          where: {
            actorId: actorUserId,
            action: "backoffice.shop.service_location.verify",
            userAgent: marker
          }
        })
      ).resolves.toBe(0);
    } finally {
      await locker.rollback().catch(() => undefined);
      await locker.end();
      await observer.end();
      await prisma.administrativeRegion.update({
        where: { id: shinjuku.id },
        data: { deletedAt: null }
      });
      await cleanupNumberedShop(shop.id);
    }
  });
});
