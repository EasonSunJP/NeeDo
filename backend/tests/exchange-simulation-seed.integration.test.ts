import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import type { PrismaClient } from "@prisma/client";
import {
  applyExchangeSimulationPlan,
  discoverExchangeSimulationActors
} from "../src/simulation/exchange-simulation-seed";
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
        demand: { create: { budgetMinJpy: 8_000, budgetMaxJpy: 12_000 } }
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
});
