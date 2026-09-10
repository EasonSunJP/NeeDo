import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";

import { Prisma, type PrismaClient } from "@prisma/client";
import { config as loadDotenv } from "dotenv";

import { ADMINISTRATIVE_REGION_DATASET_VERSION } from "../src/repositories/administrative-region.repository";
import { verifyShopServiceLocationInTransaction } from "../src/repositories/shop-service-location.repository";

export interface LifeDanceShopServiceLocationRepairTarget {
  shopName: string;
  ownerEmail: string;
  serviceLocation: {
    countryCode: "JP";
    admin1Code: string;
    admin2Code: string;
  };
}

interface PersistedLocationSnapshot {
  id: number;
  countryCode: string;
  admin1RegionId: number;
  admin2RegionId: number;
  datasetVersion: string;
  verifiedAt: Date;
  verifiedById: number | null;
  deletedAt: Date | null;
}

interface ShopLookupRow {
  id: number;
  name: string;
  owner: { email: string } | null;
  serviceLocation:
    | (PersistedLocationSnapshot & {
        admin1Region: { id: number; officialCode: string; deletedAt: Date | null };
        admin2Region: {
          id: number;
          officialCode: string;
          parentId: number | null;
          deletedAt: Date | null;
        };
      })
    | null;
}

interface ShopLookupClient {
  shop: {
    findMany: (args: unknown) => Promise<ShopLookupRow[]>;
  };
}

export interface LifeDanceShopServiceLocationRepairPlanRow {
  shopId: number;
  shopName: string;
  ownerEmail: string;
  status: "current" | "missing" | "invalid";
  serviceLocation: LifeDanceShopServiceLocationRepairTarget["serviceLocation"];
  before: PersistedLocationSnapshot | null;
}

export interface LifeDanceShopServiceLocationRepairPlan {
  targetCount: number;
  repairCount: number;
  rows: LifeDanceShopServiceLocationRepairPlanRow[];
}

export type LifeDanceShopServiceLocationRepairArguments =
  | { mode: "preview" }
  | { mode: "apply"; confirmCount: number }
  | { mode: "restore"; restoreRunId: string };

interface SerializedLocationSnapshot extends Omit<PersistedLocationSnapshot, "verifiedAt" | "deletedAt"> {
  verifiedAt: string;
  deletedAt: string | null;
}

interface AppliedLocationSnapshot {
  countryCode: string;
  admin1RegionId: number;
  admin2RegionId: number;
  datasetVersion: string;
  verifiedAt: string;
  verifiedById: number;
}

interface RepairManifestRow {
  shopId: number;
  before: SerializedLocationSnapshot | null;
  applied: AppliedLocationSnapshot;
}

const APPLY_ACTION = "shop_service_location.lifedance_repair.apply";
const RESTORE_ACTION = "shop_service_location.lifedance_repair.restore";
const AUDIT_TARGET = "LifeDanceShopServiceLocationRepair";
const runIdPattern = /^(?=.{3,80}$)[A-Za-z0-9][A-Za-z0-9._:-]*$/u;

const requireRunId = (value: string): string => {
  if (!runIdPattern.test(value)) throw new Error("invalid repair run id");
  return value;
};

export const parseLifeDanceShopServiceLocationRepairArguments = (
  args: readonly string[]
): LifeDanceShopServiceLocationRepairArguments => {
  if (args.length === 0) return { mode: "preview" };
  const restore = args.find((argument) => argument.startsWith("--restore-run="));
  if (restore) {
    if (args.length !== 1) throw new Error("--restore-run cannot be combined with other arguments");
    return { mode: "restore", restoreRunId: requireRunId(restore.slice("--restore-run=".length)) };
  }
  if (!args.includes("--apply")) throw new Error("unknown repair argument");
  const confirmation = args.find((argument) => argument.startsWith("--confirm-count="));
  if (!confirmation) throw new Error("--confirm-count is required with --apply");
  if (args.length !== 2) throw new Error("--apply requires exactly one --confirm-count argument");
  const rawCount = confirmation.slice("--confirm-count=".length);
  if (!/^\d+$/u.test(rawCount)) throw new Error("--confirm-count must be a non-negative integer");
  const confirmCount = Number(rawCount);
  if (!Number.isSafeInteger(confirmCount)) {
    throw new Error("--confirm-count must be a non-negative integer");
  }
  return { mode: "apply", confirmCount };
};

