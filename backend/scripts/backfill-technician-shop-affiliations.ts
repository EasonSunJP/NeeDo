import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import type { PrismaClient } from "@prisma/client";

export type TechnicianShopAffiliationBackfillMode = "dry-run" | "apply";
export type TechnicianShopAffiliationBackfillRelationshipType = "EXCLUSIVE" | "PARTNER";
export type TechnicianShopAffiliationBackfillWorkStatus = "ACTIVE" | "ON_LEAVE" | "SUSPENDED";

export interface TechnicianShopAffiliationBackfillCurrentAffiliation {
  shopId: number;
  relationshipType: TechnicianShopAffiliationBackfillRelationshipType;
  workStatus: TechnicianShopAffiliationBackfillWorkStatus;
  activeKey: string | null;
}

export interface TechnicianShopAffiliationBackfillSnapshot {
  technicianProfileId: number;
  shopId: number | null;
  employmentType: "INDEPENDENT" | "FULL_TIME" | "TEMPORARY";
  employmentStartedAt: Date | null;
  createdAt: Date;
  profileStatus: string;
  shopActive: boolean;
  technicianPublicIds: string[];
  hasBusinessEvidence: boolean;
  hasApprovedApplicationEvidence: boolean;
  hasMerchantIdentityAtShop: boolean;
  currentAffiliations: TechnicianShopAffiliationBackfillCurrentAffiliation[];
}

export interface TechnicianShopAffiliationBackfillBatch {
  technicians: TechnicianShopAffiliationBackfillSnapshot[];
}

export type TechnicianShopAffiliationBackfillIssueCode =
  | "TECHNICIAN_PUBLIC_ID_MISSING"
  | "TECHNICIAN_PUBLIC_ID_AMBIGUOUS"
  | "SHOP_NOT_ACTIVE"
  | "INDEPENDENT_RELATION_UNVERIFIED"
  | "AFFILIATION_MISMATCH"
  | "EXCLUSIVE_CONFLICT";

export interface TechnicianShopAffiliationBackfillIssue {
  technicianProfileId: number;
  code: TechnicianShopAffiliationBackfillIssueCode;
}

export interface TechnicianShopAffiliationBackfillOperation {
  technicianProfileId: number;
  shopId: number;
  relationshipType: TechnicianShopAffiliationBackfillRelationshipType;
  startsAt: Date;
  activeKey: string;
}

export interface TechnicianShopAffiliationBackfillPlan {
  operations: TechnicianShopAffiliationBackfillOperation[];
  issues: TechnicianShopAffiliationBackfillIssue[];
  skippedUnassigned: number;
  skippedNonEmployeeProfiles: number;
  alreadyCovered: number;
}

export interface TechnicianShopAffiliationBackfillRuntime {
  scan(batchSize: number): AsyncIterable<TechnicianShopAffiliationBackfillBatch>;
  applyOperations(
    operations: readonly TechnicianShopAffiliationBackfillOperation[]
  ): Promise<number>;
}

export interface TechnicianShopAffiliationBackfillOptions {
  mode: TechnicianShopAffiliationBackfillMode;
  batchSize: number;
}

export interface TechnicianShopAffiliationBackfillCounts {
  batches: number;
  scannedTechnicians: number;
  skippedUnassigned: number;
  skippedNonEmployeeProfiles: number;
  alreadyCovered: number;
  pendingOperations: number;
}

export interface TechnicianShopAffiliationBackfillReport {
  generatedAt: string;
  mode: TechnicianShopAffiliationBackfillMode;
  batchSize: number;
  plannedOperations: number;
  mutatedRows: number;
  before: TechnicianShopAffiliationBackfillCounts;
  after: TechnicianShopAffiliationBackfillCounts;
  issues: TechnicianShopAffiliationBackfillIssue[];
}

interface BackfillSummary {
  counts: TechnicianShopAffiliationBackfillCounts;
  operations: TechnicianShopAffiliationBackfillOperation[];
  issues: TechnicianShopAffiliationBackfillIssue[];
}

export class TechnicianShopAffiliationBackfillBlockedError extends Error {
  public constructor(public readonly report: TechnicianShopAffiliationBackfillReport) {
    super("Technician shop affiliation backfill is blocked by audit issues.");
    this.name = "TechnicianShopAffiliationBackfillBlockedError";
  }
}

const activeKey = (technicianProfileId: number, shopId: number): string =>
  `technician:${technicianProfileId}:shop:${shopId}`;

