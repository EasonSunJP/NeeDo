import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import {
  OrderPerformanceOutcome,
  OrderPerformanceTreatment,
  type PrismaClient
} from "@prisma/client";
import {
  calculateTechnicianPerformance,
  type TechnicianPerformanceProjection
} from "../src/services/order-performance-calculator";

export type TechnicianPerformanceRebuildMode = "dry-run" | "apply";

export type TechnicianPerformanceRebuildSubject = {
  technicianProfileId: number;
  technicianUserId: number;
};

export type TechnicianPerformanceRebuildInspection = {
  technicianProfileId: number;
  current: TechnicianPerformanceProjection | null;
  calculated: TechnicianPerformanceProjection;
  pendingHistoricalCancellationCount: number;
};

export type TechnicianPerformanceRebuildComparison =
  TechnicianPerformanceRebuildInspection & {
    changed: boolean;
  };

export type TechnicianPerformanceRebuildOptions = {
  mode: TechnicianPerformanceRebuildMode;
  batchSize: number;
  technicianProfileId: number | null;
};

export interface TechnicianPerformanceRebuildRuntime {
  scanTechnicians(input: {
    batchSize: number;
    technicianProfileId: number | null;
  }): AsyncIterable<TechnicianPerformanceRebuildSubject[]>;
  inspect(
    subject: TechnicianPerformanceRebuildSubject,
    batchSize: number
  ): Promise<TechnicianPerformanceRebuildInspection>;
  apply(
    subject: TechnicianPerformanceRebuildSubject,
    calculatedAt: Date,
    batchSize: number
  ): Promise<{ classifiedHistoricalCancellationCount: number }>;
}

export type TechnicianPerformanceRebuildReport = {
  generatedAt: string;
  mode: TechnicianPerformanceRebuildMode;
  batchSize: number;
  technicianProfileId: number | null;
  scannedTechnicians: number;
  changedTechnicians: number;
  classifiedHistoricalCancellationCount: number;
  before: TechnicianPerformanceRebuildComparison[];
  after: TechnicianPerformanceRebuildComparison[];
};

export const isAssignedTechnicianHistoricalCancellation = (input: {
  assignedTechnicianUserId: number;
  cancellationActorUserId: number | null;
}): boolean =>
  input.cancellationActorUserId !== null &&
  input.cancellationActorUserId === input.assignedTechnicianUserId;

const projectionsEqual = (
  left: TechnicianPerformanceProjection | null,
  right: TechnicianPerformanceProjection
): boolean =>
  left !== null &&
  left.completedOrderCount === right.completedOrderCount &&
  left.accountableCancellationCount === right.accountableCancellationCount &&
  left.accountableUncompletedCount === right.accountableUncompletedCount &&
  left.specialExcludedCount === right.specialExcludedCount &&
  left.acceptanceRateBps === right.acceptanceRateBps;

const compareInspection = (
  inspection: TechnicianPerformanceRebuildInspection
): TechnicianPerformanceRebuildComparison => ({
  ...inspection,
  changed: !projectionsEqual(inspection.current, inspection.calculated)
});

const collectInspections = async (
  runtime: TechnicianPerformanceRebuildRuntime,
  options: TechnicianPerformanceRebuildOptions
): Promise<{
  comparisons: TechnicianPerformanceRebuildComparison[];
  subjects: TechnicianPerformanceRebuildSubject[];
}> => {
  const comparisons: TechnicianPerformanceRebuildComparison[] = [];
  const subjects: TechnicianPerformanceRebuildSubject[] = [];
  for await (const batch of runtime.scanTechnicians({
    batchSize: options.batchSize,
    technicianProfileId: options.technicianProfileId
  })) {
    for (const subject of batch) {
      subjects.push(subject);
      comparisons.push(compareInspection(await runtime.inspect(subject, options.batchSize)));
    }
  }
  return { comparisons, subjects };
};

export const runTechnicianPerformanceRebuild = async (
  runtime: TechnicianPerformanceRebuildRuntime,
  options: TechnicianPerformanceRebuildOptions
): Promise<TechnicianPerformanceRebuildReport> => {
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 500) {
    throw new Error("batchSize must be an integer from 1 through 500");
  }
  const generatedAt = new Date();
  const initial = await collectInspections(runtime, options);
  let classifiedHistoricalCancellationCount = 0;

  if (options.mode === "apply") {
    for (const subject of initial.subjects) {
      const result = await runtime.apply(subject, generatedAt, options.batchSize);
      classifiedHistoricalCancellationCount += result.classifiedHistoricalCancellationCount;
    }
  }

  const after =
    options.mode === "apply" ? (await collectInspections(runtime, options)).comparisons : [];
  return {
    generatedAt: generatedAt.toISOString(),
    mode: options.mode,
    batchSize: options.batchSize,
    technicianProfileId: options.technicianProfileId,
    scannedTechnicians: initial.comparisons.length,
    changedTechnicians: initial.comparisons.filter((item) => item.changed).length,
    classifiedHistoricalCancellationCount,
    before: initial.comparisons,
    after
  };
};

