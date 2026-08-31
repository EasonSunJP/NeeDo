import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";

export type PlatformMembershipTierCode = "free" | "silver" | "gold" | "black_diamond";

export type LegacyMembershipClassification =
  | { status: "known"; tierCode: PlatformMembershipTierCode }
  | { status: "unknown"; value: string };

export interface LegacyMembershipPreflightRow {
  publicUserId: string;
  membershipLevel: string;
}

export interface LegacyMembershipPreflightReport {
  ready: boolean;
  scannedCount: number;
  unknownValues: Array<{ publicUserId: string; value: string }>;
}

const LEGACY_MEMBERSHIP_ALIASES: Readonly<Record<string, PlatformMembershipTierCode>> = {
  standard: "free",
  free: "free",
  silver: "silver",
  gold: "gold",
  black: "black_diamond",
  "黑卡": "black_diamond",
  "黑钻": "black_diamond"
};

const normalizeLegacyMembership = (value: string): string =>
  value.normalize("NFKC").trim().toLocaleLowerCase("en-US");

export const classifyLegacyMembership = (value: string): LegacyMembershipClassification => {
  const normalized = normalizeLegacyMembership(value);
  const tierCode = LEGACY_MEMBERSHIP_ALIASES[normalized];
  return tierCode
    ? { status: "known", tierCode }
    : { status: "unknown", value: normalized };
};

export const buildLegacyMembershipPreflightReport = (
  rows: readonly LegacyMembershipPreflightRow[]
): LegacyMembershipPreflightReport => {
  const unknownValues = rows.flatMap((row) => {
    const classification = classifyLegacyMembership(row.membershipLevel);
    return classification.status === "unknown"
      ? [{ publicUserId: row.publicUserId, value: classification.value }]
      : [];
  });

  return {
    ready: unknownValues.length === 0,
    scannedCount: rows.length,
    unknownValues
  };
};

const loadScriptEnvironment = (): void => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  if (existsSync(envFile)) loadDotenv({ path: envFile });
};

const main = async (): Promise<void> => {
  loadScriptEnvironment();
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");

  try {
    const profiles = await prisma.customerProfile.findMany({
      where: {
        deletedAt: null,
        membershipLevel: { not: "" }
      },
      select: {
        membershipLevel: true,
        user: { select: { needoId: true } }
      },
      orderBy: { id: "asc" }
    });

    const report = buildLegacyMembershipPreflightReport(
      profiles.map((profile) => ({
        publicUserId: profile.user.needoId,
        membershipLevel: profile.membershipLevel
      }))
    );

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.ready) process.exitCode = 1;
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