const intendedRelationship = (
  technician: TechnicianShopAffiliationBackfillSnapshot
): TechnicianShopAffiliationBackfillRelationshipType | null => {
  if (technician.employmentType === "FULL_TIME") return "EXCLUSIVE";
  if (technician.employmentType === "TEMPORARY") return "PARTNER";
  return technician.hasBusinessEvidence || technician.hasApprovedApplicationEvidence
    ? "PARTNER"
    : null;
};

const issue = (
  technicianProfileId: number,
  code: TechnicianShopAffiliationBackfillIssueCode
): TechnicianShopAffiliationBackfillIssue => ({ technicianProfileId, code });

export const planTechnicianShopAffiliationBackfill = (
  batch: TechnicianShopAffiliationBackfillBatch
): TechnicianShopAffiliationBackfillPlan => {
  const operations: TechnicianShopAffiliationBackfillOperation[] = [];
  const issues: TechnicianShopAffiliationBackfillIssue[] = [];
  let skippedUnassigned = 0;
  let skippedNonEmployeeProfiles = 0;
  let alreadyCovered = 0;

  for (const technician of batch.technicians) {
    if (technician.shopId === null) {
      skippedUnassigned += 1;
      continue;
    }
    if (technician.technicianPublicIds.length === 0) {
      issues.push(issue(technician.technicianProfileId, "TECHNICIAN_PUBLIC_ID_MISSING"));
      continue;
    }
    if (technician.technicianPublicIds.length > 1) {
      issues.push(issue(technician.technicianProfileId, "TECHNICIAN_PUBLIC_ID_AMBIGUOUS"));
      continue;
    }
    if (!technician.shopActive) {
      issues.push(issue(technician.technicianProfileId, "SHOP_NOT_ACTIVE"));
      continue;
    }
    if (
      technician.employmentType === "INDEPENDENT" &&
      !technician.hasBusinessEvidence &&
      !technician.hasApprovedApplicationEvidence &&
      technician.profileStatus === "private" &&
      technician.hasMerchantIdentityAtShop
    ) {
      skippedNonEmployeeProfiles += 1;
      continue;
    }

    const relationshipType = intendedRelationship(technician);
    if (!relationshipType) {
      issues.push(issue(technician.technicianProfileId, "INDEPENDENT_RELATION_UNVERIFIED"));
      continue;
    }

    const current = technician.currentAffiliations;
    const sameShop = current.filter((affiliation) => affiliation.shopId === technician.shopId);
    const otherShop = current.filter((affiliation) => affiliation.shopId !== technician.shopId);
    const hasExclusive = current.some(
      (affiliation) => affiliation.relationshipType === "EXCLUSIVE"
    );

    if (
      (relationshipType === "EXCLUSIVE" && otherShop.length > 0) ||
      (relationshipType === "PARTNER" && hasExclusive)
    ) {
      issues.push(issue(technician.technicianProfileId, "EXCLUSIVE_CONFLICT"));
      continue;
    }

    if (sameShop.length > 1) {
      issues.push(issue(technician.technicianProfileId, "AFFILIATION_MISMATCH"));
      continue;
    }

    if (sameShop.length === 1) {
      const existing = sameShop[0];
      if (
        existing.relationshipType !== relationshipType ||
        existing.activeKey !== activeKey(technician.technicianProfileId, technician.shopId)
      ) {
        issues.push(issue(technician.technicianProfileId, "AFFILIATION_MISMATCH"));
        continue;
      }
      alreadyCovered += 1;
      continue;
    }

    operations.push({
      technicianProfileId: technician.technicianProfileId,
      shopId: technician.shopId,
      relationshipType,
      startsAt: technician.employmentStartedAt ?? technician.createdAt,
      activeKey: activeKey(technician.technicianProfileId, technician.shopId)
    });
  }

  return {
    operations,
    issues,
    skippedUnassigned,
    skippedNonEmployeeProfiles,
    alreadyCovered
  };
};

const summarize = async (
  runtime: TechnicianShopAffiliationBackfillRuntime,
  batchSize: number
): Promise<BackfillSummary> => {
  const summary: BackfillSummary = {
    counts: {
      batches: 0,
      scannedTechnicians: 0,
      skippedUnassigned: 0,
      skippedNonEmployeeProfiles: 0,
      alreadyCovered: 0,
      pendingOperations: 0
    },
    operations: [],
    issues: []
  };

  for await (const batch of runtime.scan(batchSize)) {
    const plan = planTechnicianShopAffiliationBackfill(batch);
    summary.counts.batches += 1;
    summary.counts.scannedTechnicians += batch.technicians.length;
    summary.counts.skippedUnassigned += plan.skippedUnassigned;
    summary.counts.skippedNonEmployeeProfiles += plan.skippedNonEmployeeProfiles;
    summary.counts.alreadyCovered += plan.alreadyCovered;
    summary.operations.push(...plan.operations);
    summary.issues.push(...plan.issues);
  }
  summary.counts.pendingOperations = summary.operations.length;
  return summary;
};