type HistoricalCancellationCandidate = {
  id: number;
  statusHistory: Array<{
    id: number;
    actorUserId: number | null;
    reason: string | null;
    createdAt: Date;
  }>;
};

export class PrismaTechnicianPerformanceRebuildRuntime
  implements TechnicianPerformanceRebuildRuntime
{
  public constructor(private readonly client: PrismaClient) {}

  public async *scanTechnicians(input: {
    batchSize: number;
    technicianProfileId: number | null;
  }): AsyncIterable<TechnicianPerformanceRebuildSubject[]> {
    let lastId = 0;
    while (true) {
      const profiles = await this.client.technicianProfile.findMany({
        where: {
          deletedAt: null,
          ...(input.technicianProfileId === null
            ? { id: { gt: lastId } }
            : { id: input.technicianProfileId })
        },
        orderBy: { id: "asc" },
        take: input.batchSize,
        select: { id: true, userId: true }
      });
      if (profiles.length === 0) return;
      yield profiles.map((profile) => ({
        technicianProfileId: profile.id,
        technicianUserId: profile.userId
      }));
      if (input.technicianProfileId !== null || profiles.length < input.batchSize) return;
      lastId = profiles[profiles.length - 1].id;
    }
  }

  public async inspect(
    subject: TechnicianPerformanceRebuildSubject,
    batchSize: number
  ): Promise<TechnicianPerformanceRebuildInspection> {
    const [currentSummary, completedOrderCount, groups, pendingHistoricalCancellationCount] =
      await Promise.all([
        this.client.technicianPerformanceSummary.findFirst({
          where: { technicianProfileId: subject.technicianProfileId, deletedAt: null }
        }),
        this.client.bookingOrder.count({
          where: {
            technicianProfileId: subject.technicianProfileId,
            status: "COMPLETED",
            deletedAt: null
          }
        }),
        this.client.orderPerformanceAssessment.groupBy({
          by: ["outcome", "treatment"],
          where: { technicianProfileId: subject.technicianProfileId, deletedAt: null },
          _count: { _all: true }
        }),
        this.countPendingHistoricalCancellations(subject, batchSize)
      ]);

    const countGroup = (
      outcome: OrderPerformanceOutcome | undefined,
      treatment: OrderPerformanceTreatment
    ): number =>
      groups
        .filter(
          (group) =>
            (outcome === undefined || group.outcome === outcome) &&
            group.treatment === treatment
        )
        .reduce((total, group) => total + group._count._all, 0);
    const calculated = calculateTechnicianPerformance({
      completedOrderCount,
      accountableCancellationCount:
        countGroup(
          OrderPerformanceOutcome.TECHNICIAN_CANCELLED,
          OrderPerformanceTreatment.COUNTED
        ) + pendingHistoricalCancellationCount,
      accountableUncompletedCount: countGroup(
        OrderPerformanceOutcome.TECHNICIAN_UNCOMPLETED,
        OrderPerformanceTreatment.COUNTED
      ),
      specialExcludedCount: countGroup(undefined, OrderPerformanceTreatment.SPECIAL_EXCLUDED)
    });

    return {
      technicianProfileId: subject.technicianProfileId,
      current: currentSummary
        ? {
            completedOrderCount: currentSummary.completedOrderCount,
            accountableCancellationCount: currentSummary.accountableCancellationCount,
            accountableUncompletedCount: currentSummary.accountableUncompletedCount,
            specialExcludedCount: currentSummary.specialExcludedCount,
            acceptanceRateBps: currentSummary.acceptanceRateBps
          }
        : null,
      calculated,
      pendingHistoricalCancellationCount
    };
  }

  public async apply(
    subject: TechnicianPerformanceRebuildSubject,
    calculatedAt: Date,
    batchSize: number
  ): Promise<{ classifiedHistoricalCancellationCount: number }> {
    const { OrderPerformanceRepository, classifyAdverseOutcomeInTransaction } = await import(
      "../src/repositories/order-performance.repository"
    );
    let classifiedHistoricalCancellationCount = 0;
    for await (const candidates of this.scanHistoricalCancellationCandidates(subject, batchSize)) {
      for (const candidate of candidates) {
        const cancellationEvent = candidate.statusHistory[candidate.statusHistory.length - 1];
        if (
          !cancellationEvent ||
          !isAssignedTechnicianHistoricalCancellation({
            assignedTechnicianUserId: subject.technicianUserId,
            cancellationActorUserId: cancellationEvent.actorUserId
          })
        ) {
          continue;
        }
        const idempotencyKey = `performance-rebuild:technician-cancelled:order:${candidate.id}`;
        const requestFingerprint = createHash("sha256")
          .update(
            JSON.stringify({
              bookingOrderId: candidate.id,
              technicianProfileId: subject.technicianProfileId,
              actorUserId: cancellationEvent.actorUserId,
              outcome: OrderPerformanceOutcome.TECHNICIAN_CANCELLED
            })
          )
          .digest("hex");
        const result = await this.client.$transaction((transaction) =>
          classifyAdverseOutcomeInTransaction(transaction, {
            bookingOrderId: candidate.id,
            technicianProfileId: subject.technicianProfileId,
            outcome: OrderPerformanceOutcome.TECHNICIAN_CANCELLED,
            actorUserId: cancellationEvent.actorUserId,
            publicReason: cancellationEvent.reason,
            internalNote: null,
            idempotencyKey,
            requestFingerprint,
            expectedRevision: 0,
            calculatedAt
          })
        );
        if (result.outcome === "ok" && !result.replayed) {
          classifiedHistoricalCancellationCount += 1;
        }
      }
    }
    await new OrderPerformanceRepository(this.client).rebuildTechnicianSummary(
      subject.technicianProfileId
    );
    return { classifiedHistoricalCancellationCount };
  }

  private async countPendingHistoricalCancellations(
    subject: TechnicianPerformanceRebuildSubject,
    batchSize: number
  ): Promise<number> {
    let count = 0;
    for await (const candidates of this.scanHistoricalCancellationCandidates(subject, batchSize)) {
      count += candidates.filter((candidate) => {
        const cancellationEvent = candidate.statusHistory[candidate.statusHistory.length - 1];
        return (
          cancellationEvent !== undefined &&
          isAssignedTechnicianHistoricalCancellation({
            assignedTechnicianUserId: subject.technicianUserId,
            cancellationActorUserId: cancellationEvent.actorUserId
          })
        );
      }).length;
    }
    return count;
  }

  private async *scanHistoricalCancellationCandidates(
    subject: TechnicianPerformanceRebuildSubject,
    batchSize: number
  ): AsyncIterable<HistoricalCancellationCandidate[]> {
    let lastId = 0;
    while (true) {
      const candidates = await this.client.bookingOrder.findMany({
        where: {
          id: { gt: lastId },
          technicianProfileId: subject.technicianProfileId,
          status: "CANCELLED",
          deletedAt: null,
          performanceAssessment: { is: null }
        },
        orderBy: { id: "asc" },
        take: batchSize,
        select: {
          id: true,
          statusHistory: {
            where: { toStatus: "CANCELLED", deletedAt: null },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { id: true, actorUserId: true, reason: true, createdAt: true }
          }
        }
      });
      if (candidates.length === 0) return;
      yield candidates;
      if (candidates.length < batchSize) return;
      lastId = candidates[candidates.length - 1].id;
    }
  }
}

