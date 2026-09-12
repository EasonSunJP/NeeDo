import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import type { PrismaClient } from "@prisma/client";
import {
  applyExchangeSimulationPlan,
  discoverExchangeSimulationActors
} from "../src/simulation/exchange-simulation-seed";
import { checkFormalExchangeSimulation } from "../src/simulation/exchange-simulation-checker";
import { buildExchangeSimulationPlan } from "../src/simulation/exchange-simulation-plan";
import { EXCHANGE_SIMULATION_NAMESPACE } from "../src/simulation/exchange-simulation.constants";

const enabled = process.env.RUN_EXCHANGE_SIMULATION_INTEGRATION === "true";
const describeIntegration = enabled ? describe : describe.skip;
let prisma: PrismaClient;
let disconnectPrisma: () => Promise<void>;
let manualPostId: number | undefined;

describeIntegration("formal Exchange simulation seed", () => {
  beforeAll(async () => {
    const envFile = process.env.ENV_FILE?.trim() ?? "";
    if (!envFile || !existsSync(envFile)) throw new Error("explicit local ENV_FILE required");
    loadDotenv({ path: envFile, override: true });
    if (process.env.ALLOW_SIMULATION_SEED !== "true") {
      throw new Error("ALLOW_SIMULATION_SEED=true is required");
    }
    ({ prisma, disconnectPrisma } = await import("../src/prisma/client"));
  });

  afterAll(async () => {
    if (prisma && manualPostId) {
      await prisma.exchangeDemand.deleteMany({ where: { postId: manualPostId } });
      await prisma.exchangePost.deleteMany({ where: { id: manualPostId } });
    }
    if (disconnectPrisma) await disconnectPrisma();
  });

  it("is idempotent while preserving an unrelated manual post", async () => {
    const actors = await discoverExchangeSimulationActors(prisma);
    const plan = buildExchangeSimulationPlan(actors, "exchange-integration-seed");
    await applyExchangeSimulationPlan(prisma, plan);
    const firstRows = await prisma.exchangePost.findMany({
      where: { idempotencyKey: { startsWith: EXCHANGE_SIMULATION_NAMESPACE } },
      select: { id: true, idempotencyKey: true },
      orderBy: { idempotencyKey: "asc" }
    });
    const customer = actors.find((actor) => actor.identityType === "customer");
    if (!customer) throw new Error("customer actor required");
    const manual = await prisma.exchangePost.create({
      data: {
        authorUserId: customer.userId,
        authorIdentityId: customer.identityId,
        ownerIdentityId: customer.identityId,
        publisherPublicId: customer.publicId,
        publisherIdentityType: customer.identityType,
        publisherDisplayName: customer.displayName,
        publisherAvatarUrl: customer.avatarUrl,
        type: "DEMAND",
        title: "手動の検証投稿",
        detail: "シミュレーション再実行後も残る必要があります。",
        contentLocale: "JA",
        areaLabel: "渋谷区",
        serviceStartAt: new Date("2026-10-01T01:00:00.000Z"),
        serviceEndAt: new Date("2026-10-01T02:00:00.000Z"),
        expiresAt: new Date("2026-10-01T08:00:00.000Z"),
        idempotencyKey: `manual-exchange-integration:${randomUUID()}`,
        demand: {
          create: {
            budgetMinJpy: 8_000,
            budgetMaxJpy: 12_000,
            addressLine1: "渋谷区"
          }
        }
      }
    });
    manualPostId = manual.id;

    await applyExchangeSimulationPlan(prisma, plan);
    const secondRows = await prisma.exchangePost.findMany({
      where: { idempotencyKey: { startsWith: EXCHANGE_SIMULATION_NAMESPACE } },
      select: { id: true, idempotencyKey: true },
      orderBy: { idempotencyKey: "asc" }
    });

    expect(secondRows).toEqual(firstRows);
    expect(secondRows).toHaveLength(40);
    await expect(
      prisma.exchangePost.findUnique({ where: { id: manual.id } })
    ).resolves.not.toBeNull();
  }, 180_000);

  it("reopens the complete matching aggregate when a later seed republishes an expired Request", async () => {
    const actors = await discoverExchangeSimulationActors(prisma);
    const firstReferenceTime = new Date("2026-09-11T01:00:00.000Z");
    const secondReferenceTime = new Date("2026-09-12T01:00:00.000Z");
    await applyExchangeSimulationPlan(
      prisma,
      buildExchangeSimulationPlan(actors, "exchange-integration-seed", firstReferenceTime)
    );
    const seededRequest = await prisma.exchangePost.findFirst({
      where: {
        idempotencyKey: { startsWith: EXCHANGE_SIMULATION_NAMESPACE },
        type: "DEMAND",
        requestFinancial: null,
        matchParticipants: { none: {} }
      },
      orderBy: { id: "asc" },
      include: { demand: true, matching: true }
    });
    if (!seededRequest?.demand) throw new Error("resettable seeded Request required");

    if (seededRequest.matching) {
      await prisma.exchangeMatchEvent.deleteMany({
        where: { matchingId: seededRequest.matching.id }
      });
    }
    await prisma.exchangeClaim.deleteMany({ where: { exchangePostId: seededRequest.id } });
    const matching = await prisma.exchangeRequestMatching.upsert({
      where: { exchangePostId: seededRequest.id },
      create: {
        exchangePostId: seededRequest.id,
        status: "CLOSED",
        effectiveTargetProviderCount: seededRequest.demand.targetProviderCount,
        effectiveBudgetMaxJpy: seededRequest.demand.budgetMaxJpy,
        selectedQuoteTotalJpy: 0,
        version: 2,
        closedAt: firstReferenceTime,
        createdAt: firstReferenceTime,
        updatedAt: firstReferenceTime
      },
      update: {
        status: "CLOSED",
        selectedQuoteTotalJpy: 0,
        version: 2,
        matchedAt: null,
        closedAt: firstReferenceTime,
        updatedAt: firstReferenceTime,
        deletedAt: null
      }
    });
    await prisma.exchangeMatchEvent.createMany({
      data: [
        {
          matchingId: matching.id,
          sequence: 1,
          type: "OPENED",
          versionBefore: 0,
          versionAfter: 1,
          payload: { exchangePostId: seededRequest.id },
          createdAt: firstReferenceTime,
          updatedAt: firstReferenceTime
        },
        {
          matchingId: matching.id,
          sequence: 2,
          type: "CLOSED",
          versionBefore: 1,
          versionAfter: 2,
          payload: { exchangePostId: seededRequest.id, reason: "request_expired" },
          createdAt: firstReferenceTime,
          updatedAt: firstReferenceTime
        }
      ]
    });

    await expect(checkFormalExchangeSimulation(prisma, firstReferenceTime)).rejects.toThrow(
      /matching/i
    );

    const secondPlan = buildExchangeSimulationPlan(
      actors,
      "exchange-integration-seed",
      secondReferenceTime
    );
    await applyExchangeSimulationPlan(prisma, secondPlan);
    const expectedPost = secondPlan.posts.find(
      ({ idempotencyKey }) => idempotencyKey === seededRequest.idempotencyKey
    );
    const reset = await prisma.exchangePost.findUniqueOrThrow({
      where: { id: seededRequest.id },
      include: {
        demand: true,
        claims: true,
        matchParticipants: true,
        requestFinancial: true,
        feeCalculationLogs: true,
        walletHolds: true,
        matching: { include: { events: { orderBy: { sequence: "asc" } } } }
      }
    });

    expect(expectedPost).toBeDefined();
    expect(reset.status).toBe("PUBLISHED");
    expect(reset.createdAt.toISOString()).toBe(expectedPost?.createdAt);
    expect(reset.claims).toHaveLength(0);
    expect(reset.matchParticipants).toHaveLength(0);
    expect(reset.requestFinancial).toBeNull();
    expect(reset.feeCalculationLogs).toHaveLength(0);
    expect(reset.walletHolds).toHaveLength(0);
    expect(reset.matching).toMatchObject({
      status: "OPEN",
      effectiveTargetProviderCount: reset.demand?.targetProviderCount,
      effectiveBudgetMaxJpy: reset.demand?.budgetMaxJpy,
      selectedQuoteTotalJpy: 0,
      version: 1,
      matchedAt: null,
      closedAt: null,
      deletedAt: null
    });
    expect(reset.matching?.events).toHaveLength(1);
    expect(reset.matching?.events[0]).toMatchObject({
      sequence: 1,
      type: "OPENED",
      versionBefore: 0,
      versionAfter: 1,
      actorUserId: null,
      actorIdentityId: null,
      deletedAt: null
    });
    expect(reset.matching?.events[0]?.createdAt.toISOString()).toBe(expectedPost?.createdAt);
    await expect(checkFormalExchangeSimulation(prisma, secondReferenceTime)).resolves.toEqual(
      expect.objectContaining({
        matchings: 20,
        matchingEvents: 20,
        claims: 0,
        matchParticipants: 0,
        requestFinancials: 0
      })
    );

    const naturalExpiryAt = new Date(expectedPost!.expiresAt);
    const [{ ExchangePostRepository }, { ExchangeService }] = await Promise.all([
      import("../src/repositories/exchange.repository"),
      import("../src/services/exchange.service")
    ]);
    const service = new ExchangeService(new ExchangePostRepository(prisma), () => naturalExpiryAt);
    await expect(service.expirePost(seededRequest.id, naturalExpiryAt)).resolves.toBe(true);
    await expect(
      prisma.exchangePost.findUniqueOrThrow({
        where: { id: seededRequest.id },
        include: {
          matching: { include: { events: { orderBy: { sequence: "asc" } } } }
        }
      })
    ).resolves.toMatchObject({
      status: "EXPIRED",
      matching: {
        status: "CLOSED",
        version: 2,
        events: [
          { sequence: 1, type: "OPENED" },
          {
            sequence: 2,
            type: "CLOSED",
            payload: { exchangePostId: seededRequest.id, reason: "request_expired" }
          }
        ]
      }
    });

    await applyExchangeSimulationPlan(prisma, secondPlan);
    await expect(checkFormalExchangeSimulation(prisma, secondReferenceTime)).resolves.toEqual(
      expect.objectContaining({ matchings: 20, matchingEvents: 20 })
    );

    const protectedBefore = await prisma.exchangePost.findUniqueOrThrow({
      where: { id: seededRequest.id },
      select: {
        createdAt: true,
        expiresAt: true,
        matching: { select: { status: true, version: true } }
      }
    });
    const feeCalculationLog = await prisma.feeCalculationLog.create({
      data: {
        exchangePostId: seededRequest.id,
        calculationStage: "simulation_seed_guard",
        feeType: "exchange_request_publication",
        payerType: "user",
        payerId: seededRequest.authorUserId
      }
    });
    try {
      await expect(
        applyExchangeSimulationPlan(
          prisma,
          buildExchangeSimulationPlan(
            actors,
            "exchange-integration-seed",
            new Date("2026-09-13T01:00:00.000Z")
          )
        )
      ).rejects.toThrow(
        `Exchange simulation post ${seededRequest.id} has financial or booked state`
      );
      await expect(checkFormalExchangeSimulation(prisma, secondReferenceTime)).rejects.toThrow(
        /financial/i
      );
      await expect(
        prisma.exchangePost.findUniqueOrThrow({
          where: { id: seededRequest.id },
          select: {
            createdAt: true,
            expiresAt: true,
            matching: { select: { status: true, version: true } }
          }
        })
      ).resolves.toEqual(protectedBefore);
    } finally {
      await prisma.feeCalculationLog.delete({ where: { id: feeCalculationLog.id } });
    }
    await expect(checkFormalExchangeSimulation(prisma, secondReferenceTime)).resolves.toEqual(
      expect.objectContaining({ requestFinancials: 0 })
    );
  }, 180_000);
});