const createReport = (
  options: TechnicianShopAffiliationBackfillOptions,
  before: BackfillSummary,
  after: BackfillSummary,
  mutatedRows: number
): TechnicianShopAffiliationBackfillReport => ({
  generatedAt: new Date().toISOString(),
  mode: options.mode,
  batchSize: options.batchSize,
  plannedOperations: before.operations.length,
  mutatedRows,
  before: before.counts,
  after: after.counts,
  issues: after.issues
});

export const runTechnicianShopAffiliationBackfill = async (
  runtime: TechnicianShopAffiliationBackfillRuntime,
  options: TechnicianShopAffiliationBackfillOptions
): Promise<TechnicianShopAffiliationBackfillReport> => {
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 500) {
    throw new Error("batchSize must be an integer from 1 through 500");
  }

  const before = await summarize(runtime, options.batchSize);
  if (options.mode === "dry-run") {
    return createReport(options, before, before, 0);
  }
  if (before.issues.length > 0) {
    const report = createReport(options, before, before, 0);
    throw new TechnicianShopAffiliationBackfillBlockedError(report);
  }

  let mutatedRows = 0;
  for (let index = 0; index < before.operations.length; index += options.batchSize) {
    mutatedRows += await runtime.applyOperations(
      before.operations.slice(index, index + options.batchSize)
    );
  }
  const after = await summarize(runtime, options.batchSize);
  return createReport(options, before, after, mutatedRows);
};

const evidenceKey = (technicianProfileId: number, shopId: number): string =>
  `${technicianProfileId}:${shopId}`;

export class PrismaTechnicianShopAffiliationBackfillRuntime implements TechnicianShopAffiliationBackfillRuntime {
  public constructor(private readonly client: PrismaClient) {}

  public async *scan(batchSize: number): AsyncIterable<TechnicianShopAffiliationBackfillBatch> {
    let lastId: number | undefined;

    while (true) {
      const profiles = await this.client.technicianProfile.findMany({
        where: {
          deletedAt: null,
          ...(lastId === undefined ? {} : { id: { gt: lastId } })
        },
        orderBy: { id: "asc" },
        take: batchSize,
        select: {
          id: true,
          shopId: true,
          employmentType: true,
          employmentStartedAt: true,
          createdAt: true,
          status: true,
          shop: { select: { status: true, deletedAt: true } },
          user: {
            select: {
              isActive: true,
              deletedAt: true,
              identities: {
                where: {
                  isActive: true,
                  deletedAt: null
                },
                select: {
                  type: true,
                  scopeType: true,
                  scopeId: true,
                  publicIdentifier: {
                    select: { publicId: true, kind: true, status: true, deletedAt: true }
                  }
                }
              },
              identityApplications: {
                where: {
                  type: "technician",
                  status: "approved",
                  deletedAt: null
                },
                select: {
                  technicianDetail: {
                    select: { targetShopId: true, deletedAt: true }
                  }
                }
              }
            }
          },
          technicianShopAffiliations: {
            where: {
              deletedAt: null,
              workStatus: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] }
            },
            select: {
              shopId: true,
              relationshipType: true,
              workStatus: true,
              activeKey: true
            }
          }
        }
      });
      if (profiles.length === 0) break;

      const profileIds = profiles.map((profile) => profile.id);
      const [technicianServices, services, bookings, scheduleSlots, compensationProfiles] =
        await Promise.all([
          this.client.technicianService.findMany({
            where: { technicianId: { in: profileIds }, isActive: true, deletedAt: null },
            select: { technicianId: true, shopId: true }
          }),
          this.client.service.findMany({
            where: {
              technicianProfileId: { in: profileIds },
              status: { not: "archived" },
              deletedAt: null
            },
            select: { technicianProfileId: true, shopId: true }
          }),
          this.client.bookingOrder.findMany({
            where: { technicianProfileId: { in: profileIds }, deletedAt: null },
            select: { technicianProfileId: true, shopId: true }
          }),
          this.client.scheduleSlot.findMany({
            where: { technicianProfileId: { in: profileIds }, deletedAt: null },
            select: { technicianProfileId: true, shopId: true }
          }),
          this.client.technicianCompensationProfile.findMany({
            where: {
              technicianProfileId: { in: profileIds },
              status: "active",
              deletedAt: null
            },
            select: { technicianProfileId: true, shopId: true }
          })
        ]);