export const parseTechnicianPerformanceRebuildArgs = (
  args: string[]
): TechnicianPerformanceRebuildOptions => {
  const dryRun = args.includes("--dry-run");
  const apply = args.includes("--apply");
  if (dryRun && apply) throw new Error("Choose either --dry-run or --apply");
  const knownArgument = (argument: string): boolean =>
    argument === "--dry-run" ||
    argument === "--apply" ||
    argument.startsWith("--batch-size=") ||
    argument.startsWith("--technician-profile-id=");
  const unknown = args.find((argument) => !knownArgument(argument));
  if (unknown) throw new Error(`Unknown argument: ${unknown}`);

  const batchSize = Number(
    args.find((argument) => argument.startsWith("--batch-size="))?.split("=")[1] ?? "100"
  );
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new Error("--batch-size must be an integer from 1 through 500");
  }
  const technicianProfileIdRaw = args
    .find((argument) => argument.startsWith("--technician-profile-id="))
    ?.split("=")[1];
  const technicianProfileId =
    technicianProfileIdRaw === undefined ? null : Number(technicianProfileIdRaw);
  if (
    technicianProfileId !== null &&
    (!Number.isInteger(technicianProfileId) || technicianProfileId < 1)
  ) {
    throw new Error("--technician-profile-id must be a positive integer");
  }
  return { mode: apply ? "apply" : "dry-run", batchSize, technicianProfileId };
};

const loadScriptEnvironment = (): void => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  if (existsSync(envFile)) loadDotenv({ path: envFile });
};

const main = async (): Promise<void> => {
  loadScriptEnvironment();
  const options = parseTechnicianPerformanceRebuildArgs(process.argv.slice(2));
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");
  try {
    const report = await runTechnicianPerformanceRebuild(
      new PrismaTechnicianPerformanceRebuildRuntime(prisma),
      options
    );
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (options.mode === "apply" && report.after.some((item) => item.changed)) {
      process.exitCode = 1;
    }
  } finally {
    await disconnectPrisma();
  }
};

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