const locationIsCurrent = (
  row: ShopLookupRow["serviceLocation"],
  target: LifeDanceShopServiceLocationRepairTarget
): boolean =>
  Boolean(
    row &&
      row.deletedAt === null &&
      row.countryCode === target.serviceLocation.countryCode &&
      row.datasetVersion === ADMINISTRATIVE_REGION_DATASET_VERSION &&
      row.admin1Region.deletedAt === null &&
      row.admin1Region.officialCode === target.serviceLocation.admin1Code &&
      row.admin2Region.deletedAt === null &&
      row.admin2Region.officialCode === target.serviceLocation.admin2Code &&
      row.admin2Region.parentId === row.admin1Region.id
  );

export const buildLifeDanceShopServiceLocationRepairPlan = async (
  client: ShopLookupClient,
  targets: readonly LifeDanceShopServiceLocationRepairTarget[]
): Promise<LifeDanceShopServiceLocationRepairPlan> => {
  const shops = await client.shop.findMany({
    where: {
      OR: targets.map((target) => ({
        name: target.shopName,
        owner: { email: target.ownerEmail }
      })),
      deletedAt: null
    },
    select: {
      id: true,
      name: true,
      owner: { select: { email: true } },
      serviceLocation: {
        select: {
          id: true,
          countryCode: true,
          admin1RegionId: true,
          admin2RegionId: true,
          datasetVersion: true,
          verifiedAt: true,
          verifiedById: true,
          deletedAt: true,
          admin1Region: { select: { id: true, officialCode: true, deletedAt: true } },
          admin2Region: {
            select: { id: true, officialCode: true, parentId: true, deletedAt: true }
          }
        }
      }
    }
  });
  const identityKey = (shopName: string, ownerEmail: string): string =>
    `${shopName}\u0000${ownerEmail}`;
  const shopByIdentity = new Map<string, ShopLookupRow>();
  for (const shop of shops) {
    if (!shop.owner) continue;
    const key = identityKey(shop.name, shop.owner.email);
    if (shopByIdentity.has(key)) throw new Error("shop identity is not unique");
    shopByIdentity.set(key, shop);
  }
  const rows = targets.map((target): LifeDanceShopServiceLocationRepairPlanRow => {
    const shop = shopByIdentity.get(identityKey(target.shopName, target.ownerEmail));
    if (!shop) throw new Error("shop identity was not found");
    const current = shop.serviceLocation;
    return {
      shopId: shop.id,
      shopName: target.shopName,
      ownerEmail: target.ownerEmail,
      status: locationIsCurrent(current, target) ? "current" : current ? "invalid" : "missing",
      serviceLocation: target.serviceLocation,
      before: current
        ? {
            id: current.id,
            countryCode: current.countryCode,
            admin1RegionId: current.admin1RegionId,
            admin2RegionId: current.admin2RegionId,
            datasetVersion: current.datasetVersion,
            verifiedAt: current.verifiedAt,
            verifiedById: current.verifiedById,
            deletedAt: current.deletedAt
          }
        : null
    };
  });

  return {
    targetCount: rows.length,
    repairCount: rows.filter((row) => row.status !== "current").length,
    rows
  };
};

const serializeSnapshot = (
  snapshot: PersistedLocationSnapshot | null
): SerializedLocationSnapshot | null =>
  snapshot
    ? {
        ...snapshot,
        verifiedAt: snapshot.verifiedAt.toISOString(),
        deletedAt: snapshot.deletedAt?.toISOString() ?? null
      }
    : null;

const createRunId = (): string => {
  const timestamp = new Date().toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
  return `${timestamp}-${randomBytes(3).toString("hex")}`;
};