      const evidence = new Set<string>();
      for (const row of technicianServices) {
        if (row.shopId !== null) {
          evidence.add(evidenceKey(row.technicianId, row.shopId));
        }
      }
      for (const row of [...services, ...bookings, ...scheduleSlots, ...compensationProfiles]) {
        if (row.technicianProfileId !== null && row.shopId !== null) {
          evidence.add(evidenceKey(row.technicianProfileId, row.shopId));
        }
      }

      yield {
        technicians: profiles.map((profile) => ({
          technicianProfileId: profile.id,
          shopId: profile.shopId,
          employmentType: profile.employmentType,
          employmentStartedAt: profile.employmentStartedAt,
          createdAt: profile.createdAt,
          profileStatus: profile.status,
          shopActive:
            profile.shop !== null &&
            profile.shop.deletedAt === null &&
            profile.shop.status !== "archived",
          technicianPublicIds:
            profile.user.isActive && profile.user.deletedAt === null
              ? profile.user.identities.flatMap((identity) => {
                  const identifier = identity.publicIdentifier;
                  return identity.type === "technician" &&
                    identifier?.kind === "S" &&
                    identifier.status === "ACTIVE" &&
                    identifier.deletedAt === null
                    ? [identifier.publicId]
                    : [];
                })
              : [],
          hasBusinessEvidence:
            profile.shopId !== null && evidence.has(evidenceKey(profile.id, profile.shopId)),
          hasApprovedApplicationEvidence:
            profile.shopId !== null &&
            profile.user.identityApplications.some(
              (application) =>
                application.technicianDetail?.deletedAt === null &&
                application.technicianDetail.targetShopId === profile.shopId
            ),
          hasMerchantIdentityAtShop:
            profile.shopId !== null &&
            profile.user.identities.some(
              (identity) =>
                ["merchant", "merchant_owner", "merchant_staff"].includes(identity.type) &&
                identity.scopeType === "shop" &&
                identity.scopeId === profile.shopId
            ),
          currentAffiliations: profile.technicianShopAffiliations.flatMap((affiliation) =>
            affiliation.workStatus === "ENDED"
              ? []
              : [
                  {
                    shopId: affiliation.shopId,
                    relationshipType: affiliation.relationshipType,
                    workStatus: affiliation.workStatus,
                    activeKey: affiliation.activeKey
                  }
                ]
          )
        }))
      };

      lastId = profiles[profiles.length - 1].id;
    }
  }

  public async applyOperations(
    operations: readonly TechnicianShopAffiliationBackfillOperation[]
  ): Promise<number> {
    if (operations.length === 0) return 0;
    const result = await this.client.technicianShopAffiliation.createMany({
      data: operations.map((operation) => ({
        technicianProfileId: operation.technicianProfileId,
        shopId: operation.shopId,
        relationshipType: operation.relationshipType,
        workStatus: "ACTIVE" as const,
        startsAt: operation.startsAt,
        endsAt: null,
        activeKey: operation.activeKey
      })),
      skipDuplicates: true
    });
    return result.count;
  }
}

const parseArguments = (args: string[]): TechnicianShopAffiliationBackfillOptions => {
  const modeRaw = args.find((argument) => argument.startsWith("--mode="))?.split("=")[1];
  const batchSizeRaw = args.find((argument) => argument.startsWith("--batch-size="))?.split("=")[1];
  const mode = modeRaw ?? "dry-run";
  const batchSize = Number(batchSizeRaw ?? "100");
  if (mode !== "dry-run" && mode !== "apply") {
    throw new Error("--mode must be dry-run or apply");
  }
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new Error("--batch-size must be an integer from 1 through 500");
  }
  return { mode, batchSize };
};

const loadScriptEnvironment = (): void => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  if (existsSync(envFile)) loadDotenv({ path: envFile });
};

const main = async (): Promise<void> => {
  loadScriptEnvironment();
  const options = parseArguments(process.argv.slice(2));
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");
  try {
    const report = await runTechnicianShopAffiliationBackfill(
      new PrismaTechnicianShopAffiliationBackfillRuntime(prisma),
      options
    );
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (
      report.issues.length > 0 ||
      (options.mode === "apply" && report.after.pendingOperations > 0)
    ) {
      process.exitCode = 1;
    }
  } finally {
    await disconnectPrisma();
  }
};

if (require.main === module) {
  void main().catch((error: unknown) => {
    if (error instanceof TechnicianShopAffiliationBackfillBlockedError) {
      process.stderr.write(`${JSON.stringify(error.report, null, 2)}\n`);
    } else {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
    }
    process.exitCode = 1;
  });
}
