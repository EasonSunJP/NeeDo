import type { ScheduleSlotRepairPlan } from "../domain/schedule-slot-inventory-repair";
import { digestScheduleSlotRepairPlan } from "../domain/schedule-slot-inventory-repair";

export interface ScheduleSlotRepairDatabaseSafetyInput {
  envFile: string;
  nodeEnvironment?: string;
  deployEnvironment?: string;
  databaseUrl?: string;
}

export interface ScheduleSlotRepairDatabaseTarget {
  envFile: string;
  databaseName: "needo_dev" | "needo_test";
  maskedDatabaseTarget: string;
}

export type ScheduleSlotRepairCommand =
  | { mode: "preview"; actorEmail: string }
  | { mode: "apply"; actorEmail: string; planDigest: string }
  | { mode: "rollback"; actorEmail: string; batchId: string };

export interface ScheduleSlotInventoryRepairRepositoryPort {
  findAuthorizedActor(email: string): Promise<{ id: number; email: string } | null>;
  buildPlan(now: Date): Promise<ScheduleSlotRepairPlan>;
  applyPlan(input: {
    actorId: number;
    now: Date;
    plan: ScheduleSlotRepairPlan;
    planDigest: string;
  }): Promise<{ batchId: string; replaced: number; removed: number }>;
  rollbackBatch(input: {
    actorId: number;
    batchId: string;
    now: Date;
  }): Promise<{ batchId: string; restored: number; replacementsRemoved: number }>;
}

const assert: (condition: unknown, message: string) => asserts condition = (
  condition,
  message
) => {
  if (!condition) throw new Error(message);
};

export const parseScheduleSlotRepairCommand = (args: string[]): ScheduleSlotRepairCommand => {
  const valueAfter = (flag: string): string | undefined => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const modes = ["--preview", "--apply", "--rollback"].filter((flag) => args.includes(flag));
  assert(modes.length === 1, "schedule slot repair requires exactly one mode");
  const actorEmail = valueAfter("--actor-email")?.trim().toLowerCase();
  assert(actorEmail, "schedule slot repair requires --actor-email");
  const mode = modes[0];
  if (mode === "--preview") return { mode: "preview", actorEmail };
  if (mode === "--apply") {
    const planDigest = valueAfter("--plan-digest")?.trim().toLowerCase();
    assert(
      planDigest && /^[a-f0-9]{64}$/u.test(planDigest),
      "schedule slot repair apply requires a 64-character plan digest"
    );
    return { mode: "apply", actorEmail, planDigest };
  }
  const batchId = valueAfter("--rollback")?.trim();
  assert(
    batchId && /^[a-z0-9][a-z0-9-]{0,79}$/iu.test(batchId),
    "schedule slot repair rollback requires a valid batch id"
  );
  return { mode: "rollback", actorEmail, batchId };
};

export const assertScheduleSlotRepairDatabaseTarget = (
  input: ScheduleSlotRepairDatabaseSafetyInput
): ScheduleSlotRepairDatabaseTarget => {
  const nodeEnvironment = (input.nodeEnvironment ?? "").trim().toLowerCase();
  const deployEnvironment = (input.deployEnvironment ?? "").trim().toLowerCase();
  assert(
    !["production", "prod", "staging"].includes(nodeEnvironment) &&
      !["production", "prod", "staging"].includes(deployEnvironment),
    "schedule slot repair rejects production and staging runtimes"
  );
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(input.databaseUrl ?? "");
  } catch {
    throw new Error("schedule slot repair requires a valid DATABASE_URL");
  }
  assert(databaseUrl.protocol === "mysql:", "schedule slot repair only accepts MySQL");
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname),
    "schedule slot repair only accepts a local MySQL host"
  );
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ""));
  assert(
    databaseName === "needo_dev" || databaseName === "needo_test",
    "schedule slot repair only accepts needo_dev or needo_test"
  );
  return {
    envFile: input.envFile,
    databaseName,
    maskedDatabaseTarget: `mysql://${databaseUrl.hostname}${databaseUrl.port ? `:${databaseUrl.port}` : ""}/${databaseName}`
  };
};

export class ScheduleSlotInventoryRepairService {
  public constructor(private readonly repository: ScheduleSlotInventoryRepairRepositoryPort) {}

  public async preview(actorEmail: string, now: Date) {
    const actor = await this.requireAuthorizedActor(actorEmail);
    const plan = await this.repository.buildPlan(now);
    return { actor, plan, planDigest: digestScheduleSlotRepairPlan(plan) };
  }

  public async apply(actorEmail: string, planDigest: string, now: Date) {
    const actor = await this.requireAuthorizedActor(actorEmail);
    const plan = await this.repository.buildPlan(now);
    const currentDigest = digestScheduleSlotRepairPlan(plan);
    if (currentDigest !== planDigest) {
      throw new Error("schedule slot repair plan digest does not match the current database state");
    }
    return this.repository.applyPlan({ actorId: actor.id, now, plan, planDigest });
  }

  public async rollback(actorEmail: string, batchId: string, now: Date) {
    const actor = await this.requireAuthorizedActor(actorEmail);
    return this.repository.rollbackBatch({ actorId: actor.id, batchId, now });
  }

  private async requireAuthorizedActor(email: string): Promise<{ id: number; email: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    assert(normalizedEmail, "schedule slot repair requires --actor-email");
    const actor = await this.repository.findAuthorizedActor(normalizedEmail);
    assert(
      actor,
      "schedule slot repair requires an active administrator with schedule:slots:write"
    );
    return actor;
  }
}
