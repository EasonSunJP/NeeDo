import { createHash, randomInt, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import type { PrismaClient } from "@prisma/client";
import {
  assertSafeLocalizedCarouselPublicationEnvironment,
  deleteLocalizedPublicationCommandsByExactId
} from "../scripts/check-localized-carousel-publication-flow";

const enabled = process.env.RUN_LOCALIZED_CAROUSEL_CLEANUP_INTEGRATION === "true";
const describeIntegration = enabled ? describe : describe.skip;
let prisma: PrismaClient;
let disconnectPrisma: () => Promise<void>;
const createdCommandIds: number[] = [];

describeIntegration("localized carousel checker exact command cleanup", () => {
  beforeAll(async () => {
    const envFile = process.env.ENV_FILE?.trim() ?? "";
    if (!envFile || !existsSync(envFile)) throw new Error("explicit local ENV_FILE required");
    const loaded = loadDotenv({ path: envFile, override: true });
    if (loaded.error) throw new Error("unable to load localized cleanup ENV_FILE");
    assertSafeLocalizedCarouselPublicationEnvironment({
      envFile,
      envFileExists: true,
      nodeEnv: process.env.NODE_ENV,
      deployEnv: process.env.DEPLOY_ENV,
      databaseUrl: process.env.DATABASE_URL,
      redisUrl: process.env.REDIS_URL
    });
    ({ prisma, disconnectPrisma } = await import("../src/prisma/client"));
  });

  afterAll(async () => {
    if (prisma && createdCommandIds.length > 0) {
      await prisma.contentPublicationCommand.deleteMany({
        where: { id: { in: createdCommandIds } }
      });
    }
    if (disconnectPrisma) await disconnectPrisma();
  });

  it("preserves the opposite aggregate command with the same numeric release ID", async () => {
    const marker = `localized-cleanup-it-${randomUUID()}`;
    const releaseId = randomInt(100_000_000, 2_000_000_000);
    const fingerprint = (label: string) =>
      createHash("sha256").update(`${marker}:${label}`).digest("hex");
    const owned = await prisma.contentPublicationCommand.create({
      data: {
        idempotencyKey: `${marker}-owned`,
        requestFingerprint: fingerprint("owned"),
        aggregateType: "CAROUSEL",
        aggregateKey: "carousel:USER_HOME",
        releaseId,
        action: "publish",
        result: { marker, owned: true }
      }
    });
    const opposite = await prisma.contentPublicationCommand.create({
      data: {
        idempotencyKey: `${marker}-opposite`,
        requestFingerprint: fingerprint("opposite"),
        aggregateType: "OFFICIAL_ANNOUNCEMENT",
        aggregateKey: `announcement:${randomUUID()}`,
        releaseId,
        action: "publish",
        result: { marker, owned: false }
      }
    });
    createdCommandIds.push(owned.id, opposite.id);

    await expect(deleteLocalizedPublicationCommandsByExactId(prisma, [owned.id])).resolves.toBe(1);

    const survivors = await prisma.contentPublicationCommand.findMany({
      where: { id: { in: [owned.id, opposite.id] } },
      select: { id: true, aggregateType: true }
    });
    expect(survivors).toEqual([{ id: opposite.id, aggregateType: "OFFICIAL_ANNOUNCEMENT" }]);
  }, 30_000);
});
