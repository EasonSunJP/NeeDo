import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import {
  ScheduleSlotInventoryRepairService,
  assertScheduleSlotRepairDatabaseTarget,
  parseScheduleSlotRepairCommand
} from "../src/services/schedule-slot-inventory-repair.service";

const assert: (condition: unknown, message: string) => asserts condition = (
  condition,
  message
) => {
  if (!condition) throw new Error(message);
};

const summarizeReasons = (entries: Array<{ reasons: string[] }>): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    for (const reason of entry.reasons) counts[reason] = (counts[reason] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
};

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE?.trim();
  assert(envFile, "schedule slot repair requires an explicit ENV_FILE");
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  const loaded = loadDotenv({ path: envFile, override: true });
  assert(!loaded.error, `environment file could not be loaded: ${envFile}`);
  process.env.ENV_FILE = envFile;
  process.env.AUTH_TOKEN_AUDIENCE ??= process.env.SERVICE_NAME;

  const target = assertScheduleSlotRepairDatabaseTarget({
    envFile,
    nodeEnvironment: process.env.NODE_ENV,
    deployEnvironment: process.env.DEPLOY_ENV,
    databaseUrl: process.env.DATABASE_URL
  });
  const command = parseScheduleSlotRepairCommand(process.argv.slice(2));
  const [{ ScheduleSlotInventoryRepairRepository }, { prisma, disconnectPrisma }] =
    await Promise.all([
      import("../src/repositories/schedule-slot-inventory-repair.repository"),
      import("../src/prisma/client")
    ]);
  const service = new ScheduleSlotInventoryRepairService(
    new ScheduleSlotInventoryRepairRepository(prisma)
  );
  const now = new Date();

  try {
    if (command.mode === "preview") {
      const before = {
        liveSlots: await prisma.scheduleSlot.count({ where: { deletedAt: null } }),
        repairAudits: await prisma.auditLog.count({
          where: { action: { startsWith: "schedule_slot.stale_inventory_repair." }, deletedAt: null }
        })
      };
      const preview = await service.preview(command.actorEmail, now);
      const after = {
        liveSlots: await prisma.scheduleSlot.count({ where: { deletedAt: null } }),
        repairAudits: await prisma.auditLog.count({
          where: { action: { startsWith: "schedule_slot.stale_inventory_repair." }, deletedAt: null }
        })
      };
      assert(
        before.liveSlots === after.liveSlots && before.repairAudits === after.repairAudits,
        "schedule slot repair preview changed database state"
      );
      console.log(
        JSON.stringify(
          {
            databaseTarget: target.maskedDatabaseTarget,
            mode: "preview",
            asOf: now.toISOString(),
            actorId: preview.actor.id,
            planDigest: preview.planDigest,
            summary: preview.plan.summary,
            reasonCounts: summarizeReasons(preview.plan.entries),
            protectedSample: preview.plan.entries
              .filter((entry) => entry.kind === "protected")
              .slice(0, 20),
            unmappedSample: preview.plan.entries
              .filter((entry) => entry.kind === "repair_remove")
              .slice(0, 20),
            previewMutationCheck: { before, after, unchanged: true }
          },
          null,
          2
        )
      );
      return;
    }
    if (command.mode === "apply") {
      const result = await service.apply(command.actorEmail, command.planDigest, now);
      console.log(
        JSON.stringify(
          { databaseTarget: target.maskedDatabaseTarget, mode: "apply", asOf: now.toISOString(), ...result },
          null,
          2
        )
      );
      return;
    }
    const result = await service.rollback(command.actorEmail, command.batchId, now);
    console.log(
      JSON.stringify(
        { databaseTarget: target.maskedDatabaseTarget, mode: "rollback", asOf: now.toISOString(), ...result },
        null,
        2
      )
    );
  } finally {
    await disconnectPrisma();
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Schedule slot repair failed.");
  process.exitCode = 1;
});
