import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import type { PrismaClient } from "@prisma/client";

const enabled = process.env.RUN_EXCHANGE_CLAIM_INTEGRATION === "true";
const describeIntegration = enabled ? describe : describe.skip;
const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const requireSafeDatabaseUrl = (): URL => {
  const envFile = process.env.ENV_FILE?.trim() ?? "";
  if (!envFile || !existsSync(envFile)) {
    throw new Error("Exchange claim integration requires an explicit local ENV_FILE");
  }
  const loaded = loadDotenv({ path: envFile, override: true });
  const databaseUrl = loaded.parsed?.DATABASE_URL?.trim();
  if (loaded.error || !databaseUrl) {
    throw new Error("Exchange claim integration ENV_FILE must define DATABASE_URL");
  }
  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (
    parsed.protocol !== "mysql:" ||
    !allowedHosts.has(parsed.hostname) ||
    !/(?:^|[_-])test(?:$|[_-])/iu.test(databaseName) ||
    /(?:^|[_-])prod(?:uction)?(?:$|[_-])/iu.test(databaseName)
  ) {
    throw new Error(
      "Exchange claim integration requires a loopback MySQL database with test in its name"
    );
  }
  return parsed;
};

let client: PrismaClient;

describeIntegration("ExchangeClaimRepository guarded concurrency", () => {
  beforeAll(async () => {
    const url = requireSafeDatabaseUrl();
    const [{ PrismaClient: RuntimePrismaClient }, { PrismaMariaDb }] = await Promise.all([
      import("@prisma/client"),
      import("@prisma/adapter-mariadb")
    ]);
    const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    const adapter = new PrismaMariaDb(
      {
        host: url.hostname,
        port: url.port ? Number(url.port) : undefined,
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: databaseName,
        charset: "utf8mb4",
        collation: "utf8mb4_unicode_ci",
        allowPublicKeyRetrieval: false,
        connectionLimit: 4,
        acquireTimeout: 10_000,
        idleTimeout: 30_000,
        connectTimeout: 5_000
      },
      { database: databaseName }
    );
    client = new RuntimePrismaClient({ adapter });
  });

  afterAll(async () => {
    if (client) await client.$disconnect();
  });

  it("allows exactly one active claim for concurrent attempts on one technician", async () => {
    const marker = randomUUID().replaceAll("-", "").slice(0, 10);
    const now = new Date("2026-09-01T00:00:00.000Z");
    const serviceStartAt = new Date("2026-09-02T01:00:00.000Z");
    const serviceEndAt = new Date("2026-09-02T02:00:00.000Z");
    const created = {
      userIds: [] as number[],
      identityIds: [] as number[],
      publicIdentifierIds: [] as number[],
      shopId: 0,
      technicianProfileId: 0,
      affiliationId: 0,
      categoryId: 0,
      serviceId: 0,
      scheduleSlotId: 0,
      postId: 0
    };

    try {
      const claimant = await client.user.create({
        data: {
          needoId: `claimant-${marker}`,
          email: `claimant-${marker}@needo.local`,
          username: `claimant-${marker}`,
          isTestAccount: true
        }
      });
      const technicianUser = await client.user.create({
        data: {
          needoId: `tech-${marker}`,
          email: `tech-${marker}@needo.local`,
          username: `tech-${marker}`,
          isTestAccount: true
        }
      });
      created.userIds.push(claimant.id, technicianUser.id);
      const claimantIdentity = await client.userIdentity.create({
        data: {
          userId: claimant.id,
          type: "merchant",
          displayName: `Claimant ${marker}`,
          activeKey: `merchant:${marker}`
        }
      });
      const technicianIdentity = await client.userIdentity.create({
        data: {
          userId: technicianUser.id,
          type: "technician",
          displayName: `Technician ${marker}`,
          activeKey: `technician:${marker}`
        }
      });
      created.identityIds.push(claimantIdentity.id, technicianIdentity.id);
      for (const [identityId, kind, prefix, sequence] of [
        [claimantIdentity.id, "B", "B", "1"],
        [technicianIdentity.id, "S", "S", "2"]
      ] as const) {
        const numberPart = `${marker.replace(/\D/gu, "")}0000000000${sequence}`.slice(-10);
        const publicIdentifier = await client.publicIdentifier.create({
          data: {
            publicId: `${prefix}${numberPart}`,
            numberPart,
            kind,
            userIdentityId: identityId,
            status: "ACTIVE"
          }
        });
        created.publicIdentifierIds.push(publicIdentifier.id);
      }
      const shop = await client.shop.create({
        data: {
          name: `Claim Shop ${marker}`,
          city: "Tokyo",
          address: "Tokyo",
          status: "published",
          pricingMode: "MERCHANT"
        }
      });
      created.shopId = shop.id;
      const technician = await client.technicianProfile.create({
        data: {
          userId: technicianUser.id,
          shopId: shop.id,
          displayName: `Technician ${marker}`,
          city: "Tokyo",
          status: "published"
        }
      });
      created.technicianProfileId = technician.id;
      const affiliation = await client.technicianShopAffiliation.create({
        data: {
          technicianProfileId: technician.id,
          shopId: shop.id,
          relationshipType: "EXCLUSIVE",
          workStatus: "ACTIVE",
          startsAt: new Date("2026-08-01T00:00:00.000Z"),
          activeKey: `claim-it:${marker}`
        }
      });
      created.affiliationId = affiliation.id;
      const category = await client.category.create({
        data: { code: `claim-it-${marker}`, name: `Claim ${marker}` }
      });
      created.categoryId = category.id;
      const service = await client.service.create({
        data: {
          categoryId: category.id,
          shopId: shop.id,
          name: `Claim service ${marker}`,
          city: "Tokyo",
          priceAmount: 15_000,
          durationMinutes: 60,
          status: "published"
        }
      });
      created.serviceId = service.id;
      const slot = await client.scheduleSlot.create({
        data: {
          serviceId: service.id,
          shopId: shop.id,
          technicianProfileId: technician.id,
          startsAt: serviceStartAt,
          endsAt: serviceEndAt,
          capacity: 1,
          bookedCount: 0,
          status: "AVAILABLE"
        }
      });
      created.scheduleSlotId = slot.id;
      const post = await client.exchangePost.create({
        data: {
          authorUserId: claimant.id,
          authorIdentityId: claimantIdentity.id,
          ownerIdentityId: claimantIdentity.id,
          publisherPublicId: `B${String(claimantIdentity.id).padStart(10, "0")}`,
          publisherIdentityType: "merchant",
          publisherDisplayName: `Claimant ${marker}`,
          type: "DEMAND",
          status: "PUBLISHED",
          title: `Concurrent claim ${marker}`,
          detail: "Formal guarded concurrency fixture",
          contentLocale: "EN",
          areaLabel: "Tokyo",
          serviceStartAt,
          serviceEndAt,
          expiresAt: new Date("2026-09-01T12:00:00.000Z"),
          idempotencyKey: `claim-it-post:${marker}`,
          demand: {
            create: {
              matchMode: "SELECTIVE",
              budgetMaxJpy: 30_000,
              addressLine1: "Tokyo"
            }
          }
        }
      });
      created.postId = post.id;

      const { ExchangeClaimRepository } = await import(
        "../src/repositories/exchange-claim.repository"
      );
      const repository = new ExchangeClaimRepository(client);
      const attempt = (suffix: string) =>
        repository.runInTransaction(async (lockedRepository) => {
          const request = await lockedRepository.lockRequest(post.id);
          if (!request || request.status !== "published") return "request_unavailable";
          if (!(await lockedRepository.lockTechnician(technician.id))) {
            return "option_unavailable";
          }
          const option = await lockedRepository.lockOption(
            slot.id,
            { kind: "merchant", shopId: shop.id },
            now
          );
          if (!option) return "option_unavailable";
          if (
            (await lockedRepository.hasOverlappingActiveClaim(
              technician.id,
              option.startsAt,
              option.endsAt
            )) ||
            (await lockedRepository.hasConflictingBooking(
              technician.id,
              option.startsAt,
              option.endsAt
            ))
          ) {
            return "time_conflict";
          }
          await lockedRepository.create({
            exchangePostId: post.id,
            claimantUserId: claimant.id,
            claimantIdentityId: claimantIdentity.id,
            shopId: shop.id,
            technicianProfileId: technician.id,
            serviceId: service.id,
            technicianServiceId: null,
            scheduleSlotId: slot.id,
            quoteAmountJpy: 15_000,
            message: null,
            idempotencyKey: `claim-it:${marker}:${suffix}`,
            payloadFingerprint: suffix.repeat(64).slice(0, 64),
            now
          });
          return "created";
        });

      const outcomes = await Promise.all([attempt("a"), attempt("b")]);
      expect(outcomes.sort()).toEqual(["created", "time_conflict"]);
      await expect(
        client.exchangeClaim.count({
          where: {
            exchangePostId: post.id,
            technicianProfileId: technician.id,
            status: "ACTIVE",
            deletedAt: null
          }
        })
      ).resolves.toBe(1);
    } finally {
      if (created.postId) {
        await client.exchangeClaim.deleteMany({ where: { exchangePostId: created.postId } });
        await client.exchangeDemand.deleteMany({ where: { postId: created.postId } });
        await client.exchangePost.deleteMany({ where: { id: created.postId } });
      }
      if (created.scheduleSlotId) {
        await client.scheduleSlot.deleteMany({ where: { id: created.scheduleSlotId } });
      }
      if (created.serviceId) await client.service.deleteMany({ where: { id: created.serviceId } });
      if (created.categoryId) {
        await client.category.deleteMany({ where: { id: created.categoryId } });
      }
      if (created.affiliationId) {
        await client.technicianShopAffiliation.deleteMany({
          where: { id: created.affiliationId }
        });
      }
      if (created.technicianProfileId) {
        await client.technicianProfile.deleteMany({
          where: { id: created.technicianProfileId }
        });
      }
      if (created.shopId) await client.shop.deleteMany({ where: { id: created.shopId } });
      if (created.publicIdentifierIds.length > 0) {
        await client.publicIdentifier.deleteMany({
          where: { id: { in: created.publicIdentifierIds } }
        });
      }
      if (created.identityIds.length > 0) {
        await client.userIdentity.deleteMany({ where: { id: { in: created.identityIds } } });
      }
      if (created.userIds.length > 0) {
        await client.user.deleteMany({ where: { id: { in: created.userIds } } });
      }
    }
  }, 60_000);
});