const assertSameRepairTargets = (
  preview: LifeDanceShopServiceLocationRepairPlan,
  locked: LifeDanceShopServiceLocationRepairPlan
): void => {
  const previewState = preview.rows.map((row) => ({
    shopId: row.shopId,
    status: row.status,
    before: row.before,
    serviceLocation: row.serviceLocation
  }));
  const lockedState = locked.rows.map((row) => ({
    shopId: row.shopId,
    status: row.status,
    before: row.before,
    serviceLocation: row.serviceLocation
  }));
  if (JSON.stringify(previewState) !== JSON.stringify(lockedState)) {
    throw new Error("repair refused concurrent service-location drift");
  }
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const readManifest = (metadata: unknown, runId: string): RepairManifestRow[] => {
  const record = asRecord(metadata);
  if (record?.runId !== runId || !Array.isArray(record.manifest)) {
    throw new Error("repair apply audit manifest is invalid");
  }
  return record.manifest as unknown as RepairManifestRow[];
};

const appliedSnapshotMatches = (
  current: PersistedLocationSnapshot | null,
  applied: AppliedLocationSnapshot
): boolean =>
  Boolean(
    current &&
      current.deletedAt === null &&
      current.countryCode === applied.countryCode &&
      current.admin1RegionId === applied.admin1RegionId &&
      current.admin2RegionId === applied.admin2RegionId &&
      current.datasetVersion === applied.datasetVersion &&
      current.verifiedAt.toISOString() === applied.verifiedAt &&
      current.verifiedById === applied.verifiedById
  );

export const applyLifeDanceShopServiceLocationRepair = async (
  client: PrismaClient,
  targets: readonly LifeDanceShopServiceLocationRepairTarget[],
  preview: LifeDanceShopServiceLocationRepairPlan,
  verifiedById: number,
  runId = createRunId()
): Promise<{ runId: string; writeCount: number; auditId: number }> => {
  const safeRunId = requireRunId(runId);
  if (preview.repairCount === 0) throw new Error("no service-location repairs are required");
  return client.$transaction(async (transaction) => {
    await transaction.$queryRaw(Prisma.sql`
      SELECT id FROM shops
      WHERE id IN (${Prisma.join(preview.rows.map((row) => row.shopId))})
      ORDER BY id ASC
      FOR UPDATE
    `);
    const lockedPlan = await buildLifeDanceShopServiceLocationRepairPlan(
      transaction as unknown as ShopLookupClient,
      targets
    );
    assertSameRepairTargets(preview, lockedPlan);
    const appliedAt = new Date();
    const manifest: RepairManifestRow[] = [];
    for (const row of lockedPlan.rows.filter((candidate) => candidate.status !== "current")) {
      const scope = await verifyShopServiceLocationInTransaction(transaction, {
        shopId: row.shopId,
        verifiedById,
        serviceLocation: row.serviceLocation,
        verifiedAt: appliedAt,
        auditAction: "repair.shop.service_location.verify",
        auditMetadata: { runId: safeRunId }
      });
      manifest.push({
        shopId: row.shopId,
        before: serializeSnapshot(row.before),
        applied: {
          countryCode: scope.countryCode,
          admin1RegionId: scope.admin1RegionId,
          admin2RegionId: scope.admin2RegionId,
          datasetVersion: scope.datasetVersion,
          verifiedAt: appliedAt.toISOString(),
          verifiedById
        }
      });
    }
    const audit = await transaction.auditLog.create({
      data: {
        actorId: verifiedById,
        action: APPLY_ACTION,
        targetType: AUDIT_TARGET,
        metadata: { runId: safeRunId, manifest } as unknown as Prisma.InputJsonValue
      }
    });
    return { runId: safeRunId, writeCount: manifest.length, auditId: audit.id };
  });
};

export const restoreLifeDanceShopServiceLocationRepair = async (
  client: PrismaClient,
  restoreRunId: string,
  restoredById: number
): Promise<{ restoreRunId: string; writeCount: number; auditId: number }> => {
  const safeRunId = requireRunId(restoreRunId);
  const applyAudits = await client.auditLog.findMany({
    where: { action: APPLY_ACTION, targetType: AUDIT_TARGET, deletedAt: null },
    select: { metadata: true },
    orderBy: { id: "desc" },
    take: 100
  });
  const sourceAudit = applyAudits.find((audit) => asRecord(audit.metadata)?.runId === safeRunId);
  if (!sourceAudit) throw new Error("repair apply audit was not found");
  const manifest = readManifest(sourceAudit.metadata, safeRunId);

  return client.$transaction(async (transaction) => {
    await transaction.$queryRaw(Prisma.sql`
      SELECT id FROM shops
      WHERE id IN (${Prisma.join(manifest.map((row) => row.shopId))})
      ORDER BY id ASC
      FOR UPDATE
    `);
    for (const row of manifest) {
      const current = await transaction.shopServiceLocation.findUnique({
        where: { shopId: row.shopId },
        select: {
          id: true,
          countryCode: true,
          admin1RegionId: true,
          admin2RegionId: true,
          datasetVersion: true,
          verifiedAt: true,
          verifiedById: true,
          deletedAt: true
        }
      });
      if (!appliedSnapshotMatches(current, row.applied)) {
        throw new Error(`restore refused service-location drift for shop ${row.shopId}`);
      }
      if (!row.before) {
        await transaction.shopServiceLocation.update({
          where: { shopId: row.shopId },
          data: { deletedAt: new Date() }
        });
      } else {
        await transaction.shopServiceLocation.update({
          where: { shopId: row.shopId },
          data: {
            countryCode: row.before.countryCode,
            admin1RegionId: row.before.admin1RegionId,
            admin2RegionId: row.before.admin2RegionId,
            datasetVersion: row.before.datasetVersion,
            verifiedAt: new Date(row.before.verifiedAt),
            verifiedById: row.before.verifiedById,
            deletedAt: row.before.deletedAt ? new Date(row.before.deletedAt) : null
          }
        });
      }
    }
    const audit = await transaction.auditLog.create({
      data: {
        actorId: restoredById,
        action: RESTORE_ACTION,
        targetType: AUDIT_TARGET,
        metadata: { restoreRunId: safeRunId, shopIds: manifest.map((row) => row.shopId) }
      }
    });
    return { restoreRunId: safeRunId, writeCount: manifest.length, auditId: audit.id };
  });
};

const writeJson = (value: unknown): void => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  if (!existsSync(envFile)) throw new Error(`environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
  const [{ prisma, disconnectPrisma }, admin2, simulation] = await Promise.all([
    import("../src/prisma/client"),
    import("../src/simulation/lifedance-admin2-provisioning"),
    import("../src/simulation/three-month-simulation-plan")
  ]);
  admin2.assertLocalAdmin2ProvisioningTarget(process.env);
  const targets: LifeDanceShopServiceLocationRepairTarget[] = [
    {
      shopName: simulation.LIFEDANCE_SHOP_NAME,
      ownerEmail: simulation.LIFEDANCE_ADMIN_EMAIL,
      serviceLocation: { countryCode: "JP", admin1Code: "13", admin2Code: "13113" }
    },
    {
      shopName: admin2.LIFEDANCE_ADMIN2_PLAN.shopName,
      ownerEmail: admin2.LIFEDANCE_ADMIN2_PLAN.email,
      serviceLocation: admin2.LIFEDANCE_ADMIN2_PLAN.serviceLocation
    }
  ];
  const args = parseLifeDanceShopServiceLocationRepairArguments(process.argv.slice(2));
  try {
    const admin = await prisma.user.findUnique({
      where: { email: simulation.LIFEDANCE_ADMIN_EMAIL },
      select: { id: true, isActive: true, deletedAt: true }
    });
    if (!admin?.isActive || admin.deletedAt) {
      throw new Error("active LifeDance administrator was not found");
    }
    if (args.mode === "restore") {
      writeJson(await restoreLifeDanceShopServiceLocationRepair(prisma, args.restoreRunId, admin.id));
      return;
    }
    const plan = await buildLifeDanceShopServiceLocationRepairPlan(
      prisma as unknown as ShopLookupClient,
      targets
    );
    writeJson({ mode: "preview", ...plan });
    if (args.mode === "preview") return;
    if (args.confirmCount !== plan.repairCount) {
      throw new Error(`--confirm-count=${plan.repairCount} is required`);
    }
    writeJson(await applyLifeDanceShopServiceLocationRepair(prisma, targets, plan, admin.id));
  } finally {
    await disconnectPrisma();
  }
};

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
